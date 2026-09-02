// GET /api/master/ekspor — SELURUH data yang dimasukkan di aplikasi sebagai
// satu berkas TXT (permintaan 2 Sep 2026) — basis data untuk AI.
//
// Isi: database anggota (TANPA foto & TANPA kata sandi/hash/token), akun
// sosmed komentar (QC), akun TV Rakyat pribadi, semua laporan link video
// (KPI) + yang masih menunggu ACC, video TVR Saya, video TV Rakyat
// Official (antrean), arsip postingan akun resmi, pengumuman, rencana
// kerja, tugas link, acara, tim, absensi (tanpa koordinat/foto), sosmed
// terblokir. Tabel turunan mesin (rekap, komentar scraping, notifikasi,
// koin, log) SENGAJA tidak ikut — bukan data yang "dimasukkan".
//
// Akses: master & super_admin (Ketua Umum). Baca per 1000 baris (batas
// PostgREST), maksimal 20.000 baris per tabel.
import { supabase } from "@/lib/supabase";
import { userDariToken } from "@/lib/sesi";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PENGELOLA = new Set(["master", "super_admin"]);
const MAKS_BARIS = 20_000;
const LANGKAH = 1000;

type Baris = Record<string, unknown>;
type Halaman = { data: unknown; error: { message: string } | null };

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

/** Baca satu tabel utuh lewat pembangun kueri per halaman (range). */
async function ambilSemua(
  nama: string,
  kueri: (dari: number, sampai: number) => PromiseLike<Halaman>,
): Promise<Baris[]> {
  const semua: Baris[] = [];
  for (let dari = 0; dari < MAKS_BARIS; dari += LANGKAH) {
    const { data, error } = await kueri(dari, dari + LANGKAH - 1);
    if (error) {
      console.warn(`[ekspor] ${nama}:`, error.message);
      break;
    }
    const b = (data ?? []) as Baris[];
    semua.push(...b);
    if (b.length < LANGKAH) break;
  }
  return semua;
}

/** Nilai apa pun → teks satu baris ("-" bila kosong). */
function s(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "boolean") return v ? "ya" : "tidak";
  if (Array.isArray(v)) return v.length ? v.map((x) => String(x)).join(", ") : "-";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v).replace(/\s+/g, " ").trim() || "-";
}

/** ISO/timestamp → "YYYY-MM-DD HH:mm WIB". */
function wib(v: unknown): string {
  if (!v) return "-";
  const t = Date.parse(String(v));
  if (!Number.isFinite(t)) return s(v);
  const d = new Date(t + 7 * 3600_000);
  const dua = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${dua(d.getUTCMonth() + 1)}-${dua(d.getUTCDate())} ${dua(d.getUTCHours())}:${dua(d.getUTCMinutes())} WIB`;
}

function seksi(judul: string, baris: string[]): string {
  return `\n\n===== ${judul} (${baris.length}) =====\n${baris.length ? baris.join("\n") : "(kosong)"}`;
}

export async function GET(request: Request) {
  try {
    const user = await userDariToken(tokenDari(request));
    if (!user) return Response.json({ error: "Sesi tidak berlaku" }, { status: 401 });
    if (!PENGELOLA.has(user.role)) {
      return Response.json({ error: "Hanya master / Ketua Umum yang boleh mengekspor." }, { status: 403 });
    }
    const db = supabase();

    const [
      anggota,
      akunQc,
      akunTvr,
      laporan,
      pending,
      tvrku,
      antrian,
      feed,
      pengumuman,
      kerja,
      tugas,
      acara,
      tim,
      absensi,
      banned,
    ] = await Promise.all([
      ambilSemua("app_user", (a, b) =>
        db
          .from("app_user")
          .select(
            "id, nama, nama_panggilan, username, email, nomor_wa, wa_terverifikasi, role, jabatan, bidang_jabatan, divisi, sub_divisi, posisi_divisi, status, aktif, tanggal_lahir, kpi_video, created_at, last_login_at",
          )
          .order("id")
          .range(a, b),
      ),
      ambilSemua("akun_sosmed_user", (a, b) =>
        db.from("akun_sosmed_user").select("user_id, platform, username, aktif, catatan, dibuat_pada").order("id").range(a, b),
      ),
      ambilSemua("akun_tvr_user", (a, b) =>
        db.from("akun_tvr_user").select("user_id, platform, username, aktif, terhubung, dibuat_pada").order("id").range(a, b),
      ),
      ambilSemua("laporan_video", (a, b) =>
        db
          .from("laporan_video")
          .select("id, user_id, platform, url_video, keyword, tanggal_wib, sumber, dibuat_pada")
          .order("id")
          .range(a, b),
      ),
      ambilSemua("laporan_video_pending", (a, b) =>
        db
          .from("laporan_video_pending")
          .select("id, user_id, platform, url_video, keyword, tanggal_wib, status, catatan, diputus_oleh, dibuat_pada")
          .order("id")
          .range(a, b),
      ),
      ambilSemua("tvrku_post", (a, b) =>
        db
          .from("tvrku_post")
          .select("id, user_id, judul, caption, platforms, jadwal, kpi_tercatat, dibuat_pada")
          .order("id")
          .range(a, b),
      ),
      ambilSemua("video_antrian", (a, b) =>
        db
          .from("video_antrian")
          .select(
            "id, kode, judul, link, jenis, status, link_instagram, platform_terunggah, jam_tanggal, sumber_akun, judul_overlay, highlight, caption_asli, persetujuan, diupload_oleh, diunggah_pada",
          )
          .order("id")
          .range(a, b),
      ),
      ambilSemua("feed_konten", (a, b) =>
        db
          .from("feed_konten")
          .select("platform, akun_username, akun_nama, url_postingan, caption, jumlah_like, jumlah_komentar, waktu_posting")
          .order("id")
          .range(a, b),
      ),
      ambilSemua("pengumuman", (a, b) =>
        db
          .from("pengumuman")
          .select("id, pengirim_nama, judul, isi, cakupan, divisi_target, jabatan_target, jumlah_penerima, dibuat_pada")
          .order("id")
          .range(a, b),
      ),
      ambilSemua("kerja_item", (a, b) =>
        db
          .from("kerja_item")
          .select("id, user_id, tanggal_wib, deskripsi, jenis, kategori, status, catatan_realisasi, tenggat, ditugaskan_oleh, dibuat_pada")
          .order("id")
          .range(a, b),
      ),
      ambilSemua("tugas_link", (a, b) =>
        db
          .from("tugas_link")
          .select("id, judul, url, catatan, untuk_user_id, dibuat_oleh_id, status, video_kode, dibuat_pada, selesai_pada")
          .order("id")
          .range(a, b),
      ),
      ambilSemua("acara_penting", (a, b) =>
        db.from("acara_penting").select("id, judul, keterangan, tanggal, dibuat_oleh, dibuat_pada").order("id").range(a, b),
      ),
      ambilSemua("tim_anggota", (a, b) =>
        db.from("tim_anggota").select("id, atasan_id, anggota_id, status, disetujui_pada, dibuat_pada").order("id").range(a, b),
      ),
      ambilSemua("absensi", (a, b) =>
        db.from("absensi").select("id, user_id, jenis, waktu, tanggal_wib, alamat").order("id").range(a, b),
      ),
      ambilSemua("tvr_banned", (a, b) =>
        db
          .from("tvr_banned")
          .select("id, user_id, platform, keterangan, status, catatan_putusan, diputus_oleh, dibuat_pada, dicabut_pada")
          .order("id")
          .range(a, b),
      ),
    ]);

    const nama = new Map(anggota.map((a) => [Number(a.id), String(a.nama ?? "")]));
    const n = (id: unknown) => (id == null ? "-" : (nama.get(Number(id)) ?? `#${s(id)}`));

    const dibuat = new Date();
    let teks = [
      "PRI SUPERAPP — EKSPOR SELURUH DATA APLIKASI",
      `Dibuat: ${wib(dibuat.toISOString())} oleh ${user.nama}`,
      "Catatan: tanpa foto, tanpa kata sandi/hash/token. Semua waktu dalam WIB.",
      `Ringkasan: ${anggota.length} anggota · ${akunQc.length} akun komentar · ${akunTvr.length} akun TV Rakyat · ${laporan.length} laporan video · ${pending.length} laporan menunggu ACC · ${tvrku.length} video TVR Saya · ${antrian.length} video Official · ${feed.length} postingan resmi · ${pengumuman.length} pengumuman · ${kerja.length} rencana kerja · ${tugas.length} tugas · ${acara.length} acara · ${tim.length} relasi tim · ${absensi.length} absensi · ${banned.length} sosmed terblokir`,
    ].join("\n");

    teks += seksi(
      "DATABASE ANGGOTA",
      anggota.map(
        (a) =>
          `[${s(a.id)}] ${s(a.nama)} | panggilan: ${s(a.nama_panggilan)} | username: ${s(a.username)} | email: ${s(a.email)} | WA: ${s(a.nomor_wa)} (${a.wa_terverifikasi ? "terverifikasi" : "belum verifikasi"}) | peran: ${s(a.role)} | jabatan: ${s(a.jabatan)} | bidang: ${s(a.bidang_jabatan)} | divisi: ${s(a.divisi)}${a.sub_divisi ? ` / ${s(a.sub_divisi)}` : ""} (${s(a.posisi_divisi)}) | status: ${s(a.status)} | aktif: ${s(a.aktif)} | lahir: ${s(a.tanggal_lahir)} | target KPI video/platform: ${s(a.kpi_video)} | bergabung: ${wib(a.created_at)} | login terakhir: ${wib(a.last_login_at)}`,
      ),
    );
    teks += seksi(
      "AKUN SOSMED UNTUK KOMENTAR (QC)",
      akunQc.map((r) => `${n(r.user_id)} | ${s(r.platform)} | @${s(r.username)} | aktif: ${s(r.aktif)} | catatan: ${s(r.catatan)} | ${wib(r.dibuat_pada)}`),
    );
    teks += seksi(
      "AKUN TV RAKYAT PRIBADI",
      akunTvr.map((r) => `${n(r.user_id)} | ${s(r.platform)} | ${s(r.username)} | terhubung: ${s(r.terhubung)} | aktif: ${s(r.aktif)} | ${wib(r.dibuat_pada)}`),
    );
    teks += seksi(
      "LAPORAN VIDEO (LINK, SUDAH DIHITUNG KPI)",
      laporan.map((r) => `[${s(r.id)}] ${n(r.user_id)} | ${s(r.platform)} | ${s(r.url_video)} | keyword: ${s(r.keyword)} | tanggal: ${s(r.tanggal_wib)} | sumber: ${s(r.sumber)} | dicatat: ${wib(r.dibuat_pada)}`),
    );
    teks += seksi(
      "LAPORAN VIDEO MANUAL (MENUNGGU / DIPUTUS HR)",
      pending.map((r) => `[${s(r.id)}] ${n(r.user_id)} | ${s(r.platform)} | ${s(r.url_video)} | keyword: ${s(r.keyword)} | tanggal: ${s(r.tanggal_wib)} | status: ${s(r.status)} | catatan: ${s(r.catatan)} | diputus oleh: ${s(r.diputus_oleh)} | ${wib(r.dibuat_pada)}`),
    );
    teks += seksi(
      "VIDEO TVR SAYA (UNGGAHAN LEWAT APLIKASI)",
      tvrku.map((r) => `[${s(r.id)}] ${n(r.user_id)} | judul: ${s(r.judul)} | caption: ${s(r.caption)} | sosmed: ${s(r.platforms)} | jadwal: ${wib(r.jadwal)} | KPI tercatat: ${s(r.kpi_tercatat)} | ${wib(r.dibuat_pada)}`),
    );
    teks += seksi(
      "VIDEO TV RAKYAT OFFICIAL (ANTREAN PRODUKSI)",
      antrian.map((r) => `[${s(r.kode)}] judul: ${s(r.judul)} | sumber: ${s(r.link)} | jenis: ${s(r.jenis)} | status: ${s(r.status)} | persetujuan: ${s(r.persetujuan)} | terunggah: ${s(r.platform_terunggah)} | link IG: ${s(r.link_instagram)} | jam: ${s(r.jam_tanggal)} | akun sumber: ${s(r.sumber_akun)} | judul overlay: ${s(r.judul_overlay)} | highlight: ${s(r.highlight)} | caption: ${s(r.caption_asli)} | diupload oleh: ${s(r.diupload_oleh)} | diunggah: ${wib(r.diunggah_pada)}`),
    );
    teks += seksi(
      "ARSIP POSTINGAN AKUN RESMI",
      feed.map((r) => `${s(r.platform)} | ${s(r.akun_username)} (${s(r.akun_nama)}) | ${s(r.url_postingan)} | ${wib(r.waktu_posting)} | like: ${s(r.jumlah_like)} | komentar: ${s(r.jumlah_komentar)} | caption: ${s(r.caption)}`),
    );
    teks += seksi(
      "PENGUMUMAN",
      pengumuman.map((r) => `[${s(r.id)}] ${wib(r.dibuat_pada)} | dari: ${s(r.pengirim_nama)} | cakupan: ${s(r.cakupan)}${r.divisi_target ? ` (${s(r.divisi_target)})` : ""}${r.jabatan_target ? ` (${s(r.jabatan_target)})` : ""} | penerima: ${s(r.jumlah_penerima)} | ${s(r.judul)}: ${s(r.isi)}`),
    );
    teks += seksi(
      "RENCANA & LAPORAN KERJA",
      kerja.map((r) => `[${s(r.id)}] ${n(r.user_id)} | ${s(r.tanggal_wib)} | ${s(r.jenis)}/${s(r.kategori)} | ${s(r.deskripsi)} | status: ${s(r.status)} | realisasi: ${s(r.catatan_realisasi)} | tenggat: ${s(r.tenggat)} | ditugaskan oleh: ${n(r.ditugaskan_oleh)}`),
    );
    teks += seksi(
      "TUGAS LINK VIDEO",
      tugas.map((r) => `[${s(r.id)}] untuk: ${n(r.untuk_user_id)} | dari: ${n(r.dibuat_oleh_id)} | ${s(r.judul)} | ${s(r.url)} | catatan: ${s(r.catatan)} | status: ${s(r.status)} | kode video: ${s(r.video_kode)} | ${wib(r.dibuat_pada)} | selesai: ${wib(r.selesai_pada)}`),
    );
    teks += seksi(
      "ACARA PENTING",
      acara.map((r) => `[${s(r.id)}] ${s(r.tanggal)} | ${s(r.judul)} | ${s(r.keterangan)} | dibuat oleh: ${n(r.dibuat_oleh)}`),
    );
    teks += seksi(
      "STRUKTUR TIM (ATASAN → ANGGOTA)",
      tim.map((r) => `${n(r.atasan_id)} → ${n(r.anggota_id)} | status: ${s(r.status)} | disetujui: ${wib(r.disetujui_pada)}`),
    );
    teks += seksi(
      "ABSENSI",
      absensi.map((r) => `${s(r.tanggal_wib)} | ${n(r.user_id)} | ${s(r.jenis)} | ${wib(r.waktu)} | ${s(r.alamat)}`),
    );
    teks += seksi(
      "SOSMED TERBLOKIR (PERMOHONAN KPI)",
      banned.map((r) => `[${s(r.id)}] ${n(r.user_id)} | ${s(r.platform)} | status: ${s(r.status)} | keterangan: ${s(r.keterangan)} | putusan: ${s(r.catatan_putusan)} (${s(r.diputus_oleh)}) | diajukan: ${wib(r.dibuat_pada)} | dicabut: ${wib(r.dicabut_pada)}`),
    );
    teks += "\n\n===== SELESAI =====\n";

    const tanggal = wib(dibuat.toISOString()).slice(0, 10);
    const namaBerkas = `pri-superapp-data-${tanggal}.txt`;
    return new Response(teks, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${namaBerkas}"`,
        "X-Nama-Berkas": namaBerkas,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[ekspor]", e);
    return Response.json({ error: "Gagal menyusun berkas ekspor." }, { status: 500 });
  }
}

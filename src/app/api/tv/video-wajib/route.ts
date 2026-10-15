// Video wajib — perintah video untuk seluruh anggota (12 Sep 2026).
//
// Pihak berwenang menaruh satu perintah beserta bahannya; perintah itu
// muncul PALING ATAS di modul TV Rakyat setiap anggota dan jadi acuan
// saat mereka melaporkan videonya.
//
// 13 Sep 2026: fitur "Request Video ke Anggota" dihapus, gantinya bahan
// video DIUNGGAH DI SINI (berkas ke R2 / bucket "tvrku") dan ada kolom
// "sumber video". Kreator memakai bahan yang diunggah tim TV Rakyat
// Official di SuperApp — satu tempat untuk perintah dan bahannya.
//
// GET    → perintah AKTIF (semua anggota). Yang berwenang melihat
//          semuanya termasuk yang sudah dimatikan, plus flag boleh:true.
//          berkas_url dibuat bertanda tangan SAAT DIBACA (tidak disimpan).
// POST   { aksi:"siapkan", nama, ukuran } → URL unggah bertanda tangan
// POST   { judul, keterangan, link_doksli, sumber_video, kategori,
//          batas_waktu, berkas?{cara,key,nama,ukuran},
//          wajib_posting?, pola?('harian'|'sekali'), batas_jam?('HH:MM'), pengingat? }
//
// 15 Okt 2026 — perintah BERNOMOR: kategori yang dipilih Pimred terbawa ke
// unggahan, laporan, dan insight lewat nomor perintah (sql/76). "Wajib
// posting" berlaku otomatis untuk semua akun tersambung & semua platform.
// GET menambahkan `saya` (kemajuan pemanggil) dan, untuk yang berwenang,
// `ringkas` (kepatuhan hari ini).
// PATCH  { id, aktif }
// DELETE { id }  — berkasnya ikut dihapus dari penyimpanan
//
// Siapa yang berwenang: seluruh anggota TV Rakyat (wewenangTv), Direktur
// Eksekutif, Pimpinan Redaksi, dan jabatan TV Rakyat Nasional.
import { randomBytes } from "node:crypto";
import { after } from "next/server";
import { supabase } from "@/lib/supabase";
import { bungkus, tabelBelumAda } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { bolehKelolaTvr } from "@/lib/tv-tim";
import { maksUploadMb } from "@/lib/pengaturan-tv";
import { hapusVideoR2, presignR2, r2Siap } from "@/lib/r2";
import { kirimKabar } from "@/lib/notifikasi";
import {
  bersihkanBatasJam,
  bersihkanPola,
  PENGATURAN_WAJIB_BAWAAN,
  tanggalWibWajib,
  type KemajuanSaya,
  type PolaWajib,
  type RingkasKepatuhan,
} from "@/lib/video-wajib-perintah";
import { bentukPerintah, kemajuanPerintahSaya, kolomBelumAda, ringkasHariIni, roster } from "@/lib/video-wajib-pantau";
import { pastikanKategoriBolehDipakai } from "@/lib/kategori-status";

export const dynamic = "force-dynamic";

const BUCKET = "tvrku";
/** URL unduh berlaku sehari — panel memuat ulang tiap dibuka, jadi cukup. */
const UMUR_URL_DETIK = 24 * 3600;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasuk(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku."), { status: 401 });
  return user;
}

/** Berwenang memerintahkan video = berwenang mengatur TV Rakyat (satu aturan). */
const bolehPerintah = bolehKelolaTvr;

async function pastikanBerwenang(request: Request) {
  const user = await pastikanMasuk(request);
  if (!(await bolehPerintah(user))) {
    throw Object.assign(
      new Error("Hanya tim TV Rakyat & pimpinan yang boleh menetapkan video wajib."),
      { status: 403 },
    );
  }
  return user;
}

function teks(v: unknown, maks: number): string {
  return String(v ?? "").trim().slice(0, maks);
}

/** Link bahan mentah: harus alamat web yang sah, atau kosong. */
function bersihkanLink(v: unknown): string {
  const s = teks(v, 600);
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw Object.assign(new Error("Link bahan harus diawali http:// atau https://"), { status: 400 });
    }
    return u.toString();
  } catch (e) {
    if (e instanceof Error && "status" in e) throw e;
    throw Object.assign(new Error("Link bahan tidak dikenali sebagai alamat web."), { status: 400 });
  }
}

/** Tanggal 'YYYY-MM-DD' atau null. */
function bersihkanTanggal(v: unknown): string | null {
  const s = teks(v, 10);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw Object.assign(new Error("Batas waktu harus berbentuk tanggal."), { status: 400 });
  }
  return s;
}

type CaraBerkas = "r2" | "supabase" | "";

/**
 * Berkas yang dilaporkan klien setelah unggah. Kuncinya HARUS berada di
 * awalan video-wajib/ — klien tidak boleh menunjuk berkas orang lain
 * (mis. video TVR Saya anggota) lalu menghapusnya lewat DELETE perintah.
 */
function bersihkanBerkas(v: unknown): { cara: CaraBerkas; key: string; nama: string; ukuran: number } {
  const kosong = { cara: "" as CaraBerkas, key: "", nama: "", ukuran: 0 };
  if (!v || typeof v !== "object") return kosong;
  const b = v as Record<string, unknown>;
  const cara = b.cara === "r2" || b.cara === "supabase" ? b.cara : "";
  const key = teks(b.key, 300);
  if (!cara || !key) return kosong;
  if (!key.startsWith("video-wajib/") || key.includes("..")) {
    throw Object.assign(new Error("Kunci berkas tidak sah."), { status: 400 });
  }
  const ukuran = Number(b.ukuran ?? 0);
  return {
    cara,
    key,
    nama: teks(b.nama, 160),
    ukuran: Number.isFinite(ukuran) && ukuran > 0 ? Math.floor(ukuran) : 0,
  };
}

const KOLOM_52 =
  "id, judul, keterangan, link_doksli, sumber_video, kategori, batas_waktu, aktif, dibuat_pada, dibuat_oleh_id, berkas_cara, berkas_key, berkas_nama, berkas_ukuran";
/** Dengan pengaturan wajib posting (sql/76). */
const KOLOM = `${KOLOM_52}, wajib_posting, pola, batas_jam, pengingat`;
/** Bentuk lama, dipakai bila sql/52 belum dijalankan. */
const KOLOM_LAMA = "id, judul, keterangan, link_doksli, kategori, batas_waktu, aktif, dibuat_pada, dibuat_oleh_id";

type Baris = {
  id: number | string;
  judul: string;
  keterangan: string | null;
  link_doksli: string | null;
  sumber_video?: string | null;
  kategori: string | null;
  batas_waktu: string | null;
  aktif: boolean;
  dibuat_pada: string;
  dibuat_oleh_id: number | string | null;
  berkas_cara?: string | null;
  berkas_key?: string | null;
  berkas_nama?: string | null;
  berkas_ukuran?: number | string | null;
  wajib_posting?: boolean | null;
  pola?: string | null;
  batas_jam?: string | null;
  pengingat?: boolean | null;
};

type Tambahan = { saya?: KemajuanSaya; ringkas?: RingkasKepatuhan };

function bentuk(b: Baris, berkasUrl = "", tambahan: Tambahan = {}) {
  const wajib = bentukPerintah({
    id: b.id,
    judul: b.judul,
    kategori: b.kategori,
    aktif: b.aktif,
    batas_waktu: b.batas_waktu,
    dibuat_pada: b.dibuat_pada,
    wajib_posting: b.wajib_posting,
    pola: b.pola,
    batas_jam: b.batas_jam,
    pengingat: b.pengingat,
  });
  return {
    wajib_posting: wajib.wajib_posting,
    pola: wajib.pola,
    batas_jam: wajib.batas_jam,
    pengingat: wajib.pengingat,
    saya: tambahan.saya ?? null,
    ringkas: tambahan.ringkas ?? null,
    id: String(b.id),
    judul: b.judul,
    keterangan: b.keterangan ?? "",
    link_doksli: b.link_doksli ?? "",
    sumber_video: b.sumber_video ?? "",
    kategori: b.kategori ?? "",
    batas_waktu: b.batas_waktu ?? "",
    aktif: b.aktif === true,
    dibuat_pada: b.dibuat_pada,
    berkas_url: berkasUrl,
    berkas_nama: b.berkas_nama ?? "",
    berkas_ukuran: Number(b.berkas_ukuran ?? 0) || 0,
  };
}

/**
 * URL unduh untuk setiap baris yang punya berkas. R2 ditandatangani
 * satu per satu (murni perhitungan, tanpa panggilan jaringan); bucket
 * Supabase sekaligus dalam satu permintaan.
 */
async function urlBerkas(baris: Baris[]): Promise<Map<string, string>> {
  const hasil = new Map<string, string>();
  const dariBucket: Baris[] = [];
  for (const b of baris) {
    const key = String(b.berkas_key ?? "");
    if (!key) continue;
    if (b.berkas_cara === "r2") {
      if (r2Siap()) hasil.set(String(b.id), presignR2("GET", key, UMUR_URL_DETIK));
    } else if (b.berkas_cara === "supabase") {
      dariBucket.push(b);
    }
  }
  if (dariBucket.length > 0) {
    const { data } = await supabase()
      .storage.from(BUCKET)
      .createSignedUrls(
        dariBucket.map((b) => String(b.berkas_key)),
        UMUR_URL_DETIK,
      );
    for (const [i, b] of dariBucket.entries()) {
      const u = data?.[i]?.signedUrl;
      if (u) hasil.set(String(b.id), u);
    }
  }
  return hasil;
}

async function ambilBaris(hanyaAktif: boolean): Promise<Baris[]> {
  const db = supabase();
  const baca = (kolom: string) => {
    let q = db.from("tvr_video_wajib").select(kolom).order("dibuat_pada", { ascending: false }).limit(50);
    if (hanyaAktif) q = q.eq("aktif", true);
    return q;
  };
  // Tiga generasi kolom: sql/76 (wajib posting) → sql/52 (berkas) → sql/46.
  // Migrasi yang belum dijalankan tidak boleh menjatuhkan seluruh modul TV.
  for (const kolom of [KOLOM, KOLOM_52, KOLOM_LAMA]) {
    const { data, error } = await baca(kolom);
    if (!error) return (data ?? []) as unknown as Baris[];
    console.error("[tv/video-wajib] select:", error.code, error.message);
    if (tabelBelumAda(error)) return [];
    if (!kolomBelumAda(error)) throw new Error("Gagal memuat video wajib.");
  }
  throw new Error("Gagal memuat video wajib.");
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const boleh = await bolehPerintah(user);
    // Anggota biasa hanya melihat yang aktif — perintah yang sudah
    // dimatikan bukan lagi kewajibannya.
    const baris = await ambilBaris(!boleh);
    const url = await urlBerkas(baris);

    // Kemajuan pemanggil atas perintah wajib posting yang aktif, dan (untuk
    // yang berwenang) ringkasan kepatuhan hari ini. Gagal = tanpa tambahan,
    // panelnya tetap tampil.
    const hariIni = tanggalWibWajib(Date.now());
    const wajibAktif = baris
      .filter((b) => b.aktif === true && b.wajib_posting === true)
      // Perintah yang sudah lewat batas waktunya tidak lagi punya kewajiban hari ini.
      .filter((b) => !b.batas_waktu || hariIni <= String(b.batas_waktu))
      .map((b) =>
        bentukPerintah({
          id: b.id,
          judul: b.judul,
          kategori: b.kategori,
          aktif: b.aktif,
          batas_waktu: b.batas_waktu,
          dibuat_pada: b.dibuat_pada,
          wajib_posting: b.wajib_posting,
          pola: b.pola,
          batas_jam: b.batas_jam,
          pengingat: b.pengingat,
        }),
      );
    const saya = await kemajuanPerintahSaya(Number(user.id), wajibAktif).catch((e) => {
      console.error("[tv/video-wajib] kemajuan saya:", e);
      return new Map<string, KemajuanSaya>();
    });
    const ringkas = new Map<string, RingkasKepatuhan>();
    if (boleh) {
      await Promise.all(
        wajibAktif.map(async (p) => {
          try {
            ringkas.set(p.id, await ringkasHariIni(p));
          } catch (e) {
            console.error("[tv/video-wajib] ringkas:", e);
          }
        }),
      );
    }
    return {
      data: baris.map((b) =>
        bentuk(b, url.get(String(b.id)) ?? "", {
          saya: saya.get(String(b.id)),
          ringkas: ringkas.get(String(b.id)),
        }),
      ),
      boleh,
    };
  });
}

/** Langkah 1 unggah bahan: URL PUT bertanda tangan (R2 utama, bucket cadangan). */
async function siapkanUnggah(uid: number, body: Record<string, unknown>) {
  const maksMb = await maksUploadMb();
  const ukuran = Number(body.ukuran ?? 0);
  if (!Number.isFinite(ukuran) || ukuran <= 0) {
    throw Object.assign(new Error("Ukuran berkas tidak dikenal."), { status: 400 });
  }
  if (ukuran > maksMb * 1024 * 1024) {
    throw Object.assign(
      new Error(`Video ${Math.round(ukuran / 1048576)} MB terlalu besar. Maksimal ${maksMb} MB — kecilkan dulu.`),
      { status: 400 },
    );
  }
  const ext = /\.(mp4|mov|m4v|webm)$/i.exec(String(body.nama ?? ""))?.[1]?.toLowerCase() ?? "mp4";
  // Awalan sendiri: penyapu media TVR Saya bekerja per baris tvrku_post,
  // tidak menyentuh awalan ini — bahan video wajib harus tetap ada
  // selama perintahnya ada.
  const key = `video-wajib/${uid}/${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
  if (r2Siap()) {
    return { sukses: true, cara: "r2" as const, key, url: presignR2("PUT", key, 15 * 60) };
  }
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUploadUrl(key);
  if (error || !data) {
    console.error("[video-wajib] siapkan:", error?.message);
    throw new Error("Gagal menyiapkan unggahan. Coba lagi.");
  }
  return { sukses: true, cara: "supabase" as const, key, url: data.signedUrl };
}

async function hapusBerkas(b: Pick<Baris, "berkas_cara" | "berkas_key">) {
  const key = String(b.berkas_key ?? "");
  if (!key) return;
  try {
    if (b.berkas_cara === "r2") await hapusVideoR2(key);
    else if (b.berkas_cara === "supabase") await supabase().storage.from(BUCKET).remove([key]);
  } catch (e) {
    // Berkas yatim lebih murah daripada perintah yang gagal dihapus.
    console.error("[video-wajib] hapus berkas:", e);
  }
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanBerwenang(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.aksi === "siapkan") return siapkanUnggah(Number(user.id), body);

    const judul = teks(body.judul, 200);
    if (judul.length < 3) {
      throw Object.assign(new Error("Judul perintah minimal 3 huruf."), { status: 400 });
    }
    const berkas = bersihkanBerkas(body.berkas);
    const kategori = teks(body.kategori, 120);
    const wajibPosting = body.wajib_posting === true;
    // Kategori itulah yang dibawa video sampai insight; wajib posting tanpa
    // kategori akan menghasilkan video tanpa kelompok.
    if (wajibPosting && !kategori) {
      throw Object.assign(new Error("Pilih kategori dulu: kategori itu yang dibawa videonya sampai insight."), { status: 400 });
    }
    if (wajibPosting) {
      // Kategori harus bisa dipakai anggota saat mengunggah (aktif, tidak SELESAI): perintah
      // wajib dengan kategori yang ditolak server akan membuat SEMUA anggota gagal memenuhinya.
      try {
        await pastikanKategoriBolehDipakai(kategori);
      } catch (e) {
        await hapusBerkas({ berkas_cara: berkas.cara, berkas_key: berkas.key });
        throw e;
      }
    }
    const isi: Record<string, unknown> = {
      judul,
      keterangan: teks(body.keterangan, 2000),
      link_doksli: bersihkanLink(body.link_doksli),
      sumber_video: teks(body.sumber_video, 200),
      kategori,
      batas_waktu: bersihkanTanggal(body.batas_waktu),
      dibuat_oleh_id: Number(user.id),
      berkas_cara: berkas.cara,
      berkas_key: berkas.key,
      berkas_nama: berkas.nama,
      berkas_ukuran: berkas.ukuran,
    };
    const pengaturan = {
      wajib_posting: wajibPosting,
      pola: bersihkanPola(body.pola) satisfies PolaWajib,
      batas_jam: bersihkanBatasJam(body.batas_jam ?? PENGATURAN_WAJIB_BAWAAN.batas_jam),
      pengingat: body.pengingat !== false,
    };
    const hapusBerkasYatim = () => hapusBerkas({ berkas_cara: berkas.cara, berkas_key: berkas.key });

    const db = supabase();
    let hasil = await db
      .from("tvr_video_wajib")
      .insert({ ...isi, ...pengaturan })
      .select(KOLOM)
      .single();
    if (kolomBelumAda(hasil.error)) {
      // Kolom wajib posting belum ada (sql/76). Perintah biasa tetap bisa
      // terbit; perintah WAJIB POSTING tidak boleh jadi perintah biasa diam-diam.
      if (wajibPosting) {
        await hapusBerkasYatim();
        throw Object.assign(
          new Error("Fitur wajib posting belum aktif di database: jalankan sql/76_video_wajib_perintah.sql dulu."),
          { status: 503, pesanAman: true },
        );
      }
      hasil = (await db.from("tvr_video_wajib").insert(isi).select(KOLOM_52).single()) as typeof hasil;
    }
    const { data, error } = hasil;
    if (kolomBelumAda(error)) {
      // Berkas sudah telanjur di penyimpanan; jangan tinggalkan yatim.
      await hapusBerkasYatim();
      throw Object.assign(
        new Error("Kolom bahan video belum ada di database: jalankan pri-sql 52_video_wajib_berkas.sql dulu."),
        { status: 503, pesanAman: true },
      );
    }
    if (tabelBelumAda(error)) {
      await hapusBerkasYatim();
      throw Object.assign(
        new Error(
          "Tabel video wajib belum ada di database. Jalankan sql/46_tvr_nasional.sql lalu sql/52_video_wajib_berkas.sql di SQL Editor Supabase.",
        ),
        { status: 503, pesanAman: true },
      );
    }
    if (error || !data) throw new Error("Gagal menyimpan video wajib.");
    const baris = data as unknown as Baris;
    const url = await urlBerkas([baris]);

    // Kabari semua akun yang wajib: perintah baru bernomor, berlaku otomatis.
    if (wajibPosting) {
      after(async () => {
        try {
          const penerima = (await roster()).map((a) => Number(a.user_id)).filter((n) => Number.isFinite(n) && n > 0);
          if (penerima.length === 0) return;
          await kirimKabar({
            judul: `🎬 Video Wajib: ${judul}`.slice(0, 120),
            isi: `Perintah baru${kategori ? ` kategori ${kategori}` : ""}. Wajib diposting di semua akun Anda sebelum ${pengaturan.batas_jam.replace(":", ".")} WIB. Buka TV Rakyat Saya untuk membuat videonya.`,
            kategori: "peringatan",
            jenis_peristiwa: "video_wajib_baru",
            target: "tvrku",
            untukUserIds: penerima,
          });
        } catch (e) {
          console.error("[video-wajib] kabar perintah baru:", e);
        }
      });
    }
    return bentuk(baris, url.get(String(baris.id)) ?? "");
  });
}

export async function PATCH(request: Request) {
  return bungkus(async () => {
    await pastikanBerwenang(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isFinite(id)) throw Object.assign(new Error("id tidak sah."), { status: 400 });
    const { error } = await supabase()
      .from("tvr_video_wajib")
      .update({ aktif: body.aktif === true })
      .eq("id", id);
    if (error) throw new Error("Gagal mengubah status.");
    return { ok: true };
  });
}

export async function DELETE(request: Request) {
  return bungkus(async () => {
    await pastikanBerwenang(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isFinite(id)) throw Object.assign(new Error("id tidak sah."), { status: 400 });
    const db = supabase();
    const { data: lama } = await db
      .from("tvr_video_wajib")
      .select("berkas_cara, berkas_key")
      .eq("id", id)
      .maybeSingle();
    const { error } = await db.from("tvr_video_wajib").delete().eq("id", id);
    if (error) throw new Error("Gagal menghapus.");
    if (lama) await hapusBerkas(lama as Pick<Baris, "berkas_cara" | "berkas_key">);
    return { ok: true };
  });
}

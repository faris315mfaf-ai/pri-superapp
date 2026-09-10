// ============================================================
// KPI OTOMATIS (31 Agu 2026, dirombak 6 Sep 2026) — KHUSUS SISI SERVER.
//
// Tujuan (permintaan user): "video yang diupload otomatis menambah KPI
// mereka, tidak perlu lapor-lapor video lagi."
//
// AKAR BUG lama ("link kadang tidak masuk padahal video terupload"):
// pencocokan memakai tebakan "postingan TERBARU setelah waktu unggah".
// Anggota PALUGODAM mengunggah banyak video berurutan (tiap 15-20 menit),
// dan YouTube/Facebook menerbitkan lebih lambat — jadi unggahan lama
// "mengambil" tautan unggahan baru, unggahan baru menabrak tautan dobel
// (23505) lalu DIANGGAP BERES tanpa tautan. Terbukti di data: ~33 dari 105
// unggahan per platform "ditandai tercatat" tapi tanpa baris laporan.
//
// CARA KERJA BARU (deterministik, tiga lapis):
//  1. SUMBER PASTI: upload-post menyimpan URL tiap postingan per request →
//     GET /uploadposts/post-analytics/{request_id} mengembalikan post_url
//     per platform. Itu yang dicatat (tanpa tebak-tebakan).
//  2. CADANGAN: bila sumber pasti belum tersedia (masih diproses / endpoint
//     gagal), cocokkan daftar media profil SATU-SATU secara kronologis:
//     tiap media dipasangkan ke unggahan TERAKHIR yang waktunya mendahului
//     media itu dan belum punya tautan; URL yang sudah tercatat dilewati.
//  3. PENYEMBUHAN: platform yang dulu "ditandai tercatat" tapi TIDAK punya
//     baris laporan_video terkait dibuka lagi supaya dicoba ulang.
//
// Penjaga kejujuran (tetap): hanya media yang terbit >= waktu unggah
// (minus toleransi) yang diakui; laporan_video UNIK per (user_id, url_video);
// semua tautan berasal dari profil upload-post milik anggota itu sendiri.
// ============================================================
import { supabase } from "@/lib/supabase";
import { analitikPostUp, postinganTerbaruUp, statusUnggahUp, uploadPostSiap, type PostinganUp } from "@/lib/upload-post";
import { kanonikTautan, kunciVideo } from "@/lib/tautan-video";
import { kirimKabar } from "@/lib/notifikasi";
import { LABEL_SOSMED, solusiGagal } from "@/lib/batas-caption";

/** Toleransi mundur saat mencocokkan waktu terbit (jam beda server). */
export const TOLERANSI_MENIT = 10;
/** Unggahan lebih tua dari ini tidak direkonsiliasi lagi (sudah final). */
export const BATAS_UMUR_JAM = 96;
/** Berapa media terbaru per platform yang dibaca untuk pencocokan cadangan. */
const BATAS_MEDIA = 25;
/** Maksimal request_id yang ditanyakan ke post-analytics per pemanggilan. */
const BATAS_TANYA_PASTI = 12;

export function tanggalWibDari(iso: string | null): string {
  const t = iso ? Date.parse(iso) : Date.now();
  return new Date((Number.isFinite(t) ? t : Date.now()) + 7 * 3600_000).toISOString().slice(0, 10);
}

export type PostTvrku = {
  id: number;
  platforms: string[];
  kpi_tercatat: string[];
  jadwal: string | null;
  dibuat_pada: string;
  request_id: string | null;
  /** Platform yang URL pastinya SUDAH ditanyakan ke post-analytics (disimpan di hasil.kpi_pasti). */
  kpi_pasti: string[];
  /** Platform yang oleh upload-post dinyatakan GAGAL terbit (hasil.kpi_gagal) — tidak ditanya lagi. */
  kpi_gagal: string[];
  /** Alasan gagal per platform dari upload-post (hasil.kpi_gagal_alasan). */
  kpi_gagal_alasan: Record<string, string>;
  judul: string;
  hasil: Record<string, unknown>;
};

/** Teks dinormalkan untuk mencocokkan judul unggahan dengan caption media. */
function normalTeks(t: string): string {
  return (t ?? "").toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();
}

/** Platform sebuah unggahan yang masih perlu dicek ke sumber pasti. */
export function belumPasti(p: Pick<PostTvrku, "platforms" | "kpi_pasti" | "kpi_gagal" | "jadwal" | "request_id">): string[] {
  if (!p.request_id) return [];
  if (p.jadwal && Date.parse(p.jadwal) > Date.now()) return [];
  const sudah = new Set([...p.kpi_pasti, ...p.kpi_gagal]);
  return p.platforms.filter((pf) => !sudah.has(pf));
}

/** Waktu acuan sebuah unggahan (post terjadwal dihitung dari jadwalnya) dikurangi toleransi. */
export function acuanMs(p: Pick<PostTvrku, "jadwal" | "dibuat_pada">): number {
  const dasar = p.jadwal ? Date.parse(String(p.jadwal)) : Date.parse(String(p.dibuat_pada));
  return (Number.isFinite(dasar) ? dasar : Date.now()) - TOLERANSI_MENIT * 60_000;
}

/**
 * Pencocokan cadangan SATU-SATU (murni, bisa diuji): media (urut lama→baru)
 * dipasangkan ke unggahan TERAKHIR yang acuannya <= waktu media dan belum
 * mendapat pasangan. Media yang URL-nya sudah tercatat dilewati; media yang
 * lebih tua dari semua unggahan pending diabaikan (bukan dari aplikasi).
 */
export function cocokkanMedia(
  pending: (Pick<PostTvrku, "id" | "jadwal" | "dibuat_pada"> & { judul?: string })[],
  media: PostinganUp[],
  /** Set URL/kunci yang sudah tercatat, ATAU predikat (url) => sudah? */
  sudah: Set<string> | ((url: string) => boolean),
): { post_id: number; url: string; waktu: string }[] {
  const sudahAda = typeof sudah === "function" ? sudah : (url: string) => sudah.has(url);
  const tandai = typeof sudah === "function" ? () => {} : (url: string) => sudah.add(url);
  const posts = pending
    .map((p) => ({ id: p.id, acuan: acuanMs(p), judul: normalTeks(p.judul ?? "").slice(0, 40) }))
    .sort((a, b) => a.acuan - b.acuan);
  const dipakai = new Set<number>();
  const dipakaiUrl = new Set<string>();
  const hasil: { post_id: number; url: string; waktu: string }[] = [];
  const daftar = media
    .filter((m) => m.permalink && m.waktu && Number.isFinite(Date.parse(m.waktu)))
    .sort((a, b) => Date.parse(a.waktu!) - Date.parse(b.waktu!));
  for (const m of daftar) {
    const url = m.permalink.slice(0, 500);
    if (dipakaiUrl.has(url) || sudahAda(url)) continue;
    const t = Date.parse(m.waktu!);
    const capMedia = normalTeks(m.caption ?? "");
    // Kandidat: unggahan yang mendahului media ini dan belum dapat pasangan.
    // Bila media punya caption dan unggahan punya judul, caption HARUS memuat
    // judulnya (caption yang dikirim aplikasi selalu diawali judul) — ini
    // yang mencegah video lain (unggahan manual / unggahan lain) tercatat
    // sebagai tautan unggahan ini (bug "link acak", 8 Sep 2026).
    let pilih: { id: number; acuan: number; judul: string } | null = null;
    for (const p of posts) {
      if (p.acuan > t || dipakai.has(p.id)) continue;
      if (capMedia && p.judul && !capMedia.includes(p.judul)) continue;
      if (!pilih || p.acuan > pilih.acuan) pilih = p;
    }
    if (!pilih) continue;
    dipakai.add(pilih.id);
    dipakaiUrl.add(url);
    tandai(url);
    hasil.push({ post_id: pilih.id, url, waktu: m.waktu! });
  }
  return hasil;
}

type KonteksCatat = {
  /** username akun tertaut per platform — untuk bentuk tautan kanonik */
  usernamePer: Record<string, string>;
  /** kunci video (platform|id) yang sudah tercatat milik user ini */
  kunciSudah: Set<string>;
  /** "<post_id>|<platform>" yang sudah punya baris laporan */
  adaTerkait: Set<string>;
};

/**
 * Catat satu tautan. Tautan disimpan dalam bentuk KANONIK dan dibandingkan
 * lewat ID videonya (bukan teks URL) supaya /t/<id> dan /@akun/video/<id>?utm
 * tidak tercatat dua kali (akar bug laporan ganda, 8 Sep 2026).
 */
async function catatLaporan(
  db: ReturnType<typeof supabase>,
  userId: number,
  platform: string,
  urlMentah: string,
  waktu: string | null,
  postId: number,
  ctx: KonteksCatat,
): Promise<"baru" | "dobel" | "gagal"> {
  const url = kanonikTautan(platform, urlMentah, ctx.usernamePer[platform]).slice(0, 500);
  const kunci = kunciVideo(platform, url);
  // X memecah satu unggahan jadi utas → satu baris per unggahan sudah cukup.
  if (ctx.kunciSudah.has(kunci) || (platform === "twitter" && ctx.adaTerkait.has(`${postId}|twitter`))) return "dobel";
  // 10 Sep 2026: dulu INSERT biasa, lalu galat 23505 ("sudah ada")
  // dianggap wajar. Akibatnya rekonsiliasi menembakkan ~955 penulisan
  // GAGAL per hari ke database — beban dan log galat yang sia-sia.
  // Kini konflik ditangani Postgres sendiri (ON CONFLICT DO NOTHING):
  // tidak ada galat, dan baris balasan yang kosong = memang sudah ada.
  const { data: barisBaru, error } = await db
    .from("laporan_video")
    .upsert(
      {
        user_id: userId,
        platform,
        url_video: url,
        keyword: null,
        tanggal_wib: tanggalWibDari(waktu),
        sumber: "otomatis",
        tvrku_post_id: postId,
      },
      { onConflict: "user_id,url_video", ignoreDuplicates: true },
    )
    .select("id");
  if (error) return "gagal";
  ctx.kunciSudah.add(kunci);
  ctx.adaTerkait.add(`${postId}|${platform}`);
  if ((barisBaru ?? []).length > 0) {
    // Bila anggota sempat melaporkan link ini MANUAL (menunggu ACC HR),
    // deteksi otomatis = bukti sah → langsung disetujui (2 Sep 2026).
    await db
      .from("laporan_video_pending")
      .update({ status: "disetujui", catatan: "Terdeteksi otomatis dari unggahan aplikasi", diputus_oleh: "sistem", diputus_pada: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("url_video", url)
      .eq("status", "menunggu");
    return "baru";
  }
  return "dobel";
}

export type RingkasanRekonsiliasi = {
  baru: number;
  dari_pasti: number;
  dari_media: number;
  disembuhkan: number;
  /** Platform yang upload-post nyatakan gagal terbit (bukan salah pencatatan). */
  gagal_terbit: number;
  pending_tersisa: number;
  catatan: string[];
};

/**
 * Rekonsiliasi unggahan seorang anggota → laporan_video otomatis.
 * TIDAK melempar; mengembalikan jumlah laporan baru (kompatibel pemanggil lama).
 * `anggaranMs`: batas waktu; sisa unggahan menyusul pada pemanggilan berikutnya.
 */
export async function rekonsiliasiKpiOtomatis(userId: number, opsi: { anggaranMs?: number } = {}): Promise<number> {
  const r = await rekonsiliasiKpiRinci(userId, opsi);
  return r.baru;
}

export async function rekonsiliasiKpiRinci(userId: number, opsi: { anggaranMs?: number } = {}): Promise<RingkasanRekonsiliasi> {
  const ringkas: RingkasanRekonsiliasi = { baru: 0, dari_pasti: 0, dari_media: 0, disembuhkan: 0, gagal_terbit: 0, pending_tersisa: 0, catatan: [] };
  if (!uploadPostSiap()) return ringkas;
  const tenggat = opsi.anggaranMs ? Date.now() + opsi.anggaranMs : Infinity;
  // Sisa anggaran (ms) — dipakai sebagai batas waktu TIAP panggilan upload-post
  // supaya jalur interaktif (Generate laporan, anggaran 30 dtk) tidak
  // menggantung bermenit-menit (insiden 7 Sep 2026: 4,2 menit).
  const sisa = () => (tenggat === Infinity ? 25_000 : tenggat - Date.now());
  const cukup = () => sisa() > 4_000;
  try {
    const db = supabase();
    const { data: profilBaris } = await db
      .from("sosmed_profile")
      .select("profile_key")
      .eq("jenis", "pengguna")
      .eq("penyedia", "upload-post")
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    const profil = (profilBaris?.profile_key as string) ?? "";
    if (!profil) return ringkas;

    const batas = new Date(Date.now() - BATAS_UMUR_JAM * 3600_000).toISOString();
    const { data: postsMentah } = await db
      .from("tvrku_post")
      .select("id, judul, platforms, kpi_tercatat, jadwal, dibuat_pada, request_id, hasil")
      .eq("user_id", userId)
      .gte("dibuat_pada", batas)
      .order("dibuat_pada", { ascending: true })
      .limit(80);
    const daftarStr = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).toLowerCase()) : []);
    const posts: PostTvrku[] = (postsMentah ?? []).map((p) => {
      const hasil = (p.hasil && typeof p.hasil === "object" && !Array.isArray(p.hasil) ? (p.hasil as Record<string, unknown>) : {}) as Record<string, unknown>;
      return {
        id: Number(p.id),
        platforms: daftarStr(p.platforms),
        kpi_tercatat: daftarStr(p.kpi_tercatat),
        jadwal: p.jadwal ? String(p.jadwal) : null,
        dibuat_pada: String(p.dibuat_pada),
        request_id: p.request_id ? String(p.request_id) : null,
        kpi_pasti: daftarStr(hasil.kpi_pasti),
        kpi_gagal: daftarStr(hasil.kpi_gagal),
        kpi_gagal_alasan: (hasil.kpi_gagal_alasan && typeof hasil.kpi_gagal_alasan === "object" ? (hasil.kpi_gagal_alasan as Record<string, string>) : {}),
        judul: String(p.judul ?? ""),
        hasil,
      };
    });
    if (posts.length === 0) return ringkas;

    // Baris laporan yang SUDAH terkait unggahan-unggahan ini + semua tautan
    // milik user (dibandingkan lewat ID video, bukan teks URL) + akun tertaut.
    const [{ data: terkait }, { data: semuaUrl }, { data: akunTertaut }] = await Promise.all([
      db.from("laporan_video").select("tvrku_post_id, platform").eq("user_id", userId).in("tvrku_post_id", posts.map((p) => p.id)),
      db.from("laporan_video").select("platform, url_video").eq("user_id", userId).order("id", { ascending: false }).limit(3000),
      db.from("akun_tvr_user").select("platform, username").eq("user_id", userId).eq("aktif", true).order("id", { ascending: true }),
    ]);
    const adaTerkait = new Set((terkait ?? []).map((t) => `${t.tvrku_post_id}|${String(t.platform).toLowerCase()}`));
    const kunciSudah = new Set((semuaUrl ?? []).map((u) => kunciVideo(String(u.platform ?? ""), String(u.url_video))));
    const usernamePer: Record<string, string> = {};
    for (const a of akunTertaut ?? []) {
      const pf = String(a.platform ?? "").toLowerCase();
      if (!usernamePer[pf] && a.username) usernamePer[pf] = String(a.username);
    }
    const ctx: KonteksCatat = { usernamePer, kunciSudah, adaTerkait };
    const sudahTercatat = (pf: string) => (url: string) => kunciSudah.has(kunciVideo(pf, url));

    // PENYEMBUHAN: platform "ditandai" tanpa baris terkait → buka lagi.
    const tercatatEfektif = new Map<number, Set<string>>();
    for (const p of posts) {
      const efektif = new Set(p.kpi_tercatat.filter((pf) => adaTerkait.has(`${p.id}|${pf}`)));
      if (efektif.size !== p.kpi_tercatat.length) ringkas.disembuhkan += p.kpi_tercatat.length - efektif.size;
      tercatatEfektif.set(p.id, efektif);
    }

    const jejakBaru = new Map<number, { pasti: Set<string>; gagal: Set<string>; alasan: Record<string, string> }>();
    // Kegagalan BARU (belum pernah dikabarkan) → notifikasi ke anggota dengan alasan + solusi.
    const kabarGagal: { post: PostTvrku; daftar: { platform: string; pesan: string }[] }[] = [];
    const pendingDari = (p: PostTvrku) =>
      p.jadwal && Date.parse(p.jadwal) > Date.now()
        ? []
        : p.platforms.filter((pf) => !tercatatEfektif.get(p.id)!.has(pf) && !p.kpi_gagal.includes(pf) && !(jejakBaru.get(p.id)?.gagal.has(pf) ?? false));

    // LAPIS 1: sumber pasti per request_id — dicek SEKALI per platform untuk
    // SEMUA unggahan (bukan hanya yang belum tercatat), supaya salah-atribusi
    // lama (unggahan A memegang tautan unggahan B) ikut sembuh: tautan yang
    // hilang disisipkan di bawah unggahan yang benar; yang sudah ada = dobel.
    // Platform yang dinyatakan upload-post GAGAL terbit dicatat di
    // hasil.kpi_gagal agar tidak ditanya lagi (dan bisa ditampilkan ke anggota).
    let ditanya = 0;
    for (const p of [...posts].reverse()) {
      if (!cukup() || ditanya >= BATAS_TANYA_PASTI) break;
      const perluCek = belumPasti(p);
      if (perluCek.length === 0 || !p.request_id) continue;
      ditanya += 1;
      const jejak = { pasti: new Set(p.kpi_pasti), gagal: new Set(p.kpi_gagal), alasan: { ...p.kpi_gagal_alasan } };
      const gagalBaru: { platform: string; pesan: string }[] = [];
      try {
        const per = await analitikPostUp(p.request_id, Math.min(25_000, sisa()));
        let adaKosong = false;
        for (const pf of perluCek) {
          const url = per.get(pf)?.post_url ?? "";
          if (!url) {
            adaKosong = true;
            continue;
          }
          const r = await catatLaporan(db, userId, pf, url, per.get(pf)?.waktu ?? p.dibuat_pada, p.id, ctx);
          if (r === "gagal") continue;
          if (r === "baru") {
            ringkas.baru += 1;
            ringkas.dari_pasti += 1;
          }
          // "dobel" = video ini sudah tercatat (mungkin di bawah unggahan lain) → tetap beres untuk unggahan ini.
          tercatatEfektif.get(p.id)!.add(pf);
          jejak.pasti.add(pf);
        }
        // Platform tanpa URL: tanya status — gagal terbit? Jangan ditanya terus sampai 96 jam.
        if (adaKosong && cukup()) {
          const st = await statusUnggahUp(p.request_id, Math.min(20_000, sisa()));
          for (const pf of perluCek) {
            if (jejak.pasti.has(pf)) continue;
            const s = st.per[pf];
            const gagalPlatform = (st.status === "completed" && s && s.sukses === false) || st.status === "failed";
            if (gagalPlatform && !jejak.gagal.has(pf)) {
              const pesan = (s?.pesan || String((st.mentah as { message?: string })?.message ?? "") || st.status).slice(0, 300);
              jejak.gagal.add(pf);
              jejak.alasan[pf] = pesan;
              gagalBaru.push({ platform: pf, pesan });
              ringkas.gagal_terbit += 1;
            }
          }
        }
      } catch (e) {
        ringkas.catatan.push(`pasti #${p.id}: ${e instanceof Error ? e.message : e}`);
      }
      if (gagalBaru.length > 0) kabarGagal.push({ post: p, daftar: gagalBaru });
      if (jejak.pasti.size !== p.kpi_pasti.length || jejak.gagal.size !== p.kpi_gagal.length) jejakBaru.set(p.id, jejak);
    }

    // LAPIS 2: cadangan — media profil per platform, satu-satu kronologis.
    const platformPending = new Set<string>();
    for (const p of posts) for (const pf of pendingDari(p)) platformPending.add(pf);
    for (const pf of platformPending) {
      if (!cukup()) break;
      const pending = posts.filter((p) => pendingDari(p).includes(pf));
      if (pending.length === 0) continue;
      try {
        const media = await postinganTerbaruUp(profil, pf, BATAS_MEDIA, Math.min(20_000, sisa()));
        const pasangan = cocokkanMedia(pending, media, sudahTercatat(pf));
        for (const c of pasangan) {
          const r = await catatLaporan(db, userId, pf, c.url, c.waktu, c.post_id, ctx);
          if (r === "baru") {
            ringkas.baru += 1;
            ringkas.dari_media += 1;
            tercatatEfektif.get(c.post_id)!.add(pf);
          }
          // "dobel": URL sudah milik unggahan lain → JANGAN tandai beres (beda dari kode lama).
        }
      } catch (e) {
        ringkas.catatan.push(`media ${pf}: ${e instanceof Error ? e.message : e}`);
      }
    }

    // Simpan kpi_tercatat = platform yang BENAR-BENAR punya baris laporan terkait,
    // plus jejak kpi_pasti/kpi_gagal di kolom hasil (tanpa migrasi).
    for (const p of posts) {
      const baruSet = [...tercatatEfektif.get(p.id)!].sort();
      const lama = [...p.kpi_tercatat].sort();
      const jejak = jejakBaru.get(p.id);
      const ubah: Record<string, unknown> = {};
      if (baruSet.join(",") !== lama.join(",")) ubah.kpi_tercatat = baruSet;
      if (jejak) ubah.hasil = { ...p.hasil, kpi_pasti: [...jejak.pasti].sort(), kpi_gagal: [...jejak.gagal].sort(), kpi_gagal_alasan: jejak.alasan };
      if (Object.keys(ubah).length > 0) {
        await db.from("tvrku_post").update({ ...ubah, rekonsiliasi_pada: new Date().toISOString() }).eq("id", p.id);
      }
      ringkas.pending_tersisa += pendingDari(p).length;
    }

    // Kabari anggota: platform yang gagal terbit + alasan + solusi (sekali per unggahan).
    for (const k of kabarGagal) {
      try {
        const baris = k.daftar.map((g) => {
          const { ringkas: r, solusi } = solusiGagal(g.platform, g.pesan);
          return `• ${LABEL_SOSMED[g.platform] ?? g.platform}: ${r}${g.pesan ? ` (${g.pesan.slice(0, 120)})` : ""}\n  Solusi: ${solusi}`;
        });
        await kirimKabar({
          judul: `⚠️ Video gagal terbit di ${k.daftar.map((g) => LABEL_SOSMED[g.platform] ?? g.platform).join(", ")}`,
          isi: `"${k.post.judul || "Video"}" tidak terbit di ${k.daftar.length} sosmed:\n${baris.join("\n")}`,
          kategori: "peringatan",
          jenis_peristiwa: "unggah_gagal",
          target: "tvrku",
          untukUserIds: [userId],
        });
      } catch (e) {
        ringkas.catatan.push(`kabar gagal #${k.post.id}: ${e instanceof Error ? e.message : e}`);
      }
    }
    return ringkas;
  } catch (e) {
    console.error("[kpi-otomatis] rekonsiliasi:", e);
    ringkas.catatan.push(String(e instanceof Error ? e.message : e));
    return ringkas;
  }
}

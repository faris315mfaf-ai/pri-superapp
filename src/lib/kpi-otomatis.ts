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
// CARA KERJA BARU (deterministik, tiga lapis + tautan native hari ini):
//  1. SUMBER PASTI: upload-post menyimpan URL tiap postingan per request →
//     GET /uploadposts/post-analytics/{request_id} mengembalikan post_url
//     per platform. Itu yang dicatat (tanpa tebak-tebakan).
//  2. CADANGAN: bila sumber pasti belum tersedia (masih diproses / endpoint
//     gagal), cocokkan daftar media profil SATU-SATU secara kronologis:
//     tiap media dipasangkan ke unggahan TERAKHIR yang waktunya mendahului
//     media itu dan belum punya tautan; URL yang sudah tercatat dilewati.
//  3. PENYEMBUHAN: platform yang dulu "ditandai tercatat" tapi TIDAK punya
//     baris laporan_video terkait dibuka lagi supaya dicoba ulang.
//  4. MEDIA HARI INI: tautan yang sudah terbit di akun tertaut hari ini
//     ikut dicatat meskipun tidak ada baris tvrku_post (unggah native HP
//     / riwayat SuperApp gagal tersimpan).
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
import { PENYEDIA_ANGGOTA } from "@/lib/sosmed-penyedia";
import { namaKolomHilang } from "@/lib/kolom-struktur";
import { PLATFORM_KPI } from "@/lib/kpi-video";

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

type BarisLaporanKunci = { id: number; postId: number | null; url: string; waktu: string | null };

type KonteksCatat = {
  /** username akun tertaut per platform — untuk bentuk tautan kanonik */
  usernamePer: Record<string, string>;
  /** kunci video (platform|id) yang sudah tercatat milik user ini */
  kunciSudah: Set<string>;
  /** "<post_id>|<platform>" yang sudah punya baris laporan */
  adaTerkait: Set<string>;
  /**
   * Baris laporan per kunci video. Dipakai menautkan ORPHAN
   * (tvrku_post_id null) ke unggahan yang menunggu — akar bug
   * "30 tercatat · N menunggu" (21 Sep 2026): lapis 3 mencatat KPI
   * tanpa mengaitkan ke tvrku_post, lalu status menunggu tak hilang.
   */
  barisPerKunci: Map<string, BarisLaporanKunci>;
  /**
   * Kategori tiap unggahan (tvrku_post.hasil.kategori, 25 Sep 2026) →
   * ikut dicatat sebagai `keyword` laporan otomatisnya, supaya video itu
   * masuk pengelompokan kategori di TV Rakyat Nasional.
   */
  kategoriPost: Map<number, string>;
};

/** Kategori yang tersimpan di hasil unggahan; "" bila tidak ada. */
export function kategoriDariHasil(hasil: Record<string, unknown> | null | undefined): string {
  const k = hasil?.kategori;
  return typeof k === "string" ? k.trim().slice(0, 120) : "";
}

/** Isi keyword laporan yang masih kosong dengan kategori unggahannya. */
async function isiKategoriKosong(db: ReturnType<typeof supabase>, idLaporan: number, kategori: string): Promise<void> {
  if (!kategori || idLaporan <= 0) return;
  // Hanya yang keyword-nya kosong: kategori pilihan anggota (laporan
  // manual) tidak pernah ditimpa. Galat (mis. kolom belum ada) diabaikan.
  await db
    .from("laporan_video")
    .update({ keyword: kategori })
    .eq("id", idLaporan)
    .is("keyword", null)
    .then(
      () => undefined,
      () => undefined,
    );
}

/** Tautkan baris orphan ke unggahan. Mengembalikan "baru" bila berhasil. */
async function tautkanOrphanKePost(
  db: ReturnType<typeof supabase>,
  platform: string,
  kunci: string,
  postId: number,
  ctx: KonteksCatat,
): Promise<"baru" | "dobel"> {
  if (postId <= 0) return "dobel";
  const baris = ctx.barisPerKunci.get(kunci);
  if (!baris) return "dobel";
  if (baris.postId === postId) {
    ctx.adaTerkait.add(`${postId}|${platform}`);
    return "dobel";
  }
  if (baris.postId != null && baris.postId > 0) return "dobel";
  const { data, error } = await db
    .from("laporan_video")
    .update({ tvrku_post_id: postId })
    .eq("id", baris.id)
    .is("tvrku_post_id", null)
    .select("id");
  if (error || !(data ?? []).length) return "dobel";
  baris.postId = postId;
  ctx.adaTerkait.add(`${postId}|${platform}`);
  await isiKategoriKosong(db, baris.id, ctx.kategoriPost.get(postId) ?? "");
  return "baru";
}

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
  if (platform === "twitter" && postId > 0 && ctx.adaTerkait.has(`${postId}|twitter`)) return "dobel";
  if (ctx.kunciSudah.has(kunci)) {
    // Sudah ada baris: bila orphan + ada unggahan target → tautkan, jangan diam.
    return tautkanOrphanKePost(db, platform, kunci, postId, ctx);
  }
  // 10 Sep 2026: dulu INSERT biasa, lalu galat 23505 ("sudah ada")
  // dianggap wajar. Akibatnya rekonsiliasi menembakkan ~955 penulisan
  // GAGAL per hari ke database — beban dan log galat yang sia-sia.
  // Kini konflik ditangani Postgres sendiri (ON CONFLICT DO NOTHING):
  // tidak ada galat, dan baris balasan yang kosong = memang sudah ada.
  const isi: Record<string, unknown> = {
    user_id: userId,
    platform,
    url_video: url,
    // Kategori unggahannya (bila ada) — unggahan native tanpa unggahan
    // aplikasi (postId 0) memang tidak punya kategori.
    keyword: (postId > 0 ? ctx.kategoriPost.get(postId) : "") || null,
    tanggal_wib: tanggalWibDari(waktu),
    sumber: "otomatis",
  };
  if (postId > 0) isi.tvrku_post_id = postId;
  const { data: barisBaru, error } = await db
    .from("laporan_video")
    .upsert(isi, { onConflict: "user_id,url_video", ignoreDuplicates: true })
    .select("id");
  if (error) {
    if (namaKolomHilang(error.message) === "keyword") {
      delete isi.keyword;
      const ulang = await db
        .from("laporan_video")
        .upsert(isi, { onConflict: "user_id,url_video", ignoreDuplicates: true })
        .select("id");
      if (ulang.error) return "gagal";
      ctx.kunciSudah.add(kunci);
      if ((ulang.data ?? []).length > 0) {
        const idBaru = Number(ulang.data![0].id);
        ctx.barisPerKunci.set(kunci, { id: idBaru, postId: postId > 0 ? postId : null, url, waktu });
        if (postId > 0) ctx.adaTerkait.add(`${postId}|${platform}`);
        await db
          .from("laporan_video_pending")
          .update({ status: "disetujui", catatan: "Terdeteksi otomatis dari unggahan aplikasi", diputus_oleh: "sistem", diputus_pada: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("url_video", url)
          .eq("status", "menunggu");
        return "baru";
      }
      return tautkanOrphanKePost(db, platform, kunci, postId, ctx);
    }
    return "gagal";
  }
  ctx.kunciSudah.add(kunci);
  if ((barisBaru ?? []).length > 0) {
    const idBaru = Number(barisBaru![0].id);
    ctx.barisPerKunci.set(kunci, { id: idBaru, postId: postId > 0 ? postId : null, url, waktu });
    if (postId > 0) ctx.adaTerkait.add(`${postId}|${platform}`);
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
  // Upsert bentrok (URL sudah ada) — coba tautkan orphan ke unggahan ini.
  return tautkanOrphanKePost(db, platform, kunci, postId, ctx);
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

const JEDA_REKON_MS = 60_000;
const jedaRekon = new Map<number, number>();

/**
 * Rekonsiliasi unggahan seorang anggota → laporan_video otomatis.
 * TIDAK melempar; mengembalikan jumlah laporan baru (kompatibel pemanggil lama).
 * `anggaranMs`: batas waktu; sisa unggahan menyusul pada pemanggilan berikutnya.
 * `paksa`: lewati jeda 60 detik (dipakai sekali setelah unggah berhasil).
 */

export async function rekonsiliasiKpiOtomatis(
  userId: number,
  opsi: { anggaranMs?: number; paksa?: boolean } = {},
): Promise<number> {
  const r = await rekonsiliasiKpiRinci(userId, opsi);
  return r.baru;
}

export async function rekonsiliasiKpiRinci(
  userId: number,
  opsi: { anggaranMs?: number; paksa?: boolean } = {},
): Promise<RingkasanRekonsiliasi> {
  const ringkas: RingkasanRekonsiliasi = { baru: 0, dari_pasti: 0, dari_media: 0, disembuhkan: 0, gagal_terbit: 0, pending_tersisa: 0, catatan: [] };
  if (!uploadPostSiap()) return ringkas;
  // Buka riwayat / polling 15 dtk dulu memanggil ini tiap kali. Satu API key
  // dipakai semua anggota, jadi tanpa jeda upload-post membalas 429 dan
  // unggahan sungguhan ikut tertolak.
  const kini = Date.now();
  const lalu = jedaRekon.get(userId) ?? 0;
  if (!opsi.paksa && kini - lalu < JEDA_REKON_MS) return ringkas;
  jedaRekon.set(userId, kini);
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
      .in("penyedia", PENYEDIA_ANGGOTA)
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    const profil = (profilBaris?.profile_key as string) ?? "";
    if (!profil) return ringkas;

    const batas = new Date(Date.now() - BATAS_UMUR_JAM * 3600_000).toISOString();
    const pilihPost =
      "id, judul, platforms, kpi_tercatat, jadwal, dibuat_pada, request_id, hasil";
    let { data: postsMentah, error: errPost } = await db
      .from("tvrku_post")
      .select(pilihPost)
      .eq("user_id", userId)
      .gte("dibuat_pada", batas)
      .order("dibuat_pada", { ascending: true })
      .limit(80);
    if (errPost && namaKolomHilang(errPost.message) === "kpi_tercatat") {
      const ulang = await db
        .from("tvrku_post")
        .select("id, judul, platforms, jadwal, dibuat_pada, request_id, hasil")
        .eq("user_id", userId)
        .gte("dibuat_pada", batas)
        .order("dibuat_pada", { ascending: true })
        .limit(80);
      postsMentah = (ulang.data ?? []).map((p) => ({ ...p, kpi_tercatat: [] }));
      errPost = ulang.error;
    }
    if (errPost) {
      ringkas.catatan.push(`baca unggahan: ${errPost.message}`);
      return ringkas;
    }
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
    // Baris laporan yang SUDAH terkait unggahan-unggahan ini + semua tautan
    // milik user (dibandingkan lewat ID video, bukan teks URL) + akun tertaut.
    // Tetap dijalankan meski tidak ada tvrku_post: unggahan native di akun
    // tertaut hari ini tetap harus masuk KPI (insiden 18 Sep 2026).
    const idPost = posts.map((p) => p.id);
    const [{ data: terkait }, { data: semuaUrl }, { data: akunTertaut }] = await Promise.all([
      idPost.length
        ? db.from("laporan_video").select("tvrku_post_id, platform").eq("user_id", userId).in("tvrku_post_id", idPost)
        : Promise.resolve({ data: [] as { tvrku_post_id: unknown; platform: unknown }[] }),
      db
        .from("laporan_video")
        .select("id, platform, url_video, tvrku_post_id, dibuat_pada")
        .eq("user_id", userId)
        .order("id", { ascending: false })
        .limit(3000),
      db.from("akun_tvr_user").select("platform, username").eq("user_id", userId).eq("aktif", true).order("id", { ascending: true }),
    ]);
    const adaTerkait = new Set((terkait ?? []).map((t) => `${t.tvrku_post_id}|${String(t.platform).toLowerCase()}`));
    const kunciSudah = new Set<string>();
    const barisPerKunci = new Map<string, BarisLaporanKunci>();
    for (const u of semuaUrl ?? []) {
      const pf = String(u.platform ?? "").toLowerCase();
      const url = String(u.url_video ?? "");
      const kunci = kunciVideo(pf, url);
      kunciSudah.add(kunci);
      const postIdMentah = u.tvrku_post_id == null ? null : Number(u.tvrku_post_id);
      const postId = postIdMentah && postIdMentah > 0 ? postIdMentah : null;
      const lama = barisPerKunci.get(kunci);
      // Pertahankan baris yang sudah terkait unggahan bila ada dobel kunci.
      if (lama?.postId && !postId) continue;
      barisPerKunci.set(kunci, {
        id: Number(u.id),
        postId,
        url,
        waktu: u.dibuat_pada ? String(u.dibuat_pada) : null,
      });
    }
    const usernamePer: Record<string, string> = {};
    for (const a of akunTertaut ?? []) {
      const pf = String(a.platform ?? "").toLowerCase();
      if (!usernamePer[pf] && a.username) usernamePer[pf] = String(a.username);
    }
    const kategoriPost = new Map<number, string>();
    for (const p of posts) {
      const k = kategoriDariHasil(p.hasil);
      if (k) kategoriPost.set(p.id, k);
    }
    const ctx: KonteksCatat = { usernamePer, kunciSudah, adaTerkait, barisPerKunci, kategoriPost };
    // URL yang SUDAH terkait unggahan dilewati; orphan boleh dipasangkan lagi.
    const sudahTerkaitPost = (pf: string) => (url: string) => {
      const baris = barisPerKunci.get(kunciVideo(pf, url));
      return Boolean(baris?.postId);
    };

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
    const mediaPer = new Map<string, Awaited<ReturnType<typeof postinganTerbaruUp>>>();
    for (const pf of platformPending) {
      if (!cukup()) break;
      const pending = posts.filter((p) => pendingDari(p).includes(pf));
      if (pending.length === 0) continue;
      try {
        const media = await postinganTerbaruUp(profil, pf, BATAS_MEDIA, Math.min(20_000, sisa()));
        mediaPer.set(pf, media);
        const pasangan = cocokkanMedia(pending, media, sudahTerkaitPost(pf));
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

    // LAPIS 2.5: tautkan ORPHAN (laporan_video tanpa tvrku_post_id) ke
    // unggahan yang masih menunggu, berurutan waktu. Tanpa filter caption —
    // barisnya sudah milik akun anggota ini; yang kurang hanya kaitannya
    // ke unggahan aplikasi (insiden 21 Sep 2026).
    const orphanPer = new Map<string, PostinganUp[]>();
    for (const [kunci, baris] of barisPerKunci) {
      if (baris.postId) continue;
      const pf = kunci.split("|")[0] ?? "";
      if (!pf || !posts.some((p) => pendingDari(p).includes(pf))) continue;
      // Pakai waktu terbit dari media bila ada; dibuat_pada orphan sering
      // hanya waktu cron mencatat, bukan waktu postingan.
      let waktu = baris.waktu;
      const mediaPf = mediaPer.get(pf) ?? [];
      for (const m of mediaPf) {
        if (m.permalink && kunciVideo(pf, m.permalink) === kunci && m.waktu) {
          waktu = m.waktu;
          break;
        }
      }
      const daftar = orphanPer.get(pf) ?? [];
      daftar.push({
        id: String(baris.id),
        permalink: baris.url,
        caption: "",
        jenis: "",
        waktu,
        thumbnail: "",
      });
      orphanPer.set(pf, daftar);
    }
    for (const [pf, orphanMedia] of orphanPer) {
      const pending = posts
        .filter((p) => pendingDari(p).includes(pf))
        .map((p) => ({ ...p, judul: "" })); // tanpa filter caption
      if (pending.length === 0 || orphanMedia.length === 0) continue;
      const pasangan = cocokkanMedia(pending, orphanMedia, sudahTerkaitPost(pf));
      for (const c of pasangan) {
        const r = await catatLaporan(db, userId, pf, c.url, c.waktu, c.post_id, ctx);
        if (r === "baru") {
          ringkas.baru += 1;
          ringkas.dari_media += 1;
          ringkas.disembuhkan += 1;
          tercatatEfektif.get(c.post_id)!.add(pf);
        }
      }
    }

    // LAPIS 3: tautan yang SUDAH TERBIT hari ini di akun tertaut, termasuk
    // yang tidak lewat tombol SuperApp (unggah native HP / insert riwayat
    // gagal). Sebelum mencatat sebagai orphan (post_id=0), coba pasangkan
    // dulu ke unggahan yang masih menunggu — supaya status "menunggu" hilang.
    const awalHariMs = Date.parse(`${tanggalWibDari(null)}T00:00:00+07:00`);
    const platformAkun = [...new Set([...PLATFORM_KPI, ...Object.keys(usernamePer)])].filter(
      (p) => p !== "website" && p !== "bilibili",
    );
    for (const pf of platformAkun) {
      if (!cukup()) break;
      try {
        let media = mediaPer.get(pf);
        if (!media) {
          media = await postinganTerbaruUp(profil, pf, BATAS_MEDIA, Math.min(20_000, sisa()));
          mediaPer.set(pf, media);
        }
        const pending = posts
          .filter((p) => pendingDari(p).includes(pf))
          .map((p) => ({ ...p, judul: "" }));
        if (pending.length > 0) {
          const pasangan = cocokkanMedia(pending, media, sudahTerkaitPost(pf));
          for (const c of pasangan) {
            const r = await catatLaporan(db, userId, pf, c.url, c.waktu, c.post_id, ctx);
            if (r === "baru") {
              ringkas.baru += 1;
              ringkas.dari_media += 1;
              tercatatEfektif.get(c.post_id)!.add(pf);
            }
          }
        }
        for (const m of media) {
          if (!m.permalink || !m.waktu) continue;
          const t = Date.parse(m.waktu);
          if (!Number.isFinite(t) || t < awalHariMs) continue;
          if (sudahTerkaitPost(pf)(m.permalink)) continue;
          // Masih pending di platform ini → jangan buat orphan baru; biarkan
          // pemanggilan berikutnya (cron) memasangkannya. Native murni
          // (tidak ada unggahan menunggu) tetap dicatat ke KPI.
          if (posts.some((p) => pendingDari(p).includes(pf))) continue;
          const r = await catatLaporan(db, userId, pf, m.permalink, m.waktu, 0, ctx);
          if (r === "baru") {
            ringkas.baru += 1;
            ringkas.dari_media += 1;
          }
        }
      } catch (e) {
        ringkas.catatan.push(`media-hari ${pf}: ${e instanceof Error ? e.message : e}`);
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
        const simpan = await db.from("tvrku_post").update({ ...ubah, rekonsiliasi_pada: new Date().toISOString() }).eq("id", p.id);
        if (simpan.error && namaKolomHilang(simpan.error.message) === "rekonsiliasi_pada") {
          await db.from("tvrku_post").update(ubah).eq("id", p.id);
        }
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

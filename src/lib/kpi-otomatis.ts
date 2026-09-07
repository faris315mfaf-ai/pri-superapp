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
  hasil: Record<string, unknown>;
};

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
  pending: Pick<PostTvrku, "id" | "jadwal" | "dibuat_pada">[],
  media: PostinganUp[],
  urlSudah: Set<string>,
): { post_id: number; url: string; waktu: string }[] {
  const posts = pending
    .map((p) => ({ id: p.id, acuan: acuanMs(p) }))
    .sort((a, b) => a.acuan - b.acuan);
  const dipakai = new Set<number>();
  const hasil: { post_id: number; url: string; waktu: string }[] = [];
  const daftar = media
    .filter((m) => m.permalink && m.waktu && Number.isFinite(Date.parse(m.waktu)))
    .sort((a, b) => Date.parse(a.waktu!) - Date.parse(b.waktu!));
  for (const m of daftar) {
    const url = m.permalink.slice(0, 500);
    if (urlSudah.has(url)) continue;
    const t = Date.parse(m.waktu!);
    let pilih: { id: number; acuan: number } | null = null;
    for (const p of posts) {
      if (p.acuan > t || dipakai.has(p.id)) continue;
      if (!pilih || p.acuan > pilih.acuan) pilih = p;
    }
    if (!pilih) continue;
    dipakai.add(pilih.id);
    urlSudah.add(url);
    hasil.push({ post_id: pilih.id, url, waktu: m.waktu! });
  }
  return hasil;
}

async function catatLaporan(
  db: ReturnType<typeof supabase>,
  userId: number,
  platform: string,
  url: string,
  waktu: string | null,
  postId: number,
): Promise<"baru" | "dobel" | "gagal"> {
  const { error } = await db.from("laporan_video").insert({
    user_id: userId,
    platform,
    url_video: url.slice(0, 500),
    keyword: null,
    tanggal_wib: tanggalWibDari(waktu),
    sumber: "otomatis",
    tvrku_post_id: postId,
  });
  if (error && error.code !== "23505") return "gagal";
  if (!error) {
    // Bila anggota sempat melaporkan link ini MANUAL (menunggu ACC HR),
    // deteksi otomatis = bukti sah → langsung disetujui (2 Sep 2026).
    await db
      .from("laporan_video_pending")
      .update({ status: "disetujui", catatan: "Terdeteksi otomatis dari unggahan aplikasi", diputus_oleh: "sistem", diputus_pada: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("url_video", url.slice(0, 500))
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
      .select("id, platforms, kpi_tercatat, jadwal, dibuat_pada, request_id, hasil")
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
        hasil,
      };
    });
    if (posts.length === 0) return ringkas;

    // Baris laporan yang SUDAH terkait unggahan-unggahan ini + semua URL milik user.
    const [{ data: terkait }, { data: semuaUrl }] = await Promise.all([
      db.from("laporan_video").select("tvrku_post_id, platform").eq("user_id", userId).in("tvrku_post_id", posts.map((p) => p.id)),
      db.from("laporan_video").select("url_video").eq("user_id", userId).order("id", { ascending: false }).limit(3000),
    ]);
    const adaTerkait = new Set((terkait ?? []).map((t) => `${t.tvrku_post_id}|${String(t.platform).toLowerCase()}`));
    const urlSudah = new Set((semuaUrl ?? []).map((u) => String(u.url_video)));

    // PENYEMBUHAN: platform "ditandai" tanpa baris terkait → buka lagi.
    const tercatatEfektif = new Map<number, Set<string>>();
    for (const p of posts) {
      const efektif = new Set(p.kpi_tercatat.filter((pf) => adaTerkait.has(`${p.id}|${pf}`)));
      if (efektif.size !== p.kpi_tercatat.length) ringkas.disembuhkan += p.kpi_tercatat.length - efektif.size;
      tercatatEfektif.set(p.id, efektif);
    }

    const jejakBaru = new Map<number, { pasti: Set<string>; gagal: Set<string> }>();
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
      const jejak = { pasti: new Set(p.kpi_pasti), gagal: new Set(p.kpi_gagal) };
      try {
        const per = await analitikPostUp(p.request_id, Math.min(25_000, sisa()));
        let adaKosong = false;
        for (const pf of perluCek) {
          const url = per.get(pf)?.post_url ?? "";
          if (!url) {
            adaKosong = true;
            continue;
          }
          const r = await catatLaporan(db, userId, pf, url, per.get(pf)?.waktu ?? p.dibuat_pada, p.id);
          if (r === "gagal") continue;
          if (r === "baru") {
            ringkas.baru += 1;
            ringkas.dari_pasti += 1;
          }
          // "dobel" = URL sudah tercatat (mungkin di bawah unggahan lain) → tetap beres untuk unggahan ini.
          tercatatEfektif.get(p.id)!.add(pf);
          urlSudah.add(url.slice(0, 500));
          jejak.pasti.add(pf);
        }
        // Platform tanpa URL: tanya status — gagal terbit? Jangan ditanya terus sampai 96 jam.
        if (adaKosong && cukup()) {
          const st = await statusUnggahUp(p.request_id, Math.min(20_000, sisa()));
          for (const pf of perluCek) {
            if (jejak.pasti.has(pf)) continue;
            const s = st.per[pf];
            if (st.status === "completed" && s && s.sukses === false) {
              jejak.gagal.add(pf);
              ringkas.gagal_terbit += 1;
            } else if (st.status === "failed") {
              jejak.gagal.add(pf);
              ringkas.gagal_terbit += 1;
            }
          }
        }
      } catch (e) {
        ringkas.catatan.push(`pasti #${p.id}: ${e instanceof Error ? e.message : e}`);
      }
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
        const pasangan = cocokkanMedia(pending, media, urlSudah);
        for (const c of pasangan) {
          const r = await catatLaporan(db, userId, pf, c.url, c.waktu, c.post_id);
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
      if (jejak) ubah.hasil = { ...p.hasil, kpi_pasti: [...jejak.pasti].sort(), kpi_gagal: [...jejak.gagal].sort() };
      if (Object.keys(ubah).length > 0) {
        await db.from("tvrku_post").update({ ...ubah, rekonsiliasi_pada: new Date().toISOString() }).eq("id", p.id);
      }
      ringkas.pending_tersisa += pendingDari(p).length;
    }
    return ringkas;
  } catch (e) {
    console.error("[kpi-otomatis] rekonsiliasi:", e);
    ringkas.catatan.push(String(e instanceof Error ? e.message : e));
    return ringkas;
  }
}

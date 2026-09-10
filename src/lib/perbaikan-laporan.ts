// ============================================================
// PERBAIKAN LAPORAN VIDEO — hapus baris ganda & rapikan tautan (8 Sep 2026).
//
// Menyisir laporan_video per anggota: baris yang menunjuk video yang SAMA
// (lihat lib/tautan-video: id per platform) digabung jadi satu, tautannya
// dirapikan ke bentuk kanonik (tanpa utm, memakai nama akun). Untuk X,
// upload-post bisa memecah satu unggahan jadi utas (beberapa status) →
// dianggap satu per unggahan (tvrku_post_id).
// Idempoten; bisa dijalankan berulang. `terapkan=false` = hanya menghitung.
// ============================================================
import { supabase } from "@/lib/supabase";
import { idVideo, kanonikTautan } from "@/lib/tautan-video";

export type BarisLaporan = {
  id: number;
  platform: string;
  url_video: string;
  tvrku_post_id: number | null;
  sumber: string | null;
  dibuat_pada: string;
};

export type RencanaPerbaikan = {
  hapus: { id: number; url: string; alasan: string }[];
  ubah: { id: number; dari: string; ke: string }[];
  /** kepemilikan unggahan dipindah ke baris yang dipertahankan */
  tautkan: { id: number; tvrku_post_id: number }[];
};

/**
 * Susun rencana (murni, bisa diuji). `pastiPost` = kumpulan
 * "<tvrku_post_id>|<platform>" yang tautannya berasal dari sumber pasti
 * (post-analytics) — baris itu paling dipercaya saat memilih yang dipertahankan.
 */
export function rencanakanPerbaikan(
  baris: BarisLaporan[],
  usernamePer: Record<string, string>,
  pastiPost: Set<string>,
): RencanaPerbaikan {
  const rencana: RencanaPerbaikan = { hapus: [], ubah: [], tautkan: [] };
  const kelompok = new Map<string, BarisLaporan[]>();
  for (const b of baris) {
    const p = b.platform.toLowerCase();
    const id = idVideo(p, b.url_video);
    // X: satu unggahan bisa jadi utas beberapa status → satukan per unggahan.
    const kunci = p === "twitter" && b.tvrku_post_id ? `${p}|post:${b.tvrku_post_id}` : id ? `${p}|id:${id}` : `${p}|url:${b.url_video.trim().toLowerCase()}`;
    if (!kelompok.has(kunci)) kelompok.set(kunci, []);
    kelompok.get(kunci)!.push(b);
  }
  const urlDipakai = new Set(baris.map((b) => b.url_video));

  for (const [, anggota] of kelompok) {
    const p = anggota[0].platform.toLowerCase();
    const kanon = (b: BarisLaporan) => kanonikTautan(p, b.url_video, usernamePer[p]);
    // Urutan pilih: dari sumber pasti → sudah kanonik → punya tvrku_post_id → paling awal.
    const nilai = (b: BarisLaporan) =>
      (b.tvrku_post_id && pastiPost.has(`${b.tvrku_post_id}|${p}`) ? 8 : 0) +
      (b.url_video === kanon(b) ? 4 : 0) +
      (b.tvrku_post_id ? 2 : 0) +
      (b.sumber === "otomatis" ? 1 : 0);
    const urut = [...anggota].sort((a, b) => nilai(b) - nilai(a) || Date.parse(a.dibuat_pada) - Date.parse(b.dibuat_pada));
    const tetap = urut[0];
    for (const b of urut.slice(1)) {
      rencana.hapus.push({ id: b.id, url: b.url_video, alasan: p === "twitter" && b.tvrku_post_id ? "utas X unggahan yang sama" : "video yang sama (bentuk tautan berbeda)" });
      urlDipakai.delete(b.url_video);
      if (!tetap.tvrku_post_id && b.tvrku_post_id) {
        tetap.tvrku_post_id = b.tvrku_post_id;
        rencana.tautkan.push({ id: tetap.id, tvrku_post_id: b.tvrku_post_id });
      }
    }
    const ke = kanon(tetap);
    if (ke !== tetap.url_video && ke.length >= 10 && ke.length <= 500 && !urlDipakai.has(ke)) {
      rencana.ubah.push({ id: tetap.id, dari: tetap.url_video, ke });
      urlDipakai.delete(tetap.url_video);
      urlDipakai.add(ke);
    }
  }
  return rencana;
}

export type HasilPerbaikan = { user_id: number; diperiksa: number; dihapus: number; diubah: number; ditautkan: number; contoh: string[] };

// ------------------------------------------------------------
// PENAHAN LAJU (10 Sep 2026) — pelajaran mahal.
//
// Perbaikan ini menulis satu baris per permintaan. Dijalankan untuk
// ratusan anggota tanpa jeda, ia sempat menembak Supabase belasan
// permintaan per detik selama berjam-jam: CPU instansi 100%, dan
// aplikasi yang dipakai orang sungguhan ikut melambat sampai 20 detik
// PADAHAL databasenya sendiri menganggur. Jadi sekarang tiap tulisan
// diberi jeda, dan antar-anggota jedanya lebih panjang.
//
// Perbaikan ini tidak dikejar waktu — lebih baik selesai lambat
// daripada membuat aplikasi tidak bisa dipakai.
// ------------------------------------------------------------
/** Jeda antar penulisan (ms). */
export const JEDA_TULIS_MS = 120;
/** Jeda antar anggota (ms). */
export const JEDA_ORANG_MS = 1500;
const tunggu = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tarikNapas = () => tunggu(JEDA_TULIS_MS);

export async function perbaikiLaporanUser(userId: number, hari = 30, terapkan = true): Promise<HasilPerbaikan> {
  const db = supabase();
  const sejak = new Date(Date.now() + 7 * 3600_000 - hari * 86_400_000).toISOString().slice(0, 10);
  const [{ data: baris }, { data: akun }] = await Promise.all([
    db.from("laporan_video").select("id, platform, url_video, tvrku_post_id, sumber, dibuat_pada").eq("user_id", userId).gte("tanggal_wib", sejak).order("id", { ascending: true }).limit(3000),
    db.from("akun_tvr_user").select("platform, username").eq("user_id", userId).eq("aktif", true).order("id", { ascending: true }),
  ]);
  const daftar: BarisLaporan[] = (baris ?? []).map((b) => ({
    id: Number(b.id),
    platform: String(b.platform ?? "").toLowerCase(),
    url_video: String(b.url_video ?? ""),
    tvrku_post_id: b.tvrku_post_id == null ? null : Number(b.tvrku_post_id),
    sumber: b.sumber == null ? null : String(b.sumber),
    dibuat_pada: String(b.dibuat_pada ?? ""),
  }));
  const usernamePer: Record<string, string> = {};
  for (const a of akun ?? []) {
    const p = String(a.platform ?? "").toLowerCase();
    if (!usernamePer[p] && a.username) usernamePer[p] = String(a.username);
  }
  const postIds = [...new Set(daftar.map((b) => b.tvrku_post_id).filter((x): x is number => x != null))];
  const pastiPost = new Set<string>();
  if (postIds.length > 0) {
    const { data: posts } = await db.from("tvrku_post").select("id, hasil").in("id", postIds);
    for (const p of posts ?? []) {
      const h = (p.hasil && typeof p.hasil === "object" ? (p.hasil as Record<string, unknown>) : {}) as Record<string, unknown>;
      for (const pf of Array.isArray(h.kpi_pasti) ? (h.kpi_pasti as unknown[]) : []) pastiPost.add(`${p.id}|${String(pf).toLowerCase()}`);
    }
  }
  const rencana = rencanakanPerbaikan(daftar, usernamePer, pastiPost);
  const hasil: HasilPerbaikan = { user_id: userId, diperiksa: daftar.length, dihapus: 0, diubah: 0, ditautkan: 0, contoh: [] };
  for (const h of rencana.hapus.slice(0, 3)) hasil.contoh.push(`hapus #${h.id} ${h.url.slice(0, 70)} (${h.alasan})`);
  for (const u of rencana.ubah.slice(0, 3)) hasil.contoh.push(`ubah #${u.id} → ${u.ke.slice(0, 70)}`);
  if (!terapkan) {
    hasil.dihapus = rencana.hapus.length;
    hasil.diubah = rencana.ubah.length;
    hasil.ditautkan = rencana.tautkan.length;
    return hasil;
  }
  for (let i = 0; i < rencana.hapus.length; i += 100) {
    const potong = rencana.hapus.slice(i, i + 100).map((h) => h.id);
    const { error } = await db.from("laporan_video").delete().in("id", potong);
    if (!error) hasil.dihapus += potong.length;
    await tarikNapas();
  }
  for (const t of rencana.tautkan) {
    const { error } = await db.from("laporan_video").update({ tvrku_post_id: t.tvrku_post_id }).eq("id", t.id);
    if (!error) hasil.ditautkan += 1;
    await tarikNapas();
  }
  for (const u of rencana.ubah) {
    const { error } = await db.from("laporan_video").update({ url_video: u.ke }).eq("id", u.id);
    if (!error) hasil.diubah += 1;
    await tarikNapas();
  }
  return hasil;
}

/** Semua anggota yang punya laporan dalam `hari` terakhir. */
export async function perbaikiLaporanSemua(hari = 30, terapkan = true, batasOrang = 400): Promise<{ orang: number; dihapus: number; diubah: number; ditautkan: number; per_orang: HasilPerbaikan[] }> {
  const db = supabase();
  const sejak = new Date(Date.now() + 7 * 3600_000 - hari * 86_400_000).toISOString().slice(0, 10);
  const { data } = await db.from("laporan_video").select("user_id").gte("tanggal_wib", sejak).limit(20000);
  const ids = [...new Set((data ?? []).map((d) => Number(d.user_id)))].slice(0, batasOrang);
  const per: HasilPerbaikan[] = [];
  for (const uid of ids) {
    per.push(await perbaikiLaporanUser(uid, hari, terapkan));
    if (terapkan) await tunggu(JEDA_ORANG_MS);
  }
  return {
    orang: ids.length,
    dihapus: per.reduce((n, h) => n + h.dihapus, 0),
    diubah: per.reduce((n, h) => n + h.diubah, 0),
    ditautkan: per.reduce((n, h) => n + h.ditautkan, 0),
    per_orang: per.filter((h) => h.dihapus || h.diubah || h.ditautkan),
  };
}

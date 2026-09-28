// ============================================================
// Data untuk Analisis Video (29 Sep 2026) — lihat lib/analisis-video.
//
// Katalog dibaca UTUH (±110 ribu baris, kolom angka saja ±10 MB) per
// 1.000 baris lewat kunci utama (keyset `kode`, bukan offset — offset
// 100.000 memaksa Postgres melangkahi 100 ribu baris tiap halaman), di
// lajur LATAR supaya mengalah pada permintaan pengguna.
//
// Hanya dihitung bila ada yang membuka analisis: hasil disimpan di memori
// proses 30 menit; lewat dari itu pembuka berikutnya langsung mendapat
// hasil lama sementara yang baru disusun di belakang (tanpa menunggu).
// Satu aplikasi = satu proses di VPS, jadi memori cukup (tanpa Redis:
// 10 MB bolak-balik ke Redis lebih mahal daripada membaca ulang).
// ============================================================
import { supabase } from "./supabase";
import { jalankanLatar } from "./penjaga-supabase";
import {
  siapkanBaris,
  susunTampilan,
  type BarisAnalisis,
  type BarisSiap,
  type Rentang,
  type TampilanAnalisis,
} from "./analisis-video";

const KOLOM = "kode, platform, user_id, akun_username, waktu_posting, tayangan, suka, komentar, bagikan, diperbarui_pada";
const HALAMAN = 1000;
const MAKS_HALAMAN = 500;
export const SEGAR_MS = 30 * 60_000;
const MAKS_MEMO = 400;

export type Katalog = { baris: BarisSiap[]; nama: Map<number, string>; dimuat: number };
export type DetailVideo = { judul: string; url: string; thumbnail_url: string; nama_akun: string };
export type TampilanLengkap = TampilanAnalisis & { detail: Record<string, DetailVideo> };

type Gudang = {
  katalog: Katalog | null;
  proses: Promise<Katalog> | null;
  memo: Map<string, Promise<TampilanLengkap>>;
};
const g = ((globalThis as unknown as { __priAnalisisVideo?: Gudang }).__priAnalisisVideo ??= {
  katalog: null,
  proses: null,
  memo: new Map(),
});

type Db = ReturnType<typeof supabase>;

/** Baca seluruh katalog akun tersambung (untuk diuji: db bisa tiruan). */
export async function bacaKatalog(db: Db): Promise<Katalog> {
  const baris: BarisSiap[] = [];
  let setelah = "";
  for (let i = 0; i < MAKS_HALAMAN; i++) {
    let q = db.from("tvr_video_metrik").select(KOLOM).not("user_id", "is", null);
    if (setelah) q = q.gt("kode", setelah);
    const { data, error } = await q.order("kode", { ascending: true }).limit(HALAMAN);
    if (error) throw new Error(`Gagal membaca katalog video: ${error.message}`);
    const b = (data ?? []) as unknown as BarisAnalisis[];
    for (const x of b) baris.push(siapkanBaris(x));
    if (b.length < HALAMAN) break;
    setelah = b[b.length - 1].kode;
  }
  const nama = new Map<number, string>();
  const id = [...new Set(baris.map((b) => b.uid).filter((n) => n > 0))];
  for (let i = 0; i < id.length; i += 300) {
    const { data } = await db.from("app_user").select("id, nama").in("id", id.slice(i, i + 300));
    for (const u of data ?? []) nama.set(Number(u.id), String(u.nama ?? ""));
  }
  return { baris, nama, dimuat: Date.now() };
}

function mulaiMuat(): Promise<Katalog> {
  if (!g.proses) {
    const p = jalankanLatar("analisis-video", () => bacaKatalog(supabase()))
      .then((k) => {
        g.katalog = k;
        g.memo.clear();
        return k;
      })
      .finally(() => {
        g.proses = null;
      });
    // Pemuatan latar yang gagal tidak boleh jadi unhandled rejection.
    p.catch((e: unknown) => console.error("[analisis-video]", e instanceof Error ? e.message : e));
    g.proses = p;
  }
  return g.proses;
}

/**
 * Katalog untuk dianalisis. Segar → langsung. Basi → hasil lama sekarang,
 * yang baru disusun di latar. Belum pernah dimuat → tunggu maksimal
 * `tungguMs`; lewat dari itu `menyusun: true` (layar mencoba lagi).
 */
export async function katalogAnalisis(tungguMs: number): Promise<{ katalog: Katalog | null; menyusun: boolean }> {
  const k = g.katalog;
  if (k && Date.now() - k.dimuat < SEGAR_MS) return { katalog: k, menyusun: false };
  const p = mulaiMuat();
  if (k) return { katalog: k, menyusun: true };
  let habis: ReturnType<typeof setTimeout> | undefined;
  const hasil = await Promise.race([
    p,
    new Promise<null>((r) => {
      habis = setTimeout(() => r(null), tungguMs);
    }),
  ]).finally(() => clearTimeout(habis));
  return hasil ? { katalog: hasil, menyusun: false } : { katalog: null, menyusun: true };
}

async function ambilDetail(kode: string[]): Promise<Record<string, DetailVideo>> {
  const hasil: Record<string, DetailVideo> = {};
  if (kode.length === 0) return hasil;
  const { data } = await supabase()
    .from("tvr_video_metrik")
    .select("kode, judul, url, thumbnail_url, nama_akun")
    .in("kode", kode);
  for (const r of (data ?? []) as { kode: string; judul: string | null; url: string | null; thumbnail_url: string | null; nama_akun: string | null }[]) {
    hasil[r.kode] = {
      judul: String(r.judul ?? ""),
      url: String(r.url ?? ""),
      thumbnail_url: String(r.thumbnail_url ?? ""),
      nama_akun: String(r.nama_akun ?? ""),
    };
  }
  return hasil;
}

/** Satu tampilan (diingat sampai katalog berikutnya dimuat). */
export function tampilanAnalisis(
  katalog: Katalog,
  o: { rentang: Rentang; platform: string; akun: string },
): Promise<TampilanLengkap> {
  const kunci = `${katalog.dimuat}|${o.rentang}|${o.platform}|${o.akun}`;
  const ada = g.memo.get(kunci);
  if (ada) return ada;
  const p = (async () => {
    const t = susunTampilan(katalog.baris, { ...o, kiniMs: Date.now() });
    return { ...t, detail: await ambilDetail(t.video_teratas.map((v) => v.kode)) };
  })();
  // Gagal → jangan diingat (dicoba lagi pada permintaan berikutnya).
  p.catch(() => g.memo.delete(kunci));
  if (g.memo.size >= MAKS_MEMO) g.memo.clear();
  g.memo.set(kunci, p);
  return p;
}

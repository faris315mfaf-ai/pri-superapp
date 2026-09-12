// ============================================================
// INSIGHT PER KATEGORI (12 Sep 2026)
//
// Pertanyaannya: "video bertema BPJS, seluruhnya, dapat berapa
// tayangan?" Jawabannya disusun dari dua hal yang sudah ada:
//
//   • laporan_video — tiap video yang dilaporkan anggota, beserta
//     KATEGORI-nya (kolom keyword). Inilah daftar "video mana saja".
//   • tvr_video_metrik — angka per video (tayangan, suka, komentar,
//     bagikan) yang disapu berkala dari TikHub. Inilah "berapa angkanya".
//
// Keduanya dicocokkan lewat ID VIDEO, bukan teks URL. URL yang sama bisa
// ditulis puluhan cara (vt.tiktok.com/…, /t/…, /@akun/video/…, dengan
// atau tanpa parameter pelacak); ID-nya cuma satu.
//
// Batas yang harus jujur disampaikan: angka per video hanya ada untuk
// TikTok & Instagram — dua platform yang disapu TikHub. Video di platform
// lain tetap DIHITUNG sebagai laporan, tapi tanpa angka.
//
// Berkas ini murni: tanpa database, tanpa jaringan — supaya bisa diuji.
// ============================================================
import { idVideo } from "@/lib/tautan-video";

export type MetrikVideoKategori = {
  kode: string;
  platform: string;
  judul: string;
  url: string;
  thumbnail_url: string;
  nama_akun: string;
  akun_username: string;
  waktu_posting: string | null;
  tayangan: number;
  suka: number;
  komentar: number;
  bagikan: number;
};

export type LaporanKategori = {
  id: string;
  user_id: string;
  platform: string;
  url_video: string;
  tanggal_wib: string;
};

/** Platform yang angkanya benar-benar tersedia di tvr_video_metrik. */
export const PLATFORM_TERUKUR = ["tiktok", "instagram"] as const;

/**
 * Kode baris tvr_video_metrik untuk satu laporan — mengikuti bentuk yang
 * ditulis penyapu TikHub (lib/tikhub.ts): tt_<aweme_id> / ig_<shortcode>.
 * null = platform ini memang tidak punya angka per video.
 */
export function kodeMetrik(platform: string, url: string): string | null {
  const p = platform.trim().toLowerCase();
  if (p !== "tiktok" && p !== "instagram") return null;
  const id = idVideo(p, url);
  if (!id) return null;
  return p === "tiktok" ? `tt_${id}` : `ig_${id}`;
}

export type VideoKategori = {
  kunci: string;
  platform: string;
  url: string;
  judul: string;
  thumbnail_url: string;
  akun: string;
  pelapor: string;
  tanggal_wib: string;
  waktu_posting: string | null;
  /** null = belum ada angka untuk video ini. */
  metrik: { tayangan: number; suka: number; komentar: number; bagikan: number } | null;
};

export type RingkasanKategori = {
  jumlah_video: number;
  jumlah_terukur: number;
  per_platform: Record<string, { video: number; terukur: number }>;
  total: { tayangan: number; suka: number; komentar: number; bagikan: number };
};

/**
 * Menyatukan laporan + metrik menjadi daftar video (satu baris per video,
 * bukan per laporan — dua anggota yang melaporkan video yang sama tidak
 * menggandakan angkanya) dan ringkasan totalnya.
 */
export function susunInsightKategori(
  laporan: LaporanKategori[],
  metrik: Map<string, MetrikVideoKategori>,
  namaPelapor: Map<string, string>,
): { video: VideoKategori[]; ringkasan: RingkasanKategori } {
  const perKunci = new Map<string, VideoKategori>();

  for (const l of laporan) {
    const platform = l.platform.trim().toLowerCase();
    const kode = kodeMetrik(platform, l.url_video);
    // Video tanpa ID yang dikenal tetap dihitung lewat URL bersihnya.
    const kunci = kode ?? `${platform}:${l.url_video.trim().toLowerCase()}`;
    if (perKunci.has(kunci)) continue;

    const m = kode ? metrik.get(kode) : undefined;
    perKunci.set(kunci, {
      kunci,
      platform,
      url: m?.url || l.url_video,
      judul: m?.judul ?? "",
      thumbnail_url: m?.thumbnail_url ?? "",
      akun: m ? m.nama_akun || m.akun_username : "",
      pelapor: namaPelapor.get(String(l.user_id)) ?? "",
      tanggal_wib: l.tanggal_wib,
      waktu_posting: m?.waktu_posting ?? null,
      metrik: m
        ? { tayangan: m.tayangan, suka: m.suka, komentar: m.komentar, bagikan: m.bagikan }
        : null,
    });
  }

  const video = [...perKunci.values()].sort((a, b) => {
    // Yang punya angka di depan, terbesar dulu; sisanya urut laporan terbaru.
    if (a.metrik && b.metrik) return b.metrik.tayangan - a.metrik.tayangan;
    if (a.metrik) return -1;
    if (b.metrik) return 1;
    return b.tanggal_wib.localeCompare(a.tanggal_wib);
  });

  const ringkasan: RingkasanKategori = {
    jumlah_video: video.length,
    jumlah_terukur: 0,
    per_platform: {},
    total: { tayangan: 0, suka: 0, komentar: 0, bagikan: 0 },
  };
  for (const v of video) {
    const pp = (ringkasan.per_platform[v.platform] ??= { video: 0, terukur: 0 });
    pp.video += 1;
    if (v.metrik) {
      pp.terukur += 1;
      ringkasan.jumlah_terukur += 1;
      ringkasan.total.tayangan += v.metrik.tayangan;
      ringkasan.total.suka += v.metrik.suka;
      ringkasan.total.komentar += v.metrik.komentar;
      ringkasan.total.bagikan += v.metrik.bagikan;
    }
  }
  return { video, ringkasan };
}

/** Pola LIKE/ILIKE PostgREST: % dan _ harus di-escape supaya dicari apa adanya. */
export function polaPersis(teks: string): string {
  return teks.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ============================================================
// INSIGHT PER KATEGORI (12–13 Sep 2026)
//
// Pertanyaannya: "video bertema BPJS, seluruhnya, dapat berapa
// tayangan?" Jawabannya disusun dari:
//
//   • laporan_video      — video yang dilaporkan anggota (kolom keyword
//                          = kategori).
//   • tvr_kategori_link  — video yang ditambahkan langsung ke kategori
//                          oleh master/TV Rakyat Nasional (batch).
//   • tvr_video_metrik   — angka per video: sapuan TikHub (TikTok &
//                          Instagram) dan tarikan Chocodata (YouTube,
//                          Facebook, X, dan dua tadi bila diminta).
//
// Semuanya dicocokkan lewat KODE VIDEO = awalan platform + ID dari URL,
// bukan teks URL. Satu video bisa ditulis puluhan cara; ID-nya cuma satu.
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
  favorit: number;
  durasi_detik: number | null;
  sumber: string;
  diperbarui_pada: string | null;
};

export type LaporanKategori = {
  id: string;
  user_id: string;
  platform: string;
  url_video: string;
  tanggal_wib: string;
  /** "laporan" (anggota) atau "kategori" (ditambahkan langsung ke kategori). */
  asal?: "laporan" | "kategori";
};

/** Awalan kode per platform. tt_/ig_ mengikuti penyapu TikHub (lib/tikhub.ts). */
export const AWALAN_KODE: Record<string, string> = {
  tiktok: "tt_",
  instagram: "ig_",
  youtube: "yt_",
  facebook: "fb_",
  twitter: "x_",
  threads: "th_",
  bilibili: "bl_",
};

/** Platform yang angkanya bisa didapat (TikHub dan/atau Chocodata). */
export const PLATFORM_TERUKUR = ["tiktok", "instagram", "youtube", "facebook", "twitter"] as const;

/**
 * Kode baris tvr_video_metrik untuk satu tautan: awalan platform + ID
 * video. null = platform tidak dikenal atau URL tidak memuat ID.
 */
export function kodeMetrik(platform: string, url: string): string | null {
  const p = platform.trim().toLowerCase() === "x" ? "twitter" : platform.trim().toLowerCase();
  const awalan = AWALAN_KODE[p];
  if (!awalan) return null;
  const id = idVideo(p, url);
  return id ? `${awalan}${id}` : null;
}

/** Tebak platform dari nama host URL; "" bila tidak dikenal. */
export function platformDariUrl(url: string): string {
  let host = "";
  try {
    host = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`).hostname.toLowerCase();
  } catch {
    return "";
  }
  if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return "youtube";
  if (/(^|\.)(facebook\.com|fb\.watch|fb\.com)$/.test(host)) return "facebook";
  if (/(^|\.)threads\.(net|com)$/.test(host)) return "threads";
  if (/(^|\.)(twitter\.com|x\.com)$/.test(host)) return "twitter";
  if (/(^|\.)(bilibili\.com|b23\.tv)$/.test(host)) return "bilibili";
  return "";
}

export type VideoKategori = {
  kunci: string;
  platform: string;
  url: string;
  judul: string;
  thumbnail_url: string;
  akun: string;
  pelapor: string;
  asal: "laporan" | "kategori";
  tanggal_wib: string;
  waktu_posting: string | null;
  /** null = belum ada angka untuk video ini. */
  metrik: {
    tayangan: number;
    suka: number;
    komentar: number;
    bagikan: number;
    favorit: number;
    durasi_detik: number | null;
    sumber: string;
    diperbarui_pada: string | null;
  } | null;
};

export type RingkasanKategori = {
  jumlah_video: number;
  jumlah_terukur: number;
  per_platform: Record<string, { video: number; terukur: number; tayangan: number }>;
  total: { tayangan: number; suka: number; komentar: number; bagikan: number; favorit: number };
  /** Total tayangan ÷ jumlah video terukur — "rata-rata penayangan" per video. */
  rata_tayangan: number | null;
};

/**
 * Menyatukan tautan + metrik menjadi daftar video (satu baris per video,
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
    const platform = l.platform.trim().toLowerCase() === "x" ? "twitter" : l.platform.trim().toLowerCase();
    const kode = kodeMetrik(platform, l.url_video);
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
      asal: l.asal ?? "laporan",
      tanggal_wib: l.tanggal_wib,
      waktu_posting: m?.waktu_posting ?? null,
      metrik: m
        ? {
            tayangan: m.tayangan,
            suka: m.suka,
            komentar: m.komentar,
            bagikan: m.bagikan,
            favorit: m.favorit,
            durasi_detik: m.durasi_detik,
            sumber: m.sumber,
            diperbarui_pada: m.diperbarui_pada,
          }
        : null,
    });
  }

  const video = [...perKunci.values()].sort((a, b) => {
    if (a.metrik && b.metrik) return b.metrik.tayangan - a.metrik.tayangan;
    if (a.metrik) return -1;
    if (b.metrik) return 1;
    return b.tanggal_wib.localeCompare(a.tanggal_wib);
  });

  const ringkasan: RingkasanKategori = {
    jumlah_video: video.length,
    jumlah_terukur: 0,
    per_platform: {},
    total: { tayangan: 0, suka: 0, komentar: 0, bagikan: 0, favorit: 0 },
    rata_tayangan: null,
  };
  for (const v of video) {
    const pp = (ringkasan.per_platform[v.platform] ??= { video: 0, terukur: 0, tayangan: 0 });
    pp.video += 1;
    if (v.metrik) {
      pp.terukur += 1;
      pp.tayangan += v.metrik.tayangan;
      ringkasan.jumlah_terukur += 1;
      ringkasan.total.tayangan += v.metrik.tayangan;
      ringkasan.total.suka += v.metrik.suka;
      ringkasan.total.komentar += v.metrik.komentar;
      ringkasan.total.bagikan += v.metrik.bagikan;
      ringkasan.total.favorit += v.metrik.favorit;
    }
  }
  ringkasan.rata_tayangan =
    ringkasan.jumlah_terukur > 0 ? Math.round(ringkasan.total.tayangan / ringkasan.jumlah_terukur) : null;
  return { video, ringkasan };
}

/** Pola LIKE/ILIKE PostgREST: % dan _ harus di-escape supaya dicari apa adanya. */
export function polaPersis(teks: string): string {
  return teks.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Pecah teks batch (satu link per baris) menjadi tautan yang sah untuk
 * dimasukkan ke kategori. Baris kosong/komentar dilewati; yang tidak
 * dikenal platformnya atau tidak memuat ID video dilaporkan, bukan
 * dibuang diam-diam.
 */
export function uraiBatchLink(teks: string): {
  sah: { platform: string; url: string; kode: string }[];
  ditolak: { baris: string; alasan: string }[];
} {
  const sah: { platform: string; url: string; kode: string }[] = [];
  const ditolak: { baris: string; alasan: string }[] = [];
  const terlihat = new Set<string>();
  for (const mentah of teks.split(/\r?\n/)) {
    const baris = mentah.trim();
    if (!baris || baris.startsWith("#")) continue;
    // Boleh ada teks lain di baris yang sama — ambil URL pertamanya.
    const m = /https?:\/\/[^\s<>"']+/i.exec(baris) ?? /[a-z0-9.-]+\.[a-z]{2,}\/[^\s<>"']+/i.exec(baris);
    const url = m ? (m[0].startsWith("http") ? m[0] : `https://${m[0]}`) : "";
    if (!url) {
      ditolak.push({ baris, alasan: "bukan tautan" });
      continue;
    }
    const platform = platformDariUrl(url);
    if (!platform) {
      ditolak.push({ baris, alasan: "platform tidak dikenal" });
      continue;
    }
    const kode = kodeMetrik(platform, url);
    if (!kode) {
      ditolak.push({ baris, alasan: `tautan ${platform} tidak memuat ID video` });
      continue;
    }
    if (terlihat.has(kode)) continue; // ganda di dalam batch yang sama
    terlihat.add(kode);
    sah.push({ platform, url, kode });
  }
  return { sah, ditolak };
}

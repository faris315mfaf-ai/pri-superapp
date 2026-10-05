// ============================================================
// Blur Watermark (uji coba, 5 Okt 2026) — TVR Saya.
//
// Menyamarkan area watermark yang DITANDAI pengguna (maks 3 kotak, berlaku
// sepanjang video) dengan ffmpeg saja — tanpa AI, beberapa detik per video.
// Penghapus watermark AI (video-subtitle-remover) sudah diuji di VPS mesin:
// ±35 menit per 10 detik video tanpa GPU, jadi tidak dipakai.
//
// Tiga efek:
//   blur   — diburamkan kuat (gblur), aman di semua latar
//   mosaik — kotak-kotak piksel seperti sensor TV
//   halus  — delogo: diisi dari warna tepi sekitarnya; paling samar di
//            latar polos, bisa terlihat "bercak" di latar ramai
//
// Kotak dikirim RELATIF (0..1) terhadap gambar pratinjau, yang dibuat ffmpeg
// dari frame yang sudah diputar sesuai rotasi video HP — jadi dipetakan ke
// ukuran TAMPIL video (lebar/tinggi setelah rotasi), bukan ukuran mentahnya.
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { FFMPEG_BIN, FFPROBE_BIN } from "./konfig";
import { GalatVideo } from "./jenis";
import { jalankan, kodekAudio } from "./kompres";

export const EFEK_BLUR = ["blur", "mosaik", "halus"] as const;
export type EfekBlur = (typeof EFEK_BLUR)[number];
export const MAKS_KOTAK = 3;

export type KotakRelatif = { x: number; y: number; w: number; h: number };
type KotakPiksel = { x: number; y: number; w: number; h: number };

const teks = (nama: string, bawaan: string) => String(process.env[nama] ?? "").trim() || bawaan;
const UTAS = teks("KOMPRES_THREADS", "4");

type Opsi = {
  progress: (persen: number) => Promise<void>;
  batal: () => Promise<boolean>;
};

const tanpaBatal = async () => false;

/** Lebar & tinggi TAMPIL video (rotasi 90/270 menukar keduanya). */
export async function ukuranTampil(berkas: string): Promise<{ lebar: number; tinggi: number }> {
  const h = await jalankan(
    FFPROBE_BIN,
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:stream_side_data=rotation", "-of", "json", berkas],
    { batal: tanpaBatal },
  );
  let data: { streams?: { width?: number; height?: number; side_data_list?: { rotation?: number }[] }[] } = {};
  try {
    data = JSON.parse(h.keluaran);
  } catch {
    // ditangani di bawah
  }
  const s = data.streams?.[0];
  const lebar = Number(s?.width ?? 0);
  const tinggi = Number(s?.height ?? 0);
  if (!lebar || !tinggi) throw new GalatVideo("Ukuran video tidak terbaca.");
  const rotasi = Math.abs(Number(s?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0)) % 180;
  return rotasi === 90 ? { lebar: tinggi, tinggi: lebar } : { lebar, tinggi };
}

/** Gambar pratinjau (JPEG, lebar ≤ 540) dari frame di tengah awal video. */
export async function buatPratinjau(masukan: string, keluaran: string, durasi: number): Promise<void> {
  const detik = Math.max(0, Math.min(1, durasi / 2));
  const h = await jalankan(
    FFMPEG_BIN,
    ["-hide_banner", "-nostdin", "-y", "-ss", detik.toFixed(2), "-i", masukan, "-frames:v", "1", "-vf", "scale='min(540,iw)':-2", "-q:v", "4", keluaran],
    { batal: tanpaBatal },
  );
  if (h.kode !== 0 || !fs.existsSync(keluaran)) {
    console.error("pratinjau blur gagal:", h.keluaran.slice(-800));
    throw new GalatVideo("Gambar pratinjau video gagal dibuat.");
  }
}

const genap = (n: number) => Math.max(0, Math.floor(n / 2) * 2);

/** Kotak relatif → piksel genap, minimal 16 px, tetap di dalam bingkai. */
export function kePiksel(k: KotakRelatif, lebar: number, tinggi: number): KotakPiksel {
  const w = Math.min(genap(lebar), Math.max(16, genap(k.w * lebar)));
  const h = Math.min(genap(tinggi), Math.max(16, genap(k.h * tinggi)));
  const x = Math.min(genap(lebar - w), genap(k.x * lebar));
  const y = Math.min(genap(tinggi - h), genap(k.y * tinggi));
  return { x, y, w, h };
}

/** Rangkaian filter ffmpeg untuk efek & kotak ini; keluaran berlabel [v]. */
export function saringBlur(efek: EfekBlur, kotak: KotakPiksel[], lebar: number, tinggi: number): string {
  if (efek === "halus") {
    // delogo menolak area yang menyentuh tepi bingkai: sisakan 1 px.
    const rantai = kotak.map((k) => {
      const x = Math.max(1, k.x);
      const y = Math.max(1, k.y);
      const w = Math.max(4, Math.min(k.w, lebar - 1 - x));
      const h = Math.max(4, Math.min(k.h, tinggi - 1 - y));
      return `delogo=x=${x}:y=${y}:w=${w}:h=${h}`;
    });
    return `[0:v]${rantai.join(",")},format=yuv420p[v]`;
  }
  const n = kotak.length;
  const bagian = [`[0:v]split=${n + 1}[s0]${kotak.map((_, i) => `[s${i + 1}]`).join("")}`];
  kotak.forEach((k, i) => {
    const sisi = Math.min(k.w, k.h);
    const olah =
      efek === "blur"
        ? `gblur=sigma=${Math.max(6, Math.min(40, Math.round(sisi / 4)))}:steps=3`
        : (() => {
            const blok = Math.max(8, Math.min(48, Math.round(sisi / 6)));
            return `scale=${Math.max(1, Math.floor(k.w / blok))}:${Math.max(1, Math.floor(k.h / blok))}:flags=area,scale=${k.w}:${k.h}:flags=neighbor`;
          })();
    bagian.push(`[s${i + 1}]crop=${k.w}:${k.h}:${k.x}:${k.y},${olah}[b${i + 1}]`);
  });
  let dasar = "s0";
  kotak.forEach((k, i) => {
    const hasil = i === n - 1 ? "o" : `o${i + 1}`;
    bagian.push(`[${dasar}][b${i + 1}]overlay=${k.x}:${k.y}[${hasil}]`);
    dasar = hasil;
  });
  bagian.push("[o]format=yuv420p[v]");
  return bagian.join(";");
}

/**
 * Samarkan `kotak` di `masukan` → `<folder>/output.mp4` (H.264 resolusi asli,
 * audio disalin bila AAC). Melempar Dibatalkan / GalatVideo.
 */
export async function blurWatermark(
  masukan: string,
  folder: string,
  efek: EfekBlur,
  kotak: KotakRelatif[],
  durasi: number,
  opsi: Opsi,
): Promise<{ berkas: string; size: number }> {
  const { lebar, tinggi } = await ukuranTampil(masukan);
  const piksel = kotak.slice(0, MAKS_KOTAK).map((k) => kePiksel(k, lebar, tinggi));
  if (piksel.length === 0) throw new GalatVideo("Tandai minimal satu area watermark.");
  const keluaran = path.join(folder, "output.mp4");
  const audio = await kodekAudio(masukan, opsi.batal);
  const argAudio = !audio ? ["-an"] : audio === "aac" ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "160k"];
  await opsi.progress(3);
  const h = await jalankan(
    FFMPEG_BIN,
    [
      "-hide_banner", "-nostdin", "-y", "-i", masukan,
      "-filter_complex", saringBlur(efek, piksel, lebar, tinggi),
      "-map", "[v]", "-map", "0:a:0?",
      "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-threads", UTAS,
      ...argAudio,
      "-movflags", "+faststart",
      "-progress", "pipe:1", "-nostats",
      keluaran,
    ],
    {
      batal: opsi.batal,
      baris: (b) => {
        const m = /^out_time_ms=(\d+)/.exec(b);
        if (m && durasi > 0) void opsi.progress(Math.min(99, Math.round(3 + (Number(m[1]) / 1e6 / durasi) * 96)));
      },
    },
  );
  if (h.kode !== 0 || !fs.existsSync(keluaran)) {
    console.error("ffmpeg blur gagal:", h.keluaran.slice(-1500));
    throw new GalatVideo("Video gagal diproses.");
  }
  return { berkas: keluaran, size: fs.statSync(keluaran).size };
}

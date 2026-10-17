// AMBIL KE STOK (17 Okt 2026): video dari Galeri Konten (tautan postingan
// Instagram/TikTok/YouTube/Facebook/X/Threads) masuk Stok Video anggota TANPA
// diedit, supaya bisa langsung diunggah ke akun-akunnya lewat alur Stok.
//
// Worker mengunduh lewat downloadSource (penjaga SSRF, daftar situs, batas
// ukuran, penahan 429), lalu modul ini menyiapkan output.mp4 yang aman diunggah
// ke sosmed: H.264 + AAC dalam MP4 (faststart). Video yang SUDAH H.264 yuv420p
// hanya dibungkus ulang (-c:v copy) — tidak di-encode ulang, mutu & waktu utuh.
import fs from "node:fs";
import path from "node:path";
import { Dibatalkan, GalatVideo } from "./jenis";
import { FFMPEG_BIN, FFPROBE_BIN, RENDER_TIMEOUT_SECONDS, VIDEO_THREADS } from "./konfig";
import { jalankan, kodekAudio } from "./kompres";
import { MAX_SISI_VIDEO } from "./media";

export type OpsiAmbil = {
  progress: (p: number) => Promise<void>;
  batal: () => Promise<boolean>;
  log?: (teks: string) => Promise<void>;
};

export type HasilAmbil = { berkas: string; size: number; disalin: boolean };

type InfoKodek = { kodek: string; pix: string; lebar: number; tinggi: number };

/** Kodek & ukuran jalur video pertama; lebar/tinggi 0 = tidak ada gambar. */
async function infoVideo(berkas: string, batal: () => Promise<boolean>): Promise<InfoKodek> {
  const h = await jalankan(
    FFPROBE_BIN,
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,pix_fmt,width,height", "-of", "json", berkas],
    { batal },
  );
  if (h.kode !== 0) throw new GalatVideo("Berkas dari tautan ini bukan video yang bisa dibaca.");
  let data: { streams?: Record<string, unknown>[] };
  try {
    // stdout & stderr digabung jalankan(): ambil bagian JSON-nya saja.
    const awal = h.keluaran.indexOf("{");
    const akhir = h.keluaran.lastIndexOf("}");
    data = awal >= 0 && akhir > awal ? JSON.parse(h.keluaran.slice(awal, akhir + 1)) : {};
  } catch {
    throw new GalatVideo("Berkas dari tautan ini bukan video yang bisa dibaca.");
  }
  const v = data.streams?.[0] ?? {};
  return {
    kodek: String(v.codec_name ?? "").toLowerCase(),
    pix: String(v.pix_fmt ?? "").toLowerCase(),
    lebar: Number(v.width) || 0,
    tinggi: Number(v.height) || 0,
  };
}

/** Video yang cukup dibungkus ulang: H.264 8-bit 4:2:0 (diterima semua platform). */
export function bisaDisalin(info: Pick<InfoKodek, "kodek" | "pix">): boolean {
  return info.kodek === "h264" && (info.pix === "yuv420p" || info.pix === "yuvj420p");
}

/**
 * Sisi terpanjang dibatasi MAX_SISI_VIDEO dan ukuran dibulatkan genap (libx264
 * yuv420p menolak ukuran ganjil). Koma di dalam tanda kutip aman di filtergraph.
 */
const SKALA =
  `scale='if(gte(iw,ih),trunc(min(iw,${MAX_SISI_VIDEO})/2)*2,-2)':` + `'if(gte(iw,ih),-2,trunc(min(ih,${MAX_SISI_VIDEO})/2)*2)'`;

/**
 * Siapkan `<folder>/output.mp4` dari video unduhan `sumber`. Melempar
 * Dibatalkan bila dihentikan, GalatVideo bila bukan video / gagal diproses.
 */
export async function siapkanVideoStok(sumber: string, folder: string, durasi: number, opsi: OpsiAmbil): Promise<HasilAmbil> {
  const batasWaktu = Date.now() + RENDER_TIMEOUT_SECONDS * 1000;
  let habis = false;
  const batal = async () => {
    if (Date.now() > batasWaktu) {
      habis = true;
      return true;
    }
    return opsi.batal();
  };
  const info = await infoVideo(sumber, batal);
  if (!info.lebar || !info.tinggi) throw new GalatVideo("Tautan ini tidak berisi video (tidak ada gambarnya).");
  const audio = await kodekAudio(sumber, batal);
  const argAudio = !audio ? ["-an"] : audio === "aac" ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "160k"];
  const keluaran = path.join(folder, "output.mp4");

  const jalan = async (salin: boolean) => {
    const argVideo = salin
      ? ["-c:v", "copy"]
      : ["-vf", SKALA, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-threads", VIDEO_THREADS];
    return jalankan(
      FFMPEG_BIN,
      [
        "-hide_banner", "-nostdin", "-y", "-i", sumber,
        "-map", "0:v:0", "-map", "0:a:0?",
        ...argVideo, ...argAudio,
        "-movflags", "+faststart",
        "-progress", "pipe:1", "-nostats",
        "-f", "mp4", keluaran,
      ],
      {
        batal,
        baris: (b) => {
          const m = /^out_time_ms=(\d+)/.exec(b);
          if (m && durasi > 0) void opsi.progress(Math.min(99, Math.round(50 + (Number(m[1]) / 1e6 / durasi) * 49)));
        },
      },
    );
  };

  try {
    let salin = bisaDisalin(info);
    if (opsi.log) await opsi.log(salin ? "Video sudah H.264 — dibungkus ulang tanpa encode." : `Mengubah video (${info.kodek || "?"}) ke H.264…`);
    let h = await jalan(salin);
    if (salin && (h.kode !== 0 || !fs.existsSync(keluaran))) {
      // Bungkus ulang gagal (wadah aneh / stempel waktu rusak): encode penuh sekali.
      console.warn(`Bungkus ulang ${sumber} gagal, encode ulang:`, h.keluaran.slice(-500));
      salin = false;
      if (opsi.log) await opsi.log("Bungkus ulang gagal — video di-encode ulang ke H.264…");
      h = await jalan(false);
    }
    if (h.kode !== 0 || !fs.existsSync(keluaran) || fs.statSync(keluaran).size === 0) {
      console.error("ffmpeg ambil-ke-stok gagal:", h.keluaran.slice(-1500));
      throw new GalatVideo("Video dari tautan ini gagal diproses.");
    }
    return { berkas: keluaran, size: fs.statSync(keluaran).size, disalin: salin };
  } catch (e) {
    try {
      fs.rmSync(keluaran, { force: true });
    } catch {
      // tidak kritis
    }
    if (e instanceof Dibatalkan && habis) throw new GalatVideo("Pemrosesan video melewati batas waktu.");
    throw e;
  }
}

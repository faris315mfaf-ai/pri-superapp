// ============================================================
// Video contoh untuk VIDEO PRATINJAU Studio Template (16 Okt 2026).
// Dibuat sekali oleh ffmpeg (pola warna bergerak + nada pelan, 15 detik)
// lalu disimpan di disk media: tegak 9:16 dan lebar 16:9. Tanpa unduhan.
// ============================================================
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { FFMPEG_BIN, MEDIA_DIR } from "./konfig";
import { GalatVideo } from "./jenis";

const jalankan = promisify(execFile);
export const DURASI_CONTOH = 15;
export type JenisContoh = "tegak" | "lebar";

const ukuran: Record<JenisContoh, string> = { tegak: "720x1280", lebar: "1280x720" };
let proses: Partial<Record<JenisContoh, Promise<string>>> = {};

/** Jalur video contoh (dibuat bila belum ada). */
export function siapkanContoh(jenis: JenisContoh): Promise<string> {
  const folder = path.join(MEDIA_DIR, "contoh");
  const berkas = path.join(folder, `contoh-${jenis}-v1.mp4`);
  if (fs.existsSync(berkas) && fs.statSync(berkas).size > 1000) return Promise.resolve(berkas);
  const ada = proses[jenis];
  if (ada) return ada;
  const kerja = (async () => {
    fs.mkdirSync(folder, { recursive: true });
    const sementara = `${berkas}.${process.pid}.mp4`;
    try {
      await jalankan(
        FFMPEG_BIN,
        [
          "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
          "-f", "lavfi", "-i", `testsrc2=size=${ukuran[jenis]}:rate=30:duration=${DURASI_CONTOH}`,
          "-f", "lavfi", "-i", `sine=frequency=330:sample_rate=44100:duration=${DURASI_CONTOH}`,
          "-filter:a", "volume=0.15",
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-b:a", "64k", "-shortest", "-movflags", "+faststart", sementara,
        ],
        { timeout: 120_000 },
      );
      fs.renameSync(sementara, berkas);
      return berkas;
    } catch (e) {
      fs.rmSync(sementara, { force: true });
      console.error("video contoh gagal dibuat:", e instanceof Error ? e.message : e);
      throw new GalatVideo("Video contoh gagal disiapkan. Coba lagi atau pakai video dari Stok.");
    } finally {
      proses = { ...proses, [jenis]: undefined };
    }
  })();
  proses = { ...proses, [jenis]: kerja };
  return kerja;
}

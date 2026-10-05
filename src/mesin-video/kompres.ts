// ============================================================
// Kompres video (uji coba, 5 Okt 2026): sekecil mungkin TANPA penurunan
// kualitas yang terlihat — diukur, bukan ditebak.
//
//   1. ab-av1 crf-search mencari CRF x264 terbesar (berkas terkecil) yang
//      masih memenuhi target VMAF (skor kualitas Netflix: Tinggi 96,
//      Seimbang 94, Hemat 92). ab-av1 butuh ffmpeg ber-libvmaf: build statis
//      di /opt/vmaf/bin (vps/autoedit-ts/Dockerfile), bukan ffmpeg apt.
//   2. Encode akhir H.264 (format paling aman untuk semua sosmed) dengan
//      ffmpeg biasa, resolusi & fps ASLI, audio AAC disalin apa adanya.
//   3. Hasil tidak lebih kecil → video asli dipertahankan (sudah efisien).
// ============================================================
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { FFMPEG_BIN, FFPROBE_BIN } from "./konfig";
import { Dibatalkan, GalatVideo } from "./jenis";

export const TARGET_VMAF = { tinggi: 96, seimbang: 94, hemat: 92 } as const;
export type MutuKompres = keyof typeof TARGET_VMAF;

export function mutuSah(m: unknown): MutuKompres {
  return m === "tinggi" || m === "hemat" ? m : "seimbang";
}

const teks = (nama: string, bawaan: string) => String(process.env[nama] ?? "").trim() || bawaan;
const AB_AV1_BIN = teks("AB_AV1_BIN", "ab-av1");
/** Folder ffmpeg/ffprobe ber-libvmaf untuk ab-av1. */
const VMAF_BIN_DIR = teks("VMAF_BIN_DIR", "/opt/vmaf/bin");
const PRESET = teks("KOMPRES_PRESET", "fast");
const UTAS = teks("KOMPRES_THREADS", "4");

export type HasilKompres = {
  berkas: string;
  size_awal: number;
  size: number;
  crf: number | null;
  vmaf: number | null;
  /** false = tidak bisa diperkecil tanpa turun kualitas; video asli dipakai. */
  diperkecil: boolean;
};

type Opsi = {
  progress: (persen: number) => Promise<void>;
  log: (teks: string) => Promise<void>;
  batal: () => Promise<boolean>;
};

/** Jalankan proses; tiap baris stderr/stdout ke `baris`; bisa dihentikan lewat `batal`. */
function jalankan(
  bin: string,
  args: string[],
  opsi: { env?: NodeJS.ProcessEnv; cwd?: string; baris?: (b: string) => void; batal: () => Promise<boolean> },
): Promise<{ kode: number; keluaran: string }> {
  return new Promise((ok, gagal) => {
    const p = spawn(bin, args, { env: opsi.env ?? process.env, cwd: opsi.cwd, stdio: ["ignore", "pipe", "pipe"] });
    let keluaran = "";
    let sisa = "";
    const terima = (b: Buffer) => {
      const t = b.toString("utf8");
      keluaran = (keluaran + t).slice(-20_000);
      sisa += t;
      const pecah = sisa.split(/\r?\n|\r/);
      sisa = pecah.pop() ?? "";
      for (const l of pecah) if (l.trim()) opsi.baris?.(l);
    };
    p.stdout.on("data", terima);
    p.stderr.on("data", terima);
    let dihentikan = false;
    const jaga = setInterval(() => {
      void opsi.batal().then((ya) => {
        if (ya && !dihentikan) {
          dihentikan = true;
          p.kill("SIGKILL");
        }
      });
    }, 2000);
    p.on("error", (e) => {
      clearInterval(jaga);
      gagal(e);
    });
    p.on("close", (kode) => {
      clearInterval(jaga);
      if (dihentikan) gagal(new Dibatalkan("Kompres dihentikan."));
      else ok({ kode: kode ?? 1, keluaran });
    });
  });
}

async function kodekAudio(berkas: string, batal: () => Promise<boolean>): Promise<string> {
  const h = await jalankan(
    FFPROBE_BIN,
    ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name", "-of", "csv=p=0", berkas],
    { batal },
  );
  return h.keluaran.trim().split(/\s+/)[0] ?? "";
}

/**
 * Kompres `masukan` ke `<folder>/output.mp4`. Melempar Dibatalkan bila
 * dihentikan, GalatVideo bila videonya tidak bisa diproses.
 */
export async function kompresVideo(
  masukan: string,
  folder: string,
  mutu: MutuKompres,
  durasiDetik: number,
  opsi: Opsi,
): Promise<HasilKompres> {
  const sizeAwal = fs.statSync(masukan).size;
  const keluaran = path.join(folder, "output.mp4");
  const kerja = path.join(folder, "kerja");
  fs.mkdirSync(kerja, { recursive: true });
  const target = TARGET_VMAF[mutu];

  // ---- 1. Cari CRF (5..45%) ----
  await opsi.progress(5);
  await opsi.log(`Mencari setelan terbaik untuk kualitas VMAF ${target}…`);
  let sampel = 0;
  const cari = await jalankan(
    AB_AV1_BIN,
    [
      "crf-search", "-i", masukan,
      "--encoder", "libx264", "--preset", PRESET,
      "--min-vmaf", String(target),
      "--max-encoded-percent", "95",
      "--sample-duration", "4s",
      "--temp-dir", kerja,
      "--enc", `x264-params=threads=${UTAS}`,
    ],
    {
      env: { ...process.env, PATH: `${VMAF_BIN_DIR}:${process.env.PATH ?? ""}` },
      cwd: kerja,
      batal: opsi.batal,
      baris: (b) => {
        if (/sample \d+\/\d+ crf [\d.]+ VMAF/.test(b)) {
          sampel++;
          void opsi.progress(Math.min(45, 5 + sampel * 4));
        }
      },
    },
  );
  const temu = [...cari.keluaran.matchAll(/crf ([\d.]+) VMAF ([\d.]+) predicted/g)].pop();
  if (cari.kode !== 0 || !temu) {
    // Tak ada CRF yang lebih kecil sambil tetap memenuhi target: berkasnya
    // sudah efisien. Bukan galat — video asli dipakai apa adanya.
    if (/Failed to find a suitable crf|max-encoded-percent/i.test(cari.keluaran)) {
      fs.copyFileSync(masukan, keluaran);
      return { berkas: keluaran, size_awal: sizeAwal, size: sizeAwal, crf: null, vmaf: null, diperkecil: false };
    }
    console.error("ab-av1 gagal:", cari.keluaran.slice(-1500));
    throw new GalatVideo("Pencarian setelan kompres gagal. Pastikan berkasnya video yang utuh.");
  }
  const crf = Number(temu[1]);
  const vmaf = Number(temu[2]);
  await opsi.log(`Setelan ditemukan: CRF ${crf}, VMAF ${vmaf}. Mengompres…`);

  // ---- 2. Encode akhir (45..99%) ----
  const audio = await kodekAudio(masukan, opsi.batal);
  const argAudio = !audio ? ["-an"] : audio === "aac" ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "160k"];
  const enc = await jalankan(
    FFMPEG_BIN,
    [
      "-hide_banner", "-nostdin", "-y", "-i", masukan,
      "-map", "0:v:0", "-map", "0:a:0?",
      "-c:v", "libx264", "-preset", PRESET, "-crf", String(crf), "-pix_fmt", "yuv420p",
      "-threads", UTAS,
      ...argAudio,
      "-movflags", "+faststart",
      "-progress", "pipe:1", "-nostats",
      keluaran,
    ],
    {
      batal: opsi.batal,
      baris: (b) => {
        const m = /^out_time_ms=(\d+)/.exec(b);
        if (m && durasiDetik > 0) {
          const p = Number(m[1]) / 1e6 / durasiDetik;
          void opsi.progress(Math.min(99, Math.round(45 + p * 54)));
        }
      },
    },
  );
  fs.rmSync(kerja, { recursive: true, force: true });
  if (enc.kode !== 0 || !fs.existsSync(keluaran)) {
    console.error("ffmpeg kompres gagal:", enc.keluaran.slice(-1500));
    throw new GalatVideo("Video gagal dikompres.");
  }
  const size = fs.statSync(keluaran).size;
  // Tidak menghemat (≥ 97% ukuran asli): pakai yang asli, kualitasnya pasti utuh.
  if (size >= sizeAwal * 0.97) {
    fs.copyFileSync(masukan, keluaran);
    return { berkas: keluaran, size_awal: sizeAwal, size: sizeAwal, crf, vmaf, diperkecil: false };
  }
  return { berkas: keluaran, size_awal: sizeAwal, size, crf, vmaf, diperkecil: true };
}

// Penjalan render — cermin render() di video_edit.py: satu proses ffmpeg,
// kemajuan dari "-progress pipe:1", tombol berhenti, dan batas waktu.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { RENDER_TIMEOUT_SECONDS } from "./konfig";
import { Dibatalkan, GalatVideo, type Template } from "./jenis";
import { bangunPerintah, type PenggambarTeks } from "./perintah";
import { adalahBerkas, formatF, kodeKeluar, potongPy, probe, pySplitLines, pyStr, pyStrip } from "./media";

export type OpsiRender = {
  texts?: Record<string, string> | null;
  log?: ((pesan: string) => void) | null;
  progress?: ((persen: number) => void | Promise<void>) | null;
  /** Ditanya paling sering sekali per detik; true = hentikan render. */
  batal?: (() => boolean | Promise<boolean>) | null;
  /** Pengganti perender teks (uji); bawaannya gambarTeks dari teks.ts. */
  gambarTeks?: PenggambarTeks;
  /** Pengganti RENDER_TIMEOUT_SECONDS, khusus uji batas waktu. */
  batasWaktuDetik?: number;
};

/** Detik monotonik (time.monotonic()). */
const sekarang = () => performance.now() / 1000;

/**
 * Susun video akhir sesuai template; kembalikan path berkas hasil.
 *
 * `batal` ditanya berkala selama render. Begitu menjawab true, ffmpeg
 * dihentikan dan Dibatalkan dilempar. Penantian kabar ffmpeg dibatasi satu
 * detik: ffmpeg yang TERSANGKUT tidak mengabarkan apa pun, dan tanpa batas
 * itu tombol berhenti & batas waktu tidak pernah sempat diperiksa (dulu video
 * mandek di 2% dan tombol hentinya tidak berpengaruh).
 */
export async function render(
  template: Template,
  source: string,
  outDir: string,
  opsi: OpsiRender = {},
): Promise<string> {
  const { log, progress, batal } = opsi;
  fs.mkdirSync(outDir, { recursive: true });
  const keluaran = path.join(outDir, "output.mp4");
  const { args: perintah, total } = await bangunPerintah(template, source, keluaran, opsi.texts ?? {}, outDir, {
    gambarTeks: opsi.gambarTeks,
  });
  fs.writeFileSync(path.join(outDir, "ffmpeg-command.txt"), perintah.join(" "), "utf8");
  if (log) {
    log(
      `Menyusun video: kanvas ${pyStr(template.width)}x${pyStr(template.height)}, ` +
        `perkiraan hasil ${formatF(total, 1)} detik`,
    );
  }

  const batasDetik = opsi.batasWaktuDetik ?? RENDER_TIMEOUT_SECONDS;
  const berkasLog = path.join(outDir, "ffmpeg.log");
  const batasWaktu = sekarang() + batasDetik;
  const fd = fs.openSync(berkasLog, "w");
  let kode = 0;
  try {
    const proses = spawn(perintah[0], perintah.slice(1), { stdio: ["ignore", "pipe", fd], windowsHide: true });
    let galatSpawn: Error | null = null;
    const tutup = new Promise<number>((selesai) => {
      proses.on("error", (e) => {
        galatSpawn = e;
        selesai(-1);
      });
      proses.on("close", (k, sinyal) => selesai(kodeKeluar(k, sinyal)));
    });

    // Antrean baris kabar ffmpeg; null = ffmpeg menutup keluarannya.
    const antrean: (string | null)[] = [];
    let penunggu: (() => void) | null = null;
    const masuk = (baris: string | null) => {
      if (antrean.length < 2000 || baris === null) antrean.push(baris); // kemajuan boleh terlewat
      penunggu?.();
    };
    const pembaca = readline.createInterface({ input: proses.stdout!, crlfDelay: Infinity });
    pembaca.on("line", (b) => masuk(b));
    pembaca.on("close", () => masuk(null));
    proses.on("error", () => masuk(null));

    /** antrean.get(timeout=1.0): "" kalau satu detik berlalu tanpa kabar. */
    const ambilBaris = async (): Promise<string | null> => {
      if (!antrean.length) {
        await new Promise<void>((bangun) => {
          const t = setTimeout(() => {
            penunggu = null;
            bangun();
          }, 1000);
          penunggu = () => {
            clearTimeout(t);
            penunggu = null;
            bangun();
          };
        });
      }
      return antrean.length ? antrean.shift()! : "";
    };

    let persenTerakhir = -1;
    try {
      // -Infinity: pertanyaan pertama langsung diajukan, seperti periksa_batal = 0.0
      // terhadap time.monotonic() yang selalu besar di Python.
      let periksaBatal = -Infinity;
      for (;;) {
        let baris = await ambilBaris();
        if (baris === null) break;
        baris = pyStrip(baris);
        // Ditanya paling sering sekali per detik; ffmpeg mengirim kabar jauh
        // lebih rapat dan tiap pertanyaan menyentuh Redis.
        if (batal && sekarang() - periksaBatal > 1.0) {
          periksaBatal = sekarang();
          if (await batal()) {
            proses.kill("SIGKILL");
            throw new Dibatalkan("Pembuatan video dihentikan.");
          }
        }
        if (baris.startsWith("out_time_ms=") && total > 0) {
          const nilai = pyStrip(baris.slice(baris.indexOf("=") + 1));
          if (!/^[+-]?\d(?:_?\d)*$/.test(nilai)) continue; // int() gagal → lewati
          const detik = Number(nilai.replace(/_/g, "")) / 1_000_000;
          const persen = Math.max(0, Math.min(99, Math.trunc((detik / total) * 100)));
          if (progress && persen !== persenTerakhir) {
            persenTerakhir = persen;
            await progress(persen);
          }
        }
        if (sekarang() > batasWaktu) {
          proses.kill("SIGKILL");
          throw new GalatVideo(`Render melewati batas waktu ${formatF(batasDetik / 60, 0)} menit dan dihentikan.`);
        }
      }
    } finally {
      // stdout ditutup dulu (ffmpeg yang masih menulis kabar akan berhenti),
      // lalu ditunggu sampai prosesnya benar-benar keluar.
      pembaca.close();
      proses.stdout?.destroy();
      kode = await tutup;
    }
    if (galatSpawn) throw galatSpawn;
  } finally {
    fs.closeSync(fd);
  }

  if (kode !== 0 || !adalahBerkas(keluaran)) {
    // Berkas log bisa saja tidak ada (ffmpeg gagal dijalankan sama sekali);
    // membacanya tanpa pengaman menutupi penyebab aslinya.
    let isiLog = "";
    try {
      isiLog = fs.readFileSync(berkasLog, "utf8");
    } catch {
      isiLog = "";
    }
    const barisLog = pySplitLines(pyStrip(isiLog)).filter((b) => pyStrip(b));
    if (kode === -9) {
      // Ditembak SIGKILL dari luar - paling sering kernel yang kehabisan
      // memori. Itu DUGAAN, jadi kalimat terakhir ffmpeg ikut dibawa.
      const ekor = barisLog.length ? potongPy(barisLog[barisLog.length - 1], 200) : "ffmpeg tidak sempat menulis log";
      throw new GalatVideo(
        `Render dihentikan paksa oleh sistem (SIGKILL) pada kanvas ` +
          `${pyStr(template.width)}x${pyStr(template.height)}. Biasanya ini ` +
          `berarti servernya kehabisan memori - pakai kanvas lebih kecil, ` +
          `atau server dengan RAM lebih besar. Kata terakhir ffmpeg: ${ekor}`,
      );
    }
    const detail = barisLog.length ? barisLog[barisLog.length - 1] : `ffmpeg keluar dengan kode ${kode}`;
    throw new GalatVideo(`Gagal menyusun video: ${potongPy(detail, 300)}`);
  }

  if (progress) await progress(100);
  if (log) {
    const ukuran = fs.statSync(keluaran).size / 1_048_576;
    const hasil = await probe(keluaran);
    log(
      `Video jadi: ${formatF(hasil.duration, 1)} detik, ` +
        `${hasil.width}x${hasil.height}, ${formatF(ukuran, 1)} MB`,
    );
  }
  return keluaran;
}

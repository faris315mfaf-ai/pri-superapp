// ============================================================
// Hapus latar video Boom like share (uji coba, 5 Okt 2026).
//
// Dua jalan, dipilih otomatis per video:
//   1. WARNA: tepi bingkai berwarna polos & BERWARNA (green screen, biru,
//      magenta, ...) → ffmpeg colorkey, fps & panjang asli, beberapa detik.
//   2. AI: selain itu (termasuk latar hitam/putih/abu — warna netral sering
//      juga ada di animasinya, colorkey ikut melubangi tulisan) → tiap frame
//      lewat rembg model isnet-general-use di container autoedit-rembg
//      (vps/mesin/docker-compose.yml). Diukur di VPS mesin: ±1 detik/frame
//      di 4 core, jadi dibatasi 10 detik @ 15 fps (±2–3 menit).
//      BiRefNet (lebih rapi) ±23 detik/frame tanpa GPU — tidak dipakai.
//
// Hasilnya MOV qtrle beralpha (sama dengan WEBM transparan yang dirapikan
// saat diunggah), lebar ≤ 560 — slot Boom hanya 280x158 di kanvas.
// ============================================================
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { FFMPEG_BIN } from "./konfig";
import { Dibatalkan, GalatVideo } from "./jenis";

const teks = (nama: string, bawaan: string) => String(process.env[nama] ?? "").trim() || bawaan;
const angka = (nama: string, bawaan: number) => {
  const n = Number.parseFloat(process.env[nama] ?? "");
  return Number.isFinite(n) && n > 0 ? n : bawaan;
};
const REMBG_URL = teks("REMBG_URL", "http://autoedit-rembg:7000").replace(/\/+$/, "");
const REMBG_MODEL = teks("REMBG_MODEL", "isnet-general-use");
/** Batas & fps jalan AI. */
export const MAKS_DETIK_AI = angka("HAPUS_LATAR_MAKS_DETIK", 10);
const FPS_AI = angka("HAPUS_LATAR_FPS", 15);
const LEBAR_MAKS = 560;
/** Panggilan pertama rembg mengunduh model (±170 MB) — beri waktu. */
const BATAS_FRAME_MS = 240_000;

export type HasilHapusLatar = {
  berkas: string;
  mode: "warna" | "ai";
  /** Warna latar yang dibuang (mode warna), mis. "#00ff00". */
  warna: string | null;
  frame: number;
};

type Opsi = {
  progress: (persen: number) => Promise<void>;
  batal: () => Promise<boolean>;
};

/** Jalankan ffmpeg; stdout dikembalikan sebagai Buffer. */
function ffmpeg(args: string[]): Promise<Buffer> {
  return new Promise((ok, gagal) => {
    const p = spawn(FFMPEG_BIN, ["-hide_banner", "-nostdin", "-loglevel", "error", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const keluar: Buffer[] = [];
    let galat = "";
    p.stdout.on("data", (b: Buffer) => keluar.push(b));
    p.stderr.on("data", (b: Buffer) => (galat = (galat + b.toString("utf8")).slice(-4000)));
    p.on("error", gagal);
    p.on("close", (kode) => {
      if (kode === 0) ok(Buffer.concat(keluar));
      else {
        console.error("ffmpeg hapus latar gagal:", galat);
        gagal(new GalatVideo("Video Boom gagal diproses."));
      }
    });
  });
}

// ---- Deteksi latar polos -------------------------------------------------

const SISI = 64;

/** Piksel tepi (2 px) satu frame yang dikecilkan ke 64x64. */
async function tepiFrame(masukan: string, detik: number): Promise<number[][]> {
  const raw = await ffmpeg([
    "-ss", detik.toFixed(2), "-i", masukan, "-frames:v", "1",
    "-vf", `scale=${SISI}:${SISI}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
  ]);
  if (raw.length < SISI * SISI * 3) return [];
  const hasil: number[][] = [];
  for (let y = 0; y < SISI; y++) {
    for (let x = 0; x < SISI; x++) {
      if (x > 1 && x < SISI - 2 && y > 1 && y < SISI - 2) continue;
      const i = (y * SISI + x) * 3;
      hasil.push([raw[i], raw[i + 1], raw[i + 2]]);
    }
  }
  return hasil;
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)] ?? 0;
};
const jarak = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Warna latar polos BERWARNA bila tepi bingkai (awal, tengah, akhir video)
 * hampir seluruhnya satu warna; null bila latarnya beragam atau netral.
 */
export async function warnaLatarPolos(masukan: string, durasi: number): Promise<[number, number, number] | null> {
  const titik = [0, durasi * 0.5, Math.max(0, durasi - 0.3)];
  const warna: number[][] = [];
  for (const t of titik) {
    const tepi = await tepiFrame(masukan, t);
    if (tepi.length === 0) return null;
    const m = [0, 1, 2].map((k) => median(tepi.map((p) => p[k])));
    const cocok = tepi.filter((p) => jarak(p, m) <= 40).length / tepi.length;
    if (cocok < 0.92) return null;
    warna.push(m);
  }
  if (warna.some((w) => jarak(w, warna[0]) > 40)) return null;
  const w = [0, 1, 2].map((k) => median(warna.map((x) => x[k]))) as [number, number, number];
  // Netral (hitam/putih/abu): saturasi rendah → serahkan ke AI.
  const saturasi = (Math.max(...w) - Math.min(...w)) / Math.max(1, Math.max(...w));
  if (saturasi < 0.35 || Math.max(...w) < 60) return null;
  return w;
}

const hex = (w: number[]) => w.map((k) => k.toString(16).padStart(2, "0")).join("");

// ---- Proses ----------------------------------------------------------------

async function lewatWarna(masukan: string, keluaran: string, w: [number, number, number]): Promise<void> {
  // Sisa pantulan hijau/biru di tepi objek dibuang (despill).
  const dominan = w[1] >= w[0] && w[1] >= w[2] ? "green" : w[2] >= w[0] && w[2] >= w[1] ? "blue" : "";
  const saring = [
    `scale='min(${LEBAR_MAKS},iw)':-2`,
    `colorkey=0x${hex(w)}:0.16:0.08`,
    ...(dominan ? [`despill=type=${dominan}`] : []),
    "format=argb",
  ].join(",");
  await ffmpeg(["-y", "-i", masukan, "-vf", saring, "-c:v", "qtrle", "-pix_fmt", "argb", "-an", keluaran]);
}

async function satuFrame(berkas: string): Promise<Buffer> {
  const bentuk = new FormData();
  bentuk.set("model", REMBG_MODEL);
  bentuk.set("file", new Blob([fs.readFileSync(berkas)], { type: "image/png" }), path.basename(berkas));
  let res: Response;
  try {
    res = await fetch(`${REMBG_URL}/api/remove`, { method: "POST", body: bentuk, signal: AbortSignal.timeout(BATAS_FRAME_MS) });
  } catch (e) {
    console.error("rembg tidak terjangkau:", e instanceof Error ? e.message : e);
    throw new GalatVideo("Layanan hapus latar belum siap. Coba lagi beberapa menit lagi.");
  }
  if (!res.ok) {
    console.error("rembg menolak:", res.status, (await res.text().catch(() => "")).slice(0, 300));
    throw new GalatVideo("Layanan hapus latar gagal memproses video ini.");
  }
  return Buffer.from(await res.arrayBuffer());
}

async function lewatAi(masukan: string, keluaran: string, kerja: string, opsi: Opsi): Promise<number> {
  const asal = path.join(kerja, "asal");
  const jadi = path.join(kerja, "jadi");
  fs.mkdirSync(asal, { recursive: true });
  fs.mkdirSync(jadi, { recursive: true });
  await ffmpeg([
    "-y", "-i", masukan, "-t", String(MAKS_DETIK_AI),
    "-vf", `fps=${FPS_AI},scale='min(${LEBAR_MAKS},iw)':-2`, path.join(asal, "%05d.png"),
  ]);
  const frame = fs.readdirSync(asal).filter((n) => n.endsWith(".png")).sort();
  if (frame.length === 0) throw new GalatVideo("Video Boom tidak berisi gambar.");
  await opsi.progress(5);
  for (let i = 0; i < frame.length; i++) {
    if (await opsi.batal()) throw new Dibatalkan("Hapus latar dihentikan.");
    let hasil: Buffer;
    try {
      hasil = await satuFrame(path.join(asal, frame[i]));
    } catch {
      // Satu kali coba lagi: rembg bisa sesaat sibuk/baru menyala.
      hasil = await satuFrame(path.join(asal, frame[i]));
    }
    fs.writeFileSync(path.join(jadi, frame[i]), hasil);
    await opsi.progress(Math.min(95, 5 + Math.round(((i + 1) / frame.length) * 90)));
  }
  await ffmpeg([
    "-y", "-framerate", String(FPS_AI), "-i", path.join(jadi, "%05d.png"),
    "-vf", "format=argb", "-c:v", "qtrle", "-pix_fmt", "argb", "-an", keluaran,
  ]);
  return frame.length;
}

/**
 * Buang latar `masukan` → `<folder>/boom.mov` beralpha. Melempar Dibatalkan
 * bila dihentikan, GalatVideo bila tidak bisa diproses.
 */
export async function hapusLatar(masukan: string, folder: string, durasi: number, opsi: Opsi): Promise<HasilHapusLatar> {
  const keluaran = path.join(folder, "boom.mov");
  const kerja = path.join(folder, "kerja");
  fs.mkdirSync(kerja, { recursive: true });
  try {
    await opsi.progress(2);
    const w = await warnaLatarPolos(masukan, durasi);
    if (w) {
      await lewatWarna(masukan, keluaran, w);
      return { berkas: keluaran, mode: "warna", warna: `#${hex(w)}`, frame: 0 };
    }
    if (durasi > MAKS_DETIK_AI + 0.5) {
      throw new GalatVideo(
        `Latarnya tidak polos, jadi perlu AI — untuk itu video Boom maksimal ${MAKS_DETIK_AI} detik (video ini ${Math.round(durasi)} detik). Potong dulu videonya.`,
      );
    }
    const frame = await lewatAi(masukan, keluaran, kerja, opsi);
    return { berkas: keluaran, mode: "ai", warna: null, frame };
  } finally {
    fs.rmSync(kerja, { recursive: true, force: true });
  }
}

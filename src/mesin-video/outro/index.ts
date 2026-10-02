// Auto Outro — API kecil untuk dipasang ke HTTP oleh layanan mesin video.
//
// Cermin outro_api.py (FastAPI). Siapa yang boleh memanggil diputuskan
// SuperApp (akses.py / pengguna_wajib) — itu tugas lapisan HTTP, bukan
// modul ini. Endpoint dan kontraknya:
//
//   POST /api/outro/jobs
//     body  : { channel: string (1..80 karakter), akun?: {instagram, youtube,
//               facebook, tiktok, x, threads: string}, seed?: int 0..2^31-1 | null,
//               mode?: "biasa" | "dpp" }
//     200   : { job_id, status: "queued", mode, seed, gaya }
//     400   : { detail: "<pesan OutroError>" }   (mis. channel hanya spasi)
//     422   : { detail: [...] }                   (validasi body, gaya FastAPI)
//     -> buatOutro(body)
//
//   GET  /api/outro/jobs?batas=20  (1..200)
//     200   : { jobs: [ringkas(job), ...] }  terbaru dulu
//     -> daftarOutro(batas)
//
//   GET  /api/outro/jobs/{job_id}
//     200   : ringkas(job)
//     404   : { detail: "Pekerjaan tidak ditemukan." }
//     -> statusOutro(jobId)
//
//   POST /api/outro/jobs/{job_id}/stop
//     200   : { ok: true }
//     409   : { detail: "Pekerjaan sudah selesai atau tidak ada." }
//     -> hentikanOutro(jobId)
//
//   GET  /api/outro/jobs/{job_id}/video
//     200   : berkas video/mp4, Content-Disposition attachment; filename="<namaBerkas>"
//     404   : { detail: "Videonya belum ada." } / { detail: "Berkas videonya sudah tidak ada." }
//     -> videoOutro(jobId) -> { jalur, namaBerkas, mediaType }
//
// ringkas(job) = { job_id, status, langkah, progress, channel, mode, seed,
//   gaya, akun, punya_video, message, logs, created, updated } — jalur berkas
//   di disk sengaja tidak ikut dikirim.
//
// Status job: "queued" -> "running" -> "done" | "error" | "dibatalkan".
// Penyapu disk (bersihkanLama) dipanggil penjaga volume, sama seperti
// video_edit.jaga_volume_di_latar memanggil outro.bersihkan_lama.
import { OutroError } from "./galat";
import { ambilVideo, bacaJob, daftarJob, mintaBatal, mulaiJob, type JobOutro } from "./pekerjaan";

export { OutroError, Dibatalkan } from "./galat";
export { bersihkanLama, tungguJob, folderOutro, RUANG_OUTRO_MB, INDEKS_MAKS, MODE_SAH, type JobOutro } from "./pekerjaan";
export { pilihGaya, ringkasGaya, KUNCI_AKUN, type Gaya } from "./gaya";
export { FPS, VIDEO_W, VIDEO_H } from "./render";

/** Galat HTTP dengan status dan detail persis seperti HTTPException FastAPI. */
export class GalatHttpOutro extends Error {
  constructor(
    readonly status: number,
    readonly detail: unknown,
  ) {
    super(typeof detail === "string" ? detail : JSON.stringify(detail));
    this.name = "GalatHttpOutro";
  }
}

export type RingkasOutro = {
  job_id: string;
  status: unknown;
  langkah: unknown;
  progress: unknown;
  channel: unknown;
  mode: unknown;
  seed: unknown;
  gaya: unknown;
  akun: unknown;
  punya_video: boolean;
  message: unknown;
  logs: unknown;
  created: unknown;
  updated: unknown;
};

/** _ringkas: yang perlu halaman saja. */
export function ringkas(job: JobOutro): RingkasOutro {
  return {
    job_id: job.job_id,
    status: job.status ?? null,
    langkah: job.langkah ?? null,
    progress: job.progress ?? 0,
    channel: job.channel ?? null,
    mode: job.mode ?? "biasa",
    seed: job.seed ?? null,
    gaya: job.gaya ?? "",
    akun: job.akun ?? {},
    punya_video: Boolean(job.video),
    message: job.message ?? "",
    logs: job.logs ?? [],
    created: job.created ?? null,
    updated: job.updated ?? null,
  };
}

type GalatValidasi = { type: string; loc: (string | number)[]; msg: string; input: unknown };

const panjangKarakter = (s: string) => Array.from(s).length;

/**
 * Validasi body seperti OutroBody (pydantic v2, mode lax): melempar
 * GalatHttpOutro 422 dengan daftar galat bergaya FastAPI.
 */
export function validasiBody(body: unknown): { channel: string; akun: Record<string, string>; seed: number | null; mode: "biasa" | "dpp" } {
  const galat: GalatValidasi[] = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new GalatHttpOutro(422, [{ type: "model_attributes_type", loc: ["body"], msg: "Input should be a valid dictionary or object to extract fields from", input: body }]);
  }
  const b = body as Record<string, unknown>;
  let channel = "";
  if (!("channel" in b)) galat.push({ type: "missing", loc: ["body", "channel"], msg: "Field required", input: b });
  else if (typeof b.channel !== "string") galat.push({ type: "string_type", loc: ["body", "channel"], msg: "Input should be a valid string", input: b.channel });
  else if (panjangKarakter(b.channel) < 1) galat.push({ type: "string_too_short", loc: ["body", "channel"], msg: "String should have at least 1 character", input: b.channel });
  else if (panjangKarakter(b.channel) > 80) galat.push({ type: "string_too_long", loc: ["body", "channel"], msg: "String should have at most 80 characters", input: b.channel });
  else channel = b.channel;

  const akun: Record<string, string> = {};
  if (b.akun !== undefined) {
    if (!b.akun || typeof b.akun !== "object" || Array.isArray(b.akun)) {
      galat.push({ type: "dict_type", loc: ["body", "akun"], msg: "Input should be a valid dictionary", input: b.akun });
    } else {
      for (const [k, v] of Object.entries(b.akun as Record<string, unknown>)) {
        if (typeof v !== "string") galat.push({ type: "string_type", loc: ["body", "akun", k], msg: "Input should be a valid string", input: v });
        else akun[k] = v;
      }
    }
  }

  let seed: number | null = null;
  if (b.seed !== undefined && b.seed !== null) {
    let n: number | null = null;
    if (typeof b.seed === "number" && Number.isInteger(b.seed)) n = b.seed;
    else if (typeof b.seed === "string" && /^\s*[+-]?\d+\s*$/.test(b.seed)) n = Number.parseInt(b.seed, 10);
    if (n === null) {
      galat.push({ type: "int_parsing", loc: ["body", "seed"], msg: "Input should be a valid integer", input: b.seed });
    } else if (n < 0) {
      galat.push({ type: "greater_than_equal", loc: ["body", "seed"], msg: "Input should be greater than or equal to 0", input: b.seed });
    } else if (n > 2 ** 31 - 1) {
      galat.push({ type: "less_than_equal", loc: ["body", "seed"], msg: "Input should be less than or equal to 2147483647", input: b.seed });
    } else {
      seed = n;
    }
  }

  let mode: "biasa" | "dpp" = "biasa";
  if (b.mode !== undefined) {
    if (b.mode === "biasa" || b.mode === "dpp") mode = b.mode;
    else galat.push({ type: "literal_error", loc: ["body", "mode"], msg: "Input should be 'biasa' or 'dpp'", input: b.mode });
  }
  if (galat.length) throw new GalatHttpOutro(422, galat);
  return { channel, akun, seed, mode };
}

/** POST /api/outro/jobs */
export function buatOutro(body: unknown): { job_id: string; status: "queued"; mode: string; seed: unknown; gaya: unknown } {
  const v = validasiBody(body);
  let jobId: string;
  try {
    jobId = mulaiJob(v.channel, v.akun, v.seed, v.mode);
  } catch (e) {
    if (e instanceof OutroError) throw new GalatHttpOutro(400, e.message);
    throw e;
  }
  const job = bacaJob(jobId);
  return { job_id: jobId, status: "queued", mode: v.mode, seed: job?.seed ?? null, gaya: job?.gaya ?? "" };
}

/** GET /api/outro/jobs?batas= — semua outro dipantau lewat satu permintaan. */
export function daftarOutro(batas: unknown = 20): { jobs: RingkasOutro[] } {
  let n = 20;
  if (batas !== undefined && batas !== null && batas !== "") {
    const s = String(batas).trim();
    if (!/^[+-]?\d+$/.test(s)) {
      throw new GalatHttpOutro(422, [{ type: "int_parsing", loc: ["query", "batas"], msg: "Input should be a valid integer, unable to parse string as an integer", input: batas }]);
    }
    n = Number.parseInt(s, 10);
    if (n < 1) throw new GalatHttpOutro(422, [{ type: "greater_than_equal", loc: ["query", "batas"], msg: "Input should be greater than or equal to 1", input: batas }]);
    if (n > 200) throw new GalatHttpOutro(422, [{ type: "less_than_equal", loc: ["query", "batas"], msg: "Input should be less than or equal to 200", input: batas }]);
  }
  return { jobs: daftarJob(n).map(ringkas) };
}

/** GET /api/outro/jobs/{job_id} */
export function statusOutro(jobId: string): RingkasOutro {
  const job = bacaJob(jobId);
  if (job === null) throw new GalatHttpOutro(404, "Pekerjaan tidak ditemukan.");
  return ringkas(job);
}

/** POST /api/outro/jobs/{job_id}/stop */
export function hentikanOutro(jobId: string): { ok: true } {
  if (!mintaBatal(jobId)) throw new GalatHttpOutro(409, "Pekerjaan sudah selesai atau tidak ada.");
  return { ok: true };
}

/** Nama unduhan: "outro-<channel>" huruf/angka/-_ saja, ASCII, atau "outro". */
export function namaBerkasUnduhan(channel: string): string {
  const bersih = Array.from(channel)
    .filter((c) => /[\p{L}\p{N}]/u.test(c) || "-_ ".includes(c))
    .join("")
    .replace(/^[\s\x1c-\x1f]+|[\s\x1c-\x1f]+$/gu, "")
    .split(" ")
    .join("-");
  // Header HTTP hanya aman untuk ASCII; nama channel bisa berisi huruf lain.
  const nama = Array.from(`outro-${bersih}`)
    .filter((c) => c.charCodeAt(0) < 128)
    .join("");
  return `${nama || "outro"}.mp4`;
}

/** GET /api/outro/jobs/{job_id}/video */
export function videoOutro(jobId: string): { jalur: string; namaBerkas: string; mediaType: "video/mp4" } {
  const job = bacaJob(jobId);
  if (job === null || !job.video) throw new GalatHttpOutro(404, "Videonya belum ada.");
  const ambil = ambilVideo(jobId);
  if (ambil === null) throw new GalatHttpOutro(404, "Berkas videonya sudah tidak ada.");
  const [jalur, channel] = ambil;
  return { jalur, namaBerkas: namaBerkasUnduhan(channel), mediaType: "video/mp4" };
}

export { mulaiJob, bacaJob, daftarJob, mintaBatal, ambilVideo };

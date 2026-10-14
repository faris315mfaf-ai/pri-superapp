// Lacak Sumber / Pencari Video Asli (15 Okt 2026): rute /api/lacak/* diteruskan ke layanan Python
// autoedit-lacak (vps/lacak) di jaringan internal pri-autoedit. Mesin TS hanya memeriksa identitas lalu
// menyalin peran & penanda bot yang dipasang pemanggil tepercaya:
//   - aplikasi SuperApp (lib/autoedit teruskanAutoEdit) -> x-autoedit-peran: master (hanya untuk master)
//   - runner bot (src/bot-runner) lewat soket mesin      -> x-autoedit-bot: 1
// Peramban tidak bisa mengisi keduanya: aplikasi hanya meneruskan header dari daftar putih.
import { GalatHttp, identitas, kirimJson, SUDAH_DIKIRIM, type Permintaan, type Router } from "./dasar";

const A = "/api/lacak";
const BATAS_BADAN = 64 * 1024;
const BATAS_WAKTU_MS = 30_000;

function alamatLacak(): string {
  return (process.env.LACAK_URL || "http://autoedit-lacak:7100").replace(/\/+$/, "");
}

async function badanMentah(pm: Permintaan): Promise<Buffer | undefined> {
  if (pm.method === "GET" || pm.method === "DELETE") return undefined;
  const potongan: Buffer[] = [];
  let ukuran = 0;
  for await (const b of pm.req) {
    ukuran += (b as Buffer).length;
    if (ukuran > BATAS_BADAN) throw new GalatHttp(413, "Isi permintaan terlalu besar.");
    potongan.push(b as Buffer);
  }
  return Buffer.concat(potongan);
}

/** Teruskan satu permintaan ke layanan lacak; jawaban (status + JSON) disalin apa adanya. */
async function teruskan(pm: Permintaan, jalurTujuan: string | (() => string)): Promise<typeof SUDAH_DIKIRIM> {
  // Identitas DULU (semua rute mesin wajib lewat SuperApp), baru jalur yang memvalidasi parameter.
  const id = identitas(pm);
  const jalur = typeof jalurTujuan === "string" ? jalurTujuan : jalurTujuan();
  const header: Record<string, string> = { "x-pengguna": id.user_id, accept: "application/json" };
  if (String(pm.req.headers["x-autoedit-peran"] ?? "").trim() === "master") header["x-peran"] = "master";
  if (String(pm.req.headers["x-autoedit-bot"] ?? "").trim() === "1") header["x-bot"] = "1";
  const badan = await badanMentah(pm);
  if (badan) header["content-type"] = "application/json";
  const qs = pm.query.toString();
  let jawaban: Response;
  try {
    jawaban = await fetch(`${alamatLacak()}${jalur}${qs ? `?${qs}` : ""}`, {
      method: pm.method,
      headers: header,
      body: badan && badan.length ? new Uint8Array(badan) : undefined,
      signal: AbortSignal.timeout(BATAS_WAKTU_MS),
    });
  } catch {
    throw new GalatHttp(503, "Pencari video asli sedang tidak aktif. Coba lagi sebentar lagi.");
  }
  const teks = await jawaban.text();
  let isi: unknown;
  try {
    isi = teks ? JSON.parse(teks) : null;
  } catch {
    isi = { detail: jawaban.ok ? "Jawaban pencari video asli tidak terbaca." : "Pencari video asli sedang bermasalah." };
  }
  // 5xx dari layanan Python (galat tak terduga) tidak membocorkan isinya.
  const status = jawaban.status >= 500 ? 502 : jawaban.status;
  kirimJson(pm.res, status, status === 502 ? { detail: "Pencari video asli sedang bermasalah. Coba lagi." } : isi);
  return SUDAH_DIKIRIM;
}

const POLA_ID_JOB = /^[0-9a-f]{16}$/;
const POLA_ID_AKUN = /^[0-9]{1,9}$/;

function idJob(pm: Permintaan): string {
  const id = pm.params.id ?? "";
  if (!POLA_ID_JOB.test(id)) throw new GalatHttp(404, "Pencarian tidak ditemukan.");
  return id;
}

function idAkun(pm: Permintaan): string {
  const id = pm.params.id ?? "";
  if (!POLA_ID_AKUN.test(id)) throw new GalatHttp(404, "Akun tidak ditemukan.");
  return id;
}

export function pasangRuteLacak(r: Router): void {
  r.post(`${A}/jobs`, (pm) => teruskan(pm, "/jobs"));
  r.get(`${A}/jobs/{id}`, (pm) => teruskan(pm, () => `/jobs/${idJob(pm)}`));
  r.post(`${A}/jobs/{id}/keputusan`, (pm) => teruskan(pm, () => `/jobs/${idJob(pm)}/keputusan`));
  r.post(`${A}/jobs/{id}/batal`, (pm) => teruskan(pm, () => `/jobs/${idJob(pm)}/batal`));
  r.get(`${A}/riwayat`, (pm) => teruskan(pm, "/riwayat"));
  r.get(`${A}/koleksi`, (pm) => teruskan(pm, "/koleksi"));
  r.post(`${A}/koleksi`, (pm) => teruskan(pm, "/koleksi"));
  r.tambah("PATCH", `${A}/koleksi/{id}`, (pm) => teruskan(pm, () => `/koleksi/${idAkun(pm)}`));
  r.delete(`${A}/koleksi/{id}`, (pm) => teruskan(pm, () => `/koleksi/${idAkun(pm)}`));
  r.get(`${A}/pengaturan`, (pm) => teruskan(pm, "/pengaturan"));
  r.put(`${A}/pengaturan`, (pm) => teruskan(pm, "/pengaturan"));
}

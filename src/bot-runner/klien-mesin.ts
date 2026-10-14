// ============================================================
// RUMAH BOT (runner) — klien API mesin Auto Edit lewat SOKET UNIX (13 Okt 2026).
// Mesin hanya mendengar di /run/autoedit/api.sock dan wajib header
// `x-autoedit-pengguna: <id angka>`. Galat berbentuk {"detail": ...}.
//
// Fakta mesin yang dipatuhi di sini:
//  - POST /api/tvr/jobs TIDAK mengembalikan job_id atomik: jawabannya keadaan
//    lengkap (job, jobs[], stok[]). Job baru dikenali dari SELISIH daftar
//    sebelum/sesudah (satu bot = satu job aktif), cadangannya texts.hook.
//  - Tidak ada GET job tunggal: pantau lewat GET /api/tvr/stok. jobs[] hanya
//    job AKTIF; job selesai pindah ke stok[] dengan id = job_id yang sama; job
//    gagal HILANG dari jobs[] tanpa muncul di stok[].
// Fungsi murni (deteksi/penilaian) dipisah dari I/O agar mudah diuji.
// ============================================================

import http from "node:http";
import { GalatMesin, galatSambungMesin } from "./galat";

// ---- Tipe keadaan mesin (hanya bagian yang dipakai runner) ----

export type JobMesin = {
  job_id: string;
  status: string;
  progress: number | null;
  message: string | null;
  error: string | null;
  durasi: number | null;
  size: number | null;
  sumber_url: string | null;
  hook: string | null;
};

export type StokMesin = {
  id: string;
  judul: string;
  durasi: number | null;
  size: number | null;
};

export type KeadaanMesin = { jobs: JobMesin[]; stok: StokMesin[] };

export type BadanJob = { url: string; hook: string; sumber: string; kategori: string };

export interface KlienMesin {
  buatHook(idPengguna: number, naskah: string): Promise<string>;
  ambilKeadaan(idPengguna: number): Promise<KeadaanMesin>;
  buatJob(idPengguna: number, badan: BadanJob): Promise<KeadaanMesin>;
}

// ---- Batas mesin (src/mesin-video/server/tvr.ts) ----
export const MAKS_HOOK = 180;
export const MAKS_SUMBER = 60;
export const MAKS_KATEGORI = 30;
export const MAKS_NASKAH_MESIN = 5000;

// ---- Fungsi murni ----

const adalahObjek = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const angkaAtauNull = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const teksAtauNull = (x: unknown): string | null => (typeof x === "string" ? x : null);

/** Rapikan spasi (sama seperti server: pisah \s+, gabung satu spasi). */
export function rapikanSpasi(t: string): string {
  return String(t ?? "").split(/\s+/).filter(Boolean).join(" ");
}

/** Potong teks ke `maks` karakter, mengutamakan batas kata bila tidak membuang >40%. */
export function potongTeks(t: string, maks: number): string {
  const r = rapikanSpasi(t);
  if (r.length <= maks) return r;
  const potong = r.slice(0, maks);
  const spasi = potong.lastIndexOf(" ");
  return (spasi > maks * 0.6 ? potong.slice(0, spasi) : potong).trim();
}

/** Hook siap kirim ke /jobs (spasi rapi, <=180) — hasilnya juga yang dicocokkan ke texts.hook. */
export function siapkanHook(t: string): string {
  return potongTeks(t, MAKS_HOOK);
}

/** Mengubah jawaban stokDanAntrean mesin menjadi KeadaanMesin; bentuk salah -> daftar kosong. */
export function normalisasiKeadaan(json: unknown): KeadaanMesin {
  const j = adalahObjek(json) ? json : {};
  const jobs: JobMesin[] = [];
  for (const m of Array.isArray(j.jobs) ? j.jobs : []) {
    if (!adalahObjek(m) || typeof m.job_id !== "string" || !m.job_id) continue;
    const texts = adalahObjek(m.texts) ? m.texts : {};
    jobs.push({
      job_id: m.job_id,
      status: typeof m.status === "string" ? m.status : "",
      progress: angkaAtauNull(m.progress),
      message: teksAtauNull(m.message),
      error: teksAtauNull(m.error),
      durasi: angkaAtauNull(m.durasi),
      size: angkaAtauNull(m.size),
      sumber_url: teksAtauNull(m.sumber_url),
      hook: teksAtauNull(texts.hook),
    });
  }
  const stok: StokMesin[] = [];
  for (const m of Array.isArray(j.stok) ? j.stok : []) {
    if (!adalahObjek(m) || typeof m.id !== "string" || !m.id) continue;
    stok.push({ id: m.id, judul: typeof m.judul === "string" ? m.judul : "", durasi: angkaAtauNull(m.durasi), size: angkaAtauNull(m.size) });
  }
  return { jobs, stok };
}

/**
 * Mengenali job yang baru dibuat dari selisih keadaan SEBELUM dan SESUDAH POST.
 *  1. job di `sesudah` yang id-nya belum ada di jobs/stok `sebelum`;
 *  2. bila tepat satu -> itu; bila beberapa -> saring dengan texts.hook;
 *  3. bila tak ada selisih -> cocokkan texts.hook (tepat satu yang cocok).
 * Mengembalikan null bila tak terdeteksi atau ambigu.
 */
export function deteksiJobBaru(sebelum: KeadaanMesin, sesudah: KeadaanMesin, hook: string): JobMesin | null {
  const lama = new Set<string>([...sebelum.jobs.map((j) => j.job_id), ...sebelum.stok.map((s) => s.id)]);
  const baru = sesudah.jobs.filter((j) => !lama.has(j.job_id));
  const hookBersih = rapikanSpasi(hook);
  if (baru.length === 1) return baru[0];
  if (baru.length > 1) {
    const cocok = baru.filter((j) => j.hook !== null && rapikanSpasi(j.hook) === hookBersih);
    return cocok.length === 1 ? cocok[0] : null;
  }
  const cocokSemua = sesudah.jobs.filter((j) => j.hook !== null && rapikanSpasi(j.hook) === hookBersih);
  return cocokSemua.length === 1 ? cocokSemua[0] : null;
}

/** Status job mesin yang berarti gagal pasti (terlihat di jobs[]). */
const STATUS_GAGAL = new Set(["error", "dibatalkan"]);

export type PenilaianJob =
  | { jenis: "selesai"; idJob: string; idStok: string; durasi: number | null; ukuran: number | null }
  | { jenis: "gagal"; idJob: string; pesan: string }
  | { jenis: "berjalan"; idJob: string; status: string; progress: number | null }
  /** Tak ada di jobs[] maupun stok[]: pemanggil menghitung berturut-turut (>=2 -> gagal "hilang"). */
  | { jenis: "tidak_ada" };

/**
 * Menilai satu job dari keadaan terkini. `idJob` boleh null (dicari lewat hook di jobs[]).
 * Urutan: stok[] (selesai) -> jobs[] (berjalan / error) -> tidak_ada.
 */
export function nilaiJob(keadaan: KeadaanMesin, idJob: string | null, hook: string | null): PenilaianJob {
  if (idJob) {
    const s = keadaan.stok.find((x) => x.id === idJob);
    if (s) return { jenis: "selesai", idJob, idStok: s.id, durasi: s.durasi, ukuran: s.size };
  }
  let job: JobMesin | undefined;
  if (idJob) job = keadaan.jobs.find((j) => j.job_id === idJob);
  else if (hook) {
    const h = rapikanSpasi(hook);
    const cocok = keadaan.jobs.filter((j) => j.hook !== null && rapikanSpasi(j.hook) === h);
    if (cocok.length === 1) job = cocok[0];
  }
  if (!job) return { jenis: "tidak_ada" };
  if (STATUS_GAGAL.has(job.status)) {
    const alasan = job.error || job.message || (job.status === "dibatalkan" ? "job dibatalkan" : "job error");
    return { jenis: "gagal", idJob: job.job_id, pesan: alasan.slice(0, 300) };
  }
  return { jenis: "berjalan", idJob: job.job_id, status: job.status, progress: job.progress };
}

/** Pesan galat dari badan {"detail": ...} (string, atau daftar {msg}). */
export function detailDariJawaban(json: unknown, bawaan: string): string {
  if (adalahObjek(json)) {
    const d = json.detail;
    if (typeof d === "string" && d) return d.slice(0, 300);
    if (Array.isArray(d)) {
      const pesan = d.map((e) => (adalahObjek(e) && typeof e.msg === "string" ? e.msg : "")).filter(Boolean).join("; ");
      if (pesan) return pesan.slice(0, 300);
    }
  }
  return bawaan;
}

// ---- I/O: HTTP lewat soket Unix ----

type Opsi = { soket: string; fungsiHttp?: typeof http.request };

const MAKS_JAWABAN_BYTE = 4 * 1024 * 1024;

function panggil(
  opsi: Opsi,
  idPengguna: number,
  metode: "GET" | "POST",
  jalur: string,
  badan: unknown,
  batasMs: number,
): Promise<unknown> {
  if (!Number.isInteger(idPengguna) || idPengguna <= 0) {
    return Promise.reject(new GalatMesin(0, "id pengguna mesin tidak sah"));
  }
  const isi = badan === undefined ? null : Buffer.from(JSON.stringify(badan), "utf8");
  return new Promise((selesai, tolak) => {
    const minta = (opsi.fungsiHttp ?? http.request)(
      {
        socketPath: opsi.soket,
        path: jalur,
        method: metode,
        timeout: batasMs,
        headers: {
          "x-autoedit-pengguna": String(idPengguna),
          accept: "application/json",
          ...(isi ? { "content-type": "application/json", "content-length": String(isi.length) } : {}),
        },
      },
      (res) => {
        const potongan: Buffer[] = [];
        let total = 0;
        res.on("data", (c: Buffer) => {
          total += c.length;
          if (total > MAKS_JAWABAN_BYTE) {
            minta.destroy(galatSambungMesin("jawaban mesin terlalu besar"));
            return;
          }
          potongan.push(c);
        });
        res.on("error", (e) => tolak(galatSambungMesin(e.message)));
        res.on("end", () => {
          const mentah = Buffer.concat(potongan).toString("utf8");
          let json: unknown = null;
          try {
            json = mentah ? JSON.parse(mentah) : null;
          } catch {
            json = null;
          }
          const status = res.statusCode ?? 0;
          if (status >= 200 && status < 300) return selesai(json);
          tolak(new GalatMesin(status, detailDariJawaban(json, `HTTP ${status}`)));
        });
      },
    );
    minta.on("timeout", () => minta.destroy(galatSambungMesin("waktu habis menunggu mesin")));
    minta.on("error", (e) => tolak(e instanceof GalatMesin ? e : galatSambungMesin(e.message)));
    if (isi) minta.write(isi);
    minta.end();
  });
}

export function buatKlienMesin(opsi: Opsi): KlienMesin {
  return {
    async buatHook(idPengguna, naskah) {
      const n = String(naskah ?? "").slice(0, MAKS_NASKAH_MESIN);
      const j = await panggil(opsi, idPengguna, "POST", "/api/tvr/hook", { naskah: n }, 90_000);
      const hook = adalahObjek(j) && typeof j.hook === "string" ? siapkanHook(j.hook) : "";
      if (!hook) throw new GalatMesin(400, "mesin tidak menghasilkan hook");
      return hook;
    },
    async ambilKeadaan(idPengguna) {
      return normalisasiKeadaan(await panggil(opsi, idPengguna, "GET", "/api/tvr/stok", undefined, 20_000));
    },
    async buatJob(idPengguna, badan) {
      const aman = {
        url: badan.url,
        hook: siapkanHook(badan.hook),
        sumber: potongTeks(badan.sumber, MAKS_SUMBER),
        kategori: potongTeks(badan.kategori, MAKS_KATEGORI),
        // Video lebar tidak dipotong jadi potret (sama dengan Edit Otomatis pengguna, 14 Okt 2026).
        bingkai: "hitam",
      };
      return normalisasiKeadaan(await panggil(opsi, idPengguna, "POST", "/api/tvr/jobs", aman, 90_000));
    },
  };
}

// Kerangka HTTP kecil untuk layanan Auto Edit TS — pengganti FastAPI.
// Bentuk jawaban galat SAMA dengan FastAPI ({"detail": "..."} / daftar
// {msg} untuk 422), supaya UI SuperApp tidak perlu diubah.
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import busboy from "busboy";
import { z } from "zod";

export class GalatHttp extends Error {
  constructor(
    public status: number,
    public detail: unknown,
  ) {
    super(typeof detail === "string" ? detail : "Galat");
  }
}

export type Permintaan = {
  req: IncomingMessage;
  res: ServerResponse;
  method: string;
  path: string;
  query: URLSearchParams;
  params: Record<string, string>;
  /** Identitas dari header X-Autoedit-Pengguna (diisi penjaga rute). */
  pengguna?: { user_id: string; username: string };
};

export type Penangan = (p: Permintaan) => Promise<unknown>;

/** Jawaban mentah (berkas/gambar) — penangan sudah menulis ke res. */
export const SUDAH_DIKIRIM = Symbol("sudah-dikirim");

type Rute = { method: string; pola: RegExp; kunci: string[]; penangan: Penangan };

export class Router {
  private rute: Rute[] = [];
  tambah(method: string, jalur: string, penangan: Penangan): void {
    const kunci: string[] = [];
    const pola = new RegExp(
      "^" +
        jalur.replace(/\{(\w+)\}/g, (_, k: string) => {
          kunci.push(k);
          return "([^/]+)";
        }) +
        "$",
    );
    this.rute.push({ method, pola, kunci, penangan });
  }
  get = (j: string, p: Penangan) => this.tambah("GET", j, p);
  post = (j: string, p: Penangan) => this.tambah("POST", j, p);
  put = (j: string, p: Penangan) => this.tambah("PUT", j, p);
  delete = (j: string, p: Penangan) => this.tambah("DELETE", j, p);

  /** Daftar rute terdaftar (untuk uji "semua rute wajib identitas"). */
  daftar(): { method: string; jalur: string }[] {
    return this.rute.map((r) => ({ method: r.method, jalur: r.pola.source }));
  }

  cocokkan(method: string, jalur: string): { penangan: Penangan; params: Record<string, string> } | "405" | null {
    let adaJalur = false;
    for (const r of this.rute) {
      const m = r.pola.exec(jalur);
      if (!m) continue;
      adaJalur = true;
      if (r.method !== method) continue;
      const params: Record<string, string> = {};
      r.kunci.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { penangan: r.penangan, params };
    }
    return adaJalur ? "405" : null;
  }
}

export function kirimJson(res: ServerResponse, status: number, isi: unknown): void {
  const badan = Buffer.from(JSON.stringify(isi));
  res.writeHead(status, { "content-type": "application/json", "content-length": badan.length });
  res.end(badan);
}

/** Baca badan JSON (maks 2 MB) lalu validasi dengan skema zod. */
export async function bacaJson<T>(p: Permintaan, skema: z.ZodType<T>, batas = 2 * 1_048_576): Promise<T> {
  const potongan: Buffer[] = [];
  let ukuran = 0;
  for await (const b of p.req) {
    ukuran += (b as Buffer).length;
    if (ukuran > batas) throw new GalatHttp(413, "Isi permintaan terlalu besar.");
    potongan.push(b as Buffer);
  }
  let data: unknown;
  try {
    data = potongan.length ? JSON.parse(Buffer.concat(potongan).toString("utf8")) : {};
  } catch {
    throw new GalatHttp(422, [{ type: "json_invalid", loc: ["body"], msg: "JSON decode error" }]);
  }
  const hasil = skema.safeParse(data);
  if (!hasil.success) {
    throw new GalatHttp(
      422,
      hasil.error.issues.map((i) => ({ type: i.code, loc: ["body", ...i.path.map(String)], msg: i.message })),
    );
  }
  return hasil.data;
}

export type TujuanBerkas = string | { jalur: string; batas: number; pesan: string };

/**
 * Terima SATU berkas multipart (field "file") ke tujuan, dialirkan per
 * potongan dengan batas ukuran. `tujuan` dipanggil begitu nama berkas
 * terbaca (boleh melempar untuk menolak jenisnya, dan boleh memberi batas
 * khusus jenis itu). Potongan setengah jadi selalu dibuang.
 */
export function terimaBerkas(
  p: Permintaan,
  tujuan: (namaAsli: string) => TujuanBerkas,
  batas: number,
  pesanBesar: string,
): Promise<{ nama: string; jalur: string; ukuran: number }> {
  return new Promise((selesai, gagal) => {
    let bb: busboy.Busboy;
    try {
      bb = busboy({ headers: p.req.headers, limits: { files: 1 } });
    } catch {
      gagal(new GalatHttp(422, [{ type: "missing", loc: ["body", "file"], msg: "Field required" }]));
      return;
    }
    let ketemu = false;
    let jalurTulis = "";
    let galat: unknown = null;
    let janji: Promise<{ nama: string; jalur: string; ukuran: number }> | null = null;
    const buang = () => {
      if (jalurTulis) fs.rmSync(jalurTulis, { force: true });
    };
    bb.on("file", (nama, aliran, info) => {
      if (nama !== "file" || ketemu || galat) {
        aliran.resume();
        return;
      }
      ketemu = true;
      let batasIni = batas;
      let pesanIni = pesanBesar;
      try {
        const t = tujuan(info.filename || "berkas");
        if (typeof t === "string") jalurTulis = t;
        else {
          jalurTulis = t.jalur;
          batasIni = t.batas;
          pesanIni = t.pesan;
        }
      } catch (e) {
        galat = e;
        aliran.resume();
        return;
      }
      let ukuran = 0;
      const keluar = fs.createWriteStream(jalurTulis);
      janji = new Promise((ok, tolak) => {
        aliran.on("data", (b: Buffer) => {
          ukuran += b.length;
          if (ukuran > batasIni && !galat) {
            galat = new GalatHttp(413, pesanIni);
            aliran.unpipe(keluar);
            keluar.destroy();
            aliran.resume();
            tolak(galat);
          }
        });
        aliran.on("error", (e) => tolak(e));
        keluar.on("error", (e: NodeJS.ErrnoException) => tolak(e));
        keluar.on("finish", () => ok({ nama: info.filename || "berkas", jalur: jalurTulis, ukuran }));
        aliran.pipe(keluar);
      });
      // Penolakan ditangani di "close"; cegah unhandled rejection sebelumnya.
      janji.catch(() => undefined);
    });
    bb.on("error", (e) => {
      galat = galat ?? e;
    });
    bb.on("close", async () => {
      try {
        if (galat) throw galat;
        if (!janji) throw new GalatHttp(422, [{ type: "missing", loc: ["body", "file"], msg: "Field required" }]);
        selesai(await janji);
      } catch (e) {
        buang();
        gagal(e);
      }
    });
    p.req.on("aborted", () => {
      buang();
      gagal(new GalatHttp(400, "Unggahan terputus."));
    });
    p.req.pipe(bb);
  });
}

/** Kirim berkas dengan dukungan Range (pemutar video butuh ini untuk menggeser). */
export function kirimBerkas(p: Permintaan, jalur: string, jenis: string, namaUnduh?: string): typeof SUDAH_DIKIRIM {
  const st = fs.statSync(jalur);
  const header: Record<string, string | number> = {
    "content-type": jenis,
    "accept-ranges": "bytes",
    "last-modified": st.mtime.toUTCString(),
  };
  if (namaUnduh) {
    // Buang kutip DAN CR/LF/backslash: nilai header ber-CRLF ditolak runtime
    // Node (ERR_INVALID_CHAR → 500) dan backslash/kutip mengotori nama berkas.
    const bersih = namaUnduh.replace(/["\\\r\n]/g, "");
    header["content-disposition"] = `attachment; filename="${bersih}"`;
  }
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(p.req.headers.range ?? ""));
  if (range && (range[1] || range[2])) {
    let awal = range[1] ? Number(range[1]) : st.size - Number(range[2]);
    let akhir = range[1] && range[2] ? Number(range[2]) : st.size - 1;
    awal = Math.max(0, awal);
    akhir = Math.min(akhir, st.size - 1);
    if (awal > akhir || awal >= st.size) {
      p.res.writeHead(416, { "content-range": `bytes */${st.size}` });
      p.res.end();
      return SUDAH_DIKIRIM;
    }
    p.res.writeHead(206, { ...header, "content-range": `bytes ${awal}-${akhir}/${st.size}`, "content-length": akhir - awal + 1 });
    fs.createReadStream(jalur, { start: awal, end: akhir }).pipe(p.res);
    return SUDAH_DIKIRIM;
  }
  p.res.writeHead(200, { ...header, "content-length": st.size });
  fs.createReadStream(jalur).pipe(p.res);
  return SUDAH_DIKIRIM;
}

export function kirimGambar(p: Permintaan, isi: Buffer, jenis = "image/png"): typeof SUDAH_DIKIRIM {
  p.res.writeHead(200, { "content-type": jenis, "content-length": isi.length, "cache-control": "no-store" });
  p.res.end(isi);
  return SUDAH_DIKIRIM;
}

const POLA_ID = /^[0-9]{1,12}$/;

/** Identitas dari SuperApp (lihat akses.py): header X-Autoedit-Pengguna = id akun. */
export function identitas(p: Permintaan): { user_id: string; username: string; anggota?: string } {
  const id = String(p.req.headers["x-autoedit-pengguna"] ?? "").trim();
  if (!POLA_ID.test(id)) throw new GalatHttp(401, "Permintaan tidak lewat SuperApp.");
  // Akun TIM: SuperApp menyertakan id anggota yang sebenarnya mengirim.
  const anggota = String(p.req.headers["x-autoedit-anggota"] ?? "").trim();
  return { user_id: id, username: `pri-${id}`, ...(POLA_ID.test(anggota) ? { anggota } : {}) };
}

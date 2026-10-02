// Layanan API Auto Edit (pengganti FastAPI main.py). Tidak punya port
// jaringan: hanya mendengar di socket Unix yang dipasang ke container ini dan
// aplikasi SuperApp. SuperApp yang memeriksa sesi & peran, lalu meneruskan
// dengan header X-Autoedit-Pengguna (lihat dasar.ts identitas()).
import fs from "node:fs";
import http from "node:http";
import { tutupAntrean } from "../antrean";
import { redis } from "../job";
import { GalatIsiMedia } from "../media";
import { pasangRedisBatas } from "../unduh";
import { jagaVolume } from "../volume";
import { GalatHttp, kirimJson, Router, SUDAH_DIKIRIM, type Permintaan } from "./dasar";
import { pasangRuteOutro } from "./outro";
import { pasangRuteTvr } from "./tvr";
import { pasangRuteVideo } from "./video";

export function buatRouter(): Router {
  const r = new Router();
  r.get("/health", async () => ({ status: "ok" }));
  pasangRuteVideo(r);
  pasangRuteOutro(r);
  pasangRuteTvr(r);
  return r;
}

export function buatServer(router = buatRouter()): http.Server {
  return http.createServer(async (req, res) => {
    const alamat = new URL(req.url ?? "/", "http://autoedit");
    const method = (req.method ?? "GET").toUpperCase();
    // Ekor "/" tidak dikenali FastAPI tanpa pengalihan; sama di sini.
    const cocok = router.cocokkan(method === "HEAD" ? "GET" : method, alamat.pathname);
    if (cocok === null) return kirimJson(res, 404, { detail: "Not Found" });
    if (cocok === "405") return kirimJson(res, 405, { detail: "Method Not Allowed" });
    const pm: Permintaan = { req, res, method, path: alamat.pathname, query: alamat.searchParams, params: cocok.params };
    try {
      const hasil = await cocok.penangan(pm);
      if (hasil === SUDAH_DIKIRIM) return;
      kirimJson(res, 200, hasil ?? null);
    } catch (e) {
      // Sisa badan permintaan dibuang supaya klien tidak macet menunggu.
      req.resume();
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (e instanceof GalatHttp || e instanceof GalatIsiMedia) return kirimJson(res, e.status, { detail: e.detail });
      console.error(`${method} ${alamat.pathname} gagal`, e);
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("Internal Server Error");
    }
  });
}

async function mulai(): Promise<void> {
  const soket = process.env.AUTOEDIT_SOCKET || "/run/autoedit/api.sock";
  // Sisa socket dari proses lama dibuang dulu, kalau tidak bind gagal
  // "Address already in use".
  fs.rmSync(soket, { force: true });
  // Penahan situs (jeda setelah 429) dibagi bersama worker lewat Redis.
  pasangRedisBatas(redis());
  const server = buatServer();
  // Unggahan 100 MB lewat jaringan lambat bisa lama; batas bawaan Node
  // (5 menit permintaan) memutus di tengah jalan.
  server.requestTimeout = 0;
  server.headersTimeout = 60_000;
  server.keepAliveTimeout = 5_000;
  await new Promise<void>((ok) => server.listen(soket, ok));
  // Aplikasi SuperApp berjalan sebagai pengguna lain: socket harus bisa ditulis.
  fs.chmodSync(soket, 0o666);
  console.info(`API Auto Edit (TS) mendengar di ${soket}`);
  const hentikanPenyapu = jagaVolume();
  const tutup = () => {
    hentikanPenyapu();
    server.close(() => {
      void Promise.allSettled([tutupAntrean(), redis().quit()]).then(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on("SIGTERM", tutup);
  process.on("SIGINT", tutup);
}

if (process.env.AUTOEDIT_PERAN === "api") void mulai();

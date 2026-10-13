// Salin video dari Stok mesin Auto Edit (akun bot) ke penyimpanan posting (13 Okt 2026).
// KHUSUS SISI SERVER. Pola sama dengan /api/tv/stok-tim: R2 bila diatur, selain itu bucket
// privat Supabase "tvrku"; isinya dialirkan (tidak ditampung di memori). Tautan hasilnya
// bertanda tangan 7 hari (batas SigV4) dan dipakai upload-post untuk mengunduh video.
import { request as mintaHttp, type IncomingMessage } from "node:http";
import { request as mintaHttps } from "node:https";
import { randomBytes } from "node:crypto";
import { supabase } from "@/lib/supabase";
import { socketAutoEdit } from "@/lib/autoedit";
import { hapusVideoR2, MAKS_UMUR_URL_DETIK, presignR2, r2Siap } from "@/lib/r2";
import { MAKS_VIDEO_POSTING_MB } from "@/lib/bot-posting-murni";

const BUCKET = "tvrku";

/** Galat penyalinan: SELALU "pasti" (belum ada yang dikirim ke sosmed), aman diulang. */
export class GalatSalin extends Error {}

function bukaBerkasStok(idAkunMesin: string, stokId: string): Promise<IncomingMessage> {
  return new Promise((ok, gagal) => {
    const req = mintaHttp(
      {
        socketPath: socketAutoEdit(),
        path: `/api/tvr/stok/${encodeURIComponent(stokId)}/berkas`,
        method: "GET",
        headers: { "x-autoedit-pengguna": idAkunMesin },
        timeout: 60_000,
      },
      ok,
    );
    req.on("timeout", () => req.destroy(new Error("Mesin Auto Edit tidak menjawab.")));
    req.on("error", gagal);
    req.end();
  });
}

function alirkanPut(sumber: IncomingMessage, url: string, panjang: number): Promise<void> {
  return new Promise((ok, gagal) => {
    const req = mintaHttps(url, { method: "PUT", headers: { "Content-Length": String(panjang), "Content-Type": "video/mp4" } }, (res) => {
      res.resume();
      res.on("end", () => ((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300 ? ok() : gagal(new Error(`Penyimpanan menolak berkas (${res.statusCode}).`))));
    });
    req.on("error", gagal);
    sumber.on("error", (e) => req.destroy(e));
    sumber.pipe(req);
  });
}

export type HasilSalin = { key: string; url: string; bytes: number; pakaiR2: boolean };

/** Kunci objek penyimpanan milik akun ini: "<userId>/<waktu>-<acak>.mp4" (sama dengan unggahan TVR Saya). */
export const kunciPenyimpanan = (userId: number): string => `${userId}/${Date.now()}-${randomBytes(6).toString("hex")}.mp4`;

export async function salinStokKePenyimpanan(idAkunMesin: string, stokId: string, key: string): Promise<HasilSalin> {
  if (!/^[0-9a-zA-Z_-]{3,64}$/.test(stokId)) throw new GalatSalin("Id video stok tidak sah.");
  const sumber = await bukaBerkasStok(idAkunMesin, stokId).catch(() => {
    throw new GalatSalin("Mesin Auto Edit tidak bisa dihubungi. Coba lagi sebentar.");
  });
  const panjang = Number(sumber.headers["content-length"] ?? 0);
  if (sumber.statusCode !== 200 || !panjang) {
    sumber.resume();
    throw new GalatSalin(sumber.statusCode === 404 ? "Video stok tidak ditemukan (mungkin sudah lewat masa simpan 48 jam)." : "Video stok gagal diambil dari mesin.");
  }
  if (panjang > MAKS_VIDEO_POSTING_MB * 1_048_576) {
    sumber.resume();
    throw new GalatSalin(`Video ${Math.round(panjang / 1_048_576)} MB melebihi batas ${MAKS_VIDEO_POSTING_MB} MB.`);
  }
  const pakaiR2 = r2Siap();
  let urlPut = pakaiR2 ? presignR2("PUT", key, 900) : "";
  if (!pakaiR2) {
    const { data, error } = await supabase().storage.from(BUCKET).createSignedUploadUrl(key);
    if (error || !data) {
      sumber.resume();
      console.error("[bot-stok-salin] siapkan unggahan:", error?.message);
      throw new GalatSalin("Penyimpanan video belum siap. Coba lagi.");
    }
    urlPut = data.signedUrl;
  }
  await alirkanPut(sumber, urlPut, panjang).catch((e) => {
    console.error("[bot-stok-salin] simpan berkas:", e instanceof Error ? e.message : e);
    throw new GalatSalin("Video gagal disalin ke penyimpanan. Coba lagi.");
  });
  const url = pakaiR2
    ? presignR2("GET", key, MAKS_UMUR_URL_DETIK)
    : ((await supabase().storage.from(BUCKET).createSignedUrl(key, MAKS_UMUR_URL_DETIK)).data?.signedUrl ?? "");
  if (!url) {
    await hapusBerkasPenyimpanan(key, pakaiR2);
    throw new GalatSalin("Tautan video gagal dibuat. Coba lagi.");
  }
  return { key, url, bytes: panjang, pakaiR2 };
}

/** Hapus objek penyimpanan (R2 atau bucket cadangan); tidak pernah melempar. */
export async function hapusBerkasPenyimpanan(key: string, pakaiR2: boolean): Promise<void> {
  if (!key) return;
  try {
    if (pakaiR2) await hapusVideoR2(key);
    else await supabase().storage.from(BUCKET).remove([key]);
  } catch (e) {
    console.error("[bot-stok-salin] hapus berkas:", e instanceof Error ? e.message : e);
  }
}

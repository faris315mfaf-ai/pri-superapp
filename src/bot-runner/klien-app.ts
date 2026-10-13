// ============================================================
// RUMAH BOT (runner) — klien HTTPS ke aplikasi (13 Okt 2026).
// POST ${APP_URL}/api/bot/internal, badan JSON ditandatangani HMAC (hmac.ts).
// Runner memanggil aplikasi lewat internet publik: firewall keluar kontainer
// menolak alamat privat. Hanya fetch global Node 22; tanpa dependensi.
// ============================================================

import type { JawabanDenyut, LaporanRunner, PerintahRunner, PermintaanRunner, SumberPanen } from "../lib/bot-protokol";
import { GalatApp, pesanGalat } from "./galat";
import { headerTertanda } from "./hmac";
import type { KonfigRunner } from "./konfig";

export interface KlienApp {
  denyut(): Promise<JawabanDenyut>;
  ambilKerja(botId: number): Promise<PerintahRunner>;
  lapor(botId: number, laporan: LaporanRunner): Promise<void>;
}

type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

const BATAS_WAKTU_MS = 20_000;
const MAKS_JAWABAN_BYTE = 256 * 1024;
const PERCOBAAN_LAPOR = 3;

const adalahObjek = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const bulatPositif = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x > 0;
const teks = (x: unknown): x is string => typeof x === "string";

/**
 * Memeriksa bentuk perintah dari aplikasi. Perintah yang bentuknya salah
 * ditolak (null) — runner tidak menebak. MURNI.
 */
export function validasiPerintah(x: unknown): PerintahRunner | null {
  if (!adalahObjek(x)) return null;
  switch (x.perintah) {
    case "diam":
      return { perintah: "diam", alasan: teks(x.alasan) ? x.alasan.slice(0, 200) : "" };
    case "panen": {
      if (!Array.isArray(x.sumber)) return null;
      const sumber: SumberPanen[] = [];
      for (const s of x.sumber.slice(0, 10)) {
        if (!adalahObjek(s) || !bulatPositif(s.id) || !teks(s.platform) || !teks(s.handle)) return null;
        sumber.push({ id: s.id, platform: s.platform, handle: s.handle });
      }
      return { perintah: "panen", sumber };
    }
    case "buat_video": {
      if (!bulatPositif(x.tugas_id) || !bulatPositif(x.id_pengguna_mesin)) return null;
      if (!teks(x.url) || !teks(x.naskah) || !teks(x.kategori) || !teks(x.sumber_label)) return null;
      return {
        perintah: "buat_video",
        tugas_id: x.tugas_id,
        url: x.url,
        naskah: x.naskah,
        kategori: x.kategori,
        sumber_label: x.sumber_label,
        id_pengguna_mesin: x.id_pengguna_mesin,
      };
    }
    case "pantau_job": {
      if (!bulatPositif(x.tugas_id) || !bulatPositif(x.id_pengguna_mesin)) return null;
      const idJob = x.id_job_mesin === null || x.id_job_mesin === undefined ? null : teks(x.id_job_mesin) ? x.id_job_mesin : undefined;
      const hook = x.hook === null || x.hook === undefined ? null : teks(x.hook) ? x.hook : undefined;
      if (idJob === undefined || hook === undefined) return null;
      return { perintah: "pantau_job", tugas_id: x.tugas_id, id_job_mesin: idJob, hook, id_pengguna_mesin: x.id_pengguna_mesin };
    }
    default:
      return null;
  }
}

/** Memeriksa jawaban denyut. MURNI. */
export function validasiDenyut(x: unknown): JawabanDenyut | null {
  if (!adalahObjek(x) || x.sukses !== true || typeof x.jeda_global !== "boolean" || !Array.isArray(x.bots)) return null;
  const bots: JawabanDenyut["bots"] = [];
  for (const b of x.bots) {
    if (!adalahObjek(b)) return null;
    // bot_id wajib untuk ambil_kerja; entri tanpa bot_id (aplikasi lama) dilewati.
    if (!bulatPositif(b.bot_id)) continue;
    bots.push({
      bot_id: b.bot_id,
      user_id: bulatPositif(b.user_id) ? b.user_id : 0,
      aktif: b.aktif === true,
      jeda: b.jeda === true,
      mode: b.mode === "otomatis" ? "otomatis" : "acc",
    });
  }
  return {
    sukses: true,
    jeda_global: x.jeda_global,
    menit_wib: typeof x.menit_wib === "number" ? x.menit_wib : 0,
    bots,
  };
}

export function buatKlienApp(konfig: KonfigRunner, fetchFn: FetchFn = fetch as unknown as FetchFn): KlienApp {
  const url = `${konfig.appUrl}/api/bot/internal`;

  async function kirim(permintaan: PermintaanRunner): Promise<unknown> {
    const badan = JSON.stringify(permintaan);
    let res: Response;
    try {
      res = await fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headerTertanda(konfig.rahasia, badan) },
        body: badan,
        signal: AbortSignal.timeout(BATAS_WAKTU_MS),
        redirect: "error",
      });
    } catch (e) {
      throw new GalatApp(0, `tak tersambung: ${pesanGalat(e, 120)}`);
    }
    const mentah = await res.text().catch(() => "");
    if (mentah.length > MAKS_JAWABAN_BYTE) throw new GalatApp(res.status, "jawaban terlalu besar");
    let json: unknown = null;
    try {
      json = mentah ? JSON.parse(mentah) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const pesan = adalahObjek(json) && teks(json.error) ? json.error : `HTTP ${res.status}`;
      throw new GalatApp(res.status, pesan.slice(0, 200));
    }
    return json;
  }

  return {
    async denyut() {
      const j = validasiDenyut(await kirim({ aksi: "denyut", versi: konfig.versi }));
      if (!j) throw new GalatApp(200, "jawaban denyut tidak dikenal");
      return j;
    },
    async ambilKerja(botId) {
      const j = await kirim({ aksi: "ambil_kerja", bot_id: botId });
      const p = adalahObjek(j) && j.sukses === true ? validasiPerintah(j.perintah) : null;
      if (!p) throw new GalatApp(200, "perintah tidak dikenal");
      return p;
    },
    async lapor(botId, laporan) {
      // Laporan hasil penting: ulangi untuk galat jaringan/5xx, JANGAN untuk 4xx.
      let terakhir: unknown = null;
      for (let i = 0; i < PERCOBAAN_LAPOR; i++) {
        try {
          await kirim({ aksi: "lapor", bot_id: botId, laporan });
          return;
        } catch (e) {
          terakhir = e;
          const status = e instanceof GalatApp ? e.status : 0;
          if (status >= 400 && status < 500) break;
          await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
        }
      }
      throw terakhir instanceof Error ? terakhir : new GalatApp(0, "lapor gagal");
    },
  };
}

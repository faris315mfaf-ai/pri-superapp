// ============================================================
// Unggah video TVR Saya — sisi PERAMBAN (5 Sep 2026). Satu pintu untuk
// Unggah ke Sosmed Saya, Siaran Serentak, dan Studio PALUGODAM:
//   <= 100 MB: langsung ke penyimpanan (R2 atau bucket Supabase sendiri)
//              lewat URL bertanda tangan dari server, apa adanya.
//   > 100 MB : ditolak server.
// 2 Okt 2026: jalur kompresi Cloudinary (50–100 MB) tidak dipakai lagi —
// akun Cloudinary dinonaktifkan ("cloud_name is disabled"). Server tidak
// lagi menjawab cara "cloudinary"; cabangnya di bawah tinggal untuk
// jawaban lama yang mungkin masih tersimpan di peramban.
// ============================================================
import { kompresUnggahTvrku, laporAktivitas, siapkanUnggahTvrku } from "@/services";

/** Di atas ini dikompres otomatis (harus sama dengan BATAS_KOMPRES_MB server). */
export const KOMPRES_MB = 50;
/** Batas berkas yang masih bisa diterima (paket Cloudinary Free: 100 MB). */
export const BATAS_BERKAS_MB = 100;

export type TahapUnggahVideo = "unggah" | "kompres";
export type HasilUnggahVideo = {
  cara: "r2" | "supabase";
  r2_key?: string;
  path?: string;
  /** Ukuran berkas yang benar-benar tersimpan (setelah kompresi bila ada). */
  ukuran: number;
  dikompres: boolean;
};

/** Durasi (detik) dari metadata berkas; 0 bila tidak terbaca / > 8 dtk. */
export function durasiBerkasVideo(berkas: File): Promise<number> {
  return new Promise((selesai) => {
    try {
      const v = document.createElement("video");
      v.preload = "metadata";
      const url = URL.createObjectURL(berkas);
      let sudah = false;
      const rapikan = (d: number) => {
        if (sudah) return;
        sudah = true;
        URL.revokeObjectURL(url);
        selesai(Number.isFinite(d) && d > 0 ? d : 0);
      };
      v.onloadedmetadata = () => rapikan(v.duration);
      v.onerror = () => rapikan(0);
      setTimeout(() => rapikan(0), 8000);
      v.src = url;
    } catch {
      selesai(0);
    }
  });
}

/** Jenis kegagalan di sisi peramban (bukan jawaban server). */
export type JenisGalatUnggah = "jaringan" | "timeout" | "batal";

/**
 * Galat unggah dengan jenis yang jelas: "batal" = pengguna membatalkan
 * (jangan diulang, jangan ditampilkan sebagai galat merah); "jaringan" /
 * "timeout" = bisa diulang otomatis.
 */
export class GalatUnggah extends Error {
  readonly jenis: JenisGalatUnggah;
  constructor(jenis: JenisGalatUnggah, pesan: string) {
    super(pesan);
    this.name = "GalatUnggah";
    this.jenis = jenis;
  }
}

/** True bila galat berasal dari pembatalan oleh pengguna. */
export function adalahPembatalanUnggah(e: unknown): boolean {
  return e instanceof GalatUnggah && e.jenis === "batal";
}

const PESAN_BATAL = "Unggahan dibatalkan.";
const PESAN_JARINGAN = "Koneksi terputus saat mengunggah video. Coba lagi.";
const PESAN_TIMEOUT = "Unggahan terlalu lama dan dihentikan. Periksa koneksi internet Anda, lalu coba lagi.";

/** Batas waktu satu permintaan bawaan (cukup untuk 100 MB di jaringan lambat). */
const TIMEOUT_BAWAAN_MS = 10 * 60_000;
/** Total percobaan PUT bertanda tangan (1 awal + 2 ulang). */
const MAKS_PERCOBAAN = 3;
/** Jeda sebelum percobaan ke-2 dan ke-3 (ms), ditambah jitter acak. */
const JEDA_ULANG_MS = [1500, 4000];

/** Batas waktu menurut ukuran: 2 menit + ±150 KB/dtk, tertinggi 20 menit. */
function timeoutUntukUkuran(ukuran: number): number {
  return Math.min(20 * 60_000, 2 * 60_000 + (ukuran / (150 * 1024)) * 1000);
}

function kirimXhr(
  metode: "PUT" | "POST",
  url: string,
  isi: File | FormData,
  header: Record<string, string>,
  onProgres?: (p: number) => void,
  opsi: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<XMLHttpRequest> {
  return new Promise((selesai, gagal) => {
    const { signal } = opsi;
    if (signal?.aborted) {
      gagal(new GalatUnggah("batal", PESAN_BATAL));
      return;
    }
    const xhr = new XMLHttpRequest();
    const saatBatal = () => xhr.abort();
    const lepas = () => signal?.removeEventListener("abort", saatBatal);
    xhr.open(metode, url);
    xhr.timeout = opsi.timeoutMs ?? TIMEOUT_BAWAAN_MS;
    for (const [k, v] of Object.entries(header)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgres?.(Math.round((100 * ev.loaded) / ev.total));
    };
    xhr.onload = () => {
      lepas();
      selesai(xhr);
    };
    xhr.onerror = () => {
      lepas();
      gagal(new GalatUnggah("jaringan", PESAN_JARINGAN));
    };
    xhr.ontimeout = () => {
      lepas();
      gagal(new GalatUnggah("timeout", PESAN_TIMEOUT));
    };
    xhr.onabort = () => {
      lepas();
      gagal(new GalatUnggah("batal", PESAN_BATAL));
    };
    signal?.addEventListener("abort", saatBatal, { once: true });
    xhr.send(isi);
  });
}

/** Tunggu `ms` tetapi putus seketika bila dibatalkan. */
function tidur(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((selesai, gagal) => {
    if (signal?.aborted) {
      gagal(new GalatUnggah("batal", PESAN_BATAL));
      return;
    }
    const saatBatal = () => {
      clearTimeout(t);
      gagal(new GalatUnggah("batal", PESAN_BATAL));
    };
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", saatBatal);
      selesai();
    }, ms);
    signal?.addEventListener("abort", saatBatal, { once: true });
  });
}

/**
 * PUT ke URL bertanda tangan dengan percobaan ulang (maks 3 kali total):
 *  - jaringan putus / timeout / status 5xx → ulang dengan jeda 1,5 dtk lalu 4 dtk (+ jitter);
 *  - status 403 (URL kedaluwarsa) → minta URL baru lewat `perbaruiUrl` lalu ulang;
 *  - 4xx lain (mis. 413) → langsung gagal dengan pesan dari `pesanTolak`;
 *  - dibatalkan pengguna → langsung berhenti (GalatUnggah jenis "batal").
 * Progres dikembalikan ke 0 tiap kali mengulang.
 */
async function putDenganUlang(
  urlAwal: string,
  berkas: File,
  onProgres: ((p: number) => void) | undefined,
  pesanTolak: (status: number) => string,
  opsi: { signal?: AbortSignal; perbaruiUrl?: () => Promise<string> } = {},
): Promise<void> {
  const header = { "content-type": berkas.type || "video/mp4" };
  const timeoutMs = timeoutUntukUkuran(berkas.size);
  let url = urlAwal;
  for (let ke = 1; ; ke++) {
    const terakhir = ke >= MAKS_PERCOBAAN;
    let alasan: GalatUnggah | { status: number };
    try {
      const xhr = await kirimXhr("PUT", url, berkas, header, onProgres, { signal: opsi.signal, timeoutMs });
      if (xhr.status >= 200 && xhr.status < 300) return;
      alasan = { status: xhr.status };
    } catch (e) {
      if (e instanceof GalatUnggah && e.jenis !== "batal") alasan = e;
      else throw e;
    }

    const status = "status" in alasan ? alasan.status : 0;
    const bisaDiulang = status === 0 || status >= 500 || (status === 403 && Boolean(opsi.perbaruiUrl));
    if (!bisaDiulang) throw new Error(pesanTolak(status));
    if (terakhir) {
      if (alasan instanceof GalatUnggah) {
        throw new GalatUnggah(
          alasan.jenis,
          alasan.jenis === "timeout"
            ? `Unggahan terlalu lama dan dihentikan setelah dicoba ${MAKS_PERCOBAAN} kali. Periksa koneksi internet Anda, lalu coba lagi.`
            : `Koneksi terputus saat mengunggah video (sudah dicoba ${MAKS_PERCOBAAN} kali). Periksa koneksi internet Anda, lalu coba lagi.`,
        );
      }
      throw new Error(pesanTolak(status));
    }

    onProgres?.(0);
    if (status === 403 && opsi.perbaruiUrl) {
      // URL bertanda tangan kedaluwarsa: minta yang baru, langsung ulang.
      url = await opsi.perbaruiUrl();
      if (opsi.signal?.aborted) throw new GalatUnggah("batal", PESAN_BATAL);
    } else {
      await tidur(JEDA_ULANG_MS[ke - 1] + Math.random() * 500, opsi.signal);
    }
  }
}

/**
 * Kirim satu berkas ke URL PUT bertanda tangan (R2 / bucket) dengan
 * kemajuan. Dipakai bahan Video Wajib (13 Sep 2026) — bahan mentah
 * TIDAK dikompres: kreator butuh kualitas aslinya.
 * `opsi.perbaruiUrl` (opsional): dipanggil bila URL ditolak 403 (kedaluwarsa)
 * dan harus mengembalikan URL baru; tanpanya 403 langsung gagal.
 */
export async function unggahKeUrlTanda(
  url: string,
  berkas: File,
  onProgres?: (p: number) => void,
  opsi: { signal?: AbortSignal; perbaruiUrl?: () => Promise<string> } = {},
): Promise<void> {
  await putDenganUlang(
    url,
    berkas,
    onProgres,
    (status) =>
      status === 413
        ? "Penyimpanan menolak: ukuran video melebihi batas server saat ini."
        : `Penyimpanan menolak berkas ini (${status}). Coba lagi.`,
    opsi,
  );
}

type OpsiUnggahVideo = {
  onProgres?: (p: number) => void;
  onTahap?: (t: TahapUnggahVideo) => void;
  /** Batalkan unggahan (galat GalatUnggah jenis "batal"). */
  signal?: AbortSignal;
};

/**
 * Unggah video ke penyimpanan. Selama berlangsung, karakter pengguna di Ruang Bot (master) beranimasi
 * mengisi rak database: mulai/selesai dilaporkan ke /api/aktivitas (tidak pernah mengganggu unggahan).
 */
export async function unggahVideoTvrku(berkas: File, opsi: OpsiUnggahVideo = {}): Promise<HasilUnggahVideo> {
  const tokenJanji = laporAktivitas({ aksi: "mulai", jenis: "upload_video", judul: berkas.name });
  // Sewa: server menganggap aksi usai bila denyut berhenti (tab ditutup / jaringan putus).
  const denyut = window.setInterval(() => {
    void tokenJanji.then((token) => (token ? laporAktivitas({ aksi: "denyut", token }) : null));
  }, 30_000);
  try {
    return await unggahVideoTvrkuInti(berkas, opsi);
  } finally {
    window.clearInterval(denyut);
    void tokenJanji.then((token) => (token ? laporAktivitas({ aksi: "selesai", token }) : null));
  }
}

async function unggahVideoTvrkuInti(berkas: File, opsi: OpsiUnggahVideo): Promise<HasilUnggahVideo> {
  if (opsi.signal?.aborted) throw new GalatUnggah("batal", PESAN_BATAL);
  let siap = await siapkanUnggahTvrku(berkas.name, berkas.size);
  // Pengguna bisa membatalkan selagi menunggu server menyiapkan URL.
  if (opsi.signal?.aborted) throw new GalatUnggah("batal", PESAN_BATAL);
  opsi.onTahap?.("unggah");
  opsi.onProgres?.(0);

  if (siap.cara === "cloudinary") {
    if (!siap.cloudName || !siap.uploadPreset) throw new Error("Konfigurasi kompresi tidak lengkap.");
    const durasiLokal = await durasiBerkasVideo(berkas);
    const bentuk = new FormData();
    bentuk.append("file", berkas);
    bentuk.append("upload_preset", siap.uploadPreset);
    bentuk.append("resource_type", "video");
    const xhr = await kirimXhr("POST", `https://api.cloudinary.com/v1_1/${siap.cloudName}/video/upload`, bentuk, {}, opsi.onProgres, { signal: opsi.signal });
    let json: { public_id?: string; bytes?: number; duration?: number; error?: { message?: string } } = {};
    try {
      json = JSON.parse(xhr.responseText);
    } catch {
      throw new Error("Balasan penyimpanan tidak terbaca.");
    }
    if (xhr.status < 200 || xhr.status >= 300 || !json.public_id) {
      throw new Error(json.error?.message ?? "Penyimpanan menolak video ini.");
    }
    opsi.onTahap?.("kompres");
    const h = await kompresUnggahTvrku({
      public_id: json.public_id,
      ukuran: json.bytes ?? berkas.size,
      durasi: json.duration || durasiLokal,
    });
    return h.cara === "r2"
      ? { cara: "r2", r2_key: h.r2_key, ukuran: h.ukuran, dikompres: h.dikompres }
      : { cara: "supabase", path: h.path, ukuran: h.ukuran, dikompres: h.dikompres };
  }

  if (!siap.url) throw new Error("URL unggah tidak tersedia. Coba lagi.");
  await putDenganUlang(
    siap.url,
    berkas,
    opsi.onProgres,
    (status) =>
      status === 413
        ? // Supabase punya batas GLOBAL per proyek (bawaan 50 MB) di luar batas
          // aplikasi — hanya bisa dinaikkan admin di Dashboard Supabase → Storage → Settings.
          "Penyimpanan menolak: ukuran video melebihi batas server saat ini. Coba lagi atau minta admin menaikkan batas unggah di Supabase."
        : `Penyimpanan video menolak berkas ini (${status}). Coba lagi.`,
    {
      signal: opsi.signal,
      // URL bertanda tangan kedaluwarsa (403): minta yang baru — kunci/path
      // objeknya ikut berganti, jadi simpan jawaban barunya.
      perbaruiUrl: async () => {
        const baru = await siapkanUnggahTvrku(berkas.name, berkas.size);
        if (!baru.url) throw new Error("URL unggah tidak tersedia. Coba lagi.");
        siap = baru;
        return baru.url;
      },
    },
  );
  return siap.cara === "r2"
    ? { cara: "r2", r2_key: siap.r2_key, ukuran: berkas.size, dikompres: false }
    : { cara: "supabase", path: siap.path, ukuran: berkas.size, dikompres: false };
}

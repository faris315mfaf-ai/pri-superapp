// ============================================================
// Unggah video TVR Saya — sisi PERAMBAN (5 Sep 2026). Satu pintu untuk
// Unggah ke Sosmed Saya, Siaran Serentak, dan Studio PALUGODAM:
//   <= 50 MB : langsung ke R2 (URL bertanda tangan dari server) — TIDAK diubah.
//   50–100 MB: ke Cloudinary dulu → server mengompres (plafon bitrate
//              sesuai durasi, kualitas dijaga) → hasil <= 50 MB disalin ke
//              R2 → kembali sebagai r2_key seperti biasa.
//   > 100 MB : ditolak server (batas berkas Cloudinary).
// ============================================================
import { kompresUnggahTvrku, siapkanUnggahTvrku } from "@/services";

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

function kirimXhr(
  metode: "PUT" | "POST",
  url: string,
  isi: File | FormData,
  header: Record<string, string>,
  onProgres?: (p: number) => void,
): Promise<XMLHttpRequest> {
  return new Promise((selesai, gagal) => {
    const xhr = new XMLHttpRequest();
    xhr.open(metode, url);
    for (const [k, v] of Object.entries(header)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgres?.(Math.round((100 * ev.loaded) / ev.total));
    };
    xhr.onload = () => selesai(xhr);
    xhr.onerror = () => gagal(new Error("Koneksi terputus saat mengunggah video. Coba lagi."));
    xhr.send(isi);
  });
}

export async function unggahVideoTvrku(
  berkas: File,
  opsi: { onProgres?: (p: number) => void; onTahap?: (t: TahapUnggahVideo) => void } = {},
): Promise<HasilUnggahVideo> {
  const siap = await siapkanUnggahTvrku(berkas.name, berkas.size);
  opsi.onTahap?.("unggah");
  opsi.onProgres?.(0);

  if (siap.cara === "cloudinary") {
    if (!siap.cloudName || !siap.uploadPreset) throw new Error("Konfigurasi kompresi tidak lengkap.");
    const durasiLokal = await durasiBerkasVideo(berkas);
    const bentuk = new FormData();
    bentuk.append("file", berkas);
    bentuk.append("upload_preset", siap.uploadPreset);
    bentuk.append("resource_type", "video");
    const xhr = await kirimXhr("POST", `https://api.cloudinary.com/v1_1/${siap.cloudName}/video/upload`, bentuk, {}, opsi.onProgres);
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
  const xhr = await kirimXhr("PUT", siap.url, berkas, { "content-type": berkas.type || "video/mp4" }, opsi.onProgres);
  if (xhr.status < 200 || xhr.status >= 300) {
    throw new Error(
      xhr.status === 413
        ? // Supabase punya batas GLOBAL per proyek (bawaan 50 MB) di luar batas
          // aplikasi — hanya bisa dinaikkan admin di Dashboard Supabase → Storage → Settings.
          "Penyimpanan menolak: ukuran video melebihi batas server saat ini. Coba lagi atau minta admin menaikkan batas unggah di Supabase."
        : "Penyimpanan video menolak berkas ini. Coba lagi.",
    );
  }
  return siap.cara === "r2"
    ? { cara: "r2", r2_key: siap.r2_key, ukuran: berkas.size, dikompres: false }
    : { cara: "supabase", path: siap.path, ukuran: berkas.size, dikompres: false };
}

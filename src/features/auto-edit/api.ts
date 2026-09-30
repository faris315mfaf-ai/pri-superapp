// ============================================================
// Auto Edit — penghubung ke layanan GODAM (Python) lewat server SuperApp.
//
// Peramban tidak pernah bicara langsung dengan layanan itu: permintaan ke
// /api/autoedit/<sisa> diteruskan server ke /api/<sisa> milik layanan.
// Kode kedua alat sengaja tetap menulis "/api/video/..." dan
// "/api/outro/..." seperti aslinya di GODAM; awalannya diganti di sini,
// jadi perubahan dari GODAM bisa dibawa masuk tanpa menyisir ulang setiap
// alamat.
//
// Identitas cukup token perangkat SuperApp. Modul ini hanya tampil untuk
// master yang sudah masuk, jadi tidak ada layar masuk sendiri.
// ============================================================

import { ambilToken } from "@/services";

/** "/api/video/x" → "/api/autoedit/video/x"; alamat lain (mis. Supabase) dibiarkan. */
export function urlApi(path: string): string {
  return path.startsWith("/api/") ? `/api/autoedit/${path.slice(5)}` : path;
}

/** `fetch` ke layanan Auto Edit dengan token SuperApp di header Authorization. */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  // Token hanya untuk jalur sendiri — alamat luar tidak boleh ikut menerimanya.
  const token = path.startsWith("/api/") ? ambilToken() : "";
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(urlApi(path), { ...init, headers });
}

/**
 * Isi jawaban sebagai objek. Galat dari penerus (mis. 502 berisi HTML)
 * bukan JSON — tanpa ini yang tampil ke pengguna justru "Unexpected token <".
 */
export async function bacaJson(res: Response): Promise<Record<string, any>> {
  try {
    const data: unknown = await res.json();
    return data && typeof data === "object" ? (data as Record<string, any>) : {};
  } catch {
    return {};
  }
}

/**
 * Kalimat galat untuk pengguna. FastAPI menaruhnya di `detail` — teks biasa,
 * atau daftar temuan validasi pada 422. Jawaban tanpa `detail` datang dari
 * penerus SuperApp sendiri: 404 berarti akun ini tidak diizinkan, 503 berarti
 * layanannya mati.
 */
export function pesanGalat(status: number, data: Record<string, any>, cadangan: string): string {
  const detail = data.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const pesan = detail
      .map((d) => (d && typeof d === "object" && "msg" in d ? String(d.msg) : String(d)))
      .filter(Boolean)
      .join("; ");
    if (pesan) return pesan;
  }
  if (typeof data.error === "string" && data.error.trim()) return data.error;
  if (status === 401) return "Sesimu sudah berakhir. Muat ulang aplikasi lalu masuk lagi.";
  if (status === 404) return "Auto Edit tidak tersedia untuk akunmu.";
  if (status === 503) return "Layanan Auto Edit sedang tidak aktif. Coba lagi beberapa saat lagi.";
  return cadangan;
}

/**
 * Unggah satu berkas sambil melaporkan kemajuannya.
 *
 * Memakai XMLHttpRequest, bukan fetch: fetch tidak bisa melaporkan berapa
 * banyak yang sudah terkirim, sedangkan berkas layer bisa puluhan MB dan
 * orang perlu tahu unggahannya benar-benar berjalan.
 *
 * `onProgres` menerima 0-100 untuk bagian pengirimannya saja. Setelah 100,
 * server masih memeriksa dan merapikan berkasnya, jadi pemanggil sebaiknya
 * menampilkan keadaan "sedang diproses" sampai jawabannya datang.
 */
export function apiUnggah(
  path: string,
  file: File,
  onProgres: (persen: number) => void,
): Promise<{ ok: boolean; status: number; data: Record<string, any> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", urlApi(path));
    const token = path.startsWith("/api/") ? ambilToken() : "";
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgres(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      }
    };
    xhr.upload.onload = () => onProgres(100);
    xhr.onload = () => {
      let data: Record<string, any> = {};
      try {
        data = JSON.parse(xhr.responseText || "{}");
      } catch {
        data = {};
      }
      // Galat server tanpa "detail" (mis. 500 bertubuh teks polos) dulu
      // tampil sebagai "Gagal mengunggah" saja, tanpa petunjuk bahwa
      // masalahnya di server. 503 dibiarkan: pesanGalat punya kalimatnya.
      if (xhr.status >= 500 && xhr.status !== 503 && !data.detail) {
        data = {
          detail:
            `Server tidak bisa menyimpan berkasnya (kode ${xhr.status}). ` +
            "Coba lagi beberapa saat lagi.",
        };
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
    };
    xhr.onerror = () => reject(new Error("Sambungan terputus saat mengunggah."));
    xhr.onabort = () => reject(new Error("Unggahan dibatalkan."));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

// ---- Isian tersimpan ----
// Dulu isian naik ke server GODAM (/api/forms); jalur itu tidak ikut
// dipindah. Cukup disimpan di perangkat ini supaya tidak hilang saat
// aplikasi dimuat ulang.
const AWALAN_SIMPANAN = "pri-autoedit-";

export function bacaSimpanan<T extends object>(nama: string, bawaan: T): T {
  try {
    const isi = window.localStorage.getItem(AWALAN_SIMPANAN + nama);
    return isi ? { ...bawaan, ...(JSON.parse(isi) as Partial<T>) } : bawaan;
  } catch {
    return bawaan;
  }
}

export function simpanSimpanan(nama: string, nilai: object): void {
  try {
    window.localStorage.setItem(AWALAN_SIMPANAN + nama, JSON.stringify(nilai));
  } catch {
    // Penyimpanan penuh atau diblokir (mode privat): isian sekadar tidak tersimpan.
  }
}

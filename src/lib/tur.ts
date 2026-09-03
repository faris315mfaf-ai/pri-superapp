// ============================================================
// Tur pemandu "Daftar akun & cek kepatuhan komen" (3 Sep 2026).
// Definisi langkah + alat bantu kecil. Komponen tampilannya ada di
// features/tur/tur-pemandu.tsx; tombol/menu yang disorot ditandai
// atribut data-tur="<nama>" di komponen aslinya.
//
// Cara maju tiap langkah:
//   klik            → pengguna mengetuk bagian yang disorot
//   klik-lalu-hilang→ mengetuk, dan tur menunggu bagian itu HILANG
//                     (mis. tombol Simpan lenyap = tersimpan sukses)
//   isi             → nilai kotak isian minimal 2 huruf
// lewatiBilaTampak: bila target langkah berikutnya sudah terlihat,
// langkah ini dilewati otomatis (mis. sudah berada di tab Profil).
// ============================================================

export const PERISTIWA_TUR = "pri:tur-akun";
export const VERSI_TUR = "v1";

export type LangkahTur = {
  /** Satu atau beberapa data-tur; bila beberapa, sorotan = gabungan kotaknya. */
  target: string[];
  judul: string;
  isi: string;
  maju: "klik" | "klik-lalu-hilang" | "isi";
  /** Ketukan pada data-tur ini juga dianggap maju (selain target utama). */
  klikJuga?: string[];
  lewatiBilaTampak?: string;
};

export const LANGKAH_TUR: LangkahTur[] = [
  {
    target: ["nav-profil"],
    judul: "Buka menu Profil",
    isi: "Ketuk menu Profil (di bawah pada HP, di samping kiri pada layar besar).",
    maju: "klik",
    lewatiBilaTampak: "tab-keamanan",
  },
  {
    target: ["tab-keamanan"],
    judul: "Profil & Keamanan",
    isi: "Ketuk tab Profil & Keamanan.",
    maju: "klik",
    lewatiBilaTampak: "akun-sosmed",
  },
  {
    target: ["akun-sosmed"],
    judul: "Akun Media Sosial Saya",
    isi: "Ketuk Akun Media Sosial Saya. Di sini username Anda didaftarkan supaya komentar Anda dihitung oleh sistem.",
    maju: "klik",
    lewatiBilaTampak: "tambah-akun",
  },
  {
    target: ["tambah-akun"],
    judul: "Tambah Akun",
    isi: "Ketuk tombol Tambah Akun.",
    maju: "klik",
    lewatiBilaTampak: "pilih-platform",
  },
  {
    target: ["pilih-platform"],
    judul: "Pilih media sosialnya",
    isi: "Ketuk Instagram, TikTok, X, Threads, atau YouTube — sesuai akun yang Anda pakai berkomentar.",
    maju: "klik",
    klikJuga: ["isi-username"],
  },
  {
    target: ["isi-username"],
    judul: "Isi username",
    isi: "Ketik username akun Anda persis seperti di aplikasinya, tanpa tanda @.",
    maju: "isi",
  },
  {
    target: ["isi-username", "simpan-akun"],
    judul: "Simpan",
    isi: "Sudah benar? Ketuk Simpan. Punya akun lain? Ulangi Tambah Akun setelah tutorial selesai.",
    maju: "klik-lalu-hilang",
  },
  {
    target: ["tutup-akun-sosmed"],
    judul: "Akun tersimpan",
    isi: "Ketuk tanda silang untuk menutup jendela ini.",
    maju: "klik",
  },
  {
    target: ["nav-beranda"],
    judul: "Kembali ke Beranda",
    isi: "Ketuk menu Beranda.",
    maju: "klik",
    lewatiBilaTampak: "tombol-leaderboard",
  },
  {
    target: ["tombol-leaderboard"],
    judul: "Buka Leaderboard",
    isi: "Ketuk ikon mahkota untuk membuka leaderboard.",
    maju: "klik",
    lewatiBilaTampak: "mode-komen",
  },
  {
    target: ["mode-komen"],
    judul: "Kepatuhan Komen",
    isi: "Ketuk Kepatuhan Komen. Di sini terlihat siapa yang sudah dan belum berkomentar; ketuk nama untuk rinciannya dan ajukan bila komentar belum tercatat.",
    maju: "klik",
  },
];

/** Kunci localStorage penanda tur sudah selesai/dilewati per pengguna. */
export function kunciTurSelesai(userId: string): string {
  return `pri-tur-akun:${VERSI_TUR}:${userId}`;
}

export function turSudahSelesai(userId: string): boolean {
  try {
    return Boolean(window.localStorage.getItem(kunciTurSelesai(userId)));
  } catch {
    return false;
  }
}

export function tandaiTurSelesai(userId: string, cara: "selesai" | "lewati"): void {
  try {
    window.localStorage.setItem(kunciTurSelesai(userId), `${cara}:${new Date().toISOString()}`);
  } catch {
    // penyimpanan peramban tidak tersedia — abaikan
  }
}

/** Mulai tur dari mana saja (mis. baris "Tutorial" di Profil). */
export function mulaiTur(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PERISTIWA_TUR));
}

/**
 * Elemen ber-data-tur yang benar-benar terlihat: bukan di dalam tab
 * tersembunyi (kelas `invisible`), punya ukuran, dan tidak disembunyikan CSS.
 */
export function elemenTur(nama: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const semua = document.querySelectorAll<HTMLElement>(`[data-tur="${nama}"]`);
  for (const el of semua) {
    if (el.closest(".invisible")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = window.getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
    return el;
  }
  return null;
}

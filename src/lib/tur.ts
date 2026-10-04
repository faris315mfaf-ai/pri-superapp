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
  /**
   * Satu atau beberapa data-tur; bila beberapa, sorotan = gabungan kotaknya.
   * Kosong = kartu di tengah layar tanpa sorotan (mis. contoh bergambar).
   */
  target: string[];
  judul: string;
  isi: string;
  /** "lanjut" (5 Okt 2026): kartu penjelasan dengan tombol Lanjut. */
  maju: "klik" | "klik-lalu-hilang" | "isi" | "lanjut";
  /** Ketukan pada data-tur ini juga dianggap maju (selain target utama). */
  klikJuga?: string[];
  lewatiBilaTampak?: string;
  /**
   * Bagian ini tidak selalu ada (mis. tidak ada akun yang perlu disambung
   * ulang, Edit Otomatis masih terkunci): bila targetnya tidak tampak,
   * langkah DILEWATI — bukan mundur atau mengakhiri tur.
   */
  opsional?: boolean;
  /** Gambar contoh di kartu (berkas di public/). */
  gambar?: { src: string; alt: string };
  /** Tautan unduhan di kartu (mis. contoh bahan template). */
  tautan?: { label: string; href: string }[];
};

/**
 * Tur yang sedang tampil (id-nya), supaya dua tur tidak muncul bersamaan.
 * Diisi/dikosongkan oleh lapisan tur (features/tur/lapisan-tur).
 */
export const keadaanTur: { aktif: string } = { aktif: "" };

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
    if (terpotongInduk(el)) continue;
    return el;
  }
  return null;
}

/**
 * Elemen di dalam seksi yang DILIPAT tetap punya ukuran sendiri, padahal
 * induknya (overflow hidden, tinggi 0) memotongnya habis.
 */
function terpotongInduk(el: HTMLElement): boolean {
  for (let p = el.parentElement, n = 0; p && n < 25; p = p.parentElement, n++) {
    const cs = window.getComputedStyle(p);
    if (cs.overflow === "visible" && cs.overflowY === "visible") continue;
    const r = p.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return true;
  }
  return false;
}

// ============================================================
// Tur "TVR Saya: sambung ulang akun → Edit Otomatis → Stok Video"
// (5 Okt 2026). Muncul sekali per pengguna TVR Saya; bisa dibuka lagi
// dari tombol Tutorial di judul Edit Otomatis.
// ============================================================

export const PERISTIWA_TUR_TVR = "pri:tur-tvr";
export const VERSI_TUR_TVR = "v1";

export const LANGKAH_TUR_TVR: LangkahTur[] = [
  {
    target: ["nav-tvrku"],
    judul: "Buka TVR Saya",
    isi: "Ketuk menu TVR Saya (di bawah pada HP, di samping kiri pada layar besar).",
    maju: "klik",
    lewatiBilaTampak: "seksi-tvrku-hubungkan",
  },
  {
    target: ["seksi-tvrku-hubungkan"],
    judul: "Buka seksi Hubungkan",
    isi: "Ketuk Hubungkan TV Rakyat Saya supaya isinya terbuka.",
    maju: "klik",
    lewatiBilaTampak: "tvr-status-akun",
  },
  {
    target: ["tvr-status-akun"],
    judul: "Cek status akun sosmed",
    isi: "Angka besar = berapa akun yang terhubung dari 6 sosmed (Instagram, TikTok, YouTube, Facebook Page, Threads, X). MINIMAL 5 harus terhubung supaya Edit Otomatis terbuka. Kurang dari 5 = Edit Otomatis terkunci.",
    maju: "lanjut",
  },
  {
    target: ["tvr-baris-ulang"],
    judul: "Kuning = perlu sambung ulang",
    isi: "Izin akun ini sudah kedaluwarsa, jadi unggahan ke sana gagal dan tidak dihitung terhubung. Ketuk Sambung Ulang, login lagi di tab yang terbuka, lalu kembali ke aplikasi.",
    maju: "lanjut",
    opsional: true,
  },
  {
    target: ["tvr-tombol-hubungkan"],
    judul: "Sambung ulang semua akun",
    isi: "Ketuk Hubungkan Sosmed (Login), lalu login ulang SEMUA akun TV Rakyat Anda satu per satu di halaman yang terbuka. Facebook wajib HALAMAN (Page), bukan profil pribadi — pakai tombol Facebook Page di sebelahnya.",
    maju: "lanjut",
  },
  {
    target: ["tvr-tombol-segarkan"],
    judul: "Kembali & segarkan",
    isi: "Sudah login? Kembali ke aplikasi — status diperbarui sendiri. Bila angkanya belum berubah, ketuk tombol ini (Segarkan).",
    maju: "lanjut",
  },
  {
    target: ["tvr-edit-otomatis"],
    judul: "Edit Otomatis",
    isi: "Begitu minimal 5 akun terhubung, kartu ini terbuka: template Anda dipasang otomatis di setiap video. Masih terkunci? Ulangi sambung ulang akun di atas, lalu Segarkan.",
    maju: "lanjut",
  },
  {
    target: [],
    judul: "Contoh template: 4 bahan",
    isi: "Template = lapisan yang ditempel di atas video Anda. (1) Bingkai teratas — PNG transparan 720×1280, tampil sepanjang video (logo & bingkai). (2) Kotak monas — PNG transparan, panel tempat tulisan berita, tampil 3 detik pertama. (3) Boom like share — opsional, PNG/GIF/video animasi ajakan like & share. (4) Video penutup — opsional, disambung di akhir video. Bagian tengah PNG harus TRANSPARAN supaya videonya terlihat.",
    maju: "lanjut",
    gambar: { src: "/tur/template-bahan.svg", alt: "Empat bahan template: bingkai teratas, kotak monas, boom like share, video penutup" },
    tautan: [
      { label: "Unduh contoh Bingkai (PNG)", href: "/tur/contoh-bingkai-teratas.png" },
      { label: "Unduh contoh Kotak monas (PNG)", href: "/tur/contoh-kotak-monas.png" },
    ],
  },
  {
    target: [],
    judul: "Hasil video dengan template",
    isi: "Begini jadinya: bingkai & logo di atas sepanjang video; tulisan berita muncul di kotak monas 3 detik pertama (kata pertama otomatis MERAH); badge kategori (mis. NEWS) di atas tulisan; kredit SUMBER di bawahnya; lalu video penutup di akhir.",
    maju: "lanjut",
    gambar: { src: "/tur/template-hasil.svg", alt: "Contoh video jadi dengan bingkai, tulisan berita, badge NEWS, dan kredit sumber" },
  },
  {
    target: ["tvr-tombol-template"],
    judul: "Buat template",
    isi: "Ketuk + (pensil bila sudah punya). Unggah Kotak monas & Bingkai teratas (wajib), Boom like share & Video penutup (opsional). Di Posisi tulisan: seret kotak hijau di gambar atau ketuk Deteksi otomatis; atur Kotak kategori, warna & rata tulisan. Terakhir ketuk Simpan & Tetapkan.",
    maju: "lanjut",
    opsional: true,
  },
  {
    target: ["tvr-form-buat-video"],
    judul: "Buat video otomatis",
    isi: "Pilih Unggah Sendiri (video dari HP, maks 100 MB) atau Pakai Link (TikTok/Instagram/Facebook). Isi Tulisan berita (atau Buat dari caption), kredit sumber, dan Kategori (mis. NEWS). Ketuk Buat Video — video mengantre, lalu masuk Stok Video sendiri saat jadi.",
    maju: "lanjut",
    opsional: true,
  },
  {
    target: ["tvr-stok"],
    judul: "Stok Video — cara posting baru",
    isi: "Mulai sekarang video DITAHAN dulu di Stok sebelum diposting. Hasil Edit Otomatis masuk ke sini sendiri; video jadi bisa ditambah dari HP. Video di stok TERHAPUS OTOMATIS setelah 2 hari, maksimal 50 video & 1 GB per akun — posting secepatnya.",
    maju: "lanjut",
  },
  {
    target: ["tvr-stok-tambah"],
    judul: "Tambah video ke stok",
    isi: "Ketuk Tambah Video dari Perangkat, pilih video jadi (MP4/MOV/WEBM, maks 100 MB). Tunggu sampai 100% dan videonya muncul di daftar.",
    maju: "lanjut",
  },
  {
    target: ["tvr-stok-item"],
    judul: "Upload dari stok",
    isi: "Ketuk video di daftar: Lihat (putar), Upload (kirim ke sosmed), Unduh (simpan ke HP), Hapus. Upload → isi Judul & Kategori, caption, pilih akun → Upload Sekarang atau Jadwalkan Upload. Yang sudah terkirim diberi tanda ✓ dan otomatis menambah KPI.",
    maju: "lanjut",
    opsional: true,
  },
  {
    target: ["tvr-buka-tutorial"],
    judul: "Buka tutorial lagi",
    isi: "Lupa caranya? Ketuk Tutorial di judul Edit Otomatis kapan saja.",
    maju: "lanjut",
  },
];

export function kunciTurTvrSelesai(userId: string): string {
  return `pri-tur-tvr:${VERSI_TUR_TVR}:${userId}`;
}

export function turTvrSudahSelesai(userId: string): boolean {
  try {
    return Boolean(window.localStorage.getItem(kunciTurTvrSelesai(userId)));
  } catch {
    return false;
  }
}

export function tandaiTurTvrSelesai(userId: string, cara: "selesai" | "lewati"): void {
  try {
    window.localStorage.setItem(kunciTurTvrSelesai(userId), `${cara}:${new Date().toISOString()}`);
  } catch {
    // penyimpanan peramban tidak tersedia — abaikan
  }
}

/** Mulai tur TVR Saya dari mana saja (tombol Tutorial di Edit Otomatis). */
export function mulaiTurTvr(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PERISTIWA_TUR_TVR));
}

// ============================================================
// DUNIA RUANG BOT — penghuni manusia (14 Okt 2026). Fungsi MURNI + tipe bersama.
//
// Ruang Bot (khusus master) menampilkan SEMUA pengguna yang sedang online di
// aplikasi sebagai karakter, dan apa yang sedang mereka kerjakan sebagai
// animasi: upload/stok -> rak ruang database, alat video -> stasiun alat,
// unggah sosmed -> kotak post. File ini hanya aturan (tanpa DB/React) supaya
// bisa diuji: klasifikasi aksi, umur animasi, pemilihan karakter unik.
// ============================================================

/** Topik & event siaran Realtime (payload hanya {t}); sama dipakai server dan klien. */
export const TOPIK_DUNIA = "dunia-ruang";
export const EVENT_DUNIA = "berubah";

/** Jenis animasi di dunia. "layar" = hanya membuka layar (tanpa aksi khusus). */
export type JenisAnimasi = "layar" | "rak" | "autoedit" | "kompres" | "blur" | "kotak_post";

export type AktivitasDunia = {
  /** Token unik aktivitas (mulai/akhir mengacu ke sini). */
  id: string;
  /** Jenis audit (stok_tambah, unggah_sosmed, ...) atau jenis klien (upload_video). */
  jenis: string;
  anim: JenisAnimasi;
  /** Label manusia ("Tambah ke Stok"). */
  label: string;
  /** Kalimat aksi ("Mengunggah \"judul\""). */
  ringkasan: string;
  /** Judul video bila ada, "" jika tidak. */
  judul: string;
  /** Akun sosmed (profil / @handle) bila ada, "" jika tidak. */
  akun: string;
  /** Platform tujuan ("instagram, tiktok") bila ada. */
  platform: string;
  /** ms epoch aksi dimulai. */
  mulai: number;
  /** true = permintaan masih berlangsung; false = sudah selesai (animasi masih berekor). */
  berjalan: boolean;
  /** ms epoch selesai; null selama berjalan. */
  akhir: number | null;
  /**
   * Hanya aksi yang dilaporkan peramban: ms epoch denyut terakhir. Peramban memperbaruinya tiap ~30 dtk;
   * bila berhenti (tab ditutup, jaringan putus) aksi dianggap usai setelah SEWA_KLIEN_MS.
   */
  diperbarui?: number;
};

/** Aksi dari peramban dianggap usai bila tak ada denyut selama ini. */
export const SEWA_KLIEN_MS = 2 * 60_000;

export type PenghuniDunia = {
  id: number;
  nama: string;
  username: string;
  divisi: string;
  role: string;
  avatar_url: string;
  /** Kunci layar yang sedang dibuka ("tvrku", "chat", ...), "" bila belum diketahui. */
  layar: string;
  layar_label: string;
  /** Nomor rupa karakter 0..UKURAN_KOLAM_KARAKTER-1 (unik di antara yang online). */
  karakter: number;
  aktivitas: AktivitasDunia | null;
};

export type StatusDunia = {
  /** ms epoch server saat jawaban dibuat. */
  waktu: number;
  jumlah: number;
  /** true bila daftar dipotong (terlalu banyak yang online). */
  terpotong: boolean;
  online: PenghuniDunia[];
};

// ------------------------------------------------------------
// Klasifikasi aksi
// ------------------------------------------------------------

const KELAS_ANIMASI: Record<string, JenisAnimasi> = {
  // upload & stok
  stok_tambah: "rak",
  stok_hapus: "rak",
  stok_tim: "rak",
  upload_video: "rak",
  // alat video
  edit_otomatis: "autoedit",
  auto_edit: "autoedit",
  hapus_latar: "autoedit",
  template: "autoedit",
  kompres: "kompres",
  blur_watermark: "blur",
  // unggah ke sosmed
  unggah_sosmed: "kotak_post",
  unggah_official: "kotak_post",
  siaran: "kotak_post",
  tv_riwayat: "kotak_post",
};

/** Animasi untuk jenis aksi; null = aksi ini tidak ditampilkan di dunia (login, kendali, dll.). */
export function animasiDariJenis(jenis: string): JenisAnimasi | null {
  return KELAS_ANIMASI[jenis] ?? null;
}

/** Berapa lama animasi tetap tampil SETELAH aksi selesai (ms). Aksi yang hanya "denyut" (tanpa mulai) memakai ini sebagai umur penuh. */
export const EKOR_ANIMASI_MS: Record<JenisAnimasi, number> = {
  layar: 0,
  rak: 12_000,
  autoedit: 20_000,
  kompres: 20_000,
  blur: 20_000,
  kotak_post: 25_000,
};

/** Batas atas umur aktivitas "berjalan" tanpa kabar selesai (proses mati di tengah) — dianggap usai. */
export const UMUR_MAKS_BERJALAN_MS = 20 * 60_000;

/** Paling banyak aktivitas aktif yang disimpan per pengguna. */
export const MAKS_AKTIVITAS_PER_PENGGUNA = 4;

/** Aktivitas masih layak ditampilkan? */
export function aktivitasMasihHidup(a: Pick<AktivitasDunia, "anim" | "berjalan" | "mulai" | "akhir"> & { diperbarui?: number }, sekarangMs: number): boolean {
  if (a.berjalan) {
    if (a.diperbarui !== undefined && sekarangMs - a.diperbarui > SEWA_KLIEN_MS) return false;
    return sekarangMs - a.mulai <= UMUR_MAKS_BERJALAN_MS && sekarangMs - a.mulai >= -60_000;
  }
  if (a.akhir === null) return false;
  return sekarangMs - a.akhir <= EKOR_ANIMASI_MS[a.anim] && sekarangMs - a.akhir >= -60_000;
}

/**
 * Aktivitas yang paling layak ditampilkan: yang masih berjalan dulu (terbaru), lalu yang berekor (terbaru).
 * null bila tidak ada.
 */
export function pilihAktivitas(daftar: readonly AktivitasDunia[], sekarangMs: number): AktivitasDunia | null {
  const hidup = daftar.filter((a) => aktivitasMasihHidup(a, sekarangMs));
  if (hidup.length === 0) return null;
  const urut = [...hidup].sort((p, q) => Number(q.berjalan) - Number(p.berjalan) || (q.berjalan ? q.mulai - p.mulai : (q.akhir ?? 0) - (p.akhir ?? 0)));
  return urut[0];
}

/** Buang yang sudah mati dan batasi jumlahnya (yang paling baru dipertahankan). */
export function rapikanAktivitas(daftar: readonly AktivitasDunia[], sekarangMs: number): AktivitasDunia[] {
  return daftar
    .filter((a) => aktivitasMasihHidup(a, sekarangMs))
    .sort((p, q) => (q.akhir ?? q.mulai) - (p.akhir ?? p.mulai))
    .slice(0, MAKS_AKTIVITAS_PER_PENGGUNA);
}

// ------------------------------------------------------------
// Penyaring teks dari detail audit
// ------------------------------------------------------------

const bersih = (v: unknown, maks: number): string =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maks) : "";

/**
 * Ambil judul video, akun sosmed, dan platform dari ringkasan + detail audit.
 * Detail tidak punya bentuk tetap (tiap rute menulis sendiri), jadi dicari beberapa nama kunci
 * yang umum; ringkasan berbentuk `... "judul"` dipakai sebagai cadangan judul.
 */
export function ekstrakInfo(ringkasan: string, detail: Record<string, unknown> | undefined): { judul: string; akun: string; platform: string } {
  const d = detail ?? {};
  const cobaKunci = (kunci: string[], maks: number): string => {
    for (const k of kunci) {
      const v = d[k];
      const teks = Array.isArray(v) ? v.map((x) => bersih(x, 40)).filter(Boolean).join(", ") : bersih(v, maks);
      if (teks) return teks.slice(0, maks);
    }
    return "";
  };
  const dariKutip = /"([^"]{1,200})"/.exec(ringkasan)?.[1] ?? "";
  return {
    judul: cobaKunci(["judul", "tulisan", "title"], 160) || bersih(dariKutip, 160),
    akun: cobaKunci(["akun", "profil", "akun_sosmed", "handle", "username_sosmed"], 80),
    platform: cobaKunci(["platform", "platforms"], 80),
  };
}

// ------------------------------------------------------------
// Karakter: kolam >100 rupa, unik di antara yang online
// ------------------------------------------------------------

/** Jumlah rupa karakter yang tersedia (24 warna kaus x 12 variasi wajah/rambut). */
export const UKURAN_KOLAM_KARAKTER = 288;
/** Pengali permutasi; harus berpilin tunggal (coprime) dengan ukuran kolam: id berbeda -> rupa berbeda. */
const PENGALI_KARAKTER = 109;

/** Rupa pilihan pertama sebuah akun: tetap selamanya untuk id yang sama. */
export function karakterDariId(userId: number): number {
  const n = Math.abs(Math.trunc(userId));
  return (n * PENGALI_KARAKTER) % UKURAN_KOLAM_KARAKTER;
}

/**
 * Tetapkan rupa untuk semua yang online sehingga TIDAK ADA yang kembar. Bentrokan
 * (id berselisih kelipatan ukuran kolam) diselesaikan deterministik: id terkecil menang,
 * yang lain maju ke rupa kosong berikutnya.
 */
export function tetapkanKarakter(userIds: readonly number[]): Map<number, number> {
  const hasil = new Map<number, number>();
  const dipakai = new Set<number>();
  for (const id of [...new Set(userIds)].sort((a, b) => a - b)) {
    let k = karakterDariId(id);
    for (let i = 0; i < UKURAN_KOLAM_KARAKTER && dipakai.has(k); i++) k = (k + 1) % UKURAN_KOLAM_KARAKTER;
    dipakai.add(k);
    hasil.set(id, k);
  }
  return hasil;
}

// ------------------------------------------------------------
// Layar
// ------------------------------------------------------------

/** Kunci layar yang sah dari detak (sama dengan lib/audit sahLayar); "" bila rusak. */
export function layarSah(mentah: string | null | undefined): string {
  const l = (mentah ?? "").trim().toLowerCase();
  return /^[a-z0-9-]{1,32}$/.test(l) ? l : "";
}

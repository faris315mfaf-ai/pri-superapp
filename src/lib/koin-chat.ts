// ============================================================
// KIRIM KOIN LEWAT CHAT (28 Sep 2026) — MURNI, aman server & klien.
//
// Master mengirim koin ke seseorang dari layar chat 1-lawan-1. Kirimannya
// tampil sebagai kartu koin di percakapan kedua pihak.
//
// chat_pesan tidak punya kolom jenis pesan (dan tidak boleh ada migrasi),
// jadi pesan koin dikenali dari ISINYA: diawali karakter tak terlihat
// U+2060 (WORD JOINER) lalu "🪙 Kiriman <jumlah> koin", opsional baris
// kedua berisi catatan. Tanpa kartu pun (aplikasi versi lama) teksnya
// tetap terbaca wajar.
//
// ANTI-PEMALSUAN: server membuang U+2060 dari SETIAP pesan yang ditulis
// pengguna (buangPenandaKoin), jadi hanya pesan buatan server — sesudah
// koinnya benar-benar tercatat di buku besar — yang dirender sebagai
// kartu koin.
// ============================================================

/** Karakter penanda pesan koin buatan server (tak terlihat). */
export const PENANDA_KOIN = "\u2060";

/** Batas satu kiriman — cukup longgar, tapi mencegah salah ketik nol berlebih. */
export const MAKS_KIRIM_KOIN = 100_000;

/** Batas panjang catatan (karakter). */
export const MAKS_CATATAN_KOIN = 120;

/** Pilihan cepat jumlah di dialog kirim koin. */
export const PILIHAN_KOIN = [10, 50, 100, 500, 1000] as const;

/** Aktivitas buku besar koin_transaksi untuk kiriman ini. */
export const AKTIVITAS_KIRIMAN_MASTER = "kiriman_master";

/** 1234567 → "1.234.567" (tanpa bergantung pada data locale mesin). */
export function teksAngkaKoin(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Hapus penanda dari teks yang ditulis pengguna (anti-pemalsuan). */
export function buangPenandaKoin(teks: string): string {
  return String(teks ?? "").replace(/\u2060/g, "");
}

/** Catatan satu baris, tanpa penanda, maksimal MAKS_CATATAN_KOIN karakter (emoji utuh). */
export function rapikanCatatanKoin(catatan: string): string {
  const satuBaris = buangPenandaKoin(catatan).replace(/\s+/g, " ").trim();
  return Array.from(satuBaris).slice(0, MAKS_CATATAN_KOIN).join("").trim();
}

/**
 * Periksa jumlah kiriman. Mengembalikan bilangan bulat yang sah, atau
 * pesan galat berbahasa Indonesia.
 */
export function periksaJumlahKoin(nilai: unknown): { jumlah: number } | { galat: string } {
  const n = typeof nilai === "string" ? Number(nilai.replace(/\./g, "").trim()) : Number(nilai);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { galat: "Jumlah koin harus bilangan bulat." };
  if (n < 1) return { galat: "Jumlah koin minimal 1." };
  if (n > MAKS_KIRIM_KOIN) return { galat: `Jumlah koin maksimal ${teksAngkaKoin(MAKS_KIRIM_KOIN)} per kiriman.` };
  return { jumlah: n };
}

/** Isi pesan chat untuk kiriman koin (dibuat HANYA oleh server). */
export function isiPesanKoin(jumlah: number, catatan: string): string {
  const c = rapikanCatatanKoin(catatan);
  return `${PENANDA_KOIN}🪙 Kiriman ${teksAngkaKoin(jumlah)} koin${c ? `\n${c}` : ""}`;
}

const POLA_PESAN_KOIN = /^\u2060🪙 Kiriman ([1-9]\d{0,2}(?:\.\d{3})*) koin(?:\n([\s\S]*))?$/u;

/** Kenali pesan koin. null = pesan biasa. */
export function uraiPesanKoin(isi: string | null | undefined): { jumlah: number; catatan: string } | null {
  const m = POLA_PESAN_KOIN.exec(String(isi ?? ""));
  if (!m) return null;
  const jumlah = Number(m[1].replace(/\./g, ""));
  if (!Number.isSafeInteger(jumlah) || jumlah < 1) return null;
  return { jumlah, catatan: (m[2] ?? "").trim() };
}

/** Teks ringkas untuk daftar chat & notifikasi. */
export function cuplikanPesanChat(isi: string): string {
  const koin = uraiPesanKoin(isi);
  return koin ? `🪙 Kiriman ${teksAngkaKoin(koin.jumlah)} koin` : isi;
}

/**
 * Kunci anti-dobel dari klien (dibuat sekali per dialog): hanya huruf,
 * angka, dan "-", 8-64 karakter. null = tidak sah.
 */
export function kunciKirimanSah(kunci: unknown): string | null {
  const k = String(kunci ?? "").trim();
  return /^[A-Za-z0-9-]{8,64}$/.test(k) ? k : null;
}

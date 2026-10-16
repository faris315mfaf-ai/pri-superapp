// ============================================================
// Pembantu MURNI periode & ID postingan akun resmi (16 Okt 2026).
//
// Dipindah dari lib/analisis-ayrshare (dihapus bersama Ayrshare) supaya
// rute wajib-komen dan sinkron konten TV Rakyat tetap memakai aturan yang
// sama tanpa bergantung pada penyedia mana pun.
// ============================================================
import { periodeSaatIni } from "@/lib/periode-qc";

// Jendela periode 19:00→18:59 WIB — SATU sumber kebenaran di lib/periode-qc.
// Nama lama dipertahankan agar pemanggil tidak perlu berubah.
export function periodeHariIni(): string {
  return periodeSaatIni();
}

/**
 * Samakan ID postingan dengan konvensi pipeline TikHub, supaya beberapa
 * sumber saling MENIMPA baris yang sama, bukan menggandakannya:
 * - Instagram: SHORTCODE dari URL (/p/, /reel/, /tv/) — penyedia memberi
 *   media-id numerik yang berbeda dari shortcode.
 * - TikTok: angka id video dari URL.
 * URL tak terbaca → pakai id penyedia apa adanya.
 */
export function idPostinganKanonik(platform: string, idPenyedia: string, url: string): string {
  if (platform === "instagram") {
    const m = /instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/.exec(url);
    if (m) return m[1];
  }
  if (platform === "tiktok") {
    const m = /\/video\/(\d+)/.exec(url);
    if (m) return m[1];
  }
  return idPenyedia;
}

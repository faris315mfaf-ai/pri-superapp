// ============================================================
// PENCARI VIDEO ASLI (Lacak Sumber, 15 Okt 2026) — pembantu tampilan bersama.
//
// Waktu ditulis dalam WIB (UTC+7) seperti layar lain, skor memakai koma
// desimal ("0,96"), durasi m:ss. Label platform, zona, dan jalur temuan
// dikumpulkan di sini supaya Ruang Bot, Kelola Bot, dan TVR Saya seragam.
// ============================================================

import type {
  AksiKeputusan,
  JenisAkunKoleksi,
  Kandidat,
  KomponenSkor,
  StatusLacak,
  ZonaLacak,
} from "@/lib/lacak-tipe";

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function wib(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + 7 * 3600_000);
}

const dua = (n: number) => String(n).padStart(2, "0");

/** "13 Okt 2026 · 17.40" (WIB); "—" bila kosong. */
export function waktuWib(iso: string | null | undefined): string {
  const d = wib(iso);
  if (!d) return "—";
  return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${dua(d.getUTCHours())}.${dua(d.getUTCMinutes())}`;
}

/** "13 Okt, 17.40" (WIB) — versi ringkas untuk kartu ponsel. */
export function waktuWibRingkas(iso: string | null | undefined): string {
  const d = wib(iso);
  if (!d) return "—";
  return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]}, ${dua(d.getUTCHours())}.${dua(d.getUTCMinutes())}`;
}

/** Detik → "m:ss" (atau "j:mm:ss" bila ≥ 1 jam). */
export function durasiTeks(detik: number | null | undefined): string {
  if (detik === null || detik === undefined || !Number.isFinite(detik) || detik < 0) return "—";
  const total = Math.round(detik);
  const j = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return j > 0 ? `${j}:${dua(m)}:${dua(s)}` : `${m}:${dua(s)}`;
}

/** 0.9634 → "0,96" (desimal koma). */
export function koma(x: number, digit = 2): string {
  return (Number.isFinite(x) ? x : 0).toFixed(digit).replace(".", ",");
}

/** 0.96 → "96%". */
export function persen(x: number): string {
  return `${Math.round((Number.isFinite(x) ? x : 0) * 100)}%`;
}

/** Angka ribuan gaya Indonesia: 18420 → "18.420". */
export function angka(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString("id-ID");
}

/** Selisih dua waktu ISO dalam kata ("15 jam", "25 menit", "2 hari"); null bila tidak bisa dihitung. */
export function selisihWaktu(awal: string, akhir: string): string | null {
  const a = Date.parse(awal);
  const b = Date.parse(akhir);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const menit = Math.round(Math.abs(b - a) / 60_000);
  if (menit < 60) return `${Math.max(1, menit)} menit`;
  const jam = Math.round(menit / 60);
  if (jam < 48) return `${jam} jam`;
  return `${Math.round(jam / 24)} hari`;
}

const PLATFORM: Record<string, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
  twitter: "X",
  x: "X",
};

/** "tiktok" → "TikTok"; nama lain dibiarkan apa adanya. */
export function namaPlatform(p: string): string {
  if (!p) return "—";
  return PLATFORM[p.toLowerCase()] ?? p;
}

/** Ukuran video: "1080×1920"; kosong bila tidak diketahui. */
export function resolusi(lebar: number, tinggi: number): string {
  return lebar > 0 && tinggi > 0 ? `${lebar}×${tinggi}` : "";
}

export const LABEL_ZONA: Record<ZonaLacak, string> = {
  yakin: "Yakin",
  perlu_acc: "Perlu ACC",
  bukan: "Bukan sumber",
};

/** Kelas lencana zona (terang & gelap). */
export const KELAS_ZONA: Record<ZonaLacak, string> = {
  yakin: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  perlu_acc: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  bukan: "bg-black/[0.06] text-teks-sekunder dark:bg-white/10",
};

/** Kelas warna teks skor menurut zona. */
export const KELAS_SKOR: Record<ZonaLacak, string> = {
  yakin: "text-emerald-700 dark:text-emerald-300",
  perlu_acc: "text-amber-700 dark:text-amber-300",
  bukan: "text-teks-sekunder",
};

/** Kelas warna batang skor menurut zona. */
export const KELAS_BATANG: Record<ZonaLacak, string> = {
  yakin: "bg-emerald-600 dark:bg-emerald-400",
  perlu_acc: "bg-amber-500",
  bukan: "bg-black/25 dark:bg-white/30",
};

export const LABEL_LEWAT: Record<Kandidat["ditemukan_lewat"], string> = {
  koleksi: "Koleksi sendiri",
  akun: "Akun di watermark",
  youtube: "Pencarian YouTube",
  web: "Pencarian web",
  lens: "Cari balik gambar",
};

export const LABEL_AKSI: Record<AksiKeputusan, string> = {
  pakai_asli: "Video asli dipakai",
  pakai_kredit: "Kreditnya saja dipakai",
  bukan: "Ditandai bukan sumber",
  tanpa_sumber: "Tanpa sumber",
};

export const LABEL_STATUS: Record<StatusLacak, string> = {
  antre: "Menunggu giliran",
  berjalan: "Sedang melacak…",
  selesai: "Selesai",
  gagal: "Gagal",
};

export const LABEL_SUMBER: Record<"pengguna" | "bot" | "master", string> = {
  pengguna: "TVR Saya",
  bot: "Bot",
  master: "Master",
};

export const LABEL_JENIS: Record<JenisAkunKoleksi, string> = {
  media_resmi: "Media resmi",
  kreator: "Kreator lokal",
  instansi: "Instansi",
};

/** Urutan & keterangan komponen skor (tabel rincian). */
export const KOMPONEN: { kunci: keyof KomponenSkor; nama: string; ket: string }[] = [
  { kunci: "gambar", nama: "Kecocokan gambar", ket: "sidik frame" },
  { kunci: "suara", nama: "Kecocokan suara", ket: "sidik audio" },
  { kunci: "wm", nama: "Watermark / akun", ket: "username di video sama dengan pemilik" },
  { kunci: "waktu", nama: "Waktu unggah", ket: "lebih awal dari saduran" },
  { kunci: "durasi", nama: "Durasi & resolusi", ket: "sama atau lebih panjang, lebih tajam" },
  { kunci: "akun", nama: "Akun tepercaya", ket: "media resmi / terverifikasi" },
];

/** Selisih suara: 18.2 → "+18,2 detik"; null → "tidak bisa dibandingkan". */
export function offsetTeks(offset: number | null): string {
  if (offset === null || !Number.isFinite(offset)) return "tidak bisa dibandingkan";
  return `${offset >= 0 ? "+" : "−"}${koma(Math.abs(offset), 1)} detik`;
}

/** Bagian video kandidat yang dipakai saduran: "0:18–1:06". */
export function bagianTeks(bagian: Kandidat["bagian"]): string {
  if (!bagian) return "tidak bisa dipastikan";
  return `${durasiTeks(bagian.mulai)}–${durasiTeks(bagian.akhir)}`;
}

/** Kredit siap pakai dari nama akun kandidat (cadangan bila server tidak mengirim `kredit`). */
export function kreditDari(akun: string): string {
  const a = akun.trim();
  return a ? `SUMBER: ${a.toUpperCase()}` : "";
}

export const URL_SAH = /^https:\/\/\S+$/i;

export type PlatformKoleksi = "tiktok" | "instagram" | "youtube" | "facebook";

export const PILIHAN_PLATFORM: { kunci: PlatformKoleksi; label: string }[] = [
  { kunci: "tiktok", label: "TikTok" },
  { kunci: "instagram", label: "Instagram" },
  { kunci: "youtube", label: "YouTube" },
  { kunci: "facebook", label: "Facebook" },
];

/**
 * Isian "tambah akun" → link profil. Link https utuh dikirim apa adanya;
 * "@handle" atau "handle" dijadikan link profil platform terpilih.
 * Mengembalikan null bila isian tidak bisa dipakai.
 */
export function urlProfil(isian: string, platform: PlatformKoleksi): string | null {
  const t = isian.trim();
  if (!t) return null;
  if (URL_SAH.test(t)) return t;
  const h = t.replace(/^@+/, "");
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(h)) return null;
  switch (platform) {
    case "tiktok":
      return `https://www.tiktok.com/@${h}`;
    case "instagram":
      return `https://www.instagram.com/${h}/`;
    case "youtube":
      return `https://www.youtube.com/@${h}`;
    case "facebook":
      return `https://www.facebook.com/${h}`;
    default:
      return null;
  }
}

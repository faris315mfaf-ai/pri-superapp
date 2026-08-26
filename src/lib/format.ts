// ============================================================
// PRI SuperApp — Utilitas Format Bahasa Indonesia
// ============================================================

const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** Format angka gaya Indonesia: 1247 → "1.247" */
export function formatAngka(n: number): string {
  return n.toLocaleString("id-ID");
}

/**
 * Angka RINGKAS untuk chip insight yang sempit: 1.234 → "1,2rb",
 * 1.500.000 → "1,5jt". Di bawah 1.000 tetap utuh. Dipakai di kartu
 * metrik agar angka besar (views/likes) tidak meluber/terpotong;
 * versi utuh (formatAngka) tetap dipakai di tempat yang lega.
 *
 * KENAPA: sebelumnya angka jutaan dirender penuh di kotak kecil
 * sehingga terpotong atau membungkus ke dua baris dan merusak grid.
 */
export function formatAngkaRingkas(n: number): string {
  const abs = Math.abs(n);
  if (abs < 1000) return String(n);
  // Satu angka desimal, koma gaya Indonesia, buang ",0" yang mubazir.
  const ringkas = (nilai: number, satuan: string) => {
    const s = nilai.toFixed(1).replace(/\.0$/, "").replace(".", ",");
    return `${s}${satuan}`;
  };
  // Ambang naik SATUAN memakai 999.950 dst, bukan 1.000.000 — supaya
  // 999.999 tampil "1jt", bukan "1000rb" yang canggung.
  if (abs < 999_950) return ringkas(n / 1000, "rb");
  if (abs < 999_950_000) return ringkas(n / 1_000_000, "jt");
  return ringkas(n / 1_000_000_000, "M");
}

/** Ambil jam WIB dari ISO string: "2026-08-23T09:42:00+07:00" → "09:42" */
export function jamWIB(iso: string): string {
  const d = new Date(iso);
  const jam = d.getHours().toString().padStart(2, "0");
  const menit = d.getMinutes().toString().padStart(2, "0");
  return `${jam}.${menit}`;
}

/** Tanggal lengkap Indonesia: "Minggu, 23 Agustus 2026" */
export function tanggalIndonesia(iso: string): string {
  const d = new Date(iso);
  return `${NAMA_HARI[d.getDay()]}, ${d.getDate()} ${NAMA_BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

/** Sapaan sesuai jam perangkat */
export function sapaanHari(): string {
  const jam = new Date().getHours();
  if (jam >= 4 && jam < 11) return "Selamat pagi";
  if (jam >= 11 && jam < 15) return "Selamat siang";
  if (jam >= 15 && jam < 18) return "Selamat sore";
  return "Selamat malam";
}

/** Inisial nama: "Budi Santoso" → "BS" */
export function inisial(nama: string): string {
  const bagian = nama.trim().split(/\s+/);
  if (bagian.length === 1) return bagian[0].slice(0, 2).toUpperCase();
  return (bagian[0][0] + bagian[bagian.length - 1][0]).toUpperCase();
}

/** Hash string sederhana untuk warna avatar konsisten */
export function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Palet pasangan warna avatar (merah–emas–netral, tanpa biru/indigo dominan) */
export const PALET_AVATAR: [string, string][] = [
  ["#DC2626", "#F59E0B"],
  ["#EA580C", "#FACC15"],
  ["#DB2777", "#F472B6"],
  ["#059669", "#34D399"],
  ["#B45309", "#FBBF24"],
  ["#BE123C", "#FB7185"],
  ["#7C2D12", "#EA580C"],
  ["#15803D", "#86EFAC"],
  ["#A16207", "#FDE047"],
  ["#C2410C", "#FDBA74"],
];

/** Ambil pasangan warna gradient avatar konsisten dari nama */
export function warnaAvatar(nama: string): [string, string] {
  return PALET_AVATAR[hashString(nama) % PALET_AVATAR.length];
}

/** Warna kepatuhan: hijau ≥80, kuning 50–79, merah <50 */
export function warnaKepatuhan(persen: number): string {
  if (persen >= 80) return "#10B981";
  if (persen >= 50) return "#F59E0B";
  return "#EF4444";
}

/** Buat link WhatsApp dengan pesan terisi otomatis */
export function linkWhatsApp(nomorWa: string, pesan: string): string {
  return `https://wa.me/${nomorWa}?text=${encodeURIComponent(pesan)}`;
}

/** Pesan pengingat komentar WhatsApp */
export function pesanPengingat(
  namaKader: string,
  akunWajib: string,
  linkPostingan: string,
): string {
  return `Assalamualaikum Kak ${namaKader}, mohon bantuannya untuk memberi komentar di postingan @${akunWajib} berikut ya: ${linkPostingan} — Terima kasih 🙏 (Pesan otomatis dari PRI SuperApp)`;
}

/**
 * URL profil sosmed dari username — pengguna cukup mengetik username,
 * sistem yang merangkai tautannya supaya bisa diklik langsung.
 */
export function urlProfilSosmed(platform: string, username: string): string {
  const u = username.replace(/^@+/, "").trim();
  switch (platform.toLowerCase()) {
    case "instagram":
      return `https://instagram.com/${u}`;
    case "tiktok":
      return `https://tiktok.com/@${u}`;
    case "youtube":
      return `https://youtube.com/@${u}`;
    case "facebook":
      return `https://facebook.com/${u}`;
    case "threads":
      return `https://threads.net/@${u}`;
    case "twitter":
    case "x":
      return `https://x.com/${u}`;
    default:
      return `https://${platform}.com/${u}`;
  }
}

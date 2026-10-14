// ============================================================
// PILIH BAGIAN VIDEO + BINGKAI LANDSCAPE (14 Okt 2026) — aturan MURNI.
// Sebelum Auto Edit, pengguna memilih detik mulai–akhir (ala CapCut). Video lebar tidak dipotong jadi
// potret: mesin menaruhnya utuh di tengah, atas-bawah hitam (body job: mulai, akhir, bingkai:"hitam").
// UJI COBA: hanya akun Faris (#4, #176) sampai pemilik menyatakan siap untuk semua.
// ============================================================

/** Akun uji coba fitur ini. */
const AKUN_UJI_POTONG = new Set(["4", "176"]);

export function bolehPotongVideo(u: { id?: string | number | null } | null | undefined): boolean {
  return u?.id != null && AKUN_UJI_POTONG.has(String(u.id));
}

export type RentangVideo = { mulai: number; akhir: number };

/** Potongan terpendek (detik). Mesin menolak di bawah 1 detik. */
export const POTONG_MIN = 1;

export const bulat1 = (x: number) => Math.round(x * 10) / 10;

/** Rentang awal: dari 0 sampai durasi, dipangkas ke batas. */
export function rentangAwal(durasi: number, maks: number): RentangVideo {
  return { mulai: 0, akhir: bulat1(Math.max(POTONG_MIN, Math.min(durasi, maks))) };
}

/** Geser satu ujung; ujung tidak boleh melewati ujung lain (selisih minimal POTONG_MIN) atau keluar video. */
export function geserUjung(r: RentangVideo, ujung: "mulai" | "akhir", nilai: number, durasi: number): RentangVideo {
  if (!Number.isFinite(nilai)) return r;
  if (ujung === "mulai") return { ...r, mulai: bulat1(Math.max(0, Math.min(nilai, r.akhir - POTONG_MIN))) };
  return { ...r, akhir: bulat1(Math.min(durasi, Math.max(nilai, r.mulai + POTONG_MIN))) };
}

export type KeadaanRentang = { sah: boolean; durasi: number; pesan: string };

export function nilaiRentang(r: RentangVideo, durasi: number, maks: number): KeadaanRentang {
  const d = bulat1(r.akhir - r.mulai);
  if (r.mulai < 0 || r.akhir > durasi + 0.05 || d < POTONG_MIN) return { sah: false, durasi: d, pesan: "Bagian video tidak sah. Pilih ulang." };
  if (d > maks + 0.05) return { sah: false, durasi: d, pesan: `Bagian terpilih ${formatDurasi(d)}, lebih dari batas ${formatDurasi(maks)}. Pendekkan dulu.` };
  return { sah: true, durasi: d, pesan: "" };
}

/** "01:05.3" (menit:detik.persepuluh). */
export function formatWaktu(detik: number): string {
  const t = Math.max(0, bulat1(detik));
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, "0")}:${s < 10 ? "0" : ""}${s.toFixed(1)}`;
}

/** "1:15.5" untuk durasi. */
export function formatDurasi(detik: number): string {
  const t = Math.max(0, bulat1(detik));
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`;
}

/** Video lebar (termasuk persegi) diberi bingkai hitam; potret tetap penuh. */
export const adalahLandscape = (lebar: number, tinggi: number) => lebar > 0 && tinggi > 0 && lebar >= tinggi;

/** Field body job untuk mesin. Tanpa durasi yang diketahui: hanya bingkai. */
export function bidangJob(r: RentangVideo | null, durasi: number | null): { mulai?: number; akhir?: number; bingkai: "hitam" } {
  if (!r || !durasi) return { bingkai: "hitam" };
  // Rentang penuh dari 0 tidak perlu dikirim sebagai potongan.
  if (r.mulai <= 0 && r.akhir >= durasi - 0.05) return { bingkai: "hitam" };
  return { mulai: bulat1(r.mulai), akhir: bulat1(r.akhir), bingkai: "hitam" };
}

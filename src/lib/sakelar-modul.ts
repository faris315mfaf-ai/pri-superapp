// ============================================================
// SAKELAR MODUL (24 Sep 2026) — katalog AMAN UNTUK KLIEN.
//
// Beda dengan fitur berat (lib/sakelar): modul di sini bukan soal beban
// server, jadi TIDAK ikut dimatikan mode hemat, dan tiap modul punya nilai
// bawaannya sendiri — ada yang bawaannya MATI.
//
// Disimpan di pengaturan_sistem sebagai `modul_<kunci>` = 'true' / 'false'.
// Tidak ada baris = pakai `bawaan`. Server membacanya lewat bacaSakelar()
// (cache 60 dtk), klien lewat /api/sakelar → useAppStore().sakelar.modul.
// ============================================================

export const DAFTAR_MODUL = [
  {
    kunci: "kepatuhan_komen",
    label: "Kepatuhan komentar",
    keterangan:
      "Pemeriksaan & rekap wajib komentar: bagian komentar di HR Center dan Detail Anggota, dashboard Kepatuhan Komen, panel leaderboard, efek juara komentar, serta penarikan komentar otomatis.",
    // Dimatikan atas permintaan 24 Sep 2026 — nyalakan lagi dari Panel Master.
    bawaan: false,
  },
  {
    kunci: "ganti_akun_profil",
    label: "Ganti username & kata sandi di Profil",
    keterangan:
      "Anggota mengganti username dan kata sandinya sendiri dari Profil — cukup kata sandi lama, tanpa kode email/WhatsApp.",
    bawaan: true,
  },
] as const;

export type KunciModul = (typeof DAFTAR_MODUL)[number]["kunci"];

export function adalahKunciModul(k: string): k is KunciModul {
  return DAFTAR_MODUL.some((m) => m.kunci === k);
}

/** Nilai bawaan satu modul (tanpa pengaturan tersimpan). */
export function bawaanModul(kunci: KunciModul): boolean {
  return DAFTAR_MODUL.find((m) => m.kunci === kunci)?.bawaan ?? true;
}

/** Baca nilai mentah pengaturan ('true'/'false'/kosong) jadi keadaan modul. */
export function nilaiModul(mentah: string | null | undefined, kunci: KunciModul): boolean {
  if (mentah === "true") return true;
  if (mentah === "false") return false;
  return bawaanModul(kunci);
}

/** Keadaan modul dari peta klien; kunci yang belum termuat = bawaan. */
export function modulAktif(peta: Record<string, boolean> | null | undefined, kunci: KunciModul): boolean {
  const v = peta?.[kunci];
  return typeof v === "boolean" ? v : bawaanModul(kunci);
}

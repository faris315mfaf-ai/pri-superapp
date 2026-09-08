// ============================================================
// Batas caption per sosmed + penjelasan/solusi unggahan gagal (8 Sep 2026).
// Dipakai peramban (panel caption per sosmed di TVR Saya) dan server
// (validasi /api/tvr/unggah, notifikasi gagal terbit) — tanpa impor server.
// ============================================================

/** Batas karakter caption yang DITERIMA tiap platform lewat upload-post. */
export const BATAS_CAPTION_TVR: Record<string, number> = {
  twitter: 280,
  threads: 500,
  tiktok: 2200,
  instagram: 2200,
  youtube: 5000,
  facebook: 5000,
  bilibili: 2000,
};

export const LABEL_SOSMED: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  facebook: "Facebook",
  threads: "Threads",
  twitter: "X",
  bilibili: "Bilibili",
};

/** Cara menautkan ulang — sama untuk semua platform yang butuh login ulang. */
const CARA_TAUTKAN_ULANG = "buka TV Rakyat Saya → Akun TV Rakyat Saya → Hubungkan Sosmed (Login), lalu tautkan ulang";

/**
 * Terjemahkan pesan galat upload-post menjadi alasan singkat + solusi yang
 * bisa dikerjakan anggota. Pesan aslinya tetap disertakan oleh pemanggil.
 */
export function solusiGagal(platform: string, pesan: string): { ringkas: string; solusi: string } {
  const p = platform.toLowerCase();
  const nama = LABEL_SOSMED[p] ?? platform;
  const m = (pesan ?? "").toLowerCase();
  const ada = (...kata: string[]) => kata.some((k) => m.includes(k));

  if (p === "facebook" && ada("page", "halaman", "no facebook")) {
    return { ringkas: "Halaman Facebook belum dipilih", solusi: `${CARA_TAUTKAN_ULANG} Facebook dan pilih Halaman (Page) yang dipakai untuk posting.` };
  }
  if (p === "tiktok" && ada("inbox", "cap", "unaudited", "active user", "private", "pending review")) {
    return { ringkas: "TikTok menahan video di Kotak Masuk", solusi: "Buka aplikasi TikTok → Kotak Masuk/Notifikasi → terbitkan video itu secara manual (batasan TikTok untuk unggahan lewat API)." };
  }
  if (ada("token", "expired", "kedaluwarsa", "unauthorized", "401", "invalid_grant", "refresh", "not connected", "has no ", "no account", "not configured", "reconnect", "re-auth", "permission", "403")) {
    return { ringkas: `Akun ${nama} tidak tersambung / izinnya kedaluwarsa`, solusi: `${CARA_TAUTKAN_ULANG} ${nama}.` };
  }
  if (ada("duplicate", "same video", "already", "spam", "identical")) {
    return { ringkas: `${nama} menolak video yang sama diunggah dua kali`, solusi: "Video ini sudah pernah terbit di akun itu; tidak perlu diunggah ulang." };
  }
  if (ada("too long", "character", "280", "caption", "title too", "length")) {
    return { ringkas: `Caption terlalu panjang untuk ${nama}`, solusi: `Isi caption khusus ${nama} yang lebih pendek (batas ${BATAS_CAPTION_TVR[p] ?? 2200} karakter) lewat "Caption per sosmed", lalu unggah ulang.` };
  }
  if (ada("quota", "rate limit", "too many", "limit exceeded", "daily")) {
    return { ringkas: `${nama} membatasi jumlah unggahan hari ini`, solusi: "Coba lagi beberapa jam lagi atau besok; kurangi jumlah unggahan beruntun." };
  }
  if (ada("copyright", "music", "audio")) {
    return { ringkas: `${nama} menolak karena hak cipta musik/audio`, solusi: "Ganti musik latar dengan yang bebas hak cipta, lalu unggah ulang." };
  }
  if (ada("format", "codec", "resolution", "aspect", "duration", "too short", "too large", "size")) {
    return { ringkas: `Format/durasi video tidak diterima ${nama}`, solusi: "Pakai MP4 (H.264) vertikal 9:16, durasi sesuai batas platform, ukuran ≤ 50 MB, lalu unggah ulang." };
  }
  return { ringkas: `${nama} gagal menerbitkan video`, solusi: `Coba unggah ulang. Bila masih gagal, ${CARA_TAUTKAN_ULANG} ${nama}.` };
}

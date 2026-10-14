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
  // Sebagian kata terlalu pendek untuk dicocokkan sebagai potongan:
  // "cap" termuat di dalam "caption", sehingga caption TikTok yang
  // kepanjangan dulu diberi saran yang sama sekali salah. Untuk kata
  // seperti itu dipakai pencocokan KATA UTUH (15 Sep 2026).
  const kata = new Set(m.split(/[^a-z0-9]+/).filter(Boolean));

  // Batas harian yang menyebut ANGKA ("15/15", "limit 15 per day").
  // Ditangani terpisah supaya angkanya ikut ditampilkan — orang perlu
  // tahu jatahnya berapa, bukan cuma "dibatasi".
  const angka = /(\d{1,4})\s*\/\s*(\d{1,4})/.exec(pesan ?? "");
  if (angka && ada("limit", "quota", "kuota", "batas", "daily", "per day", "harian", "max")) {
    return {
      ringkas: `Jatah unggah ${nama} habis (${angka[1]}/${angka[2]} dalam 24 jam)`,
      solusi: `${nama} hanya mengizinkan ${angka[2]} unggahan per 24 jam lewat aplikasi pihak ketiga. Batas ini milik ${nama} — tidak bisa dibuka dari sini, dan mengulang sekarang pasti ditolak lagi. Jalan keluarnya: pakai tombol JADWALKAN dan pilih waktu setelah jatahnya pulih (jendelanya berjalan, bukan reset tengah malam — jatah pertama pulih 24 jam setelah unggahan pertama tadi). Untuk yang mendesak, unggah langsung dari aplikasi ${nama}.`,
    };
  }
  // ---- Penyebab nyata dari upload-post / X (diverifikasi dari galat produksi, 14 Okt 2026) ----
  // Urutannya penting: pesan upload-post sering memuat kata lain ("403", "already posted", "rate-limits")
  // yang akan salah ditangkap aturan umum di bawah.
  if (ada("spend cap", "spending cap")) {
    return {
      ringkas: `Kuota posting ${nama} di layanan upload-post habis (bukan masalah akun Anda)`,
      solusi: `Batas biaya bulanan API ${nama} di layanan upload-post sudah tercapai, jadi SEMUA anggota tidak bisa memposting ke ${nama} sampai pengelola menambah kuotanya atau bulan berganti. Akun ${nama} Anda tidak bermasalah dan tidak perlu ditautkan ulang; mengulang sekarang pasti gagal lagi. Untuk yang mendesak, unggah langsung dari aplikasi ${nama}. Sosmed lain tetap berjalan normal.`,
    };
  }
  if (ada("did not finish within the expected time")) {
    return {
      ringkas: `${nama} tidak selesai diproses tepat waktu (gangguan sesaat)`,
      solusi: `Sosmed lain sudah terbit; hanya ${nama} yang terlambat diproses lalu dibatalkan. Akun Anda tidak bermasalah. Ulangi unggahan ke ${nama} saja — tidak membuat dobel di sosmed lain.`,
    };
  }
  if (ada("failed to download the video", "incompleteread", "connection broken")) {
    return {
      ringkas: `Video gagal diambil server upload-post (jaringan terputus)`,
      solusi: `Videonya tidak rusak dan akun ${nama} Anda tidak bermasalah; pengambilan video oleh server terputus di tengah jalan. Ulangi unggahan ke ${nama} saja. Bila terus terjadi, videonya kemungkinan terlalu besar — kompres dulu (≤ 50 MB) lalu unggah ulang.`,
    };
  }
  if (ada("temporarily locked", "account is locked", "account locked")) {
    return {
      ringkas: `Akun ${nama} sedang dikunci oleh ${nama}`,
      solusi: `${nama} mengunci akun ini sementara (biasanya minta verifikasi nomor HP/email). Buka aplikasi ${nama} dengan akun itu dan ikuti langkah membuka kunci, lalu ${CARA_TAUTKAN_ULANG} ${nama} dan unggah ulang.`,
    };
  }
  if (ada("not permitted to perform this action", "not permitted", "suspended", "restricted")) {
    return {
      ringkas: `Akun ${nama} sedang dibatasi oleh ${nama}`,
      solusi: `${nama} menolak postingan dari akun ini — akunnya dibatasi/ditangguhkan, belum verifikasi nomor, atau ditandai spam karena terlalu sering memposting konten yang mirip. Buka aplikasi ${nama} dengan akun itu, periksa pemberitahuan pembatasan atau permintaan verifikasi, dan selesaikan. Menautkan ulang TIDAK membantu; ulangi unggahan setelah pembatasan dicabut, dan beri jeda antar-unggahan.`,
    };
  }
  if (ada("session has expired", "could not be refreshed", "unauthorized", "401", "please reconnect", "invalid_grant")) {
    return {
      ringkas: `Sambungan ${nama} kedaluwarsa — perlu ditautkan ulang`,
      solusi: `Izin login ${nama} di upload-post sudah tidak berlaku (biasanya karena ganti kata sandi, keluar dari perangkat, atau lama tidak dipakai). ${CARA_TAUTKAN_ULANG} ${nama} lewat upload-post, lalu unggah ulang ke ${nama} saja.`,
    };
  }
  if (ada("no tweet id", "no post id", "tweet creation failed for part")) {
    return {
      ringkas: `${nama} tidak mengonfirmasi postingan`,
      solusi: `Postingan mungkin sudah tayang, mungkin juga tidak. Cek akun ${nama} Anda dulu; bila belum ada, baru unggah ulang ke ${nama} saja supaya tidak dobel.`,
    };
  }
  if (ada("service unavailable", "connection reset", "connection aborted", "read timed out", "timed out", "bad gateway", "gateway timeout", "temporarily unavailable", "try again later")) {
    return {
      ringkas: `Gangguan sesaat di server ${nama} / upload-post`,
      solusi: `Bukan kesalahan Anda dan akun Anda tidak bermasalah. Tunggu beberapa menit, lalu ulangi unggahan ke ${nama} saja.`,
    };
  }
  if (p === "twitter" && ada("longer than 2 minutes", "video too long")) {
    return {
      ringkas: "Video terlalu panjang untuk X",
      solusi: "X hanya menerima video maksimal 2 menit 20 detik untuk akun biasa. Potong videonya lalu unggah ulang ke X.",
    };
  }
  if (["completed", "failed", "error", ""].includes(m.trim())) {
    return {
      ringkas: `${nama} gagal menerbitkan video (penyebab tidak dilaporkan)`,
      solusi: `upload-post tidak menyebut penyebabnya. Ulangi unggahan ke ${nama} saja; bila gagal lagi, ${CARA_TAUTKAN_ULANG} ${nama}.`,
    };
  }
  if (p === "facebook" && ada("page", "halaman", "no facebook")) {
    return { ringkas: "Halaman Facebook belum dipilih", solusi: `${CARA_TAUTKAN_ULANG} Facebook dan pilih Halaman (Page) yang dipakai untuk posting.` };
  }
  // "cap" dulu dicocokkan sebagai POTONGAN kata — dan "caption" memuat
  // "cap", sehingga caption TikTok yang kepanjangan diberi saran yang
  // sama sekali salah ("buka Kotak Masuk TikTok"). Kini dicocokkan
  // sebagai KATA utuh (15 Sep 2026).
  if (p === "tiktok" && (ada("inbox", "unaudited", "active user", "private", "pending review") || kata.has("cap") || kata.has("caps"))) {
    return { ringkas: "TikTok menahan video di Kotak Masuk", solusi: "Buka aplikasi TikTok → Kotak Masuk/Notifikasi → terbitkan video itu secara manual (batasan TikTok untuk unggahan lewat API)." };
  }
  // YouTube lebih spesifik daripada kuota biasa: batas hariannya ketat
  // untuk channel yang BELUM diverifikasi, dan verifikasi itulah jalan
  // keluarnya — bukan sekadar menunggu.
  if (p === "youtube" && ada("exceeded the number of videos", "uploadlimitexceeded", "upload limit", "daily")) {
    return { ringkas: "Jatah unggah harian YouTube sudah habis", solusi: "YouTube membatasi jumlah video per hari untuk channel yang belum diverifikasi. Coba lagi besok, atau verifikasi channel-nya di youtube.com/verify supaya batasnya naik." };
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
  if (ada("quota", "rate limit", "too many", "limit exceeded", "daily limit", "daily", "per day", "harian", "429")) {
    return { ringkas: `${nama} membatasi jumlah unggahan hari ini`, solusi: `Batas ini milik ${nama}, bukan aplikasi kita. Jatahnya pulih sendiri (umumnya 24 jam); untuk yang mendesak, unggah langsung dari aplikasi ${nama}.` };
  }
  if (ada("copyright", "music", "audio")) {
    return { ringkas: `${nama} menolak karena hak cipta musik/audio`, solusi: "Ganti musik latar dengan yang bebas hak cipta, lalu unggah ulang." };
  }
  if (ada("format", "codec", "resolution", "aspect", "duration", "too short", "too large", "size")) {
    return { ringkas: `Format/durasi video tidak diterima ${nama}`, solusi: "Pakai MP4 (H.264) vertikal 9:16, durasi sesuai batas platform, ukuran ≤ 50 MB, lalu unggah ulang." };
  }
  return { ringkas: `${nama} gagal menerbitkan video`, solusi: `Coba unggah ulang. Bila masih gagal, ${CARA_TAUTKAN_ULANG} ${nama}.` };
}

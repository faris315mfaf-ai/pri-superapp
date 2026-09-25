// ============================================================
// TAUTAN PENDEK (25 Sep 2026) — link "bagikan" yang tidak memuat ID video:
//   TikTok   : vt.tiktok.com/<kode>, vm.tiktok.com/<kode>, tiktok.com/t/<kode huruf>
//   Facebook : facebook.com/share/r/<kode>, /share/v/<kode>, fb.watch/<kode>
//   Threads  : threads.com/share/<kode>
// Anggota sering melaporkan bentuk ini (BPJS: seluruh 36 video Facebook).
// Tanpa diurai, videonya tidak bisa dicocokkan ke upload-post → angkanya
// tidak pernah muncul. Pengurainya (jaringan) ada di lib/segar-metrik-video;
// berkas ini murni supaya bisa diuji dan dipakai di mana saja.
// ============================================================

const POLA: { platform: string; re: RegExp }[] = [
  { platform: "tiktok", re: /^https?:\/\/(?:vt|vm)\.tiktok\.com\/([A-Za-z0-9]{5,})/i },
  // /t/<angka> sudah memuat ID video (lihat idVideo) — yang pendek berhuruf.
  { platform: "tiktok", re: /^https?:\/\/(?:www\.|m\.)?tiktok\.com\/t\/([A-Za-z0-9]*[A-Za-z][A-Za-z0-9]*)\/?/i },
  { platform: "facebook", re: /^https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/share\/[rvp]\/([A-Za-z0-9]{5,})/i },
  { platform: "facebook", re: /^https?:\/\/fb\.watch\/(?:v\/)?([A-Za-z0-9_-]{5,})/i },
  { platform: "threads", re: /^https?:\/\/(?:www\.)?threads\.(?:com|net)\/share\/([A-Za-z0-9_-]{5,})/i },
];

/** Kode link pendek (tanpa awalan) bila `url` link pendek platform itu; null bila bukan. */
export function kodeTautanPendek(platform: string, url: string): string | null {
  const p = platform.trim().toLowerCase();
  const s = (url ?? "").trim();
  for (const x of POLA) {
    if (x.platform !== p) continue;
    const m = x.re.exec(s);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** true bila alamat ini link pendek yang harus diurai dulu. */
export function adalahTautanPendek(platform: string, url: string): boolean {
  return kodeTautanPendek(platform, url) !== null;
}

/**
 * Dari jawaban pengalihan (Location) → alamat video yang sebenarnya.
 * null bila pengalihannya bukan ke halaman video (mis. halaman masuk).
 */
export function alamatDariPengalihan(platform: string, lokasi: string | null | undefined): string | null {
  const s = (lokasi ?? "").trim();
  if (!/^https?:\/\//i.test(s)) return null;
  const p = platform.trim().toLowerCase();
  if (p === "tiktok") return /tiktok\.com\/@[\w.-]+\/(?:video|photo)\/\d{15,22}/i.test(s) ? s : null;
  if (p === "facebook") {
    // Reel, video, watch, atau postingan (story.php?story_fbid=… — bentuk
    // pengalihan untuk link bagikan postingan, diverifikasi 25 Sep 2026).
    return /facebook\.com\/(?:reel\/\d{6,}|[^/?#]+\/videos\/(?:[^/?#]+\/)?\d{6,}|watch\/?\?v=\d{6,}|[^/?#]+\/posts\/\d{6,}|story\.php\?(?:[^#]*&)?story_fbid=\d{6,})/i.test(s)
      ? s
      : null;
  }
  if (p === "threads") return /threads\.(?:com|net)\/@[\w.-]+\/post\/[A-Za-z0-9_-]{5,}/i.test(s) ? s : null;
  return null;
}

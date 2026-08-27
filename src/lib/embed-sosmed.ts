// ============================================================
// Embed sosmed (spek 1.15) — ubah URL postingan menjadi URL iframe
// embed resminya. Dipakai modul TV Rakyat (30 video terbaru) dan
// profil (video milik user).
//
// Host yang diizinkan tercantum di frame-src CSP (src/proxy.ts):
// Instagram, TikTok, YouTube, Facebook. Threads & X tidak punya
// iframe embed yang layak -> null (UI menampilkan tautan biasa).
// ============================================================

/** URL iframe embed untuk sebuah postingan; null bila tak didukung. */
export function urlEmbedDari(platform: string, urlPost: string): string | null {
  const url = (urlPost ?? "").trim();
  if (!url) return null;
  const p = (platform ?? "").toLowerCase();

  if (p === "instagram") {
    // https://www.instagram.com/reel/ABC/ -> /reel/ABC/embed
    const m = /instagram\.com\/(reel|p|tv)\/([A-Za-z0-9_-]+)/i.exec(url);
    return m ? `https://www.instagram.com/${m[1]}/${m[2]}/embed` : null;
  }
  if (p === "tiktok") {
    // https://www.tiktok.com/@akun/video/123 -> /embed/v2/123
    const m = /tiktok\.com\/@[^/]+\/video\/(\d+)/i.exec(url);
    return m ? `https://www.tiktok.com/embed/v2/${m[1]}` : null;
  }
  if (p === "youtube") {
    // watch?v=ID | youtu.be/ID | /shorts/ID -> youtube-nocookie embed
    const m =
      /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i.exec(
        url,
      );
    return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null;
  }
  if (p === "facebook") {
    // Plugin video FB menerima URL post video apa adanya.
    if (!/facebook\.com/i.test(url)) return null;
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`;
  }
  return null; // threads, twitter/x: tautan biasa saja
}

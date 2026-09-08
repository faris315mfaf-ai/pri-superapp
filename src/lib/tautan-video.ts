// ============================================================
// TAUTAN VIDEO — identitas & bentuk kanonik (8 Sep 2026).
//
// Satu video yang sama bisa punya BANYAK bentuk tautan:
//   TikTok   : /t/<id>  ↔  /@akun/video/<id>?utm_campaign=…
//   Facebook : /reel/<id>  ↔  /reel/<id>/
//   YouTube  : watch?v=<id> ↔ youtu.be/<id> ↔ /shorts/<id>
//   Threads  : /@akun/post/<kode> ↔ /t/<kode>
//   X        : /<akun>/status/<id> ↔ /i/status/<id>
// Laporan KPI unik per (user, url) — bentuk yang berbeda lolos sebagai
// "video baru" dan menggandakan hitungan (insiden 7 Sep 2026: 907 baris
// TikTok ganda dalam 14 hari). Modul ini memberi ID stabil per platform
// dan satu bentuk kanonik untuk disimpan/ditampilkan. Murni, bisa diuji.
// ============================================================

/** Parameter pelacak yang tidak mengubah videonya — dibuang dari tautan. */
const PARAM_SAMPAH = new Set(["igsh", "igshid", "si", "share_id", "sender_device", "web_id", "is_from_webapp", "fbclid", "mibextid", "rdid", "share_url", "_r", "s", "t"]);

function urlAman(url: string): URL | null {
  const bersih = (url ?? "").trim();
  if (!bersih) return null;
  try {
    return new URL(/^https?:\/\//i.test(bersih) ? bersih : `https://${bersih}`);
  } catch {
    return null;
  }
}

/** Buang parameter pelacak (utm_* dan kawan-kawan) tanpa mengubah jalurnya. */
export function bersihkanQuery(url: string): string {
  const u = urlAman(url);
  if (!u) return (url ?? "").trim().slice(0, 500);
  for (const k of [...u.searchParams.keys()]) {
    if (k.startsWith("utm_") || PARAM_SAMPAH.has(k)) u.searchParams.delete(k);
  }
  u.hash = "";
  return u.toString().slice(0, 500);
}

/** ID stabil video di platformnya; null bila bentuk tautan tidak dikenal. */
export function idVideo(platform: string, url: string): string | null {
  const p = platform.toLowerCase();
  const s = (url ?? "").trim();
  const ambil = (re: RegExp, i = 1) => re.exec(s)?.[i] ?? null;
  switch (p) {
    case "tiktok":
      return ambil(/\/video\/(\d{15,22})/) ?? ambil(/\/t\/(\d{15,22})/) ?? ambil(/(\d{15,22})/);
    case "instagram":
      return ambil(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]{5,})/);
    case "threads":
      return ambil(/\/post\/([A-Za-z0-9_-]{5,})/) ?? ambil(/threads\.(?:com|net)\/t\/([A-Za-z0-9_-]{5,})/);
    case "twitter":
    case "x":
      return ambil(/\/status(?:es)?\/(\d{8,})/);
    case "facebook":
      return (
        ambil(/\/reel\/(\d{6,})/) ??
        ambil(/\/videos\/(?:[^/]+\/)?(\d{6,})/) ??
        ambil(/\/share\/[rv]\/([A-Za-z0-9]{6,})/) ??
        ambil(/[?&]v=(\d{6,})/) ??
        ambil(/[?&]story_fbid=(\d{6,})/) ??
        ambil(/\/posts\/(\d{6,})/)
      );
    case "youtube":
      return ambil(/[?&]v=([A-Za-z0-9_-]{6,})/) ?? ambil(/youtu\.be\/([A-Za-z0-9_-]{6,})/) ?? ambil(/\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{6,})/);
    case "bilibili":
      return ambil(/\/video\/(BV[0-9A-Za-z]{10}|av\d+|\d{5,})/) ?? ambil(/b23\.tv\/([A-Za-z0-9]{5,})/);
    default:
      return null;
  }
}

/** Nama akun dari tautan (bila ada) — TikTok/Threads/X. */
function akunDari(platform: string, s: string): string | null {
  switch (platform) {
    case "tiktok":
      return /tiktok\.com\/@([\w.-]+)\/video\//i.exec(s)?.[1] ?? null;
    case "threads":
      return /threads\.(?:com|net)\/@([\w.-]+)\/post\//i.exec(s)?.[1] ?? null;
    case "twitter":
    case "x": {
      const u = /(?:x|twitter)\.com\/([A-Za-z0-9_]{1,30})\/status/i.exec(s)?.[1] ?? null;
      return u && u.toLowerCase() !== "i" ? u : null;
    }
    default:
      return null;
  }
}

/**
 * Bentuk kanonik satu tautan. `username` (akun tertaut anggota di platform
 * itu) dipakai bila tautan aslinya tidak menyebut akun (mis. TikTok /t/<id>).
 * Tautan yang tidak dikenal hanya dibersihkan parameter pelacaknya.
 */
export function kanonikTautan(platform: string, url: string, username?: string | null): string {
  const p = platform.toLowerCase();
  const s = (url ?? "").trim();
  const id = idVideo(p, s);
  const akun = akunDari(p, s) ?? (username ? username.replace(/^@/, "").trim() : "") ?? "";
  if (!id) return bersihkanQuery(s);
  switch (p) {
    case "tiktok":
      return akun ? `https://www.tiktok.com/@${akun}/video/${id}` : `https://www.tiktok.com/t/${id}`;
    case "instagram":
      return `https://www.instagram.com/${/\/p\//.test(s) ? "p" : "reel"}/${id}/`;
    case "threads":
      return akun ? `https://www.threads.com/@${akun}/post/${id}` : `https://www.threads.com/t/${id}`;
    case "twitter":
    case "x":
      return akun ? `https://x.com/${akun}/status/${id}` : `https://x.com/i/status/${id}`;
    case "facebook":
      if (/\/reel\//.test(s)) return `https://www.facebook.com/reel/${id}`;
      if (/\/share\/r\//.test(s)) return `https://www.facebook.com/share/r/${id}/`;
      if (/\/share\/v\//.test(s)) return `https://www.facebook.com/share/v/${id}/`;
      if (/[?&]v=/.test(s) && /\/watch/.test(s)) return `https://www.facebook.com/watch/?v=${id}`;
      return bersihkanQuery(s).replace(/\/$/, "");
    case "youtube":
      return `https://www.youtube.com/watch?v=${id}`;
    case "bilibili": {
      // Host dipertahankan (bilibili.com vs bilibili.tv/id) — hanya jalur, tanpa query.
      const u = urlAman(s);
      return u ? `${u.origin}${u.pathname.replace(/\/$/, "")}` : bersihkanQuery(s);
    }
    default:
      return bersihkanQuery(s);
  }
}

/** Kunci pembanding "video yang sama": platform + id; tanpa id → tautan bersih. */
export function kunciVideo(platform: string, url: string): string {
  const p = platform.toLowerCase();
  const id = idVideo(p, url);
  return `${p}|${id ?? bersihkanQuery(url).toLowerCase().replace(/\/$/, "")}`;
}

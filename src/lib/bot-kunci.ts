// ============================================================
// BOT REDAKSI — kunci kanonik video sumber (13 Okt 2026).
//
// Dua bot (atau bot dan manusia) tidak boleh memakai video yang sama. Pagar
// utamanya: UNIQUE bot_kandidat.kunci_kanonik. Kunci ini harus SAMA untuk
// semua bentuk URL video yang sama (www/m., parameter pelacak, /reel/ vs
// /p/, youtu.be vs watch?v=, dst.), dan hanya terbentuk untuk platform yang
// dikenal. MURNI: tanpa jaringan. URL pendek (vm.tiktok.com, fb.watch) tidak
// bisa dinormalkan tanpa jaringan, sehingga DITOLAK (null) — pemanen harus
// memberikan URL lengkap.
// ============================================================

export type PlatformKanonik = "instagram" | "tiktok" | "youtube" | "facebook" | "x";

export type KunciKanonik = { kunci: string; platform: PlatformKanonik; id: string };

/** Host sah: persis domain atau subdomainnya (BUKAN "evilinstagram.com", BUKAN "instagram.com.evil.com"). */
function cocokHost(host: string, domain: string): boolean {
  return host === domain || host.endsWith("." + domain);
}

function bersihkanHost(h: string): string {
  return h.toLowerCase().replace(/\.$/, "");
}

const ID_IG = /^[A-Za-z0-9_-]{5,20}$/;
const ID_YT = /^[A-Za-z0-9_-]{11}$/;
const ID_ANGKA = /^\d{5,25}$/;

/** Pecah path menjadi segmen tanpa string kosong. */
function segmen(path: string): string[] {
  return path.split("/").filter((s) => s.length > 0);
}

function buat(platform: PlatformKanonik, id: string): KunciKanonik {
  return { kunci: `${platform}:${id}`, platform, id };
}

/**
 * Kunci kanonik sebuah URL video, atau null bila bukan video yang dikenal
 * (platform tidak didukung, URL pendek, skema bukan http/https, host berupa
 * IP/localhost, id tidak wajar).
 */
export function kunciKanonik(urlMentah: string): KunciKanonik | null {
  const mentah = String(urlMentah ?? "").trim();
  if (!mentah || mentah.length > 2048) return null;
  let u: URL;
  try {
    u = new URL(mentah);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  const host = bersihkanHost(u.hostname);
  // Tolak IP dan host tanpa titik (localhost, intranet).
  if (!host.includes(".") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return null;
  const s = segmen(u.pathname);

  if (cocokHost(host, "instagram.com")) {
    // /p/{kode} · /reel/{kode} · /reels/{kode} · /tv/{kode} · /{user}/(p|reel|tv)/{kode}
    for (let i = 0; i < s.length - 1; i++) {
      if (["p", "reel", "reels", "tv"].includes(s[i]) && ID_IG.test(s[i + 1])) return buat("instagram", s[i + 1]);
    }
    return null;
  }

  if (cocokHost(host, "tiktok.com")) {
    // Hanya bentuk panjang /@user/video/{angka}. vm./vt.tiktok.com = URL pendek → ditolak.
    if (host.startsWith("vm.") || host.startsWith("vt.")) return null;
    const i = s.indexOf("video");
    if (i > 0 && s[0].startsWith("@") && ID_ANGKA.test(s[i + 1] ?? "")) return buat("tiktok", s[i + 1]);
    return null;
  }

  if (host === "youtu.be") {
    return ID_YT.test(s[0] ?? "") ? buat("youtube", s[0]) : null;
  }
  if (cocokHost(host, "youtube.com") || cocokHost(host, "youtube-nocookie.com")) {
    if (s[0] === "watch") {
      const v = u.searchParams.get("v") ?? "";
      return ID_YT.test(v) ? buat("youtube", v) : null;
    }
    if (["shorts", "embed", "live", "v"].includes(s[0]) && ID_YT.test(s[1] ?? "")) return buat("youtube", s[1]);
    return null;
  }

  if (cocokHost(host, "facebook.com")) {
    // /reel/{angka} · /watch/?v={angka} · /{halaman}/videos/{angka} · /videos/{angka}
    if (s[0] === "reel" && ID_ANGKA.test(s[1] ?? "")) return buat("facebook", s[1]);
    if (s[0] === "watch") {
      const v = u.searchParams.get("v") ?? "";
      return ID_ANGKA.test(v) ? buat("facebook", v) : null;
    }
    const i = s.indexOf("videos");
    if (i >= 0 && ID_ANGKA.test(s[i + 1] ?? "")) return buat("facebook", s[i + 1]);
    return null;
  }

  if (cocokHost(host, "x.com") || cocokHost(host, "twitter.com")) {
    // /{user}/status/{angka}
    const i = s.indexOf("status");
    if (i > 0 && ID_ANGKA.test(s[i + 1] ?? "")) return buat("x", s[i + 1]);
    return null;
  }

  return null;
}

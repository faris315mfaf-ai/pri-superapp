// ============================================================
// RUMAH BOT (runner) — konfigurasi dari lingkungan (13 Okt 2026).
// Semua nilai dari env (berkas bot.env di VPS mesin, izin 0600). Rahasia TIDAK
// pernah dicetak ke log.
// ============================================================

export type KonfigRunner = {
  /** Alamat dasar aplikasi, mis. https://pri-superapp.com (tanpa garis miring akhir). */
  appUrl: string;
  /** Rahasia HMAC runner (BOT_RUNNER_SECRET). */
  rahasia: string;
  /** Soket Unix API mesin. */
  soketMesin: string;
  /** Biner yt-dlp. */
  ytdlpBin: string;
  /** Berkas cookies Netscape untuk yt-dlp (opsional). */
  cookiesFile: string | null;
  /** Selang denyut (ms). */
  selangDenyutMs: number;
  /** Jeda bot bila perintah "diam" (ms). */
  jedaDiamMs: number;
  /** Versi yang dilaporkan di denyut. */
  versi: string;
};

export const VERSI_RUNNER = "1.0";

function angka(nilai: string | undefined, bawaan: number, min: number, maks: number): number {
  const n = Number(nilai);
  if (!nilai || !Number.isFinite(n)) return bawaan;
  return Math.min(maks, Math.max(min, Math.trunc(n)));
}

/** Membaca konfigurasi; melempar Error berpesan jelas bila wajib-isi kurang. */
export function bacaKonfig(env: Record<string, string | undefined>): KonfigRunner {
  const appUrl = String(env.APP_URL ?? "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(appUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(appUrl)) {
    throw new Error("APP_URL wajib diisi dengan alamat https:// aplikasi.");
  }
  const rahasia = String(env.BOT_RUNNER_SECRET ?? "");
  if (rahasia.length < 16) throw new Error("BOT_RUNNER_SECRET wajib diisi (minimal 16 karakter).");
  const cookies = String(env.BOT_COOKIES_FILE ?? "").trim();
  return {
    appUrl,
    rahasia,
    soketMesin: String(env.AUTOEDIT_SOCKET ?? "").trim() || "/run/autoedit/api.sock",
    ytdlpBin: String(env.YTDLP_BIN ?? "").trim() || "/usr/local/bin/yt-dlp",
    cookiesFile: cookies || null,
    selangDenyutMs: angka(env.BOT_DENYUT_MS, 15_000, 5_000, 60_000),
    jedaDiamMs: angka(env.BOT_JEDA_DIAM_MS, 15_000, 3_000, 120_000),
    versi: VERSI_RUNNER,
  };
}

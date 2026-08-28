// ============================================================
// Google OAuth (KHUSUS SISI SERVER) — fitur 1.19/3.1.
// State bertanda tangan HMAC + URL dasar aplikasi.
// ============================================================
import { createHmac, randomBytes } from "node:crypto";

function rahasiaState(): string {
  // HMAC memakai client secret — sudah wajib ada untuk tukar code.
  return process.env.GOOGLE_CLIENT_SECRET ?? "";
}

/** state bertanda tangan: {n: nonce, u?: user_id penaut, exp 10 mnt} */
export function buatStateGoogle(uidPenaut?: string): string {
  const isi = JSON.stringify({
    n: randomBytes(12).toString("base64url"),
    u: uidPenaut ?? null,
    exp: Date.now() + 10 * 60 * 1000,
  });
  const b64 = Buffer.from(isi).toString("base64url");
  const ttd = createHmac("sha256", rahasiaState()).update(b64).digest("base64url");
  return `${b64}.${ttd}`;
}

/** Baca+verifikasi state; null bila palsu/kedaluwarsa. */
export function bacaStateGoogle(state: string): { u: string | null } | null {
  const [b64, ttd] = state.split(".");
  if (!b64 || !ttd) return null;
  const benar = createHmac("sha256", rahasiaState()).update(b64).digest("base64url");
  if (ttd !== benar) return null;
  try {
    const isi = JSON.parse(Buffer.from(b64, "base64url").toString()) as {
      u: string | null;
      exp: number;
    };
    if (Date.now() > isi.exp) return null;
    return { u: isi.u };
  } catch {
    return null;
  }
}

/** URL dasar aplikasi — redirect URI harus SAMA dgn di Google Console. */
export function urlAplikasi(request: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export function googleSiap(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

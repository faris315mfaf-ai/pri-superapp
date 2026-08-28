// ============================================================
// WebAuthn / Login Sidik Jari (fitur 1.21) — SISI SERVER.
//
// Passkey memakai biometrik perangkat (sidik jari/Face ID/PIN). Kunci
// PRIVAT tinggal di perangkat & tak pernah dikirim; server hanya
// menyimpan kunci PUBLIK dan memverifikasi tanda tangan.
//
// RP ID = domain (mis. pri-superapp.vercel.app). Karena APK sudah
// terverifikasi lewat assetlinks.json, origin di dalam APK = domain,
// sehingga passkey yang sama berlaku di aplikasi web maupun APK.
// ============================================================
import { supabase } from "@/lib/supabase";

export type InfoRP = { rpID: string; rpName: string; origin: string };

/**
 * Turunkan RP ID & origin dari permintaan. RP ID = hostname TANPA
 * port; origin = skema+host+port. Diambil dari header proxy (Vercel)
 * agar cocok dengan asal peramban sebenarnya.
 */
export function infoRP(request: Request): InfoRP {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return { rpID: host.split(":")[0], rpName: "PRI SuperApp", origin: `${proto}://${host}` };
}

const TTL_TANTANGAN_MS = 5 * 60_000;

/** Simpan tantangan sekali-pakai; bersihkan yang kedaluwarsa. */
export async function simpanTantangan(
  challenge: string,
  untuk: "daftar" | "masuk",
  userId?: number,
): Promise<void> {
  const db = supabase();
  await db
    .from("webauthn_tantangan")
    .delete()
    .lt("exp", new Date().toISOString());
  await db.from("webauthn_tantangan").insert({
    challenge,
    untuk,
    user_id: userId ?? null,
    exp: new Date(Date.now() + TTL_TANTANGAN_MS).toISOString(),
  });
}

/**
 * Ambil & PAKAI (hapus) tantangan yang cocok dengan challenge dari
 * clientDataJSON. Sekali pakai — mengembalikan null bila tak ada /
 * kedaluwarsa / jenisnya tak cocok.
 */
export async function pakaiTantangan(
  challenge: string,
  untuk: "daftar" | "masuk",
): Promise<{ user_id: number | null } | null> {
  const db = supabase();
  const { data } = await db
    .from("webauthn_tantangan")
    .select("challenge, untuk, user_id, exp")
    .eq("challenge", challenge)
    .maybeSingle();
  // Hapus apa pun hasilnya (sekali pakai).
  if (data) {
    await db.from("webauthn_tantangan").delete().eq("challenge", challenge);
  }
  if (!data || data.untuk !== untuk) return null;
  if (Date.now() > Date.parse(String(data.exp))) return null;
  return { user_id: data.user_id != null ? Number(data.user_id) : null };
}

/** Ambil challenge (base64url) dari clientDataJSON respons WebAuthn. */
export function challengeDariResponse(clientDataJSONb64url: string): string | null {
  try {
    const json = JSON.parse(Buffer.from(clientDataJSONb64url, "base64url").toString());
    return typeof json.challenge === "string" ? json.challenge : null;
  } catch {
    return null;
  }
}

// ---------- CRUD kredensial ----------

export type BarisKredensial = {
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string[] | null;
};

export async function kredensialUser(userId: number): Promise<BarisKredensial[]> {
  const { data } = await supabase()
    .from("kredensial_webauthn")
    .select("credential_id, public_key, counter, transports")
    .eq("user_id", userId);
  return (data ?? []) as BarisKredensial[];
}

export async function kredensialByCredentialId(
  credentialId: string,
): Promise<(BarisKredensial & { user_id: number }) | null> {
  const { data } = await supabase()
    .from("kredensial_webauthn")
    .select("user_id, credential_id, public_key, counter, transports")
    .eq("credential_id", credentialId)
    .maybeSingle();
  return data ? { ...(data as BarisKredensial), user_id: Number(data.user_id) } : null;
}

export async function jumlahKredensial(userId: number): Promise<number> {
  const { count } = await supabase()
    .from("kredensial_webauthn")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return count ?? 0;
}

// GET /api/login/google — MULAI alur Google OAuth (fitur 1.19/3.1).
//
// Alur REDIRECT server-side (tanpa skrip pihak ketiga — lolos CSP
// ketat dan jalan di WebView APK):
//   1. Route ini mengarahkan ke halaman izin Google.
//   2. Google kembali ke /api/login/google/callback?code=...
//   3. Callback menukar code, MEMVERIFIKASI id_token di server
//      (google-auth-library — bukan verifikasi manual), lalu
//      login/daftar dan mengantarkan token sesi ke aplikasi.
//
// ?mode=tautkan&t=<token> — pengguna yang SUDAH masuk menautkan
// Google-nya: identitasnya dibawa lewat `state` bertanda tangan HMAC.
import { userDariToken } from "@/lib/sesi";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { buatStateGoogle, googleSiap, urlAplikasi } from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tolak = await pastikanTidakMelebihiBatas(request, "google-mulai", 20, 10 * 60);
  if (tolak) return tolak;

  if (!googleSiap()) {
    return Response.redirect(
      `${urlAplikasi(request)}/?gerror=${encodeURIComponent(
        "Login Google belum diatur (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET kosong).",
      )}`,
      302,
    );
  }

  // Mode tautkan: pengguna sudah masuk — bawa identitasnya di state.
  const url = new URL(request.url);
  let uidPenaut: string | undefined;
  if (url.searchParams.get("mode") === "tautkan") {
    const t = url.searchParams.get("t") ?? "";
    const user = t ? await userDariToken(t) : null;
    if (!user) {
      return Response.redirect(
        `${urlAplikasi(request)}/?gerror=${encodeURIComponent("Sesi tidak berlaku.")}`,
        302,
      );
    }
    uidPenaut = String(user.id);
  }

  const redirectUri = `${urlAplikasi(request)}/api/login/google/callback`;
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", "openid email profile");
  auth.searchParams.set("state", buatStateGoogle(uidPenaut));
  auth.searchParams.set("prompt", "select_account");
  return Response.redirect(auth.toString(), 302);
}

// GET  /api/webauthn/daftar — opsi pendaftaran passkey (butuh sesi)
// POST /api/webauthn/daftar — verifikasi & simpan kredensial (butuh sesi)
//
// Fitur 1.21: pengguna yang SUDAH masuk mendaftarkan sidik jari
// perangkatnya (dari toggle di Profil → Keamanan).
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { supabase } from "@/lib/supabase";
import {
  infoRP,
  simpanTantangan,
  pakaiTantangan,
  challengeDariResponse,
  kredensialUser,
} from "@/lib/webauthn";

export const dynamic = "force-dynamic";

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasuk(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  return user;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const { rpID, rpName } = infoRP(request);

    // Cegah mendaftarkan perangkat yang SAMA dua kali.
    const punya = await kredensialUser(Number(user.id));

    const opsi = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new TextEncoder().encode(String(user.id)),
      userName: user.username || user.email,
      userDisplayName: user.nama,
      attestationType: "none",
      excludeCredentials: punya.map((k) => ({
        id: k.credential_id,
        transports: (k.transports ?? undefined) as never,
      })),
      authenticatorSelection: {
        // "platform" = biometrik bawaan perangkat (bukan kunci USB).
        authenticatorAttachment: "platform",
        // Discoverable/resident key: bisa masuk TANPA mengetik username.
        residentKey: "required",
        userVerification: "required",
      },
    });

    await simpanTantangan(opsi.challenge, "daftar", Number(user.id));
    return opsi;
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const { rpID, origin } = infoRP(request);

    const respons = (await request.json().catch(() => null)) as RegistrationResponseJSON | null;
    if (!respons?.response?.clientDataJSON) {
      throw Object.assign(new Error("Data pendaftaran tidak lengkap."), { status: 400 });
    }

    const challenge = challengeDariResponse(respons.response.clientDataJSON);
    if (!challenge) throw Object.assign(new Error("Tantangan tidak terbaca."), { status: 400 });
    const tantangan = await pakaiTantangan(challenge, "daftar");
    if (!tantangan || tantangan.user_id !== Number(user.id)) {
      throw Object.assign(new Error("Sesi pendaftaran sidik jari kedaluwarsa. Ulangi."), {
        status: 400,
      });
    }

    const hasil = await verifyRegistrationResponse({
      response: respons,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    if (!hasil.verified || !hasil.registrationInfo) {
      throw Object.assign(new Error("Verifikasi sidik jari gagal."), { status: 400 });
    }

    const kred = hasil.registrationInfo.credential;
    const { error } = await supabase().from("kredensial_webauthn").insert({
      user_id: Number(user.id),
      credential_id: kred.id,
      public_key: Buffer.from(kred.publicKey).toString("base64url"),
      counter: kred.counter,
      transports: kred.transports ?? null,
      nama_perangkat: request.headers.get("user-agent")?.slice(0, 120) ?? null,
    });
    if (error) {
      // Unik dilanggar = perangkat ini sudah terdaftar.
      if (String(error.message).includes("duplicate")) {
        return { sukses: true, catatan: "Perangkat ini sudah terdaftar." };
      }
      console.error("[webauthn/daftar] simpan:", error.message);
      throw new Error("Gagal menyimpan sidik jari.");
    }

    return { sukses: true };
  });
}

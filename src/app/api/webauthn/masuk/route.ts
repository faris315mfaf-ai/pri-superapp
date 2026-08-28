// GET  /api/webauthn/masuk — opsi autentikasi passkey (tanpa sesi)
// POST /api/webauthn/masuk — verifikasi tanda tangan → terbitkan sesi
//
// Fitur 1.21: masuk dengan sidik jari. Karena kredensialnya
// discoverable (resident key), pengguna tak perlu mengetik apa pun —
// perangkat menyodorkan passkey yang cocok, biometrik memverifikasi,
// server menerbitkan token sesi.
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { bungkus } from "@/lib/api-helper";
import { supabase } from "@/lib/supabase";
import { buatSesi, keUserPublik, KOLOM_USER, type BarisUser } from "@/lib/sesi";
import { pastikanBukanPerbaikan } from "@/lib/perbaikan";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import {
  infoRP,
  simpanTantangan,
  pakaiTantangan,
  challengeDariResponse,
  kredensialByCredentialId,
} from "@/lib/webauthn";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return bungkus(async () => {
    const { rpID } = infoRP(request);
    const opsi = await generateAuthenticationOptions({
      rpID,
      // Kosong = discoverable: perangkat memilih passkey yang cocok.
      allowCredentials: [],
      userVerification: "required",
    });
    await simpanTantangan(opsi.challenge, "masuk");
    return opsi;
  });
}

export async function POST(request: Request) {
  // Rem penyalahgunaan: 20 percobaan / 10 menit / IP.
  const tolak = await pastikanTidakMelebihiBatas(request, "webauthn-masuk", 20, 10 * 60);
  if (tolak) return tolak;

  return bungkus(async () => {
    const { rpID, origin } = infoRP(request);
    const respons = (await request.json().catch(() => null)) as AuthenticationResponseJSON | null;
    if (!respons?.id || !respons?.response?.clientDataJSON) {
      throw Object.assign(new Error("Data masuk tidak lengkap."), { status: 400 });
    }

    const challenge = challengeDariResponse(respons.response.clientDataJSON);
    if (!challenge) throw Object.assign(new Error("Tantangan tidak terbaca."), { status: 400 });
    const tantangan = await pakaiTantangan(challenge, "masuk");
    if (!tantangan) {
      throw Object.assign(new Error("Sesi masuk sidik jari kedaluwarsa. Ulangi."), {
        status: 400,
      });
    }

    // Cari kredensial berdasarkan id-nya, lalu pemiliknya.
    const kred = await kredensialByCredentialId(respons.id);
    if (!kred) {
      throw Object.assign(new Error("Sidik jari ini belum terdaftar di sistem."), {
        status: 401,
      });
    }

    const hasil = await verifyAuthenticationResponse({
      response: respons,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: kred.credential_id,
        publicKey: new Uint8Array(Buffer.from(kred.public_key, "base64url")),
        counter: Number(kred.counter),
        transports: (kred.transports ?? undefined) as never,
      },
    });
    if (!hasil.verified) {
      throw Object.assign(new Error("Verifikasi sidik jari gagal."), { status: 401 });
    }

    const db = supabase();
    // Naikkan counter (anti-replay) + catat pemakaian.
    await db
      .from("kredensial_webauthn")
      .update({
        counter: hasil.authenticationInfo.newCounter,
        dipakai_pada: new Date().toISOString(),
      })
      .eq("credential_id", kred.credential_id);

    // Ambil akun & terbitkan sesi — aturan blokir SAMA dengan login biasa.
    const { data } = await db
      .from("app_user")
      .select(KOLOM_USER)
      .eq("id", kred.user_id)
      .maybeSingle();
    const u = data as BarisUser | null;
    if (!u) throw Object.assign(new Error("Akun tidak ditemukan."), { status: 401 });
    if (!u.aktif) throw Object.assign(new Error("Akun ini dinonaktifkan. Hubungi pengurus."), { status: 403 });
    if (u.status === "ditolak") {
      throw Object.assign(new Error("Permohonan akun Anda ditolak."), { status: 403 });
    }
    await pastikanBukanPerbaikan(u.role);

    await db
      .from("app_user")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", kred.user_id)
      .then(() => {}, () => {});

    const token = await buatSesi(kred.user_id, "Login Sidik Jari");
    return { user: keUserPublik(u), token };
  });
}

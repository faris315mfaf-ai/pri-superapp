// GET /api/ultah — siapa yang berulang tahun hari ini (WIB).
// Dipakai beranda (banner ucapan) dan profil (confetti + topi bagi
// yang berulang tahun).
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { daftarUltahHariIni } from "@/lib/ultah";

export const dynamic = "force-dynamic";

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    return { data: await daftarUltahHariIni() };
  });
}

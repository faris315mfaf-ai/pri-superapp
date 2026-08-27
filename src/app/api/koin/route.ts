// GET /api/koin — saldo koin SAYA + besaran bonus per aktivitas.
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { bacaBonusKoin, saldoKoin } from "@/lib/koin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return bungkus(async () => {
    const h = request.headers.get("authorization") ?? "";
    const token = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
    const user = await userDariToken(token);
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    return {
      saldo: await saldoKoin(Number(user.id)),
      bonus: await bacaBonusKoin(),
    };
  });
}

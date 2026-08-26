// GET /api/streak — task streak (ala Duolingo) milik pemanggil,
// untuk ditampilkan di Beranda & Profil (spek 4.1).
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { bacaTugasStreak } from "@/lib/streak";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return bungkus(async () => {
    const h = request.headers.get("authorization") ?? "";
    const token = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
    const user = await userDariToken(token);
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    return await bacaTugasStreak(Number(user.id));
  });
}

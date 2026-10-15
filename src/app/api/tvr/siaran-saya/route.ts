// GET /api/tvr/siaran-saya — siaran Koordinator ke akun sosmed SAYA (15 Okt 2026).
// Kartu "Siaran koordinator" di TV Rakyat Saya: anggota selalu bisa melihat apa yang
// diposting koordinator ke akunnya (persetujuan diberikan saat mendaftar).
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { GalatSiaran, siaranUntukSaya } from "@/lib/siaran-koordinator";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    try {
      return { data: await siaranUntukSaya(Number(user.id)) };
    } catch (e) {
      if (e instanceof GalatSiaran) throw Object.assign(new Error(e.message), { status: e.status, pesanAman: true });
      throw e;
    }
  });
}

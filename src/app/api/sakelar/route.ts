// /api/sakelar — keadaan fitur berat untuk klien (4 Sep 2026).
// GET → { fitur: {ludo, pet_beranda, juara_efek, asisten}, hemat, tur }
// Semua pengguna yang login; dibaca page.tsx saat masuk + tiap 5 menit.
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { bacaSakelar } from "@/lib/sakelar";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanMasuk(request);
    const s = await bacaSakelar();
    return { fitur: s.fitur, hemat: s.hemat, tur: s.tur };
  });
}

// /api/tur — sakelar TUTORIAL interaktif (4 Sep 2026).
// Master bisa mematikan tutorial "daftar akun → Kepatuhan Komen" untuk semua
// pengguna lewat Panel Master (pengaturan_sistem kunci `tur_aktif`).
// GET → { aktif: boolean }  (bawaan: aktif). Semua pengguna yang login.
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { bacaSakelar } from "@/lib/sakelar";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanMasuk(request);
    return { aktif: (await bacaSakelar()).tur };
  });
}

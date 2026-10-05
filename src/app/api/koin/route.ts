// GET /api/koin — DOMPET KOIN saya (Beranda, 5 Okt 2026): saldo, riwayat
// transaksi terbaru, dan apakah saya boleh mengelola koin orang lain.
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { bolehKelolaKoin } from "@/lib/peran";
import { riwayatKoin, saldoKoin } from "@/lib/koin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const uid = Number(user.id);
    const [saldo, riwayat] = await Promise.all([saldoKoin(uid), riwayatKoin(uid, 30)]);
    return { saldo, riwayat, boleh_kelola: bolehKelolaKoin(user) };
  });
}

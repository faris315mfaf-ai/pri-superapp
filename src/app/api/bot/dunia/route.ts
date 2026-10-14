// /api/bot/dunia — siapa yang sedang ONLINE di aplikasi + layar + aksi yang dikerjakan (14 Okt 2026).
// GET → StatusDunia (lib/dunia-murni). HANYA master (bolehRuangBot): memuat nama, judul video, dan akun
// sosmed pengguna lain. Presence = kehadiran detak (sedang membuka aplikasi), bukan sekadar sudah login.
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { bolehRuangBot } from "@/lib/peran";
import { modulAktifServer } from "@/lib/sakelar";
import { bacaStatusDunia } from "@/lib/dunia";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!bolehRuangBot(user)) {
      throw Object.assign(new Error("Ruang Bot hanya untuk master."), { status: 403 });
    }
    if (!(await modulAktifServer("ruangbot"))) {
      throw Object.assign(new Error("Modul Ruang Bot sedang dinonaktifkan."), { status: 423 });
    }
    return bacaStatusDunia();
  });
}

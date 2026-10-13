// /api/bot/status — keadaan Ruang Bot (13 Okt 2026).
// GET → { tabel_ada, jeda_global, runner, bots[], log[] }   (bentuk: lib/bot-tipe)
// HANYA master (bolehRuangBot). tabel_ada=false bila sql/67 belum dijalankan.
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { bolehRuangBot } from "@/lib/peran";
import { modulAktifServer } from "@/lib/sakelar";
import { ambilStatusBot } from "@/lib/bot-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!bolehRuangBot(user)) {
      throw Object.assign(new Error("Ruang Bot hanya untuk master."), { status: 403 });
    }
    // 423, bukan 5xx: pesan tetap utuh (lihat komentar lib/sakelar).
    if (!(await modulAktifServer("ruangbot"))) {
      throw Object.assign(new Error("Modul Ruang Bot sedang dinonaktifkan."), { status: 423 });
    }
    return ambilStatusBot();
  });
}

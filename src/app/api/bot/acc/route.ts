// /api/bot/acc — Antrean ACC bot (13 Okt 2026). HANYA master.
//   GET  → StatusAcc: video yang menunggu keputusan + riwayat keputusan terakhir
//   POST → { aksi: "setuju"|"ulang"|"tolak"|"batalkan_jadwal", tugas_id, caption? } (AksiAcc)
//
// "setuju" langsung menjalankan posting (menyalin video ke penyimpanan lalu menyerahkannya ke
// upload-post, dijadwalkan beberapa menit ke depan) — itu sebabnya maxDuration panjang.
// Aturan dan alurnya: lib/bot-posting.ts. Posting nyata MATI kecuali env BOT_POSTING_AKTIF=1.
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { bolehRuangBot } from "@/lib/peran";
import { modulAktifServer } from "@/lib/sakelar";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { validasiAksiAcc } from "@/lib/bot-posting-murni";
import { GalatAcc, bacaStatusAcc, putuskanAcc } from "@/lib/bot-posting";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function tolak(pesan: string, status = 400): never {
  throw Object.assign(new Error(pesan), { status });
}

/** GalatAcc → Error berstatus yang dimengerti bungkus(). */
function ubahGalat(e: unknown): never {
  if (e instanceof GalatAcc) throw Object.assign(new Error(e.message), { status: e.status });
  throw e;
}

async function pastikanMaster(request: Request) {
  const user = await pastikanMasuk(request);
  if (!bolehRuangBot(user)) tolak("Antrean ACC hanya untuk master.", 403);
  if (!(await modulAktifServer("ruangbot"))) tolak("Modul Ruang Bot sedang dinonaktifkan.", 423);
  return user;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanMaster(request);
    try {
      return await bacaStatusAcc();
    } catch (e) {
      return ubahGalat(e);
    }
  });
}

export async function POST(request: Request) {
  const terlalu = await pastikanTidakMelebihiBatas(request, "bot-acc", 30, 60);
  if (terlalu) return terlalu;

  return bungkus(async () => {
    const user = await pastikanMaster(request);
    const sah = validasiAksiAcc(await request.json().catch(() => null));
    if (!sah.ok) tolak(sah.pesan);
    try {
      const h = await putuskanAcc(sah.aksi, { id: Number(user.id), nama: String(user.nama ?? "") }, { request });
      return { sukses: h.ok, pesan: h.pesan };
    } catch (e) {
      return ubahGalat(e);
    }
  });
}

// /api/bot/usulan — usulan penugasan dari koordinator Nara (tahap 3, 13 Okt 2026). HANYA master.
//   GET                          → { terbuka, riwayat }
//   POST { aksi:"setuju"|"tolak", id }
// "setuju" memeriksa ulang pagar pada keadaan terkini lalu MENJALANKAN aksi lewat jalur kendali yang sama
// (jeda/kuota/anti-tabrakan/Antrean ACC). Nara tidak bisa menyetujui usulannya sendiri.
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { bolehRuangBot } from "@/lib/peran";
import { modulAktifServer } from "@/lib/sakelar";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { GalatKoor, daftarUsulanApi, putuskanUsulan } from "@/lib/bot-koordinator";
import { validasiIdUsulan } from "@/lib/bot-koordinator-murni";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function tolak(pesan: string, status = 400): never {
  throw Object.assign(new Error(pesan), { status });
}

async function pastikanMaster(request: Request) {
  const user = await pastikanMasuk(request);
  if (!bolehRuangBot(user)) tolak("Usulan koordinator hanya untuk master.", 403);
  if (!(await modulAktifServer("ruangbot"))) tolak("Modul Ruang Bot sedang dinonaktifkan.", 423);
  return user;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanMaster(request);
    try {
      return await daftarUsulanApi();
    } catch (e) {
      if (e instanceof GalatKoor) tolak(e.message, e.status);
      throw e;
    }
  });
}

export async function POST(request: Request) {
  const terlalu = await pastikanTidakMelebihiBatas(request, "bot-usulan", 30, 60);
  if (terlalu) return terlalu;

  return bungkus(async () => {
    const user = await pastikanMaster(request);
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (b.aksi !== "setuju" && b.aksi !== "tolak") tolak("aksi harus setuju atau tolak.");
    const id = validasiIdUsulan(b.id);
    if (id === null) tolak("id usulan tidak sah.");
    try {
      const h = await putuskanUsulan(id, b.aksi, { id: Number(user.id), nama: String(user.nama ?? "") }, { request });
      return { sukses: h.ok, pesan: h.pesan };
    } catch (e) {
      if (e instanceof GalatKoor) tolak(e.message, e.status);
      throw e;
    }
  });
}

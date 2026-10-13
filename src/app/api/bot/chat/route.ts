// /api/bot/chat — room chat bot (13 Okt 2026). HANYA master.
//   GET  ?sejak=<id>  → StatusChat (pesan terbaru, atau hanya yang lebih baru dari id itu) + daftar bot
//   POST { teks }     → simpan pesan master; agen yang disebut (@Raka) menjawab di belakang layar (maks 3)
// Aturan & batas biaya: lib/bot-chat(-murni). Agen hanya berbicara; tidak bisa menjalankan tugas lewat sini.
import { after } from "next/server";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { bolehRuangBot } from "@/lib/peran";
import { modulAktifServer } from "@/lib/sakelar";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { GalatChat, jawabPesan, kirimPesanMaster, muatStatusChat } from "@/lib/bot-chat";
import { normalkanPesan } from "@/lib/bot-chat-murni";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function tolak(pesan: string, status = 400): never {
  throw Object.assign(new Error(pesan), { status });
}

function ubah(e: unknown): never {
  if (e instanceof GalatChat) throw Object.assign(new Error(e.message), { status: e.status });
  throw e;
}

async function pastikanMaster(request: Request) {
  const user = await pastikanMasuk(request);
  if (!bolehRuangBot(user)) tolak("Room chat bot hanya untuk master.", 403);
  if (!(await modulAktifServer("ruangbot"))) tolak("Modul Ruang Bot sedang dinonaktifkan.", 423);
  return user;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanMaster(request);
    const sejak = Number(new URL(request.url).searchParams.get("sejak") ?? 0);
    try {
      return await muatStatusChat(Number.isInteger(sejak) && sejak > 0 ? sejak : 0);
    } catch (e) {
      return ubah(e);
    }
  });
}

export async function POST(request: Request) {
  const terlalu = await pastikanTidakMelebihiBatas(request, "bot-chat", 12, 60);
  if (terlalu) return terlalu;

  return bungkus(async () => {
    const user = await pastikanMaster(request);
    const b = (await request.json().catch(() => ({}))) as { teks?: unknown };
    const sah = normalkanPesan(b.teks);
    if (!sah.ok) tolak(sah.pesan);
    try {
      const { id, menyebut } = await kirimPesanMaster(Number(user.id), sah.teks);
      if (menyebut.length > 0) after(() => jawabPesan(id));
      return { sukses: true, id, menyebut };
    } catch (e) {
      return ubah(e);
    }
  });
}

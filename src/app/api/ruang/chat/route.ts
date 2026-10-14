// /api/ruang/chat — CHAT GLOBAL Ruang Bot (14 Okt 2026). Semua anggota yang login.
//   GET                                     → StatusChatGlobal (80 pesan terbaru dalam 7 hari)
//   POST { aksi:"kirim", teks }             → kirim (maks 500 karakter, 5 pesan / 30 dtk, kata kasar disamarkan)
//   POST { aksi:"hapus", id }               → master saja
//   POST { aksi:"bisukan", user_id, menit } → master saja (5..1440 menit)
//   POST { aksi:"buka_bisu", user_id }      → master saja
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { modulAktifServer } from "@/lib/sakelar";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { catatAudit } from "@/lib/audit";
import { adalahBot } from "@/lib/struktur";
import { BATAS_KIRIM, JENDELA_KIRIM_DETIK, menitBisuSah, normalkanPesan } from "@/lib/chat-global-murni";
import { GalatChat, bacaChatGlobal, bisukanChatGlobal, bukaBisuChatGlobal, hapusChatGlobal, kirimChatGlobal } from "@/lib/chat-global";

export const dynamic = "force-dynamic";

function tolak(pesan: string, status: number): never {
  throw Object.assign(new Error(pesan), { status, pesanAman: true });
}

async function pengguna(request: Request) {
  const user = await pastikanMasuk(request);
  if (adalahBot(user)) tolak("Akun bot tidak ikut chat global.", 403);
  if (!(await modulAktifServer("ruangbot"))) tolak("Modul Ruang Bot sedang dinonaktifkan.", 423);
  return user;
}

function lempar(e: unknown): never {
  if (e instanceof GalatChat) tolak(e.message, e.status);
  throw e;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pengguna(request);
    try {
      return await bacaChatGlobal(user);
    } catch (e) {
      lempar(e);
    }
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pengguna(request);
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const uid = Number(user.id);
    try {
      if (b.aksi === "kirim") {
        const batas = await pastikanTidakMelebihiBatas(request, "chat-global", BATAS_KIRIM, JENDELA_KIRIM_DETIK, String(uid));
        if (batas) tolak(`Terlalu cepat. Maksimal ${BATAS_KIRIM} pesan per ${JENDELA_KIRIM_DETIK} detik.`, 429);
        const sah = normalkanPesan(b.teks);
        if (!sah.ok) tolak(sah.pesan, 400);
        await kirimChatGlobal(uid, sah.teks);
        return { sukses: true };
      }
      if (user.role !== "master") tolak("Hanya master yang bisa memoderasi chat.", 403);
      if (b.aksi === "hapus") {
        const id = Number(b.id);
        if (!Number.isInteger(id) || id <= 0) tolak("Pesan tidak sah.", 400);
        await hapusChatGlobal(id, uid);
        catatAudit(uid, "chat_global", `Menghapus pesan chat global #${id}`, { request, detail: { id } });
        return { sukses: true };
      }
      if (b.aksi === "bisukan" || b.aksi === "buka_bisu") {
        const target = Number(b.user_id);
        if (!Number.isInteger(target) || target <= 0) tolak("Akun tidak sah.", 400);
        if (target === uid) tolak("Tidak bisa membisukan diri sendiri.", 400);
        if (b.aksi === "buka_bisu") {
          await bukaBisuChatGlobal(target);
          catatAudit(uid, "chat_global", `Membuka bisu chat global akun #${target}`, { request, detail: { user_id: target } });
          return { sukses: true };
        }
        const menit = menitBisuSah(b.menit);
        if (menit === null) tolak("Lama bisu 5 menit sampai 24 jam.", 400);
        const sampai = await bisukanChatGlobal(target, menit, uid);
        catatAudit(uid, "chat_global", `Membisukan akun #${target} di chat global ${menit} menit`, { request, detail: { user_id: target, menit } });
        return { sukses: true, sampai };
      }
    } catch (e) {
      lempar(e);
    }
    return tolak("Aksi tidak dikenal.", 400);
  });
}

// GET /api/bot/acc/video?tugas=<id> — pratinjau video hasil bot untuk Antrean ACC (HANYA master).
// Mengalirkan berkas stok dari mesin Auto Edit sebagai akun bot pemilik tugas (Range diteruskan,
// jadi pemutar bisa memajukan video). Layar mengambilnya dengan header Authorization lalu
// memutarnya lewat blob.
//
// Tidak memakai bungkus(): jawabannya aliran video, bukan JSON.
import { NextResponse } from "next/server";
import { pastikanMasuk } from "@/lib/sesi";
import { bolehRuangBot } from "@/lib/peran";
import { modulAktifServer } from "@/lib/sakelar";
import { supabase } from "@/lib/supabase";
import { teruskanAutoEdit } from "@/lib/autoedit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TAHAP_TERLIHAT = ["siap_ditinjau", "menunggu_acc", "disetujui", "posting", "selesai"];

const galat = (pesan: string, status: number) => NextResponse.json({ error: pesan }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  let user;
  try {
    user = await pastikanMasuk(request);
  } catch {
    return galat("Sesi tidak berlaku", 401);
  }
  if (!bolehRuangBot(user)) return galat("Pratinjau hanya untuk master.", 403);
  if (!(await modulAktifServer("ruangbot"))) return galat("Modul Ruang Bot sedang dinonaktifkan.", 423);
  const id = Number(new URL(request.url).searchParams.get("tugas"));
  if (!Number.isInteger(id) || id <= 0) return galat("tugas tidak sah.", 400);

  const db = supabase();
  const { data: tugas } = await db.from("bot_tugas").select("id, bot_id, tahap, id_stok_mesin").eq("id", id).maybeSingle();
  const stokId = String(tugas?.id_stok_mesin ?? "");
  if (!tugas || !stokId || !TAHAP_TERLIHAT.includes(String(tugas.tahap)) || !/^[0-9a-zA-Z_-]{3,64}$/.test(stokId)) {
    return galat("Video tidak tersedia.", 404);
  }
  const { data: bot } = await db.from("bot_redaksi").select("user_id").eq("id", tugas.bot_id).maybeSingle();
  if (!bot) return galat("Bot tidak ditemukan.", 404);

  // Salinan permintaan tanpa query: hanya header Range/Accept yang diteruskan proxy.
  const permintaan = new Request("http://lokal/x", { method: "GET", headers: request.headers });
  return teruskanAutoEdit(permintaan, ["tvr", "stok", stokId, "berkas"], String(bot.user_id), new Set(["tvr"]));
}

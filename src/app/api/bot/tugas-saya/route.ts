// /api/bot/tugas-saya — panel "Tugas Bot" di TVR Saya akun bot (2F, 13 Okt 2026).
// GET  → TugasBotSaya (lib/bot-tipe): ringkasan bot, tugas, permintaan Video Wajib, kandidat.
// POST { aksi: "cari_sekarang" } | { aksi: "ambil_permintaan", id }.
// HANYA sesi akun Divisi BOT (master masuk lewat Kendali Akun BOT). Aksi tidak melewati
// pagar apa pun: pengambilan manual memakai mesin keputusan yang sama dengan otomatis.
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { adalahBot } from "@/lib/struktur";
import { supabase } from "@/lib/supabase";
import { catatAudit } from "@/lib/audit";
import { modulAktifServer } from "@/lib/sakelar";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { siarkanBot } from "@/lib/bot-realtime";
import { ambilPermintaanManual } from "@/lib/bot-kerja";
import { ambilTugasSaya, idBotDariUser } from "@/lib/bot-tugas-saya";
import { pesanTolakManual, validasiAksiTugasBot } from "@/lib/bot-tugas-saya-murni";

export const dynamic = "force-dynamic";

function tolak(pesan: string, status: number): never {
  throw Object.assign(new Error(pesan), { status });
}

async function pastikanSesiBot(request: Request) {
  const user = await pastikanMasuk(request);
  if (!adalahBot(user)) tolak("Panel ini hanya untuk akun bot.", 403);
  // 423, bukan 5xx: pesan tetap utuh (lihat komentar lib/sakelar).
  if (!(await modulAktifServer("ruangbot"))) tolak("Modul Ruang Bot sedang dinonaktifkan.", 423);
  return user;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanSesiBot(request);
    return ambilTugasSaya(Number(user.id));
  });
}

export async function POST(request: Request) {
  const terlalu = await pastikanTidakMelebihiBatas(request, "bot-tugas-saya", 30, 60);
  if (terlalu) return terlalu;

  return bungkus(async () => {
    const user = await pastikanSesiBot(request);
    const v = validasiAksiTugasBot(await request.json().catch(() => null));
    if (!v.ok) tolak(v.pesan, 400);

    const botId = await idBotDariUser(Number(user.id));
    if (botId === "tabel_belum_ada") tolak(pesanTolakManual("tabel_belum_ada", null), 503);
    if (botId === null) tolak(pesanTolakManual("bot_tidak_ada", null), 404);

    if (v.aksi.aksi === "cari_sekarang") {
      // Hanya menandai: ambil_kerja berikutnya (bila bot menganggur dan lolos pagar) memberi perintah panen.
      const { data, error } = await supabase().from("bot_sumber").update({ terakhir_ambil: null }).eq("bot_id", botId).eq("aktif", true).select("id");
      if (error) {
        console.error("[bot/tugas-saya] cari_sekarang:", error.message);
        tolak("Gagal menandai sumber untuk dipanen.", 500);
      }
      const jumlah = data?.length ?? 0;
      catatAudit(user.id, "bot_tugas", `Cari sekarang: ${jumlah} sumber ditandai`, { request, detail: { bot_id: botId, sumber: jumlah } });
      siarkanBot("tugas");
      return { sukses: true, sumber_ditandai: jumlah };
    }

    const h = await ambilPermintaanManual(botId, v.aksi.id);
    if (!h.ok) {
      const status = h.kode === "tabel_belum_ada" ? 503 : h.kode === "bot_tidak_ada" ? 404 : 409;
      tolak(pesanTolakManual(h.kode, h.alasan), status);
    }
    catatAudit(user.id, "bot_tugas", `Mengambil permintaan Video Wajib #${v.aksi.id}`, { request, detail: { bot_id: botId, video_wajib_id: v.aksi.id, tugas_id: h.tugas_id } });
    siarkanBot("tugas");
    return { sukses: true, tugas_id: h.tugas_id };
  });
}

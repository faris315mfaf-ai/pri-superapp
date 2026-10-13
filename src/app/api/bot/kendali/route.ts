// /api/bot/kendali — jeda darurat, jeda per bot, mode, kuota (13 Okt 2026).
// POST { aksi: "jeda_global"|"jeda_bot"|"mode"|"kuota", ... }  (lib/bot-tipe AksiKendaliBot)
// HANYA master. Tiap perubahan dicatat di audit dan disiarkan ke Ruang Bot.
import { bungkus, tabelBelumAda } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { bolehRuangBot } from "@/lib/peran";
import { modulAktifServer } from "@/lib/sakelar";
import { supabase } from "@/lib/supabase";
import { catatAudit } from "@/lib/audit";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { simpanJedaGlobal } from "@/lib/bot-data";
import { siarkanBot } from "@/lib/bot-realtime";
import { KUOTA_BOT_MAKS, KUOTA_BOT_MIN } from "@/lib/bot-tipe";

export const dynamic = "force-dynamic";

function tolak(pesan: string, status = 400): never {
  throw Object.assign(new Error(pesan), { status });
}

/** Galat tulis DB: migrasi belum jalan = 503 yang jelas, selain itu 500 dengan pesan ringkas. */
function galatTulis(error: { code?: string }, pesanGagal: string): never {
  if (tabelBelumAda(error)) tolak("Migrasi bot belum dijalankan.", 503);
  tolak(pesanGagal, 500);
}

const idBot = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) tolak("bot_id tidak sah.");
  return n;
};

export async function POST(request: Request) {
  const terlalu = await pastikanTidakMelebihiBatas(request, "bot-kendali", 60, 60);
  if (terlalu) return terlalu;

  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!bolehRuangBot(user)) tolak("Ruang Bot hanya untuk master.", 403);
    if (!(await modulAktifServer("ruangbot"))) tolak("Modul Ruang Bot sedang dinonaktifkan.", 423);
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const db = supabase();

    if (b.aksi === "jeda_global") {
      if (typeof b.nilai !== "boolean") tolak("nilai harus true/false.");
      await simpanJedaGlobal(b.nilai);
      catatAudit(user.id, "bot_jeda", b.nilai ? "Jeda darurat SEMUA bot dinyalakan" : "Jeda darurat semua bot dicabut", { request });
    } else if (b.aksi === "jeda_bot") {
      if (typeof b.nilai !== "boolean") tolak("nilai harus true/false.");
      const id = idBot(b.bot_id);
      const { data, error } = await db.from("bot_redaksi").update({ jeda: b.nilai }).eq("id", id).select("id, nama");
      if (error) galatTulis(error, "Gagal menyimpan jeda bot.");
      if (!data?.length) tolak("Bot tidak ditemukan.", 404);
      catatAudit(user.id, "bot_jeda", `${b.nilai ? "Menjeda" : "Melanjutkan"} bot ${String(data[0].nama)}`, { request, detail: { bot_id: id } });
    } else if (b.aksi === "mode") {
      if (b.nilai !== "acc" && b.nilai !== "otomatis") tolak("mode harus 'acc' atau 'otomatis'.");
      const id = idBot(b.bot_id);
      const { data, error } = await db.from("bot_redaksi").update({ mode: b.nilai }).eq("id", id).select("id, nama");
      if (error) galatTulis(error, "Gagal menyimpan mode bot.");
      if (!data?.length) tolak("Bot tidak ditemukan.", 404);
      catatAudit(user.id, "bot_mode", `Mode bot ${String(data[0].nama)}: ${b.nilai === "otomatis" ? "otomatis" : "perlu ACC"}`, { request, detail: { bot_id: id, mode: b.nilai } });
    } else if (b.aksi === "kuota") {
      const k = Number(b.nilai);
      if (!Number.isInteger(k) || k < KUOTA_BOT_MIN || k > KUOTA_BOT_MAKS) {
        tolak(`Kuota harian harus bilangan bulat ${KUOTA_BOT_MIN}–${KUOTA_BOT_MAKS}.`);
      }
      const id = idBot(b.bot_id);
      const { data, error } = await db.from("bot_redaksi").update({ kuota_harian: k }).eq("id", id).select("id, nama");
      if (error) galatTulis(error, "Gagal menyimpan kuota bot.");
      if (!data?.length) tolak("Bot tidak ditemukan.", 404);
      catatAudit(user.id, "bot_kuota", `Kuota harian bot ${String(data[0].nama)}: ${k}`, { request, detail: { bot_id: id, kuota: k } });
    } else {
      tolak("aksi tidak dikenal.");
    }

    siarkanBot("kendali");
    return { sukses: true };
  });
}

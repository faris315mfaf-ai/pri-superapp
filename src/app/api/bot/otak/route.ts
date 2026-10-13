// /api/bot/otak — API key LLM milik tiap bot ("otak" sendiri), 13 Okt 2026. HANYA master.
//
//   GET                                          → StatusOtakBot (TANPA kunci; hanya "••••abcd")
//   POST { aksi:"simpan", bot_id, penyedia, kunci } → enkripsi AES-GCM lalu simpan (tulis-saja)
//   POST { aksi:"hapus", bot_id }                → hapus kunci
//   POST { aksi:"uji", bot_id }                  → satu panggilan kecil dengan kunci itu; catat hasilnya
//
// Kunci polos hanya ada di badan permintaan "simpan" dan sebentar di memori; tidak
// pernah dikembalikan, dicatat ke audit/log, atau dikirim ke runner (lib/bot-otak).
import { bungkus, tabelBelumAda } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { bolehRuangBot } from "@/lib/peran";
import { modulAktifServer } from "@/lib/sakelar";
import { supabase } from "@/lib/supabase";
import { catatAudit } from "@/lib/audit";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { siarkanBot } from "@/lib/bot-realtime";
import { enkripsiKunci, KunciIndukHilang, kunciIndukSiap } from "@/lib/bot-rahasia";
import { GalatOtak, tanyaOtakBot } from "@/lib/bot-otak";
import {
  LABEL_PENYEDIA,
  PESAN_GALAT_OTAK,
  adalahPenyedia,
  akhirKunci,
  normalkanKunciApi,
  samarkanKunci,
  type OtakBotRingkas,
  type StatusOtakBot,
} from "@/lib/bot-otak-murni";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function tolak(pesan: string, status = 400): never {
  throw Object.assign(new Error(pesan), { status });
}

function galatTulis(error: { code?: string; message?: string }, pesanGagal: string): never {
  if (tabelBelumAda(error)) tolak("Migrasi 69 (otak bot) belum dijalankan.", 503);
  console.error("[bot-otak]", pesanGagal, error.message ?? "");
  tolak(pesanGagal, 500);
}

const idPositif = (v: unknown, nama: string): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) tolak(`${nama} tidak sah.`);
  return n;
};

async function bacaStatus(): Promise<StatusOtakBot> {
  const db = supabase();
  const [rBot, rOtak] = await Promise.all([
    db.from("bot_redaksi").select("id, user_id, nama").order("id"),
    // Sengaja TIDAK memilih kunci_sandi.
    db.from("bot_otak").select("bot_id, penyedia, akhir, diubah_pada, teruji_pada, hasil_uji"),
  ]);
  if (rBot.error) galatTulis(rBot.error, "Gagal membaca bot.");
  if (rOtak.error) {
    if (tabelBelumAda(rOtak.error)) return { tabel_ada: false, induk_siap: kunciIndukSiap(), bot: [] };
    galatTulis(rOtak.error, "Gagal membaca otak bot.");
  }
  const bots = rBot.data ?? [];
  const idUser = bots.map((b) => Number(b.user_id));
  const { data: orang } = idUser.length
    ? await db.from("app_user").select("id, username").in("id", idUser)
    : { data: [] as { id: number; username: string }[] };
  const usernamePer = new Map((orang ?? []).map((o) => [Number(o.id), String(o.username ?? "")]));
  const otakPer = new Map((rOtak.data ?? []).map((o) => [Number(o.bot_id), o]));
  const bot: OtakBotRingkas[] = bots.map((b) => {
    const o = otakPer.get(Number(b.id));
    return {
      bot_id: Number(b.id),
      nama: String(b.nama ?? ""),
      username: usernamePer.get(Number(b.user_id)) ?? "",
      penyedia: o && adalahPenyedia(o.penyedia) ? o.penyedia : null,
      kunci_samar: o ? samarkanKunci(String(o.akhir ?? "")) : "",
      diubah_pada: (o?.diubah_pada as string | null | undefined) ?? null,
      teruji_pada: (o?.teruji_pada as string | null | undefined) ?? null,
      hasil_uji: (o?.hasil_uji as string | null | undefined) ?? null,
    };
  });
  return { tabel_ada: true, induk_siap: kunciIndukSiap(), bot };
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!bolehRuangBot(user)) tolak("Otak bot hanya untuk master.", 403);
    if (!(await modulAktifServer("ruangbot"))) tolak("Modul Ruang Bot sedang dinonaktifkan.", 423);
    return bacaStatus();
  });
}

export async function POST(request: Request) {
  const terlalu = await pastikanTidakMelebihiBatas(request, "bot-otak", 20, 60);
  if (terlalu) return terlalu;

  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!bolehRuangBot(user)) tolak("Otak bot hanya untuk master.", 403);
    if (!(await modulAktifServer("ruangbot"))) tolak("Modul Ruang Bot sedang dinonaktifkan.", 423);
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const db = supabase();
    const botId = idPositif(b.bot_id, "bot_id");

    const { data: bot, error: eBot } = await db.from("bot_redaksi").select("id, user_id, nama").eq("id", botId).maybeSingle();
    if (eBot) galatTulis(eBot, "Gagal memeriksa bot.");
    if (!bot) tolak("Bot tidak ditemukan.", 404);
    const namaBot = String(bot.nama ?? "");

    if (b.aksi === "simpan") {
      if (!adalahPenyedia(b.penyedia)) tolak("Penyedia tidak dikenal.");
      const sah = normalkanKunciApi(b.kunci);
      if (!sah.ok) tolak(sah.pesan);
      if (!kunciIndukSiap()) tolak("Server belum punya BOT_KUNCI_INDUK, kunci tidak bisa disimpan dengan aman.", 503);
      let sandi: string;
      try {
        sandi = enkripsiKunci(sah.kunci, botId);
      } catch (e) {
        if (e instanceof KunciIndukHilang) tolak(e.message, 503);
        throw e;
      }
      const { error } = await db.from("bot_otak").upsert(
        {
          bot_id: botId,
          penyedia: b.penyedia,
          kunci_sandi: sandi,
          akhir: akhirKunci(sah.kunci),
          diubah_pada: new Date().toISOString(),
          diubah_oleh: Number(user.id),
          // Kunci baru = riwayat uji lama tidak berlaku.
          teruji_pada: null,
          hasil_uji: null,
        },
        { onConflict: "bot_id" },
      );
      if (error) galatTulis(error, "Gagal menyimpan API key.");
      // Detail audit TANPA kunci (hanya penyedia dan 4 karakter terakhir).
      catatAudit(user.id, "bot_otak", `Mengatur API key ${LABEL_PENYEDIA[b.penyedia]} untuk bot ${namaBot}`, {
        request,
        detail: { bot_id: botId, penyedia: b.penyedia, akhir: akhirKunci(sah.kunci) },
      });
      siarkanBot("kendali");
      return { sukses: true };
    }

    if (b.aksi === "hapus") {
      const { data, error } = await db.from("bot_otak").delete().eq("bot_id", botId).select("bot_id");
      if (error) galatTulis(error, "Gagal menghapus API key.");
      if (!data?.length) tolak("Bot ini memang belum punya API key.", 404);
      catatAudit(user.id, "bot_otak", `Menghapus API key bot ${namaBot}`, { request, detail: { bot_id: botId } });
      siarkanBot("kendali");
      return { sukses: true };
    }

    if (b.aksi === "uji") {
      let hasil = "ok";
      try {
        await tanyaOtakBot(botId, Number(bot.user_id), {
          sistem: "Balas hanya JSON valid.",
          pengguna: 'Balas persis: {"ok":true}',
          json: true,
          fitur: "uji",
          maksToken: 20,
          batasMs: 15_000,
        });
      } catch (e) {
        if (!(e instanceof GalatOtak)) throw e;
        hasil = e.kode;
      }
      if (hasil !== "tanpa_kunci") {
        const { error } = await db.from("bot_otak").update({ teruji_pada: new Date().toISOString(), hasil_uji: hasil }).eq("bot_id", botId);
        if (error) console.error("[bot-otak] catat hasil uji:", error.message);
      }
      catatAudit(user.id, "bot_otak", `Menguji API key bot ${namaBot}: ${hasil}`, { request, detail: { bot_id: botId, hasil } });
      siarkanBot("kendali");
      const ok = hasil === "ok";
      return { sukses: ok, kode: hasil, pesan: ok ? "API key berfungsi." : (PESAN_GALAT_OTAK as Record<string, string>)[hasil] ?? PESAN_GALAT_OTAK.gagal };
    }

    return tolak("aksi tidak dikenal.");
  });
}

// ============================================================
// BOT REDAKSI — data panel "Tugas Bot" di TVR Saya akun bot (2F, 13 Okt 2026).
// Server saja (service role). Pembentuk murni ada di bot-tugas-saya-murni.ts.
// Tahan tabel belum ada: tabel_ada=false, tanpa melempar.
// ============================================================

import { supabase } from "@/lib/supabase";
import { tabelBelumAda } from "@/lib/api-helper";
import { awal24JamIso, awalHariWibIso, bacaJedaGlobal, hitungKandidatPerSumber, hitungRunner, rakitBot, rakitSumber, type BarisBot, type BarisSumber } from "@/lib/bot-data";
import { bacaPermintaanWajib } from "@/lib/bot-video-wajib";
import { bisaMulaiSekarang } from "@/lib/bot-kerja";
import {
  BATAS_KANDIDAT_SAYA,
  BATAS_TUGAS_SAYA,
  gabungPermintaan,
  rakitKandidatSaya,
  rakitPermintaan,
  rakitTugasSaya,
  type BarisKandidatSaya,
  type BarisPermintaanSaya,
  type BarisTugasSaya,
} from "@/lib/bot-tugas-saya-murni";
import type { TugasBotSaya } from "@/lib/bot-tipe";

const KOLOM_BOT = "id, user_id, nama, peran, persona, warna, handle, platform, rupa, mode, kuota_harian, jam_mulai, jam_selesai, aktif, jeda, gagal_beruntun";

function kosong(tabelAda: boolean): TugasBotSaya {
  return {
    tabel_ada: tabelAda,
    bot: null,
    runner: { online: false, terakhir_denyut: null, versi: null },
    jeda_global: false,
    bisa_mulai: false,
    alasan_tutup: null,
    tugas: [],
    permintaan_wajib: [],
    kandidat: [],
    sumber: [],
  };
}

function galat(konteks: string, e: { message: string }): never {
  console.error(`[bot/tugas-saya] ${konteks}:`, e.message);
  throw new Error(`Gagal memuat ${konteks}.`);
}

/** bot_redaksi.id milik akun ini; null bila bukan bot terdaftar. Tabel belum ada → "tabel_belum_ada". */
export async function idBotDariUser(userId: number): Promise<number | null | "tabel_belum_ada"> {
  const { data, error } = await supabase().from("bot_redaksi").select("id").eq("user_id", userId).maybeSingle();
  if (error) {
    if (tabelBelumAda(error)) return "tabel_belum_ada";
    galat("bot", error);
  }
  return data ? Number((data as { id: number }).id) : null;
}

export async function ambilTugasSaya(userId: number, sekarangMs: number = Date.now()): Promise<TugasBotSaya> {
  const db = supabase();
  const { data: baris, error } = await db.from("bot_redaksi").select(KOLOM_BOT).eq("user_id", userId).maybeSingle();
  if (error) {
    if (tabelBelumAda(error)) return kosong(false);
    galat("bot", error);
  }
  if (!baris) return kosong(true);
  const b = baris as unknown as BarisBot;
  const botId = Number(b.id);

  const [rUser, rRunner, rTugas, rWajib, rSumber, rAkun, rSelesai, jeda, mulai, terbuka] = await Promise.all([
    db.from("app_user").select("username").eq("id", userId).maybeSingle(),
    db.from("bot_runner").select("terakhir_denyut, versi").eq("id", 1).maybeSingle(),
    db.from("bot_tugas").select("id, tahap, judul, kategori, galat, dibuat_pada, selesai_pada").eq("bot_id", botId).order("dibuat_pada", { ascending: false }).limit(BATAS_TUGAS_SAYA),
    db.from("bot_video_wajib").select("video_wajib_id, tugas_id, status").eq("bot_id", botId),
    db.from("bot_sumber").select("id, bot_id, platform, handle, kategori, aktif, terakhir_ambil").eq("bot_id", botId).order("id", { ascending: true }),
    db.from("akun_tvr_user").select("user_id", { count: "exact", head: true }).eq("user_id", userId).eq("terhubung", true),
    db.from("bot_tugas").select("id", { count: "exact", head: true }).eq("bot_id", botId).eq("tahap", "selesai").gte("selesai_pada", awalHariWibIso(new Date(sekarangMs))),
    bacaJedaGlobal(),
    bisaMulaiSekarang(botId, sekarangMs),
    bacaPermintaanWajib(sekarangMs).catch((e: unknown) => {
      console.error("[bot/tugas-saya] permintaan wajib:", e instanceof Error ? e.message : e);
      return [];
    }),
  ]);
  if (rUser.error) galat("akun bot", rUser.error);
  if (rRunner.error && !tabelBelumAda(rRunner.error)) galat("status runner", rRunner.error);
  if (rTugas.error && !tabelBelumAda(rTugas.error)) galat("tugas bot", rTugas.error);
  if (rWajib.error && !tabelBelumAda(rWajib.error)) galat("Video Wajib bot", rWajib.error);
  if (rSumber.error && !tabelBelumAda(rSumber.error)) galat("sumber bot", rSumber.error);
  if (rAkun.error) galat("akun sosmed bot", rAkun.error);
  if (rSelesai.error && !tabelBelumAda(rSelesai.error)) galat("tugas selesai", rSelesai.error);

  const sumberBaris = (rSumber.data ?? []) as unknown as BarisSumber[];
  const idSumber = sumberBaris.map((s) => Number(s.id));

  // Kandidat dari sumber bot ini + hitungan 24 jam untuk kartu sumber.
  let kandidat: BarisKandidatSaya[] = [];
  let kandidat24: ReturnType<typeof hitungKandidatPerSumber> = new Map();
  if (idSumber.length > 0) {
    const [rK, rK24] = await Promise.all([
      db.from("bot_kandidat").select("id, url, judul, durasi_detik, tayangan, waktu_terbit, diklaim_oleh, bentrok, dibuat_pada").in("sumber_id", idSumber).order("dibuat_pada", { ascending: false }).limit(BATAS_KANDIDAT_SAYA),
      db.from("bot_kandidat").select("sumber_id").in("sumber_id", idSumber).gte("dibuat_pada", awal24JamIso(new Date(sekarangMs))).limit(5000),
    ]);
    if (rK.error && !tabelBelumAda(rK.error)) galat("kandidat", rK.error);
    if (rK24.error && !tabelBelumAda(rK24.error)) galat("hitungan kandidat", rK24.error);
    kandidat = (rK.data ?? []) as unknown as BarisKandidatSaya[];
    kandidat24 = hitungKandidatPerSumber((rK24.data ?? []) as { sumber_id: number | null }[]);
  }

  // Permintaan Video Wajib yang sudah diambil bot ini (masih berstatus 'diambil').
  const wajibBot = (rWajib.data ?? []) as { video_wajib_id: number; tugas_id: number | null; status: string }[];
  const idTugasWajib = new Set(wajibBot.map((w) => w.tugas_id).filter((x): x is number => x !== null && x !== undefined).map(Number));
  const idDiambil = wajibBot.filter((w) => w.status === "diambil").map((w) => Number(w.video_wajib_id));
  let diambilSaya: ReturnType<typeof rakitPermintaan>[] = [];
  if (idDiambil.length > 0) {
    const { data: rows, error: eP } = await db.from("tvr_video_wajib").select("id, judul, keterangan, kategori, batas_waktu").in("id", idDiambil);
    if (eP && !tabelBelumAda(eP)) galat("permintaan Video Wajib", eP);
    diambilSaya = ((rows ?? []) as unknown as BarisPermintaanSaya[]).map((r) => rakitPermintaan(r, "diambil_saya"));
  }
  const terbukaRingkas = terbuka.map((p) => rakitPermintaan({ id: p.id, judul: p.judul, keterangan: p.keterangan, kategori: p.kategori, batas_waktu: p.batas_waktu }, "terbuka"));

  const runnerBaris = (rRunner.data ?? null) as { terakhir_denyut: string | null; versi: string | null } | null;
  return {
    tabel_ada: true,
    bot: rakitBot(b, String((rUser.data as { username?: string | null } | null)?.username ?? ""), rSelesai.count ?? 0, rAkun.count ?? 0),
    runner: hitungRunner(runnerBaris?.terakhir_denyut ?? null, runnerBaris?.versi ?? null, sekarangMs),
    jeda_global: jeda,
    bisa_mulai: mulai.bisaMulai,
    alasan_tutup: mulai.alasan,
    tugas: ((rTugas.data ?? []) as unknown as BarisTugasSaya[]).map((t) => rakitTugasSaya(t, idTugasWajib)),
    permintaan_wajib: gabungPermintaan(terbukaRingkas, diambilSaya),
    kandidat: kandidat.map((k) => rakitKandidatSaya(k, botId)),
    sumber: sumberBaris.map((s) => rakitSumber(s, kandidat24.get(Number(s.id)) ?? 0)),
  };
}

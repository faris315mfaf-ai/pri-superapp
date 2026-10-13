// ============================================================
// BOT REDAKSI — pembacaan & perubahan data (13 Okt 2026).
// Fungsi MURNI (rakitBot, rupaAman, awalHariWibIso, hitungRunner) dipisah
// dari fungsi yang menyentuh DB supaya bisa diuji tanpa jaringan.
// Semua pemanggil route WAJIB sudah lolos bolehRuangBot (hanya master).
// ============================================================

import { supabase } from "@/lib/supabase";
import { tabelBelumAda } from "@/lib/api-helper";
import type { BotRingkas, GayaRambutDb, LogBotDb, ModeBotDb, RunnerStatus, RupaBotDb, StatusBot, SumberBotDb, TahapBotDb } from "@/lib/bot-tipe";
import { normalkanKategori, normalkanPlatform } from "@/lib/bot-sumber";

export const KUNCI_JEDA_GLOBAL = "bot_jeda_global";
/** Runner dianggap online bila detaknya masuk dalam rentang ini. */
export const RUNNER_ONLINE_DETIK = 180;
const BATAS_LOG = 40;
/** Halaman baca bot_kandidat 24 jam (PostgREST membatasi baris per permintaan). */
const UKURAN_HALAMAN_KANDIDAT = 1000;
const MAKS_HALAMAN_KANDIDAT = 5;
const BATAS_SUMBER_STATUS = 500;
const BATAS_BLOKIR_STATUS = 500;
const GAYA_SAH: readonly GayaRambutDb[] = ["pendek", "panjang", "topi"];
const TAHAP_SAH: readonly TahapBotDb[] = ["cari", "edit", "posting", "istirahat"];

const RUPA_BAWAAN: RupaBotDb = {
  kaus: "#5b8def",
  bayangan: "#3f6ac4",
  celana: "#2f3358",
  kulit: "#e8b48a",
  rambut: "#3b2418",
  gayaRambut: "pendek",
};

/** Awal hari WIB (UTC+7) sebagai ISO UTC — batas "hari ini" untuk kuota. */
export function awalHariWibIso(sekarang: Date = new Date()): string {
  const wib = new Date(sekarang.getTime() + 7 * 3600_000);
  const tengahMalamWib = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate());
  return new Date(tengahMalamWib - 7 * 3600_000).toISOString();
}

export function hitungRunner(terakhir: string | null, versi: string | null, sekarangMs: number = Date.now()): RunnerStatus {
  const t = terakhir ? Date.parse(terakhir) : NaN;
  const online = Number.isFinite(t) && sekarangMs - t <= RUNNER_ONLINE_DETIK * 1000 && sekarangMs - t >= -60_000;
  return { online, terakhir_denyut: terakhir ?? null, versi: versi ?? null };
}

const warnaHex = (v: unknown, cadangan: string): string => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : cadangan);

/** Saring jsonb `rupa` dari DB: nilai rusak/hilang diganti bawaan, tidak pernah melempar. */
export function rupaAman(mentah: unknown): RupaBotDb {
  const m = mentah && typeof mentah === "object" && !Array.isArray(mentah) ? (mentah as Record<string, unknown>) : {};
  const gaya = GAYA_SAH.includes(m.gayaRambut as GayaRambutDb) ? (m.gayaRambut as GayaRambutDb) : RUPA_BAWAAN.gayaRambut;
  return {
    kaus: warnaHex(m.kaus, RUPA_BAWAAN.kaus),
    bayangan: warnaHex(m.bayangan, RUPA_BAWAAN.bayangan),
    celana: warnaHex(m.celana, RUPA_BAWAAN.celana),
    kulit: warnaHex(m.kulit, RUPA_BAWAAN.kulit),
    rambut: warnaHex(m.rambut, RUPA_BAWAAN.rambut),
    gayaRambut: gaya,
    ...(typeof m.warnaTopi === "string" && /^#[0-9a-fA-F]{6}$/.test(m.warnaTopi) ? { warnaTopi: m.warnaTopi } : {}),
    ...(m.kacamata === true ? { kacamata: true } : {}),
    ...(m.berhud === true ? { berhud: true } : {}),
  };
}

export type BarisBot = {
  id: number;
  user_id: number;
  nama: string | null;
  peran: string | null;
  persona: string | null;
  warna: string | null;
  handle: string | null;
  platform: string | null;
  rupa: unknown;
  mode: string | null;
  kuota_harian: number | null;
  jam_mulai: string | null;
  jam_selesai: string | null;
  aktif: boolean | null;
  jeda: boolean | null;
  gagal_beruntun: number | null;
};

export function rakitBot(b: BarisBot, username: string, postHariIni: number, akunTertaut: number): BotRingkas {
  const mode: ModeBotDb = b.mode === "otomatis" ? "otomatis" : "acc";
  return {
    id: Number(b.id),
    user_id: Number(b.user_id),
    username,
    nama: String(b.nama ?? ""),
    peran: String(b.peran ?? ""),
    persona: String(b.persona ?? ""),
    warna: warnaHex(b.warna, "#f08a3c"),
    handle: String(b.handle ?? ""),
    platform: String(b.platform ?? ""),
    mode,
    rupa: rupaAman(b.rupa),
    kuota_harian: Math.min(6, Math.max(1, Number(b.kuota_harian ?? 1))),
    jam_mulai: /^\d\d:\d\d$/.test(String(b.jam_mulai)) ? String(b.jam_mulai) : "08:00",
    jam_selesai: /^\d\d:\d\d$/.test(String(b.jam_selesai)) ? String(b.jam_selesai) : "20:00",
    aktif: b.aktif !== false,
    jeda: b.jeda === true,
    gagal_beruntun: Math.max(0, Number(b.gagal_beruntun ?? 0)),
    post_hari_ini: Math.max(0, postHariIni),
    akun_tertaut: Math.max(0, akunTertaut),
  };
}

/** Awal jendela "24 jam terakhir" sebagai ISO UTC. */
export function awal24JamIso(sekarang: Date = new Date()): string {
  return new Date(sekarang.getTime() - 24 * 3600_000).toISOString();
}

/** Hitung kandidat per sumber_id; baris tanpa sumber (sumber terhapus) diabaikan. */
export function hitungKandidatPerSumber(baris: readonly { sumber_id: number | null }[]): Map<number, number> {
  const hasil = new Map<number, number>();
  for (const b of baris) {
    if (b.sumber_id === null || b.sumber_id === undefined) continue;
    const id = Number(b.sumber_id);
    if (!Number.isFinite(id)) continue;
    hasil.set(id, (hasil.get(id) ?? 0) + 1);
  }
  return hasil;
}

export type BarisSumber = {
  id: number;
  bot_id: number;
  platform: string | null;
  handle: string | null;
  kategori: string | null;
  aktif: boolean | null;
  terakhir_ambil: string | null;
};

/** Baris bot_sumber -> bentuk status. Nilai tak dikenal dirapikan, tidak melempar. */
export function rakitSumber(b: BarisSumber, kandidat24Jam: number): SumberBotDb {
  const platform = normalkanPlatform(b.platform) ?? String(b.platform ?? "");
  return {
    id: Number(b.id),
    bot_id: Number(b.bot_id),
    platform,
    handle: String(b.handle ?? ""),
    kategori: normalkanKategori(b.kategori) ?? "NEWS",
    aktif: b.aktif !== false,
    terakhir_ambil: b.terakhir_ambil ?? null,
    kandidat_24_jam: Math.max(0, Math.floor(Number(kandidat24Jam) || 0)),
  };
}

export function statusKosong(tabelAda: boolean, runner?: RunnerStatus, jedaGlobal = false): StatusBot {
  return {
    tabel_ada: tabelAda,
    jeda_global: jedaGlobal,
    runner: runner ?? { online: false, terakhir_denyut: null, versi: null },
    bots: [],
    log: [],
  };
}

function galatDb(konteks: string, error: { message: string; code?: string }): never {
  console.error(`[bot] ${konteks}:`, error.message);
  throw new Error(`Gagal memuat ${konteks}.`);
}

export async function bacaJedaGlobal(): Promise<boolean> {
  const { data, error } = await supabase().from("pengaturan_sistem").select("nilai").eq("kunci", KUNCI_JEDA_GLOBAL).maybeSingle();
  if (error) galatDb("pengaturan bot", error);
  return String((data as { nilai?: unknown } | null)?.nilai ?? "") === "1";
}

export async function simpanJedaGlobal(nilai: boolean): Promise<void> {
  const { error } = await supabase()
    .from("pengaturan_sistem")
    .upsert({ kunci: KUNCI_JEDA_GLOBAL, nilai: nilai ? "1" : "0", diubah_pada: new Date().toISOString() }, { onConflict: "kunci" });
  if (error) {
    console.error("[bot] simpan jeda global:", error.message);
    throw new Error("Gagal menyimpan jeda darurat.");
  }
}

/** Sumber + blokir untuk status. Tabel belum ada = daftar kosong (tidak melempar). */
async function ambilSumberDanBlokir(): Promise<{ sumber: SumberBotDb[]; blokir: string[] }> {
  const db = supabase();
  const [rSumber, rBlokir] = await Promise.all([
    db
      .from("bot_sumber")
      .select("id, bot_id, platform, handle, kategori, aktif, terakhir_ambil")
      .order("id", { ascending: true })
      .limit(BATAS_SUMBER_STATUS),
    db.from("bot_blokir").select("kata").order("id", { ascending: true }).limit(BATAS_BLOKIR_STATUS),
  ]);
  if (rSumber.error && !tabelBelumAda(rSumber.error)) galatDb("sumber bot", rSumber.error);
  if (rBlokir.error && !tabelBelumAda(rBlokir.error)) galatDb("daftar blokir", rBlokir.error);
  const barisSumber = (rSumber.error ? [] : (rSumber.data ?? [])) as unknown as BarisSumber[];
  const blokir = (rBlokir.error ? [] : (rBlokir.data ?? [])).map((r) => String((r as { kata: unknown }).kata ?? "")).filter(Boolean);
  if (barisSumber.length === 0) return { sumber: [], blokir };

  // Kandidat 24 jam: baca sumber_id halaman demi halaman lalu hitung di sini.
  const awal = awal24JamIso();
  const idSumber = barisSumber.map((b) => Number(b.id));
  const kandidat: { sumber_id: number | null }[] = [];
  for (let h = 0; h < MAKS_HALAMAN_KANDIDAT; h++) {
    const dari = h * UKURAN_HALAMAN_KANDIDAT;
    const { data, error } = await db
      .from("bot_kandidat")
      .select("sumber_id")
      .in("sumber_id", idSumber)
      .gte("dibuat_pada", awal)
      .order("id", { ascending: true })
      .range(dari, dari + UKURAN_HALAMAN_KANDIDAT - 1);
    if (error) {
      // Hitungan hanya hiasan: gagal membaca tidak boleh menjatuhkan seluruh layar.
      if (!tabelBelumAda(error)) console.error("[bot] hitung kandidat 24 jam:", error.message);
      break;
    }
    const halaman = (data ?? []) as { sumber_id: number | null }[];
    kandidat.push(...halaman);
    if (halaman.length < UKURAN_HALAMAN_KANDIDAT) break;
  }
  const hitung = hitungKandidatPerSumber(kandidat);
  return { sumber: barisSumber.map((b) => rakitSumber(b, hitung.get(Number(b.id)) ?? 0)), blokir };
}

/** Keadaan lengkap untuk Ruang Bot. tabel_ada=false bila migrasi sql/67 belum jalan. */
export async function ambilStatusBot(): Promise<StatusBot> {
  const db = supabase();
  const { data: bots, error } = await db
    .from("bot_redaksi")
    .select("id, user_id, nama, peran, persona, warna, handle, platform, rupa, mode, kuota_harian, jam_mulai, jam_selesai, aktif, jeda, gagal_beruntun")
    .order("id", { ascending: true });
  if (error) {
    if (tabelBelumAda(error)) return statusKosong(false);
    galatDb("bot", error);
  }
  const daftar = (bots ?? []) as unknown as BarisBot[];
  const idUser = daftar.map((b) => Number(b.user_id));
  const idBot = daftar.map((b) => Number(b.id));
  const awalHari = awalHariWibIso();

  const [rUser, rRunner, rLog, rTugas, rAkun, jeda, daftarSumber] = await Promise.all([
    idUser.length ? db.from("app_user").select("id, username").in("id", idUser) : Promise.resolve({ data: [], error: null }),
    db.from("bot_runner").select("terakhir_denyut, versi").eq("id", 1).maybeSingle(),
    db.from("bot_log").select("id, bot_id, tahap, teks, dibuat_pada").order("dibuat_pada", { ascending: false }).limit(BATAS_LOG),
    idBot.length
      ? db.from("bot_tugas").select("bot_id").eq("tahap", "selesai").gte("selesai_pada", awalHari).in("bot_id", idBot)
      : Promise.resolve({ data: [], error: null }),
    idUser.length ? db.from("akun_tvr_user").select("user_id").eq("terhubung", true).in("user_id", idUser) : Promise.resolve({ data: [], error: null }),
    bacaJedaGlobal(),
    ambilSumberDanBlokir(),
  ]);
  if (rUser.error) galatDb("akun bot", rUser.error);
  if (rRunner.error && !tabelBelumAda(rRunner.error)) galatDb("status runner", rRunner.error);
  if (rLog.error && !tabelBelumAda(rLog.error)) galatDb("umpan aktivitas", rLog.error);
  if (rTugas.error && !tabelBelumAda(rTugas.error)) galatDb("tugas bot", rTugas.error);
  if (rAkun.error) galatDb("akun sosmed bot", rAkun.error);

  const namaUser = new Map<number, string>();
  for (const u of (rUser.data ?? []) as { id: number; username: string | null }[]) namaUser.set(Number(u.id), String(u.username ?? ""));
  const selesai = new Map<number, number>();
  for (const t of (rTugas.data ?? []) as { bot_id: number }[]) selesai.set(Number(t.bot_id), (selesai.get(Number(t.bot_id)) ?? 0) + 1);
  const tertaut = new Map<number, number>();
  for (const a of (rAkun.data ?? []) as { user_id: number }[]) tertaut.set(Number(a.user_id), (tertaut.get(Number(a.user_id)) ?? 0) + 1);

  const runnerBaris = (rRunner.data ?? null) as { terakhir_denyut: string | null; versi: string | null } | null;
  const log: LogBotDb[] = ((rLog.data ?? []) as { id: number; bot_id: number; tahap: string; teks: string | null; dibuat_pada: string }[]).map((l) => ({
    id: Number(l.id),
    bot_id: Number(l.bot_id),
    tahap: (TAHAP_SAH as readonly string[]).includes(l.tahap) ? (l.tahap as TahapBotDb) : "istirahat",
    teks: String(l.teks ?? ""),
    dibuat_pada: l.dibuat_pada,
  }));

  return {
    tabel_ada: true,
    jeda_global: jeda,
    runner: hitungRunner(runnerBaris?.terakhir_denyut ?? null, runnerBaris?.versi ?? null),
    bots: daftar.map((b) => rakitBot(b, namaUser.get(Number(b.user_id)) ?? "", selesai.get(Number(b.id)) ?? 0, tertaut.get(Number(b.user_id)) ?? 0)),
    log,
    sumber: daftarSumber.sumber,
    blokir: daftarSumber.blokir,
  };
}

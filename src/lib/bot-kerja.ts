// ============================================================
// BOT REDAKSI — sisi APLIKASI protokol runner (13 Okt 2026).
//
//  ambilKerja(botId)            → PerintahRunner (diam/panen/buat_video/pantau_job)
//  prosesLaporan(botId, laporan) → mencatat kandidat / job / log dari runner
//
// Keputusan "apa yang boleh dikerjakan" ada di lib/bot-mesin.ts (murni),
// aturan murni lain di lib/bot-kerja-murni.ts dan lib/bot-pilih.ts. File ini
// hanya merangkai DB (service role). Pagar utamanya:
//  - KLAIM ATOMIK kandidat: UPDATE ... WHERE diklaim_oleh IS NULL ... RETURNING id;
//    hanya pemanggil yang mendapat baris yang menang. UNIQUE(kunci_kanonik)
//    mencegah video sama masuk dua kali.
//  - Satu bot = satu tugas aktif: setelah tugas dibuat diperiksa ulang; bila ada
//    tugas aktif yang lebih tua (giliran ganda serentak) tugas baru dibatalkan.
//  - Tahan skema belum siap (tabel/kolom belum dimigrasi): jawaban netral, bukan 500.
// Pesan galat ke runner sengaja ringkas; detail hanya masuk console server.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { tabelBelumAda } from "@/lib/api-helper";
import { awalHariWibIso, bacaJedaGlobal } from "@/lib/bot-data";
import { KEBIJAKAN, putuskan, TAHAP_AKTIF_OTOMATIS, type KeadaanBot, type Putusan, type TugasAktif } from "@/lib/bot-mesin";
import { BATAS_PROTOKOL, type KandidatMasuk, type LaporanRunner, type PerintahRunner } from "@/lib/bot-protokol";
import { kunciKanonik, type KunciKanonik } from "@/lib/bot-kunci";
import { buatNaskah, labelSumber, peringkatKandidat, type KandidatNilai } from "@/lib/bot-pilih";
import {
  GalatLaporan,
  KERJA,
  adaTabrakan,
  menitWibDari,
  petaKodeGagal,
  pilihKlaimBasi,
  pilihSumberPanen,
  polaCariId,
  saringKandidatMasuk,
  teksPenghalang,
} from "@/lib/bot-kerja-murni";
import { bacaPermintaanWajib, klaimVideoWajib } from "@/lib/bot-video-wajib";
import type { PermintaanWajib } from "@/lib/bot-kerja-murni";
import { siarkanBot } from "@/lib/bot-realtime";
import { hookDariOtakBot } from "@/lib/bot-otak";
import type { TahapBotDb } from "@/lib/bot-tipe";

type Db = SupabaseClient;
type GalatDb = { message: string; code?: string } | null;

/** Skema (tabel/kolom) belum dimigrasi — dijawab netral, bukan 500. */
class SkemaBelumSiap extends Error {}

const skemaBelumSiap = (e: GalatDb): boolean => tabelBelumAda(e) || e?.code === "42703" || e?.code === "PGRST204";

/** Lempar bila ada galat: skema belum siap → SkemaBelumSiap; lainnya → pesan ringkas (detail ke console). */
function periksa(error: GalatDb, konteks: string): void {
  if (!error) return;
  if (skemaBelumSiap(error)) throw new SkemaBelumSiap(konteks);
  console.error(`[bot/kerja] ${konteks}:`, error.message);
  throw new Error(`Gagal ${konteks}.`);
}

const AKTIF: string[] = [...TAHAP_AKTIF_OTOMATIS];
const diam = (alasan: string): PerintahRunner => ({ perintah: "diam", alasan });
const iso = (ms: number): string => new Date(ms).toISOString();
const potongTeks = (s: string, maks: number): string => (s.length > maks ? s.slice(0, maks) : s);

// ---- Bentuk baris ----

type BarisBot = {
  id: number;
  user_id: number;
  aktif: boolean | null;
  jeda: boolean | null;
  kuota_harian: number | null;
  jam_mulai: string | null;
  jam_selesai: string | null;
  gagal_beruntun: number | null;
};

type BarisTugas = {
  id: number;
  bot_id: number;
  kandidat_id: number | null;
  tahap: string;
  judul: string | null;
  caption: string | null;
  kategori: string | null;
  id_job_mesin: string | null;
  id_stok_mesin: string | null;
  hook: string | null;
  percobaan: number | null;
  dikunci_sampai: string | null;
  diubah_pada: string | null;
  dibuat_pada: string | null;
};

const KOLOM_BOT = "id, user_id, aktif, jeda, kuota_harian, jam_mulai, jam_selesai, gagal_beruntun";
const KOLOM_TUGAS = "id, bot_id, kandidat_id, tahap, judul, caption, kategori, id_job_mesin, id_stok_mesin, hook, percobaan, dikunci_sampai, diubah_pada, dibuat_pada";

type BarisSumber = { id: number; platform: string; handle: string; kategori: string | null; terakhir_ambil: string | null };
type BarisKandidat = KandidatNilai & { sumber_id: number | null; kunci_kanonik: string };

// ---- Pembantu DB ----

async function muatBot(db: Db, botId: number): Promise<BarisBot | null> {
  const { data, error } = await db.from("bot_redaksi").select(KOLOM_BOT).eq("id", botId).maybeSingle();
  periksa(error, "memuat bot");
  return (data ?? null) as unknown as BarisBot | null;
}

/** Catatan aktivitas; tidak pernah melempar (gagal mencatat tidak boleh menggagalkan pekerjaan). */
async function catatLog(db: Db, botId: number, tugasId: number | null, tahap: TahapBotDb, teks: string): Promise<void> {
  const { error } = await db.from("bot_log").insert({ bot_id: botId, tugas_id: tugasId, tahap, teks: potongTeks(teks, 500) });
  if (error) console.error("[bot/kerja] catat log:", error.message);
  else siarkanBot("log");
}

/** Ubah gagal_beruntun secara optimistis (cocokkan nilai lama); 3 percobaan. */
async function ubahGagalBeruntun(db: Db, botId: number, hitung: (n: number) => number): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const { data, error } = await db.from("bot_redaksi").select("gagal_beruntun").eq("id", botId).maybeSingle();
    periksa(error, "membaca hitungan gagal");
    if (!data) return;
    const lama = Math.max(0, Number((data as { gagal_beruntun: number | null }).gagal_beruntun ?? 0));
    const baru = Math.max(0, hitung(lama));
    if (baru === lama) return;
    const { data: ubah, error: e2 } = await db.from("bot_redaksi").update({ gagal_beruntun: baru }).eq("id", botId).eq("gagal_beruntun", lama).select("id");
    periksa(e2, "memperbarui hitungan gagal");
    if ((ubah ?? []).length > 0) return;
  }
}

async function lepasKlaimKandidat(db: Db, kandidatId: number, botId: number): Promise<void> {
  const { error } = await db.from("bot_kandidat").update({ diklaim_oleh: null, diklaim_pada: null }).eq("id", kandidatId).eq("diklaim_oleh", botId);
  if (error) console.error("[bot/kerja] lepas klaim:", error.message);
}

/** Jejak Video Wajib sebuah tugas (null bila tugas dari kandidat panen). */
async function barisWajibTugas(db: Db, tugasId: number): Promise<{ id: number; video_wajib_id: number } | null> {
  const { data, error } = await db.from("bot_video_wajib").select("id, video_wajib_id").eq("tugas_id", tugasId).maybeSingle();
  periksa(error, "memuat Video Wajib tugas");
  return (data ?? null) as unknown as { id: number; video_wajib_id: number } | null;
}

/**
 * Tandai tugas aktif gagal. Hanya berlaku bila tugas MASIH aktif (balapan dengan
 * laporan lain → false, tidak menghitung dua kali). Mengurus klaim kandidat,
 * jejak Video Wajib, dan gagal_beruntun menurut `tindakan`.
 */
async function gagalkanTugas(
  db: Db,
  bot: Pick<BarisBot, "id">,
  tugas: Pick<BarisTugas, "id" | "kandidat_id">,
  galat: string,
  tindakan: { tambahGagalBeruntun: boolean; lepasKlaim: boolean },
): Promise<boolean> {
  const { data, error } = await db
    .from("bot_tugas")
    .update({ tahap: "gagal", galat: potongTeks(galat, 500), dikunci_sampai: null, diubah_pada: iso(Date.now()) })
    .eq("id", tugas.id)
    .eq("bot_id", bot.id)
    .in("tahap", AKTIF)
    .select("id");
  periksa(error, "menandai tugas gagal");
  if ((data ?? []).length === 0) return false;

  if (tugas.kandidat_id !== null && tindakan.lepasKlaim) await lepasKlaimKandidat(db, tugas.kandidat_id, bot.id);
  if (tugas.kandidat_id === null) {
    // Tugas Video Wajib: penghalang konfigurasi → permintaan dibuka lagi (baris dihapus);
    // gagal biasa → ditandai dilepas dan TIDAK diambil ulang otomatis (perlu manusia).
    const wajib = await barisWajibTugas(db, tugas.id).catch(() => null);
    if (wajib) {
      const q = tindakan.lepasKlaim
        ? db.from("bot_video_wajib").delete().eq("id", wajib.id)
        : db.from("bot_video_wajib").update({ status: "dilepas" }).eq("id", wajib.id);
      const { error: e2 } = await q;
      if (e2) console.error("[bot/kerja] urus Video Wajib gagal:", e2.message);
    }
  }
  if (tindakan.tambahGagalBeruntun) await ubahGagalBeruntun(db, bot.id, (n) => n + 1);
  siarkanBot("tugas");
  return true;
}

// ---- Tabrakan dengan sistem lain ----

type HasilTabrakan = "bersih" | "dipakai" | "gagal";

/**
 * Apakah video ini sudah dipakai manusia? Mencocokkan id kanonik pada
 * video_antrian (link, video_asli), tugas_link.url, berita.link_video,
 * tvrku_post.video_url (ilike kasar, lalu dipastikan dengan kunciKanonik).
 * Galat tak terduga → "gagal" (gagal tertutup: tidak memilih kandidat itu).
 */
async function periksaTabrakanManusia(db: Db, kunci: KunciKanonik): Promise<HasilTabrakan> {
  const pola = polaCariId(kunci.id);
  const kueri = [
    db.from("video_antrian").select("link").ilike("link", pola).limit(20),
    db.from("video_antrian").select("video_asli").ilike("video_asli", pola).limit(20),
    db.from("tugas_link").select("url").ilike("url", pola).limit(20),
    db.from("berita").select("link_video").ilike("link_video", pola).limit(20),
    db.from("tvrku_post").select("video_url").ilike("video_url", pola).limit(20),
  ];
  const hasil = await Promise.all(kueri);
  const urls: string[] = [];
  for (const r of hasil) {
    if (r.error) {
      if (tabelBelumAda(r.error)) continue;
      console.error("[bot/kerja] cek tabrakan:", r.error.message);
      return "gagal";
    }
    for (const baris of (r.data ?? []) as unknown as Record<string, unknown>[]) {
      for (const nilai of Object.values(baris)) if (typeof nilai === "string") urls.push(nilai);
    }
  }
  return adaTabrakan(urls, kunci.kunci) ? "dipakai" : "bersih";
}

// ---- Klaim basi ----

/** Lepas klaim kandidat yang tak maju (tanpa tugas) lebih dari KLAIM_BASI_MENIT. Best-effort. */
async function lepasKlaimBasi(db: Db, sekarangMs: number): Promise<void> {
  try {
    const { data, error } = await db
      .from("bot_kandidat")
      .select("id, diklaim_pada")
      .not("diklaim_oleh", "is", null)
      .lt("diklaim_pada", iso(sekarangMs - KEBIJAKAN.KLAIM_BASI_MENIT * 60_000))
      .order("diklaim_pada", { ascending: true })
      .limit(100);
    if (error) throw new Error(error.message);
    const klaim = ((data ?? []) as { id: number; diklaim_pada: string | null }[]).map((k) => ({ id: Number(k.id), diklaim_pada: k.diklaim_pada }));
    if (klaim.length === 0) return;
    const { data: tugas, error: e2 } = await db.from("bot_tugas").select("kandidat_id").in("kandidat_id", klaim.map((k) => k.id));
    if (e2) throw new Error(e2.message);
    const adaTugas = new Set(((tugas ?? []) as { kandidat_id: number }[]).map((t) => Number(t.kandidat_id)));
    const lepas = pilihKlaimBasi(klaim, adaTugas, sekarangMs);
    if (lepas.length === 0) return;
    const { error: e3 } = await db.from("bot_kandidat").update({ diklaim_oleh: null, diklaim_pada: null }).in("id", lepas).not("diklaim_oleh", "is", null);
    if (e3) throw new Error(e3.message);
  } catch (e) {
    console.error("[bot/kerja] lepas klaim basi:", e instanceof Error ? e.message : e);
  }
}

// ---- Satu bot = satu tugas aktif ----

/** true bila tugas ini yang berhak (tidak ada tugas aktif bot yang lebih tua). */
async function tugasBerhak(db: Db, botId: number, tugasId: number): Promise<boolean> {
  const { data, error } = await db.from("bot_tugas").select("id").eq("bot_id", botId).in("tahap", AKTIF).lt("id", tugasId).limit(1);
  periksa(error, "memeriksa tugas ganda");
  return (data ?? []).length === 0;
}

// ---- ambilKerja ----

/** Tugas aktif tertua bot (tertua = pemenang bila terjadi giliran ganda serentak). */
async function tugasAktifBot(db: Db, botId: number): Promise<BarisTugas | null> {
  const { data, error } = await db.from("bot_tugas").select(KOLOM_TUGAS).eq("bot_id", botId).in("tahap", AKTIF).order("id", { ascending: true }).limit(1);
  periksa(error, "memuat tugas aktif");
  return ((data ?? [])[0] ?? null) as unknown as BarisTugas | null;
}

async function hitungDibuatHariIni(db: Db, botId: number, sekarangMs: number): Promise<number> {
  const { count, error } = await db
    .from("bot_tugas")
    .select("id", { count: "exact", head: true })
    .eq("bot_id", botId)
    .gte("dibuat_pada", awalHariWibIso(new Date(sekarangMs)));
  periksa(error, "menghitung tugas hari ini");
  return count ?? 0;
}

/**
 * Perintah berikutnya untuk satu bot. Tidak pernah memulai kerja bila pagar
 * (putuskan) menutup; skema belum siap → diam("tabel_belum_ada").
 */
export async function ambilKerja(botId: number, sekarangMs: number = Date.now()): Promise<PerintahRunner> {
  try {
    const perintah = await ambilKerjaInti(botId, sekarangMs);
    // Otak bot sendiri (13 Okt 2026): bila bot punya API key, hook ditulis di sini dengan kunci
    // itu (kunci tidak pernah keluar dari aplikasi). Gagal/tanpa kunci = runner memakai jalur mesin.
    if (perintah.perintah === "buat_video") {
      const hook = await hookDariOtakBot(botId, perintah.id_pengguna_mesin, perintah.naskah);
      if (hook) return { ...perintah, hook };
    }
    return perintah;
  } catch (e) {
    if (e instanceof SkemaBelumSiap) return diam("tabel_belum_ada");
    throw e;
  }
}

/** Putusan mesin keputusan untuk satu bot + tugas aktifnya (dipakai ambil_kerja dan pengambilan manual). */
async function hitungPutusan(db: Db, bot: BarisBot, sekarangMs: number): Promise<{ putusan: Putusan; tugas: BarisTugas | null }> {
  const botId = bot.id;
  const [jedaGlobal, dibuatHariIni, tugas] = await Promise.all([bacaJedaGlobal(), hitungDibuatHariIni(db, botId, sekarangMs), tugasAktifBot(db, botId)]);

  const keadaan: KeadaanBot = {
    aktif: bot.aktif !== false,
    jeda: bot.jeda === true,
    kuotaHarian: Math.max(0, Number(bot.kuota_harian ?? 1)),
    jamMulai: String(bot.jam_mulai ?? ""),
    jamSelesai: String(bot.jam_selesai ?? ""),
    gagalBeruntun: Math.max(0, Number(bot.gagal_beruntun ?? 0)),
    dibuatHariIni,
  };
  const diubahMs = tugas?.diubah_pada ? Date.parse(tugas.diubah_pada) : NaN;
  const dikunciMs = tugas?.dikunci_sampai ? Date.parse(tugas.dikunci_sampai) : NaN;
  const tugasAktif: TugasAktif | null = tugas
    ? {
        id: Number(tugas.id),
        tahap: tugas.tahap as TugasAktif["tahap"],
        dikunciSampaiMs: Number.isFinite(dikunciMs) ? dikunciMs : null,
        percobaan: Math.max(0, Number(tugas.percobaan ?? 0)),
        // Tanggal rusak = anggap baru saja berubah (jangan menggagalkan tugas karena data aneh).
        diubahPadaMs: Number.isFinite(diubahMs) ? diubahMs : sekarangMs,
      }
    : null;

  const putusan = putuskan(keadaan, { jedaGlobal, menitWib: menitWibDari(sekarangMs) }, tugasAktif, sekarangMs);
  return { putusan, tugas };
}

async function ambilKerjaInti(botId: number, sekarangMs: number): Promise<PerintahRunner> {
  const db = supabase();
  const bot = await muatBot(db, botId);
  if (!bot) return diam("bot_tidak_ada");

  const { putusan, tugas } = await hitungPutusan(db, bot, sekarangMs);

  switch (putusan.aksi) {
    case "diam":
      return diam(putusan.alasan);

    case "gagalkan": {
      if (!tugas) return diam("tidak_ada_tugas");
      const alasan =
        putusan.alasan === "macet"
          ? "Tugas macet: tidak ada kemajuan lebih dari batas waktu — digagalkan."
          : "Perintah membuat video sudah diberikan berulang kali tanpa hasil — digagalkan.";
      const ok = await gagalkanTugas(db, bot, tugas, alasan, { tambahGagalBeruntun: true, lepasKlaim: false });
      if (ok) await catatLog(db, bot.id, tugas.id, "edit", alasan);
      return diam(putusan.alasan === "macet" ? "tugas_macet_digagalkan" : "percobaan_habis_digagalkan");
    }

    case "lanjut": {
      if (!tugas) return diam("tidak_ada_tugas");
      if (tugas.id_job_mesin) {
        return { perintah: "pantau_job", tugas_id: Number(tugas.id), id_job_mesin: tugas.id_job_mesin, hook: tugas.hook ?? null, id_pengguna_mesin: Number(bot.user_id) };
      }
      return await ulangBuatVideo(db, bot, tugas, sekarangMs);
    }

    case "mulai_tugas": {
      const dariWajib = await mulaiDariVideoWajib(db, bot, sekarangMs);
      if (dariWajib) return dariWajib;
      return await mulaiDariKandidat(db, bot, sekarangMs);
    }
  }
}

/** Sumber (url + kredit) sebuah tugas yang belum punya job: dari kandidat panen atau permintaan Video Wajib. */
async function sumberTugas(db: Db, tugas: BarisTugas): Promise<{ url: string; label: string } | null> {
  if (tugas.kandidat_id !== null) {
    const { data, error } = await db.from("bot_kandidat").select("url, sumber_id").eq("id", tugas.kandidat_id).maybeSingle();
    periksa(error, "memuat kandidat tugas");
    const k = data as { url: string; sumber_id: number | null } | null;
    if (!k) return null;
    let platform = "";
    let handle = "";
    if (k.sumber_id !== null) {
      const { data: s, error: e2 } = await db.from("bot_sumber").select("platform, handle").eq("id", k.sumber_id).maybeSingle();
      periksa(e2, "memuat sumber tugas");
      platform = String((s as { platform?: string } | null)?.platform ?? "");
      handle = String((s as { handle?: string } | null)?.handle ?? "");
    }
    return { url: k.url, label: labelSumber(platform, handle) };
  }
  const wajib = await barisWajibTugas(db, tugas.id);
  if (!wajib) return null;
  const ambil = async (kolom: string) => db.from("tvr_video_wajib").select(kolom).eq("id", wajib.video_wajib_id).maybeSingle();
  let r = await ambil("link_doksli, sumber_video");
  if (r.error && (r.error.code === "42703" || r.error.code === "PGRST204")) r = await ambil("link_doksli");
  periksa(r.error, "memuat Video Wajib");
  const v = r.data as unknown as { link_doksli?: string; sumber_video?: string } | null;
  if (!v || !String(v.link_doksli ?? "").trim()) return null;
  return { url: String(v.link_doksli).trim(), label: labelSumber("TV Rakyat", String(v.sumber_video ?? "")) };
}

/** Sumber (url + kredit) sebuah tugas; dipakai Antrean ACC. null bila tak ditemukan atau skema belum siap. */
export async function sumberUntukTugas(tugasId: number, kandidatId: number | null): Promise<{ url: string; label: string } | null> {
  try {
    return await sumberTugas(supabase(), { id: tugasId, kandidat_id: kandidatId } as unknown as BarisTugas);
  } catch (e) {
    if (!(e instanceof SkemaBelumSiap)) console.error("[bot/kerja] sumber tugas:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Tugas aktif tanpa job: beri perintah buat_video lagi (dibatasi percobaan + dikunci sebentar). */
async function ulangBuatVideo(db: Db, bot: BarisBot, tugas: BarisTugas, sekarangMs: number): Promise<PerintahRunner> {
  const gagalMasalahData = async (alasan: string): Promise<PerintahRunner> => {
    const ok = await gagalkanTugas(db, bot, tugas, alasan, { tambahGagalBeruntun: true, lepasKlaim: false });
    if (ok) await catatLog(db, bot.id, tugas.id, "edit", alasan);
    return diam("data_tugas_rusak");
  };
  const naskah = buatNaskah(tugas.judul, tugas.caption);
  if (naskah === null) return gagalMasalahData("Tugas dibatalkan: judul dan caption kosong.");
  const sumber = await sumberTugas(db, tugas);
  if (!sumber) return gagalMasalahData("Tugas dibatalkan: video sumber tidak ditemukan lagi.");

  // Kunci + hitung percobaan secara optimistis: hanya satu pemanggil yang lolos.
  const percobaan = Math.max(0, Number(tugas.percobaan ?? 0));
  const { data, error } = await db
    .from("bot_tugas")
    .update({ percobaan: percobaan + 1, dikunci_sampai: iso(sekarangMs + KERJA.KUNCI_DETIK * 1000), tahap: "edit" })
    .eq("id", tugas.id)
    .eq("percobaan", percobaan)
    .in("tahap", AKTIF)
    .select("id");
  periksa(error, "mengunci tugas");
  if ((data ?? []).length === 0) return diam("terkunci");

  return {
    perintah: "buat_video",
    tugas_id: Number(tugas.id),
    url: sumber.url,
    naskah,
    kategori: String(tugas.kategori ?? "NEWS"),
    sumber_label: sumber.label,
    id_pengguna_mesin: Number(bot.user_id),
  };
}

/** Batalkan tugas yang baru dibuat karena kalah balapan (bot sudah punya tugas aktif yang lebih tua). */
async function batalkanTugasBaru(db: Db, tugasId: number, botId: number, kandidatId: number | null): Promise<void> {
  await db.from("bot_video_wajib").delete().eq("tugas_id", tugasId);
  const { error } = await db.from("bot_tugas").delete().eq("id", tugasId).eq("bot_id", botId);
  if (error) console.error("[bot/kerja] batalkan tugas baru:", error.message);
  if (kandidatId !== null) await lepasKlaimKandidat(db, kandidatId, botId);
}

type HasilBuatTugasWajib = { jenis: "ok"; tugasId: number } | { jenis: "kalah_klaim" } | { jenis: "gagal"; alasan: string };

/**
 * Klaim atomik satu permintaan Video Wajib lalu buat tugasnya (tahap 'edit').
 * DIPAKAI BERSAMA oleh ambil_kerja (otomatis) dan pengambilan manual dari TVR Saya
 * akun bot, supaya keduanya melewati jalur dan pagar yang persis sama.
 */
async function buatTugasDariPermintaan(db: Db, bot: BarisBot, p: PermintaanWajib, sekarangMs: number): Promise<HasilBuatTugasWajib> {
  if (!(await klaimVideoWajib(bot.id, p.id))) return { jenis: "kalah_klaim" }; // sudah diambil bot lain

  const judul = potongTeks(p.judul !== "" ? p.judul : p.naskah, 500);
  const { data, error } = await db
    .from("bot_tugas")
    .insert({
      bot_id: bot.id,
      tahap: "edit",
      judul,
      caption: potongTeks(p.keterangan, 5000),
      kategori: p.kategori,
      percobaan: 1,
      dikunci_sampai: iso(sekarangMs + KERJA.KUNCI_DETIK * 1000),
      diubah_pada: iso(sekarangMs),
    })
    .select("id")
    .single();
  if (error || !data) {
    // Gulung balik klaim supaya permintaan tidak hilang percuma.
    await db.from("bot_video_wajib").delete().eq("video_wajib_id", p.id).eq("bot_id", bot.id);
    periksa(error, "membuat tugas Video Wajib");
    return { jenis: "gagal", alasan: "gagal_membuat_tugas" };
  }
  const tugasId = Number((data as { id: number }).id);
  await db.from("bot_video_wajib").update({ tugas_id: tugasId }).eq("video_wajib_id", p.id).eq("bot_id", bot.id);

  if (!(await tugasBerhak(db, bot.id, tugasId))) {
    await batalkanTugasBaru(db, tugasId, bot.id, null);
    return { jenis: "gagal", alasan: "terkunci" };
  }
  siarkanBot("tugas");
  await catatLog(db, bot.id, tugasId, "cari", `Mengambil Video Wajib Pimred: ${potongTeks(judul, 100)}`);
  return { jenis: "ok", tugasId };
}

/** Video Wajib Pimred didahulukan atas hasil panen. null bila tak ada yang bisa diambil. */
async function mulaiDariVideoWajib(db: Db, bot: BarisBot, sekarangMs: number): Promise<PerintahRunner | null> {
  const permintaan = await bacaPermintaanWajib(sekarangMs);
  let percobaan = 0;
  for (const p of permintaan) {
    if (percobaan >= KERJA.MAKS_PERCOBAAN_PILIH) break;
    percobaan++;
    const h = await buatTugasDariPermintaan(db, bot, p, sekarangMs);
    if (h.jenis === "kalah_klaim") continue;
    if (h.jenis === "gagal") return diam(h.alasan);
    return {
      perintah: "buat_video",
      tugas_id: h.tugasId,
      url: p.link_doksli,
      naskah: p.naskah,
      kategori: p.kategori,
      sumber_label: labelSumber("TV Rakyat", p.sumber_video),
      id_pengguna_mesin: Number(bot.user_id),
    };
  }
  return null;
}

// ---- Pengambilan MANUAL dari TVR Saya akun bot (2F) ----

export type HasilAmbilManual =
  | { ok: true; tugas_id: number }
  | { ok: false; kode: "bot_tidak_ada" | "ditutup" | "sudah_diambil" | "tidak_layak" | "tabel_belum_ada"; alasan: string | null };

/**
 * Master menyuruh bot mengambil SATU permintaan Video Wajib sekarang. Semua pagar
 * tetap berlaku: bila mesin keputusan tidak menyatakan `mulai_tugas` (jeda, jam aktif,
 * kuota, tugas masih berjalan, dst.) permintaan DITOLAK dengan alasannya. Tugas yang
 * dibuat dikerjakan runner pada ambil_kerja berikutnya (tahap edit tanpa job → buat_video).
 */
export async function ambilPermintaanManual(botId: number, videoWajibId: number, sekarangMs: number = Date.now()): Promise<HasilAmbilManual> {
  try {
    const db = supabase();
    const bot = await muatBot(db, botId);
    if (!bot) return { ok: false, kode: "bot_tidak_ada", alasan: null };
    const { putusan } = await hitungPutusan(db, bot, sekarangMs);
    if (putusan.aksi !== "mulai_tugas") {
      return { ok: false, kode: "ditutup", alasan: putusan.aksi === "diam" ? putusan.alasan : "tugas_berjalan" };
    }
    const terbuka = await bacaPermintaanWajib(sekarangMs);
    const p = terbuka.find((x) => x.id === videoWajibId);
    if (!p) return { ok: false, kode: "tidak_layak", alasan: null };
    const h = await buatTugasDariPermintaan(db, bot, p, sekarangMs);
    if (h.jenis === "kalah_klaim") return { ok: false, kode: "sudah_diambil", alasan: null };
    if (h.jenis === "gagal") return { ok: false, kode: "ditutup", alasan: h.alasan };
    return { ok: true, tugas_id: h.tugasId };
  } catch (e) {
    if (e instanceof SkemaBelumSiap) return { ok: false, kode: "tabel_belum_ada", alasan: null };
    throw e;
  }
}

/** Boleh memulai tugas BARU sekarang? (untuk panel Tugas Bot). alasan = kode AlasanDiam atau 'tugas_berjalan'. */
export async function bisaMulaiSekarang(botId: number, sekarangMs: number = Date.now()): Promise<{ bisaMulai: boolean; alasan: string | null }> {
  try {
    const db = supabase();
    const bot = await muatBot(db, botId);
    if (!bot) return { bisaMulai: false, alasan: "bot_tidak_ada" };
    const { putusan } = await hitungPutusan(db, bot, sekarangMs);
    if (putusan.aksi === "mulai_tugas") return { bisaMulai: true, alasan: null };
    return { bisaMulai: false, alasan: putusan.aksi === "diam" ? putusan.alasan : "tugas_berjalan" };
  } catch (e) {
    if (e instanceof SkemaBelumSiap) return { bisaMulai: false, alasan: "tabel_belum_ada" };
    throw e;
  }
}

/** Pilih kandidat panen terbaik milik sumber bot ini, klaim atomik, buat tugas. Tak ada → panen/diam. */
async function mulaiDariKandidat(db: Db, bot: BarisBot, sekarangMs: number): Promise<PerintahRunner> {
  await lepasKlaimBasi(db, sekarangMs);

  const { data: sumberData, error: eSumber } = await db
    .from("bot_sumber")
    .select("id, platform, handle, kategori, terakhir_ambil")
    .eq("bot_id", bot.id)
    .eq("aktif", true)
    .order("id", { ascending: true });
  periksa(eSumber, "memuat sumber bot");
  const sumber = (sumberData ?? []) as unknown as BarisSumber[];
  if (sumber.length === 0) return diam("tidak_ada_sumber");
  const petaSumber = new Map(sumber.map((s) => [Number(s.id), s]));

  const [rKandidat, rBlokir] = await Promise.all([
    db
      .from("bot_kandidat")
      .select("id, url, judul, caption, durasi_detik, tayangan, waktu_terbit, bentrok, sumber_id, kunci_kanonik")
      .is("diklaim_oleh", null)
      .is("bentrok", null)
      .in("sumber_id", sumber.map((s) => Number(s.id)))
      .order("dibuat_pada", { ascending: false })
      .limit(KERJA.MAKS_KANDIDAT_DIMUAT),
    db.from("bot_blokir").select("kata").limit(1000),
  ]);
  periksa(rKandidat.error, "memuat kandidat");
  periksa(rBlokir.error, "memuat daftar blokir");
  const kandidat = (rKandidat.data ?? []) as unknown as BarisKandidat[];
  const blokir = ((rBlokir.data ?? []) as { kata: string }[]).map((b) => String(b.kata ?? ""));

  let percobaan = 0;
  for (const { kandidat: k } of peringkatKandidat(kandidat, blokir, sekarangMs)) {
    if (percobaan >= KERJA.MAKS_PERCOBAAN_PILIH) break;
    percobaan++;
    const kunci = kunciKanonik(k.url);
    const naskah = buatNaskah(k.judul, k.caption);
    const tandai = async (alasan: string) => {
      const { error } = await db.from("bot_kandidat").update({ bentrok: alasan }).eq("id", k.id).is("diklaim_oleh", null);
      if (error) console.error("[bot/kerja] tandai bentrok:", error.message);
    };
    if (!kunci) {
      await tandai("url_tak_sah");
      continue;
    }
    if (naskah === null) {
      await tandai("tanpa_teks");
      continue;
    }
    const tabrakan = await periksaTabrakanManusia(db, kunci);
    if (tabrakan === "gagal") return diam("cek_tabrakan_gagal");
    if (tabrakan === "dipakai") {
      await tandai("dipakai_manusia");
      await catatLog(db, bot.id, null, "cari", `Video dilewati: sudah dipakai di sistem lain (${kunci.kunci}).`);
      continue;
    }

    // KLAIM ATOMIK: hanya satu pemanggil yang mendapat baris kembali.
    const { data: menang, error: eKlaim } = await db
      .from("bot_kandidat")
      .update({ diklaim_oleh: bot.id, diklaim_pada: iso(sekarangMs) })
      .eq("id", k.id)
      .is("diklaim_oleh", null)
      .is("bentrok", null)
      .select("id");
    periksa(eKlaim, "mengklaim kandidat");
    if ((menang ?? []).length === 0) continue; // kalah balapan; coba kandidat berikutnya

    const s = k.sumber_id !== null ? petaSumber.get(Number(k.sumber_id)) : undefined;
    const judul = potongTeks((k.judul ?? "").trim() !== "" ? String(k.judul).trim() : naskah, 500);
    const { data: tugasBaru, error: eTugas } = await db
      .from("bot_tugas")
      .insert({
        bot_id: bot.id,
        kandidat_id: k.id,
        tahap: "edit",
        judul,
        caption: potongTeks(String(k.caption ?? ""), 5000),
        kategori: String(s?.kategori ?? "NEWS"),
        percobaan: 1,
        dikunci_sampai: iso(sekarangMs + KERJA.KUNCI_DETIK * 1000),
        diubah_pada: iso(sekarangMs),
      })
      .select("id")
      .single();
    if (eTugas || !tugasBaru) {
      await lepasKlaimKandidat(db, k.id, bot.id); // gulung balik klaim
      periksa(eTugas, "membuat tugas");
      return diam("gagal_membuat_tugas");
    }
    const tugasId = Number((tugasBaru as { id: number }).id);
    if (!(await tugasBerhak(db, bot.id, tugasId))) {
      await batalkanTugasBaru(db, tugasId, bot.id, k.id);
      return diam("terkunci");
    }
    siarkanBot("tugas");
    const label = labelSumber(s?.platform ?? "", s?.handle ?? "");
    await catatLog(db, bot.id, tugasId, "cari", `Memilih video dari ${label}: ${potongTeks(judul, 100)}`);
    return {
      perintah: "buat_video",
      tugas_id: tugasId,
      url: k.url,
      naskah,
      kategori: String(s?.kategori ?? "NEWS"),
      sumber_label: label,
      id_pengguna_mesin: Number(bot.user_id),
    };
  }

  // Tidak ada kandidat yang bisa dipakai: panen sumber yang sudah lama tak diambil.
  const panen = pilihSumberPanen(sumber, sekarangMs);
  if (panen.length > 0) return { perintah: "panen", sumber: panen.slice(0, BATAS_PROTOKOL.MAKS_SUMBER_PER_PANEN) };
  return diam("tidak_ada_kandidat");
}

// ---- prosesLaporan ----

/**
 * Catat laporan runner. Melempar GalatLaporan (status 403/404/409/400) untuk
 * laporan yang tidak sah; skema belum siap → diam-diam selesai.
 */
export async function prosesLaporan(botId: number, laporan: LaporanRunner, sekarangMs: number = Date.now()): Promise<void> {
  try {
    await prosesLaporanInti(botId, laporan, sekarangMs);
  } catch (e) {
    if (e instanceof SkemaBelumSiap) return;
    throw e;
  }
}

async function muatTugasMilik(db: Db, botId: number, tugasId: number): Promise<BarisTugas> {
  const { data, error } = await db.from("bot_tugas").select(KOLOM_TUGAS).eq("id", tugasId).eq("bot_id", botId).maybeSingle();
  periksa(error, "memuat tugas");
  // Tugas milik bot lain dijawab sama dengan "tidak ada" (tidak membocorkan keberadaannya).
  if (!data) throw new GalatLaporan("Tugas tidak ditemukan.", 404);
  return data as unknown as BarisTugas;
}

async function prosesLaporanInti(botId: number, laporan: LaporanRunner, sekarangMs: number): Promise<void> {
  const db = supabase();
  const bot = await muatBot(db, botId);
  if (!bot) throw new GalatLaporan("Bot tidak ditemukan.", 404);
  if (bot.aktif === false) throw new GalatLaporan("Bot tidak aktif.", 403);

  switch (laporan.jenis) {
    case "kandidat":
      return await laporKandidat(db, bot, laporan.sumber_id, laporan.kandidat, laporan.galat, sekarangMs);

    case "job_dibuat": {
      const tugas = await muatTugasMilik(db, botId, laporan.tugas_id);
      if (!AKTIF.includes(tugas.tahap)) throw new GalatLaporan("Tugas sudah tidak aktif.", 409);
      const { data, error } = await db
        .from("bot_tugas")
        // percobaan direset: hitungan itu hanya untuk perintah buat_video, bukan untuk pemantauan job.
        .update({ id_job_mesin: laporan.id_job_mesin, hook: laporan.hook, tahap: "edit", percobaan: 0, dikunci_sampai: null, diubah_pada: iso(sekarangMs) })
        .eq("id", tugas.id)
        .eq("bot_id", botId)
        .in("tahap", AKTIF)
        .select("id");
      periksa(error, "menyimpan job");
      if ((data ?? []).length === 0) throw new GalatLaporan("Tugas sudah tidak aktif.", 409);
      siarkanBot("tugas");
      await catatLog(db, botId, tugas.id, "edit", "Job render dibuat di mesin, menunggu video jadi.");
      return;
    }

    case "job_selesai": {
      const tugas = await muatTugasMilik(db, botId, laporan.tugas_id);
      // Idempoten: laporan yang sama diulang runner (jawaban sebelumnya hilang) tidak apa-apa.
      if (tugas.tahap === "siap_ditinjau" && tugas.id_stok_mesin === laporan.id_stok_mesin) return;
      if (!AKTIF.includes(tugas.tahap)) throw new GalatLaporan("Tugas sudah tidak aktif.", 409);
      const { data, error } = await db
        .from("bot_tugas")
        .update({ tahap: "siap_ditinjau", id_stok_mesin: laporan.id_stok_mesin, galat: "", dikunci_sampai: null, diubah_pada: iso(sekarangMs) })
        .eq("id", tugas.id)
        .eq("bot_id", botId)
        .in("tahap", AKTIF)
        .select("id");
      periksa(error, "menyimpan hasil job");
      if ((data ?? []).length === 0) throw new GalatLaporan("Tugas sudah tidak aktif.", 409);
      await ubahGagalBeruntun(db, botId, () => 0);
      if (tugas.kandidat_id === null) {
        const { error: e2 } = await db.from("bot_video_wajib").update({ status: "selesai" }).eq("tugas_id", tugas.id);
        if (e2) console.error("[bot/kerja] tandai Video Wajib selesai:", e2.message);
      }
      siarkanBot("tugas");
      const detik = laporan.durasi_detik !== null ? ` (${Math.round(laporan.durasi_detik)} dtk)` : "";
      await catatLog(db, botId, tugas.id, "edit", `Video selesai dirender${detik} dan siap ditinjau di Stok Video.`);
      return;
    }

    case "job_gagal": {
      const tugas = await muatTugasMilik(db, botId, laporan.tugas_id);
      if (!AKTIF.includes(tugas.tahap)) throw new GalatLaporan("Tugas sudah tidak aktif.", 409);
      const tindakan = petaKodeGagal(laporan.kode);
      const ringkas = potongTeks(laporan.pesan.trim(), 200);
      const ok = await gagalkanTugas(db, bot, tugas, `${laporan.kode}: ${ringkas}`, tindakan);
      if (!ok) throw new GalatLaporan("Tugas sudah tidak aktif.", 409);
      const teks = tindakan.penghalang
        ? `Penghalang: ${teksPenghalang(laporan.kode)}.${ringkas !== "" ? ` (${ringkas})` : ""}`
        : `Video gagal diproses (${laporan.kode})${ringkas !== "" ? `: ${ringkas}` : "."}`;
      await catatLog(db, botId, tugas.id, "edit", teks);
      return;
    }

    case "log":
      await catatLog(db, botId, null, laporan.tahap, laporan.teks);
      return;
  }
}

async function laporKandidat(db: Db, bot: BarisBot, sumberId: number, masuk: KandidatMasuk[], galat: string | undefined, sekarangMs: number): Promise<void> {
  if (masuk.length > BATAS_PROTOKOL.MAKS_KANDIDAT_PER_LAPORAN) throw new GalatLaporan("Kandidat terlalu banyak.", 400);
  const { data: s, error } = await db.from("bot_sumber").select("id, platform, handle").eq("id", sumberId).eq("bot_id", bot.id).maybeSingle();
  periksa(error, "memuat sumber");
  if (!s) throw new GalatLaporan("Sumber tidak ditemukan.", 404);
  const sumber = s as { id: number; platform: string; handle: string };
  const label = labelSumber(sumber.platform, sumber.handle);

  const { baris, dibuang } = saringKandidatMasuk(masuk, Number(sumber.id));
  let baru = 0;
  if (baris.length > 0) {
    // ignoreDuplicates = ON CONFLICT DO NOTHING: kandidat yang sudah ada (apalagi sudah diklaim) tidak ditimpa.
    const { data, error: eUp } = await db.from("bot_kandidat").upsert(baris, { onConflict: "kunci_kanonik", ignoreDuplicates: true }).select("id");
    periksa(eUp, "menyimpan kandidat");
    baru = (data ?? []).length;
  }
  // terakhir_ambil diperbarui juga saat panen bermasalah: mencegah panen berulang tiap giliran.
  const { error: eTs } = await db.from("bot_sumber").update({ terakhir_ambil: iso(sekarangMs) }).eq("id", sumber.id);
  periksa(eTs, "memperbarui waktu panen");

  if (galat && galat.trim() !== "") {
    await catatLog(db, bot.id, null, "cari", `Panen ${label} bermasalah: ${potongTeks(galat.trim(), 200)}`);
  } else {
    const buang = dibuang > 0 ? `, ${dibuang} dilewati (tautan tak dikenal/ganda)` : "";
    await catatLog(db, bot.id, null, "cari", `Panen ${label}: ${baru} video baru dari ${masuk.length}${buang}.`);
  }
}

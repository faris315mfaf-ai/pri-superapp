// Posting bot & Antrean ACC (13 Okt 2026) — KHUSUS SISI SERVER.
//
// Alur satu tugas (tahap bot_tugas), semua perpindahan ATOMIK
// (UPDATE ... WHERE tahap = <asal> RETURNING id — hanya satu pemanggil menang):
//
//   siap_ditinjau|menunggu_acc|disetujui ──setuju──▶ disetujui ──klaim──▶ posting ──▶ selesai
//                                                         ▲                   │ galat PASTI (belum terkirim)
//                                                         └───────────────────┤
//                                                                             └ galat AMBIGU ▶ gagal (periksa manual)
//   siap_ditinjau|menunggu_acc|disetujui ──ulang──▶ edit (runner membuat video lagi)
//   siap_ditinjau|menunggu_acc|disetujui ──tolak──▶ gagal (tidak menambah hitungan gagal bot)
//
// Prinsip: postingan sosmed tidak bisa ditarik, jadi
//  - TIDAK PERNAH diulang otomatis; setelah galat pasti, master menekan Setujui lagi;
//  - galat yang mungkin sudah terkirim (timeout/5xx) berhenti di `gagal` untuk diperiksa manusia;
//  - sebelum apa pun: BOT_POSTING_AKTIF, bot tidak dijeda, akun tujuan tertaut;
//  - kunci proses (Redis/memori) + klaim atomik mencegah posting dobel;
//  - tayang dijadwalkan beberapa menit ke depan agar masih bisa dibatalkan (hapus berkas).
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { tabelBelumAda } from "@/lib/api-helper";
import { bacaJedaGlobal } from "@/lib/bot-data";
import { sumberUntukTugas } from "@/lib/bot-kerja";
import { siarkanBot } from "@/lib/bot-realtime";
import { catatAudit } from "@/lib/audit";
import { solusiGagal, LABEL_SOSMED } from "@/lib/batas-caption";
import { PENYEDIA_ANGGOTA, unggahVideoAnggota, type IdPenyedia } from "@/lib/sosmed-penyedia";
import { ambilKunciUnggah, statusAkunUp, uploadPostSiap } from "@/lib/upload-post";
import { kolomTabelAda, sisipkanLonggar } from "@/lib/kolom-struktur";
import { dariR2 } from "@/lib/r2";
import { GalatSalin, hapusBerkasPenyimpanan, kunciPenyimpanan, salinStokKePenyimpanan } from "@/lib/bot-stok-salin";
import {
  KATEGORI_POSTING_BOT,
  LABEL_PLATFORM,
  alasanTolakSetuju,
  bolehBatalkanJadwal,
  captionBawaan,
  jadwalPostingIso,
  klasifikasiGalatUnggah,
  kunciPlatform,
  postingAktif,
  postingMacet,
  tandaPemeriksaan,
  type AksiAcc,
  type ItemAccApi,
  type RiwayatAccApi,
  type StatusAcc,
} from "@/lib/bot-posting-murni";

type Db = SupabaseClient;

export class GalatAcc extends Error {
  constructor(
    pesan: string,
    public status: number,
  ) {
    super(pesan);
  }
}

const TAHAP_BISA_DIPUTUSKAN = ["siap_ditinjau", "menunggu_acc", "disetujui"];
const iso = (ms: number) => new Date(ms).toISOString();
const skemaBelumSiap = (e: { code?: string } | null | undefined) => tabelBelumAda(e) || e?.code === "42703" || e?.code === "PGRST204";

type BarisTugasAcc = {
  id: number;
  bot_id: number;
  kandidat_id: number | null;
  judul: string | null;
  kategori: string | null;
  hook: string | null;
  caption: string | null;
  caption_post: string | null;
  id_stok_mesin: string | null;
  tahap: string;
  galat: string | null;
  diubah_pada: string | null;
  jadwal: string | null;
  hasil_posting: Record<string, unknown> | null;
  keputusan: string | null;
  keputusan_pada: string | null;
};
const KOLOM_TUGAS =
  "id, bot_id, kandidat_id, judul, kategori, hook, caption, caption_post, id_stok_mesin, tahap, galat, diubah_pada, jadwal, hasil_posting, keputusan, keputusan_pada";

type BarisBotAcc = { id: number; user_id: number; nama: string; platform: string | null; aktif: boolean | null; jeda: boolean | null };

type KeadaanAkun = {
  profilAda: boolean;
  kunciProfil: string;
  penyedia: IdPenyedia;
  /** null = tidak bisa diperiksa (Postiz / upload-post tak terjangkau). */
  tertaut: boolean | null;
  perluLoginUlang: boolean;
};

/** Profil sosmed bot + keadaan akun tujuannya. Baris ganda = dianggap tidak ada (jangan menebak). */
async function keadaanAkun(db: Db, userId: number, platform: string | null): Promise<KeadaanAkun> {
  const { data, error } = await db
    .from("sosmed_profile")
    .select("profile_key, penyedia")
    .eq("jenis", "pengguna")
    .in("penyedia", PENYEDIA_ANGGOTA)
    .eq("user_id", userId);
  const baris = error ? [] : (data ?? []);
  if (baris.length !== 1 || !String(baris[0].profile_key ?? "")) {
    return { profilAda: false, kunciProfil: "", penyedia: "upload-post", tertaut: null, perluLoginUlang: false };
  }
  const kunciProfil = String(baris[0].profile_key);
  const penyedia: IdPenyedia = String(baris[0].penyedia) === "postiz" ? "postiz" : "upload-post";
  if (penyedia !== "upload-post" || platform === null || !uploadPostSiap()) {
    return { profilAda: true, kunciProfil, penyedia, tertaut: null, perluLoginUlang: false };
  }
  try {
    const st = await statusAkunUp(kunciProfil);
    return { profilAda: true, kunciProfil, penyedia, tertaut: Boolean(st.akun[platform]), perluLoginUlang: st.perluUlang.includes(platform) };
  } catch {
    return { profilAda: true, kunciProfil, penyedia, tertaut: null, perluLoginUlang: false };
  }
}

async function muatBot(db: Db, botId: number): Promise<BarisBotAcc | null> {
  const { data, error } = await db.from("bot_redaksi").select("id, user_id, nama, platform, aktif, jeda").eq("id", botId).maybeSingle();
  if (error) throw new GalatAcc("Gagal memuat bot.", 500);
  return (data ?? null) as unknown as BarisBotAcc | null;
}

const hookTampil = (h: string | null): string => String(h ?? "").trim();

// ---------------------------------------------------------------- baca

export async function bacaStatusAcc(sekarangMs: number = Date.now()): Promise<StatusAcc> {
  const db = supabase();
  const aktifPosting = postingAktif();
  const kosong: StatusAcc = { tabel_ada: false, posting_aktif: aktifPosting, antrean: [], riwayat: [] };

  const [rAntre, rRiwayat] = await Promise.all([
    db.from("bot_tugas").select(KOLOM_TUGAS).in("tahap", TAHAP_BISA_DIPUTUSKAN).order("id", { ascending: true }).limit(60),
    db.from("bot_tugas").select(KOLOM_TUGAS).not("keputusan", "is", null).order("keputusan_pada", { ascending: false }).limit(15),
  ]);
  for (const r of [rAntre, rRiwayat]) {
    if (r.error) {
      if (skemaBelumSiap(r.error)) return kosong;
      console.error("[bot-posting] baca antrean:", r.error.message);
      throw new GalatAcc("Gagal membaca antrean ACC.", 500);
    }
  }
  const antre = (rAntre.data ?? []) as unknown as BarisTugasAcc[];
  const riwayatBaris = (rRiwayat.data ?? []) as unknown as BarisTugasAcc[];

  const idBot = [...new Set([...antre, ...riwayatBaris].map((t) => Number(t.bot_id)))];
  const { data: botRows } = idBot.length
    ? await db.from("bot_redaksi").select("id, user_id, nama, platform, aktif, jeda").in("id", idBot)
    : { data: [] as unknown[] };
  const botPer = new Map(((botRows ?? []) as unknown as BarisBotAcc[]).map((b) => [Number(b.id), b]));

  const idKandidat = antre.map((t) => t.kandidat_id).filter((x): x is number => x != null);
  const { data: kandRows } = idKandidat.length ? await db.from("bot_kandidat").select("id, durasi_detik").in("id", idKandidat) : { data: [] as unknown[] };
  const durasiPer = new Map(((kandRows ?? []) as unknown as { id: number; durasi_detik: number | null }[]).map((k) => [Number(k.id), k.durasi_detik]));

  const akunPer = new Map<number, KeadaanAkun>();
  const antrean: ItemAccApi[] = [];
  for (const t of antre) {
    const bot = botPer.get(Number(t.bot_id));
    if (!bot) continue;
    const platform = kunciPlatform(bot.platform);
    if (!akunPer.has(bot.id)) akunPer.set(bot.id, await keadaanAkun(db, Number(bot.user_id), platform));
    const akun = akunPer.get(bot.id)!;
    const sumber = await sumberUntukTugas(Number(t.id), t.kandidat_id);
    const judul = String(t.judul ?? "").trim();
    const caption = String(t.caption_post ?? "").trim() || captionBawaan({ judul, sumberLabel: sumber?.label ?? "", platform: platform ?? "instagram" });
    const durasi = t.kandidat_id != null ? (durasiPer.get(Number(t.kandidat_id)) ?? null) : null;
    antrean.push({
      id: Number(t.id),
      bot_id: Number(bot.id),
      bot_nama: String(bot.nama ?? ""),
      judul,
      kategori: String(t.kategori ?? "NEWS"),
      hook: hookTampil(t.hook),
      sumber_label: sumber?.label ?? "",
      sumber_url: sumber?.url ?? "",
      platform: platform ?? "",
      platform_label: platform ? (LABEL_PLATFORM[platform] ?? platform) : String(bot.platform ?? ""),
      durasi_detik: durasi != null ? Number(durasi) : null,
      caption,
      jadwal_iso: jadwalPostingIso(sekarangMs),
      tahap: t.tahap,
      stok_ada: Boolean(t.id_stok_mesin),
      tanda: [
        ...(t.tahap === "disetujui" && t.galat ? [{ jenis: "bad" as const, teks: `Posting terakhir gagal: ${String(t.galat).slice(0, 140)}` }] : []),
        ...tandaPemeriksaan({
          caption,
          platform,
          akunTertaut: akun.profilAda ? akun.tertaut : false,
          perluLoginUlang: akun.perluLoginUlang,
          stokAda: Boolean(t.id_stok_mesin),
          durasiDetik: durasi != null ? Number(durasi) : null,
          postingAktif: aktifPosting,
        }),
      ],
    });
  }

  const riwayat: RiwayatAccApi[] = riwayatBaris.map((t) => {
    const hasil = (t.hasil_posting ?? {}) as Record<string, unknown>;
    const tahap = t.tahap;
    let catatan = "";
    if (tahap === "selesai") catatan = hasil.dibatalkan ? "Jadwal dibatalkan (berkas dihapus)" : "Terjadwal di sosmed";
    else if (tahap === "posting") catatan = postingMacet(t.diubah_pada, sekarangMs) ? "Macet di tengah posting — periksa akun sosmed" : "Sedang diposting…";
    else if (tahap === "gagal") catatan = String(t.galat ?? "").slice(0, 200);
    else if (tahap === "edit") catatan = "Diedit ulang oleh bot";
    else if (tahap === "disetujui") catatan = t.galat ? `Belum terkirim: ${String(t.galat).slice(0, 160)}` : "Disetujui";
    return {
      tugas_id: Number(t.id),
      judul: String(t.judul ?? ""),
      bot_nama: String(botPer.get(Number(t.bot_id))?.nama ?? ""),
      keputusan: (t.keputusan ?? "setuju") as RiwayatAccApi["keputusan"],
      tahap,
      catatan,
      jadwal_iso: t.jadwal,
      keputusan_pada: t.keputusan_pada,
      bisa_batal: tahap === "selesai" && !hasil.dibatalkan && (hasil.tvrku_post_id != null || Boolean(hasil.berkas)) && bolehBatalkanJadwal(t.jadwal, sekarangMs),
      perlu_diperiksa: tahap === "posting" && postingMacet(t.diubah_pada, sekarangMs),
    };
  });

  return { tabel_ada: true, posting_aktif: aktifPosting, antrean, riwayat };
}

// ---------------------------------------------------------------- keputusan

export type PelakuAcc = { id: number; nama: string };
export type KonteksAcc = { request?: Request; sekarangMs?: number };

async function muatTugas(db: Db, id: number): Promise<BarisTugasAcc> {
  const { data, error } = await db.from("bot_tugas").select(KOLOM_TUGAS).eq("id", id).maybeSingle();
  if (error) {
    if (skemaBelumSiap(error)) throw new GalatAcc("Migrasi 70 (posting bot) belum dijalankan.", 503);
    throw new GalatAcc("Gagal memuat tugas.", 500);
  }
  if (!data) throw new GalatAcc("Tugas tidak ditemukan.", 404);
  return data as unknown as BarisTugasAcc;
}

async function catatLog(db: Db, botId: number, tugasId: number, tahap: "edit" | "posting", teks: string): Promise<void> {
  const { error } = await db.from("bot_log").insert({ bot_id: botId, tugas_id: tugasId, tahap, teks: teks.slice(0, 500) });
  if (error) console.error("[bot-posting] catat log:", error.message);
  else siarkanBot("log");
}

/** Hasil keputusan untuk dikirim ke layar. */
export type HasilKeputusan = { ok: boolean; pesan: string };

export async function putuskanAcc(aksi: AksiAcc, pelaku: PelakuAcc, ktx: KonteksAcc = {}): Promise<HasilKeputusan> {
  const db = supabase();
  const sekarangMs = ktx.sekarangMs ?? Date.now();
  const tugas = await muatTugas(db, aksi.tugas_id);
  const bot = await muatBot(db, Number(tugas.bot_id));
  if (!bot) throw new GalatAcc("Bot tugas ini tidak ditemukan.", 404);
  const jejak = { keputusan_oleh: pelaku.id, keputusan_pada: iso(sekarangMs), diubah_pada: iso(sekarangMs) };

  if (aksi.aksi === "tolak" || aksi.aksi === "ulang") {
    const baru =
      aksi.aksi === "tolak"
        ? { tahap: "gagal", galat: "Ditolak master", selesai_pada: iso(sekarangMs), keputusan: "tolak", dikunci_sampai: null, ...jejak }
        : { tahap: "edit", id_job_mesin: null, id_stok_mesin: null, hook: null, percobaan: 0, galat: "", dikunci_sampai: null, keputusan: "ulang", ...jejak };
    const { data, error } = await db.from("bot_tugas").update(baru).eq("id", tugas.id).in("tahap", TAHAP_BISA_DIPUTUSKAN).select("id");
    if (error) throw new GalatAcc("Gagal menyimpan keputusan.", 500);
    if (!data?.length) throw new GalatAcc("Tugas ini sudah diputuskan atau tidak lagi menunggu.", 409);
    // Video Wajib yang ditolak dibuka lagi (baris pengambilan dihapus) supaya Pimred tidak kehilangan permintaannya.
    if (aksi.aksi === "tolak" && tugas.kandidat_id === null) {
      const { error: eWajib } = await db.from("bot_video_wajib").delete().eq("tugas_id", tugas.id);
      if (eWajib) console.error("[bot-posting] buka lagi Video Wajib:", eWajib.message);
    }
    await catatLog(db, bot.id, tugas.id, "edit", aksi.aksi === "tolak" ? `Ditolak ${pelaku.nama}: ${String(tugas.judul ?? "").slice(0, 100)}` : `${pelaku.nama} meminta edit ulang: ${String(tugas.judul ?? "").slice(0, 100)}`);
    catatAudit(Number(bot.user_id), "bot_acc", `${aksi.aksi === "tolak" ? "Menolak" : "Meminta edit ulang"} video bot ${bot.nama}: ${String(tugas.judul ?? "").slice(0, 80)}`, {
      request: ktx.request,
      detail: { tugas_id: tugas.id, oleh_id: pelaku.id, oleh_nama: pelaku.nama, keputusan: aksi.aksi },
    });
    siarkanBot("tugas");
    return { ok: true, pesan: aksi.aksi === "tolak" ? "Video ditolak." : "Bot akan mengedit ulang video ini." };
  }

  if (aksi.aksi === "batalkan_jadwal") return batalkanJadwal(db, tugas, bot, pelaku, ktx, sekarangMs);

  // ---- setuju ----
  const platform = kunciPlatform(bot.platform);
  const akun = await keadaanAkun(db, Number(bot.user_id), platform);
  const tolak = alasanTolakSetuju({
    postingAktif: postingAktif(),
    botAktif: bot.aktif !== false,
    botJeda: bot.jeda === true,
    jedaGlobal: await bacaJedaGlobal(),
    platform,
    profilAda: akun.profilAda,
    akunTertaut: akun.profilAda ? akun.tertaut : null,
    perluLoginUlang: akun.perluLoginUlang,
    stokAda: Boolean(tugas.id_stok_mesin),
    caption: aksi.caption,
  });
  if (tolak) throw new GalatAcc(tolak, tolak.includes("BOT_POSTING_AKTIF") ? 503 : 409);

  const { data, error } = await db
    .from("bot_tugas")
    .update({ tahap: "disetujui", caption_post: aksi.caption, keputusan: "setuju", galat: "", ...jejak })
    .eq("id", tugas.id)
    .in("tahap", TAHAP_BISA_DIPUTUSKAN)
    .select("id");
  if (error) throw new GalatAcc("Gagal menyimpan persetujuan.", 500);
  if (!data?.length) throw new GalatAcc("Tugas ini sudah diputuskan atau tidak lagi menunggu.", 409);
  catatAudit(Number(bot.user_id), "bot_acc", `Menyetujui video bot ${bot.nama}: ${String(tugas.judul ?? "").slice(0, 80)}`, {
    request: ktx.request,
    detail: { tugas_id: tugas.id, oleh_id: pelaku.id, oleh_nama: pelaku.nama, keputusan: "setuju", platform },
  });
  siarkanBot("tugas");
  return jalankanPosting(tugas.id, pelaku, ktx);
}

// ---------------------------------------------------------------- posting

/**
 * Tandai tugas `gagal` karena hasil posting TIDAK PASTI (mungkin sudah terkirim). Berkas video sengaja
 * dibiarkan dan dicatat di tvrku_post (dengan jadwal sapu) supaya penyapu media menghapusnya kelak.
 */
async function tandaiTidakPasti(
  db: Db,
  p: { tugasId: number; userId: number; judul: string; caption: string; platform: string; jadwal: string; salinan: { key: string; url: string; bytes: number; pakaiR2: boolean }; alasan: string },
): Promise<void> {
  const isi: Record<string, unknown> = {
    user_id: p.userId,
    judul: p.judul,
    caption: p.caption.slice(0, 2200),
    platforms: [p.platform],
    video_path: p.salinan.key,
    video_url: p.salinan.url,
    ukuran_byte: p.salinan.bytes,
    jadwal: p.jadwal,
    hasil: { ambigu: true, bot_tugas_id: p.tugasId },
    request_id: null,
    hapus_media_pada: iso(Date.parse(p.jadwal) + 2 * 3600_000),
  };
  const { error: eRiwayat } = await sisipkanLonggar("tvrku_post", isi);
  if (eRiwayat) console.error("[bot-posting] simpan riwayat (tidak pasti):", eRiwayat.message);
  await db
    .from("bot_tugas")
    .update({
      tahap: "gagal",
      galat: `Hasil posting tidak pasti (${p.alasan.slice(0, 120)}). Periksa akun sosmed bot sebelum mencoba lagi.`.slice(0, 300),
      selesai_pada: iso(Date.now()),
      jadwal: p.jadwal,
      hasil_posting: { ambigu: true, berkas: p.salinan.key, pakai_r2: p.salinan.pakaiR2 },
      diubah_pada: iso(Date.now()),
    })
    .eq("id", p.tugasId);
}

/**
 * Posting satu tugas berstatus `disetujui`. Mengklaim atomik (`disetujui` → `posting`);
 * tidak pernah mengulang sendiri. Mengembalikan hasil untuk layar.
 */
export async function jalankanPosting(tugasId: number, pelaku: PelakuAcc, ktx: KonteksAcc = {}): Promise<HasilKeputusan> {
  const db = supabase();
  const sekarangMs = ktx.sekarangMs ?? Date.now();
  if (!postingAktif()) throw new GalatAcc("Posting bot belum diaktifkan di server (BOT_POSTING_AKTIF).", 503);
  if (!uploadPostSiap()) throw new GalatAcc("upload-post belum diatur di server.", 503);

  const kunciProses = await ambilKunciUnggah(`bot-tugas:${tugasId}`, 6 * 60);
  if (!kunciProses) throw new GalatAcc("Video ini sedang/baru saja diposting. Cek Riwayat sebelum mengulang.", 409);

  let diKlaim = false;
  let kunciDilepas = false;
  /** true begitu upload-post MENJAWAB: sesudah ini, apa pun yang salah tidak boleh membuka jalan posting ulang. */
  let terkirim = false;
  let berkas: { key: string; pakaiR2: boolean } | null = null;
  try {
    // Klaim atomik: hanya satu proses yang lolos.
    const { data: klaim, error: eKlaim } = await db
      .from("bot_tugas")
      .update({ tahap: "posting", diubah_pada: iso(sekarangMs) })
      .eq("id", tugasId)
      .eq("tahap", "disetujui")
      .select(KOLOM_TUGAS);
    if (eKlaim) throw new GalatAcc("Gagal memulai posting.", 500);
    if (!klaim?.length) throw new GalatAcc("Tugas ini tidak sedang menunggu diposting.", 409);
    diKlaim = true;
    const tugas = klaim[0] as unknown as BarisTugasAcc;
    const bot = await muatBot(db, Number(tugas.bot_id));
    if (!bot) throw new GalatAcc("Bot tugas ini tidak ditemukan.", 404);
    const platform = kunciPlatform(bot.platform);
    if (!platform) throw new GalatAcc("Platform tujuan bot tidak dikenal.", 409);
    const akun = await keadaanAkun(db, Number(bot.user_id), platform);
    if (!akun.profilAda) throw new GalatAcc("Bot belum punya profil upload-post.", 409);
    if (!tugas.id_stok_mesin) throw new GalatAcc("Video belum tersedia di stok.", 409);
    const caption = String(tugas.caption_post ?? "").trim();
    const judul = String(tugas.judul ?? "").trim() || "Video";

    // 1. Salin video dari stok mesin ke penyimpanan (galat di sini = PASTI, belum ada yang terkirim).
    const key = kunciPenyimpanan(Number(bot.user_id));
    const salinan = await salinStokKePenyimpanan(String(bot.user_id), String(tugas.id_stok_mesin), key);
    berkas = { key: salinan.key, pakaiR2: salinan.pakaiR2 };

    // 2. Jadwal dihitung ULANG di sini (persetujuan bisa saja tertunda/diulang) lalu diserahkan ke upload-post.
    const jadwal = jadwalPostingIso(Date.now());
    let hasil: Awaited<ReturnType<typeof unggahVideoAnggota>>;
    try {
      hasil = await unggahVideoAnggota(akun.penyedia, {
        profil: akun.kunciProfil,
        videoUrl: salinan.url,
        judul,
        caption,
        platforms: [platform],
        scheduleDate: jadwal,
        // Persis teks yang disetujui master: tanpa ini upload-post menempelkan judul di depan caption
        // (judul dobel) dan batas karakter X/Threads bisa terlampaui.
        captionPer: { [platform]: caption },
      });
    } catch (e) {
      const status = (e as { status?: number } | null)?.status;
      if (klasifikasiGalatUnggah(status) === "ambigu") {
        // Mungkin sudah terkirim: JANGAN hapus berkas (upload-post bisa saja mengambilnya) dan jangan ulangi.
        terkirim = true;
        await kunciProses.lepas(3 * 60);
        kunciDilepas = true;
        await tandaiTidakPasti(db, { tugasId: tugas.id, userId: Number(bot.user_id), judul, caption, platform, jadwal, salinan, alasan: e instanceof Error ? e.message : "galat" });
        berkas = null;
        diKlaim = false;
        await catatLog(db, bot.id, tugas.id, "posting", `Posting ke ${LABEL_PLATFORM[platform]} tidak pasti — perlu diperiksa manual.`);
        siarkanBot("tugas");
        throw new GalatAcc("Hasil posting tidak pasti. Periksa akun sosmed bot dulu sebelum mencoba lagi.", 502);
      }
      throw e;
    }

    terkirim = true;

    // 2b. Balasan `success:false` TANPA rincian per platform dan tanpa request_id: tidak bisa dipastikan
    // apakah ada yang terkirim → perlakukan sebagai tidak pasti (jangan buka jalan ulang otomatis).
    if (!hasil.sukses && !hasil.request_id && hasil.gagalAwal.length === 0) {
      await kunciProses.lepas(3 * 60);
      kunciDilepas = true;
      await tandaiTidakPasti(db, { tugasId: tugas.id, userId: Number(bot.user_id), judul, caption, platform, jadwal, salinan, alasan: "penyedia membalas gagal tanpa rincian" });
      berkas = null;
      diKlaim = false;
      await catatLog(db, bot.id, tugas.id, "posting", `Balasan upload-post ke ${LABEL_PLATFORM[platform]} gagal tanpa rincian — perlu diperiksa manual.`);
      siarkanBot("tugas");
      throw new GalatAcc("upload-post membalas gagal tanpa rincian. Periksa akun sosmed bot dulu sebelum mencoba lagi.", 502);
    }

    // 3. Penyedia menyatakan gagal pada platform ini (balasan sinkron) = belum tayang, aman diulang.
    const gagalAwal = hasil.gagalAwal.find((g) => g.platform === platform);
    if (gagalAwal) {
      const { ringkas } = solusiGagal(gagalAwal.platform, gagalAwal.pesan);
      throw new GalatAcc(`${LABEL_SOSMED[platform] ?? platform} menolak: ${ringkas}`, 502);
    }

    // 4. Catat riwayat (bentuk sama dengan unggahan TVR Saya agar KPI otomatis bisa mencocokkan).
    const hapusPada = iso(Date.parse(jadwal) + 2 * 3600_000);
    const isi: Record<string, unknown> = {
      user_id: Number(bot.user_id),
      judul,
      caption: caption.slice(0, 2200),
      platforms: [platform],
      video_path: salinan.key,
      video_url: salinan.url,
      ukuran_byte: salinan.bytes,
      jadwal,
      hasil: { ...hasil.mentah, kategori: KATEGORI_POSTING_BOT, bot_tugas_id: tugas.id },
      request_id: hasil.request_id,
      hapus_media_pada: hapusPada,
    };
    if (await kolomTabelAda("tvrku_post", "keyword")) isi.keyword = KATEGORI_POSTING_BOT;
    if (await kolomTabelAda("tvrku_post", "penyedia")) isi.penyedia = akun.penyedia;
    const { data: baris, error: eRiwayat } = await sisipkanLonggar("tvrku_post", isi);
    if (eRiwayat) console.error("[bot-posting] simpan riwayat:", eRiwayat.message);

    const { error: eSelesai } = await db
      .from("bot_tugas")
      .update({
        tahap: "selesai",
        jadwal,
        galat: "",
        selesai_pada: iso(Date.now()),
        diubah_pada: iso(Date.now()),
        hasil_posting: { tvrku_post_id: baris?.id ?? null, request_id: hasil.request_id ?? null, platform, jadwal, berkas: salinan.key, pakai_r2: salinan.pakaiR2 },
      })
      .eq("id", tugas.id)
      .eq("tahap", "posting");
    if (eSelesai) console.error("[bot-posting] tandai selesai:", eSelesai.message);
    berkas = null; // berhasil: berkas dipakai upload-post, dihapus penyapu setelah tayang
    diKlaim = false;
    await kunciProses.lepas(90);
    kunciDilepas = true;

    await catatLog(db, bot.id, tugas.id, "posting", `Terjadwal tayang di ${LABEL_PLATFORM[platform]}: ${judul.slice(0, 100)}`);
    catatAudit(Number(bot.user_id), "bot_acc", `Memposting video bot ${bot.nama} ke ${LABEL_PLATFORM[platform]} (terjadwal)`, {
      request: ktx.request,
      detail: { tugas_id: tugas.id, oleh_id: pelaku.id, platform, jadwal, tvrku_post_id: baris?.id ?? null, request_id: hasil.request_id ?? null },
    });
    siarkanBot("tugas");
    return { ok: true, pesan: `Terjadwal tayang di ${LABEL_PLATFORM[platform]} pukul ${jamWib(jadwal)} WIB.` };
  } catch (e) {
    // Sudah dijawab upload-post tetapi ada yang salah sesudahnya (pencatatan, dsb.): postingan MUNGKIN ada.
    // Jangan buka jalan ulang; tandai untuk diperiksa manusia dan biarkan berkasnya.
    if (diKlaim && terkirim) {
      await db
        .from("bot_tugas")
        .update({ tahap: "gagal", galat: `Terkirim ke upload-post tetapi pencatatan gagal (${(e instanceof Error ? e.message : "galat").slice(0, 120)}). Periksa akun sosmed bot.`.slice(0, 300), selesai_pada: iso(Date.now()), hasil_posting: berkas ? { ambigu: true, berkas: berkas.key, pakai_r2: berkas.pakaiR2 } : { ambigu: true }, diubah_pada: iso(Date.now()) })
        .eq("id", tugasId)
        .eq("tahap", "posting");
      await kunciProses.lepas(3 * 60);
      kunciDilepas = true;
      berkas = null;
      diKlaim = false;
      siarkanBot("tugas");
    }
    // Galat PASTI (belum ada yang terkirim): kembalikan ke `disetujui` supaya master bisa mencoba lagi.
    if (diKlaim) {
      const pesan = e instanceof Error ? e.message : "Posting gagal.";
      await db.from("bot_tugas").update({ tahap: "disetujui", galat: pesan.slice(0, 300), diubah_pada: iso(Date.now()) }).eq("id", tugasId).eq("tahap", "posting");
      if (berkas) await hapusBerkasPenyimpanan(berkas.key, berkas.pakaiR2);
      siarkanBot("tugas");
    }
    // Kunci proses ditahan hanya pada jalur sukses/ambigu; selain itu dilepas agar "Coba lagi" langsung bisa.
    if (!kunciDilepas) await kunciProses.lepas(0);
    if (e instanceof GalatAcc) throw e;
    if (e instanceof GalatSalin) throw new GalatAcc(e.message, 502);
    const status = (e as { status?: number } | null)?.status;
    throw new GalatAcc(e instanceof Error ? e.message : "Posting gagal.", typeof status === "number" && status >= 400 && status < 600 ? status : 502);
  }
}

const jamWib = (isoStr: string): string => {
  const d = new Date(Date.parse(isoStr) + 7 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

// ---------------------------------------------------------------- batal jadwal

/**
 * Batalkan posting yang masih terjadwal dengan MENGHAPUS berkas videonya sebelum jam tayang
 * (upload-post tidak punya API pembatalan; ia mengunduh video saat menerbitkan). Bila penyedia
 * sudah mengunduhnya, postingan tetap tayang — layar menyebut batasan ini.
 */
async function batalkanJadwal(db: Db, tugas: BarisTugasAcc, bot: BarisBotAcc, pelaku: PelakuAcc, ktx: KonteksAcc, sekarangMs: number): Promise<HasilKeputusan> {
  const hasil = (tugas.hasil_posting ?? {}) as Record<string, unknown>;
  if (tugas.tahap !== "selesai" || hasil.dibatalkan || (hasil.tvrku_post_id == null && !hasil.berkas)) {
    throw new GalatAcc("Tidak ada jadwal yang bisa dibatalkan untuk tugas ini.", 409);
  }
  if (!bolehBatalkanJadwal(tugas.jadwal, sekarangMs)) throw new GalatAcc("Jadwal sudah terlalu dekat atau lewat — tidak bisa dibatalkan lagi.", 409);
  let postId: number | null = null;
  let key = String(hasil.berkas ?? "");
  let pakaiR2 = hasil.pakai_r2 === true;
  if (hasil.tvrku_post_id != null) {
    const { data: post, error } = await db.from("tvrku_post").select("id, video_path, video_url, hasil").eq("id", Number(hasil.tvrku_post_id)).maybeSingle();
    if (error || !post) throw new GalatAcc("Riwayat posting tidak ditemukan.", 404);
    postId = Number(post.id);
    key = String(post.video_path ?? "") || key;
    pakaiR2 = dariR2(String(post.video_url ?? ""));
    if (String(post.video_path ?? "") !== "") {
      await db
        .from("tvrku_post")
        .update({ video_path: "", hapus_media_pada: null, hasil: { ...((post.hasil as Record<string, unknown>) ?? {}), dibatalkan: true } })
        .eq("id", post.id);
    }
  }
  if (!key) throw new GalatAcc("Berkas video sudah tidak ada.", 409);
  await hapusBerkasPenyimpanan(key, pakaiR2);
  await db
    .from("bot_tugas")
    .update({ hasil_posting: { ...hasil, dibatalkan: true }, keputusan: "batal", keputusan_oleh: pelaku.id, keputusan_pada: iso(sekarangMs), diubah_pada: iso(sekarangMs) })
    .eq("id", tugas.id)
    .eq("tahap", "selesai");
  await catatLog(db, bot.id, tugas.id, "posting", `Jadwal dibatalkan oleh ${pelaku.nama} (berkas dihapus).`);
  catatAudit(Number(bot.user_id), "bot_acc", `Membatalkan jadwal posting bot ${bot.nama}`, {
    request: ktx.request,
    detail: { tugas_id: tugas.id, oleh_id: pelaku.id, tvrku_post_id: postId },
  });
  siarkanBot("tugas");
  return { ok: true, pesan: "Berkas video dihapus. Postingan tidak akan terbit bila belum diunduh penyedia." };
}

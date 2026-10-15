// ============================================================
// SIARAN KOORDINATOR KE AKUN ANGGOTA (15 Okt 2026) — KHUSUS SERVER.
//
// Ruang Bot → Koordinator → Siaran Anggota (master). Satu video disiarkan ke
// akun sosmed anggota yang tertaut di upload-post. Anggota menyetujui siaran
// koordinator saat mendaftar (keputusan pemilik), jadi tidak ada izin per
// anggota; yang dicek adalah KESIAPAN akun (tertaut, tidak perlu login ulang,
// batas harian).
//
// Dibangun di atas Siaran Serentak (lib/siaran.ts): satu baris induk
// tvr_siaran (sumber='koordinator') + satu item per akun dengan jadwal_kirim
// sendiri (bertahap). Pemroses yang sama mengirimnya, dipicu penjadwal tiap
// menit (/api/cron/siaran) dan layar pemantau.
//
// Logika murni & pagarnya: lib/siaran-koordinator-murni.ts.
// ============================================================
import { after } from "next/server";
import { createHash } from "node:crypto";
import { supabase } from "@/lib/supabase";
import { daftarProfilUp, uploadPostSiap, ambilKunciUnggah } from "@/lib/upload-post";
import { MAKS_UMUR_URL_DETIK, pastikanUkuranR2Wajar, presignR2, r2Siap } from "@/lib/r2";
import { GalatSalin, hapusBerkasPenyimpanan, kunciPenyimpanan, salinStokKePenyimpanan } from "@/lib/bot-stok-salin";
import { ID_TIM, mintaJsonMesin } from "@/lib/autoedit";
import { catatanPosting, kolomBelumAda, muatPerintah } from "@/lib/video-wajib-pantau";
import { tanggalWibWajib, wilayahAnggota } from "@/lib/video-wajib-perintah";
import { peranTersembunyi } from "@/lib/peran";
import { adalahBot } from "@/lib/struktur";
import { PLATFORM_KPI } from "@/lib/kpi-video";
import { koordinatorPunyaOtak, tanyaKoordinator } from "@/lib/bot-koordinator";
import { catatAudit } from "@/lib/audit";
import { prosesSiaranSerentak } from "@/lib/siaran";
import {
  KEBIJAKAN_SIARAN,
  SISTEM_VARIASI,
  adalahMode,
  adalahSumberVideo,
  bolehDiulang,
  jadwalKirim,
  jedaSah,
  konfirmasiSah,
  perluKonfirmasi,
  pilihVarian,
  promptVariasi,
  rapikanVariasi,
  ringkasItem,
  statusPenerima,
  uraiVariasi,
  variasiAman,
  type ModeSiaran,
  type RingkasItemSiaran,
  type StatusPenerima,
  type SumberVideoSiaran,
} from "@/lib/siaran-koordinator-murni";

/** Satu-satunya penyedia yang dipakai siaran (sesuai keputusan: upload-post). */
const PENYEDIA = "upload-post";
const BUCKET = "tvrku";
const UMUR_MEDIA_JAM = 2;
const ANGGARAN_PROSES_MS = 240_000;

export class GalatSiaran extends Error {
  constructor(
    pesan: string,
    public status: number,
  ) {
    super(pesan);
  }
}

function potong<T>(daftar: T[], ukuran: number): T[][] {
  const hasil: T[][] = [];
  for (let i = 0; i < daftar.length; i += ukuran) hasil.push(daftar.slice(i, i + ukuran));
  return hasil;
}

type Balasan<T> = PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>;

/** Baca semua baris per 1000 (batas PostgREST); MELEMPAR bila ada galat — data bolong tidak dipakai. */
async function semuaKetat<T>(buat: (dari: number, sampai: number) => Balasan<T>, maks = 20_000): Promise<T[]> {
  const semua: T[] = [];
  for (let dari = 0; dari < maks; dari += 1000) {
    const { data, error } = await buat(dari, dari + 999);
    if (error) throw new Error(`Gagal membaca data: ${error.message}`);
    semua.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return semua;
}

const awalHariWibIso = (ms: number): string => `${tanggalWibWajib(ms)}T00:00:00+07:00`;

// ------------------------------------------------------------
// Penerima
// ------------------------------------------------------------

export type PenerimaSiaran = {
  user_id: string;
  nama: string;
  username: string;
  wilayah: string;
  profil: string;
  platform: string[];
  platform_siap: string[];
  perlu_ulang: string[];
  status: StatusPenerima;
  siaran_hari_ini: number;
  /** Sudah memposting perintah Video Wajib terpilih hari ini (bila perintah disebut). */
  sudah_perintah: boolean;
};

type BarisProfil = { user_id: number | string | null; profile_key: string | null };
type BarisAnggota = {
  id: number | string;
  nama: string | null;
  username: string | null;
  role: string | null;
  status: string | null;
  aktif: boolean | null;
  divisi: string | null;
  sub_divisi: string | null;
  zona_id?: number | string | null;
};

/**
 * Hitung siaran koordinator per akun pada HARI TUJUAN (WIB; bawaan hari ini): dijadwalkan/terkirim,
 * bukan batal/gagal. Siaran terjadwal bisa dibuat sampai JADWAL_MAKS_HARI sebelumnya, jadi induk yang
 * dibaca mencakup rentang itu.
 */
async function siaranHariIniPer(userIds: number[], hariMs = Date.now()): Promise<Map<string, number>> {
  const hasil = new Map<string, number>();
  if (userIds.length === 0) return hasil;
  const db = supabase();
  const awal = awalHariWibIso(hariMs);
  const besok = awalHariWibIso(hariMs + 86_400_000);
  const { data: induk, error } = await db
    .from("tvr_siaran")
    .select("id")
    .eq("sumber", "koordinator")
    .neq("status", "dibatalkan")
    .gte("dibuat_pada", new Date(hariMs - (KEBIJAKAN_SIARAN.JADWAL_MAKS_HARI + 2) * 86_400_000).toISOString())
    .limit(1000);
  if (error) {
    if (kolomBelumAda(error)) return hasil; // sql/77 belum dijalankan: belum ada siaran koordinator
    throw new Error(`Gagal membaca siaran: ${error.message}`);
  }
  const ids = (induk ?? []).map((r) => Number(r.id));
  if (ids.length === 0) return hasil;
  for (const bagian of potong(ids, 200)) {
    const baris = await semuaKetat<{ user_id: number | string | null }>((dari, sampai) =>
      db
        .from("tvr_siaran_item")
        .select("user_id")
        .in("siaran_id", bagian)
        .in("status", ["menunggu", "diproses", "terkirim"])
        .gte("jadwal_kirim", awal)
        .lt("jadwal_kirim", besok)
        .order("id", { ascending: true })
        .range(dari, sampai) as unknown as Balasan<{ user_id: number | string | null }>,
    );
    for (const b of baris) {
      if (b.user_id == null) continue;
      const k = String(b.user_id);
      hasil.set(k, (hasil.get(k) ?? 0) + 1);
    }
  }
  return hasil;
}

/**
 * Semua anggota yang punya profil upload-post, beserta status kesiapannya.
 * Bukan master/superadmin/bot, dan hanya akun aktif.
 */
export async function daftarPenerima(opsi: { perintahId?: number | null; hariMs?: number } = {}): Promise<PenerimaSiaran[]> {
  if (!uploadPostSiap()) throw new GalatSiaran("upload-post belum tersambung (kunci API kosong).", 503);
  const db = supabase();
  const profil = await semuaKetat<BarisProfil>((dari, sampai) =>
    db
      .from("sosmed_profile")
      .select("user_id, profile_key")
      .eq("jenis", "pengguna")
      .eq("penyedia", PENYEDIA)
      .order("user_id", { ascending: true })
      .order("profile_key", { ascending: true })
      .range(dari, sampai) as unknown as Balasan<BarisProfil>,
  );
  const profilPer = new Map<string, string>();
  for (const p of profil) {
    if (p.user_id == null || !p.profile_key) continue;
    if (!profilPer.has(String(p.user_id))) profilPer.set(String(p.user_id), String(p.profile_key));
  }
  const ids = [...profilPer.keys()].map(Number).filter((n) => Number.isSafeInteger(n) && n > 0);

  const anggota = new Map<string, BarisAnggota>();
  let adaZona = true;
  for (const bagian of potong(ids, 300)) {
    let r = await db
      .from("app_user")
      .select("id, nama, username, role, status, aktif, divisi, sub_divisi, zona_id")
      .in("id", bagian);
    if (r.error && kolomBelumAda(r.error)) adaZona = false;
    if (!adaZona) r = (await db.from("app_user").select("id, nama, username, role, status, aktif, divisi, sub_divisi").in("id", bagian)) as typeof r;
    if (r.error) throw new Error(`Gagal membaca anggota: ${r.error.message}`);
    for (const u of (r.data ?? []) as unknown as BarisAnggota[]) anggota.set(String(u.id), u);
  }
  const zonaNama = new Map<string, string>();
  if (adaZona) {
    const { data } = await db.from("zona").select("id, nama");
    for (const z of (data ?? []) as { id: number | string; nama: string | null }[]) zonaNama.set(String(z.id), String(z.nama ?? ""));
  }

  const [{ profil: diUp }, hariIni] = await Promise.all([daftarProfilUp(), siaranHariIniPer(ids, opsi.hariMs ?? Date.now())]);
  const up = new Map(diUp.map((p) => [p.username, p]));

  let sudahPerintah = new Set<string>();
  if (opsi.perintahId) {
    const { catatan } = await catatanPosting(opsi.perintahId);
    const hari = tanggalWibWajib(Date.now());
    sudahPerintah = new Set(catatan.filter((c) => c.tanggal === hari).map((c) => c.user_id));
  }

  const hasil: PenerimaSiaran[] = [];
  for (const [id, key] of profilPer) {
    const u = anggota.get(id);
    if (!u || u.aktif !== true || u.status !== "aktif") continue;
    if (peranTersembunyi(u.role) || adalahBot(u)) continue;
    const p = up.get(key);
    const platform = Object.keys(p?.akun ?? {}).filter((x) => (PLATFORM_KPI as readonly string[]).includes(x));
    const perluUlang = (p?.perluUlang ?? []).filter((x) => platform.includes(x));
    const siaranHariIni = hariIni.get(id) ?? 0;
    const s = statusPenerima({ platform, perluUlang, siaranHariIni });
    hasil.push({
      user_id: id,
      nama: String(u.nama ?? "").trim() || `Anggota ${id}`,
      username: String(u.username ?? ""),
      wilayah: wilayahAnggota({
        zona: u.zona_id == null ? "" : (zonaNama.get(String(u.zona_id)) ?? ""),
        divisi: u.divisi,
        sub_divisi: u.sub_divisi,
      }),
      profil: key,
      platform,
      platform_siap: s.platformSiap,
      perlu_ulang: perluUlang,
      status: s.status,
      siaran_hari_ini: siaranHariIni,
      sudah_perintah: sudahPerintah.has(id),
    });
  }
  hasil.sort((a, b) => a.wilayah.localeCompare(b.wilayah, "id") || a.nama.localeCompare(b.nama, "id"));
  return hasil;
}

// ------------------------------------------------------------
// Sumber video
// ------------------------------------------------------------

export type PilihanVideo = {
  sumber: SumberVideoSiaran;
  id: string;
  judul: string;
  keterangan: string;
  kategori: string;
  perintah_id: string | null;
  ukuran: number | null;
  durasi: number | null;
  waktu: string | null;
};

type StokMesin = { id: string; judul?: string; tanggal?: number | null; durasi?: number | null; size?: number | null };

/** Pilihan video dari tiga sumber yang sudah ada di sistem (unggah baru lewat alur siapkan). */
export async function daftarSumberVideo(): Promise<{ acc: PilihanVideo[]; stok_tim: PilihanVideo[]; video_wajib: PilihanVideo[] }> {
  const db = supabase();
  const [acc, stok, wajib] = await Promise.all([
    (async (): Promise<PilihanVideo[]> => {
      const { data, error } = await db
        .from("bot_tugas")
        .select("id, bot_id, judul, kategori, tahap, id_stok_mesin, diubah_pada")
        .in("tahap", ["siap_ditinjau", "menunggu_acc", "disetujui", "selesai"])
        .not("id_stok_mesin", "is", null)
        .gte("diubah_pada", new Date(Date.now() - 2 * 86_400_000).toISOString())
        .order("diubah_pada", { ascending: false })
        .limit(30);
      if (error) return [];
      const LABEL: Record<string, string> = { siap_ditinjau: "Siap ditinjau", menunggu_acc: "Menunggu ACC", disetujui: "Disetujui", selesai: "Sudah diposting bot" };
      return (data ?? []).map((t) => ({
        sumber: "acc" as const,
        id: String(t.id),
        judul: String(t.judul ?? "") || `Tugas bot #${t.id}`,
        keterangan: `${LABEL[String(t.tahap)] ?? String(t.tahap)} · bot #${t.bot_id}`,
        kategori: String(t.kategori ?? ""),
        perintah_id: null,
        ukuran: null,
        durasi: null,
        waktu: t.diubah_pada ? String(t.diubah_pada) : null,
      }));
    })(),
    (async (): Promise<PilihanVideo[]> => {
      try {
        const d = await mintaJsonMesin<{ stok?: StokMesin[] }>("/api/tvr/ringkas", ID_TIM.tv!, 20_000);
        return (d.stok ?? []).slice(0, 40).map((s) => ({
          sumber: "stok_tim" as const,
          id: String(s.id),
          judul: String(s.judul ?? "") || "Video stok tim",
          keterangan: "Stok Video tim TV Rakyat Official (48 jam)",
          kategori: "",
          perintah_id: null,
          ukuran: s.size ?? null,
          durasi: s.durasi ?? null,
          waktu: s.tanggal ? new Date(Number(s.tanggal) * 1000).toISOString() : null,
        }));
      } catch {
        return [];
      }
    })(),
    (async (): Promise<PilihanVideo[]> => {
      const { data, error } = await db
        .from("tvr_video_wajib")
        .select("id, judul, kategori, berkas_key, berkas_ukuran, dibuat_pada")
        .eq("aktif", true)
        .neq("berkas_key", "")
        .order("dibuat_pada", { ascending: false })
        .limit(20);
      if (error) return [];
      return (data ?? []).map((v) => ({
        sumber: "video_wajib" as const,
        id: String(v.id),
        judul: String(v.judul ?? ""),
        keterangan: `Bahan Video Wajib #${v.id}${v.kategori ? ` · ${v.kategori}` : ""}`,
        kategori: String(v.kategori ?? ""),
        perintah_id: String(v.id),
        ukuran: Number(v.berkas_ukuran ?? 0) || null,
        durasi: null,
        waktu: v.dibuat_pada ? String(v.dibuat_pada) : null,
      }));
    })(),
  ]);
  return { acc, stok_tim: stok, video_wajib: wajib };
}

type VideoSiap = {
  /** Kunci penyimpanan MILIK siaran (dihapus penyapu); "" = bukan milik siaran (bahan Video Wajib). */
  video_path: string;
  video_url: string;
  pakaiR2: boolean;
  ukuran: number | null;
  kategori: string;
  perintah_id: number | null;
};

type MasukanVideo = { sumber: SumberVideoSiaran; id?: string; r2_key?: string; path?: string; ukuran?: number };

/** Siapkan berkas video + tautan bertanda tangan (7 hari) untuk upload-post. */
async function siapkanVideo(userId: number, m: MasukanVideo): Promise<VideoSiap> {
  const db = supabase();
  if (m.sumber === "unggah") {
    const r2Key = String(m.r2_key ?? "").trim();
    const path = String(m.path ?? "").trim();
    const kunci = r2Key || path;
    if (!kunci || !kunci.startsWith(`${userId}/`) || !/^[\w./-]+$/.test(kunci) || kunci.includes("..")) {
      throw new GalatSiaran("Berkas video tidak dikenal. Unggah ulang videonya.", 400);
    }
    if (r2Key) {
      if (!r2Siap()) throw new GalatSiaran("Penyimpanan video (R2) belum diatur.", 503);
      await pastikanUkuranR2Wajar(r2Key);
      return { video_path: r2Key, video_url: presignR2("GET", r2Key, MAKS_UMUR_URL_DETIK), pakaiR2: true, ukuran: Number(m.ukuran) || null, kategori: "", perintah_id: null };
    }
    const url = (await db.storage.from(BUCKET).createSignedUrl(path, MAKS_UMUR_URL_DETIK)).data?.signedUrl ?? "";
    if (!url) throw new GalatSiaran("Gagal menyiapkan tautan video.", 500);
    return { video_path: path, video_url: url, pakaiR2: false, ukuran: Number(m.ukuran) || null, kategori: "", perintah_id: null };
  }

  const id = String(m.id ?? "").trim();
  if (!id) throw new GalatSiaran("Pilih videonya dulu.", 400);

  if (m.sumber === "video_wajib") {
    const n = Number(id);
    if (!Number.isSafeInteger(n) || n <= 0) throw new GalatSiaran("Video Wajib tidak dikenal.", 400);
    const { data, error } = await db
      .from("tvr_video_wajib")
      .select("id, kategori, aktif, berkas_cara, berkas_key, berkas_ukuran")
      .eq("id", n)
      .maybeSingle();
    if (error || !data) throw new GalatSiaran("Video Wajib tidak ditemukan.", 404);
    if (data.aktif !== true) throw new GalatSiaran("Perintah Video Wajib ini sudah dimatikan.", 409);
    const key = String(data.berkas_key ?? "");
    if (!key) throw new GalatSiaran("Perintah ini tidak punya berkas bahan.", 409);
    let url = "";
    if (data.berkas_cara === "r2") {
      if (!r2Siap()) throw new GalatSiaran("Penyimpanan video (R2) belum diatur.", 503);
      url = presignR2("GET", key, MAKS_UMUR_URL_DETIK);
    } else {
      url = (await db.storage.from(BUCKET).createSignedUrl(key, MAKS_UMUR_URL_DETIK)).data?.signedUrl ?? "";
    }
    if (!url) throw new GalatSiaran("Gagal menyiapkan tautan video bahan.", 500);
    // Bahan milik perintah: siaran TIDAK boleh menghapusnya (video_path kosong).
    return { video_path: "", video_url: url, pakaiR2: data.berkas_cara === "r2", ukuran: Number(data.berkas_ukuran ?? 0) || null, kategori: String(data.kategori ?? ""), perintah_id: n };
  }

  // acc / stok_tim: salin dari Stok mesin ke penyimpanan milik siaran.
  let idAkunMesin = "";
  let stokId = "";
  if (m.sumber === "acc") {
    const n = Number(id);
    if (!Number.isSafeInteger(n) || n <= 0) throw new GalatSiaran("Tugas bot tidak dikenal.", 400);
    const { data: t, error } = await db.from("bot_tugas").select("id, bot_id, tahap, id_stok_mesin, kategori").eq("id", n).maybeSingle();
    if (error || !t) throw new GalatSiaran("Tugas bot tidak ditemukan.", 404);
    if (!t.id_stok_mesin) throw new GalatSiaran("Video tugas ini belum ada di stok.", 409);
    if (t.tahap === "gagal") throw new GalatSiaran("Tugas ini gagal; pilih video lain.", 409);
    const { data: bot } = await db.from("bot_redaksi").select("user_id").eq("id", Number(t.bot_id)).maybeSingle();
    if (!bot?.user_id) throw new GalatSiaran("Akun bot tugas ini tidak ditemukan.", 404);
    idAkunMesin = String(bot.user_id);
    stokId = String(t.id_stok_mesin);
  } else {
    idAkunMesin = ID_TIM.tv!;
    stokId = id;
  }
  const key = kunciPenyimpanan(userId);
  try {
    const s = await salinStokKePenyimpanan(idAkunMesin, stokId, key);
    return { video_path: s.key, video_url: s.url, pakaiR2: s.pakaiR2, ukuran: s.bytes, kategori: "", perintah_id: null };
  } catch (e) {
    if (e instanceof GalatSalin) throw new GalatSiaran(e.message, 409);
    throw e;
  }
}

// ------------------------------------------------------------
// Buat siaran
// ------------------------------------------------------------

/** Jendela tolak siaran ganda (video yang sama ke akun yang sama). */
const JENDELA_GANDA_MS = 6 * 3600_000;

/**
 * Tolak bila video yang sama (sumber + id) sudah disiarkan ke SALAH SATU akun yang sama dalam
 * JENDELA_GANDA_MS (siaran yang tidak dibatalkan; item yang belum batal/gagal). Akun berbeda boleh.
 */
async function tolakSiaranGanda(sumberVideo: SumberVideoSiaran, sumberId: string, idPenerima: number[]): Promise<void> {
  if (!sumberId) return;
  const db = supabase();
  const { data: induk, error } = await db
    .from("tvr_siaran")
    .select("id")
    .eq("sumber", "koordinator")
    .eq("sumber_video", sumberVideo)
    .eq("sumber_id", sumberId)
    .neq("status", "dibatalkan")
    .gte("dibuat_pada", new Date(Date.now() - JENDELA_GANDA_MS).toISOString())
    .limit(50);
  if (error) {
    if (kolomBelumAda(error)) throw new GalatSiaran("Fitur siaran koordinator belum aktif di database: jalankan sql/77_siaran_koordinator.sql dulu.", 503);
    throw new GalatSiaran("Gagal memeriksa siaran sebelumnya.", 500);
  }
  const ids = (induk ?? []).map((r) => Number(r.id));
  if (ids.length === 0) return;
  const target = new Set(idPenerima);
  for (const bagian of potong(ids, 50)) {
    const item = await semuaKetat<{ user_id: number | string | null }>((dari, sampai) =>
      db
        .from("tvr_siaran_item")
        .select("user_id")
        .in("siaran_id", bagian)
        .in("status", ["menunggu", "diproses", "terkirim"])
        .order("id", { ascending: true })
        .range(dari, sampai) as unknown as Balasan<{ user_id: number | string | null }>,
    );
    const sama = item.filter((i) => i.user_id != null && target.has(Number(i.user_id))).length;
    if (sama > 0) {
      throw new GalatSiaran(`Video ini sudah disiarkan ke ${sama} akun yang sama dalam 6 jam terakhir. Keluarkan akun itu dari pilihan atau pilih video lain.`, 409);
    }
  }
}

export type MasukanSiaran = {
  video: MasukanVideo;
  judul?: string;
  caption?: string;
  variasi?: unknown;
  platforms?: string[];
  penerima?: (string | number)[];
  mode?: string;
  jeda_detik?: number;
  mulai?: string;
  konfirmasi?: string;
  tampil_ruang?: boolean;
  perintah_id?: string | number | null;
};

export async function buatSiaranKoordinator(
  user: { id: string | number },
  b: MasukanSiaran,
  request?: Request,
): Promise<{ id: string; jumlah: number; dilewati: number; mulai: string; selesai: string | null }> {
  if (!uploadPostSiap()) throw new GalatSiaran("upload-post belum tersambung (kunci API kosong).", 503);
  const uid = Number(user.id);

  // ---- Validasi isian ----
  const sumberVideo = b.video?.sumber;
  if (!adalahSumberVideo(sumberVideo)) throw new GalatSiaran("Sumber video tidak dikenal.", 400);
  const judul = String(b.judul ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  if (judul.length < 3) throw new GalatSiaran("Judul video minimal 3 huruf.", 400);
  const caption = String(b.caption ?? "").trim().slice(0, KEBIJAKAN_SIARAN.CAPTION_MAKS);
  const variasi = rapikanVariasi(b.variasi).filter((v) => !caption || variasiAman(caption, v));
  const platformsDiminta = [...new Set((b.platforms ?? []).map((p) => String(p).toLowerCase()))].filter((p) =>
    (PLATFORM_KPI as readonly string[]).includes(p),
  );
  if (platformsDiminta.length === 0) throw new GalatSiaran("Pilih minimal satu platform.", 400);
  const mode: ModeSiaran = adalahMode(b.mode) ? b.mode : "bertahap";
  const jeda = mode === "serentak" ? 0 : jedaSah(b.jeda_detik);
  const idDiminta = [...new Set((b.penerima ?? []).map((x) => String(x).trim()).filter((x) => /^\d{1,12}$/.test(x)))];
  if (idDiminta.length === 0) throw new GalatSiaran("Pilih minimal satu akun penerima.", 400);
  if (idDiminta.length > KEBIJAKAN_SIARAN.MAKS_PENERIMA) {
    throw new GalatSiaran(`Maksimal ${KEBIJAKAN_SIARAN.MAKS_PENERIMA} akun per siaran.`, 400);
  }

  let mulaiMs = Date.now() + 15_000;
  if (mode === "terjadwal") {
    const t = Date.parse(String(b.mulai ?? ""));
    if (!Number.isFinite(t) || t < Date.now() + KEBIJAKAN_SIARAN.JADWAL_MIN_MENIT * 60_000 - 30_000) {
      throw new GalatSiaran(`Waktu mulai minimal ${KEBIJAKAN_SIARAN.JADWAL_MIN_MENIT} menit dari sekarang.`, 400);
    }
    if (t > Date.now() + KEBIJAKAN_SIARAN.JADWAL_MAKS_HARI * 86_400_000) {
      throw new GalatSiaran(`Waktu mulai maksimal ${KEBIJAKAN_SIARAN.JADWAL_MAKS_HARI} hari ke depan.`, 400);
    }
    mulaiMs = t;
  }

  // Perintah Video Wajib (opsional): kategori & nomor perintah ikut ke riwayat anggota.
  let perintahId: number | null = null;
  let kategori = "";
  const perintahMentah = Number(b.perintah_id ?? 0);
  if (Number.isSafeInteger(perintahMentah) && perintahMentah > 0) {
    const p = await muatPerintah(perintahMentah);
    if (!p || !p.aktif) throw new GalatSiaran("Perintah Video Wajib itu tidak aktif.", 409);
    perintahId = Number(p.id);
    kategori = p.kategori;
  }
  if (sumberVideo === "video_wajib" && !perintahId) {
    perintahId = Number(b.video.id) || null;
  }

  // ---- Penerima: dihitung ulang di server, hanya yang SIAP ----
  // Batas harian dihitung pada hari siaran DIMULAI (mode terjadwal bisa beberapa hari ke depan).
  const semua = await daftarPenerima({ perintahId, hariMs: mulaiMs });
  const per = new Map(semua.map((p) => [p.user_id, p]));
  const dipilih: { p: PenerimaSiaran; platforms: string[] }[] = [];
  for (const id of idDiminta) {
    const p = per.get(id);
    if (!p || p.status !== "siap") continue;
    const platforms = platformsDiminta.filter((x) => p.platform_siap.includes(x));
    if (platforms.length > 0) dipilih.push({ p, platforms });
  }
  const dilewati = idDiminta.length - dipilih.length;
  if (dipilih.length === 0) throw new GalatSiaran("Tidak ada akun penerima yang siap untuk platform terpilih.", 400);
  if (perluKonfirmasi(dipilih.length) && !konfirmasiSah(b.konfirmasi)) {
    throw new GalatSiaran(`Siaran ke ${dipilih.length} akun wajib dikonfirmasi dengan mengetik SIARKAN.`, 400);
  }

  // ---- Cegah siaran ganda: video yang sama ke akun yang sama ----
  const sumberId = String(sumberVideo === "unggah" ? (b.video.r2_key ?? b.video.path ?? "") : (b.video.id ?? "")).slice(0, 300);
  const idPenerima = dipilih.map((d) => Number(d.p.user_id)).sort((a, z) => a - z);
  const sidik = createHash("sha1").update(`${uid}|${sumberVideo}|${sumberId}|${idPenerima.join(",")}`).digest("hex");
  // Kunci proses (klik ganda / ulang peramban) bertahan lebih lama dari penyalinan stok terlama (maxDuration 300).
  const kunci = await ambilKunciUnggah(`siaran-koor:${sidik}`, 420);
  if (!kunci) throw new GalatSiaran("Siaran video ini sedang dibuat. Tunggu sebentar lalu cek Riwayat Siaran.", 409);
  try {
    await tolakSiaranGanda(sumberVideo, sumberId, idPenerima);
  } catch (e) {
    await kunci.lepas(0);
    throw e;
  }
  let video: VideoSiap | null = null;
  let berhasil = false;
  try {
    video = await siapkanVideo(uid, b.video);
    if (!perintahId && video.perintah_id) perintahId = video.perintah_id;
    if (!kategori) kategori = video.kategori || (perintahId ? ((await muatPerintah(perintahId))?.kategori ?? "") : "");

    const jadwal = jadwalKirim({ jumlah: dipilih.length, mode, mulaiMs, jedaDetik: jeda, benih: (Date.now() ^ uid) >>> 0 });
    const selesaiMs = jadwal[jadwal.length - 1]!;
    const db = supabase();
    const { data: induk, error } = await db
      .from("tvr_siaran")
      .insert({
        dibuat_oleh: uid,
        judul,
        caption,
        platforms: platformsDiminta,
        video_path: video.video_path,
        video_url: video.video_url,
        ukuran_byte: video.ukuran,
        jadwal: null,
        hapus_media_pada: video.video_path ? new Date(selesaiMs + UMUR_MEDIA_JAM * 3600_000).toISOString() : null,
        sumber: "koordinator",
        sumber_video: sumberVideo,
        sumber_id: sumberId,
        mode,
        jeda_detik: jeda,
        kategori,
        perintah_id: perintahId,
        tampil_ruang: b.tampil_ruang !== false,
        dijeda: false,
      })
      .select("id")
      .single();
    if (error || !induk) {
      if (kolomBelumAda(error)) {
        throw new GalatSiaran("Fitur siaran koordinator belum aktif di database: jalankan sql/77_siaran_koordinator.sql dulu.", 503);
      }
      console.error("[siaran-koor] simpan induk:", error?.message);
      throw new GalatSiaran("Gagal menyimpan siaran.", 500);
    }

    const item = dipilih.map(({ p, platforms }, i) => {
      const v = pilihVarian(i, variasi.length);
      return {
        siaran_id: Number(induk.id),
        profil: p.profil,
        user_id: Number(p.user_id),
        platforms,
        status: "menunggu",
        pesan: "",
        jadwal_kirim: new Date(jadwal[i]!).toISOString(),
        caption: v === null ? null : variasi[v]!,
        varian: v,
      };
    });
    for (const bagian of potong(item, 500)) {
      const { error: eItem } = await db.from("tvr_siaran_item").insert(bagian);
      if (eItem) {
        console.error("[siaran-koor] simpan item:", eItem.message);
        // Induk tanpa item lengkap tidak boleh berjalan setengah: batalkan semuanya.
        await db.from("tvr_siaran_item").update({ status: "dibatalkan", selesai_pada: new Date().toISOString() }).eq("siaran_id", Number(induk.id)).eq("status", "menunggu");
        await db.from("tvr_siaran").update({ status: "dibatalkan" }).eq("id", Number(induk.id));
        throw new GalatSiaran("Gagal menyimpan daftar akun penerima.", 500);
      }
    }

    berhasil = true;
    catatAudit(user.id, "siaran", `Siaran koordinator "${judul}" ke ${item.length} akun anggota`, {
      request,
      detail: {
        siaran_id: Number(induk.id),
        judul,
        sumber_video: sumberVideo,
        platforms: platformsDiminta,
        jumlah_akun: item.length,
        dilewati,
        mode,
        jeda_detik: jeda,
        perintah_id: perintahId,
        mulai: new Date(jadwal[0]!).toISOString(),
      },
    });
    after(() => prosesSiaranSerentak(ANGGARAN_PROSES_MS));
    return {
      id: String(induk.id),
      jumlah: item.length,
      dilewati,
      mulai: new Date(jadwal[0]!).toISOString(),
      selesai: new Date(selesaiMs).toISOString(),
    };
  } finally {
    if (!berhasil && video?.video_path) await hapusBerkasPenyimpanan(video.video_path, video.pakaiR2);
    await kunci.lepas(berhasil ? 60 : 0);
  }
}

// ------------------------------------------------------------
// Kendali siaran
// ------------------------------------------------------------

export type AksiSiaran = "jeda" | "lanjut" | "batal" | "ulang_gagal";

/**
 * Berkas milik siaran baru boleh disapu 2 jam setelah giliran TERAKHIR yang dijadwal ulang.
 * (Penyapu juga melewati siaran yang masih punya item menunggu — lihat bersihkanMediaSiaran.)
 */
async function perpanjangMedia(id: number, giliran: number[]): Promise<void> {
  if (giliran.length === 0) return;
  const sampai = new Date(Math.max(...giliran) + UMUR_MEDIA_JAM * 3600_000).toISOString();
  await supabase()
    .from("tvr_siaran")
    .update({ hapus_media_pada: sampai })
    .eq("id", id)
    .neq("video_path", "")
    .lt("hapus_media_pada", sampai);
}

export async function kendaliSiaran(user: { id: string | number }, id: number, aksi: AksiSiaran, request?: Request): Promise<{ ok: true; pesan: string }> {
  const db = supabase();
  const { data: s, error } = await db.from("tvr_siaran").select("id, judul, status, sumber, mode, jeda_detik, dijeda").eq("id", id).maybeSingle();
  const modeSiaran: ModeSiaran = adalahMode(s?.mode) ? (s!.mode as ModeSiaran) : "bertahap";
  /** Giliran baru untuk n item mulai sekarang: jeda & jam tenang sama dengan saat siaran dibuat. */
  const giliranBaru = (n: number) =>
    jadwalKirim({ jumlah: n, mode: modeSiaran, mulaiMs: Date.now() + 10_000, jedaDetik: Number(s?.jeda_detik ?? KEBIJAKAN_SIARAN.JEDA_BAWAAN), benih: (Date.now() ^ id) >>> 0 });
  if (error) {
    if (kolomBelumAda(error)) throw new GalatSiaran("Jalankan sql/77_siaran_koordinator.sql dulu.", 503);
    throw new GalatSiaran("Gagal membaca siaran.", 500);
  }
  if (!s || s.sumber !== "koordinator") throw new GalatSiaran("Siaran tidak ditemukan.", 404);
  const kini = new Date().toISOString();
  let pesan = "";

  if (aksi === "jeda" || aksi === "lanjut") {
    if (s.status === "dibatalkan" || s.status === "selesai") throw new GalatSiaran("Siaran ini sudah berakhir.", 409);
    if (aksi === "jeda") {
      await db.from("tvr_siaran").update({ dijeda: true }).eq("id", id);
    } else {
      // Giliran yang terlewat selama dijeda dijadwal ulang DULU (mulai sekarang, jeda & jam tenang
      // yang sama), baru jeda dilepas — supaya penjadwal tidak mengirim semuanya sekaligus di sela.
      const { data: lewat } = await db
        .from("tvr_siaran_item")
        .select("id")
        .eq("siaran_id", id)
        .eq("status", "menunggu")
        .lt("jadwal_kirim", kini)
        .order("jadwal_kirim", { ascending: true })
        .limit(KEBIJAKAN_SIARAN.MAKS_PENERIMA);
      const giliran = giliranBaru((lewat ?? []).length);
      for (const [i, it] of (lewat ?? []).entries()) {
        await db.from("tvr_siaran_item").update({ jadwal_kirim: new Date(giliran[i]!).toISOString() }).eq("id", it.id).eq("status", "menunggu");
      }
      await db.from("tvr_siaran").update({ dijeda: false }).eq("id", id);
      await perpanjangMedia(id, giliran);
    }
    pesan = aksi === "jeda" ? "Siaran dijeda. Yang sedang dikirim tetap selesai." : "Siaran dilanjutkan.";
  } else if (aksi === "batal") {
    const { data: batal } = await db
      .from("tvr_siaran_item")
      .update({ status: "dibatalkan", selesai_pada: kini })
      .eq("siaran_id", id)
      .eq("status", "menunggu")
      .select("id");
    await db.from("tvr_siaran").update({ status: "dibatalkan", dijeda: false }).eq("id", id);
    pesan = `${batal?.length ?? 0} akun yang belum terkirim dibatalkan.`;
  } else {
    if (s.status === "dibatalkan") throw new GalatSiaran("Siaran ini sudah dibatalkan.", 409);
    const { data: gagal } = await db
      .from("tvr_siaran_item")
      .select("id, status, pesan, hasil")
      .eq("siaran_id", id)
      .eq("status", "gagal")
      .limit(KEBIJAKAN_SIARAN.MAKS_PENERIMA);
    const boleh = (gagal ?? []).filter((g) => bolehDiulang({ status: String(g.status), pesan: g.pesan as string | null, hasil: g.hasil as Record<string, unknown> | null }));
    const giliran = giliranBaru(boleh.length);
    await perpanjangMedia(id, giliran);
    let n = 0;
    for (const [i, g] of boleh.entries()) {
      const { data: ok } = await db
        .from("tvr_siaran_item")
        .update({ status: "menunggu", pesan: "", hasil: null, request_id: null, diproses_pada: null, selesai_pada: null, jadwal_kirim: new Date(giliran[i]!).toISOString() })
        .eq("id", g.id)
        .eq("status", "gagal")
        .select("id");
      n += ok?.length ?? 0;
    }
    if (n > 0) await db.from("tvr_siaran").update({ status: "berjalan" }).eq("id", id).neq("status", "dibatalkan");
    const ambigu = (gagal ?? []).length - boleh.length;
    pesan = `${n} akun dikirim ulang.${ambigu > 0 ? ` ${ambigu} tidak diulang karena mungkin sudah terposting — periksa manual.` : ""}`;
    if (n > 0) after(() => prosesSiaranSerentak(ANGGARAN_PROSES_MS));
  }
  catatAudit(user.id, "siaran", `Siaran koordinator #${id}: ${aksi}`, { request, detail: { siaran_id: id, aksi, pesan } });
  return { ok: true, pesan };
}

// ------------------------------------------------------------
// Riwayat (master) & siaran saya (anggota)
// ------------------------------------------------------------

export type ItemRiwayat = {
  id: string;
  user_id: string | null;
  nama: string;
  platforms: string[];
  status: string;
  pesan: string;
  jadwal_kirim: string | null;
  selesai_pada: string | null;
  varian: number | null;
  boleh_ulang: boolean;
};

export type SiaranRiwayat = {
  id: string;
  judul: string;
  caption: string;
  platforms: string[];
  status: string;
  dijeda: boolean;
  mode: string;
  jeda_detik: number;
  kategori: string;
  perintah_id: string | null;
  sumber_video: string;
  tampil_ruang: boolean;
  dibuat_pada: string;
  berikutnya: string | null;
  ringkas: RingkasItemSiaran;
  item: ItemRiwayat[];
};

export async function riwayatSiaranKoordinator(batas = 15): Promise<SiaranRiwayat[]> {
  const db = supabase();
  const { data: induk, error } = await db
    .from("tvr_siaran")
    .select("id, judul, caption, platforms, status, dijeda, mode, jeda_detik, kategori, perintah_id, sumber_video, tampil_ruang, dibuat_pada")
    .eq("sumber", "koordinator")
    .order("id", { ascending: false })
    .limit(Math.max(1, Math.min(50, batas)));
  if (error) {
    if (kolomBelumAda(error)) return [];
    throw new GalatSiaran("Gagal memuat riwayat siaran.", 500);
  }
  const ids = (induk ?? []).map((s) => Number(s.id));
  if (ids.length === 0) return [];
  const item = await semuaKetat<Record<string, unknown>>((dari, sampai) =>
    db
      .from("tvr_siaran_item")
      .select("id, siaran_id, user_id, platforms, status, pesan, hasil, jadwal_kirim, selesai_pada, varian")
      .in("siaran_id", ids)
      .order("jadwal_kirim", { ascending: true })
      .order("id", { ascending: true })
      .range(dari, sampai) as unknown as Balasan<Record<string, unknown>>,
  );
  const userIds = [...new Set(item.map((i) => i.user_id).filter((x) => x != null).map(Number))];
  const nama = new Map<number, string>();
  for (const bagian of potong(userIds, 300)) {
    const { data } = await db.from("app_user").select("id, nama").in("id", bagian);
    for (const u of data ?? []) nama.set(Number(u.id), String(u.nama ?? ""));
  }
  const per = new Map<number, ItemRiwayat[]>();
  for (const i of item) {
    const arr = per.get(Number(i.siaran_id)) ?? [];
    arr.push({
      id: String(i.id),
      user_id: i.user_id == null ? null : String(i.user_id),
      nama: i.user_id == null ? "" : (nama.get(Number(i.user_id)) ?? ""),
      platforms: Array.isArray(i.platforms) ? (i.platforms as unknown[]).map(String) : [],
      status: String(i.status ?? ""),
      pesan: String(i.pesan ?? ""),
      jadwal_kirim: i.jadwal_kirim ? String(i.jadwal_kirim) : null,
      selesai_pada: i.selesai_pada ? String(i.selesai_pada) : null,
      varian: i.varian == null ? null : Number(i.varian),
      boleh_ulang: bolehDiulang({ status: String(i.status ?? ""), pesan: (i.pesan as string | null) ?? null, hasil: (i.hasil as Record<string, unknown> | null) ?? null }),
    });
    per.set(Number(i.siaran_id), arr);
  }
  return (induk ?? []).map((s) => {
    const daftar = per.get(Number(s.id)) ?? [];
    const berikutnya = daftar.find((d) => d.status === "menunggu")?.jadwal_kirim ?? null;
    return {
      id: String(s.id),
      judul: String(s.judul ?? ""),
      caption: String(s.caption ?? ""),
      platforms: Array.isArray(s.platforms) ? (s.platforms as unknown[]).map(String) : [],
      status: String(s.status ?? ""),
      dijeda: s.dijeda === true,
      mode: String(s.mode ?? ""),
      jeda_detik: Number(s.jeda_detik ?? 0),
      kategori: String(s.kategori ?? ""),
      perintah_id: s.perintah_id == null ? null : String(s.perintah_id),
      sumber_video: String(s.sumber_video ?? ""),
      tampil_ruang: s.tampil_ruang === true,
      dibuat_pada: String(s.dibuat_pada ?? ""),
      berikutnya: s.dijeda === true ? null : berikutnya,
      ringkas: ringkasItem(daftar),
      item: daftar,
    };
  });
}

export type SiaranSaya = {
  id: string;
  judul: string;
  kategori: string;
  platforms: string[];
  status: string;
  pesan: string;
  waktu: string | null;
};

/** Siaran koordinator ke akun SAYA (kartu riwayat di TVR Saya). */
export async function siaranUntukSaya(userId: number, batas = 20): Promise<SiaranSaya[]> {
  const db = supabase();
  const { data: item, error } = await db
    .from("tvr_siaran_item")
    .select("id, siaran_id, platforms, status, pesan, jadwal_kirim, selesai_pada")
    .eq("user_id", userId)
    .not("jadwal_kirim", "is", null)
    .order("id", { ascending: false })
    .limit(Math.max(1, Math.min(50, batas)));
  if (error) {
    if (kolomBelumAda(error)) return [];
    throw new GalatSiaran("Gagal memuat riwayat siaran.", 500);
  }
  const ids = [...new Set((item ?? []).map((i) => Number(i.siaran_id)))];
  if (ids.length === 0) return [];
  const { data: induk } = await db.from("tvr_siaran").select("id, judul, kategori, sumber").in("id", ids);
  const per = new Map((induk ?? []).filter((s) => s.sumber === "koordinator").map((s) => [Number(s.id), s]));
  return (item ?? [])
    .filter((i) => per.has(Number(i.siaran_id)))
    .map((i) => {
      const s = per.get(Number(i.siaran_id))!;
      return {
        id: String(i.id),
        judul: String(s.judul ?? ""),
        kategori: String(s.kategori ?? ""),
        platforms: Array.isArray(i.platforms) ? (i.platforms as unknown[]).map(String) : [],
        status: String(i.status ?? ""),
        pesan: String(i.pesan ?? ""),
        waktu: i.selesai_pada ? String(i.selesai_pada) : i.jadwal_kirim ? String(i.jadwal_kirim) : null,
      };
    });
}

// ------------------------------------------------------------
// Variasi caption oleh Nara
// ------------------------------------------------------------

export async function variasiCaptionNara(judul: string, caption: string): Promise<{ tersedia: boolean; variasi: string[]; pesan: string }> {
  const asli = caption.trim().slice(0, KEBIJAKAN_SIARAN.CAPTION_MAKS);
  if (asli.length < 10) return { tersedia: true, variasi: [], pesan: "Tulis caption utama dulu (minimal 10 huruf)." };
  if (!(await koordinatorPunyaOtak())) {
    return { tersedia: false, variasi: [], pesan: "Nara belum punya API key (TVR Saya → Otak Bot → Nara). Caption utama dipakai untuk semua akun." };
  }
  try {
    const teks = await tanyaKoordinator({
      sistem: SISTEM_VARIASI,
      pengguna: promptVariasi(judul, asli, KEBIJAKAN_SIARAN.VARIAN_MAKS),
      json: true,
      fitur: "siaran_variasi",
      maksToken: 1200,
      batasMs: 45_000,
    });
    const semua = uraiVariasi(teks);
    const aman = semua.filter((v) => variasiAman(asli, v));
    const dibuang = semua.length - aman.length;
    return {
      tersedia: true,
      variasi: aman,
      pesan: aman.length === 0
        ? "Nara belum menghasilkan variasi yang aman. Caption utama dipakai untuk semua akun."
        : `${aman.length} variasi siap${dibuang > 0 ? ` (${dibuang} dibuang karena mengubah angka/sumber)` : ""}.`,
    };
  } catch (e) {
    console.error("[siaran-koor] variasi Nara:", e instanceof Error ? e.message : e);
    return { tersedia: true, variasi: [], pesan: "Nara gagal membuat variasi saat ini. Caption utama dipakai untuk semua akun." };
  }
}

// Posting bot & Antrean ACC (13 Okt 2026) — bagian MURNI: aturan, tipe, tanda
// pemeriksaan. Tanpa jaringan/basis data supaya teruji. Dipakai server dan layar
// (jangan impor apa pun yang khusus server di sini).
import { BATAS_CAPTION_TVR } from "@/lib/batas-caption";

/** Jarak jadwal tayang dari saat disetujui: cukup lama untuk membatalkan, cukup pendek agar tautan hidup. */
export const JADWAL_BOT_MENIT = 10;
export const JADWAL_BOT_MAKS_MENIT = 30;
/** Tugas `posting` yang tidak berubah selama ini dianggap macet (butuh pemeriksaan manual, TIDAK diulang otomatis). */
export const POSTING_MACET_MENIT = 15;
/** Berkas video siap-posting maksimal sekian MB (batas bucket tvrku). */
export const MAKS_VIDEO_POSTING_MB = 100;
/** Kategori tetap (selalu sah) untuk pengelompokan unggahan bot. */
export const KATEGORI_POSTING_BOT = "Video Sendiri";

/** Posting nyata mati kecuali env BOT_POSTING_AKTIF diisi 1/true/ya. */
export function postingAktif(nilai: string | undefined = process.env.BOT_POSTING_AKTIF): boolean {
  return ["1", "true", "ya"].includes((nilai ?? "").trim().toLowerCase());
}

const PETA_PLATFORM: Record<string, string> = {
  instagram: "instagram",
  tiktok: "tiktok",
  youtube: "youtube",
  facebook: "facebook",
  threads: "threads",
  x: "twitter",
  twitter: "twitter",
};

/** "Instagram" / "TikTok" / "X" → kunci platform upload-post; null bila tak dikenal. */
export function kunciPlatform(label: string | null | undefined): string | null {
  return PETA_PLATFORM[String(label ?? "").trim().toLowerCase()] ?? null;
}

export const LABEL_PLATFORM: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  facebook: "Facebook",
  threads: "Threads",
  twitter: "X",
};

export const batasCaption = (platform: string): number => BATAS_CAPTION_TVR[platform] ?? 2200;

const POLA_KREDIT = /(sumber|source|credit|kredit|cr|video|via|dok|foto)\s*[:：]/i;
/** Caption memuat penanda kredit ("Sumber: …")? */
export function adaKredit(caption: string): boolean {
  return POLA_KREDIT.test(caption);
}

/**
 * Caption bawaan (tanpa AI): judul + kredit sumber. Kredit SELALU dipertahankan:
 * bila melebihi batas platform, judul yang dipotong (diberi "…").
 */
export function captionBawaan(p: { judul: string; sumberLabel: string; platform: string }): string {
  const batas = batasCaption(p.platform);
  const kredit = `\n\nSumber: ${p.sumberLabel.trim() || "tidak disebutkan"}`;
  const judul = p.judul.replace(/\s+/g, " ").trim();
  if (judul.length + kredit.length <= batas) return `${judul}${kredit}`;
  const sisa = Math.max(0, batas - kredit.length - 1);
  return `${judul.slice(0, sisa).trimEnd()}…${kredit}`.slice(0, batas);
}

/** Waktu tayang (ISO) = sekarang + menit, dibulatkan ke atas ke menit penuh. */
export function jadwalPostingIso(sekarangMs: number, menit: number = JADWAL_BOT_MENIT): string {
  const m = Math.min(JADWAL_BOT_MAKS_MENIT, Math.max(5, Math.floor(menit)));
  const t = sekarangMs + m * 60_000;
  return new Date(Math.ceil(t / 60_000) * 60_000).toISOString();
}

/** Jadwal yang masih bisa dibatalkan: paling cepat 2 menit lagi. */
export function bolehBatalkanJadwal(jadwalIso: string | null | undefined, sekarangMs: number): boolean {
  const t = Date.parse(jadwalIso ?? "");
  return Number.isFinite(t) && t > sekarangMs + 2 * 60_000;
}

/** Tugas `posting` yang mandek (proses mati di tengah jalan) → perlu pemeriksaan manual. */
export function postingMacet(diubahPadaIso: string | null | undefined, sekarangMs: number): boolean {
  const t = Date.parse(diubahPadaIso ?? "");
  return !Number.isFinite(t) || sekarangMs - t > POSTING_MACET_MENIT * 60_000;
}

/** Galat saat unggah: PASTI (belum ada yang terkirim, aman diulang) atau AMBIGU (mungkin sudah terkirim). */
export function klasifikasiGalatUnggah(status: number | undefined | null): "pasti" | "ambigu" {
  if (status === null || status === undefined) return "ambigu";
  const st = Number(status);
  if (!Number.isFinite(st) || st >= 500) return "ambigu";
  return "pasti";
}

export type TandaPemeriksaan = { jenis: "ok" | "warn" | "bad"; teks: string };

export function tandaPemeriksaan(p: {
  caption: string;
  platform: string | null;
  /** true/false = diketahui; null = tak bisa diperiksa. */
  akunTertaut: boolean | null;
  perluLoginUlang: boolean;
  stokAda: boolean;
  durasiDetik: number | null;
  postingAktif: boolean;
}): TandaPemeriksaan[] {
  const t: TandaPemeriksaan[] = [];
  t.push(p.stokAda ? { jenis: "ok", teks: "Video siap di stok" } : { jenis: "bad", teks: "Video stok tidak ada" });
  if (p.durasiDetik !== null) {
    t.push(
      p.durasiDetik < 3
        ? { jenis: "bad", teks: `Durasi ${Math.round(p.durasiDetik)} dtk (terlalu pendek)` }
        : p.durasiDetik > 180
          ? { jenis: "warn", teks: `Durasi ${Math.round(p.durasiDetik)} dtk (panjang)` }
          : { jenis: "ok", teks: `Durasi ${Math.round(p.durasiDetik)} dtk` },
    );
  }
  t.push(adaKredit(p.caption) ? { jenis: "ok", teks: "Kredit sumber ada di caption" } : { jenis: "bad", teks: "Caption tanpa kredit sumber" });
  if (p.platform === null) {
    t.push({ jenis: "bad", teks: "Platform tujuan tidak dikenal" });
  } else {
    const batas = batasCaption(p.platform);
    if (p.caption.length > batas) t.push({ jenis: "bad", teks: `Caption ${p.caption.length}/${batas} karakter (terlalu panjang)` });
    else if (p.caption.trim().length === 0) t.push({ jenis: "bad", teks: "Caption kosong" });
    else t.push({ jenis: "ok", teks: `Caption ${p.caption.length}/${batas}` });
  }
  if (p.akunTertaut === null) t.push({ jenis: "warn", teks: "Akun tujuan belum bisa diperiksa" });
  else if (!p.akunTertaut) t.push({ jenis: "bad", teks: "Akun tujuan belum tertaut di upload-post" });
  else if (p.perluLoginUlang) t.push({ jenis: "bad", teks: "Akun tujuan perlu login ulang" });
  else t.push({ jenis: "ok", teks: "Akun tujuan tertaut" });
  if (!p.postingAktif) t.push({ jenis: "warn", teks: "Posting nyata belum diaktifkan di server" });
  return t;
}

// ---- Tipe API ----

export type ItemAccApi = {
  id: number;
  bot_id: number;
  bot_nama: string;
  judul: string;
  kategori: string;
  /** Hook yang tertulis di video ("KICKER! isi") bila diketahui. */
  hook: string;
  sumber_label: string;
  sumber_url: string;
  /** Kunci platform tujuan ("instagram") atau "" bila tak dikenal. */
  platform: string;
  platform_label: string;
  durasi_detik: number | null;
  caption: string;
  /** Perkiraan jadwal tayang bila disetujui SEKARANG. */
  jadwal_iso: string;
  tahap: string;
  stok_ada: boolean;
  tanda: TandaPemeriksaan[];
};

export type RiwayatAccApi = {
  tugas_id: number;
  judul: string;
  bot_nama: string;
  keputusan: "setuju" | "ulang" | "tolak" | "batal";
  tahap: string;
  /** Ringkas hasil posting / galat. */
  catatan: string;
  jadwal_iso: string | null;
  keputusan_pada: string | null;
  /** Jadwal masih di depan & berkas masih ada → bisa dibatalkan. */
  bisa_batal: boolean;
  /** Tugas macet di tahap `posting`: perlu diperiksa manual di akun sosmed. */
  perlu_diperiksa: boolean;
};

export type StatusAcc = {
  tabel_ada: boolean;
  posting_aktif: boolean;
  antrean: ItemAccApi[];
  riwayat: RiwayatAccApi[];
};

export type AksiAcc =
  | { aksi: "setuju"; tugas_id: number; caption: string }
  | { aksi: "ulang"; tugas_id: number }
  | { aksi: "tolak"; tugas_id: number }
  | { aksi: "batalkan_jadwal"; tugas_id: number };

export const CAPTION_MAKS_KARAKTER = 5000;

export function validasiAksiAcc(x: unknown): { ok: true; aksi: AksiAcc } | { ok: false; pesan: string } {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return { ok: false, pesan: "Badan permintaan tidak sah." };
  const o = x as Record<string, unknown>;
  const id = o.tugas_id;
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) return { ok: false, pesan: "tugas_id tidak sah." };
  switch (o.aksi) {
    case "setuju": {
      if (typeof o.caption !== "string") return { ok: false, pesan: "Caption wajib diisi." };
      const caption = o.caption.replace(/\r\n/g, "\n").trim();
      if (caption === "") return { ok: false, pesan: "Caption wajib diisi." };
      if (caption.length > CAPTION_MAKS_KARAKTER) return { ok: false, pesan: "Caption terlalu panjang." };
      return { ok: true, aksi: { aksi: "setuju", tugas_id: id, caption } };
    }
    case "ulang":
    case "tolak":
    case "batalkan_jadwal":
      return { ok: true, aksi: { aksi: o.aksi, tugas_id: id } };
    default:
      return { ok: false, pesan: "aksi tidak dikenal." };
  }
}

/** Alasan menolak menyetujui; null = boleh. Urutan = prioritas pesan. */
export function alasanTolakSetuju(p: {
  postingAktif: boolean;
  botAktif: boolean;
  botJeda: boolean;
  jedaGlobal: boolean;
  platform: string | null;
  profilAda: boolean;
  akunTertaut: boolean | null;
  perluLoginUlang: boolean;
  stokAda: boolean;
  caption: string;
}): string | null {
  if (!p.postingAktif) return "Posting bot belum diaktifkan di server (BOT_POSTING_AKTIF).";
  if (p.jedaGlobal) return "Semua bot sedang dijeda.";
  if (!p.botAktif) return "Bot ini nonaktif.";
  if (p.botJeda) return "Bot ini sedang dijeda.";
  if (!p.stokAda) return "Video belum tersedia di stok.";
  if (p.platform === null) return "Platform tujuan bot tidak dikenal.";
  if (!p.profilAda) return "Bot ini belum punya profil upload-post. Tautkan dulu lewat Tautkan Profil Upload-Post.";
  if (p.akunTertaut === false) return `Akun ${LABEL_PLATFORM[p.platform] ?? p.platform} bot belum tertaut di upload-post.`;
  if (p.perluLoginUlang) return `Akun ${LABEL_PLATFORM[p.platform] ?? p.platform} bot perlu login ulang di upload-post.`;
  const c = p.caption.trim();
  if (c === "") return "Caption wajib diisi.";
  const batas = batasCaption(p.platform);
  if (c.length > batas) return `Caption ${c.length} karakter melebihi batas ${LABEL_PLATFORM[p.platform] ?? p.platform} (${batas}).`;
  return null;
}

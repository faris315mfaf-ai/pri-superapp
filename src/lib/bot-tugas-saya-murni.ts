// ============================================================
// BOT REDAKSI — pembentuk data panel "Tugas Bot" (2F, 13 Okt 2026).
// MURNI: tanpa DB/jaringan, diuji di tests/uji-bot-tugas-saya.mts.
// ============================================================

import { kunciKanonik } from "@/lib/bot-kunci";
import type { KandidatBotRingkas, PermintaanWajibRingkas, StatusKandidatBot, TugasBotRingkas } from "@/lib/bot-tipe";

export const BATAS_TUGAS_SAYA = 10;
export const BATAS_KANDIDAT_SAYA = 20;

/** Status kandidat dari sudut pandang SATU bot. `bentrok` (dipakai manusia) mengalahkan klaim. */
export function statusKandidat(baris: { diklaim_oleh: number | null; bentrok: string | null }, botId: number): StatusKandidatBot {
  if (baris.bentrok) return "bentrok";
  if (baris.diklaim_oleh === null || baris.diklaim_oleh === undefined) return "bebas";
  return Number(baris.diklaim_oleh) === Number(botId) ? "diklaim_saya" : "diklaim_lain";
}

/** Platform dari URL (lewat kunci kanonik); tak dikenal → "lainnya". */
export function platformDariUrl(url: string): string {
  const k = kunciKanonik(url);
  if (!k) return "lainnya";
  switch (k.platform) {
    case "instagram":
      return "Instagram";
    case "tiktok":
      return "TikTok";
    case "youtube":
      return "YouTube";
    case "facebook":
      return "Facebook";
    case "x":
      return "X";
  }
}

const angka = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || !Number.isFinite(n) ? null : n;
};

export type BarisKandidatSaya = {
  id: number;
  url: string | null;
  judul: string | null;
  durasi_detik: number | null;
  tayangan: number | null;
  waktu_terbit: string | null;
  diklaim_oleh: number | null;
  bentrok: string | null;
  dibuat_pada: string;
};

export function rakitKandidatSaya(b: BarisKandidatSaya, botId: number): KandidatBotRingkas {
  const url = String(b.url ?? "");
  return {
    id: Number(b.id),
    url,
    judul: String(b.judul ?? ""),
    platform: platformDariUrl(url),
    durasi_detik: angka(b.durasi_detik),
    tayangan: angka(b.tayangan),
    waktu_terbit: b.waktu_terbit ?? null,
    status: statusKandidat(b, botId),
    dibuat_pada: b.dibuat_pada,
  };
}

export type BarisTugasSaya = {
  id: number;
  tahap: string | null;
  judul: string | null;
  kategori: string | null;
  galat: string | null;
  dibuat_pada: string;
  selesai_pada: string | null;
};

export function rakitTugasSaya(b: BarisTugasSaya, idTugasWajib: ReadonlySet<number>): TugasBotRingkas {
  return {
    id: Number(b.id),
    tahap: String(b.tahap ?? ""),
    judul: String(b.judul ?? ""),
    kategori: String(b.kategori ?? ""),
    galat: String(b.galat ?? ""),
    dibuat_pada: b.dibuat_pada,
    selesai_pada: b.selesai_pada ?? null,
    dari_video_wajib: idTugasWajib.has(Number(b.id)),
  };
}

export type BarisPermintaanSaya = {
  id: number;
  judul: string | null;
  keterangan: string | null;
  kategori: string | null;
  batas_waktu: string | null;
};

export function rakitPermintaan(b: BarisPermintaanSaya, status: PermintaanWajibRingkas["status"]): PermintaanWajibRingkas {
  return {
    id: Number(b.id),
    judul: String(b.judul ?? "").trim() || "(tanpa judul)",
    keterangan: String(b.keterangan ?? "").slice(0, 400),
    kategori: String(b.kategori ?? ""),
    batas_waktu: b.batas_waktu ? String(b.batas_waktu).slice(0, 10) : null,
    status,
  };
}

/**
 * Gabung permintaan terbuka dan yang diambil bot ini tanpa duplikat; yang diambil
 * bot ini lebih dulu, lalu terbuka menurut urutan masuk (sudah urut tenggat dari server).
 */
export function gabungPermintaan(terbuka: readonly PermintaanWajibRingkas[], diambilSaya: readonly PermintaanWajibRingkas[]): PermintaanWajibRingkas[] {
  const sudah = new Set<number>();
  const hasil: PermintaanWajibRingkas[] = [];
  for (const p of [...diambilSaya, ...terbuka]) {
    if (sudah.has(p.id)) continue;
    sudah.add(p.id);
    hasil.push(p);
  }
  return hasil;
}

/** Validasi badan POST /api/bot/tugas-saya. Mengembalikan aksi sah atau pesan galat. */
export function validasiAksiTugasBot(b: unknown): { ok: true; aksi: { aksi: "cari_sekarang" } | { aksi: "ambil_permintaan"; id: number } } | { ok: false; pesan: string } {
  if (!b || typeof b !== "object" || Array.isArray(b)) return { ok: false, pesan: "Badan permintaan tidak sah." };
  const o = b as Record<string, unknown>;
  if (o.aksi === "cari_sekarang") return { ok: true, aksi: { aksi: "cari_sekarang" } };
  if (o.aksi === "ambil_permintaan") {
    const id = Number(o.id);
    if (!Number.isInteger(id) || id <= 0) return { ok: false, pesan: "id permintaan tidak sah." };
    return { ok: true, aksi: { aksi: "ambil_permintaan", id } };
  }
  return { ok: false, pesan: "aksi tidak dikenal." };
}

/** Teks galat untuk penolakan pengambilan manual (kode dari ambilPermintaanManual). */
export function pesanTolakManual(kode: string, alasan: string | null): string {
  switch (kode) {
    case "bot_tidak_ada":
      return "Akun ini belum terdaftar sebagai bot.";
    case "sudah_diambil":
      return "Permintaan ini sudah diambil bot lain.";
    case "tidak_layak":
      return "Permintaan ini tidak tersedia lagi (ditutup, lewat tenggat, atau tautannya tidak didukung).";
    case "tabel_belum_ada":
      return "Bot belum diaktifkan (migrasi belum dijalankan).";
    default: {
      const peta: Record<string, string> = {
        nonaktif: "Bot ini dinonaktifkan.",
        jeda_global: "Jeda darurat semua bot sedang menyala.",
        jeda_bot: "Bot ini sedang dijeda.",
        gagal_beruntun: "Bot berhenti otomatis setelah beberapa kegagalan berturut-turut.",
        di_luar_jam: "Di luar jam aktif bot.",
        kuota_habis: "Kuota harian bot sudah habis.",
        terkunci: "Bot sedang sibuk memproses tugas lain. Coba lagi sebentar.",
        tugas_berjalan: "Bot masih mengerjakan tugas sebelumnya.",
        menunggu_manusia: "Bot menunggu keputusan manusia atas tugas sebelumnya.",
      };
      return (alasan && peta[alasan]) || "Bot belum bisa memulai tugas baru sekarang.";
    }
  }
}

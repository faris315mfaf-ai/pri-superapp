// ============================================================
// BOT REDAKSI — "dunia" Ruang Bot (13 Okt 2026): fungsi MURNI.
//
// Ruang Bot menampilkan empat ruang (kerja, meeting, koordinator, kamar tidur).
// Yang menentukan siapa berada di mana datang dari data nyata:
//   • tanpa API key            -> tidur di kamar tidur
//   • tugas berjalan           -> duduk di meja tahap itu (pencarian/edit/posting)
//   • room Chat sedang ramai   -> berkumpul di ruang meeting
//   • usulan Nara disetujui    -> Nara mengantar surat tugas
// File ini hanya berisi aturan pemetaan itu (tanpa DB/React) supaya bisa diuji.
// ============================================================

import type { DiputusKoordinator, TugasAktifBot } from "@/lib/bot-tipe";

/** Tahap bot_tugas yang berarti bot SEDANG bekerja (duduk di meja). Menunggu ACC tidak dihitung. */
export const TAHAP_KERJA_DUNIA = ["cari", "pilih", "unduh", "edit", "disetujui", "posting"] as const;

/** Meja di Ruang untuk satu tahap bot_tugas; null = tidak duduk di meja (mis. menunggu ACC). */
export function mejaDariTahapTugas(tahap: string): "cari" | "edit" | "posting" | null {
  switch (tahap) {
    case "cari":
    case "pilih":
      return "cari";
    case "unduh":
    case "edit":
      return "edit";
    case "disetujui":
    case "posting":
      return "posting";
    default:
      return null;
  }
}

/**
 * Tugas berjalan terbaru per bot. `baris` boleh tidak berurutan; yang dipilih id terbesar
 * di antara tahap kerja. Baris rusak (bot_id bukan angka) diabaikan.
 */
export function tugasAktifPerBot(baris: readonly { id: number; bot_id: number; tahap: string; judul: string | null }[]): Map<number, TugasAktifBot> {
  const hasil = new Map<number, { id: number; tugas: TugasAktifBot }>();
  for (const b of baris) {
    const botId = Number(b.bot_id);
    const id = Number(b.id);
    if (!Number.isFinite(botId) || !Number.isFinite(id)) continue;
    if (mejaDariTahapTugas(String(b.tahap)) === null) continue;
    const lama = hasil.get(botId);
    if (lama && lama.id >= id) continue;
    hasil.set(botId, { id, tugas: { tahap: String(b.tahap), judul: String(b.judul ?? "").trim().slice(0, 140) } });
  }
  return new Map([...hasil].map(([k, v]) => [k, v.tugas]));
}

/** Rapat dianggap berlangsung bila ada pesan room Chat dalam jendela ini. */
export const JENDELA_RAPAT_MS = 3 * 60_000;

/** true bila pesan chat terakhir masih "hangat". Waktu rusak/masa depan jauh -> false. */
export function rapatBerlangsung(chatTerakhirIso: string | null | undefined, sekarangMs: number, jendelaMs: number = JENDELA_RAPAT_MS): boolean {
  if (!chatTerakhirIso) return false;
  const t = Date.parse(chatTerakhirIso);
  if (!Number.isFinite(t)) return false;
  const umur = sekarangMs - t;
  return umur >= -60_000 && umur <= jendelaMs;
}

/** Berapa ms lagi rapat dari chat itu berakhir (0 bila sudah tidak berlangsung). Untuk menjadwalkan pengecekan ulang. */
export function sisaRapatMs(chatTerakhirIso: string | null | undefined, sekarangMs: number, jendelaMs: number = JENDELA_RAPAT_MS): number {
  if (!rapatBerlangsung(chatTerakhirIso, sekarangMs, jendelaMs)) return 0;
  return Math.max(0, Date.parse(chatTerakhirIso as string) + jendelaMs - sekarangMs);
}

/** Usulan disetujui yang baru (dalam jendela ini) — dianimasikan Nara; yang lebih lama hanya jadi catatan di papan. */
export const JENDELA_ANTAR_MS = 3 * 60_000;

export function perluDiantar(d: Pick<DiputusKoordinator, "diputus_pada">, sekarangMs: number, jendelaMs: number = JENDELA_ANTAR_MS): boolean {
  const t = Date.parse(d.diputus_pada);
  if (!Number.isFinite(t)) return false;
  const umur = sekarangMs - t;
  return umur >= -60_000 && umur <= jendelaMs;
}

/** Baris bot_usulan -> daftar `diputus` yang aman (maks 12, terbaru dulu). */
export function rakitDiputus(baris: readonly { id: number; bot_id: number; judul: string | null; diputus_pada: string | null }[]): DiputusKoordinator[] {
  return baris
    .filter((b) => Number.isFinite(Number(b.id)) && Number.isFinite(Number(b.bot_id)) && !!b.diputus_pada && Number.isFinite(Date.parse(b.diputus_pada)))
    .map((b) => ({ id: Number(b.id), bot_id: Number(b.bot_id), judul: String(b.judul ?? "").trim().slice(0, 140), diputus_pada: String(b.diputus_pada) }))
    .sort((p, q) => Date.parse(q.diputus_pada) - Date.parse(p.diputus_pada) || q.id - p.id)
    .slice(0, 12);
}

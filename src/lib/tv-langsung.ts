// ============================================================
// TV RAKYAT OFFICIAL — MODUL BERSAMA YANG LANGSUNG (7 Okt 2026).
//
// Setiap aksi tim (edit, kirim ke antrean, ACC, posting, tandai manual,
// pesan obrolan) menyiarkan "ada yang berubah" ke topik Realtime
// `tv-official`. Semua layar modul yang sedang terbuka langsung memuat
// ulang datanya dan menampilkan aktivitas/pesan baru — tanpa refresh.
//
// Isi siaran sengaja HANYA {jenis, t}: topik Realtime publik bisa didengar
// siapa pun yang memegang kunci anon, jadi nama & judul diambil lewat
// /api/tv/langsung yang wajib login.
// ============================================================

import { siarkanRealtime } from "@/lib/realtime-server";
import { wewenangTv } from "@/lib/tv-tim";

export const TOPIK_TV = "tv-official";
export const EVENT_TV = "berubah";
/** Grup chat yang dipakai Obrolan Tim (sama dengan modul Chat). */
export const DIVISI_OBROLAN_TV = "Divisi TV Rakyat";

export type JenisPerubahanTv = "mesin" | "kirim" | "acc" | "posting" | "manual" | "hapus" | "obrolan";

/** Siarkan perubahan; tidak pernah melempar & tidak ditunggu lama. */
export function siarkanTv(jenis: JenisPerubahanTv): void {
  void siarkanRealtime(TOPIK_TV, EVENT_TV, { jenis, t: Date.now() }).catch(() => false);
}

/** Boleh masuk ruang tim (aktivitas, kehadiran, obrolan). */
export async function bolehRuangTv(user: Parameters<typeof wewenangTv>[0]): Promise<boolean> {
  if (user.role === "master" || user.role === "super_admin") return true;
  return (await wewenangTv(user)).anggota;
}

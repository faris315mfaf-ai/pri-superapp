// ============================================================
// RUANG BOT UNTUK PENGGUNA UMUM (14 Okt 2026) — KHUSUS SERVER.
// Satu payload bersama untuk semua anggota, di-cache 5 dtk (Redis + memori) supaya ratusan
// peramban yang membuka Ruang tidak memukul DB. Isi sudah disanitasi (lib/ruang-umum-murni).
// ============================================================

import { denganCache } from "@/lib/cache-bersama";
import { ambilStatusBot } from "@/lib/bot-data";
import { bacaStatusDunia } from "@/lib/dunia";
import { statusRuangUmum, type StatusRuangUmum } from "@/lib/ruang-umum-murni";

const TTL_DETIK = 5;

export function bacaRuangUmum(): Promise<StatusRuangUmum> {
  return denganCache("ruang-umum:v1", TTL_DETIK, async () => {
    const [dunia, bot] = await Promise.all([
      bacaStatusDunia(),
      // Bot gagal dimuat (DB sesaat) tidak boleh mengosongkan daftar online.
      ambilStatusBot().catch((e) => {
        console.error("[ruang-umum] status bot:", e instanceof Error ? e.message : e);
        return null;
      }),
    ]);
    return statusRuangUmum(dunia, bot, Date.now());
  });
}

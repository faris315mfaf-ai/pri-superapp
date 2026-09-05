// ============================================================
// Sistem koin (KHUSUS SISI SERVER) — spek 1.16.
//
// Koin adalah mata uang gamifikasi aplikasi. Pemberian dicatat di
// buku besar koin_transaksi dengan UNIQUE (user, aktivitas,
// referensi) sehingga IDEMPOTEN: aktivitas yang sama tidak pernah
// dibayar dua kali (anti-farming). Saldo = penjumlahan di database
// (view v_app_koin_saldo).
//
// Besaran bonus per aktivitas dibaca dari pengaturan_sistem —
// master mengubahnya lewat Pengaturan Fitur tanpa deploy ulang.
// ============================================================
import { supabase } from "@/lib/supabase";

/** Aktivitas berhadiah koin + kunci pengaturannya. */
export const AKTIVITAS_KOIN = [
  { id: "absen", kunci: "koin_bonus_absen", label: "Absen masuk harian", bawaan: 10 },
  { id: "chat_baru", kunci: "koin_bonus_chat_baru", label: "Chat pertama ke teman baru", bawaan: 5 },
  { id: "laporan_video", kunci: "koin_bonus_laporan_video", label: "Laporan video tersimpan", bawaan: 15 },
  { id: "akun_sosmed", kunci: "koin_bonus_akun_sosmed", label: "Menambahkan akun sosmed", bawaan: 20 },
  // v5 (5 Sep 2026): hadiah login harian (10 koin × 2); hari ke-7 beruntun = dua kali lipat.
  { id: "login_harian", kunci: "koin_bonus_login_harian", label: "Hadiah login harian (hari ke-7 ×2)", bawaan: 20 },
  // 5 Sep 2026: unggah video lewat TV Rakyat Saya & komentar terverifikasi di postingan wajib.
  { id: "upload_video", kunci: "koin_bonus_upload_video", label: "Mengunggah video (TV Rakyat Saya)", bawaan: 15 },
  { id: "komen_video", kunci: "koin_bonus_komen_video", label: "Komentar terverifikasi di postingan wajib", bawaan: 5 },
] as const;

export type AktivitasKoin = (typeof AKTIVITAS_KOIN)[number]["id"];

/** Baca besaran bonus seluruh aktivitas (sekali kueri). */
export async function bacaBonusKoin(): Promise<Record<string, number>> {
  const hasil: Record<string, number> = {};
  for (const a of AKTIVITAS_KOIN) hasil[a.id] = a.bawaan;
  try {
    const { data } = await supabase()
      .from("pengaturan_sistem")
      .select("kunci, nilai")
      .in("kunci", AKTIVITAS_KOIN.map((a) => a.kunci));
    for (const b of data ?? []) {
      const akt = AKTIVITAS_KOIN.find((a) => a.kunci === b.kunci);
      const n = Number(b.nilai);
      if (akt && Number.isFinite(n) && n >= 0) hasil[akt.id] = Math.floor(n);
    }
  } catch {
    // Gagal baca pengaturan → pakai bawaan; koin tak boleh merusak alur.
  }
  return hasil;
}

/**
 * Beri koin untuk satu aktivitas. `referensi` membuatnya idempoten
 * (mis. tanggal absen, id kontak, id laporan) — pemberian kedua
 * dengan referensi sama diabaikan diam-diam.
 *
 * TIDAK PERNAH melempar: koin hanyalah bonus di atas alur utama.
 */
export async function beriKoin(
  userId: number,
  aktivitas: AktivitasKoin,
  referensi: string,
): Promise<void> {
  try {
    const bonus = (await bacaBonusKoin())[aktivitas] ?? 0;
    if (bonus <= 0) return; // bonus 0 = aktivitas dimatikan master
    await supabase()
      .from("koin_transaksi")
      .upsert(
        { user_id: userId, jumlah: bonus, aktivitas, referensi },
        { onConflict: "user_id,aktivitas,referensi", ignoreDuplicates: true },
      );
  } catch (e) {
    console.error("[koin] beri:", e);
  }
}

/** Saldo koin seseorang (0 bila belum pernah dapat). */
export async function saldoKoin(userId: number): Promise<number> {
  try {
    const { data } = await supabase()
      .from("v_app_koin_saldo")
      .select("saldo")
      .eq("user_id", userId)
      .maybeSingle();
    return Number(data?.saldo ?? 0);
  } catch {
    return 0;
  }
}

// ============================================================
// Sistem koin (KHUSUS SISI SERVER) — spek 1.16.
//
// Koin adalah mata uang gamifikasi aplikasi. Pemberian dicatat di
// buku besar koin_transaksi dengan UNIQUE (user, aktivitas,
// referensi) sehingga IDEMPOTEN: aktivitas yang sama tidak pernah
// dibayar dua kali (anti-farming). Saldo = penjumlahan di database
// (view v_app_koin_saldo).
//
// 5 Okt 2026: SELURUH BONUS OTOMATIS DIHENTIKAN (permintaan pemilik).
// Koin kini hanya masuk lewat pemberian Pimpinan Redaksi / superadmin /
// master per video (api/koin/kelola), dan bisa direset oleh mereka.
// Belanja pet & pasar tetap memakai saldo seperti biasa.
// ============================================================
import { supabase } from "@/lib/supabase";
import { AKTIVITAS_KIRIMAN_MASTER } from "@/lib/koin-chat";

/** Aktivitas berhadiah koin + kunci pengaturannya. */
export const AKTIVITAS_KOIN = [
  // Lima cara utama (permintaan 12 Sep 2026) — urutannya mengikuti daftar
  // di Panel Master supaya yang dibaca master sama dengan yang dijanjikan.
  { id: "upload_video", kunci: "koin_bonus_upload_video", label: "Upload video lewat SuperApp", bawaan: 15 },
  { id: "laporan_video", kunci: "koin_bonus_laporan_video", label: "Menambahkan link video manual", bawaan: 15 },
  { id: "absen", kunci: "koin_bonus_absen", label: "Absensi harian", bawaan: 10 },
  { id: "chat_baru", kunci: "koin_bonus_chat_baru", label: "Chat (percakapan baru dengan seseorang)", bawaan: 5 },
  // Diberikan penjadwal harian kepada juara komentar periode yang baru
  // selesai (lib/juara-komen) — sekali per periode, tidak bisa dobel.
  { id: "juara_komen_harian", kunci: "koin_bonus_juara_komen_harian", label: "Reward top komen harian (juara 1)", bawaan: 50 },
  { id: "akun_sosmed", kunci: "koin_bonus_akun_sosmed", label: "Menambahkan akun sosmed", bawaan: 20 },
  // v5 (5 Sep 2026): hadiah login harian (10 koin × 2); hari ke-7 beruntun = dua kali lipat.
  { id: "login_harian", kunci: "koin_bonus_login_harian", label: "Hadiah login harian (hari ke-7 ×2)", bawaan: 20 },
  // 5 Sep 2026: komentar terverifikasi di postingan wajib.
  { id: "komen_video", kunci: "koin_bonus_komen_video", label: "Komentar terverifikasi di postingan wajib", bawaan: 5 },
] as const;

export type AktivitasKoin = (typeof AKTIVITAS_KOIN)[number]["id"];

/** Saklar pusat bonus otomatis — false sejak 5 Okt 2026 (semua bonus 0). */
export const BONUS_OTOMATIS_AKTIF = false;

/** Aktivitas pemberian koin per video oleh pengelola koin. */
export const AKTIVITAS_HADIAH_VIDEO = "hadiah_video";
/** Asal video yang bisa diberi koin; referensi buku besarnya "<sumber>-<id>". */
export type SumberVideoKoin = "tvrku" | "laporan" | "official";
export const LABEL_SUMBER_VIDEO: Record<SumberVideoKoin, string> = {
  tvrku: "Upload TVR Saya",
  laporan: "Laporan link video",
  official: "Upload ke TV Official",
};
/** Aktivitas penolan saldo oleh pengelola koin. */
export const AKTIVITAS_RESET_KOIN = "reset_koin";

/** Label buku besar untuk riwayat di dompet. */
const LABEL_AKTIVITAS: Record<string, string> = {
  hadiah_video: "Hadiah video",
  reset_koin: "Koin direset",
  kiriman_master: "Kiriman koin",
  bonus_master: "Bonus dari master",
  pet_beli: "Belanja toko robot",
  pasar_beli: "Beli di pasar robot",
  pasar_jual: "Jual di pasar robot",
  pet_harian: "Hadiah harian robot",
  ...Object.fromEntries(AKTIVITAS_KOIN.map((a) => [a.id, a.label])),
};

export type BarisRiwayatKoin = { id: string; jumlah: number; label: string; catatan: string; tanggal: string };

/** Riwayat transaksi koin terbaru seseorang (terbaru dulu). */
export async function riwayatKoin(userId: number, batas = 30): Promise<BarisRiwayatKoin[]> {
  const { data, error } = await supabase()
    .from("koin_transaksi")
    .select("id, jumlah, aktivitas, referensi, dibuat_pada")
    .eq("user_id", userId)
    .order("dibuat_pada", { ascending: false })
    .limit(batas);
  if (error) throw new Error("Riwayat koin gagal dimuat.");
  return (data ?? []).map((b) => {
    const akt = String(b.aktivitas);
    const ref = String(b.referensi ?? "");
    // Hadiah video: referensi "<sumber>-<id>" — tampilkan asal videonya.
    const catatan = akt === AKTIVITAS_HADIAH_VIDEO ? (LABEL_SUMBER_VIDEO[ref.split("-")[0] as SumberVideoKoin] ?? "") : "";
    return {
      id: String(b.id),
      jumlah: Number(b.jumlah) || 0,
      label: LABEL_AKTIVITAS[akt] ?? akt.replace(/_/g, " "),
      catatan,
      tanggal: String(b.dibuat_pada),
    };
  });
}

/** Baca besaran bonus seluruh aktivitas (sekali kueri). */
export async function bacaBonusKoin(): Promise<Record<string, number>> {
  const hasil: Record<string, number> = {};
  for (const a of AKTIVITAS_KOIN) hasil[a.id] = BONUS_OTOMATIS_AKTIF ? a.bawaan : 0;
  if (!BONUS_OTOMATIS_AKTIF) return hasil;
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

/**
 * Kiriman koin dari MASTER lewat chat (28 Sep 2026). Beda dengan beriKoin:
 * - jumlahnya ditentukan master, bukan pengaturan bonus;
 * - MELEMPAR bila gagal — pengirim harus tahu koinnya belum masuk;
 * - `baru` = false bila referensi yang sama sudah tercatat (ketukan
 *   ganda / kirim ulang setelah sinyal putus) → tidak dibayar dua kali.
 * Saldo master TIDAK dipotong: ini hadiah dari sistem, tercatat di buku
 * besar dengan aktivitas "kiriman_master" supaya tetap bisa diaudit.
 */
export async function catatKirimanMaster(
  penerimaId: number,
  jumlah: number,
  referensi: string,
): Promise<{ baru: boolean }> {
  const { data, error } = await supabase()
    .from("koin_transaksi")
    .upsert(
      { user_id: penerimaId, jumlah, aktivitas: AKTIVITAS_KIRIMAN_MASTER, referensi },
      { onConflict: "user_id,aktivitas,referensi", ignoreDuplicates: true },
    )
    .select("id");
  if (error) {
    console.error("[koin] kiriman master:", error.message);
    throw new Error("Gagal mencatat koin. Coba lagi.");
  }
  return { baru: (data ?? []).length > 0 };
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

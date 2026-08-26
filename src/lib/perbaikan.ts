// ============================================================
// Mode perbaikan (KHUSUS SISI SERVER).
//
// Saat master menyalakannya, hanya akun master yang bisa masuk /
// bertahan di aplikasi — semua orang lain diarahkan ke layar khusus
// yang mengunci aplikasi sepenuhnya. Master boleh menyertakan
// PERKIRAAN JAM SELESAI; begitu waktu itu lewat, mode perbaikan
// berakhir sendiri tanpa perlu dimatikan manual.
//
// Dipakai /api/login, /api/sesi, dan /api/perbaikan.
// ============================================================
import { supabase } from "@/lib/supabase";

export const KUNCI_PERBAIKAN = "mode_perbaikan";
export const KUNCI_SAMPAI = "mode_perbaikan_sampai";
export const KUNCI_PESAN = "mode_perbaikan_pesan";

export const PESAN_PERBAIKAN =
  "Aplikasi sedang dalam masa perbaikan. Silakan coba lagi nanti.";

export type StatusPerbaikan = {
  aktif: boolean;
  /** ISO perkiraan jam buka kembali; null bila tanpa batas */
  sampai: string | null;
  /** Pesan kustom master; kosong = pakai bawaan */
  pesan: string;
};

/**
 * Baca status perbaikan lengkap. Gagal baca = dianggap MATI: gangguan
 * database tidak boleh ikut mengunci seluruh aplikasi.
 *
 * AUTO-BERAKHIR: bila sakelarnya menyala tetapi perkiraan jam selesai
 * sudah lewat, statusnya dilaporkan MATI. Layar tidak perlu menunggu
 * master menekan tombol.
 */
export async function statusPerbaikan(): Promise<StatusPerbaikan> {
  try {
    const { data } = await supabase()
      .from("pengaturan_sistem")
      .select("kunci, nilai")
      .in("kunci", [KUNCI_PERBAIKAN, KUNCI_SAMPAI, KUNCI_PESAN]);

    const peta = new Map((data ?? []).map((r) => [r.kunci, r.nilai ?? ""]));
    const menyala = peta.get(KUNCI_PERBAIKAN) === "true";
    const sampaiTeks = (peta.get(KUNCI_SAMPAI) ?? "").trim();
    const sampai = sampaiTeks || null;

    // Perkiraan waktu sudah lewat → anggap selesai.
    if (menyala && sampai) {
      const waktu = new Date(sampai).getTime();
      if (Number.isFinite(waktu) && waktu <= Date.now()) {
        return { aktif: false, sampai: null, pesan: "" };
      }
    }

    return {
      aktif: menyala,
      sampai: menyala ? sampai : null,
      pesan: menyala ? (peta.get(KUNCI_PESAN) ?? "") : "",
    };
  } catch {
    return { aktif: false, sampai: null, pesan: "" };
  }
}

/** true bila mode perbaikan sedang menyala (mempertimbangkan auto-berakhir). */
export async function modePerbaikanAktif(): Promise<boolean> {
  return (await statusPerbaikan()).aktif;
}

/**
 * Lempar 503 bila mode perbaikan menyala dan pemanggil bukan master.
 * Pesannya sengaja dibuat pass-through (lihat api-helper): mode
 * perbaikan adalah pesan yang MEMANG untuk dilihat pengguna, bukan
 * galat server yang perlu disamarkan.
 */
export async function pastikanBukanPerbaikan(role: string): Promise<void> {
  if (role === "master") return;
  if (await modePerbaikanAktif()) {
    throw Object.assign(new Error(PESAN_PERBAIKAN), {
      status: 503,
      pesanAman: true, // beri tahu bungkus() agar tidak menyamarkan pesannya
    });
  }
}

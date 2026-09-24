// ============================================================
// ALASAN PENOLAKAN PENDAFTARAN (24 Sep 2026) — KHUSUS SISI SERVER.
//
// HR menulis alasan saat menolak pendaftar (mis. "nama tidak sesuai
// KTP"). Alasannya ditunjukkan ke pendaftar saat ia mencoba masuk, dan
// terlihat HR di Database Anggota.
//
// Disimpan di pengaturan_sistem (kunci `tolak_pendaftar:<id>`, nilai JSON)
// supaya tidak butuh migrasi kolom baru. Dihapus lagi bila akun itu
// kemudian disetujui/diaktifkan.
// ============================================================
import { supabase } from "@/lib/supabase";

const AWALAN = "tolak_pendaftar:";
export const ALASAN_TOLAK_MAKS = 300;

export type AlasanTolak = { alasan: string; oleh: string; pada: string };

function urai(nilai: unknown): AlasanTolak | null {
  try {
    const o = JSON.parse(String(nilai ?? "")) as Partial<AlasanTolak>;
    const alasan = String(o.alasan ?? "").trim();
    if (!alasan) return null;
    return { alasan, oleh: String(o.oleh ?? ""), pada: String(o.pada ?? "") };
  } catch {
    return null;
  }
}

/** Simpan alasan; alasan kosong = hapus catatan lama. Tidak pernah melempar. */
export async function simpanAlasanTolak(userId: number, alasan: string, oleh: string): Promise<void> {
  const bersih = alasan.replace(/\s+/g, " ").trim().slice(0, ALASAN_TOLAK_MAKS);
  try {
    if (!bersih) {
      await hapusAlasanTolak(userId);
      return;
    }
    await supabase()
      .from("pengaturan_sistem")
      .upsert(
        {
          kunci: `${AWALAN}${userId}`,
          nilai: JSON.stringify({ alasan: bersih, oleh, pada: new Date().toISOString() }),
        },
        { onConflict: "kunci" },
      );
  } catch (e) {
    console.error("[alasan-tolak] simpan:", e instanceof Error ? e.message : e);
  }
}

export async function hapusAlasanTolak(userId: number): Promise<void> {
  try {
    await supabase().from("pengaturan_sistem").delete().eq("kunci", `${AWALAN}${userId}`);
  } catch {
    // Catatan basi tidak berbahaya — hanya tidak terhapus.
  }
}

export async function bacaAlasanTolak(userId: number): Promise<AlasanTolak | null> {
  try {
    const { data } = await supabase()
      .from("pengaturan_sistem")
      .select("nilai")
      .eq("kunci", `${AWALAN}${userId}`)
      .maybeSingle();
    return data ? urai(data.nilai) : null;
  } catch {
    return null;
  }
}

/** Semua alasan tersimpan, per id akun (untuk daftar HR). */
export async function semuaAlasanTolak(): Promise<Map<string, AlasanTolak>> {
  const peta = new Map<string, AlasanTolak>();
  try {
    const { data } = await supabase()
      .from("pengaturan_sistem")
      .select("kunci, nilai")
      .like("kunci", `${AWALAN}%`)
      .limit(1000);
    for (const r of data ?? []) {
      const a = urai(r.nilai);
      if (a) peta.set(String(r.kunci).slice(AWALAN.length), a);
    }
  } catch {
    // Tanpa alasan pun daftar tetap tampil.
  }
  return peta;
}

// ============================================================
// KARAKTER SAYA — akses data (server). Tabel karakter_pengguna (sql/78).
// Logika murni & validasi: src/lib/karakter-murni.ts.
// ============================================================

import { supabase } from "@/lib/supabase";
import { tabelBelumAda } from "@/lib/api-helper";
import { bacaKonfig, konfigBawaan, VERSI_KONFIG, type KonfigKarakter } from "@/lib/karakter-murni";

export class GalatKarakter extends Error {
  constructor(pesan: string, public status: number) {
    super(pesan);
  }
}

export type KarakterSaya = {
  konfig: KonfigKarakter;
  /** false = belum pernah memilih; konfig = rupa bawaan. */
  tersimpan: boolean;
  diperbarui: string | null;
};

export async function bacaKarakterSaya(userId: number): Promise<KarakterSaya> {
  const { data, error } = await supabase()
    .from("karakter_pengguna")
    .select("konfig, diperbarui")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (tabelBelumAda(error)) throw new GalatKarakter("Karakter Saya belum aktif (migrasi sql/78 belum dijalankan).", 503);
    console.error("[karakter] baca:", error.message);
    throw new GalatKarakter("Gagal membaca karakter.", 500);
  }
  const konfig = bacaKonfig(data?.konfig);
  return konfig
    ? { konfig, tersimpan: true, diperbarui: (data?.diperbarui as string | null) ?? null }
    : { konfig: konfigBawaan(userId), tersimpan: false, diperbarui: null };
}

export async function simpanKarakterSaya(userId: number, konfig: KonfigKarakter): Promise<KarakterSaya> {
  const diperbarui = new Date().toISOString();
  const { error } = await supabase()
    .from("karakter_pengguna")
    .upsert({ user_id: userId, konfig, versi: VERSI_KONFIG, diperbarui }, { onConflict: "user_id" });
  if (error) {
    if (tabelBelumAda(error)) throw new GalatKarakter("Karakter Saya belum aktif (migrasi sql/78 belum dijalankan).", 503);
    console.error("[karakter] simpan:", error.message);
    throw new GalatKarakter("Gagal menyimpan karakter.", 500);
  }
  return { konfig, tersimpan: true, diperbarui };
}

/** Rupa tersimpan banyak akun sekaligus (untuk daftar Online / chat). Akun tanpa baris tidak disertakan. */
export async function bacaKarakterBanyak(userIds: readonly number[]): Promise<Map<number, KonfigKarakter>> {
  const hasil = new Map<number, KonfigKarakter>();
  const ids = [...new Set(userIds.filter((n) => Number.isFinite(n)))];
  if (!ids.length) return hasil;
  const { data, error } = await supabase().from("karakter_pengguna").select("user_id, konfig").in("user_id", ids);
  if (error) {
    if (!tabelBelumAda(error)) console.error("[karakter] baca banyak:", error.message);
    return hasil;
  }
  for (const r of data ?? []) {
    const k = bacaKonfig(r.konfig);
    if (k) hasil.set(Number(r.user_id), k);
  }
  return hasil;
}

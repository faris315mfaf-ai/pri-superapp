// ============================================================
// Zona berjenjang (KHUSUS SISI SERVER) — spek 1.18/2.6.
//
// Keanggotaan grup chat divisi ditentukan CAKUPAN ZONA KETUA DIVISI:
// semua zona di bawah naungan zona si ketua (rekursif, lewat fungsi
// SQL zona_cakupan), BUKAN sekadar zona anggota masing-masing.
//
// Aturan aman: divisi tanpa ketua, ketua tanpa zona, atau anggota
// tanpa zona → perilaku LAMA dipertahankan (semua anggota divisi
// masuk grup). Zona adalah penyaring tambahan, bukan penghalang bagi
// yang belum ditata.
// ============================================================
import { supabase } from "@/lib/supabase";

/**
 * Daftar user_id anggota grup chat sebuah divisi menurut aturan zona.
 * Mengembalikan null bila aturan zona TIDAK berlaku (fallback lama:
 * semua anggota divisi) — pemanggil memperlakukan null = tanpa saringan.
 */
export async function anggotaGrupDivisi(divisi: string): Promise<Set<number> | null> {
  const db = supabase();

  // 1. Ketua divisi + zonanya.
  const { data: ketua } = await db
    .from("app_user")
    .select("id, zona_id")
    .eq("divisi", divisi)
    .eq("posisi_divisi", "kepala")
    .eq("aktif", true)
    .eq("status", "aktif")
    .limit(1)
    .maybeSingle();
  if (!ketua?.zona_id) return null; // aturan zona belum ditata → semua

  // 2. Cakupan zona ketua (rekursif di database).
  const { data: cakupan } = await db.rpc("zona_cakupan", { akar: ketua.zona_id });
  const zonaSah = new Set((cakupan ?? []).map((z: { id: number }) => Number(z.id)));
  if (zonaSah.size === 0) return null;

  // 3. Anggota divisi yang zonanya di dalam cakupan. Anggota TANPA
  //    zona ikut serta (belum ditata ≠ dikeluarkan), plus ketuanya
  //    sendiri selalu masuk.
  const { data: para } = await db
    .from("app_user")
    .select("id, zona_id")
    .eq("divisi", divisi)
    .eq("aktif", true)
    .eq("status", "aktif")
    .limit(1000);
  const hasil = new Set<number>();
  for (const a of para ?? []) {
    if (a.zona_id == null || zonaSah.has(Number(a.zona_id))) hasil.add(Number(a.id));
  }
  hasil.add(Number(ketua.id));
  return hasil;
}

/** true bila user boleh ikut grup divisi itu menurut aturan zona. */
export async function bolehIkutGrupDivisi(
  userId: number,
  divisi: string,
): Promise<boolean> {
  const anggota = await anggotaGrupDivisi(divisi);
  return anggota === null || anggota.has(userId);
}

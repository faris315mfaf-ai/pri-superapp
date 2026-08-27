// ============================================================
// Pembaca matriks izin fitur — KHUSUS SISI SERVER.
//
// Dipisah dari src/lib/fitur.ts (yang dipakai klien juga) karena
// file ini menyentuh Supabase dengan secret key.
// ============================================================
import { supabase } from "@/lib/supabase";
import { bolehFitur, type KunciFitur, type PetaIzin } from "@/lib/fitur";

/** Izin efektif satu peran: hanya memuat fitur yang DIMATIKAN. */
export async function izinPeran(peran: string): Promise<PetaIzin> {
  try {
    const { data } = await supabase()
      .from("fitur_izin")
      .select("fitur, aktif")
      .eq("peran", peran);
    const peta: PetaIzin = {};
    for (const b of data ?? []) {
      if (b.aktif === false) peta[b.fitur as KunciFitur] = false;
    }
    return peta;
  } catch {
    // Gagal membaca matriks tidak boleh mengunci aplikasi — anggap
    // semua fitur nyala (perilaku bawaan).
    return {};
  }
}

/**
 * Penjaga sisi server: lempar 403 bila fitur dimatikan untuk peran
 * pengguna ini. Menyembunyikan tombol di layar saja tidak cukup —
 * endpoint-nya masih bisa dipanggil langsung.
 */
export async function pastikanFiturAktif(
  user: { role: string; divisi?: string | null },
  kunci: KunciFitur,
  pesan?: string,
): Promise<void> {
  // Spek 1.16: fitur bisa dimatikan per PERAN dan per DIVISI — yang
  // paling ketat menang (mati di salah satunya = mati).
  const izin = await izinGabungan(user.role, user.divisi ?? null);
  if (!bolehFitur(izin, kunci, user.role)) {
    throw Object.assign(
      new Error(pesan ?? "Fitur ini sedang dimatikan untuk peran Anda."),
      { status: 403 },
    );
  }
}

/**
 * Izin efektif seseorang: pengecualian PERAN digabung pengecualian
 * DIVISI-nya (baris divisi disimpan dengan kunci "divisi:<nama>" di
 * kolom yang sama — spek 1.16, tanpa mengubah skema).
 */
export async function izinGabungan(
  peran: string,
  divisi: string | null,
): Promise<PetaIzin> {
  const [dariPeran, dariDivisi] = await Promise.all([
    izinPeran(peran),
    divisi ? izinPeran(`divisi:${divisi}`) : Promise.resolve({} as PetaIzin),
  ]);
  return { ...dariPeran, ...dariDivisi };
}

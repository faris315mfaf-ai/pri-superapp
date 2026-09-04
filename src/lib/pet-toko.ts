// ============================================================
// Toko Pet — sisi SERVER (5 Sep 2026): baca/simpan ketetapan master
// (harga per item & event item langka) di pengaturan_sistem `pet_toko`.
// ============================================================
import { supabase } from "@/lib/supabase";
import { KUNCI_PET_TOKO, tokoDariJson, TOKO_KOSONG, type PengaturanToko } from "@/lib/pet-katalog-v5";

export async function bacaToko(): Promise<PengaturanToko> {
  try {
    const { data } = await supabase().from("pengaturan_sistem").select("nilai").eq("kunci", KUNCI_PET_TOKO).maybeSingle();
    return data?.nilai ? tokoDariJson(String(data.nilai)) : TOKO_KOSONG;
  } catch {
    return TOKO_KOSONG;
  }
}

export async function simpanToko(toko: PengaturanToko): Promise<void> {
  const { error } = await supabase()
    .from("pengaturan_sistem")
    .upsert({ kunci: KUNCI_PET_TOKO, nilai: JSON.stringify(toko), diubah_pada: new Date().toISOString() }, { onConflict: "kunci" });
  if (error) throw new Error("Gagal menyimpan pengaturan toko pet.");
}

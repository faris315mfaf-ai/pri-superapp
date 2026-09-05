// ============================================================
// Lobi robot — sisi SERVER (5 Sep 2026): ukuran dunia bersama dan pembaca
// "tampilan robot" (rupa + barang tradable) seseorang untuk dikirim ke
// klien lobi (presence realtime / daftar polling).
// ============================================================
import { supabase } from "@/lib/supabase";
import { aksesorisDariKode, skinDariKode, sparepartDariKode, type JenisRobot } from "@/lib/pet";

/** Dunia lobi dalam SATUAN DUNIA — sama untuk desktop & HP (kamera yang menyesuaikan). */
export const DUNIA_LOBI = { lebar: 3200, tinggi: 2000 } as const;
export const KANAL_LOBI = "pet-lobi-v1";

export type BarisPetLobi = {
  user_id: number;
  jenis: JenisRobot;
  nama: string;
  xp: number;
  aksesoris_dimiliki: string[] | null;
  aksesoris_terpasang: Record<string, string> | null;
  sparepart_dimiliki: string[] | null;
  sparepart_terpasang: Record<string, string> | null;
  skin_dimiliki: string[] | null;
  skin_terpasang: string | null;
  warna_custom: string | null;
};
export const KOLOM_PET_LOBI =
  "user_id, jenis, nama, xp, aksesoris_dimiliki, aksesoris_terpasang, sparepart_dimiliki, sparepart_terpasang, skin_dimiliki, skin_terpasang, warna_custom";

export type ItemTradableLobi = { kode: string; jenis: "aksesoris" | "sparepart" | "skin"; nama: string; harga: number; terpasang: boolean };

/** Barang yang bisa diperdagangkan (dipakai pasar & lobi). */
export function inventoriTradableDari(b: BarisPetLobi | null): ItemTradableLobi[] {
  if (!b) return [];
  const hasil: ItemTradableLobi[] = [];
  const aksTerpasang = new Set(Object.values(b.aksesoris_terpasang ?? {}));
  const sprTerpasang = new Set(Object.values(b.sparepart_terpasang ?? {}));
  for (const k of b.aksesoris_dimiliki ?? []) {
    const a = aksesorisDariKode(k);
    if (a) hasil.push({ kode: k, jenis: "aksesoris", nama: a.nama, harga: a.harga, terpasang: aksTerpasang.has(k) });
  }
  for (const k of b.sparepart_dimiliki ?? []) {
    const s = sparepartDariKode(k);
    if (s) hasil.push({ kode: k, jenis: "sparepart", nama: s.nama, harga: s.harga, terpasang: sprTerpasang.has(k) });
  }
  for (const k of b.skin_dimiliki ?? []) {
    const s = skinDariKode(k);
    if (s) hasil.push({ kode: k, jenis: "skin", nama: s.nama, harga: s.harga, terpasang: b.skin_terpasang === k });
  }
  return hasil;
}

export type TampilanRobot = {
  user_id: string;
  nama_pemilik: string;
  nama_robot: string;
  jenis: JenisRobot;
  level: number;
  skin: string | null;
  warna: string | null;
  terpasang: Record<string, string>;
  sparepart: Record<string, string>;
  tradable: ItemTradableLobi[];
};

export function tampilanDari(b: BarisPetLobi, namaPemilik: string): TampilanRobot {
  return {
    user_id: String(b.user_id),
    nama_pemilik: namaPemilik,
    nama_robot: b.nama,
    jenis: b.jenis,
    level: Math.max(1, Math.floor(Number(b.xp ?? 0) / 100) + 1),
    skin: b.skin_terpasang,
    warna: b.warna_custom,
    terpasang: b.aksesoris_terpasang ?? {},
    sparepart: b.sparepart_terpasang ?? {},
    tradable: inventoriTradableDari(b),
  };
}

/** Tampilan robot seseorang; null bila belum punya robot. */
export async function bacaTampilanRobot(uid: number, namaPemilik: string): Promise<TampilanRobot | null> {
  const { data } = await supabase().from("pet_robot").select(KOLOM_PET_LOBI).eq("user_id", uid).maybeSingle();
  return data ? tampilanDari(data as BarisPetLobi, namaPemilik) : null;
}

// ============================================================
// KATEGORI SELESAI = DISEMBUNYIKAN (26 Sep 2026) — KHUSUS SERVER.
//
// Permintaan user: di TV Rakyat Official, kategori yang diklik "Selesai"
// BUKAN dihapus — disimpan & disembunyikan, dan bisa dimunculkan lagi
// oleh Pimpinan Redaksi / Superadmin.
//
// Tempat menyimpannya: kolom keyword_wajib.selesai (sql/51) bila sudah
// dipasang; bila belum (database cloud saat ini), catatan JSON
// {id: waktu} di pengaturan_sistem.kategori_selesai. Dulu tanpa kolom
// itu tombol Selesai selalu gagal (503) — kini jalan di kedua keadaan.
// Baris kategori, laporan, unggahan, dan angka tidak pernah disentuh.
// ============================================================
import { supabase } from "@/lib/supabase";
import { kolomTabelAda } from "@/lib/kolom-struktur";

const KUNCI = "kategori_selesai";

function uraiPeta(teks: unknown): Record<string, string> {
  if (typeof teks !== "string" || !teks.trim()) return {};
  try {
    const o = JSON.parse(teks) as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    const hasil: Record<string, string> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (/^\d+$/.test(k)) hasil[k] = typeof v === "string" ? v : "";
    }
    return hasil;
  } catch {
    return {};
  }
}

/** id kategori → kapan diselesaikan (ISO; "" bila tidak tercatat). */
export async function petaKategoriSelesai(): Promise<Map<string, string>> {
  const db = supabase();
  if (await kolomTabelAda("keyword_wajib", "selesai")) {
    const { data } = await db.from("keyword_wajib").select("id, selesai_pada").eq("selesai", true);
    return new Map((data ?? []).map((r) => [String(r.id), r.selesai_pada ? String(r.selesai_pada) : ""]));
  }
  const { data } = await db.from("pengaturan_sistem").select("nilai").eq("kunci", KUNCI).maybeSingle();
  return new Map(Object.entries(uraiPeta(data?.nilai)));
}

/** Tandai selesai (disembunyikan) / munculkan lagi. Melempar 404 bila kategorinya tidak ada. */
export async function ubahKategoriSelesai(id: number, selesai: boolean): Promise<void> {
  const db = supabase();
  const { data: ada } = await db.from("keyword_wajib").select("id").eq("id", id).maybeSingle();
  if (!ada) throw Object.assign(new Error("Kategori tidak ditemukan."), { status: 404 });
  const kini = new Date().toISOString();
  if (await kolomTabelAda("keyword_wajib", "selesai")) {
    const { error } = await db
      .from("keyword_wajib")
      .update({ selesai, selesai_pada: selesai ? kini : null })
      .eq("id", id);
    if (error) throw new Error("Gagal mengubah kategori.");
    return;
  }
  const { data } = await db.from("pengaturan_sistem").select("nilai").eq("kunci", KUNCI).maybeSingle();
  const peta = uraiPeta(data?.nilai);
  if (selesai) peta[String(id)] = kini;
  else delete peta[String(id)];
  const { error } = await db
    .from("pengaturan_sistem")
    .upsert({ kunci: KUNCI, nilai: JSON.stringify(peta) }, { onConflict: "kunci" });
  if (error) throw new Error("Gagal menyimpan status kategori.");
}

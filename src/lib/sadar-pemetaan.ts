// ============================================================
// PEMETAAN MANUAL akun SuperApp ↔ pegawai SADAR (28 Sep 2026). SERVER.
//
// Dulu hanya tabel sadar_pemetaan (sql/54) — yang BELUM ada di database
// cloud, sehingga tombol "Pasangkan" di Pencocokan SADAR selalu gagal
// (503) dan 136 dari 176 pegawai tidak pernah bisa dipasangkan. Kini:
// tabel dipakai bila sudah ada; bila belum, pemetaan disimpan sebagai
// JSON di pengaturan_sistem.sadar_pemetaan. Aturannya sama di keduanya:
// satu akun satu pegawai, satu pegawai satu akun.
// ============================================================
import { supabase } from "@/lib/supabase";

export type Pemetaan = {
  user_id: number;
  kode_pegawai: string;
  email_sadar: string;
  nama_sadar: string;
  dibuat_oleh_id: number | null;
  dibuat_pada: string | null;
};

const KUNCI = "sadar_pemetaan";
const TTL_MS = 30_000;

let cekTabel: { ada: boolean; pada: number } | null = null;
let cache: { isi: Pemetaan[]; pada: number } | null = null;

/** Tabel sadar_pemetaan (sql/54) sudah ada? Dicek ulang tiap 5 menit. */
async function tabelAda(): Promise<boolean> {
  if (cekTabel && Date.now() - cekTabel.pada < 300_000) return cekTabel.ada;
  const { error } = await supabase().from("sadar_pemetaan").select("user_id").limit(1);
  const ada = !(error && (error.code === "PGRST205" || error.code === "42P01"));
  cekTabel = { ada, pada: Date.now() };
  return ada;
}

function bersih(p: Partial<Pemetaan> & { user_id?: unknown; kode_pegawai?: unknown }): Pemetaan | null {
  const user_id = Number(p.user_id);
  const kode_pegawai = String(p.kode_pegawai ?? "").trim();
  if (!Number.isFinite(user_id) || user_id <= 0 || !kode_pegawai) return null;
  return {
    user_id,
    kode_pegawai,
    email_sadar: String(p.email_sadar ?? ""),
    nama_sadar: String(p.nama_sadar ?? ""),
    dibuat_oleh_id: p.dibuat_oleh_id == null ? null : Number(p.dibuat_oleh_id),
    dibuat_pada: p.dibuat_pada ? String(p.dibuat_pada) : null,
  };
}

async function bacaJson(): Promise<Pemetaan[]> {
  const { data } = await supabase().from("pengaturan_sistem").select("nilai").eq("kunci", KUNCI).maybeSingle();
  if (!data?.nilai) return [];
  try {
    const o = JSON.parse(String(data.nilai)) as unknown;
    return Array.isArray(o) ? o.map((x) => bersih(x as Partial<Pemetaan>)).filter((x): x is Pemetaan => x !== null) : [];
  } catch {
    return [];
  }
}

async function tulisJson(isi: Pemetaan[]): Promise<void> {
  const { error } = await supabase()
    .from("pengaturan_sistem")
    .upsert({ kunci: KUNCI, nilai: JSON.stringify(isi) }, { onConflict: "kunci" });
  if (error) throw new Error("Gagal menyimpan pemetaan SADAR.");
}

/** Seluruh pemetaan manual (di-cache 30 dtk; dikosongkan tiap ada perubahan). */
export async function semuaPemetaan(): Promise<Pemetaan[]> {
  if (cache && Date.now() - cache.pada < TTL_MS) return cache.isi;
  let isi: Pemetaan[];
  if (await tabelAda()) {
    const { data, error } = await supabase()
      .from("sadar_pemetaan")
      .select("user_id, kode_pegawai, email_sadar, nama_sadar, dibuat_oleh_id, dibuat_pada");
    isi = error ? [] : (data ?? []).map((x) => bersih(x)).filter((x): x is Pemetaan => x !== null);
  } else {
    isi = await bacaJson();
  }
  cache = { isi, pada: Date.now() };
  return isi;
}

export type PasanganBaru = { user_id: number; kode_pegawai: string; email_sadar: string; nama_sadar: string };

/**
 * Pasang (atau pindahkan) pemetaan. Pemetaan lama yang memakai akun ATAU
 * kode yang sama dilepas lebih dulu. Mengembalikan pemetaan lama yang
 * tergantikan (untuk menulis ulang cermin absensinya).
 */
/**
 * MURNI (diuji): gabungkan pemetaan lama dengan yang baru, tetap
 * satu-lawan-satu. Dalam satu kiriman pun yang terakhir menang.
 */
export function gabungPemetaan(
  lama: Pemetaan[],
  baru: PasanganBaru[],
  olehId: number,
  kini: string,
): { isiBaru: Pemetaan[]; tetap: Pemetaan[]; tergantikan: Pemetaan[] } {
  const perKode = new Map<string, PasanganBaru>();
  const perUser = new Map<number, string>();
  for (const b of baru) {
    const lamaKode = perUser.get(b.user_id);
    if (lamaKode) perKode.delete(lamaKode);
    const lamaUser = perKode.get(b.kode_pegawai)?.user_id;
    if (lamaUser !== undefined) perUser.delete(lamaUser);
    perKode.set(b.kode_pegawai, b);
    perUser.set(b.user_id, b.kode_pegawai);
  }
  const isiBaru: Pemetaan[] = [...perKode.values()].map((b) => ({ ...b, dibuat_oleh_id: olehId, dibuat_pada: kini }));
  const tergantikan = lama.filter((l) => perKode.has(l.kode_pegawai) || perUser.has(l.user_id));
  const tetap = lama.filter((l) => !perKode.has(l.kode_pegawai) && !perUser.has(l.user_id));
  return { isiBaru, tetap, tergantikan };
}

export async function pasangPemetaan(baru: PasanganBaru[], olehId: number): Promise<Pemetaan[]> {
  const lama = await semuaPemetaan();
  const { isiBaru, tetap, tergantikan } = gabungPemetaan(lama, baru, olehId, new Date().toISOString());
  cache = null;
  if (await tabelAda()) {
    const db = supabase();
    for (const l of tergantikan) await db.from("sadar_pemetaan").delete().eq("user_id", l.user_id);
    for (let i = 0; i < isiBaru.length; i += 200) {
      const potong = isiBaru.slice(i, i + 200).map((p) => ({
        user_id: p.user_id,
        kode_pegawai: p.kode_pegawai,
        email_sadar: p.email_sadar,
        nama_sadar: p.nama_sadar,
        dibuat_oleh_id: p.dibuat_oleh_id,
      }));
      const { error } = await db.from("sadar_pemetaan").insert(potong);
      if (error) throw new Error("Gagal menyimpan pemetaan SADAR.");
    }
  } else {
    await tulisJson([...tetap, ...isiBaru]);
  }
  cache = null;
  return tergantikan;
}

/** Lepas pemetaan satu akun. null bila akun itu tidak punya pemetaan. */
export async function lepasPemetaan(userId: number): Promise<Pemetaan | null> {
  const lama = await semuaPemetaan();
  const milik = lama.find((l) => l.user_id === userId) ?? null;
  if (!milik) return null;
  cache = null;
  if (await tabelAda()) {
    await supabase().from("sadar_pemetaan").delete().eq("user_id", userId);
  } else {
    await tulisJson(lama.filter((l) => l.user_id !== userId));
  }
  cache = null;
  return milik;
}

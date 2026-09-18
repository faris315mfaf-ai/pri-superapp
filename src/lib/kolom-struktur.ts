// ============================================================
// Penjaga kolom opsional di `app_user` — KHUSUS SERVER.
//
// Beberapa kolom ditambah lewat migrasi belakangan (sql/43 struktur_lain,
// sql/46 jabatan_tvr). Sampai SQL itu dijalankan di database, kolomnya
// belum ada — dan PostgREST menolak dengan 400 setiap kali kolom yang
// tidak ada disebut. Kalau kode langsung menyebutnya, login dan sesi
// gagal diam-diam (terlihat seperti "sandi salah").
//
// Jadi keberadaan kolom DIPERIKSA sekali per instansi server, lalu
// diingat. Belum ada kolomnya = aplikasi berjalan tanpa kolom itu,
// tanpa galat. Sudah ada = fiturnya langsung menyala.
// ============================================================
import { supabase } from "@/lib/supabase";

const jawaban = new Map<string, boolean>();
const sedangPeriksa = new Map<string, Promise<boolean>>();

/** Nama kolom yang ditolak PostgREST karena belum ada di schema. */
export function namaKolomHilang(pesan: string): string | null {
  const a = /Could not find the '([^']+)' column/i.exec(pesan);
  if (a?.[1]) return a[1];
  const b = /column \w+\.([a-z0-9_]+) does not exist/i.exec(pesan);
  return b?.[1] ?? null;
}

/**
 * INSERT yang mengulang tanpa kolom yang belum ada di database.
 * Dipakai riwayat TVR Saya: migrasi sql/46+57 (keyword, penyedia, …)
 * sering belum dijalankan, dan kegagalan insert sebelumnya hanya dicatat
 * di log — video terbit di sosmed tapi riwayat/KPI tetap kosong.
 */
export async function sisipkanLonggar(
  tabel: string,
  isi: Record<string, unknown>,
): Promise<{ data: { id: number } | null; error: { message: string; code?: string } | null }> {
  const payload: Record<string, unknown> = { ...isi };
  let terakhir: { message: string; code?: string } | null = null;
  for (let i = 0; i < 8; i += 1) {
    const { data, error } = await supabase()
      .from(tabel)
      .insert(payload)
      .select("id")
      .single();
    if (!error) return { data: data as { id: number }, error: null };
    terakhir = error;
    const kolom = namaKolomHilang(error.message);
    if (!kolom || !(kolom in payload)) break;
    delete payload[kolom];
    jawaban.set(`${tabel}.${kolom}`, false);
  }
  return { data: null, error: terakhir };
}

/** true bila kolom `tabel.nama` sudah terpasang di database. */
export async function kolomTabelAda(tabel: string, nama: string): Promise<boolean> {
  const kunci = `${tabel}.${nama}`;
  const cache = jawaban.get(kunci);
  if (cache !== undefined) return cache;
  const jalan = sedangPeriksa.get(kunci);
  if (jalan) return jalan;
  const p = (async () => {
    try {
      const { error } = await supabase().from(tabel).select(nama).limit(1);
      const ok = !error;
      jawaban.set(kunci, ok);
      return ok;
    } catch {
      jawaban.set(kunci, false);
      return false;
    } finally {
      sedangPeriksa.delete(kunci);
    }
  })();
  sedangPeriksa.set(kunci, p);
  return p;
}

/** true bila kolom `app_user.<nama>` sudah terpasang di database. */
export async function kolomAppUserAda(nama: string): Promise<boolean> {
  return kolomTabelAda("app_user", nama);
}

/** true bila kolom `struktur_lain` sudah terpasang di database. */
export async function kolomStrukturLainAda(): Promise<boolean> {
  return kolomAppUserAda("struktur_lain");
}

/** true bila kolom `jabatan_tvr` sudah terpasang di database. */
export async function kolomJabatanTvrAda(): Promise<boolean> {
  return kolomAppUserAda("jabatan_tvr");
}

/**
 * Potongan " , struktur_lain" untuk ditempel di daftar kolom select —
 * kosong bila kolomnya belum ada.
 */
export async function kolomStrukturSelect(): Promise<string> {
  return (await kolomStrukturLainAda()) ? ", struktur_lain" : "";
}

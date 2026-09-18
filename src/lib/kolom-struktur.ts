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

// ============================================================
// PRI SuperApp — Siaran pengumuman ke WhatsApp (KHUSUS SISI SERVER)
//
// Saat admin menyalakan toggle "Kirim juga ke WhatsApp" pada pengumuman,
// isi pengumuman dikirim ke nomor WhatsApp SEMUA penerima lewat Convia
// (WABA resmi). Dipakai antara lain untuk mengejar kuota pesan harian
// Convia.
//
// PENTING (aturan WABA): pesan proaktif ke nomor yang belum pernah chat
// WAJIB lewat TEMPLATE yang disetujui Meta. Karena itu siaran ini hanya
// jalan bila conviaPengumumanAktif() (env CONVIA_PENGUMUMAN_AKTIF=true +
// template terpasang). Bila belum, siaran DILEWATI dengan jujur — kita
// sengaja TIDAK memakai gateway tak resmi untuk broadcast massal karena
// berisiko nomor diblokir WhatsApp.
//
// Tidak melempar ke pemanggil: gagalnya siaran WA tidak boleh
// menggagalkan pengumuman yang sudah tersimpan (dijalankan lewat after()).
// ============================================================
import { supabase } from "@/lib/supabase";
import {
  conviaPengumumanAktif,
  kirimPengumumanTemplate,
  nomorWaSah,
  normalkanNomorWa,
} from "@/lib/convia";
import { kirimBerkelompok } from "@/lib/notifikasi";

export type HasilSiaranWa = {
  /** Apakah gerbang Convia pengumuman menyala (template siap). */
  aktif: boolean;
  /** Jumlah nomor sah & unik yang dituju. */
  target: number;
  /** Berhasil terkirim. */
  terkirim: number;
  /** Gagal terkirim. */
  gagal: number;
  /** Diisi bila aktif=false — kenapa siaran dilewati. */
  alasanLewat?: string;
};

/**
 * Kirim satu pengumuman ke WhatsApp daftar penerima (per user id).
 * Nomor diambil dari app_user.nomor_wa; hanya nomor sah & unik yang
 * dikirimi (hindari kirim dobel ke nomor yang sama).
 */
export async function siarkanPengumumanKeWa(
  penerimaIds: number[],
  judul: string,
  isi: string,
): Promise<HasilSiaranWa> {
  if (!conviaPengumumanAktif()) {
    return {
      aktif: false,
      target: 0,
      terkirim: 0,
      gagal: 0,
      alasanLewat:
        "Template pengumuman Convia belum diaktifkan (CONVIA_PENGUMUMAN_AKTIF).",
    };
  }
  if (penerimaIds.length === 0) {
    return { aktif: true, target: 0, terkirim: 0, gagal: 0 };
  }

  const db = supabase();
  const { data } = await db
    .from("app_user")
    .select("nomor_wa")
    .in("id", penerimaIds);

  const nomorUnik = Array.from(
    new Set(
      (data ?? [])
        .map((u) => (u.nomor_wa ?? "").trim())
        .filter((n) => n && nomorWaSah(n))
        .map((n) => normalkanNomorWa(n)),
    ),
  );

  let terkirim = 0;
  let gagal = 0;
  await kirimBerkelompok(nomorUnik, async (nomor) => {
    try {
      await kirimPengumumanTemplate(nomor, judul, isi);
      terkirim += 1;
    } catch (e) {
      gagal += 1;
      console.error(
        "[pengumuman-wa] gagal kirim ke",
        nomor,
        e instanceof Error ? e.message : e,
      );
    }
  });

  console.log(
    `[pengumuman-wa] siaran selesai: ${terkirim} terkirim, ${gagal} gagal dari ${nomorUnik.length} nomor`,
  );
  return { aktif: true, target: nomorUnik.length, terkirim, gagal };
}

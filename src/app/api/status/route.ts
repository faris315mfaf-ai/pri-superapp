// GET /api/status — "siapa yang sedang online" + "bagaimana keadaan server",
// untuk SEMUA anggota yang sudah masuk (12 Sep 2026).
//
// Dibuka dari beranda dengan mengetuk foto profil di pojok kanan atas.
//
// Kenapa dibuka untuk semua, bukan hanya master: sejak aplikasi berjalan di
// server milik sendiri, keadaan server adalah keadaan bersama. Kalau aplikasi
// terasa berat, siapa pun bisa melihat sendiri apakah servernya memang sedang
// sibuk — tanpa perlu bertanya dan tanpa perlu menunggu jawaban.
//
// Yang TIDAK dibuka di sini: apa pun yang menyangkut biaya, kunci, saldo,
// atau daftar galat. Itu tetap hanya di Panel Master (/api/master/server).
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { daftarHadir } from "@/lib/kehadiran";
import { supabase } from "@/lib/supabase";
import { bacaMetrikServer } from "@/lib/metrik-server";
import { deskripsiStruktur } from "@/lib/struktur";
import { PERAN_TERSEMBUNYI_IN } from "@/lib/peran";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** Paling banyak sekian nama yang ditampilkan; sisanya cukup dihitung. */
const BATAS_NAMA = 120;

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanMasuk(request);

    const idHadir = await daftarHadir().catch(() => [] as string[]);
    const nomor = idHadir
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0)
      .slice(0, BATAS_NAMA);

    // Peran tersembunyi (master/superadmin) TIDAK ikut ditampilkan di sini,
    // sama seperti di layar lain — akun itu memang tidak terlihat anggota.
    const { data: orang } = nomor.length
      ? await supabase()
          .from("app_user")
          .select("id, nama, avatar_url, jabatan, bidang_jabatan, divisi, sub_divisi, posisi_divisi, jabatan_sayap")
          .in("id", nomor)
          .not("role", "in", PERAN_TERSEMBUNYI_IN)
      : { data: [] as Record<string, unknown>[] };

    const daftar = (orang ?? [])
      .map((o) => ({
        id: String(o.id),
        nama: String(o.nama ?? ""),
        avatar_url: String(o.avatar_url ?? ""),
        struktur: deskripsiStruktur(o as Parameters<typeof deskripsiStruktur>[0]),
      }))
      .sort((a, b) => a.nama.localeCompare(b.nama, "id"));

    // Keadaan server: hanya angka pemakaian, tanpa rincian teknis lain.
    const { server } = await bacaMetrikServer();

    return {
      online: {
        // Jumlah dihitung dari daftar hadir apa adanya, jadi tetap benar
        // walau sebagian namanya tidak ditampilkan.
        jumlah: idHadir.length,
        orang: daftar,
      },
      server: server
        ? {
            cpu_persen: server.cpu_persen,
            cpu_inti: server.cpu_inti,
            ram_persen: server.ram_persen,
            ram_total: server.ram_total,
            ram_terpakai: server.ram_terpakai,
            disk_persen: server.disk_persen,
            beban_1m: server.beban_1m,
            diambil_pada: server.diambil_pada,
          }
        : null,
    };
  });
}

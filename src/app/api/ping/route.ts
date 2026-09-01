// GET /api/ping — titik ukur LATENSI untuk ikon sinyal (1 Sep 2026).
//
// SENGAJA tanpa autentikasi dan TANPA menyentuh database: dipanggil
// berkala oleh ratusan perangkat, jadi harus semurah mungkin. Yang
// diukur klien = bolak-balik jaringan + waktu fungsi Vercel — cukup
// untuk mendeteksi "aplikasi berat" lebih dini (saat platform padat,
// angka ini ikut membengkak). Kesehatan database tetap urusan
// /api/sehat (dipakai pemantau luar, bukan tiap perangkat).
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { t: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// GET /api/hidup — "apakah proses aplikasinya masih hidup?"
//
// SENGAJA TIDAK menyentuh database, Redis, atau layanan luar mana pun.
//
// Kenapa terpisah dari /api/sehat: /api/sehat menjawab 503 saat database
// bermasalah, dan itu memang benar untuk memantau keadaan sistem. Tapi
// kalau jawaban itu dipakai Docker sebagai penanda sehat, akibatnya
// terbalik — database ngadat sebentar membuat container aplikasi ikut
// dimulai ulang berkali-kali, padahal memulai ulang aplikasi sama sekali
// tidak memperbaiki database, malah memutus pengguna yang sedang membuka
// halaman yang tidak butuh database.
//
// Jadi: pakai /api/hidup untuk "proses ini masih melayani permintaan",
// dan /api/sehat untuk "seluruh sistem baik-baik saja".
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { hidup: true, waktu: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// GET /.well-known/assetlinks.json — Digital Asset Links.
//
// Berkas ini yang membuat APK PRI SuperApp membuka situs secara PENUH
// tanpa bilah alamat Chrome. Android mengambilnya dari domain ini lalu
// mencocokkan sidik jari di bawah dengan sidik jari kunci penanda
// tangan APK yang terpasang. Kalau tidak cocok (atau berkas ini tidak
// ada), aplikasi tetap jalan tapi memakai tampilan Custom Tab yang
// menampilkan alamat situs di atas — terlihat seperti peramban, bukan
// aplikasi.
//
// Sidik jari di bawah berasal dari apk/pri-superapp.keystore.
// Kalau keystore diganti, angka ini WAJIB ikut diperbarui, jika tidak
// aplikasi yang sudah terpasang akan kembali menampilkan bilah alamat.
export const dynamic = "force-static";

const SIDIK_JARI_APK =
  "31:7F:F7:5E:46:89:C2:E5:B6:AA:85:F3:6A:3C:DC:F7:C6:01:70:51:7C:37:BE:2C:1C:21:F2:DB:04:6F:32:C1";

export function GET() {
  const isi = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "id.pri.superapp",
        sha256_cert_fingerprints: [SIDIK_JARI_APK],
      },
    },
  ];

  return new Response(JSON.stringify(isi, null, 2), {
    headers: {
      "Content-Type": "application/json",
      // Boleh di-cache lama; isinya hanya berubah bila kunci diganti.
      "Cache-Control": "public, max-age=3600",
    },
  });
}

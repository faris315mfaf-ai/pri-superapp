// Uji bagian murni Video Internal (17 Okt 2026). Tanpa jaringan/database.
// Jalankan: npx tsx tests/uji-video-internal.mts
import {
  bacaSumberInternal,
  batasBerlakuOfficial,
  cekBatasBerlaku,
  httpsPublik,
  kedaluwarsaUrlMs,
  kunciPustakaSah,
  linkVideoLangsung,
  MARGIN_JADWAL_MS,
  MARGIN_SIAP_MS,
  normalIdInternal,
  penandaInternal,
} from "@/lib/video-internal";

let lulus = 0;
let gagal = 0;
const cek = (n: string, ok: boolean, i?: unknown) => {
  if (ok) {
    lulus++;
    console.log("  ✔", n);
  } else {
    gagal++;
    console.log("  ✘", n, i !== undefined ? JSON.stringify(i) : "");
  }
};
const status = (f: () => unknown): number | "OK" => {
  try {
    f();
    return "OK";
  } catch (e) {
    return Number((e as { status?: number }).status);
  }
};

const UUID = "3f1c2a4e-9b7d-4c1e-8a2b-0123456789ab";

console.log("\n[A] bacaSumberInternal");
cek("undefined → null", bacaSumberInternal(undefined) === null);
cek("null → null", bacaSumberInternal(null) === null);
cek("wajib id angka diterima", JSON.stringify(bacaSumberInternal({ jenis: "wajib", id: "12" })) === JSON.stringify({ jenis: "wajib", id: "12" }));
cek("wajib id number diterima", bacaSumberInternal({ jenis: "wajib", id: 7 })?.id === "7");
cek("official kode diterima", bacaSumberInternal({ jenis: "official", id: "vid-stok-abc-12x" })?.id === "vid-stok-abc-12x");
cek("pustaka uuid dinormalkan huruf kecil", bacaSumberInternal({ jenis: "pustaka", id: UUID.toUpperCase() })?.id === UUID);
cek("jenis asing → 400", status(() => bacaSumberInternal({ jenis: "galeri", id: "1" })) === 400);
cek("bukan objek → 400", status(() => bacaSumberInternal("wajib:1")) === 400);
cek("array → 400", status(() => bacaSumberInternal([])) === 400);
cek("wajib id 0 → 400", status(() => bacaSumberInternal({ jenis: "wajib", id: "0" })) === 400);
cek("wajib id bukan angka → 400", status(() => bacaSumberInternal({ jenis: "wajib", id: "1 or 1=1" })) === 400);
cek("pustaka id bukan uuid → 400", status(() => bacaSumberInternal({ jenis: "pustaka", id: "12" })) === 400);
cek("official kode berisi koma/kurung → 400", status(() => bacaSumberInternal({ jenis: "official", id: "a,b)" })) === 400);
cek("id kosong → 400", status(() => bacaSumberInternal({ jenis: "official", id: "" })) === 400);

console.log("\n[B] penanda & id");
cek("penanda stabil", penandaInternal("wajib", "12") === "wajib:12");
cek("normalId official menolak spasi", normalIdInternal("official", "a b") === null);
cek("normalId wajib menolak angka raksasa", normalIdInternal("wajib", "1".repeat(30)) === null);

console.log("\n[C] tautan");
cek("https publik sah", httpsPublik("https://cdn.contoh.id/v.mp4"));
cek("http ditolak", !httpsPublik("http://cdn.contoh.id/v.mp4"));
cek("localhost ditolak", !httpsPublik("https://localhost/v.mp4"));
cek("10.x ditolak", !httpsPublik("https://10.77.0.2:7700/v.mp4"));
cek("169.254 ditolak", !httpsPublik("https://169.254.169.254/latest"));
cek("IPv6 ditolak", !httpsPublik("https://[::1]/v.mp4"));
cek("link .mp4 langsung sah", linkVideoLangsung("https://cdn.contoh.id/bahan/v.MP4?x=1"));
cek("link Drive ditolak", !linkVideoLangsung("https://drive.google.com/file/d/abc/view"));
cek("link kosong ditolak", !linkVideoLangsung(""));

console.log("\n[D] kedaluwarsa URL");
const r2 =
  "https://akun.r2.cloudflarestorage.com/b/k.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20261017T100000Z&X-Amz-Expires=3600&X-Amz-SignedHeaders=host&X-Amz-Signature=ab";
cek("SigV4 terbaca", kedaluwarsaUrlMs(r2) === Date.UTC(2026, 9, 17, 11, 0, 0));
const exp = Math.floor(Date.UTC(2026, 9, 20, 0, 0, 0) / 1000);
const jwt = ["eyJhbGciOiJIUzI1NiJ9", Buffer.from(JSON.stringify({ url: "tvrku/x.mp4", exp })).toString("base64url"), "sig"].join(".");
const sb = `https://db.contoh.id/storage/v1/object/sign/tvrku/x.mp4?token=${jwt}`;
cek("token Supabase terbaca", kedaluwarsaUrlMs(sb) === exp * 1000);
cek("URL biasa → null", kedaluwarsaUrlMs("https://res.cloudinary.com/x/video/upload/v.mp4") === null);
cek("token rusak → null", kedaluwarsaUrlMs("https://db.contoh.id/storage/v1/object/sign/a?token=xx.yy.zz") === null);
cek("bukan URL → null", kedaluwarsaUrlMs("bukan url") === null);

console.log("\n[E] batas berlaku Official");
const kini = Date.UTC(2026, 9, 17, 9, 0, 0);
cek("ambil yang paling awal", batasBerlakuOfficial("2026-10-17T10:30:00Z", r2) === Date.UTC(2026, 9, 17, 10, 30, 0));
cek("URL lebih awal menang", batasBerlakuOfficial("2026-10-18T00:00:00Z", r2) === Date.UTC(2026, 9, 17, 11, 0, 0));
cek("tanpa batas → null", batasBerlakuOfficial(null, "https://cdn.contoh.id/v.mp4") === null);
cek("tanpa batas → aman", cekBatasBerlaku(null, kini + 99 * 86_400_000, kini) === null);
cek("hampir hilang → ditolak", cekBatasBerlaku(kini + MARGIN_SIAP_MS - 1, null, kini) !== null);
cek("posting langsung masih aman", cekBatasBerlaku(kini + 3600_000, null, kini) === null);
const batas = kini + 5 * 3600_000;
cek("jadwal sebelum batas-margin aman", cekBatasBerlaku(batas, batas - MARGIN_JADWAL_MS, kini) === null);
cek("jadwal melewati batas-margin ditolak", cekBatasBerlaku(batas, batas - MARGIN_JADWAL_MS + 1, kini) !== null);

console.log("\n[F] kunci Pustaka");
cek("kunci milik sendiri sah", kunciPustakaSah("pustaka-video/4/1760000000000-abcdef012345.mp4", 4));
cek("kunci orang lain ditolak", !kunciPustakaSah("pustaka-video/5/1.mp4", 4));
cek("awalan uid parsial ditolak", !kunciPustakaSah("pustaka-video/41/1.mp4", 4));
cek("traversal ditolak", !kunciPustakaSah("pustaka-video/4/../../4/x.mp4", 4));
cek("awalan lain ditolak", !kunciPustakaSah("video-wajib/4/x.mp4", 4));
cek("karakter aneh ditolak", !kunciPustakaSah("pustaka-video/4/x y.mp4", 4));

console.log(`\n${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);

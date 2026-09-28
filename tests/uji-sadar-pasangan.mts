// Uji saran pasangan akun SuperApp ↔ pegawai SADAR (lib/sadar-pasangan, 28 Sep 2026).
// Jalankan: npx tsx tests/uji-sadar-pasangan.mts
import { kataNama, namaNormal, skorNama, susunSaran } from "@/lib/sadar-pasangan";
import { gabungPemetaan, type Pemetaan } from "@/lib/sadar-pemetaan";
import { petaEmailDariAkun } from "@/lib/absensi-sadar";

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

console.log("normalisasi nama");
cek("M. = Muhammad", namaNormal("M. Rasendri Hadianto") === "muhammad rasendri hadianto", namaNormal("M. Rasendri Hadianto"));
cek("Moh./Muh./Mochammad = Muhammad", ["Moh. Rizki", "Muh Rizki", "Mochammad Rizki", "MUHAMAD RIZKI"].every((n) => namaNormal(n) === "muhammad rizki"));
cek("gelar di belakang koma dibuang", namaNormal("Siti Aisyah, S.Pd") === "siti aisyah");
cek("gelar tanpa koma dibuang (S. Pd / S.Kom)", namaNormal("Siti Aisyah S. Pd") === "siti aisyah" && namaNormal("Budi S.Kom") === "budi");
cek("gelar depan dibuang", namaNormal("Dr. H. Ahmad Fauzi") === "ahmad fauzi" && namaNormal("Hj. Rina") === "rina");
cek("'M. Ali' TIDAK menjadi 'mali'", namaNormal("M. Ali") === "muhammad ali", namaNormal("M. Ali"));
cek("huruf aksen & besar kecil", namaNormal("  ANDRÉ   Wijaya ") === "andre wijaya");
cek("kosong aman", kataNama("").length === 0 && kataNama(null as unknown as string).length === 0);

console.log("skor kemiripan");
cek("sama persis = 1", skorNama("Nanda Putri Azhara", "nanda putri azhara") === 1);
cek("singkatan M. = 1", skorNama("M. Rasendri Hadianto", "Muhammad Rasendri Hadianto") === 1);
cek("ditulis rapat ≈ 0.97", skorNama("Destyhelmiati", "Desty Helmiati") === 0.97);
cek("nama lebih pendek terkandung ≥ 0.85", skorNama("Rasendri Hadianto", "Muhammad Rasendri Hadianto") >= 0.85, skorNama("Rasendri Hadianto", "Muhammad Rasendri Hadianto"));
cek("salah ketik 1 huruf tetap mirip", skorNama("Akhmad Satria Risky", "Akhmad Satria Rizky") >= 0.9, skorNama("Akhmad Satria Risky", "Akhmad Satria Rizky"));
cek("hanya kata depan sama (Muhammad) → bukan saran", skorNama("Muhammad Ali", "Muhammad Rizki") < 0.6, skorNama("Muhammad Ali", "Muhammad Rizki"));
cek("satu kata saja sama → bukan saran", skorNama("Siti", "Siti Aisyah Rahma") < 0.6, skorNama("Siti", "Siti Aisyah Rahma"));
cek("orang berbeda → rendah", skorNama("Godam Usa Putra", "Nanda Putri Azhara") < 0.3);
cek("Putra ≠ Putri (akhiran beda = orang beda)", skorNama("Nanda Putra", "Nanda Putri") < 0.6, skorNama("Nanda Putra", "Nanda Putri"));

console.log("susun saran satu-lawan-satu");
const akun = [
  { id: "1", nama: "Muhammad Rasendri Hadianto", email: "x@pri.internal", username: "rasendri" },
  { id: "2", nama: "Siti Aisyah", email: "", username: "aisyah" },
  { id: "3", nama: "Siti Aisyah", email: "", username: "aisyah2" },
  { id: "4", nama: "Godam", email: "godam.usa@gmail.com", username: "godam" },
  { id: "5", nama: "Budi Santoso", email: "", username: "budi" },
];
const pegawai = [
  { kode: "P1", nama: "M. Rasendri Hadianto", email: "rasendri.h@gmail.com" },
  { kode: "P2", nama: "Siti Aisyah", email: "ais@gmail.com" },
  { kode: "P3", nama: "Godam Usa Putra", email: "godamusa@gmail.com" },
  { kode: "P4", nama: "Budi Santosso", email: "budi.s@gmail.com" },
];
const s = susunSaran(akun, pegawai);
const per = new Map(s.map((x) => [x.user_id, x]));
cek("singkatan M. → saran KUAT", per.get("1")?.kode === "P1" && per.get("1")?.keyakinan === "kuat", per.get("1"));
cek("dua akun bernama sama → hanya satu dapat, dan tidak kuat", [per.get("2"), per.get("3")].filter(Boolean).length === 1 && [per.get("2"), per.get("3")].every((x) => !x || x.keyakinan === "mirip"), [per.get("2"), per.get("3")]);
cek("salah ketik 1 huruf → saran mirip (periksa dulu)", per.get("5")?.kode === "P4" && per.get("5")?.keyakinan === "mirip", per.get("5"));
cek("satu pegawai tidak disarankan ke dua akun", new Set(s.map((x) => x.kode)).size === s.length);
const s2 = susunSaran([{ id: "9", nama: "Godam Usa", email: "", username: "godamusa" }], pegawai);
cek("username = depan email SADAR + nama mirip → kuat", s2[0]?.kode === "P3" && s2[0]?.keyakinan === "kuat", s2[0]);
cek("email sintetis tidak dipakai sebagai identitas", susunSaran([{ id: "8", nama: "Orang Lain", email: "rasendri.h@pri.internal", username: "" }], pegawai).length === 0);
cek("daftar kosong aman", susunSaran([], pegawai).length === 0 && susunSaran(akun, []).length === 0);

console.log("gabung pemetaan (satu akun satu pegawai)");
const L = (user_id: number, kode_pegawai: string): Pemetaan => ({ user_id, kode_pegawai, email_sadar: "", nama_sadar: "", dibuat_oleh_id: 1, dibuat_pada: "2026-09-01T00:00:00Z" });
const B = (user_id: number, kode_pegawai: string) => ({ user_id, kode_pegawai, email_sadar: "", nama_sadar: "" });
const g1 = gabungPemetaan([L(1, "A"), L(2, "B")], [B(3, "C")], 9, "2026-09-28T00:00:00Z");
cek("tambah baru: lama tetap", g1.tetap.length === 2 && g1.isiBaru.length === 1 && g1.tergantikan.length === 0);
const g2 = gabungPemetaan([L(1, "A"), L(2, "B")], [B(1, "B")], 9, "x");
cek("akun 1 pindah ke kode B: dua pemetaan lama tergantikan", g2.tergantikan.length === 2 && g2.tetap.length === 0 && g2.isiBaru[0].kode_pegawai === "B");
const g3 = gabungPemetaan([], [B(1, "A"), B(2, "A")], 9, "x");
cek("satu kode ke dua akun dalam satu kiriman: yang terakhir menang", g3.isiBaru.length === 1 && g3.isiBaru[0].user_id === 2);
const g4 = gabungPemetaan([], [B(1, "A"), B(1, "B")], 9, "x");
cek("satu akun ke dua kode dalam satu kiriman: yang terakhir menang", g4.isiBaru.length === 1 && g4.isiBaru[0].kode_pegawai === "B");
cek("pencatat & waktu diisi", g1.isiBaru[0].dibuat_oleh_id === 9 && g1.isiBaru[0].dibuat_pada === "2026-09-28T00:00:00Z");

console.log("peta email SADAR → akun (tanpa kueri per email)");
{
  const daftar = [
    { id: 5, email: "Budi@Gmail.com", aktif: true },
    { id: 2, email: "ganda@gmail.com", aktif: false },
    { id: 9, email: "GANDA@gmail.com", aktif: true },
    { id: 3, email: "dua@gmail.com", aktif: true },
    { id: 1, email: "dua@gmail.com", aktif: true },
    { id: 7, email: "", aktif: true },
  ];
  const p = petaEmailDariAkun(daftar, ["budi@gmail.com", "ganda@gmail.com", "dua@gmail.com", "tidakada@gmail.com", ""]);
  cek("beda huruf besar/kecil tetap cocok", p.get("budi@gmail.com") === 5);
  cek("email ganda: akun AKTIF menang", p.get("ganda@gmail.com") === 9);
  cek("sama-sama aktif: id terkecil menang", p.get("dua@gmail.com") === 1);
  cek("tak ada akun → tidak dipetakan", !p.has("tidakada@gmail.com") && !p.has(""));
  cek("kunci = email SADAR apa adanya", petaEmailDariAkun(daftar, ["BUDI@gmail.com"]).get("BUDI@gmail.com") === 5);
}

console.log(`\n${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);

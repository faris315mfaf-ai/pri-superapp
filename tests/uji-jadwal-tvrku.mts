// Uji saringan "Menunggu Tayang" (lib/jadwal-tvrku, 24 Sep 2026).
// Jalankan: npx tsx tests/uji-jadwal-tvrku.mts
import { saringJadwalMenunggu, waktuJadwal, type BarisPost } from "@/lib/jadwal-tvrku";

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

const kini = Date.parse("2026-09-24T08:30:00Z");
const peta = new Map<string, BarisPost>([
  ["sekarang", { jadwal: null, video_path: "v/1.mp4" }], // kasus nyata id 4350
  ["jadwal-depan", { jadwal: "2026-09-24T10:00:00+00:00", video_path: "v/2.mp4" }],
  ["jadwal-tautan", { jadwal: "2026-09-24T10:00:00+00:00", video_path: null }],
]);
const hasil = saringJadwalMenunggu(
  [
    { job_id: "sekarang", scheduled_date: "2026-09-24T08:19:05" },
    { job_id: "jadwal-depan", scheduled_date: "2026-09-24T10:00:00" },
    { job_id: "jadwal-tautan", scheduled_date: "2026-09-24T10:00:00Z" },
    { job_id: "asing-lewat", scheduled_date: "2026-09-24T07:00:00" },
    { job_id: "asing-depan", scheduled_date: "2026-09-24T09:00:00" },
    { job_id: "rusak", scheduled_date: "" },
  ],
  peta,
  kini,
);
const ids = hasil.map((h) => h.job_id);
cek("Post Sekarang yang masih diproses TIDAK tampil", !ids.includes("sekarang"), ids);
cek("jadwal milik kita di depan tampil", ids.includes("jadwal-depan"));
cek("jadwal milik kita bisa dibatalkan", hasil.find((h) => h.job_id === "jadwal-depan")?.bisa_batal === true);
cek("kiriman tautan tampil tapi tak bisa batal", hasil.find((h) => h.job_id === "jadwal-tautan")?.bisa_batal === false);
cek("job asing yang sudah lewat tidak tampil", !ids.includes("asing-lewat"));
cek("job asing di depan tampil, tak bisa batal", hasil.find((h) => h.job_id === "asing-depan")?.bisa_batal === false);
cek("tanggal rusak dibuang", !ids.includes("rusak"));
cek("waktu tanpa zona = UTC", waktuJadwal("2026-09-24T10:00:00") === Date.parse("2026-09-24T10:00:00Z"));
cek("waktu berzona dihormati", waktuJadwal("2026-09-24T17:00:00+07:00") === Date.parse("2026-09-24T10:00:00Z"));
cek("toleransi 1 menit", saringJadwalMenunggu([{ job_id: "x", scheduled_date: "2026-09-24T08:29:30Z" }], new Map(), kini).length === 1);

console.log(`\n${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);

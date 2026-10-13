// Uji pembentuk data panel Tugas Bot (2F, 13 Okt 2026). Murni, tanpa jaringan.
// Jalankan: npx tsx tests/uji-bot-tugas-saya.mts
import { gabungPermintaan, pesanTolakManual, platformDariUrl, rakitKandidatSaya, rakitPermintaan, rakitTugasSaya, statusKandidat, validasiAksiTugasBot } from "@/lib/bot-tugas-saya-murni";

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

console.log("\n[A] statusKandidat");
cek("tanpa klaim → bebas", statusKandidat({ diklaim_oleh: null, bentrok: null }, 1) === "bebas");
cek("diklaim bot ini → diklaim_saya", statusKandidat({ diklaim_oleh: 1, bentrok: null }, 1) === "diklaim_saya");
cek("diklaim bot lain → diklaim_lain", statusKandidat({ diklaim_oleh: 2, bentrok: null }, 1) === "diklaim_lain");
cek("bentrok mengalahkan klaim sendiri", statusKandidat({ diklaim_oleh: 1, bentrok: "dipakai_manusia" }, 1) === "bentrok");
cek("bentrok tanpa klaim → bentrok", statusKandidat({ diklaim_oleh: null, bentrok: "dipakai_manusia" }, 1) === "bentrok");
cek("id berbentuk string tetap cocok", statusKandidat({ diklaim_oleh: "1" as unknown as number, bentrok: null }, 1) === "diklaim_saya");
cek("bentrok string kosong dianggap tidak bentrok", statusKandidat({ diklaim_oleh: null, bentrok: "" }, 1) === "bebas");

console.log("\n[B] platformDariUrl");
cek("Instagram", platformDariUrl("https://www.instagram.com/reel/Cabc123XYZ/") === "Instagram");
cek("TikTok", platformDariUrl("https://www.tiktok.com/@ntv/video/7301234567890123456") === "TikTok");
cek("YouTube", platformDariUrl("https://youtu.be/dQw4w9WgXcQ") === "YouTube");
cek("X dan Facebook", platformDariUrl("https://x.com/a/status/1234567890123") === "X" && platformDariUrl("https://www.facebook.com/reel/1234567890123") === "Facebook");
cek("URL tak dikenal/rusak → lainnya", platformDariUrl("https://contoh.com/x") === "lainnya" && platformDariUrl("") === "lainnya" && platformDariUrl("bukan url") === "lainnya");

console.log("\n[C] rakitKandidatSaya");
const k = rakitKandidatSaya({ id: 7, url: "https://youtu.be/dQw4w9WgXcQ", judul: null, durasi_detik: 45, tayangan: null, waktu_terbit: null, diklaim_oleh: 3, bentrok: null, dibuat_pada: "2026-10-13T01:00:00Z" }, 3);
cek("bentuk lengkap", k.id === 7 && k.platform === "YouTube" && k.judul === "" && k.durasi_detik === 45 && k.tayangan === null && k.status === "diklaim_saya");
cek("angka rusak → null", rakitKandidatSaya({ id: 1, url: "x", judul: "j", durasi_detik: Number.NaN, tayangan: "abc" as unknown as number, waktu_terbit: null, diklaim_oleh: null, bentrok: null, dibuat_pada: "t" }, 1).durasi_detik === null);
cek("url null → string kosong", rakitKandidatSaya({ id: 1, url: null, judul: "j", durasi_detik: null, tayangan: null, waktu_terbit: null, diklaim_oleh: null, bentrok: null, dibuat_pada: "t" }, 1).url === "");

console.log("\n[D] rakitTugasSaya");
const t1 = rakitTugasSaya({ id: 5, tahap: "edit", judul: "Judul", kategori: "NEWS", galat: null, dibuat_pada: "t", selesai_pada: null }, new Set([5]));
cek("ditandai dari Video Wajib bila id ada di himpunan", t1.dari_video_wajib === true && t1.galat === "" && t1.selesai_pada === null);
cek("bukan dari Video Wajib bila tak ada", rakitTugasSaya({ id: 6, tahap: null, judul: null, kategori: null, galat: "x", dibuat_pada: "t", selesai_pada: "s" }, new Set([5])).dari_video_wajib === false);
cek("tahap null → string kosong, galat dipertahankan", (() => { const r = rakitTugasSaya({ id: 6, tahap: null, judul: null, kategori: null, galat: "x", dibuat_pada: "t", selesai_pada: "s" }, new Set()); return r.tahap === "" && r.galat === "x" && r.selesai_pada === "s"; })());

console.log("\n[E] rakitPermintaan & gabungPermintaan");
const p1 = rakitPermintaan({ id: 1, judul: "  ", keterangan: "k".repeat(1000), kategori: null, batas_waktu: "2026-10-17T00:00:00Z" }, "terbuka");
cek("judul kosong → (tanpa judul), keterangan dipotong 400, tenggat 10 karakter", p1.judul === "(tanpa judul)" && p1.keterangan.length === 400 && p1.batas_waktu === "2026-10-17" && p1.kategori === "");
cek("tanpa tenggat → null", rakitPermintaan({ id: 2, judul: "a", keterangan: null, kategori: "NEWS", batas_waktu: null }, "terbuka").batas_waktu === null);
const a = rakitPermintaan({ id: 1, judul: "A", keterangan: "", kategori: "", batas_waktu: null }, "diambil_saya");
const b = rakitPermintaan({ id: 2, judul: "B", keterangan: "", kategori: "", batas_waktu: null }, "terbuka");
const a2 = rakitPermintaan({ id: 1, judul: "A", keterangan: "", kategori: "", batas_waktu: null }, "terbuka");
const g = gabungPermintaan([a2, b], [a]);
cek("yang diambil bot ini lebih dulu, tanpa duplikat", g.length === 2 && g[0].id === 1 && g[0].status === "diambil_saya" && g[1].id === 2);
cek("kosong+kosong → kosong", gabungPermintaan([], []).length === 0);

console.log("\n[F] validasiAksiTugasBot");
const v = (x: unknown) => validasiAksiTugasBot(x);
cek("cari_sekarang sah", v({ aksi: "cari_sekarang" }).ok === true);
cek("ambil_permintaan sah", (() => { const r = v({ aksi: "ambil_permintaan", id: 12 }); return r.ok && r.aksi.aksi === "ambil_permintaan" && r.aksi.id === 12; })());
cek("id string angka diterima sebagai angka", (() => { const r = v({ aksi: "ambil_permintaan", id: "12" }); return r.ok && r.aksi.aksi === "ambil_permintaan" && r.aksi.id === 12; })());
cek("id nol/negatif/pecahan/NaN ditolak", !v({ aksi: "ambil_permintaan", id: 0 }).ok && !v({ aksi: "ambil_permintaan", id: -1 }).ok && !v({ aksi: "ambil_permintaan", id: 1.5 }).ok && !v({ aksi: "ambil_permintaan", id: "x" }).ok && !v({ aksi: "ambil_permintaan" }).ok);
cek("aksi tak dikenal ditolak", !v({ aksi: "hapus_semua" }).ok && !v({}).ok);
cek("bukan objek ditolak", !v(null).ok && !v("x").ok && !v([]).ok && !v(7).ok);

console.log("\n[G] pesanTolakManual");
cek("kode khusus", pesanTolakManual("sudah_diambil", null).includes("bot lain") && pesanTolakManual("tabel_belum_ada", null).includes("migrasi") && pesanTolakManual("bot_tidak_ada", null).includes("belum terdaftar"));
cek("alasan ditutup dipetakan", pesanTolakManual("ditutup", "kuota_habis").includes("Kuota") && pesanTolakManual("ditutup", "di_luar_jam").includes("jam aktif") && pesanTolakManual("ditutup", "jeda_global").includes("Jeda darurat"));
cek("alasan tak dikenal → teks umum", pesanTolakManual("ditutup", "aneh").length > 10 && pesanTolakManual("ditutup", null).length > 10);

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);

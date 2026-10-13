// Uji koordinator bot — kosakata tertutup, penguraian keluaran model, pagar (tahap 3). Murni.
// Jalankan: npx tsx tests/uji-bot-koordinator.mts
import {
  AKSI_KOORDINATOR,
  KOORDINATOR_KEBIJAKAN,
  SISTEM_KOORDINATOR,
  alasanPagar,
  bangunPromptKoordinator,
  judulUsulan,
  pagarUsulan,
  pesanKoordinatorGagal,
  uraiKeluaran,
  urlDariPesan,
  usulanKedaluwarsa,
  validasiIdUsulan,
  type KeadaanBotKoor,
} from "@/lib/bot-koordinator-murni";

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
const bot = (o: Partial<KeadaanBotKoor> & { id: number; nama: string }): KeadaanBotKoor => ({ peran: "Editor", aktif: true, jeda: false, punyaOtak: true, kuotaHarian: 3, dibuatHariIni: 1, tugas: null, antreAcc: 0, ...o });
const BOTS = [bot({ id: 1, nama: "Raka" }), bot({ id: 2, nama: "Sinta" }), bot({ id: 3, nama: "Dimas", punyaOtak: false })];
const URL1 = "https://youtu.be/dQw4w9WgXcQ";
const PESAN = `tolong kerjakan berita banjir dari ${URL1} untuk Raka`;
const J = (o: unknown) => JSON.stringify(o);

console.log("\n[A] Kosakata tertutup");
cek("tepat 5 aksi", AKSI_KOORDINATOR.length === 5 && ["kerjakan_url", "cari_sekarang", "ubah_kuota", "jeda", "lanjut"].every((a) => (AKSI_KOORDINATOR as readonly string[]).includes(a)));
cek("tidak ada aksi posting/hapus", !(AKSI_KOORDINATOR as readonly string[]).some((a) => /post|hapus|setuju|acc/.test(a)));
cek("sistem melarang bertindak sendiri & menugaskan agen tidur & mengarang tautan", /HANYA MENGUSULKAN/.test(SISTEM_KOORDINATOR) && /TIDUR/.test(SISTEM_KOORDINATOR) && /jangan mengarang tautan/.test(SISTEM_KOORDINATOR));

console.log("\n[B] Prompt");
const pr = bangunPromptKoordinator({ pesan: PESAN, namaPemilik: "Budi", riwayat: Array.from({ length: 20 }, (_, i) => ({ nama: "Budi", teks: `p${i}` })), bots: [BOTS[0], BOTS[2], bot({ id: 4, nama: "Eka", tugas: { judul: "Banjir", tahap: "edit" } })], terbuka: 1 });
cek("memuat keadaan nyata: tidur, bekerja, kuota", /Dimas.*TIDUR/.test(pr) && /Eka.*bekerja: "Banjir"/.test(pr) && /Raka.*menganggur/.test(pr) && /kuota 1\/3/.test(pr));
cek("memuat permintaan pemilik & jumlah usulan terbuka", pr.includes(PESAN) && /Usulan terbuka saat ini: 1 dari maksimal 3/.test(pr));
cek("hanya 8 pesan terakhir", /p19/.test(pr) && !/p11\b/.test(pr) && (pr.match(/Budi: p\d+/g) ?? []).length === 8);

console.log("\n[C] urlDariPesan (anti-karangan)");
cek("tautan dari pesan diterima", urlDariPesan(URL1, PESAN) === URL1);
cek("tanpa skema diterima & dinormalkan https", urlDariPesan("youtu.be/dQw4w9WgXcQ", PESAN) === URL1);
cek("tautan yang TIDAK ada di pesan ditolak (model mengarang)", urlDariPesan("https://youtu.be/AAAAAAAAAAA", PESAN) === null);
cek("domain tak dikenal / bukan url / kosong ditolak", urlDariPesan("https://evil.example/x", "lihat https://evil.example/x") === null && urlDariPesan("bukan url", "bukan url") === null && urlDariPesan("", PESAN) === null && urlDariPesan(5, PESAN) === null);
cek("http dipaksa https", urlDariPesan("http://youtu.be/dQw4w9WgXcQ", "http://youtu.be/dQw4w9WgXcQ") === URL1);
cek("mengandung spasi / terlalu pendek ditolak", urlDariPesan("youtu.be/dQw4w9WgXcQ extra", PESAN) === null && urlDariPesan("a.b", "a.b") === null);

const PANJANG = "https://www.tiktok.com/@a/video/7301234567890123456";
cek("tautan TERPOTONG oleh model ditolak (kunci beda, bukan sekadar substring)", urlDariPesan("https://www.tiktok.com/@a/video/7301234", `kerjakan ${PANJANG}`) === null && urlDariPesan("https://www.instagram.com/reel/Cabcde", "lihat https://www.instagram.com/reel/CabcdeXYZ123/") === null);
cek("tautan sama dengan parameter pelacak/bentuk lain di pesan tetap diterima (kunci sama)", urlDariPesan("https://www.tiktok.com/@a/video/7301234567890123456", "kerjakan https://www.tiktok.com/@a/video/7301234567890123456?is_from_webapp=1&sender_device=pc") === "https://www.tiktok.com/@a/video/7301234567890123456");
cek("tanda baca di ujung tautan pada pesan tidak merusak pencocokan", urlDariPesan("youtu.be/dQw4w9WgXcQ", "tolong (https://youtu.be/dQw4w9WgXcQ), terima kasih") === "https://youtu.be/dQw4w9WgXcQ");
cek("topik: tautan dibuang", uraiKeluaran(J({ balasan: "x", usulan: [{ aksi: "kerjakan_url", bot: "Raka", url: URL1, topik: "banjir https://evil.example/x ya" }] }), BOTS, PESAN).usulan[0]?.param.topik === "banjir ya");

console.log("\n[D] uraiKeluaran");
let r = uraiKeluaran(J({ balasan: "Siap, saya usulkan Raka.", usulan: [{ aksi: "kerjakan_url", bot: "Raka", alasan: "Raka longgar", url: URL1, topik: "banjir Pantura" }] }), BOTS, PESAN);
cek("usulan sah diterima, judul disusun KODE", r.usulan.length === 1 && r.usulan[0].aksi === "kerjakan_url" && r.usulan[0].bot_id === 1 && r.usulan[0].param.url === URL1 && r.usulan[0].param.topik === "banjir Pantura" && r.usulan[0].judul === "Kerjakan tautan → Raka", r);
cek("balasan dibersihkan: tautan dibuang", !/https?:/.test(uraiKeluaran(J({ balasan: "Lihat https://x.y ya", usulan: [] }), BOTS, PESAN).balasan));
r = uraiKeluaran(J({ balasan: "x", usulan: [{ aksi: "posting_langsung", bot: "Raka" }, { aksi: "hapus_semua", bot: "Raka" }, { aksi: "cari_sekarang", bot: "Raka", alasan: "a" }] }), BOTS, PESAN);
cek("aksi di luar kosakata dibuang, yang sah tetap lolos", r.usulan.length === 1 && r.usulan[0].aksi === "cari_sekarang" && r.dibuang.length === 2, r);
r = uraiKeluaran(J({ balasan: "x", usulan: [{ aksi: "jeda", bot: "Budi" }] }), BOTS, PESAN);
cek("agen tidak dikenal dibuang", r.usulan.length === 0 && r.dibuang.length === 1);
r = uraiKeluaran(J({ balasan: "x", usulan: [{ aksi: "jeda", bot: " sinta " }, { aksi: "lanjut", bot: "SİNTA" }] }), BOTS, PESAN);
cek("nama agen dicocokkan tanpa peduli huruf besar/spasi", r.usulan[0]?.bot_id === 2);
r = uraiKeluaran(J({ balasan: "x", usulan: [{ aksi: "kerjakan_url", bot: "Raka", url: "https://youtu.be/BBBBBBBBBBB" }] }), BOTS, PESAN);
cek("kerjakan_url dengan tautan karangan dibuang", r.usulan.length === 0);
cek("kerjakan_url tanpa url dibuang", uraiKeluaran(J({ balasan: "x", usulan: [{ aksi: "kerjakan_url", bot: "Raka" }] }), BOTS, PESAN).usulan.length === 0);
for (const k of [0, 7, -1, 2.5, "3", null]) cek(`ubah_kuota kuota=${JSON.stringify(k)} dibuang`, uraiKeluaran(J({ balasan: "x", usulan: [{ aksi: "ubah_kuota", bot: "Raka", kuota: k }] }), BOTS, PESAN).usulan.length === 0);
cek("ubah_kuota 1..6 diterima", [1, 6].every((k) => uraiKeluaran(J({ balasan: "x", usulan: [{ aksi: "ubah_kuota", bot: "Raka", kuota: k }] }), BOTS, PESAN).usulan[0]?.param.kuota === k));
r = uraiKeluaran(J({ balasan: "x", usulan: Array.from({ length: 6 }, () => ({ aksi: "cari_sekarang", bot: "Raka" })) }), BOTS, PESAN);
cek(`maksimal ${KOORDINATOR_KEBIJAKAN.USULAN_PER_BALASAN} usulan per balasan`, r.usulan.length === KOORDINATOR_KEBIJAKAN.USULAN_PER_BALASAN);
cek("JSON dibungkus teks tetap terbaca", uraiKeluaran('Tentu!\n```json\n{"balasan":"ok","usulan":[]}\n```', BOTS, PESAN).balasan === "ok");
for (const buruk of ["bukan json", "[]", "null", "5", '"teks"', "", "{"]) cek(`keluaran buruk ${JSON.stringify(buruk)} → kosong, tidak melempar`, (() => { const h = uraiKeluaran(buruk, BOTS, PESAN); return h.usulan.length === 0; })());
cek("usulan bukan larik / butir bukan objek aman", uraiKeluaran(J({ balasan: "x", usulan: "banyak" }), BOTS, PESAN).usulan.length === 0 && uraiKeluaran(J({ balasan: "x", usulan: [1, null, "a", []] }), BOTS, PESAN).usulan.length === 0);
cek("alasan/topik panjang dipotong, karakter kontrol dibuang", (() => { const h = uraiKeluaran(J({ balasan: "x", usulan: [{ aksi: "cari_sekarang", bot: "Raka", alasan: "a\u0000b".repeat(400) }] }), BOTS, PESAN); return h.usulan[0].alasan.length <= KOORDINATOR_KEBIJAKAN.ALASAN_MAKS && !/\u0000/.test(h.usulan[0].alasan); })());
cek("teks injeksi di 'bot' tidak jadi aksi", uraiKeluaran(J({ balasan: "x", usulan: [{ aksi: "jeda", bot: "Raka; DROP TABLE" }] }), BOTS, PESAN).usulan.length === 0);

console.log("\n[E] Pagar");
const pg = (aksi: Parameters<typeof pagarUsulan>[0]["aksi"], b: KeadaanBotKoor, param = {}) => pagarUsulan({ aksi, param }, b);
cek("kerjakan_url pada agen sehat: boleh, ada peringatan ACC", (() => { const h = pg("kerjakan_url", BOTS[0], { url: URL1 }); return h.boleh && h.tanda.some((t) => t[0] === "warn" && /ACC/.test(t[1])); })());
cek("kerjakan_url pada agen TIDUR ditolak", (() => { const h = pg("kerjakan_url", BOTS[2]); return !h.boleh && /tertidur/.test(alasanPagar(h.tanda)); })());
cek("cari_sekarang pada agen tidur ditolak", !pg("cari_sekarang", BOTS[2]).boleh);
cek("kerjakan_url: dijeda / punya tugas / kuota habis / nonaktif ditolak", !pg("kerjakan_url", bot({ id: 9, nama: "X", jeda: true })).boleh && !pg("kerjakan_url", bot({ id: 9, nama: "X", tugas: { judul: "t", tahap: "edit" } })).boleh && !pg("kerjakan_url", bot({ id: 9, nama: "X", dibuatHariIni: 3 })).boleh && !pg("kerjakan_url", bot({ id: 9, nama: "X", aktif: false })).boleh);
cek("ubah_kuota: sama / di luar batas ditolak, beda dalam batas boleh", !pg("ubah_kuota", BOTS[0], { kuota: 3 }).boleh && !pg("ubah_kuota", BOTS[0], { kuota: 9 }).boleh && pg("ubah_kuota", BOTS[0], { kuota: 4 }).boleh);
cek("jeda: sudah dijeda ditolak; lanjut: tidak dijeda ditolak", !pg("jeda", bot({ id: 9, nama: "X", jeda: true })).boleh && pg("jeda", BOTS[0]).boleh && !pg("lanjut", BOTS[0]).boleh && pg("lanjut", bot({ id: 9, nama: "X", jeda: true })).boleh);
cek("jeda/lanjut pada agen tidur masih boleh (tak membahayakan)", pg("jeda", BOTS[2]).boleh);
cek("alasanPagar menggabung semua yang merah", alasanPagar(pg("kerjakan_url", bot({ id: 9, nama: "X", jeda: true, dibuatHariIni: 3 })).tanda).includes(";"));

console.log("\n[F] Lain-lain");
cek("judulUsulan", judulUsulan("ubah_kuota", "Raka", { kuota: 4 }) === "Kuota Raka → 4 per hari" && judulUsulan("jeda", "Sinta", {}) === "Jeda Sinta");
cek("kedaluwarsa setelah 2 jam; tanggal rusak = kedaluwarsa", usulanKedaluwarsa(new Date(Date.now() - 121 * 60_000).toISOString(), Date.now()) && !usulanKedaluwarsa(new Date(Date.now() - 60 * 60_000).toISOString(), Date.now()) && usulanKedaluwarsa("rusak", Date.now()));
cek("validasiIdUsulan", validasiIdUsulan(5) === 5 && validasiIdUsulan(0) === null && validasiIdUsulan(-1) === null && validasiIdUsulan(1.5) === null && validasiIdUsulan("5") === null && validasiIdUsulan(null) === null);
cek("pesan gagal tanpa detail teknis", ["tanpa_kunci", "kunci_ditolak", "kuota", "waktu_habis", "kunci_rusak", "gagal"].every((c) => /^Nara/.test(pesanKoordinatorGagal(c)) && !/stack|undefined|Error/.test(pesanKoordinatorGagal(c))));

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);

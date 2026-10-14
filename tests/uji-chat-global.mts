// Uji CHAT GLOBAL & RUANG BOT UMUM (14 Okt 2026). Murni — tanpa jaringan.
// Jalankan: npx tsx tests/uji-chat-global.mts
import {
  BATAS_KIRIM,
  JENDELA_KIRIM_DETIK,
  MAKS_KARAKTER_CHAT,
  SIMPAN_HARI,
  awalRiwayatIso,
  masihBisu,
  menitBisuSah,
  normalkanPesan,
  saringKataKasar,
} from "@/lib/chat-global-murni";
import { duniaUmum, statusRuangUmum } from "@/lib/ruang-umum-murni";
import type { PenghuniDunia, StatusDunia } from "@/lib/dunia-murni";
import type { BotRingkas, StatusBot } from "@/lib/bot-tipe";
import { LAMA_GELEMBUNG_CHAT_MS, SimulasiPenghuni } from "@/features/ruang-bot/simulasi-penghuni";

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

console.log("\n[A] Aturan dasar");
cek("maks 500 karakter", MAKS_KARAKTER_CHAT === 500);
cek("batas kirim 5 / 30 dtk", BATAS_KIRIM === 5 && JENDELA_KIRIM_DETIK === 30);
cek("riwayat 7 hari", SIMPAN_HARI === 7);
cek("awal riwayat = 7 hari lalu", awalRiwayatIso(Date.parse("2026-10-14T00:00:00Z")) === "2026-10-07T00:00:00.000Z");

console.log("\n[B] Saring kata kasar");
cek("kata utuh disamarkan", saringKataKasar("dasar anjing kau") === "dasar a***** kau", saringKataKasar("dasar anjing kau"));
cek("tak peka huruf besar", saringKataKasar("ANJING") === "A*****");
cek("pengulangan huruf ikut", saringKataKasar("anjiiiing") === "a********", saringKataKasar("anjiiiing"));
cek("tanda baca di sekitar", saringKataKasar("bangsat!") === "b******!");
cek("bukan bagian kata lain (asumsi)", saringKataKasar("asumsi") === "asumsi");
cek("bukan bagian kata lain (babinsa)", saringKataKasar("babinsa datang") === "babinsa datang");
cek("teks bersih tak berubah", saringKataKasar("Template baru sudah bisa dipakai.") === "Template baru sudah bisa dipakai.");

console.log("\n[C] normalkanPesan");
cek("bukan string ditolak", !normalkanPesan(42).ok);
cek("kosong ditolak", !normalkanPesan("   \n  ").ok);
cek("501 karakter ditolak", !normalkanPesan("a".repeat(501)).ok);
cek("500 karakter diterima", normalkanPesan("a".repeat(500)).ok);
const r1 = normalkanPesan("  halo\u0000   semua‮  ");
cek("karakter kontrol & bidi dibuang, spasi dirapatkan", r1.ok && r1.teks === "halo semua", r1);
const r2 = normalkanPesan("a\n\n\n\nb");
cek("baris kosong dibatasi", r2.ok && r2.teks === "a\n\nb", r2);
const r3 = normalkanPesan("kampret lu");
cek("kata kasar disamarkan saat normalisasi", r3.ok && r3.teks === "k****** lu", r3);

console.log("\n[D] Bisu");
cek("menit sah 5..1440", menitBisuSah(5) === 5 && menitBisuSah(1440) === 1440 && menitBisuSah("60") === 60);
cek("menit tak sah", menitBisuSah(4) === null && menitBisuSah(1441) === null && menitBisuSah(1.5) === null && menitBisuSah("x") === null);
const kini = Date.parse("2026-10-14T05:00:00Z");
cek("masih bisu", masihBisu("2026-10-14T06:00:00Z", kini));
cek("bisu sudah lewat", !masihBisu("2026-10-14T04:00:00Z", kini));
cek("null = tidak bisu", !masihBisu(null, kini) && !masihBisu("ngawur", kini));

console.log("\n[E] Sanitasi Ruang umum");
const orang = (id: number, role: string, akt: boolean): PenghuniDunia => ({
  id,
  nama: `Orang ${id}`,
  username: `u${id}`,
  divisi: "Divisi X",
  role,
  avatar_url: "https://contoh/a.png",
  layar: "tvrku",
  layar_label: "TVR Saya",
  karakter: id,
  aktivitas: akt
    ? {
        id: "t",
        jenis: "unggah_sosmed",
        anim: "kotak_post",
        label: "Mengunggah ke sosmed",
        ringkasan: 'Mengunggah "Judul Rahasia" ke @akunku',
        judul: "Judul Rahasia",
        akun: "@akunku",
        platform: "instagram",
        mulai: 1,
        berjalan: true,
        akhir: null,
      }
    : null,
});
const dunia: StatusDunia = { waktu: kini, jumlah: 3, terpotong: false, online: [orang(1, "anggota", true), orang(2, "master", false), orang(3, "superadmin", true)] };
const u = duniaUmum(dunia);
const json = JSON.stringify(u);
cek("master & superadmin tidak dicantumkan", u.online.length === 1 && u.online[0].id === 1, u.online.map((p) => p.id));
cek("jumlah ikut dikurangi", u.jumlah === 1, u.jumlah);
cek("judul/akun/platform tidak terkirim", !json.includes("Judul Rahasia") && !json.includes("@akunku") && !json.includes("instagram"), json);
cek("username/divisi/peran/avatar dikosongkan", !json.includes("u1") && !json.includes("Divisi X") && !json.includes("anggota") && !json.includes("contoh/a.png"));
cek("label kegiatan & layar tetap", u.online[0].aktivitas?.label === "Mengunggah ke sosmed" && u.online[0].layar_label === "TVR Saya");
cek("ringkasan = label", u.online[0].aktivitas?.ringkasan === "Mengunggah ke sosmed");
cek("data asli tidak diubah", dunia.online[0].aktivitas?.judul === "Judul Rahasia");

const bot = (id: number, aktif: boolean): BotRingkas => ({
  id,
  user_id: 900 + id,
  username: `bot${id}`,
  nama: `Bot ${id}`,
  peran: "Editor",
  persona: "PERSONA RAHASIA",
  warna: "#fff",
  handle: "@handlebot",
  platform: "tiktok",
  mode: "acc",
  rupa: { kulit: "#000" } as unknown as BotRingkas["rupa"],
  kuota_harian: 5,
  jam_mulai: "06:00",
  jam_selesai: "22:00",
  aktif,
  jeda: false,
  gagal_beruntun: 0,
  post_hari_ini: 2,
  akun_tertaut: 3,
  punya_otak: true,
  tugas_aktif: { tahap: "edit", judul: "JUDUL TUGAS RAHASIA" },
});
const sb: StatusBot = {
  tabel_ada: true,
  jeda_global: false,
  runner: { online: true, terakhir_denyut: null, versi: "1" },
  bots: [bot(1, true), bot(2, false)],
  log: [{ id: 1, bot_id: 1, tahap: "edit", teks: "LOG RAHASIA", dibuat_pada: "2026-10-14T00:00:00Z" }],
  sumber: [],
  blokir: ["kata-blokir"],
  koordinator: { nama: "Nara", peran: "Koordinator", punya_otak: true, usulan_terbuka: 4, diputus: [{ id: 1, bot_id: 1, judul: "USULAN RAHASIA", diputus_pada: "2026-10-14T00:00:00Z" }] },
  chat_terakhir: "2026-10-14T04:59:00Z",
};
const su = statusRuangUmum(dunia, sb, kini);
const jsu = JSON.stringify(su);
cek("bot nonaktif disaring", su.bots.length === 1 && su.bots[0].id === 1);
cek("tahap tugas tetap (meja bot)", su.bots[0].tahap === "edit");
for (const rahasia of ["JUDUL TUGAS RAHASIA", "PERSONA RAHASIA", "@handlebot", "tiktok", "LOG RAHASIA", "kata-blokir", "USULAN RAHASIA", "bot1"]) {
  cek(`"${rahasia}" tidak terkirim`, !jsu.includes(rahasia));
}
cek("koordinator hanya nama/peran/otak", JSON.stringify(su.koordinator) === JSON.stringify({ nama: "Nara", peran: "Koordinator", punya_otak: true }));
cek("chat_terakhir diteruskan (animasi rapat)", su.chat_terakhir === "2026-10-14T04:59:00Z");
const kosong = statusRuangUmum(dunia, null, kini);
cek("status bot gagal -> bot kosong, online tetap", kosong.bots.length === 0 && !kosong.bot_ada && kosong.dunia.online.length === 1);

console.log("\n[F] Gelembung chat di atas karakter");
const sim = new SimulasiPenghuni({ gerakKurang: () => true });
const t0 = 1_000_000;
sim.kabarChat(7, "  halo   semua  ", LAMA_GELEMBUNG_CHAT_MS, t0);
cek("teks dirapikan & diberi kutip", sim.teksChat(7, t0 + 10) === "“halo semua”", sim.teksChat(7, t0 + 10));
cek("hilang setelah lama gelembung", sim.teksChat(7, t0 + LAMA_GELEMBUNG_CHAT_MS + 1) === "");
sim.kabarChat(8, "x".repeat(300), LAMA_GELEMBUNG_CHAT_MS, t0);
cek("teks panjang dipotong", sim.teksChat(8, t0).length <= 82 && sim.teksChat(8, t0).includes("…"));
sim.kabarChat(9, "   ", LAMA_GELEMBUNG_CHAT_MS, t0);
cek("teks kosong diabaikan", sim.teksChat(9, t0) === "");

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);

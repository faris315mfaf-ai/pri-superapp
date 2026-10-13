// Uji room chat bot — bagian murni (13 Okt 2026).
// Jalankan: npx tsx tests/uji-bot-chat.mts
import { KEBIJAKAN_CHAT } from "@/lib/bot-chat-konstan";
import { bangunPromptChat, cariSebutan, normalkanPesan, pesanTakBisaMenjawab, rapikanBalasan, ringkasKeadaan, SISTEM_CHAT, type BotChatRingkas } from "@/lib/bot-chat-murni";

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
const BOTS: BotChatRingkas[] = [
  { id: 1, nama: "Raka", username: "bot1" },
  { id: 2, nama: "Sinta", username: "bot2" },
  { id: 3, nama: "Dimas", username: "bot3" },
  { id: 4, nama: "Éka", username: "bot4" },
];

console.log("\n[A] Pesan");
cek("dirapikan", (() => { const h = normalkanPesan("  Halo   @Raka\r\n\r\n\r\n\r\nsiap?\u0000 "); return h.ok && h.teks === "Halo @Raka\n\nsiap?"; })());
cek("kosong / spasi / bukan teks ditolak", !normalkanPesan("").ok && !normalkanPesan("   \n ").ok && !normalkanPesan(null).ok && !normalkanPesan(5).ok);
cek("batas panjang", normalkanPesan("a".repeat(KEBIJAKAN_CHAT.PESAN_MAKS_KARAKTER)).ok && !normalkanPesan("a".repeat(KEBIJAKAN_CHAT.PESAN_MAKS_KARAKTER + 1)).ok);

console.log("\n[B] Sebutan @nama");
cek("@Raka → [1]", cariSebutan("tolong @Raka cek ini", BOTS).join() === "1");
cek("huruf besar/kecil & username", cariSebutan("@SINTA dan @bot3", BOTS).join() === "2,3");
cek("diakritik: @eka → Éka", cariSebutan("@eka halo", BOTS).join() === "4");
cek("urutan = urutan disebut, tanpa duplikat", cariSebutan("@Dimas @Raka @dimas", BOTS).join() === "3,1");
cek("@semua → dipotong ke JAWABAN_MAKS", cariSebutan("@semua kumpul", BOTS).length === KEBIJAKAN_CHAT.JAWABAN_MAKS);
cek("dibatasi JAWABAN_MAKS walau disebut banyak", cariSebutan("@Raka @Sinta @Dimas @Eka", BOTS).length === KEBIJAKAN_CHAT.JAWABAN_MAKS);
cek("e-mail bukan sebutan", cariSebutan("kirim ke budi@raka.com", BOTS).length === 0);
cek("tanpa @ / nama asing / kosong", cariSebutan("Raka kerjakan", BOTS).length === 0 && cariSebutan("@Budi halo", BOTS).length === 0 && cariSebutan("", BOTS).length === 0);
cek("sebutan di awal kalimat, setelah tanda baca", cariSebutan("@Raka, halo", BOTS).join() === "1" && cariSebutan("ok (@Sinta)", BOTS).join() === "2");

console.log("\n[C] Keadaan & prompt");
const k = ringkasKeadaan({ aktif: true, jeda: false, jedaGlobal: false, mode: "acc", kuotaHarian: 2, dibuatHariIni: 1, tugas: { judul: "Banjir Jakarta", tahap: "siap_ditinjau" } });
cek("keadaan memuat fakta nyata", /aktif/.test(k) && /1 dari kuota 2/.test(k) && /Banjir Jakarta/.test(k) && /Antrean ACC/.test(k) && /Mode: ACC/.test(k), k);
cek("jeda & nonaktif & tanpa tugas", /dijeda master/.test(ringkasKeadaan({ aktif: true, jeda: true, jedaGlobal: false, mode: "acc", kuotaHarian: 1, dibuatHariIni: 0, tugas: null })) && /NONAKTIF/.test(ringkasKeadaan({ aktif: false, jeda: false, jedaGlobal: false, mode: "acc", kuotaHarian: 1, dibuatHariIni: 0, tugas: null })) && /tidak ada/.test(ringkasKeadaan({ aktif: true, jeda: false, jedaGlobal: true, mode: "otomatis", kuotaHarian: 1, dibuatHariIni: 0, tugas: null })));
const pr = bangunPromptChat({ nama: "Raka", keadaan: k, riwayat: Array.from({ length: 30 }, (_, i) => ({ pengirim: "master", nama: "Budi", teks: `pesan ${i}` })), pesan: { pengirim: "master", nama: "Budi", teks: "@Raka sudah selesai?" } });
cek("prompt memuat keadaan, pesan, dan hanya konteks terakhir", /KEADAANMU \(Raka\)/.test(pr) && /@Raka sudah selesai\?/.test(pr) && /pesan 29/.test(pr) && !/pesan 0\b/.test(pr) && (pr.match(/Budi: pesan/g) ?? []).length === KEBIJAKAN_CHAT.KONTEKS_PESAN);
cek("sistem melarang mengaku bertindak & membocorkan kunci", /TIDAK bisa memulai/.test(SISTEM_CHAT) && /Jangan membocorkan kunci/.test(SISTEM_CHAT) && /blok KEADAANMU/.test(SISTEM_CHAT));

console.log("\n[D] Balasan");
cek("teks biasa dirapikan", rapikanBalasan("  **Siap**, saya cek sekarang.  ") === "Siap, saya cek sekarang.");
cek("awalan nama dibuang", rapikanBalasan("Raka: Siap bos", "Raka") === "Siap bos" && rapikanBalasan("raka - siap", "Raka") === "siap");
cek("tautan dibuang", !/http/.test(rapikanBalasan("Lihat https://x.y/z ya, sudah beres.") ?? ""));
cek("terlalu pendek / kosong → null", rapikanBalasan("") === null && rapikanBalasan(" . ") === null && rapikanBalasan("a") === null && rapikanBalasan("ok") === "ok");
cek("dipotong di batas", (rapikanBalasan("x".repeat(2000)) ?? "").length === KEBIJAKAN_CHAT.BALASAN_MAKS_KARAKTER);
cek("nama bot dengan karakter regex tidak merusak", rapikanBalasan("A+B: halo semua", "A+B") === "halo semua");

console.log("\n[E] Pesan tak bisa menjawab");
cek("tiap kode punya pesan jelas, tanpa detail teknis", ["tanpa_kunci", "kunci_ditolak", "kuota", "waktu_habis", "kunci_rusak", "gagal"].every((c) => pesanTakBisaMenjawab("Raka", c).startsWith("Raka") && !/stack|undefined|Error/.test(pesanTakBisaMenjawab("Raka", c))));

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);

// Uji validator sumber & blokir Bot Redaksi (13 Okt 2026) + pemetaan optimis layar.
// Murni, tanpa jaringan. Jalankan: npx tsx tests/uji-bot-sumber.mts
import {
  BLOKIR_MAKS,
  HANDLE_MAKS,
  cocokBlokir,
  normalkanBlokir,
  normalkanKategori,
  normalkanPlatform,
  normalkanSumber,
  pesanGalatSumber,
  tampilkanHandle,
  type KodeGalatSumber,
} from "@/lib/bot-sumber";
import { awal24JamIso, hitungKandidatPerSumber, rakitSumber } from "@/lib/bot-data";
import type { AksiSumberBot, StatusBot, SumberBotDb } from "@/lib/bot-tipe";
import { batalkanAksiSumber, kunciAksiSumber, petakanSumber, terapkanAksiSumber } from "@/features/ruang-bot/peta-nyata";

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
const sumber = (platform: unknown, handle: unknown) => normalkanSumber({ platform, handle });
const handleDari = (platform: string, handle: string): string | null => {
  const h = sumber(platform, handle);
  return h.ok ? h.handle : null;
};
const kodeDari = (platform: string, handle: unknown): KodeGalatSumber | null => {
  const h = sumber(platform, handle);
  return h.ok ? null : h.kode;
};

console.log("\n[A] normalkanPlatform & normalkanKategori");
cek("platform kanonik", normalkanPlatform("Instagram") === "Instagram" && normalkanPlatform("TikTok") === "TikTok" && normalkanPlatform("YouTube") === "YouTube");
cek("alias & huruf besar-kecil & spasi", normalkanPlatform(" ig ") === "Instagram" && normalkanPlatform("TIKTOK") === "TikTok" && normalkanPlatform("yt") === "YouTube");
cek("platform asing / bukan teks → null", normalkanPlatform("Facebook") === null && normalkanPlatform("") === null && normalkanPlatform(5) === null && normalkanPlatform(null) === null);
cek("kategori sah (huruf kecil dirapikan)", normalkanKategori("news") === "NEWS" && normalkanKategori(" Hiburan ") === "HIBURAN" && normalkanKategori("SHOWBIZ") === "SHOWBIZ");
cek("kategori asing → null", normalkanKategori("OLAHRAGA") === null && normalkanKategori(undefined) === null);

console.log("\n[B] normalkanSumber — handle sah");
cek("IG: '@NTV' → 'ntv' (tanpa @, huruf kecil)", handleDari("Instagram", "@NTV") === "ntv");
cek("IG: tanpa @ sama dengan dengan @ (duplikat tertangkap)", handleDari("Instagram", "ntv") === handleDari("Instagram", "@ntv"));
cek("IG: titik, garis bawah, strip di tengah", handleDari("Instagram", "tv.rakyat_official-1") === "tv.rakyat_official-1");
cek("TikTok: '@kompastv' → 'kompastv'", handleDari("TikTok", "@kompastv") === "kompastv");
cek("YouTube: '@NTVChannel' → '@ntvchannel'", handleDari("YouTube", "@NTVChannel") === "@ntvchannel");
cek("YouTube: tanpa @ dijadikan handle '@nama'", handleDari("YouTube", "ntvchannel") === "@ntvchannel");
cek("YouTube: ID kanal UC… (24 karakter) dipertahankan apa adanya", handleDari("YouTube", "UCabcdefghijklmnopqrstuv") === "UCabcdefghijklmnopqrstuv");
cek("YouTube: ID kanal dengan _ dan - didukung", handleDari("YouTube", "UC_abc-defghijklmnopqrst") === "UC_abc-defghijklmnopqrst");
cek("YouTube: 'UCLA' (bukan ID 24 karakter) = handle biasa", handleDari("YouTube", "UCLA") === "@ucla");
cek("YouTube: '@UC…24' tetap handle (diawali @), bukan ID", handleDari("YouTube", "@UCabcdefghijklmnopqrstuv") === "@ucabcdefghijklmnopqrstuv");
cek("spasi di tepi dipangkas", handleDari("TikTok", "  ntv  ") === "ntv");
cek("platform alias dipakai: hasil platform kanonik", (() => { const h = sumber("ig", "@a1"); return h.ok && h.platform === "Instagram"; })());
cek("batas panjang: 2 dan 64 karakter lolos", handleDari("TikTok", "ab") === "ab" && handleDari("TikTok", "a".repeat(HANDLE_MAKS)) === "a".repeat(HANDLE_MAKS));
cek("64 karakter dengan @ di depan lolos (batas dihitung dari masukan)", handleDari("TikTok", "@" + "a".repeat(HANDLE_MAKS - 1)) === "a".repeat(HANDLE_MAKS - 1));
cek("angka saja boleh", handleDari("Instagram", "12345") === "12345");

console.log("\n[C] normalkanSumber — galat");
cek("platform asing", kodeDari("Facebook", "ntv") === "platform_tak_dikenal");
cek("handle bukan teks (angka/null/objek)", kodeDari("TikTok", 123) === "handle_bukan_teks" && kodeDari("TikTok", null) === "handle_bukan_teks" && kodeDari("TikTok", {}) === "handle_bukan_teks");
cek("handle kosong / spasi saja", kodeDari("TikTok", "") === "handle_kosong" && kodeDari("TikTok", "    ") === "handle_kosong");
cek("handle 1 karakter terlalu pendek", kodeDari("TikTok", "a") === "handle_pendek");
cek("'@' saja → terlalu pendek", kodeDari("TikTok", "@") === "handle_pendek");
cek("65 karakter terlalu panjang", kodeDari("TikTok", "a".repeat(HANDLE_MAKS + 1)) === "handle_panjang");
cek("diawali '-' ditolak (cegah injeksi opsi argumen)", kodeDari("Instagram", "-o") === "handle_awalan_minus" && kodeDari("Instagram", "--exec=x") === "handle_awalan_minus");
cek("'@-' juga ditolak", kodeDari("Instagram", "@-abc") === "handle_awalan_minus");
cek("strip di tengah/akhir sah", handleDari("Instagram", "a-b-") === "a-b-");
cek("spasi di dalam ditolak", kodeDari("Instagram", "ntv news") === "handle_karakter" && kodeDari("Instagram", "ntv\tnews") === "handle_karakter");
cek("baris baru di dalam ditolak", kodeDari("Instagram", "ntv\nrm") === "handle_karakter");
cek("garis miring → dianggap tautan", kodeDari("Instagram", "a/b") === "handle_url" && kodeDari("Instagram", "/etc/passwd") === "handle_url");
cek("'..' ditolak", kodeDari("Instagram", "a..b") === "handle_titik_ganda" && kodeDari("Instagram", "..") === "handle_titik_ganda");
cek("URL penuh ditolak (http, https, tanpa skema, www)",
  kodeDari("Instagram", "https://www.instagram.com/ntv/") === "handle_url"
  && kodeDari("TikTok", "http://tiktok.com/@ntv") === "handle_url"
  && kodeDari("YouTube", "youtube.com/@ntv") === "handle_url"
  && kodeDari("YouTube", "www.youtube.com") === "handle_url"
  && kodeDari("YouTube", "youtu.be") === "handle_url"
  && kodeDari("Instagram", "instagram.com") === "handle_url");
cek("'@' di tengah/akhir/ganda ditolak", kodeDari("Instagram", "a@b") === "handle_at_salah" && kodeDari("Instagram", "ab@") === "handle_at_salah" && kodeDari("Instagram", "@@ab") === "handle_at_salah");
cek("karakter terlarang: titik koma, tanda kutip, backtick, $, &, |, %, koma",
  [";", "'", '"', "`", "$", "&", "|", "%", ",", "(", ")", "<", ">", "\\", "!", "?", "#", "="].every((c) => kodeDari("Instagram", `ab${c}cd`) !== null));
cek("karakter terlarang itu bukan lolos diam-diam (kode handle_karakter atau handle_url)",
  [";", "'", "`", "$", "&", "|"].every((c) => kodeDari("Instagram", `ab${c}cd`) === "handle_karakter"));
cek("non-ASCII ditolak (huruf beraksen, emoji, fullwidth, zero-width)",
  kodeDari("Instagram", "café") === "handle_karakter"
  && kodeDari("Instagram", "ab😀") === "handle_karakter"
  && kodeDari("Instagram", "ｎｔｖ") === "handle_karakter"
  && kodeDari("Instagram", "ab​cd") === "handle_karakter");
cek("NUL dan karakter kontrol ditolak", kodeDari("Instagram", "ab\u0000cd") === "handle_karakter" && kodeDari("Instagram", "ab\u001bcd") === "handle_karakter");
cek("setiap kode galat punya pesan Indonesia tidak kosong", (["platform_tak_dikenal", "handle_bukan_teks", "handle_kosong", "handle_url", "handle_pendek", "handle_panjang", "handle_awalan_minus", "handle_karakter", "handle_titik_ganda", "handle_at_salah", "kategori_tak_dikenal", "blokir_bukan_teks", "blokir_pendek", "blokir_panjang", "blokir_karakter_kontrol"] as KodeGalatSumber[]).every((k) => pesanGalatSumber(k).length > 10));
cek("tidak pernah melempar untuk masukan aneh", (() => {
  try {
    for (const v of [undefined, null, 0, NaN, [], {}, true, Symbol.iterator.toString(), "\u0000".repeat(500), "%00", "a".repeat(10_000)]) {
      sumber("Instagram", v);
      sumber(v, "ntv");
    }
    return true;
  } catch {
    return false;
  }
})());
cek("ID kanal YouTube dengan awalan '-' tidak mungkin (selalu UC…)", handleDari("YouTube", "-UCabcdefghijklmnopqrstuv") === null);

console.log("\n[D] tampilkanHandle");
cek("IG tanpa @ → ditambah @", tampilkanHandle("Instagram", "ntv") === "@ntv");
cek("YouTube @nama apa adanya", tampilkanHandle("YouTube", "@ntv") === "@ntv");
cek("YouTube ID kanal apa adanya (tanpa @)", tampilkanHandle("YouTube", "UCabcdefghijklmnopqrstuv") === "UCabcdefghijklmnopqrstuv");
cek("bolak-balik: tampil lalu normal = handle simpan sama", (() => {
  const h = sumber("Instagram", "NTV.Official");
  return h.ok && handleDari("Instagram", tampilkanHandle(h.platform, h.handle)) === h.handle;
})());

console.log("\n[E] cocokBlokir");
const B = ["judi online", "@akun-spam", "SARA"];
cek("substring, tanpa membedakan huruf", cocokBlokir("fans-JUDI online-id", B) === "judi online");
cek("handle simpan tanpa @ tetap kena blokir '@akun-spam'", cocokBlokir("akun-spam", B) === "@akun-spam");
cek("handle dengan @ kena blokir tanpa @", cocokBlokir("@akun-spam-2", ["akun-spam"]) === "akun-spam");
cek("blokir huruf besar kena handle huruf kecil", cocokBlokir("kontensara", B) === "SARA");
cek("tidak cocok → null", cocokBlokir("ntv", B) === null);
cek("daftar kosong → null", cocokBlokir("ntv", []) === null);
cek("kata blokir kosong/spasi/@ saja diabaikan (tidak memblokir semua)", cocokBlokir("ntv", ["", "   ", "@"]) === null);
cek("handle kosong → null", cocokBlokir("", B) === null);
cek("mengembalikan blokir pertama yang cocok", cocokBlokir("spam-sara", ["sara", "spam"]) === "sara");

console.log("\n[F] normalkanBlokir");
const nb = (v: unknown) => normalkanBlokir(v);
cek("rapikan spasi berlebih & tepi", (() => { const h = nb("  judi    online \t "); return h.ok && h.kata === "judi online"; })());
cek("2 karakter lolos, 1 karakter ditolak", nb("ab").ok === true && (() => { const h = nb("a"); return !h.ok && h.kode === "blokir_pendek"; })());
cek("hanya spasi → terlalu pendek", (() => { const h = nb("     "); return !h.ok && h.kode === "blokir_pendek"; })());
cek("batas maksimal", nb("a".repeat(BLOKIR_MAKS)).ok === true && (() => { const h = nb("a".repeat(BLOKIR_MAKS + 1)); return !h.ok && h.kode === "blokir_panjang"; })());
cek("bukan teks", (() => { const h = nb(42); return !h.ok && h.kode === "blokir_bukan_teks"; })());
cek("karakter kontrol ditolak", (() => { const h = nb("ab\u0000cd"); return !h.ok && h.kode === "blokir_karakter_kontrol"; })());
cek("akun dengan @ dan huruf besar dipertahankan apa adanya", (() => { const h = nb("@Akun-Spam"); return h.ok && h.kata === "@Akun-Spam"; })());

console.log("\n[G] rakitSumber & hitungKandidatPerSumber (server)");
cek("hitung kandidat per sumber; null diabaikan", (() => {
  const m = hitungKandidatPerSumber([{ sumber_id: 1 }, { sumber_id: 1 }, { sumber_id: 2 }, { sumber_id: null }]);
  return m.get(1) === 2 && m.get(2) === 1 && m.size === 2;
})());
cek("hitung kandidat: daftar kosong", hitungKandidatPerSumber([]).size === 0);
cek("awal24JamIso = tepat 24 jam sebelum", awal24JamIso(new Date("2026-10-13T05:00:00Z")) === "2026-10-12T05:00:00.000Z");
cek("rakitSumber menormalkan platform/kategori rusak, tidak melempar", (() => {
  const s = rakitSumber({ id: 3, bot_id: 1, platform: "instagram", handle: "ntv", kategori: "aneh", aktif: null, terakhir_ambil: null }, 7.9);
  return s.platform === "Instagram" && s.kategori === "NEWS" && s.aktif === true && s.kandidat_24_jam === 7 && s.terakhir_ambil === null && s.id === 3;
})());
cek("rakitSumber: aktif=false dan kandidat negatif/NaN dirapikan", (() => {
  const s = rakitSumber({ id: 1, bot_id: 1, platform: "TikTok", handle: "x1", kategori: "SHOWBIZ", aktif: false, terakhir_ambil: "2026-10-13T00:00:00Z" }, Number.NaN);
  return s.aktif === false && s.kandidat_24_jam === 0 && s.kategori === "SHOWBIZ" && s.terakhir_ambil === "2026-10-13T00:00:00Z";
})());

console.log("\n[H] Pembaruan optimis & rollback (peta-nyata)");
const SA: SumberBotDb = { id: 10, bot_id: 1, platform: "Instagram", handle: "ntv", kategori: "NEWS", aktif: true, terakhir_ambil: null, kandidat_24_jam: 4 };
const SB: SumberBotDb = { id: 11, bot_id: 2, platform: "TikTok", handle: "kompastv", kategori: "HIBURAN", aktif: false, terakhir_ambil: null, kandidat_24_jam: 0 };
const dasar: StatusBot = { tabel_ada: true, jeda_global: false, runner: { online: false, terakhir_denyut: null, versi: null }, bots: [], log: [], sumber: [SA, SB], blokir: ["judi", "spam"] };
const terap = (a: AksiSumberBot, s: StatusBot = dasar, id = 0) => terapkanAksiSumber(s, a, id);
const batal = (a: AksiSumberBot, s: StatusBot, id = 0, awal: StatusBot = dasar) => batalkanAksiSumber(s, a, awal, id);

const aTambah: AksiSumberBot = { aksi: "tambah", bot_id: 2, platform: "YouTube", handle: "@ntv", kategori: "SHOWBIZ" };
const sesudahTambah = terap(aTambah, dasar, -1);
cek("tambah: baris sementara id negatif, tidak mengubah status asal", sesudahTambah.sumber?.length === 3 && sesudahTambah.sumber[2].id === -1 && dasar.sumber?.length === 2);
cek("tambah: rollback membuang baris sementara", batal(aTambah, sesudahTambah, -1).sumber?.length === 2);
cek("tambah dengan handle tidak sah diabaikan (tidak menyisip baris)", terap({ ...aTambah, handle: "a b" }, dasar, -1) === dasar);

const aAktif: AksiSumberBot = { aksi: "aktif", id: 10, nilai: false };
const sesudahAktif = terap(aAktif);
cek("aktif: hanya sumber itu yang berubah", sesudahAktif.sumber?.[0].aktif === false && sesudahAktif.sumber?.[1].aktif === false && dasar.sumber?.[0].aktif === true);
cek("aktif: rollback mengembalikan nilai lama", batal(aAktif, sesudahAktif).sumber?.[0].aktif === true);
cek("aktif: rollback tidak menyentuh sumber lain", batal(aAktif, terap({ aksi: "aktif", id: 11, nilai: true }, sesudahAktif)).sumber?.[1].aktif === true);

const aHapus: AksiSumberBot = { aksi: "hapus", id: 10 };
const sesudahHapus = terap(aHapus);
cek("hapus: baris hilang", sesudahHapus.sumber?.length === 1 && sesudahHapus.sumber[0].id === 11);
cek("hapus: rollback memulihkan baris di urutan id", (() => { const s = batal(aHapus, sesudahHapus); return s.sumber?.length === 2 && s.sumber[0].id === 10; })());
cek("hapus: rollback tidak menggandakan bila sudah ada", batal(aHapus, dasar).sumber?.length === 2);

const aBt: AksiSumberBot = { aksi: "blokir_tambah", kata: "Hoaks" };
const sesudahBt = terap(aBt);
cek("blokir_tambah: kata masuk di akhir", sesudahBt.blokir?.join("|") === "judi|spam|Hoaks");
cek("blokir_tambah: duplikat beda huruf tidak menggandakan", terap({ aksi: "blokir_tambah", kata: "JUDI" }).blokir?.length === 2);
cek("blokir_tambah: rollback membuangnya", batal(aBt, sesudahBt).blokir?.join("|") === "judi|spam");

const aBh: AksiSumberBot = { aksi: "blokir_hapus", kata: "judi" };
const sesudahBh = terap(aBh);
cek("blokir_hapus: kata hilang (tanpa membedakan huruf)", sesudahBh.blokir?.join("|") === "spam" && terap({ aksi: "blokir_hapus", kata: "JUDI" }).blokir?.length === 1);
cek("blokir_hapus: rollback memulihkan di posisi semula", batal(aBh, sesudahBh).blokir?.join("|") === "judi|spam");
cek("status tanpa field sumber/blokir (server lama) tidak melempar", (() => {
  const lama: StatusBot = { ...dasar, sumber: undefined, blokir: undefined };
  return terapkanAksiSumber(lama, aBt, 0).blokir?.length === 1 && terapkanAksiSumber(lama, aHapus, 0).sumber?.length === 0;
})());

console.log("\n[I] Kunci aksi & pemetaan tampilan");
cek("aktif & hapus pada sumber yang sama berbagi kunci (saling mengunci)", kunciAksiSumber(aAktif) === kunciAksiSumber(aHapus));
cek("sumber berbeda → kunci berbeda", kunciAksiSumber(aAktif) !== kunciAksiSumber({ aksi: "aktif", id: 11, nilai: true }));
cek("kunci blokir tak peka huruf & spasi tepi", kunciAksiSumber({ aksi: "blokir_hapus", kata: " Judi " }) === kunciAksiSumber(aBh));
cek("kunci tambah sumber vs tambah blokir terpisah", kunciAksiSumber(aTambah) !== kunciAksiSumber(aBt));
cek("petakanSumber: akun berawalan @, id & bot terisi, 'belum pernah' bila belum diambil", (() => {
  const t = petakanSumber(SA);
  return t.akun === "@ntv" && t.id === 10 && t.botId === "1" && t.kandidat24Jam === 4 && t.terakhirAmbil === "belum pernah" && t.aktif === true;
})());
cek("petakanSumber: waktu relatif bila pernah diambil", petakanSumber({ ...SA, terakhir_ambil: new Date(Date.now() - 5 * 60_000).toISOString() }).terakhirAmbil === "5 mnt lalu");

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal === 0 ? 0 : 1);

// Uji pemilihan kandidat bot (13 Okt 2026). Murni, tanpa jaringan.
// Jalankan: npx tsx tests/uji-bot-pilih.mts
import { DURASI_LAYAK, alasanTolak, buatNaskah, kataBlokirCocok, labelSumber, peringkatKandidat, pilihTerbaik, skorKandidat, type KandidatNilai } from "@/lib/bot-pilih";
import { BATAS_PROTOKOL } from "@/lib/bot-protokol";

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

const NOW = Date.parse("2026-10-13T05:00:00.000Z");
const jam = (j: number) => new Date(NOW - j * 3600_000).toISOString();
let seq = 0;
const kand = (o: Partial<KandidatNilai> = {}): KandidatNilai => ({
  id: ++seq,
  url: `https://www.instagram.com/reel/ABCDE${seq}/`,
  judul: "Judul berita",
  caption: "Caption berita",
  durasi_detik: 45,
  tayangan: 1000,
  waktu_terbit: jam(1),
  bentrok: null,
  ...o,
});

console.log("\n[A] skorKandidat");
cek("skor dalam 0..100", (() => {
  const s = skorKandidat(kand({ waktu_terbit: jam(0), tayangan: 10_000_000 }), NOW);
  return s > 0 && s <= 100;
})());
cek("lebih baru = skor lebih tinggi", skorKandidat(kand({ waktu_terbit: jam(1) }), NOW) > skorKandidat(kand({ waktu_terbit: jam(30) }), NOW));
cek("setengah-hidup 24 jam: skor kebaruan menyusut ±setengah", (() => {
  const a = skorKandidat(kand({ waktu_terbit: jam(0), tayangan: null, durasi_detik: 30, judul: "", caption: "x" }), NOW);
  const b = skorKandidat(kand({ waktu_terbit: jam(24), tayangan: null, durasi_detik: 30, judul: "", caption: "x" }), NOW);
  return Math.abs((a - 15) / 2 - (b - 15)) < 0.001; // 15 = durasi 10 + caption 5
})());
cek("tayangan lebih banyak = skor lebih tinggi", skorKandidat(kand({ tayangan: 100_000 }), NOW) > skorKandidat(kand({ tayangan: 100 }), NOW));
cek("tayangan null = 0 poin tayangan, tidak melempar", skorKandidat(kand({ tayangan: null }), NOW) === skorKandidat(kand({ tayangan: 0 }), NOW));
cek("tayangan negatif/NaN tidak merusak", Number.isFinite(skorKandidat(kand({ tayangan: -5 }), NOW)) && Number.isFinite(skorKandidat(kand({ tayangan: Number.NaN }), NOW)));
cek("tayangan 1 juta = poin penuh (30), di atasnya tak bertambah", skorKandidat(kand({ tayangan: 1_000_000 }), NOW) === skorKandidat(kand({ tayangan: 900_000_000 }), NOW));
cek("waktu_terbit null → netral rendah, bukan error", Number.isFinite(skorKandidat(kand({ waktu_terbit: null }), NOW)));
cek("waktu_terbit rusak diperlakukan seperti tak diketahui", skorKandidat(kand({ waktu_terbit: "kemarin sore" }), NOW) === skorKandidat(kand({ waktu_terbit: null }), NOW));
cek("waktu_terbit jauh di masa depan tak dihargai (sama dgn tak diketahui)", skorKandidat(kand({ waktu_terbit: jam(-100) }), NOW) === skorKandidat(kand({ waktu_terbit: null }), NOW));
cek("waktu_terbit sedikit di masa depan (selisih jam) = paling baru", skorKandidat(kand({ waktu_terbit: jam(-1) }), NOW) === skorKandidat(kand({ waktu_terbit: jam(0) }), NOW));
cek("durasi layak > durasi tak diketahui", skorKandidat(kand({ durasi_detik: 45 }), NOW) > skorKandidat(kand({ durasi_detik: null }), NOW));
cek("judul+caption terisi > hanya salah satu", skorKandidat(kand(), NOW) > skorKandidat(kand({ caption: "" }), NOW));
cek("skor deterministik (dua kali sama)", skorKandidat(kand({ id: 1 }), NOW) === skorKandidat(kand({ id: 1 }), NOW));

console.log("\n[B] alasanTolak & blokir");
cek("kandidat bersih lolos", alasanTolak(kand(), []) === null);
cek("blokir cocok judul (case-insensitive)", alasanTolak(kand({ judul: "Berita JUDI online" }), ["judi"]) === "blokir");
cek("blokir cocok caption", alasanTolak(kand({ caption: "klik promo slot gacor" }), ["Slot Gacor"]) === "blokir");
cek("blokir cocok url (akun)", alasanTolak(kand({ url: "https://www.instagram.com/akun_buruk/reel/ABCDE9/" }), ["akun_buruk"]) === "blokir");
cek("blokir tidak cocok → lolos", alasanTolak(kand(), ["judi", "slot"]) === null);
cek("kata blokir kosong/spasi diabaikan", alasanTolak(kand(), ["", "   "]) === null);
cek("kata blokir dengan spasi pinggir dipangkas", alasanTolak(kand({ judul: "ada judi" }), ["  judi  "]) === "blokir");
cek("huruf kapital Unicode (Ä/ä) cocok", alasanTolak(kand({ judul: "ÄNGGUR" }), ["änggur"]) === "blokir");
cek("kataBlokirCocok mengembalikan kata aslinya", kataBlokirCocok(kand({ judul: "Ada Judi" }), [" Judi "]) === "Judi");
cek("bentrok → ditolak", alasanTolak(kand({ bentrok: "dipakai_manusia" }), []) === "bentrok");
cek("bentrok string kosong = bersih", alasanTolak(kand({ bentrok: "" }), []) === null);
cek("bentrok menang atas blokir (alasan pertama)", alasanTolak(kand({ bentrok: "x", judul: "judi" }), ["judi"]) === "bentrok");
cek("durasi terlalu pendek ditolak", alasanTolak(kand({ durasi_detik: DURASI_LAYAK.MIN - 1 }), []) === "durasi_tak_layak");
cek("durasi terlalu panjang ditolak", alasanTolak(kand({ durasi_detik: DURASI_LAYAK.MAKS + 1 }), []) === "durasi_tak_layak");
cek("durasi tepat batas lolos", alasanTolak(kand({ durasi_detik: 10 }), []) === null && alasanTolak(kand({ durasi_detik: 180 }), []) === null);
cek("durasi null lolos (tak diketahui)", alasanTolak(kand({ durasi_detik: null }), []) === null);
cek("judul+caption kosong ditolak", alasanTolak(kand({ judul: "", caption: "" }), []) === "tanpa_teks");
cek("judul+caption spasi saja ditolak", alasanTolak(kand({ judul: "   ", caption: null }), []) === "tanpa_teks");
cek("hanya caption terisi lolos", alasanTolak(kand({ judul: "", caption: "isi" }), []) === null);

console.log("\n[C] pilihTerbaik & peringkat");
cek("daftar kosong → null", pilihTerbaik([], [], NOW) === null);
cek("semua ditolak → null", pilihTerbaik([kand({ bentrok: "x" }), kand({ judul: "judi" })], ["judi"], NOW) === null);
{
  const lama = kand({ waktu_terbit: jam(40), tayangan: 5000 });
  const baru = kand({ waktu_terbit: jam(1), tayangan: 5000 });
  cek("memilih yang lebih baru", pilihTerbaik([lama, baru], [], NOW)?.id === baru.id);
}
{
  const a = kand({ waktu_terbit: jam(2), tayangan: 10 });
  const b = kand({ waktu_terbit: jam(2), tayangan: 900_000 });
  cek("waktu sama, tayangan lebih besar menang", pilihTerbaik([a, b], [], NOW)?.id === b.id);
}
{
  const bagus = kand({ bentrok: "dipakai_manusia", waktu_terbit: jam(0), tayangan: 9_000_000 });
  const biasa = kand({ waktu_terbit: jam(20), tayangan: 10 });
  cek("yang bentrok dilewati meski skornya tertinggi", pilihTerbaik([bagus, biasa], [], NOW)?.id === biasa.id);
}
{
  // Pemutus seri: skor, waktu, tayangan identik → id terkecil, apa pun urutan masukan.
  const x = kand({ id: 900, waktu_terbit: jam(3), tayangan: 77 });
  const y = kand({ id: 500, waktu_terbit: jam(3), tayangan: 77 });
  const z = kand({ id: 700, waktu_terbit: jam(3), tayangan: 77 });
  const urutan = [[x, y, z], [z, y, x], [y, x, z], [y, z, x]];
  cek("seri penuh: id terkecil menang, tidak bergantung urutan masukan", urutan.every((u) => pilihTerbaik(u, [], NOW)?.id === 500));
  cek("peringkat seri: urut id naik", peringkatKandidat([x, y, z], [], NOW).map((p) => p.kandidat.id).join(",") === "500,700,900");
}
{
  // Skor sama tetapi waktu berbeda → yang waktunya lebih baru lebih dulu; waktu null terakhir.
  const a = kand({ id: 1, judul: "a", caption: "", waktu_terbit: null, tayangan: null, durasi_detik: 30 });
  const b = kand({ id: 2, judul: "a", caption: "", waktu_terbit: null, tayangan: null, durasi_detik: 30 });
  cek("seri tanpa waktu: id kecil menang", pilihTerbaik([b, a], [], NOW)?.id === 1);
}
{
  const data = Array.from({ length: 30 }, (_, i) => kand({ waktu_terbit: jam(i), tayangan: (i * 37) % 11 }));
  const acak = [...data].sort(() => Math.random() - 0.5);
  const p1 = peringkatKandidat(data, [], NOW).map((p) => p.kandidat.id).join(",");
  const p2 = peringkatKandidat(acak, [], NOW).map((p) => p.kandidat.id).join(",");
  cek("peringkat sama untuk urutan masukan acak (30 kandidat)", p1 === p2);
}
{
  const masuk = [kand(), kand({ bentrok: "x" })];
  const salinan = JSON.stringify(masuk);
  peringkatKandidat(masuk, ["judi"], NOW);
  cek("tidak mengubah masukan", JSON.stringify(masuk) === salinan);
}

console.log("\n[D] buatNaskah");
cek("judul + caption digabung dengan titik", buatNaskah("Banjir Jakarta", "Warga mengungsi") === "Banjir Jakarta. Warga mengungsi");
cek("judul berakhir tanda baca → spasi saja", buatNaskah("Banjir parah!", "Warga mengungsi") === "Banjir parah! Warga mengungsi");
cek("spasi & baris baru dirapikan", buatNaskah("  Banjir \n\n  Jakarta ", "Warga\t\tmengungsi  \r\n besar") === "Banjir Jakarta. Warga mengungsi besar");
cek("hanya judul", buatNaskah("Judul saja", "") === "Judul saja");
cek("hanya caption", buatNaskah("", "Caption saja") === "Caption saja");
cek("keduanya kosong → null", buatNaskah("", "") === null && buatNaskah("   ", null) === null && buatNaskah(null, undefined) === null);
cek("hanya karakter kontrol → null", buatNaskah("\u0001\u0002", "\u0000") === null);
cek("caption sama dengan judul tidak diulang", buatNaskah("Banjir Jakarta", "banjir jakarta") === "Banjir Jakarta");
cek("caption diawali judul: sisanya saja", buatNaskah("Banjir Jakarta", "Banjir Jakarta - warga mengungsi") === "Banjir Jakarta. warga mengungsi");
cek("tidak melebihi MAKS_NASKAH", (buatNaskah("J", "x".repeat(BATAS_PROTOKOL.MAKS_NASKAH * 3)) ?? "").length <= BATAS_PROTOKOL.MAKS_NASKAH);
cek("panjang tepat batas tidak dipotong", buatNaskah("a".repeat(BATAS_PROTOKOL.MAKS_NASKAH), "")?.length === BATAS_PROTOKOL.MAKS_NASKAH);
cek("dipotong di batas kata bila ada spasi dekat batas", (() => {
  const teks = ("kata ".repeat(2000)).trim();
  const n = buatNaskah(teks, "");
  return n !== null && n.length <= BATAS_PROTOKOL.MAKS_NASKAH && !n.endsWith(" ") && n.split(" ").every((k) => k === "kata");
})());
cek("pemotongan tidak membelah emoji (pasangan pengganti)", (() => {
  const teks = "a".repeat(BATAS_PROTOKOL.MAKS_NASKAH - 1) + "😀😀";
  const n = buatNaskah(teks, "") ?? "";
  const akhir = n.charCodeAt(n.length - 1);
  return n.length <= BATAS_PROTOKOL.MAKS_NASKAH && !(akhir >= 0xd800 && akhir <= 0xdbff);
})());
cek("hasil tidak pernah kosong bila ada teks", ["a", " b ", "\nc\n"].every((t) => (buatNaskah(t, "") ?? "") !== ""));
cek("Unicode non-Latin dipertahankan", buatNaskah("Berita 日本語 ✓", "") === "Berita 日本語 ✓");

console.log("\n[E] labelSumber");
cek("@handle → tanpa @", labelSumber("Instagram", "@ntv_news") === "ntv_news");
cek("handle polos", labelSumber("TikTok", "ntvnews") === "ntvnews");
cek("beberapa @ dan spasi", labelSumber("Instagram", "  @@ntv  ") === "ntv");
cek("URL profil → segmen akun", labelSumber("Instagram", "https://www.instagram.com/ntv_news/") === "ntv_news");
cek("URL TikTok @akun", labelSumber("TikTok", "https://www.tiktok.com/@ntv.news?lang=id") === "ntv.news");
cek("handle kosong → nama platform", labelSumber("Instagram", "") === "Instagram");
cek("keduanya kosong → 'Sumber'", labelSumber("", null) === "Sumber" && labelSumber(undefined, "  ") === "Sumber");
cek("teks kredit biasa (Video Wajib) dipertahankan", labelSumber("TV Rakyat", "Doksli DPP") === "Doksli DPP");
cek("maks 60 karakter", labelSumber("X", "a".repeat(200)).length === 60);
cek("pemotongan label tidak membelah emoji", (() => {
  const l = labelSumber("X", "a".repeat(59) + "😀😀");
  const akhir = l.charCodeAt(l.length - 1);
  return l.length <= 60 && !(akhir >= 0xd800 && akhir <= 0xdbff);
})());
cek("host berisi titik tanpa jalur tidak jadi kosong", labelSumber("Web", "ntv.news/") === "ntv.news");

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);

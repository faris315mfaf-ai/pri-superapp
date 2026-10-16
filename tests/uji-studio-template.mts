// Uji STUDIO TEMPLATE (16 Okt 2026): model murni + waktu lapisan perender. Tanpa jaringan.
// Jalankan: npx tsx tests/uji-studio-template.mts
import {
  DokStudio,
  SEPANJANG,
  TIGA_DETIK_AWAL,
  bidangWaktu,
  detikEfektif,
  idPernakBaru,
  patokDari,
  periksaAturan,
  rentangTampil,
  studioDariTemplate,
  teksPatok,
  templateDariStudio,
  type ElemenStudio,
} from "@/mesin-video/studio-model";
import { waktuLapisan } from "@/mesin-video/perintah";
import {
  balikPatok,
  catatRiwayat,
  elemenBaru,
  garisDari,
  geserRect,
  jepitKanvas,
  jepitRect,
  perluCatat,
  pindahUrutan,
  rataKanvas,
  seretWaktu,
  sesuaikanTinggi,
  tempelDetik,
  ubahUkuran,
  ulangi,
  urungkan,
} from "@/features/tvr-ku/studio/studio-murni";

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
const sama = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const el = (id: string, jenis: ElemenStudio["jenis"], tambahan: Partial<ElemenStudio> = {}): ElemenStudio => ({
  id, jenis, nama: "", file: jenis === "kategori" || jenis === "berita" ? null : "assets/studio/aaaaaaaaaaaa.png",
  rect: { x: 0, y: 0, w: 100, h: 100 }, waktu: SEPANJANG, opacity: 1, tersembunyi: false,
  teks: jenis === "berita" ? { x: 38, y: 760, w: 660, h: 190 } : null, kunci_hijau: false, ...tambahan,
});
const dok = (elemen: ElemenStudio[]): DokStudio => ({ v: 1, elemen, outro: { file: null, durasi: null }, teks_warna: "white", rata: "justify" });

console.log("Waktu & patokan");
cek("detik efektif awal/akhir", detikEfektif({ dari: "awal", d: 5 }, 40) === 5 && detikEfektif({ dari: "akhir", d: 3 }, 40) === 37);
cek("rentang tampil normal", sama(rentangTampil({ mulai: { dari: "awal", d: 5 }, selesai: { dari: "akhir", d: 3 } }, 40), { mulai: 5, selesai: 37 }));
cek("rentang habis di video pendek -> null", rentangTampil({ mulai: { dari: "awal", d: 5 }, selesai: { dari: "akhir", d: 3 } }, 7) === null);
cek("rentang dijepit ke durasi", sama(rentangTampil({ mulai: { dari: "awal", d: 0 }, selesai: { dari: "awal", d: 30 } }, 20), { mulai: 0, selesai: 20 }));
cek("patok paruh awal = dari awal", sama(patokDari(4.04, 40), { dari: "awal", d: 4 }));
cek("patok paruh akhir = sebelum akhir", sama(patokDari(36, 40), { dari: "akhir", d: 4 }));
cek("patok mentok akhir = akhir video", sama(patokDari(39.97, 40), { dari: "akhir", d: 0 }));
cek("teks patokan", teksPatok({ dari: "awal", d: 0 }) === "awal video" && teksPatok({ dari: "akhir", d: 0 }) === "akhir video" && teksPatok({ dari: "akhir", d: 3 }) === "3,0 dtk sblm akhir");

console.log("Bidang waktu template");
cek("sepanjang = tanpa start/end", sama(bidangWaktu(SEPANJANG), {}));
cek("3 detik awal", sama(bidangWaktu(TIGA_DETIK_AWAL), { start: 0, end: 3 }));
cek("awal 5 -> sblm akhir 3", sama(bidangWaktu({ mulai: { dari: "awal", d: 5 }, selesai: { dari: "akhir", d: 3 } }), { start: 5, end: 3, end_akhir: true }));
cek("awal 5 -> akhir video", sama(bidangWaktu({ mulai: { dari: "awal", d: 5 }, selesai: { dari: "akhir", d: 0 } }), { start: 5, end: null }));
cek("5 dtk terakhir", sama(bidangWaktu({ mulai: { dari: "akhir", d: 5 }, selesai: { dari: "akhir", d: 0 } }), { start: 5, start_akhir: true, end: null }));

console.log("waktuLapisan (perender)");
cek("tanpa patokan akhir: apa adanya", sama(waktuLapisan({ start: 0, end: 3 }, 40), { start: 0, end: 3 }));
cek("tanpa waktu: apa adanya", sama(waktuLapisan({}, 40), { start: undefined, end: undefined }));
cek("end_akhir dihitung mundur", sama(waktuLapisan({ start: 5, end: 3, end_akhir: true }, 40), { start: 5, end: 37 }));
cek("start_akhir dihitung mundur", sama(waktuLapisan({ start: 5, start_akhir: true, end: null }, 40), { start: 35, end: 40 }));
cek("video terlalu pendek -> null", waktuLapisan({ start: 5, end: 3, end_akhir: true }, 7) === null);
cek("pembulatan 3 desimal", sama(waktuLapisan({ start: 0.1, end: 0.2, end_akhir: true }, 10.0004), { start: 0.1, end: 9.8 }));

console.log("Aturan dokumen");
const sah = dok([el("berita", "berita"), el("kategori", "kategori"), el("logo", "logo"), el("footer", "footer")]);
cek("dokumen sah", periksaAturan(sah) === null && DokStudio.safeParse(sah).success);
cek("tanpa kotak berita ditolak", periksaAturan(dok([el("logo", "logo")])) === "Template wajib punya satu kotak berita.");
cek("dua logo ditolak", periksaAturan(dok([el("berita", "berita"), el("logo", "logo"), el("logo2", "logo")])) === "Logo hanya boleh satu.");
cek("logo tanpa berkas ditolak", (periksaAturan(dok([el("berita", "berita"), el("logo", "logo", { file: null })])) ?? "").includes("berkas gambarnya"));
cek("durasi < 0,5 dtk ditolak", (periksaAturan(dok([el("berita", "berita", { waktu: { mulai: { dari: "awal", d: 1 }, selesai: { dari: "awal", d: 1.2 } } })])) ?? "").includes("minimal"));
cek("7 pernak ditolak", (periksaAturan(dok([el("berita", "berita"), ...Array.from({ length: 7 }, (_, i) => el(`pernak-${i + 1}`, "pernak"))])) ?? "").includes("maksimal 6"));
cek("id kembar ditolak", periksaAturan(dok([el("berita", "berita"), el("pernak-1", "pernak"), el("pernak-1", "pernak")])) !== null);
cek("skema menolak rujukan keluar folder", !DokStudio.safeParse(dok([el("berita", "berita"), el("logo", "logo", { file: "assets/../../x.png" })])).success);
cek("skema menolak path absolut", !DokStudio.safeParse(dok([el("berita", "berita"), el("logo", "logo", { file: "/etc/passwd" })])).success);
cek("id pernak baru unik", idPernakBaru(dok([el("berita", "berita"), el("pernak-1", "pernak")])) === "pernak-2");

console.log("Terjemahan ke template.json");
{
  const d = dok([
    el("berita", "berita", { file: "assets/kotak.png", waktu: TIGA_DETIK_AWAL }),
    el("kategori", "kategori", { rect: { x: 40, y: 700, w: 200, h: 50 }, waktu: TIGA_DETIK_AWAL }),
    el("boom", "boom", { file: "assets/studio/bbbbbbbbbbbb.mov", kunci_hijau: true, waktu: { mulai: { dari: "awal", d: 5 }, selesai: { dari: "akhir", d: 3 } } }),
    el("pernak-1", "pernak", { opacity: 0.5 }),
    el("logo", "logo", { tersembunyi: true }),
  ]);
  d.outro = { file: "assets/studio/cccccccccccc.mp4", durasi: 2 };
  const t = templateDariStudio(d, "NEWS") as Record<string, any>;
  cek("overlay urut, tersembunyi & kategori tidak jadi overlay", t.overlays.length === 3 && t.overlays[0].file === "assets/kotak.png");
  cek("boom: loop + kunci hijau + waktu akhir", t.overlays[1].loop === true && t.overlays[1].kunci_hijau === true && t.overlays[1].end_akhir === true);
  cek("pernak transparansi", t.overlays[2].opacity === 0.5 && t.overlays[2].loop === undefined);
  cek("teks: hook, kategori, sumber", sama(t.texts.map((x: any) => x.name), ["hook", "kategori", "sumber"]));
  cek("hook berwaktu 0-3", t.texts[0].start === 0 && t.texts[0].end === 3 && t.texts[0].style === "berita");
  cek("kotak tulisan & badge", sama(t.text_box, { x: 38, y: 760, w: 660, h: 190 }) && sama(t.badge_box, { x: 40, y: 700, w: 200, h: 50 }));
  cek("outro & durasinya", t.outro === "assets/studio/cccccccccccc.mp4" && t.outro_durasi === 2 && t.intro === null);
  cek("kategori bawaan dibawa, dok disimpan", t.kategori === "NEWS" && t.studio === d && t.kunci_hijau === true);
  const tanpaKat = templateDariStudio(dok([el("berita", "berita")])) as Record<string, any>;
  cek("tanpa kotak kategori: badge kosong, teks kategori tidak ada", tanpaKat.badge_box === null && !tanpaKat.texts.some((x: any) => x.name === "kategori"));
  const hookSepanjang = templateDariStudio(dok([el("berita", "berita")])) as Record<string, any>;
  cek("hook sepanjang video: start/end null", hookSepanjang.texts[0].start === null && hookSepanjang.texts[0].end === null);
}

console.log("Dari template editor lama");
{
  const lama = {
    overlays: [
      { label: "kotak monas", file: "assets/kotak.png", x: 0, y: "main_h-h", w: 720, h: null, start: 0, end: 3 },
      { label: "boom like share", file: "assets/boom.gif", x: 45, y: 55, w: 280, h: 158, loop: true },
      { label: "bingkai teratas", file: "assets/bingkai.png", x: 0, y: "main_h-h", w: 720, h: null },
    ],
    texts: [{ name: "hook", style: "berita", align: "center" }],
    text_box: { x: 30, y: 1000, w: 660, h: 230 },
    badge_box: null,
    outro: "assets/penutup.mp4",
    teks_warna: "black",
    kunci_hijau: false,
  };
  const d = studioDariTemplate(lama, { "assets/kotak.png": { w: 1440, h: 600 }, "assets/bingkai.png": { w: 720, h: 120 } }, { x: 36, y: 941, w: 270, h: 59 });
  cek("jenis elemen", sama(d.elemen.map((e) => e.jenis), ["berita", "kategori", "boom", "footer"]), d.elemen.map((e) => e.jenis));
  cek("kotak monas -> berita, tinggi ikut rasio", sama(d.elemen[0].rect, { x: 0, y: 980, w: 720, h: 300 }) && sama(d.elemen[0].teks, lama.text_box));
  cek("badge bawaan dipakai", sama(d.elemen[1].rect, { x: 36, y: 941, w: 270, h: 59 }));
  cek("boom 45,55 280x158 sepanjang", sama(d.elemen[2].rect, { x: 45, y: 55, w: 280, h: 158 }) && sama(d.elemen[2].waktu, SEPANJANG));
  cek("bingkai -> footer di dasar", sama(d.elemen[3].rect, { x: 0, y: 1160, w: 720, h: 120 }));
  cek("penutup -> outro, rata & warna", d.outro.file === "assets/penutup.mp4" && d.rata === "center" && d.teks_warna === "black");
  cek("hasil konversi lolos aturan", periksaAturan(d) === null && DokStudio.safeParse(d).success);
  const tersimpan = studioDariTemplate({ ...lama, studio: sah }, {}, null);
  cek("studio tersimpan diutamakan", sama(tersimpan, sah));
  const kosong = studioDariTemplate(null, {}, null);
  cek("tanpa template: satu kotak berita tanpa berkas", kosong.elemen.length === 1 && kosong.elemen[0].jenis === "berita" && periksaAturan(kosong) === null);
}

console.log("Editor: kanvas");
{
  const garis = garisDari([{ x: 100, y: 200, w: 200, h: 100 }]);
  const g1 = geserRect({ x: 10, y: 10, w: 100, h: 50 }, -3, 0, garis, 8);
  cek("tepi kiri menempel ke tepi kanvas", g1.rect.x === 0 && g1.garis.some((g) => g.arah === "v" && g.pos === 0), g1);
  const g2 = geserRect({ x: 300, y: 600, w: 120, h: 60 }, 3, 0, garis, 8);
  cek("tengah menempel ke tengah kanvas (360)", g2.rect.x + 60 === 360, g2.rect);
  const g3 = geserRect({ x: 500, y: 500, w: 50, h: 50 }, 0, -195, garis, 8);
  cek("tepi atas menempel ke tepi bawah elemen lain (300)", g3.rect.y === 300, g3.rect);
  const g4 = geserRect({ x: 500, y: 500, w: 50, h: 50 }, 7, 0, { v: [], h: [] }, 8);
  cek("tanpa garis: geser apa adanya", g4.rect.x === 507 && g4.garis.length === 0);
  const u1 = ubahUkuran({ x: 100, y: 100, w: 200, h: 100 }, "se", 100, 0, 2, { v: [], h: [] }, 8);
  cek("sudut + kunci rasio", u1.rect.w === 300 && u1.rect.h === 150 && u1.rect.x === 100 && u1.rect.y === 100, u1.rect);
  const u2 = ubahUkuran({ x: 100, y: 100, w: 200, h: 100 }, "nw", -100, 0, 2, { v: [], h: [] }, 8);
  cek("sudut kiri-atas: sudut seberang diam", u2.rect.x === 0 && u2.rect.y === 50 && u2.rect.x + u2.rect.w === 300 && u2.rect.y + u2.rect.h === 200, u2.rect);
  const u3 = ubahUkuran({ x: 100, y: 100, w: 200, h: 100 }, "e", -500, 0, null, { v: [], h: [] }, 8);
  cek("ukuran minimum dijaga", u3.rect.w === 16, u3.rect);
  const u4 = ubahUkuran({ x: 100, y: 100, w: 200, h: 100 }, "e", 415, 0, null, garisDari([]), 8);
  cek("sisi kanan menempel ke tepi kanvas", u4.rect.x + u4.rect.w === 720, u4.rect);
  cek("tinggi baru: menempel dasar tetap di dasar", JSON.stringify(sesuaikanTinggi({ x: 0, y: 1220, w: 720, h: 60 }, 120)) === JSON.stringify({ x: 0, y: 1160, w: 720, h: 120 }));
  cek("tinggi baru: menempel atas tetap di atas", JSON.stringify(sesuaikanTinggi({ x: 0, y: 0, w: 100, h: 50 }, 80)) === JSON.stringify({ x: 0, y: 0, w: 100, h: 80 }));
  cek("tinggi baru: titik tengah diam", JSON.stringify(sesuaikanTinggi({ x: 10, y: 500, w: 100, h: 100 }, 60)) === JSON.stringify({ x: 10, y: 520, w: 100, h: 60 }));
  cek("rata cepat", rataKanvas({ x: 5, y: 5, w: 100, h: 40 }, "kanan").x === 620 && rataKanvas({ x: 5, y: 5, w: 100, h: 40 }, "bawah").y === 1240 && rataKanvas({ x: 5, y: 5, w: 100, h: 40 }, "tengah-h").x === 310);
  cek("jepit rect ke batas skema server", sama(jepitRect({ x: -5000, y: 9999, w: 1, h: 99999 }), { x: -720, y: 2560, w: 8, h: 3840 }) && sama(jepitRect({ x: 10.4, y: 20.6, w: 100, h: 50 }), { x: 10, y: 21, w: 100, h: 50 }));
  const jauh = geserRect({ x: 100, y: 100, w: 100, h: 100 }, 99999, -99999, { v: [], h: [] }, 8);
  cek("geser jauh keluar kanvas tetap lolos skema", sama(jauh.rect, { x: 1440, y: -1280, w: 100, h: 100 }) && DokStudio.safeParse(dok([el("berita", "berita"), el("pernak-1", "pernak", { rect: jauh.rect })])).success, jauh.rect);
  const besar = ubahUkuran({ x: 0, y: 0, w: 200, h: 100 }, "se", 99999, 99999, null, { v: [], h: [] }, 8);
  cek("ubah ukuran raksasa dijepit", besar.rect.w === 2160 && besar.rect.h === 3840, besar.rect);
  cek("jepit area tulisan ke kanvas", JSON.stringify(jepitKanvas({ x: -20, y: 1250, w: 900, h: 100 })) === JSON.stringify({ w: 720, h: 100, x: 0, y: 1180 }));
}

console.log("Editor: timeline");
{
  cek("tempel detik ke titik", tempelDetik(5.2, [5], 0.4, false) === 5 && tempelDetik(5.2, [5], 0.4, true) === 5.2);
  cek("tempel ke kelipatan 0,5", tempelDetik(7.45, [], 0.2, false) === 7.5);
  const w0 = { mulai: { dari: "awal" as const, d: 5 }, selesai: { dari: "akhir" as const, d: 3 } };
  const kanan = seretWaktu(w0, "kanan", 2, 40, [], 0.2, false);
  cek("tarik ujung kanan +2 -> 1 dtk sblm akhir", JSON.stringify(kanan) === JSON.stringify({ mulai: { dari: "awal", d: 5 }, selesai: { dari: "akhir", d: 1 } }), kanan);
  const mentok = seretWaktu(w0, "kanan", 10, 40, [40], 0.2, false);
  cek("tarik mentok -> akhir video", mentok.selesai.dari === "akhir" && mentok.selesai.d === 0, mentok);
  const kiri = seretWaktu(w0, "kiri", 40, 40, [], 0.2, false);
  cek("ujung kiri tidak melewati ujung kanan - 0,5", Math.abs(37 - 0.5 - (kiri.mulai.dari === "awal" ? kiri.mulai.d : 40 - kiri.mulai.d)) < 1e-9, kiri);
  const geser = seretWaktu({ mulai: { dari: "awal", d: 0 }, selesai: { dari: "awal", d: 3 } }, "tengah", 10, 40, [], 0.2, false);
  cek("geser tengah: durasi tetap", JSON.stringify(geser) === JSON.stringify({ mulai: { dari: "awal", d: 10 }, selesai: { dari: "awal", d: 13 } }), geser);
  const keUjung = seretWaktu({ mulai: { dari: "awal", d: 0 }, selesai: { dari: "awal", d: 3 } }, "tengah", 99, 40, [], 0.2, false);
  cek("geser tengah mentok akhir", JSON.stringify(keUjung) === JSON.stringify({ mulai: { dari: "akhir", d: 3 }, selesai: { dari: "akhir", d: 0 } }), keUjung);
  // Seret SATU ujung tidak boleh memindah patokan ujung yang lain (dulu: paruh akhir -> "akhir 15").
  const wMid = { mulai: { dari: "awal" as const, d: 25 }, selesai: { dari: "akhir" as const, d: 3 } };
  const kananSaja = seretWaktu(wMid, "kanan", 1, 40, [], 0.2, false);
  cek("tarik kanan: mulai 'awal 25' tetap (tidak jadi 'akhir 15')", sama(kananSaja, { mulai: { dari: "awal", d: 25 }, selesai: { dari: "akhir", d: 2 } }), kananSaja);
  const wAwal = { mulai: { dari: "awal" as const, d: 2 }, selesai: { dari: "awal" as const, d: 8 } };
  const kiriSaja = seretWaktu(wAwal, "kiri", 1, 10, [], 0.05, false);
  cek("tarik kiri: selesai 'awal 8' tetap (tidak jadi 'akhir 2')", sama(kiriSaja, { mulai: { dari: "awal", d: 3 }, selesai: { dari: "awal", d: 8 } }), kiriSaja);
  const tengahMid = seretWaktu(wMid, "tengah", -20, 40, [], 0.05, false);
  cek("geser tengah: kedua ujung dipatok ulang", sama(tengahMid, { mulai: { dari: "awal", d: 5 }, selesai: { dari: "awal", d: 17 } }), tengahMid);
  cek("balik patok mulai", JSON.stringify(balikPatok(w0, "mulai", 40).mulai) === JSON.stringify({ dari: "akhir", d: 35 }) && JSON.stringify(balikPatok(w0, "selesai", 40).selesai) === JSON.stringify({ dari: "awal", d: 37 }));
}

console.log("Editor: elemen & riwayat");
{
  const d0 = dok([el("berita", "berita")]);
  const logo = elemenBaru(d0, "logo", "assets/studio/aaaaaaaaaaaa.png", { w: 400, h: 200 });
  cek("logo baru: kanan atas, rasio berkas", logo.rect.w === 150 && logo.rect.h === 75 && logo.rect.x === 720 - 150 - 24 && logo.rect.y === 24, logo.rect);
  const footer = elemenBaru(d0, "footer", "assets/studio/aaaaaaaaaaaa.png", { w: 1440, h: 120 });
  cek("footer baru: selebar kanvas di dasar", JSON.stringify(footer.rect) === JSON.stringify({ x: 0, y: 1220, w: 720, h: 60 }), footer.rect);
  const p1 = elemenBaru(d0, "pernak", "assets/studio/aaaaaaaaaaaa.png", { w: 100, h: 100 });
  cek("pernak baru: id unik, sepanjang video", p1.id === "pernak-1" && JSON.stringify(p1.waktu) === JSON.stringify(SEPANJANG));
  const d1 = { ...d0, elemen: [...d0.elemen, logo, p1] };
  cek("elemen baru lolos aturan", periksaAturan(d1) === null && DokStudio.safeParse(d1).success);
  const naik = pindahUrutan(d1, "logo", 1);
  cek("ke depan / ke belakang", naik.elemen.map((e) => e.id).join() === "berita,pernak-1,logo" && pindahUrutan(naik, "logo", 1) === naik);
  let r = catatRiwayat({ lalu: [], nanti: [] }, d0);
  r = catatRiwayat(r, d0);
  cek("riwayat tidak menumpuk keadaan sama", r.lalu.length === 1);
  const u = urungkan(r, d1)!;
  cek("urungkan", JSON.stringify(u.dok) === JSON.stringify(d0) && u.riwayat.nanti.length === 1);
  const ul = ulangi(u.riwayat, u.dok)!;
  cek("ulangi", JSON.stringify(ul.dok) === JSON.stringify(d1) && ulangi({ lalu: [], nanti: [] }, d0) === null);
  // Riwayat malas: urungkan lalu klik elemen (snapshot tanpa perubahan) tidak membuang ulangi.
  const sesudahUrung = u.riwayat;
  const tunda = JSON.stringify(u.dok);
  cek("klik tanpa perubahan: tidak perlu dicatat", !perluCatat(tunda, u.dok) && !perluCatat(null, d1));
  cek("klik tanpa perubahan: ulangi masih bisa", ulangi(sesudahUrung, u.dok) !== null && sesudahUrung.nanti.length === 1);
  const d2 = { ...u.dok, teks_warna: "black" as const };
  cek("perubahan nyata: dicatat & ulangi dikosongkan", perluCatat(tunda, d2) && (() => {
    const r2 = catatRiwayat(sesudahUrung, tunda);
    return r2.nanti.length === 0 && r2.lalu[r2.lalu.length - 1] === tunda;
  })());
}

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);

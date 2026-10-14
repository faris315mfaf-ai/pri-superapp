// ============================================================
// DUNIA RUANG BOT — sayap penghuni (14 Okt 2026): aula, ruang database (rak),
// ruang alat (Auto Edit / Kompres / Blur Watermark), ruang pos (kotak post),
// dan karakter pengguna online beserta animasi yang mereka bawa.
//
// Latar statis (lantai, dinding, jendela, pintu depan, papan) digambar sekali
// (latarSayap); yang bergerak (lampu papan, rak terisi, mesin menyala, kotak post,
// karakter) digambar tiap frame berurut kedalaman lewat daftarkanObjekSayap.
// Semua animasi mesin/rak/kotak bergantung pada ADA TIDAKNYA orang yang sedang
// bekerja di stasiun itu (data nyata dari server), bukan putaran dekoratif.
// ============================================================

import {
  KOTAK_POST,
  MESIN_ALAT,
  PINTU_SAYAP,
  RAK_DATABASE,
  STASIUN_PENGHUNI,
  type JenisStasiunPenghuni,
  type Titik,
} from "./denah";
import { P, WP, box, dindingBand, disc, frect, jendela, lantai, poly, px, terang, wq, type Ctx, type PosisiLayar } from "./dunia-primitif";
import type { Penghuni, SimulasiPenghuni } from "./simulasi-penghuni";
import { gambarKarakter, type PoseBot } from "./sprite-bot";

/** Warna lampu papan & kepala mesin per jenis stasiun. */
export const WARNA_STASIUN: Record<JenisStasiunPenghuni, string> = {
  rak: "#a78bfa",
  autoedit: "#34d399",
  kompres: "#f59e0b",
  blur: "#38bdf8",
  kotak_post: "#f97316",
};

export type AdeganSayap = {
  c: Ctx;
  /** ms (performance.now) — dasar semua animasi berulang. */
  t: number;
  malam: boolean;
  penghuni: SimulasiPenghuni;
  terpilihPenghuniId: number | null;
  posisiPenghuni: Map<number, PosisiLayar>;
};

// ---------- latar statis ----------

export function latarSayap(c: Ctx, malam: boolean) {
  // lantai per ruang
  lantai(c, 16, 28, 0, 6, "#ddd5c6", "#d2c9b6", 111); // aula (marmer hangat)
  lantai(c, 16, 20, 6, 16, "#bdb2dd", "#afa4d2", 127); // database (ungu muda)
  lantai(c, 20, 24, 6, 16, "#abc5db", "#9db8d0", 141); // alat (biru dingin)
  lantai(c, 24, 28, 6, 16, "#eecda4", "#e2bd90", 157); // pos (oranye muda)
  // karpet sambutan di aula
  frect(c, 17.2, 27.0, 2.1, 3.9, "#6d2a38");
  frect(c, 17.35, 26.85, 2.25, 3.75, "#8f3646");
  frect(c, 17.6, 26.6, 2.5, 3.5, "#d9a441");
  frect(c, 17.68, 26.52, 2.58, 3.42, "#8f3646");
  // jalur lantai di dalam ruang (garis kuning putus-putus menuju tiap pintu)
  for (const x of [PINTU_SAYAP.database, PINTU_SAYAP.alat, PINTU_SAYAP.pos]) {
    for (let y = 6.6; y < 15.4; y += 1.2) frect(c, x - 0.05, x + 0.05, y, y + 0.55, "rgba(217,164,65,.55)");
  }
  // bayangan dinding belakang di lantai aula
  poly(c, [P(16, 0), P(28, 0), P(28, 0.55), P(16, 0.55)], "rgba(30,14,10,.2)");
  // dinding belakang aula (y=0, x 16..28)
  dindingBand(c, "R", 16, 28, "#27483f", "#d9a441", "#2c3f3a", "#37554d");
  jendela(c, malam, "R", 16.9, 18.1);
  jendela(c, malam, "R", 18.9, 20.1);
  jendela(c, malam, "R", 24.4, 25.6);
  // papan aktivitas (lampu per stasiun digambar dinamis)
  wq(c, "R", 20.85, 23.85, 20, 52, "#c89458");
  wq(c, "R", 21.0, 23.7, 21.5, 50.5, "#0e1626");
  // pintu depan (tempat orang masuk / pergi)
  wq(c, "R", 26.45, 28.0, 0, 52, "#c89458");
  wq(c, "R", 26.6, 27.9, 0, 48, "#6b4426");
  wq(c, "R", 26.75, 27.75, 3, 22, "#7a5030");
  wq(c, "R", 26.75, 27.75, 25, 45, "#7a5030");
  const gagang = WP("R", 26.8, 24);
  disc(c, gagang[0], gagang[1], 1, "#e6b878");
  wq(c, "R", 26.7, 27.8, 49, 53, "#0b1a14");
  const lampuMasuk = WP("R", 27.25, 51);
  disc(c, lampuMasuk[0], lampuMasuk[1], 1, "#4ade80");
}

// ---------- dinding dinamis ----------

export function dindingSayap(a: AdeganSayap) {
  const { c, penghuni } = a;
  const jenis: JenisStasiunPenghuni[] = ["rak", "autoedit", "kompres", "blur", "kotak_post"];
  jenis.forEach((j, i) => {
    const v0 = 40 - i * 4.4;
    const nyala = penghuni.adaYangBekerja(j);
    wq(c, "R", 21.12, 21.52, v0, v0 + 2.8, nyala ? WARNA_STASIUN[j] : terang(WARNA_STASIUN[j], 0.28));
    // panjang batang = jumlah orang yang sedang bekerja di stasiun itu
    const n = STASIUN_PENGHUNI[j].filter((_, idx) => penghuni.penghuniDi(j, idx)).length;
    const total = STASIUN_PENGHUNI[j].length;
    wq(c, "R", 21.7, 21.7 + 1.9 * (total > 0 ? n / total : 0), v0 + 0.5, v0 + 2.3, WARNA_STASIUN[j]);
  });
  // jumlah penghuni online: deretan titik hijau (maks 18)
  const online = penghuni.penghuni.length;
  for (let i = 0; i < 18; i++) {
    const u = 21.1 + (i % 9) * 0.28;
    const v = 24 + Math.floor(i / 9) * 2.2;
    wq(c, "R", u, u + 0.18, v, v + 1.4, i < online ? "#22c55e" : "#1c2a3a");
  }
}

// ---------- perabot ----------

function tanamanSayap(c: Ctx, gx: number, gy: number) {
  const [x, y] = P(gx, gy, 0);
  box(c, gx - 0.3, gy - 0.3, 0.6, 0.6, 9, 0, "#b3562f", "#8c3f20", "#6e2f17");
  px(c, x - 1, y - 26, 3, 17, "#5a3a1c");
  const daun: [number, number, number, string][] = [
    [x, y - 34, 9, "#2f6b34"],
    [x - 7, y - 27, 6, "#2f6b34"],
    [x + 7, y - 27, 6, "#2f6b34"],
    [x - 3, y - 40, 6, "#3b8442"],
    [x + 4, y - 36, 5, "#3b8442"],
    [x, y - 30, 5, "#4fa24f"],
  ];
  for (const d of daun) disc(c, d[0], d[1], d[2], d[3]);
  px(c, x - 4, y - 40, 2, 2, "#7ec96b");
  px(c, x + 3, y - 34, 2, 2, "#7ec96b");
}

const WARNA_BERKAS = ["#a78bfa", "#38bdf8", "#34d399", "#f59e0b", "#f472b6", "#fde68a"];

/** Satu rak penyimpanan: 4 rak x 3 sel; sel berisi berkas berwarna, LED hijau bila ada yang sedang mengisi. */
function rakDatabase(a: AdeganSayap, r: { gx: number; gy: number; panjang: number }, i: number) {
  const { c, t, penghuni } = a;
  const pekerja = penghuni.penghuniDi("rak", i);
  box(c, r.gx, r.gy, 0.9, r.panjang, 52, 0, "#4f536b", "#393d52", "#444860");
  const x = r.gx + 0.9;
  poly(c, [P(x, r.gy + 0.05, 50), P(x, r.gy + r.panjang - 0.05, 50), P(x, r.gy + r.panjang - 0.05, 3), P(x, r.gy + 0.05, 3)], "#1b1e2c");
  // jumlah sel terisi: bertambah selama ada yang mengisi, lalu berputar (rak penuh dikosongkan).
  const dasar = 3 + ((i * 5) % 6);
  const terisi = pekerja ? 2 + (Math.floor(t / 1400 + pekerja.id) % 10) : dasar;
  for (let rak = 0; rak < 4; rak++) {
    const zb = 6 + rak * 11.5;
    for (let k = 0; k < 3; k++) {
      const idx = rak * 3 + k;
      const y0 = r.gy + 0.1 + k * ((r.panjang - 0.2) / 3);
      const y1 = y0 + (r.panjang - 0.2) / 3 - 0.07;
      const penuh = idx < terisi;
      poly(c, [P(x, y0, zb + 8.5), P(x, y1, zb + 8.5), P(x, y1, zb), P(x, y0, zb)], penuh ? WARNA_BERKAS[(i + idx) % WARNA_BERKAS.length] : "#262a3c");
      if (penuh) poly(c, [P(x, y0 + 0.03, zb + 8.5), P(x, y1 - 0.03, zb + 8.5), P(x, y1 - 0.03, zb + 7.2), P(x, y0 + 0.03, zb + 7.2)], "rgba(255,255,255,.25)");
    }
    poly(c, [P(x, r.gy + 0.03, zb - 1), P(x, r.gy + r.panjang - 0.03, zb - 1), P(x, r.gy + r.panjang - 0.03, zb - 2.2), P(x, r.gy + 0.03, zb - 2.2)], "#6b6f88");
  }
  // lampu status
  const led = P(x, r.gy + r.panjang - 0.15, 51);
  px(c, led[0] - 1, led[1] - 1, 2, 2, pekerja ? (Math.floor(t / 300) % 2 ? "#4ade80" : "#16a34a") : "#3f4a45");
}

function petiKayu(c: Ctx, gx: number, gy: number, w = 0.7, d = 0.7, h = 8) {
  box(c, gx, gy, w, d, h, 0, "#cfa05a", "#a87a3a", "#8a6028");
  box(c, gx + 0.05, gy + 0.05, w - 0.1, d - 0.1, 0.8, h, "#dcb06a", "#b88a48", "#9a7030");
}

function mesinAlat(a: AdeganSayap, m: (typeof MESIN_ALAT)[number], sinar: Titik[]) {
  const { c, t, penghuni } = a;
  const warna = WARNA_STASIUN[m.jenis];
  const sibuk = STASIUN_PENGHUNI[m.jenis].some((_, idx) => penghuni.penghuniDi(m.jenis, idx));
  box(c, m.gx, m.gy, 0.9, m.panjang, 28, 0, "#dfe3ea", "#aab1bd", "#8b93a1");
  // kepala berwarna di atas mesin
  box(c, m.gx, m.gy, 0.9, m.panjang, 3, 28, warna, terang(warna, 0.78), terang(warna, 0.62));
  const x = m.gx + 0.9;
  const y0 = m.gy + 0.18;
  const y1 = m.gy + m.panjang - 0.18;
  const lebar = y1 - y0;
  const layar = (za: number, zb: number, isi: string) => poly(c, [P(x, y0, zb), P(x, y1, zb), P(x, y1, za), P(x, y0, za)], isi);
  if (m.jenis === "autoedit") {
    layar(11, 25, sibuk ? "#0a1a14" : "#141c18");
    if (sibuk) {
      // bingkai film bergulir + bilah kemajuan render
      for (let k = 0; k < 4; k++) {
        const ya = y0 + 0.08 + ((k * 0.5 + t / 1600) % 2.0) * (lebar / 2.4);
        if (ya + 0.4 > y1) continue;
        poly(c, [P(x, ya, 23), P(x, ya + 0.38, 23), P(x, ya + 0.38, 16), P(x, ya, 16)], ["#34d399", "#6ee7b7", "#a7f3d0", "#10b981"][k]);
      }
      const prog = (t / 5200) % 1;
      poly(c, [P(x, y0 + 0.08, 14.2), P(x, y0 + 0.08 + (lebar - 0.16) * prog, 14.2), P(x, y0 + 0.08 + (lebar - 0.16) * prog, 12.4), P(x, y0 + 0.08, 12.4)], "#34d399");
    }
  } else if (m.jenis === "kompres") {
    layar(14, 25, sibuk ? "#1c1608" : "#17140c");
    // ruang pres: dua pelat yang saling mendekat, kotak di tengah mengecil
    const tekan = sibuk ? 0.5 + 0.5 * Math.sin(t / 340) : 0;
    const ya = y0 + 0.12;
    const yb = y1 - 0.12;
    const tinggiKotak = 7 - tekan * 3;
    poly(c, [P(x, ya + 0.1, 15 + tinggiKotak), P(x, yb - 0.1, 15 + tinggiKotak), P(x, yb - 0.1, 15), P(x, ya + 0.1, 15)], sibuk ? "#f59e0b" : "#7a5a20");
    poly(c, [P(x, ya, 15 + tinggiKotak + 2), P(x, yb, 15 + tinggiKotak + 2), P(x, yb, 15 + tinggiKotak), P(x, ya, 15 + tinggiKotak)], "#cbd5e1");
    // ukuran berkas (bilah) menyusut dari penuh ke ~60%
    if (sibuk) {
      const f = 1 - 0.4 * ((t / 4200) % 1);
      poly(c, [P(x, y0 + 0.08, 12.4), P(x, y0 + 0.08 + (lebar - 0.16) * f, 12.4), P(x, y0 + 0.08 + (lebar - 0.16) * f, 10.4), P(x, y0 + 0.08, 10.4)], "#fbbf24");
    }
  } else {
    layar(11, 25, sibuk ? "#0b1424" : "#10161f");
    if (sibuk) {
      // kerangka video + tambalan mosaik (blur) yang bergerak menutup watermark
      poly(c, [P(x, y0 + 0.1, 23.5), P(x, y1 - 0.1, 23.5), P(x, y1 - 0.1, 13), P(x, y0 + 0.1, 13)], "#1e3a5f");
      const px0 = y0 + 0.18 + ((Math.sin(t / 900) + 1) / 2) * (lebar - 0.9);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 2; j++) {
          poly(c, [P(x, px0 + i * 0.2, 22 - j * 3), P(x, px0 + i * 0.2 + 0.19, 22 - j * 3), P(x, px0 + i * 0.2 + 0.19, 19.2 - j * 3), P(x, px0 + i * 0.2, 19.2 - j * 3)], (i + j) % 2 ? "#93c5fd" : "#64748b");
        }
      }
    }
  }
  // lampu penanda
  const l = P(x, m.gy + m.panjang - 0.3, 27);
  px(c, l[0] - 1, l[1] - 1, 3, 2, sibuk ? (Math.floor(t / 260) % 2 ? warna : terang(warna, 0.6)) : "#3a3f48");
  if (sibuk) sinar.push([l[0], l[1] - 6]);
}

function kotakPost(a: AdeganSayap) {
  const { c, t, penghuni } = a;
  const k = KOTAK_POST;
  const sibuk = penghuni.adaYangBekerja("kotak_post");
  box(c, k.gx, k.gy, k.lebar, k.panjang, 34, 0, "#3b7be8", "#2a5cb8", "#214a96");
  box(c, k.gx - 0.1, k.gy - 0.1, k.lebar + 0.2, k.panjang + 0.2, 3, 34, "#2150a0", "#183c7a", "#133060");
  const x = k.gx + k.lebar;
  // celah surat + pelat tulisan
  poly(c, [P(x, k.gy + 0.45, 26), P(x, k.gy + k.panjang - 0.45, 26), P(x, k.gy + k.panjang - 0.45, 23), P(x, k.gy + 0.45, 23)], "#0a1226");
  poly(c, [P(x, k.gy + 0.3, 17), P(x, k.gy + k.panjang - 0.3, 17), P(x, k.gy + k.panjang - 0.3, 9), P(x, k.gy + 0.3, 9)], "#f5f1e8");
  for (let i = 0; i < 4; i++) {
    poly(c, [P(x, k.gy + 0.4 + i * 0.35, 15), P(x, k.gy + 0.65 + i * 0.35, 15), P(x, k.gy + 0.65 + i * 0.35, 11), P(x, k.gy + 0.4 + i * 0.35, 11)], "#f97316");
  }
  // bendera: naik saat ada yang sedang memasukkan surat
  const tiang = P(k.gx + k.lebar * 0.5, k.gy + k.panjang - 0.2, 37);
  px(c, tiang[0], tiang[1] - 12, 1, 12, "#d1d5db");
  const naik = sibuk ? 0 : 7;
  poly(c, [[tiang[0] + 1, tiang[1] - 12 + naik], [tiang[0] + 8, tiang[1] - 10 + naik], [tiang[0] + 1, tiang[1] - 7 + naik]], "#ef4444");
  // lampu masuk: berkedip tiap surat tiba
  const lampu = P(x, k.gy + 0.25, 30);
  px(c, lampu[0] - 1, lampu[1] - 1, 3, 2, sibuk && Math.floor(t / 400) % 2 ? "#fde68a" : "#4a4030");
}

function mejaPos(c: Ctx) {
  box(c, 26.6, 13.2, 1.1, 1.7, 7, 0, "#e0a95f", "#b9763a", "#8e5528");
  box(c, 26.75, 13.35, 0.45, 0.5, 2.5, 7, "#f5f1e8", "#ddd6c4", "#c8bfa8");
  box(c, 27.2, 14.2, 0.4, 0.5, 2.5, 7, "#f9fafb", "#e5e7eb", "#cbd5e1");
}

// ---------- karakter ----------

function bawaan(a: AdeganSayap, p: Penghuni, fx: number, fy: number) {
  const s = p.stasiun;
  if (!s || p.keadaan !== "kerja") return;
  const { c, t } = a;
  const tangan: Titik = [fx - 4, fy - 16];
  const ease = (u: number) => u * u * (3 - 2 * u);
  if (s.jenis === "rak") {
    const T = 2800;
    const ph = ((t + p.id * 377) % T) / T;
    const rak = RAK_DATABASE[s.idx];
    const rakKe = Math.floor((t + p.id * 377) / T) % 4;
    const tujuan = P(rak.gx + 0.9, rak.gy + rak.panjang / 2, 12 + rakKe * 11.5);
    const warna = WARNA_BERKAS[(p.id + rakKe) % WARNA_BERKAS.length];
    let bx: number | null = null;
    let by = 0;
    if (ph < 0.58) {
      const u = ease(ph / 0.58);
      bx = tangan[0] + (tujuan[0] - tangan[0]) * u;
      by = tangan[1] + (tujuan[1] - tangan[1]) * u - Math.sin(u * Math.PI) * 4;
    } else if (ph > 0.88) {
      bx = tangan[0];
      by = tangan[1];
    }
    if (bx !== null) {
      px(c, Math.round(bx) - 3, Math.round(by) - 3, 6, 5, warna);
      px(c, Math.round(bx) - 3, Math.round(by) - 3, 6, 1, "rgba(255,255,255,.55)");
    }
  } else if (s.jenis === "kotak_post") {
    const T = 2400;
    const ph = ((t + p.id * 311) % T) / T;
    const slot = P(KOTAK_POST.gx + KOTAK_POST.lebar, KOTAK_POST.gy + KOTAK_POST.panjang / 2, 24.5);
    let bx: number | null = null;
    let by = 0;
    if (ph < 0.6) {
      const u = ease(ph / 0.6);
      bx = tangan[0] + (slot[0] - tangan[0]) * u;
      by = tangan[1] + (slot[1] - tangan[1]) * u - Math.sin(u * Math.PI) * 6;
    } else if (ph > 0.86) {
      bx = tangan[0];
      by = tangan[1];
    }
    if (bx !== null) {
      const x = Math.round(bx);
      const y = Math.round(by);
      px(c, x - 3, y - 2, 7, 5, "#f8f3e4");
      px(c, x - 3, y - 2, 7, 1, "#ef4444");
      px(c, x - 1, y, 3, 1, "#8a8070");
    }
  }
}

function gambarPenghuni(a: AdeganSayap, p: Penghuni) {
  const { c, t } = a;
  const [fx, fy] = P(p.x, p.y, 0);
  const bergerak = p.keadaan === "masuk" || p.keadaan === "jalan" || p.keadaan === "keluar";
  const alat = p.keadaan === "kerja" && p.stasiun !== null && (p.stasiun.jenis === "autoedit" || p.stasiun.jenis === "kompres" || p.stasiun.jenis === "blur");
  const pose: PoseBot = bergerak ? "jalan" : alat ? "ketik" : "diam";
  c.globalAlpha = Math.max(0, Math.min(1, p.alfa));
  if (a.terpilihPenghuniId === p.id) {
    c.fillStyle = "rgba(253,230,138,.8)";
    c.fillRect(fx - 9, fy, 18, 1);
    c.fillRect(fx - 7, fy + 1, 14, 1);
    c.fillRect(fx - 9, fy - 1, 1, 1);
    c.fillRect(fx + 8, fy - 1, 1, 1);
  }
  gambarKarakter(c, fx, fy, {
    rupa: p.rupa,
    waktu: t + p.id * 91,
    pose,
    angkat: 0,
    arah: p.arah,
    belakang: p.belakang && (bergerak || p.keadaan === "kerja"),
    bicara: p.teks !== "" && p.keadaan === "kerja",
    lencana: p.warna,
  });
  bawaan(a, p, fx, fy);
  c.globalAlpha = 1;
  a.posisiPenghuni.set(p.id, { sx: fx, sy: fy });
}

/**
 * Daftarkan semua objek sayap ke daftar berurut-kedalaman milik adegan utama.
 * `tambah(kunciKedalaman, fungsiGambar)`; `sinar` menampung titik cahaya untuk mode malam.
 */
export function daftarkanObjekSayap(a: AdeganSayap, tambah: (k: number, f: () => void) => void, sinar: Titik[]) {
  const { c } = a;
  // aula
  tambah(16.6 + 0.6, () => tanamanSayap(c, 16.7, 0.7));
  tambah(16.7 + 5.4, () => tanamanSayap(c, 16.7, 5.4));
  tambah(27.5 + 5.4, () => tanamanSayap(c, 27.5, 5.4));
  // ruang database
  RAK_DATABASE.forEach((r, i) => tambah(r.gx + 0.9 + r.gy + r.panjang, () => rakDatabase(a, r, i)));
  tambah(18.9 + 8.4, () => petiKayu(c, 18.5, 8.0));
  tambah(18.9 + 12.6, () => petiKayu(c, 18.6, 12.2, 0.8, 0.8, 11));
  tambah(19.2 + 15.2, () => tanamanSayap(c, 19.2, 15.2));
  // ruang alat
  for (const m of MESIN_ALAT) tambah(m.gx + 0.9 + m.gy + m.panjang, () => mesinAlat(a, m, sinar));
  tambah(23.2 + 15.2, () => tanamanSayap(c, 23.2, 15.2));
  // ruang pos
  tambah(KOTAK_POST.gx + KOTAK_POST.lebar + KOTAK_POST.gy + KOTAK_POST.panjang, () => kotakPost(a));
  tambah(27.7 + 14.9, () => mejaPos(c));
  tambah(27.4 + 15.3, () => tanamanSayap(c, 27.4, 15.3));
  // orang
  // Yang berdiri di stasiun selalu di depan rak/mesin/kotak (kunci objek panjang = sudut depannya, bisa lebih besar).
  for (const p of a.penghuni.penghuni) tambah(p.x + p.y + (p.keadaan === "kerja" ? 0.9 : 0.01), () => gambarPenghuni(a, p));
}


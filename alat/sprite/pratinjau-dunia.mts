// ============================================================
// PRATINJAU DUNIA v2 — rakit gedung Ruang Bot dari src/features/ruang-bot/denah2.ts
// + aset public/ruang|perabot|karakter/v1 menjadi satu PNG untuk diperiksa mata.
// Dinding dalam diturunkan jadi sekat rendah dengan celah pintu (aturan sama dengan
// penggambar). Karakter contoh di setiap stasiun, jalur A* contoh digambar merah.
//
//   npx tsx alat/sprite/pratinjau-dunia.mts [keluar.png] [--skala 1] [--tanpa-jalur]
// ============================================================

import fs from "node:fs";
import sharp from "sharp";
import {
  DALAM_DUNIA,
  KASUR2,
  KURSI_NARA_RAPAT2,
  KURSI_RAPAT2,
  KURSI_TAMU_RAPAT2,
  LEBAR_DUNIA,
  MEJA_KOORDINATOR2,
  PAPAN_TUGAS2,
  PERABOT2,
  PINTU2,
  PINTU_MASUK2,
  RUANG2,
  SLOT_AULA2,
  STASIUN2,
  STASIUN_PENGHUNI2,
  TITIK_TENGAH2,
  cariJalan,
  kedalamanKarakter,
  kedalamanPerabot,
  type Duduk2,
  type Titik,
} from "../../src/features/ruang-bot/denah2";

const argv = process.argv.slice(2);
const KELUAR = argv.find((a) => !a.startsWith("--")) ?? "pratinjau-dunia.png";
const SKALA = Number(argv[argv.indexOf("--skala") + 1] ?? 1) || 1;
const TANPA_JALUR = argv.includes("--tanpa-jalur");
const TINGGI_SEKAT = 18; // px dunia (1x) sisa dinding dalam

const mRuang = JSON.parse(fs.readFileSync("public/ruang/v1/manifest.json", "utf8"));
const mPerabot = JSON.parse(fs.readFileSync("public/perabot/v1/manifest.json", "utf8"));
const mKarakter = JSON.parse(fs.readFileSync("public/karakter/v1/manifest.json", "utf8"));

const PINGGIR = 60;
const TINGGI_ATAS = 220;
const OX = DALAM_DUNIA * 32 + PINGGIR;
const OY = TINGGI_ATAS;
const W = (LEBAR_DUNIA + DALAM_DUNIA) * 32 + PINGGIR * 2;
const H = (LEBAR_DUNIA + DALAM_DUNIA) * 16 + TINGGI_ATAS + 80;
const layar = (x: number, y: number) => ({ x: OX + (x - y) * 32, y: OY + (x + y) * 16 });

type Lapis = { kunci: number; input: Buffer; raw: { width: number; height: number; channels: 4 }; left: number; top: number };

async function rgba(berkas: string, potong?: { left: number; top: number; width: number; height: number }) {
  let s = sharp(berkas).ensureAlpha();
  if (potong) s = s.extract(potong);
  const { data, info } = await s.raw().toBuffer({ resolveWithObject: true });
  return { d: data, w: info.width, h: info.height };
}

const diPintu = (sumbu: "x" | "y", pada: number, t: number) => PINTU2.some((p) => p.sumbu === sumbu && p.pada === pada && t > p.dari && t < p.sampai);

async function lapisRuang(): Promise<Lapis[]> {
  const hasil: Lapis[] = [];
  for (const r of [...RUANG2].sort((a, b) => a.x + a.y - (b.x + b.y))) {
    const m = mRuang.ruang[r.modul];
    const g = await rgba(`public/ruang/v1/${m.file}`);
    const { x: bx, y: by } = m.sudutBelakang;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const o = (y * g.w + x) * 4;
      if (!g.d[o + 3]) continue;
      // dinding kiri (x = r.x, sepanjang y) di sisi kiri sudut belakang
      if (r.potongKiri && x <= bx) {
        const tepi = by + (bx - x) / 2;
        const t = r.y + (bx - x) / 32; // posisi sepanjang dinding (koordinat y dunia)
        if (y < tepi && x >= bx - r.d * 32 - 40) {
          if (y < tepi - TINGGI_SEKAT || diPintu("x", r.x, t)) g.d[o + 3] = 0;
          else if (y < tepi - TINGGI_SEKAT + 3) { g.d[o] = 120; g.d[o + 1] = 82; g.d[o + 2] = 52; }
        }
      }
      if (r.potongKanan && x >= bx) {
        const tepi = by + (x - bx) / 2;
        const t = r.x + (x - bx) / 32;
        if (y < tepi && x <= bx + r.w * 32 + 40) {
          if (y < tepi - TINGGI_SEKAT || diPintu("y", r.y, t)) g.d[o + 3] = 0;
          else if (y < tepi - TINGGI_SEKAT + 3) { g.d[o] = 120; g.d[o + 1] = 82; g.d[o + 2] = 52; }
        }
      }
    }
    const s = layar(r.x, r.y);
    hasil.push({ kunci: -1000 + r.x + r.y, input: g.d, raw: { width: g.w, height: g.h, channels: 4 }, left: Math.round(s.x - bx), top: Math.round(s.y - by) });
  }
  return hasil;
}

async function lapisPerabot(): Promise<Lapis[]> {
  const hasil: Lapis[] = [];
  for (const p of PERABOT2) {
    const b = mPerabot.benda[p.sprite];
    const frame = p.kunci && b.keadaan ? Math.min(2, b.keadaan.length - 1) : 0; // keadaan "menyala" untuk pratinjau
    const g = await rgba(`public/perabot/v1/${b.file}`, { left: frame * b.frame.width, top: 0, width: b.frame.width, height: b.frame.height });
    const s = layar(p.x + p.tapak[0], p.y + p.tapak[1]);
    hasil.push({ kunci: kedalamanPerabot(p), input: g.d, raw: { width: g.w, height: g.h, channels: 4 }, left: Math.round(s.x - b.jangkar.x), top: Math.round(s.y - b.jangkar.y) });
  }
  return hasil;
}

const ARAH_BARIS = { NW: 0, NE: 1, SE: 2, SW: 3 } as const;

async function karakter(titik: Titik, duduk: Duduk2 | null, arah: keyof typeof ARAH_BARIS, anim: "idle" | "sit" | "work", rambut: number): Promise<Lapis[]> {
  const baris = ARAH_BARIS[arah];
  const badan = await rgba(`public/karakter/v1/badan_${anim}.png`, { left: 0, top: baris * 96, width: 64, height: 96 });
  const rb = await rgba(`public/karakter/v1/rambut_${String(rambut).padStart(2, "0")}.png`, { left: 0, top: baris * 96, width: 64, height: 96 });
  const h = mKarakter.kepala[anim][arah][0];
  const h0 = mKarakter.kepala.idle[arah][0];
  const gx = Math.round(h[0] - h0[0]), gy = Math.round(h[1] - h0[1]);
  for (let y = 0; y < 96; y++) for (let x = 0; x < 64; x++) {
    const so = (y * 64 + x) * 4;
    if (!rb.d[so + 3]) continue;
    const tx = x + gx, ty = y + gy;
    if (tx < 0 || ty < 0 || tx >= 64 || ty >= 96) continue;
    const o = (ty * 64 + tx) * 4;
    const l = (rb.d[so]! * 0.3 + rb.d[so + 1]! * 0.59 + rb.d[so + 2]! * 0.11) / 91;
    badan.d[o] = Math.min(255, 0x30 * l); badan.d[o + 1] = Math.min(255, 0x24 * l); badan.d[o + 2] = Math.min(255, 0x20 * l); badan.d[o + 3] = 255;
  }
  const s = layar(titik[0], titik[1]);
  return [{ kunci: kedalamanKarakter(titik[0], titik[1], duduk), input: badan.d, raw: { width: 64, height: 96, channels: 4 }, left: Math.round(s.x - 32), top: Math.round(s.y - 80) }];
}

async function main() {
  const lapis: Lapis[] = [...(await lapisRuang()), ...(await lapisPerabot())];
  const animDari = (d: Duduk2) => (d.pose === "kerja" ? "work" : d.pose === "duduk" ? "sit" : "idle") as "idle" | "sit" | "work";
  const contoh: Duduk2[] = [
    ...Object.values(STASIUN2).flat(), ...KURSI_RAPAT2, KURSI_NARA_RAPAT2, ...KURSI_TAMU_RAPAT2, MEJA_KOORDINATOR2.kursi, PAPAN_TUGAS2,
    ...Object.values(STASIUN_PENGHUNI2).flat(),
  ];
  let n = 0;
  for (const d of contoh) lapis.push(...(await karakter(d.titik, d, d.arah, animDari(d), (n++ % 20) + 1)));
  for (const k of KASUR2) lapis.push(...(await karakter(k.berdiri, null, "NW", "idle", 15)));
  for (const s of SLOT_AULA2.filter((_, i) => i % 5 === 0)) lapis.push(...(await karakter(s, null, "SE", "idle", (n++ % 20) + 1)));
  lapis.push(...(await karakter(TITIK_TENGAH2, null, "SW", "idle", 2)));
  lapis.sort((a, b) => a.kunci - b.kunci);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
  if (!TANPA_JALUR) {
    const jalur: [Titik, Titik, string][] = [
      [TITIK_TENGAH2, KURSI_RAPAT2[0]!.titik, "#ff3b30"],
      [TITIK_TENGAH2, KASUR2[1]!.berdiri, "#ff9500"],
      [MEJA_KOORDINATOR2.kursi.titik, PAPAN_TUGAS2.titik, "#af52de"],
      [PINTU_MASUK2, STASIUN_PENGHUNI2.rak[5]!.titik, "#007aff"],
      [PINTU_MASUK2, STASIUN_PENGHUNI2.kompres[1]!.titik, "#34c759"],
      [PINTU_MASUK2, STASIUN_PENGHUNI2.kotak_post[0]!.titik, "#ffcc00"],
    ];
    for (const [a, b, warna] of jalur) {
      const j = cariJalan(a, b);
      if (!j) continue;
      const pts = [a, ...j].map((p) => { const s = layar(p[0], p[1]); return `${s.x.toFixed(1)},${s.y.toFixed(1)}`; }).join(" ");
      svg += `<polyline points="${pts}" fill="none" stroke="${warna}" stroke-width="3" stroke-dasharray="8 5" opacity="0.9"/>`;
    }
  }
  for (const r of RUANG2) {
    const s = layar(r.x + r.w - 1.2, r.y + r.d - 0.4);
    svg += `<text x="${s.x}" y="${s.y}" font-family="monospace" font-size="15" font-weight="bold" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke" text-anchor="middle">${r.nama}</text>`;
  }
  svg += "</svg>";

  const dasar = sharp({ create: { width: W, height: H, channels: 4, background: { r: 30, g: 26, b: 38, alpha: 1 } } })
    .composite([...lapis.map(({ input, raw, left, top }) => ({ input, raw, left, top })), { input: Buffer.from(svg), left: 0, top: 0 }]);
  const buf = await dasar.png().toBuffer();
  await sharp(buf).resize(Math.round(W * SKALA), Math.round(H * SKALA), { kernel: "nearest" }).png().toFile(KELUAR);
  console.log(`pratinjau dunia ${W}x${H} → ${KELUAR}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

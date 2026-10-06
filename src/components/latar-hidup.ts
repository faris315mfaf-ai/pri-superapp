// ============================================================
// LATAR HIDUP (7 Okt 2026, desain baru — lihat lib/desain-apple
// desainBaru): harimau putih bergaya logo PRI di latar ilustrasi.
//   Pagi  — berlari di tepi danau mengejar kupu-kupu (di kejauhan).
//   Sore  — berbaring di pasir pantai, makan ikan bakar.
//   Malam — tidur di tebing, "Zzz", kelelawar & kunang-kunang.
// Menghasilkan SVG statis (string) per tema × versi (lanskap/potret)
// dengan viewBox + "slice" yang sama dengan adegan LatarApple, jadi
// harimau berpijak tepat di tanah/pasir/tebing. Gerak = CSS (globals.css
// .lh-*), berjalan hanya pada lapisan tema yang aktif.
// ============================================================

export type TemaHidup = "pagi" | "sore" | "malam";

const HITAM = "#0b0b10";
const garis = `stroke="${HITAM}" stroke-width="3.2" stroke-linejoin="round"`;

/* ---------- Bagian tubuh (koordinat lokal, alas di y=122) ---------- */
const lorengBaring = `
  <g fill="${HITAM}" stroke="none">
    <path d="M22,80 C34,84 40,92 42,102 C34,96 26,94 18,94 Z"/><path d="M12,100 C26,102 34,108 38,118 C28,112 20,111 10,112 Z"/>
    <path d="M44,64 C50,74 52,84 50,94 C46,86 42,78 38,72 Z"/>
    <path d="M98,64 C94,76 96,88 104,98 C102,86 102,76 106,64 Z"/><path d="M128,62 C124,76 126,90 134,100 C132,88 132,76 136,62 Z"/>
    <path d="M158,64 C154,76 156,88 164,98 C162,86 162,76 166,66 Z"/><path d="M186,72 C184,82 186,92 192,100 C190,90 190,82 194,74 Z"/>
    <path d="M200,113 C210,111 220,112 226,116 C218,117 210,117 200,119 Z"/><path d="M236,112 C244,110 252,111 258,115 C251,116 244,116 236,118 Z"/>
  </g>`;
const badanBaring = (g: string) => `
  <g class="lh-ekor-baring">
    <path d="M26,108 C-8,112 -6,132 30,128 C70,124 112,128 140,126" fill="none" stroke="${HITAM}" stroke-width="15" stroke-linecap="round"/>
    <path d="M26,108 C-8,112 -6,132 30,128 C70,124 112,128 140,126" fill="none" stroke="url(#${g})" stroke-width="9" stroke-linecap="round"/>
    <path d="M58,121 l2,9 M86,121 l1,9 M114,122 l1,8 M4,116 l8,4" stroke="${HITAM}" stroke-width="4.5" stroke-linecap="round"/>
  </g>
  <g class="lh-badan-baring" ${garis}>
    <path d="M8,122 C-2,90 22,60 62,58 C96,56 112,82 112,122 Z" fill="url(#${g})"/>
    <path d="M44,122 C42,84 74,62 126,62 C178,62 208,80 222,104 L226,122 Z" fill="url(#${g})"/>
    <path d="M60,122 C58,110 70,104 86,108 C94,110 96,118 96,122 Z" fill="url(#${g})"/>
    <path d="M176,122 L176,110 C204,106 262,106 284,110 C292,112 292,122 284,122 Z" fill="url(#${g})"/>
    <path d="M266,122 v-7 M276,122 v-7" stroke-width="2"/>
    ${lorengBaring}
  </g>`;

const badanLari = (g: string) => {
  const kaki = (kelas: string, x: number) => `<g class="lh-kaki lh-${kelas}"><path d="M${x - 8},84 L${x - 11},118 C${x - 11},126 ${x + 5},126 ${x + 5},118 L${x + 8},84 Z" fill="url(#${g})" ${garis}/><path d="M${x - 9},108 h12" stroke="${HITAM}" stroke-width="4" stroke-linecap="round"/></g>`;
  return `
    <g class="lh-ekor-lari"><path d="M42,62 C18,46 8,58 0,40" fill="none" stroke="${HITAM}" stroke-width="13" stroke-linecap="round"/>
      <path d="M42,62 C18,46 8,58 0,40" fill="none" stroke="url(#${g})" stroke-width="7.5" stroke-linecap="round"/>
      <path d="M22,50 l4,7 M10,48 l7,2" stroke="${HITAM}" stroke-width="4" stroke-linecap="round"/></g>
    ${kaki("kb-a", 66)}${kaki("kd-b", 196)}
    <path d="M36,66 C52,40 196,34 232,56 C248,66 246,90 228,96 C186,106 82,106 52,98 C34,92 28,80 36,66 Z" fill="url(#${g})" ${garis}/>
    <g fill="${HITAM}"><path d="M80,44 C76,58 78,72 86,82 C84,70 84,58 88,46 Z"/><path d="M110,40 C106,56 108,70 116,82 C114,68 114,56 118,40 Z"/>
      <path d="M140,40 C136,56 138,70 146,82 C144,68 144,56 148,40 Z"/><path d="M170,42 C166,56 168,70 176,80 C174,68 174,56 178,44 Z"/>
      <path d="M50,72 C60,72 66,78 70,86 C62,82 56,82 48,84 Z"/></g>
    ${kaki("kb-b", 86)}${kaki("kd-a", 214)}`;
};

/* ---------- Isi tiap adegan ---------- */
const zzz = `<g class="lh-zzz">${[0, 1, 2].map((i) => `<text class="lh-z" style="--i:${i}" x="0" y="0" font-size="${20 - i * 3}" font-weight="800" fill="#e8ecff">Z</text>`).join("")}</g>`;
const ikan = `
  <g class="lh-ikan">
    <g class="lh-uap">${[0, 1, 2].map((i) => `<path style="--i:${i}" d="M${262 + i * 14},96 c-5,-8 5,-12 0,-20 c-4,-6 4,-10 0,-16" fill="none" stroke="#fff6e0" stroke-width="2.4" stroke-linecap="round"/>`).join("")}</g>
    <ellipse cx="276" cy="113" rx="34" ry="10.5" fill="#E58A3A" stroke="${HITAM}" stroke-width="2.6"/>
    <path d="M308,113 L326,101 L324,125 Z" fill="#C9692A" stroke="${HITAM}" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M262,104 l-6,18 M276,103 l-6,20 M290,104 l-6,18" stroke="#7a3b12" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="250" cy="110" r="3" fill="#fff"/><circle cx="250" cy="110" r="1.4" fill="${HITAM}"/>
  </g>`;

function adegan(tema: TemaHidup, jenis: "lebar" | "potret"): string {
  const lebar = jenis === "lebar";
  const W = lebar ? 1440 : 390, H = lebar ? 900 : 844;
  const g = `bulu-${tema}-${jenis}`;
  const defs = `<defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.6" stop-color="#f1f3fb"/><stop offset="1" stop-color="${tema === "sore" ? "#f3d9c4" : "#c9d1f2"}"/></linearGradient>
    <radialGradient id="cahaya-${jenis}" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#f4edcb" stop-opacity="0.5"/><stop offset="1" stop-color="#f4edcb" stop-opacity="0"/></radialGradient></defs>`;
  let isi = "";

  if (tema === "malam") {
    const tebing = lebar
      ? "M-20,900 L-20,640 C80,604 200,612 280,630 C360,648 430,660 480,692 C530,724 566,790 600,900 Z"
      : "M-20,844 L-20,600 C40,574 112,580 172,598 C222,614 252,650 270,700 C284,740 292,792 300,844 Z";
    const bulan = lebar ? [1060, 230] : [290, 172];
    const t = lebar ? { x: 150, y: 548, s: 0.72 } : { x: 18, y: 528, s: 0.46 };
    const kl = lebar
      ? [[-60, 160, 1520, 90, 17, -2, 1], [1500, 300, -80, 210, 21, -9, -1], [-60, 380, 1520, 260, 25, -14, 1], [900, -40, 1300, 520, 19, -5, 1], [1500, 120, 600, -60, 23, -16, -1]]
      : [[-40, 120, 430, 70, 13, -2, 1], [430, 260, -40, 200, 16, -7, -1], [-40, 330, 430, 250, 19, -11, 1]];
    const kunang = Array.from({ length: lebar ? 10 : 6 }, (_, i) => [(lebar ? 120 : 20) + ((i * 97) % (lebar ? 420 : 200)), (lebar ? 560 : 520) + ((i * 53) % (lebar ? 90 : 70)), i]);
    isi = `
      <circle class="lh-denyut-bulan" cx="${bulan[0]}" cy="${bulan[1]}" r="${lebar ? 130 : 82}" fill="url(#cahaya-${jenis})"/>
      ${kl.map(([x0, y0, x1, y1, d, tt, arah], i) => `
        <g class="lh-kelelawar" style="--x0:${x0}px;--y0:${y0}px;--x1:${x1}px;--y1:${y1}px;--d:${d}s;--t:${tt}s">
          <g class="lh-ayun" style="--a:${(i % 3) * 0.4}s"><g transform="scale(${(lebar ? 1.15 : 0.85) * (0.75 + (i % 3) * 0.2)}) scale(${arah},1)" fill="#05060f">
            <g class="lh-sayap-kiri"><path d="M0,0 C-5,-7 -13,-9 -21,-5 C-17,-3 -16,1 -14,4 C-11,1 -8,1 -6,4 C-5,2 -2,1 0,2 Z"/></g>
            <g class="lh-sayap-kanan"><path d="M0,0 C5,-7 13,-9 21,-5 C17,-3 16,1 14,4 C11,1 8,1 6,4 C5,2 2,1 0,2 Z"/></g>
            <ellipse cx="0" cy="1" rx="2.6" ry="4.2"/></g></g>
        </g>`).join("")}
      <path d="${tebing}" fill="#070a1f"/><path d="${tebing}" fill="none" stroke="#3b4a8f" stroke-width="2" opacity="0.55"/>
      ${kunang.map(([x, y, i]) => `<circle class="lh-kunang" style="--i:${i}" cx="${x}" cy="${y}" r="${lebar ? 2.6 : 1.8}" fill="#fff6a8"/>`).join("")}
      <g transform="translate(${t.x} ${t.y}) scale(${t.s})">
        <g class="lh-napas-tidur">${badanBaring(g)}
          <g transform="rotate(-7 236 62)"><image href="/latar/harimau-tidur.webp" x="176" y="-14" width="118" height="128"/></g>
        </g>
        <g transform="translate(292 -6)">${zzz}</g>
      </g>`;
  }

  if (tema === "pagi") {
    const t = lebar ? { y: 560, s: 0.6, d: 17 } : { y: 547, s: 0.42, d: 12 };
    const burung = lebar ? [[200, 150, 0], [260, 175, 1], [900, 120, 2]] : [[60, 150, 0], [100, 170, 1]];
    isi = `
      ${burung.map(([x, y, i]) => `<g transform="translate(${x} ${y})"><g class="lh-burung" style="--i:${i}"><path d="M0,0 q7,-7 14,0 q7,-7 14,0" fill="none" stroke="#3f5f86" stroke-width="2.4" stroke-linecap="round"/></g></g>`).join("")}
      <g class="lh-pelari" style="--d:${t.d}s;--x0:${lebar ? -360 : -200}px;--x1:${lebar ? 1600 : 520}px;--y:${t.y}px">
        <g transform="scale(${t.s})">
          <g class="lh-lompat">
            ${badanLari(g)}
            <g class="lh-kepala-lari"><image href="/latar/harimau-kepala.webp" x="210" y="-40" width="112" height="122" transform="rotate(8 266 60)"/></g>
          </g>
          <g class="lh-kupu" transform="translate(420 -20)">
            <g class="lh-kupu-terbang">
              <g class="lh-sayap-kupu lh-kiri"><path d="M0,0 C-14,-22 -34,-16 -26,-2 C-34,8 -16,18 0,4 Z" fill="#FF9F0A" stroke="${HITAM}" stroke-width="2"/><circle cx="-16" cy="-8" r="3.5" fill="#fff"/></g>
              <g class="lh-sayap-kupu lh-kanan"><path d="M0,0 C14,-22 34,-16 26,-2 C34,8 16,18 0,4 Z" fill="#FF5E7E" stroke="${HITAM}" stroke-width="2"/><circle cx="16" cy="-8" r="3.5" fill="#fff"/></g>
              <ellipse cx="0" cy="2" rx="2.4" ry="9" fill="${HITAM}"/><path d="M0,-6 l-5,-9 M0,-6 l5,-9" stroke="${HITAM}" stroke-width="1.6" stroke-linecap="round"/>
            </g>
          </g>
        </g>
      </g>`;
  }

  if (tema === "sore") {
    const t = lebar ? { x: 1050, y: 766, s: 0.85 } : { x: 196, y: 738, s: 0.55 };
    const camar = lebar ? [[-80, 260, 0], [-160, 300, 1], [-120, 220, 2]] : [[-40, 230, 0], [-90, 260, 1]];
    isi = `
      ${camar.map(([x, y, i]) => `<g class="lh-camar" style="--i:${i};--y:${y}px;--x0:${x}px;--x1:${lebar ? 1560 : 430}px"><path d="M0,0 q8,-8 16,0 q8,-8 16,0" fill="none" stroke="#4E3A63" stroke-width="2.6" stroke-linecap="round"/></g>`).join("")}
      <ellipse cx="${t.x + 150 * t.s}" cy="${t.y + 124 * t.s}" rx="${170 * t.s}" ry="${10 * t.s}" fill="#5a3b2a" opacity="0.25"/>
      <g transform="translate(${t.x} ${t.y}) scale(${t.s})">
        ${badanBaring(g)}
        ${ikan}
        <g class="lh-kepala-makan"><image href="/latar/harimau-kepala.webp" x="182" y="-8" width="118" height="128"/></g>
        <path class="lh-remah" d="M262,124 l2,0 M280,126 l2,0 M296,124 l2,0" stroke="#7a3b12" stroke-width="3" stroke-linecap="round"/>
      </g>`;
  }

  return `<svg class="${jenis === "lebar" ? "latar-lanskap" : "latar-potret"} lh-hidup" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${defs}${isi}</svg>`;
}


const cache = new Map<string, string>();

/** SVG adegan hidup (lanskap + potret) untuk satu tema; di-cache. */
export function svgLatarHidup(tema: TemaHidup): string {
  let s = cache.get(tema);
  if (!s) {
    s = adegan(tema, "lebar") + adegan(tema, "potret");
    cache.set(tema, s);
  }
  return s;
}

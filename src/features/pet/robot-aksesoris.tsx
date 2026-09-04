"use client";

// ============================================================
// robot-aksesoris.tsx — AKSESORIS GENERASI 2 (4 Sep 2026): 40 item baru yang
// digambar dari KELUARGA BENTUK (`gambar`) + WARNA (`warna`) di lib/pet
// KATALOG_AKSESORIS, supaya satu gambar melayani banyak varian warna.
// Koordinat mengikuti RobotSvg (viewBox -10 -30 220 300): kepala x40–160 /
// y18–108, leher y104–120, badan x58–142 / y118–210, tangan kanan (156,190).
// ============================================================

import type { ReactNode } from "react";
import { aksesorisDariKode, gelapkan, terangkan } from "@/lib/pet";

type Ctx = { kelas: (k: string) => string | undefined };

function BintangKecil({
  cx,
  cy,
  r,
  fill,
}: {
  cx: number;
  cy: number;
  r: number;
  fill: string;
}) {
  const titik: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    titik.push(
      `${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`,
    );
  }
  return <polygon points={titik.join(" ")} fill={fill} />;
}

/** Titik-titik sepanjang kurva kuadratik (untuk kalung mutiara). */
function titikKurva(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  n: number,
): [number, number][] {
  const hasil: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1;
    const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
    hasil.push([x, y]);
  }
  return hasil;
}

/**
 * Gambar aksesoris generasi 2 untuk kode yang terpasang; null bila kode itu
 * aksesoris lama (digambar RobotSvg sendiri) atau tidak dikenal.
 */
export function gambarAksesorisBaru(
  kode: string | undefined,
  { kelas }: Ctx,
): ReactNode | null {
  if (!kode) return null;
  const item = aksesorisDariKode(kode);
  if (!item?.gambar) return null;
  const w = item.warna ?? "#DC2626";
  const gelap = gelapkan(w, 0.35);
  const terang = terangkan(w, 0.35);

  switch (item.gambar) {
    // ---------------- KEPALA ----------------
    case "beanie":
      return (
        <g>
          <path
            d="M42 42 Q100 -22 158 42 L158 48 Q100 28 42 48 Z"
            fill={w}
            stroke={gelap}
            strokeWidth="1.5"
          />
          <rect x="38" y="32" width="124" height="16" rx="7" fill={gelap} />
          <path
            d="M60 36 h80 M60 42 h80"
            stroke={terang}
            strokeWidth="1.5"
            opacity="0.5"
          />
          <circle
            cx="100"
            cy="-12"
            r="9"
            fill={terang}
            stroke={gelap}
            strokeWidth="1.5"
          />
        </g>
      );
    case "jerami":
      return (
        <g>
          <ellipse
            cx="100"
            cy="32"
            rx="76"
            ry="13"
            fill={w}
            stroke={gelap}
            strokeWidth="1.5"
          />
          <path
            d="M62 32 Q68 -12 100 -14 Q132 -12 138 32 Z"
            fill={terang}
            stroke={gelap}
            strokeWidth="1.5"
          />
          <rect x="62" y="20" width="76" height="10" rx="4" fill="#7F1D1D" />
          <path
            d="M40 30 Q100 22 160 30"
            fill="none"
            stroke={gelap}
            strokeWidth="1"
            opacity="0.6"
          />
        </g>
      );
    case "koboi":
      return (
        <g>
          <path
            d="M22 36 Q30 18 44 30 Q100 22 156 30 Q170 18 178 36 Q140 48 100 44 Q60 48 22 36 Z"
            fill={w}
            stroke={gelap}
            strokeWidth="1.5"
          />
          <path
            d="M60 34 Q64 -6 84 -12 Q100 -4 116 -12 Q136 -6 140 34 Z"
            fill={w}
            stroke={gelap}
            strokeWidth="1.5"
          />
          <rect x="60" y="24" width="80" height="9" rx="3" fill={gelap} />
          <circle cx="100" cy="28" r="3" fill="#F59E0B" />
        </g>
      );
    case "mahkota2":
      return (
        <g>
          <polygon
            points="60,20 60,-12 76,4 100,-24 124,4 140,-12 140,20"
            fill={w}
            stroke={gelap}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <rect
            x="60"
            y="12"
            width="80"
            height="8"
            rx="3"
            fill={gelap}
            opacity="0.5"
          />
          <circle cx="76" cy="6" r="3.5" fill="#60A5FA" />
          <circle cx="100" cy="-8" r="4.5" fill="#3B82F6" />
          <circle cx="124" cy="6" r="3.5" fill="#60A5FA" />
        </g>
      );
    case "tanduk":
      return (
        <g>
          <path
            d="M62 24 Q38 -2 54 -26 Q62 -2 78 12 Z"
            fill={w}
            stroke={gelap}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M138 24 Q162 -2 146 -26 Q138 -2 122 12 Z"
            fill={w}
            stroke={gelap}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </g>
      );
    case "headphone":
      return (
        <g>
          <path
            d="M44 62 Q100 -20 156 62"
            fill="none"
            stroke={w}
            strokeWidth="9"
            strokeLinecap="round"
          />
          <path
            d="M44 62 Q100 -14 156 62"
            fill="none"
            stroke={terang}
            strokeWidth="2"
            opacity="0.4"
          />
          <rect
            x="30"
            y="46"
            width="22"
            height="34"
            rx="9"
            fill={w}
            stroke={gelap}
            strokeWidth="1.5"
          />
          <rect
            x="148"
            y="46"
            width="22"
            height="34"
            rx="9"
            fill={w}
            stroke={gelap}
            strokeWidth="1.5"
          />
          <circle
            cx="41"
            cy="63"
            r="6"
            fill="#22D3EE"
            className={kelas("pet-denyut")}
          />
          <circle
            cx="159"
            cy="63"
            r="6"
            fill="#22D3EE"
            className={kelas("pet-denyut")}
          />
        </g>
      );
    case "bando":
      return (
        <g>
          <path
            d="M42 34 Q100 4 158 34"
            fill="none"
            stroke={gelap}
            strokeWidth="4"
          />
          <polygon
            points="52,32 58,-6 84,20"
            fill={w}
            stroke={gelap}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <polygon
            points="148,32 142,-6 116,20"
            fill={w}
            stroke={gelap}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <polygon points="60,26 63,6 76,20" fill={terang} />
          <polygon points="140,26 137,6 124,20" fill={terang} />
        </g>
      );
    case "ikat":
      return (
        <g>
          <rect x="36" y="24" width="128" height="14" rx="7" fill={w} />
          <rect x="36" y="31" width="128" height="7" rx="3.5" fill="#F9FAFB" />
          <path d="M162 28 l20 -10 l-2 14 z" fill={w} />
          <path
            d="M162 34 l18 8 l-6 -14 z"
            fill="#F9FAFB"
            stroke={w}
            strokeWidth="1"
          />
        </g>
      );

    // ---------------- MATA ----------------
    case "neon":
      return (
        <g style={{ filter: `drop-shadow(0 0 5px ${w})` }}>
          <rect
            x="58"
            y="50"
            width="34"
            height="20"
            rx="7"
            fill={w}
            opacity="0.35"
            stroke={w}
            strokeWidth="3"
          />
          <rect
            x="108"
            y="50"
            width="34"
            height="20"
            rx="7"
            fill={w}
            opacity="0.35"
            stroke={w}
            strokeWidth="3"
          />
          <path d="M92 60 H108" stroke={w} strokeWidth="3" />
          <path d="M52 60 H58 M142 60 H148" stroke={w} strokeWidth="3" />
        </g>
      );
    case "monokel2":
      return (
        <g fill="none" stroke={w} strokeWidth="3.5">
          <circle cx="125" cy="60" r="15" />
          <circle
            cx="125"
            cy="60"
            r="11"
            stroke={terang}
            strokeWidth="1.5"
            opacity="0.6"
          />
          <path d="M138 70 q10 14 -2 28" strokeWidth="2" />
        </g>
      );
    case "tigad":
      return (
        <g>
          <rect
            x="56"
            y="49"
            width="88"
            height="22"
            rx="5"
            fill="#F8FAFC"
            stroke="#CBD5E1"
            strokeWidth="1.5"
          />
          <rect
            x="60"
            y="53"
            width="36"
            height="14"
            rx="3"
            fill="#EF4444"
            opacity="0.85"
          />
          <rect
            x="104"
            y="53"
            width="36"
            height="14"
            rx="3"
            fill="#22D3EE"
            opacity="0.85"
          />
        </g>
      );
    case "pilot":
      return (
        <g>
          <path
            d="M40 50 Q100 44 160 50"
            fill="none"
            stroke={w}
            strokeWidth="3"
          />
          <path
            d="M58 50 Q56 76 76 76 Q94 76 94 54 Z"
            fill="#3F3F46"
            stroke={w}
            strokeWidth="2.5"
          />
          <path
            d="M142 50 Q144 76 124 76 Q106 76 106 54 Z"
            fill="#3F3F46"
            stroke={w}
            strokeWidth="2.5"
          />
          <path
            d="M64 56 l8 4"
            stroke="#FFFFFF"
            strokeWidth="2"
            opacity="0.5"
            strokeLinecap="round"
          />
          <path
            d="M112 56 l8 4"
            stroke="#FFFFFF"
            strokeWidth="2"
            opacity="0.5"
            strokeLinecap="round"
          />
        </g>
      );

    // ---------------- LEHER ----------------
    case "kalung":
      return (
        <g>
          <path
            d="M78 108 Q100 138 122 108"
            fill="none"
            stroke={w}
            strokeWidth="4"
          />
          <path
            d="M78 108 Q100 138 122 108"
            fill="none"
            stroke={terang}
            strokeWidth="1.5"
            opacity="0.6"
            strokeDasharray="3 4"
          />
          <circle
            cx="100"
            cy="132"
            r="8"
            fill={w}
            stroke={gelap}
            strokeWidth="1.5"
          />
          <circle cx="97" cy="129" r="2.5" fill="#FFFFFF" opacity="0.8" />
        </g>
      );
    case "dasi2":
      return (
        <g>
          <rect x="94" y="108" width="12" height="8" rx="2" fill={gelap} />
          <polygon points="100,114 91,126 96,140 104,140 109,126" fill={w} />
          <polygon
            points="96,140 100,164 104,140"
            fill="#F9FAFB"
            stroke="#D1D5DB"
            strokeWidth="1"
          />
        </g>
      );
    case "syal":
      return (
        <g>
          <rect x="78" y="104" width="44" height="20" rx="10" fill={w} />
          <path d="M108 122 l12 30 l-16 -6 z" fill={gelap} />
          <path
            d="M84 110 h32"
            stroke={terang}
            strokeWidth="2"
            opacity="0.5"
            strokeLinecap="round"
          />
        </g>
      );
    case "mutiara":
      return (
        <g>
          {titikKurva(76, 108, 100, 146, 124, 108, 10).map(([x, y], i) => (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="4.2"
              fill={w}
              stroke="#CBD5E1"
              strokeWidth="1"
            />
          ))}
        </g>
      );

    // ---------------- BADAN ----------------
    case "kaos":
      return (
        <g>
          <rect x="60" y="122" width="80" height="62" rx="16" fill={w} />
          <rect x="50" y="124" width="14" height="22" rx="6" fill={gelap} />
          <rect x="136" y="124" width="14" height="22" rx="6" fill={gelap} />
          <path
            d="M84 122 Q100 134 116 122"
            fill="none"
            stroke={gelap}
            strokeWidth="3"
          />
          <rect
            x="112"
            y="140"
            width="16"
            height="14"
            rx="3"
            fill={terang}
            opacity="0.5"
          />
        </g>
      );
    case "jas":
      return (
        <g>
          <rect
            x="60"
            y="122"
            width="80"
            height="70"
            rx="14"
            fill={w}
            stroke={gelap}
            strokeWidth="1.5"
          />
          <polygon points="100,124 84,124 92,158" fill="#E5E7EB" />
          <polygon points="100,124 116,124 108,158" fill="#E5E7EB" />
          <polygon
            points="84,124 100,124 92,150 76,142"
            fill={gelap}
            opacity="0.35"
          />
          <polygon
            points="116,124 100,124 108,150 124,142"
            fill={gelap}
            opacity="0.35"
          />
          <rect x="118" y="146" width="12" height="4" rx="1" fill="#DC2626" />
          <circle cx="100" cy="176" r="2.5" fill={gelap} />
        </g>
      );
    case "rompi2":
      return (
        <g>
          <rect
            x="60"
            y="124"
            width="32"
            height="60"
            rx="8"
            fill={w}
            stroke={gelap}
            strokeWidth="1.5"
          />
          <rect
            x="108"
            y="124"
            width="32"
            height="60"
            rx="8"
            fill={w}
            stroke={gelap}
            strokeWidth="1.5"
          />
          <rect
            x="60"
            y="150"
            width="32"
            height="6"
            fill="#F8FAFC"
            opacity="0.9"
          />
          <rect
            x="108"
            y="150"
            width="32"
            height="6"
            fill="#F8FAFC"
            opacity="0.9"
          />
          <rect
            x="60"
            y="166"
            width="32"
            height="6"
            fill="#F8FAFC"
            opacity="0.9"
          />
          <rect
            x="108"
            y="166"
            width="32"
            height="6"
            fill="#F8FAFC"
            opacity="0.9"
          />
        </g>
      );
    case "kaospri":
      return (
        <g>
          <rect x="60" y="122" width="80" height="62" rx="16" fill={w} />
          <rect x="52" y="124" width="12" height="22" rx="5" fill={gelap} />
          <rect x="136" y="124" width="12" height="22" rx="5" fill={gelap} />
          <text
            x="100"
            y="160"
            textAnchor="middle"
            fontSize="20"
            fontWeight="800"
            fill="#F59E0B"
            fontFamily="inherit"
          >
            PRI
          </text>
        </g>
      );
    case "jaket":
      return (
        <g>
          <rect
            x="58"
            y="120"
            width="84"
            height="72"
            rx="14"
            fill={w}
            stroke="#000000"
            strokeWidth="1"
            opacity="0.98"
          />
          <path
            d="M100 122 V190"
            stroke="#9CA3AF"
            strokeWidth="2"
            strokeDasharray="3 2"
          />
          <polygon
            points="84,120 100,134 116,120"
            fill={terang}
            opacity="0.7"
          />
          <rect
            x="66"
            y="160"
            width="14"
            height="10"
            rx="2"
            fill="none"
            stroke="#9CA3AF"
            strokeWidth="1.5"
          />
          <rect
            x="120"
            y="160"
            width="14"
            height="10"
            rx="2"
            fill="none"
            stroke="#9CA3AF"
            strokeWidth="1.5"
          />
        </g>
      );

    // ---------------- PUNGGUNG ----------------
    case "sayap2":
      return (
        <g>
          <g className={kelas("pet-kepak")}>
            <path
              d="M58 134 Q6 100 2 166 Q28 150 34 182 Q48 172 60 194 Z"
              fill={w}
              stroke={gelap}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path
              d="M52 146 Q26 130 16 160 Q34 150 40 176"
              fill="none"
              stroke={terang}
              strokeWidth="2"
              opacity="0.7"
            />
          </g>
          <g className={kelas("pet-kepak-kanan")}>
            <path
              d="M142 134 Q194 100 198 166 Q172 150 166 182 Q152 172 140 194 Z"
              fill={w}
              stroke={gelap}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path
              d="M148 146 Q174 130 184 160 Q166 150 160 176"
              fill="none"
              stroke={terang}
              strokeWidth="2"
              opacity="0.7"
            />
          </g>
        </g>
      );
    case "ransel":
      return (
        <g>
          <rect
            x="62"
            y="118"
            width="76"
            height="82"
            rx="14"
            fill={w}
            stroke={gelap}
            strokeWidth="2"
          />
          <rect
            x="72"
            y="150"
            width="56"
            height="34"
            rx="8"
            fill={gelap}
            opacity="0.5"
          />
          <rect x="66" y="118" width="10" height="70" rx="5" fill={gelap} />
          <rect x="124" y="118" width="10" height="70" rx="5" fill={gelap} />
        </g>
      );
    case "tabung":
      return (
        <g>
          <rect
            x="72"
            y="112"
            width="56"
            height="90"
            rx="20"
            fill={w}
            stroke={gelapkan(w, 0.4)}
            strokeWidth="2"
          />
          <rect x="94" y="102" width="12" height="14" rx="3" fill="#6B7280" />
          <rect x="80" y="130" width="40" height="8" rx="4" fill="#1F2937" />
          <rect x="80" y="150" width="40" height="8" rx="4" fill="#1F2937" />
        </g>
      );

    // ---------------- TANGAN (kanan) ----------------
    case "bunga":
      return (
        <g>
          <line
            x1="156"
            y1="190"
            x2="176"
            y2="140"
            stroke="#16A34A"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path d="M166 162 q-12 2 -12 -8 q10 -2 12 8 z" fill="#22C55E" />
          {[0, 72, 144, 216, 288].map((a) => (
            <circle
              key={a}
              cx={176 + 9 * Math.cos((a * Math.PI) / 180)}
              cy={132 + 9 * Math.sin((a * Math.PI) / 180)}
              r="6.5"
              fill={w}
            />
          ))}
          <circle cx="176" cy="132" r="5" fill="#FDE047" />
        </g>
      );
    case "obor":
      return (
        <g>
          <rect
            x="151"
            y="140"
            width="10"
            height="52"
            rx="4"
            fill="#78350F"
            stroke="#451A03"
            strokeWidth="1.5"
          />
          <rect x="148" y="132" width="16" height="12" rx="3" fill="#9CA3AF" />
          <g className={kelas("pet-api-atas")}>
            <polygon
              points="146,134 166,134 158,96 156,88 154,96"
              fill={w}
              opacity="0.9"
            />
            <polygon
              points="151,130 161,130 157,104 156,98 155,104"
              fill="#FDE047"
              opacity="0.9"
            />
          </g>
        </g>
      );
    case "piala":
      return (
        <g>
          <path
            d="M160 112 H192 L188 140 Q176 156 164 140 Z"
            fill={w}
            stroke={gelap}
            strokeWidth="1.5"
          />
          <path
            d="M160 116 q-14 4 -8 18 q6 6 12 2"
            fill="none"
            stroke={w}
            strokeWidth="4"
          />
          <path
            d="M192 116 q14 4 8 18 q-6 6 -12 2"
            fill="none"
            stroke={w}
            strokeWidth="4"
          />
          <rect x="170" y="154" width="12" height="12" fill={gelap} />
          <rect x="162" y="164" width="28" height="8" rx="2" fill={gelap} />
          <BintangKecil cx={176} cy={128} r={6} fill="#FFFFFF" />
          <line
            x1="156"
            y1="190"
            x2="172"
            y2="168"
            stroke="#374151"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      );
    case "gitar":
      return (
        <g>
          <ellipse
            cx="170"
            cy="164"
            rx="15"
            ry="19"
            fill={w}
            stroke={gelap}
            strokeWidth="1.5"
          />
          <ellipse
            cx="172"
            cy="140"
            rx="11"
            ry="13"
            fill={w}
            stroke={gelap}
            strokeWidth="1.5"
          />
          <circle cx="170" cy="160" r="5" fill={gelap} />
          <rect
            x="174"
            y="74"
            width="7"
            height="72"
            rx="2"
            fill="#57534E"
            stroke="#292524"
            strokeWidth="1"
            transform="rotate(8 178 110)"
          />
          <path
            d="M166 150 L184 84 M170 152 L188 86"
            stroke="#E5E7EB"
            strokeWidth="0.8"
            opacity="0.8"
          />
          <rect x="172" y="66" width="12" height="12" rx="3" fill="#292524" />
        </g>
      );

    // ---------------- AURA ----------------
    case "aura2":
      return (
        <g>
          <circle cx="100" cy="130" r="120" fill={w} opacity="0.09" />
          <circle
            cx="100"
            cy="130"
            r="110"
            fill="none"
            stroke={w}
            strokeWidth="5"
            strokeDasharray="18 14"
            opacity="0.8"
            className={kelas("pet-putar")}
          />
          <circle
            cx="100"
            cy="130"
            r="100"
            fill="none"
            stroke={terang}
            strokeWidth="1.5"
            strokeDasharray="4 12"
            opacity="0.7"
            className={kelas("pet-putar")}
          />
        </g>
      );
    default:
      return null;
  }
}

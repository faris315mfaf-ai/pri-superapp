"use client";

// ============================================================
// robot-skin.tsx — lapisan gambar SKIN EKSKLUSIF SEASONAL untuk RobotSvg (3 Sep 2026).
// Tiap skin mengembalikan potongan SVG per lapisan supaya urutan gambar di RobotSvg
// tetap benar: aura (statis, paling belakang) → belakang badan (sayap/jubah) →
// zirah depan (tidak menutup inti dada) → tangan → bahu → kepala (paling atas).
// Koordinat mengikuti viewBox RobotSvg (-10 -30 220 300): kepala x40–160/y18–108,
// badan x58–142/y118–210, tangan kanan di (156,190), tangan kiri di (44,190).
// Kode skin harus sama dengan KATALOG_SKIN di lib/pet.ts.
// ============================================================

import type { ReactNode } from "react";

export type LapisanSkin = {
  aura?: ReactNode;
  belakang?: ReactNode;
  badan?: ReactNode;
  bahu?: ReactNode;
  tanganKiri?: ReactNode;
  tanganKanan?: ReactNode;
  kepala?: ReactNode;
};

type Ctx = {
  /** url(#id-nama) gradien milik RobotSvg. */
  g: (nama: string) => string;
  /** Nama kelas animasi, atau undefined bila animasi dimatikan. */
  kelas: (k: string) => string | undefined;
};

function Bintang({
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

/** Jubah di belakang badan (bentuk sama, warna beda tiap skin). */
function Jubah({
  fill,
  stroke,
  garis,
}: {
  fill: string;
  stroke?: string;
  garis?: ReactNode;
}) {
  return (
    <g>
      <path
        d="M62 120 Q36 198 50 238 L100 222 L150 238 Q164 198 138 120 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={stroke ? 2 : 0}
      />
      {garis}
    </g>
  );
}

/** Dua pelat zirah samping + sabuk + kerah — inti dada di tengah tetap terlihat. */
function Zirah({
  fill,
  stroke,
  hias,
  sabuk,
  kerah,
}: {
  fill: string;
  stroke: string;
  hias?: ReactNode;
  sabuk: ReactNode;
  kerah: string;
}) {
  return (
    <g>
      <rect
        x="58"
        y="124"
        width="32"
        height="60"
        rx="9"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.5"
      />
      <rect
        x="110"
        y="124"
        width="32"
        height="60"
        rx="9"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.5"
      />
      {hias}
      {sabuk}
      <rect
        x="70"
        y="112"
        width="60"
        height="10"
        rx="5"
        fill={kerah}
        stroke={stroke}
        strokeWidth="1.5"
      />
    </g>
  );
}

export function lapisanSkin(
  kode: string,
  { g, kelas }: Ctx,
): LapisanSkin | null {
  switch (kode) {
    // ---------------- GARUDA EMAS ----------------
    case "skin_garuda_emas":
      return {
        aura: (
          <g>
            <circle cx="100" cy="130" r="122" fill={g("aura")} />
            <circle
              cx="100"
              cy="130"
              r="110"
              fill="none"
              stroke="#FCD34D"
              strokeWidth="3"
              strokeDasharray="14 18"
              opacity="0.85"
              className={kelas("pet-putar")}
            />
          </g>
        ),
        belakang: (
          <g>
            {/* sayap emas raksasa — mengepak dari pangkalnya */}
            <g className={kelas("pet-kepak")}>
              <path
                d="M60 136 Q-2 84 -6 176 Q16 152 26 198 Q40 176 62 204 Z"
                fill={g("emas")}
                stroke="#B45309"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path
                d="M52 150 Q22 130 8 170 M50 168 Q30 160 22 194"
                fill="none"
                stroke="#B45309"
                strokeWidth="1.5"
                opacity="0.6"
              />
            </g>
            <g className={kelas("pet-kepak-kanan")}>
              <path
                d="M140 136 Q202 84 206 176 Q184 152 174 198 Q160 176 138 204 Z"
                fill={g("emas")}
                stroke="#B45309"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path
                d="M148 150 Q178 130 192 170 M150 168 Q170 160 178 194"
                fill="none"
                stroke="#B45309"
                strokeWidth="1.5"
                opacity="0.6"
              />
            </g>
            <Jubah
              fill="#DC2626"
              garis={
                <path
                  d="M52 214 L100 204 L148 214 L150 238 L100 222 L50 238 Z"
                  fill="#F9FAFB"
                  opacity="0.95"
                />
              }
            />
          </g>
        ),
        badan: (
          <Zirah
            fill={g("emas")}
            stroke="#B45309"
            kerah={g("emas")}
            hias={
              <path
                d="M62 136 h18 M62 148 h18 M120 136 h18 M120 148 h18"
                stroke="#B45309"
                strokeWidth="1.5"
                opacity="0.6"
              />
            }
            sabuk={
              <g>
                <rect
                  x="58"
                  y="184"
                  width="84"
                  height="12"
                  rx="6"
                  fill={g("emas")}
                  stroke="#B45309"
                  strokeWidth="1.5"
                />
                <Bintang cx={100} cy={190} r={7} fill="#DC2626" />
              </g>
            }
          />
        ),
        bahu: (
          <g>
            <ellipse
              cx="54"
              cy="124"
              rx="18"
              ry="11"
              fill={g("emas")}
              stroke="#B45309"
              strokeWidth="1.5"
            />
            <ellipse
              cx="146"
              cy="124"
              rx="18"
              ry="11"
              fill={g("emas")}
              stroke="#B45309"
              strokeWidth="1.5"
            />
            <circle cx="54" cy="124" r="3.5" fill="#DC2626" />
            <circle cx="146" cy="124" r="3.5" fill="#DC2626" />
          </g>
        ),
        kepala: (
          <g>
            <polygon
              points="58,20 58,-14 74,2 88,-18 100,-30 112,-18 126,2 142,-14 142,20"
              fill={g("emas")}
              stroke="#B45309"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <rect
              x="58"
              y="14"
              width="84"
              height="8"
              rx="3"
              fill="#B45309"
              opacity="0.55"
            />
            <circle
              cx="100"
              cy="-6"
              r="7"
              fill="#DC2626"
              stroke="#7F1D1D"
              strokeWidth="1.5"
              className={kelas("pet-kilau")}
            />
            <circle cx="74" cy="6" r="3.5" fill="#F9FAFB" />
            <circle cx="126" cy="6" r="3.5" fill="#F9FAFB" />
          </g>
        ),
      };

    // ---------------- KOMANDAN RAKYAT ----------------
    case "skin_komandan_rakyat":
      return {
        belakang: (
          <g>
            <rect
              x="66"
              y="122"
              width="68"
              height="70"
              rx="10"
              fill="#1F2937"
            />
            <line
              x1="132"
              y1="122"
              x2="140"
              y2="86"
              stroke="#374151"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle
              cx="141"
              cy="83"
              r="4"
              fill="#F87171"
              className={kelas("pet-denyut")}
            />
          </g>
        ),
        badan: (
          <Zirah
            fill="#3F6212"
            stroke="#1A2E05"
            kerah="#1F2937"
            hias={
              <g>
                <rect
                  x="62"
                  y="160"
                  width="24"
                  height="18"
                  rx="3"
                  fill="#4D7C0F"
                  stroke="#1A2E05"
                  strokeWidth="1"
                />
                <rect
                  x="114"
                  y="160"
                  width="24"
                  height="18"
                  rx="3"
                  fill="#4D7C0F"
                  stroke="#1A2E05"
                  strokeWidth="1"
                />
                {/* bandolier menyilang di pelat kiri */}
                <line
                  x1="66"
                  y1="126"
                  x2="90"
                  y2="188"
                  stroke="#78350F"
                  strokeWidth="7"
                  strokeLinecap="round"
                />
                {[
                  [71, 139],
                  [77, 154],
                  [83, 169],
                ].map(([x, y]) => (
                  <rect
                    key={x}
                    x={x - 2}
                    y={y - 5}
                    width="4"
                    height="10"
                    rx="1.5"
                    fill="#FCD34D"
                    transform={`rotate(-22 ${x} ${y})`}
                  />
                ))}
              </g>
            }
            sabuk={
              <g>
                <rect
                  x="58"
                  y="186"
                  width="84"
                  height="12"
                  rx="4"
                  fill="#1F2937"
                />
                <rect
                  x="94"
                  y="185"
                  width="12"
                  height="14"
                  rx="2"
                  fill="#FCD34D"
                />
              </g>
            }
          />
        ),
        bahu: (
          <g>
            <rect
              x="42"
              y="116"
              width="28"
              height="16"
              rx="5"
              fill="#1F2937"
              stroke="#0F172A"
              strokeWidth="1.5"
            />
            <rect
              x="130"
              y="116"
              width="28"
              height="16"
              rx="5"
              fill="#1F2937"
              stroke="#0F172A"
              strokeWidth="1.5"
            />
            <rect
              x="46"
              y="120"
              width="20"
              height="3"
              rx="1.5"
              fill="#EF4444"
            />
            <rect
              x="134"
              y="120"
              width="20"
              height="3"
              rx="1.5"
              fill="#EF4444"
            />
          </g>
        ),
        tanganKanan: (
          <g>
            {/* pistol blaster: laras, moncong, gagang, bidik, sel energi */}
            <rect
              x="150"
              y="181"
              width="46"
              height="12"
              rx="4"
              fill="#374151"
              stroke="#111827"
              strokeWidth="1.5"
            />
            <rect
              x="192"
              y="183"
              width="10"
              height="8"
              rx="2"
              fill="#9CA3AF"
              stroke="#111827"
              strokeWidth="1"
            />
            <rect
              x="156"
              y="192"
              width="11"
              height="18"
              rx="3"
              fill="#1F2937"
              stroke="#111827"
              strokeWidth="1.5"
              transform="rotate(-8 156 192)"
            />
            <rect x="164" y="176" width="16" height="6" rx="2" fill="#4B5563" />
            <circle
              cx="176"
              cy="187"
              r="4"
              fill="#22D3EE"
              className={kelas("pet-denyut")}
            />
            <circle
              cx="204"
              cy="187"
              r="4"
              fill="#67E8F9"
              opacity="0.85"
              className={kelas("pet-kilau")}
            />
          </g>
        ),
        kepala: (
          <g>
            <rect
              x="54"
              y="46"
              width="92"
              height="22"
              rx="7"
              fill="#0F172A"
              opacity="0.88"
            />
            <rect
              x="60"
              y="55"
              width="80"
              height="3"
              rx="1.5"
              fill="#22D3EE"
              className={kelas("pet-denyut")}
            />
            <path
              d="M42 28 Q52 -14 126 -6 Q168 0 158 30 Q126 16 90 22 Q60 26 42 28 Z"
              fill="#B91C1C"
              stroke="#7F1D1D"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <rect x="40" y="24" width="120" height="8" rx="4" fill="#7F1D1D" />
            <Bintang cx={74} cy={8} r={7} fill="#FCD34D" />
          </g>
        ),
      };

    // ---------------- PENJAGA SALJU ----------------
    case "skin_penjaga_salju":
      return {
        aura: (
          <g>
            <circle cx="100" cy="130" r="120" fill={g("es")} />
            {[
              [10, 20],
              [186, 40],
              [-2, 150],
              [196, 170],
              [30, 240],
              [176, 236],
              [60, -10],
              [150, -16],
            ].map(([x, y], i) => (
              <g
                key={i}
                transform={`translate(${x} ${y})`}
                className={kelas("pet-kilau")}
                style={{ animationDelay: `${(i % 4) * 0.35}s` }}
                stroke="#BAE6FD"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="-6" y1="0" x2="6" y2="0" />
                <line x1="0" y1="-6" x2="0" y2="6" />
                <line x1="-4.2" y1="-4.2" x2="4.2" y2="4.2" />
                <line x1="-4.2" y1="4.2" x2="4.2" y2="-4.2" />
              </g>
            ))}
          </g>
        ),
        belakang: <Jubah fill="#BAE6FD" stroke="#7DD3FC" />,
        badan: (
          <Zirah
            fill="#F0F9FF"
            stroke="#7DD3FC"
            kerah="#E0F2FE"
            hias={
              <g fill="#7DD3FC" opacity="0.8">
                <polygon points="74,134 80,146 74,158 68,146" />
                <polygon points="126,134 132,146 126,158 120,146" />
              </g>
            }
            sabuk={
              <g>
                <rect
                  x="58"
                  y="184"
                  width="84"
                  height="12"
                  rx="6"
                  fill="#E0F2FE"
                  stroke="#7DD3FC"
                  strokeWidth="1.5"
                />
                <polygon
                  points="100,182 106,190 100,198 94,190"
                  fill="#38BDF8"
                />
              </g>
            }
          />
        ),
        bahu: (
          <g
            fill="#E0F2FE"
            stroke="#38BDF8"
            strokeWidth="1.5"
            strokeLinejoin="round"
          >
            <polygon points="40,128 46,96 60,120" />
            <polygon points="52,126 62,104 70,120" />
            <polygon points="160,128 154,96 140,120" />
            <polygon points="148,126 138,104 130,120" />
          </g>
        ),
        tanganKanan: (
          <g>
            <line
              x1="156"
              y1="196"
              x2="176"
              y2="98"
              stroke="#7DD3FC"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <line
              x1="156"
              y1="196"
              x2="176"
              y2="98"
              stroke="#FFFFFF"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.6"
            />
            <circle
              cx="178"
              cy="86"
              r="16"
              fill="#7DD3FC"
              opacity="0.35"
              className={kelas("pet-denyut")}
            />
            <polygon
              points="178,64 192,86 178,108 164,86"
              fill="#BAE6FD"
              stroke="#0EA5E9"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <polygon
              points="178,72 186,86 178,100 170,86"
              fill="#FFFFFF"
              opacity="0.7"
            />
          </g>
        ),
        kepala: (
          <g>
            <polygon
              points="58,20 64,-10 78,12 90,-24 100,8 110,-24 122,12 136,-10 142,20"
              fill="#E0F2FE"
              stroke="#38BDF8"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <circle
              cx="100"
              cy="0"
              r="4"
              fill="#38BDF8"
              className={kelas("pet-kilau")}
            />
            <circle cx="78" cy="10" r="2.5" fill="#7DD3FC" />
            <circle cx="122" cy="10" r="2.5" fill="#7DD3FC" />
          </g>
        ),
      };

    // ---------------- NAGA API ----------------
    case "skin_naga_api":
      return {
        aura: (
          <g>
            <circle cx="100" cy="130" r="120" fill={g("api-aura")} />
            <circle
              cx="100"
              cy="130"
              r="112"
              fill="none"
              stroke="#F97316"
              strokeWidth="6"
              strokeDasharray="22 14"
              opacity="0.8"
              className={kelas("pet-putar")}
            />
            <circle
              cx="100"
              cy="130"
              r="112"
              fill="none"
              stroke="#FDE047"
              strokeWidth="2"
              strokeDasharray="6 30"
              opacity="0.9"
              className={kelas("pet-putar")}
            />
          </g>
        ),
        belakang: (
          <g>
            <path
              d="M100 206 Q150 214 168 250 Q176 262 190 252 Q180 232 166 220 Q140 200 104 202 Z"
              fill="#7F1D1D"
              stroke="#450A0A"
              strokeWidth="2"
            />
            <polygon points="186,240 202,250 188,258" fill="#F97316" />
            <Jubah fill="#450A0A" />
          </g>
        ),
        badan: (
          <Zirah
            fill="#991B1B"
            stroke="#450A0A"
            kerah="#7F1D1D"
            hias={
              <g fill="none" stroke="#DC2626" strokeWidth="1.5" opacity="0.9">
                {[132, 144, 156, 168].map((y) => (
                  <path
                    key={y}
                    d={`M62 ${y} q6 -6 12 0 q6 -6 12 0 M114 ${y} q6 -6 12 0 q6 -6 12 0`}
                  />
                ))}
              </g>
            }
            sabuk={
              <g>
                <rect
                  x="58"
                  y="184"
                  width="84"
                  height="12"
                  rx="4"
                  fill="#1F2937"
                  stroke="#0F172A"
                  strokeWidth="1.5"
                />
                <circle
                  cx="100"
                  cy="190"
                  r="6"
                  fill="#F97316"
                  stroke="#7F1D1D"
                  strokeWidth="1.5"
                />
              </g>
            }
          />
        ),
        bahu: (
          <g
            fill="#7F1D1D"
            stroke="#450A0A"
            strokeWidth="1.5"
            strokeLinejoin="round"
          >
            <polygon points="38,130 50,96 66,122" />
            <polygon points="50,128 64,110 72,124" />
            <polygon points="162,130 150,96 134,122" />
            <polygon points="150,128 136,110 128,124" />
          </g>
        ),
        tanganKanan: (
          <g>
            <polygon
              points="150,186 162,186 160,104 156,90 152,104"
              fill="#E5E7EB"
              stroke="#6B7280"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <line
              x1="156"
              y1="104"
              x2="156"
              y2="180"
              stroke="#9CA3AF"
              strokeWidth="1.5"
            />
            <rect
              x="142"
              y="184"
              width="28"
              height="6"
              rx="3"
              fill="#B45309"
              stroke="#78350F"
              strokeWidth="1.5"
            />
            <rect x="152" y="190" width="8" height="14" rx="2" fill="#78350F" />
            <g className={kelas("pet-api-atas")}>
              <polygon
                points="148,176 164,176 158,120 156,96 154,120"
                fill="#F97316"
                opacity="0.8"
              />
              <polygon
                points="152,170 160,170 157,130 156,116 155,130"
                fill="#FDE047"
                opacity="0.85"
              />
            </g>
          </g>
        ),
        kepala: (
          <g>
            <path
              d="M42 30 Q100 -8 158 30 L158 42 Q100 22 42 42 Z"
              fill="#7F1D1D"
              stroke="#450A0A"
              strokeWidth="2"
            />
            <path
              d="M62 24 Q36 -4 54 -30 Q58 -2 78 12 Z"
              fill="#FDE68A"
              stroke="#B45309"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M138 24 Q164 -4 146 -30 Q142 -2 122 12 Z"
              fill="#FDE68A"
              stroke="#B45309"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <polygon points="100,-2 96,16 104,16" fill="#F97316" />
          </g>
        ),
      };

    // ---------------- KSATRIA CAHAYA ----------------
    case "skin_ksatria_cahaya":
      return {
        aura: (
          <g>
            <circle cx="100" cy="130" r="120" fill={g("cahaya")} />
            <g className={kelas("pet-putar")} fill="#FEF3C7" opacity="0.55">
              {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                <polygon
                  key={a}
                  points="100,130 92,12 108,12"
                  transform={`rotate(${a} 100 130)`}
                />
              ))}
            </g>
          </g>
        ),
        belakang: <Jubah fill="#3B82F6" stroke="#1D4ED8" />,
        badan: (
          <Zirah
            fill="#F8FAFC"
            stroke="#D4AF37"
            kerah="#F59E0B"
            hias={
              <path
                d="M66 132 h16 M66 140 h16 M118 132 h16 M118 140 h16"
                stroke="#D4AF37"
                strokeWidth="1.5"
                opacity="0.7"
              />
            }
            sabuk={
              <g>
                <rect
                  x="58"
                  y="184"
                  width="84"
                  height="12"
                  rx="6"
                  fill="#F8FAFC"
                  stroke="#D4AF37"
                  strokeWidth="2"
                />
                <Bintang cx={100} cy={190} r={7} fill="#F59E0B" />
              </g>
            }
          />
        ),
        bahu: (
          <g>
            <ellipse
              cx="54"
              cy="124"
              rx="18"
              ry="11"
              fill="#F8FAFC"
              stroke="#D4AF37"
              strokeWidth="2"
            />
            <ellipse
              cx="146"
              cy="124"
              rx="18"
              ry="11"
              fill="#F8FAFC"
              stroke="#D4AF37"
              strokeWidth="2"
            />
          </g>
        ),
        tanganKiri: (
          <g>
            <path
              d="M22 160 H66 V192 Q66 216 44 224 Q22 216 22 192 Z"
              fill="#F8FAFC"
              stroke="#D4AF37"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            <path
              d="M30 168 H58 V190 Q58 206 44 212 Q30 206 30 190 Z"
              fill="#3B82F6"
              opacity="0.9"
            />
            <Bintang cx={44} cy={188} r={9} fill="#FDE68A" />
          </g>
        ),
        tanganKanan: (
          <g>
            <line
              x1="156"
              y1="182"
              x2="156"
              y2="96"
              stroke="#FFFFFF"
              strokeWidth="10"
              strokeLinecap="round"
              opacity="0.35"
              className={kelas("pet-denyut")}
            />
            <polygon
              points="151,186 161,186 159,104 156,88 153,104"
              fill="#FDE68A"
              stroke="#F59E0B"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <rect
              x="142"
              y="184"
              width="28"
              height="6"
              rx="3"
              fill="#F59E0B"
              stroke="#B45309"
              strokeWidth="1.5"
            />
            <rect x="152" y="190" width="8" height="14" rx="2" fill="#B45309" />
            <circle cx="156" cy="206" r="3.5" fill="#3B82F6" />
          </g>
        ),
        kepala: (
          <g>
            <ellipse
              cx="100"
              cy="-20"
              rx="34"
              ry="8"
              fill="none"
              stroke="#FDE68A"
              strokeWidth="4"
              className={kelas("pet-kilau")}
            />
            <path
              d="M42 30 Q100 -22 158 30 L158 38 Q100 14 42 38 Z"
              fill="#F8FAFC"
              stroke="#D4AF37"
              strokeWidth="2"
            />
            <path
              d="M44 34 Q8 22 12 50 Q30 44 44 52 Z"
              fill="#FFFFFF"
              stroke="#D4AF37"
              strokeWidth="1.5"
            />
            <path
              d="M156 34 Q192 22 188 50 Q170 44 156 52 Z"
              fill="#FFFFFF"
              stroke="#D4AF37"
              strokeWidth="1.5"
            />
            <rect x="97" y="-6" width="6" height="30" rx="3" fill="#F59E0B" />
          </g>
        ),
      };

    // ---------------- HARIMAU PUTIH × KAOS PRI (3 varian, 4 Sep 2026) ----------------
    case "skin_harimau_merah":
      return harimauPutih(
        { g, kelas },
        {
          kaos: "#DC2626",
          kaosGelap: "#991B1B",
          teks: "#FFFFFF",
          mahkota: false,
          jubah: false,
          aura: false,
        },
      );
    case "skin_harimau_hitam":
      return harimauPutih(
        { g, kelas },
        {
          kaos: "#111827",
          kaosGelap: "#000000",
          teks: "#F59E0B",
          mahkota: false,
          jubah: true,
          aura: false,
        },
      );
    case "skin_harimau_emas":
      return harimauPutih(
        { g, kelas },
        {
          kaos: "#F59E0B",
          kaosGelap: "#B45309",
          teks: "#111827",
          mahkota: true,
          jubah: false,
          aura: true,
        },
      );

    default:
      return null;
  }
}

/** Set Harimau Putih: topeng harimau putih bergaris hitam (mata menyala), kaos PRI, sarung tangan cakar, ekor loreng. */
function harimauPutih(
  { g, kelas }: Ctx,
  v: {
    kaos: string;
    kaosGelap: string;
    teks: string;
    mahkota: boolean;
    jubah: boolean;
    aura: boolean;
  },
): LapisanSkin {
  const garis = "#111827";
  const putih = "#F8FAFC";
  return {
    aura: v.aura ? (
      <g>
        <circle cx="100" cy="130" r="120" fill={g("aura")} />
        <circle
          cx="100"
          cy="130"
          r="110"
          fill="none"
          stroke={garis}
          strokeWidth="6"
          strokeDasharray="10 22"
          opacity="0.7"
          className={kelas("pet-putar")}
        />
        <circle
          cx="100"
          cy="130"
          r="110"
          fill="none"
          stroke={putih}
          strokeWidth="6"
          strokeDasharray="10 22"
          strokeDashoffset="16"
          opacity="0.9"
          className={kelas("pet-putar")}
        />
      </g>
    ) : undefined,
    belakang: (
      <g>
        {v.jubah ? (
          <Jubah
            fill="#0F172A"
            stroke="#1E293B"
            garis={
              <path
                d="M62 122 Q100 150 138 122"
                fill="none"
                stroke="#F59E0B"
                strokeWidth="2"
                opacity="0.6"
              />
            }
          />
        ) : null}
        {/* ekor loreng */}
        <g
          className={kelas("hewan-ekor")}
          style={{ transformBox: "fill-box", transformOrigin: "0% 0%" }}
        >
          <path
            d="M136 200 Q176 206 184 176 Q188 160 176 150"
            fill="none"
            stroke={garis}
            strokeWidth="12"
            strokeLinecap="round"
          />
          <path
            d="M136 200 Q176 206 184 176 Q188 160 176 150"
            fill="none"
            stroke={putih}
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M156 204 l4 -8 M170 198 l6 -6 M182 180 l6 -2 M182 164 l6 2"
            stroke={garis}
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      </g>
    ),
    badan: (
      <g>
        <rect x="60" y="122" width="80" height="64" rx="16" fill={v.kaos} />
        <rect x="50" y="124" width="14" height="24" rx="6" fill={v.kaosGelap} />
        <rect
          x="136"
          y="124"
          width="14"
          height="24"
          rx="6"
          fill={v.kaosGelap}
        />
        <path
          d="M84 122 Q100 134 116 122"
          fill="none"
          stroke={v.kaosGelap}
          strokeWidth="3"
        />
        <text
          x="100"
          y="162"
          textAnchor="middle"
          fontSize="20"
          fontWeight="800"
          fill={v.teks}
          fontFamily="inherit"
          letterSpacing="1"
        >
          PRI
        </text>
        <path
          d="M74 174 h52"
          stroke={v.teks}
          strokeWidth="2"
          opacity="0.5"
          strokeLinecap="round"
        />
      </g>
    ),
    tanganKiri: (
      <g>
        <circle
          cx="44"
          cy="190"
          r="12"
          fill={putih}
          stroke={garis}
          strokeWidth="2"
        />
        <path
          d="M34 196 l-6 10 M40 200 l-3 12 M48 200 l3 12"
          stroke={garis}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path d="M38 184 h12" stroke={garis} strokeWidth="2" opacity="0.6" />
      </g>
    ),
    tanganKanan: (
      <g>
        <circle
          cx="156"
          cy="190"
          r="12"
          fill={putih}
          stroke={garis}
          strokeWidth="2"
        />
        <path
          d="M166 196 l6 10 M160 200 l3 12 M152 200 l-3 12"
          stroke={garis}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path d="M150 184 h12" stroke={garis} strokeWidth="2" opacity="0.6" />
      </g>
    ),
    kepala: (
      <g>
        {/* telinga */}
        <path
          d="M50 40 Q44 8 74 22 Z"
          fill={putih}
          stroke={garis}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M150 40 Q156 8 126 22 Z"
          fill={putih}
          stroke={garis}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M56 36 Q54 18 70 26 Z" fill="#F9A8D4" />
        <path d="M144 36 Q146 18 130 26 Z" fill="#F9A8D4" />
        {/* topeng */}
        <rect
          x="46"
          y="24"
          width="108"
          height="78"
          rx="34"
          fill={putih}
          stroke={garis}
          strokeWidth="2.5"
        />
        {/* loreng */}
        <g fill={garis}>
          <path d="M100 26 q-8 12 0 22 q8 -10 0 -22 z" />
          <path d="M78 28 q-10 12 -2 20 q6 -8 2 -20 z" />
          <path d="M122 28 q10 12 2 20 q-6 -8 -2 -20 z" />
          <path d="M48 62 q12 -4 20 4 q-10 4 -20 -4 z" />
          <path d="M152 62 q-12 -4 -20 4 q10 4 20 -4 z" />
          <path d="M50 78 q12 -2 18 6 q-10 2 -18 -6 z" />
          <path d="M150 78 q-12 -2 -18 6 q10 2 18 -6 z" />
        </g>
        {/* mata menyala */}
        <ellipse
          cx="76"
          cy="58"
          rx="12"
          ry="8"
          fill="#F59E0B"
          className={kelas("pet-denyut")}
        />
        <ellipse
          cx="124"
          cy="58"
          rx="12"
          ry="8"
          fill="#F59E0B"
          className={kelas("pet-denyut")}
        />
        <ellipse cx="76" cy="58" rx="4" ry="6" fill={garis} />
        <ellipse cx="124" cy="58" rx="4" ry="6" fill={garis} />
        {/* hidung, kumis, mulut */}
        <polygon points="94,78 106,78 100,86" fill="#F472B6" />
        <path
          d="M100 86 v6 M92 94 q8 6 16 0"
          fill="none"
          stroke={garis}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M70 82 h20 M70 88 h18 M110 82 h20 M112 88 h18"
          stroke={garis}
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.8"
        />
        {v.mahkota ? (
          <g>
            <polygon
              points="66,24 66,-2 80,10 100,-14 120,10 134,-2 134,24"
              fill="#F59E0B"
              stroke="#B45309"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <circle cx="100" cy="-2" r="4" fill="#DC2626" />
          </g>
        ) : null}
      </g>
    ),
  };
}

"use client";

// ============================================================
// HewanSvg (4 Sep 2026) — HEWAN PELIHARAAN ROBOT: kucing, anjing, kapibara.
// Semua berbentuk robot (pelat logam, sendi, mata LED, inti dada menyala).
// Tumbuh 3 tahap: ANAK (kecil, kepala besar, berkilau), REMAJA, DEWASA
// (ukuran penuh + pernik: lonceng kucing, bandana anjing, jeruk kapibara).
// Animasi transform/opacity lewat kelas CSS (globals.css): idle, jalan,
// lompat, guling, tidur, senang, lapar, ekor. Menghadap kanan; balik dengan
// `menghadap="kiri"`.
// ============================================================

import { useId, type CSSProperties } from "react";
import {
  gelapkan,
  terangkan,
  type JenisHewan,
  type SuasanaHewan,
  type TahapHewan,
} from "@/lib/pet";

export type GerakHewan =
  | "idle"
  | "jalan"
  | "lompat"
  | "guling"
  | "tidur"
  | "senang"
  | "lapar"
  | "ekor"
  | "diam";

type Props = {
  jenis: JenisHewan;
  tahap: TahapHewan;
  suasana?: SuasanaHewan;
  ukuran?: number;
  animasi?: boolean;
  gerak?: GerakHewan;
  menghadap?: "kiri" | "kanan";
  className?: string;
  style?: CSSProperties;
};

const LEBAR = 200;
const TINGGI = 170;

const PALET: Record<
  JenisHewan,
  { badan: string; aksen: string; perut: string; mata: string; label: string }
> = {
  kucing: {
    badan: "#94A3B8",
    aksen: "#F472B6",
    perut: "#E2E8F0",
    mata: "#22D3EE",
    label: "Kucing robot",
  },
  anjing: {
    badan: "#F59E0B",
    aksen: "#FEF3C7",
    perut: "#FDE68A",
    mata: "#22C55E",
    label: "Anjing robot",
  },
  kapibara: {
    badan: "#A16207",
    aksen: "#FDE68A",
    perut: "#D6B370",
    mata: "#38BDF8",
    label: "Kapibara robot",
  },
};

const SKALA: Record<TahapHewan, { badan: number; kepala: number }> = {
  anak: { badan: 0.62, kepala: 1.3 },
  remaja: { badan: 0.82, kepala: 1.1 },
  dewasa: { badan: 1, kepala: 1 },
};

const KELAS_GERAK: Record<GerakHewan, string> = {
  idle: "hewan-idle",
  jalan: "hewan-jalan",
  lompat: "hewan-lompat",
  guling: "hewan-guling",
  tidur: "hewan-tidur",
  senang: "hewan-senang",
  lapar: "hewan-lapar",
  ekor: "hewan-idle",
  diam: "",
};

export function HewanSvg({
  jenis,
  tahap,
  suasana = "senang",
  ukuran = 120,
  animasi = true,
  gerak,
  menghadap = "kanan",
  className,
  style,
}: Props) {
  const p = PALET[jenis];
  const gelap = gelapkan(p.badan, 0.35);
  const terang = terangkan(p.badan, 0.3);
  const sk = SKALA[tahap];
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const kelas = (k: string) => (animasi && k ? k : undefined);
  const gerakEfektif: GerakHewan =
    gerak ?? (suasana === "lapar" ? "lapar" : "idle");
  const tidur = gerakEfektif === "tidur";
  const kaki = (x: number, kelompok: "a" | "b") => (
    <g
      className={
        gerakEfektif === "jalan"
          ? kelas(kelompok === "a" ? "hewan-kaki-a" : "hewan-kaki-b")
          : undefined
      }
    >
      <rect x={x} y="126" width="13" height="26" rx="6" fill={gelap} />
      <rect
        x={x + 2}
        y="130"
        width="9"
        height="12"
        rx="4"
        fill={terang}
        opacity="0.35"
      />
      <ellipse cx={x + 6.5} cy="152" rx="9" ry="4" fill="#334155" />
    </g>
  );

  return (
    <svg
      viewBox={`0 0 ${LEBAR} ${TINGGI}`}
      width={ukuran}
      height={Math.round((ukuran * TINGGI) / LEBAR)}
      className={className}
      style={{
        ...style,
        transform: menghadap === "kiri" ? "scaleX(-1)" : undefined,
      }}
      role="img"
      aria-label={`${p.label} tahap ${tahap}`}
    >
      <defs>
        <linearGradient id={`${id}-badan`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={terang} />
          <stop offset="0.55" stopColor={p.badan} />
          <stop offset="1" stopColor={gelap} />
        </linearGradient>
        <radialGradient id={`${id}-inti`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.4" stopColor={p.mata} />
          <stop offset="1" stopColor={p.mata} stopOpacity="0.1" />
        </radialGradient>
      </defs>

      {/* bayangan lantai */}
      <ellipse
        cx="100"
        cy="156"
        rx={54 * sk.badan}
        ry={7 * sk.badan}
        fill="#0F172A"
        opacity="0.18"
      />

      <g
        className={kelas(KELAS_GERAK[gerakEfektif])}
        style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}
      >
        {/* kaki di lantai 150, tubuh diskalakan per tahap dari titik kaki */}
        <g
          transform={`translate(100 152) scale(${sk.badan}) translate(-100 -152)`}
        >
          {/* ekor */}
          {jenis === "kucing" ? (
            <g
              className={kelas("hewan-ekor")}
              style={{ transformBox: "fill-box", transformOrigin: "100% 100%" }}
            >
              <path
                d="M58 104 Q30 96 26 66 Q26 54 36 50"
                fill="none"
                stroke={gelap}
                strokeWidth="9"
                strokeLinecap="round"
              />
              <path
                d="M58 104 Q30 96 26 66 Q26 54 36 50"
                fill="none"
                stroke={p.badan}
                strokeWidth="5"
                strokeLinecap="round"
              />
              <circle
                cx="37"
                cy="48"
                r="6"
                fill={p.aksen}
                className={kelas("pet-denyut")}
              />
            </g>
          ) : null}
          {jenis === "anjing" ? (
            <g
              className={kelas("hewan-ekor")}
              style={{ transformBox: "fill-box", transformOrigin: "100% 100%" }}
            >
              <path
                d="M58 102 Q40 84 44 66"
                fill="none"
                stroke={gelap}
                strokeWidth="9"
                strokeLinecap="round"
              />
              <path
                d="M58 102 Q40 84 44 66"
                fill="none"
                stroke={p.badan}
                strokeWidth="5"
                strokeLinecap="round"
              />
              <circle cx="44" cy="64" r="5" fill={p.aksen} />
            </g>
          ) : null}

          {/* kaki belakang (kelompok b) + depan (kelompok a) */}
          {kaki(66, "b")}
          {kaki(126, "a")}

          {/* badan */}
          {jenis === "kapibara" ? (
            <ellipse
              cx="100"
              cy="112"
              rx="52"
              ry="34"
              fill={`url(#${id}-badan)`}
              stroke={gelap}
              strokeWidth="2"
            />
          ) : (
            <rect
              x="52"
              y="82"
              width="96"
              height="58"
              rx="28"
              fill={`url(#${id}-badan)`}
              stroke={gelap}
              strokeWidth="2"
            />
          )}
          <ellipse
            cx="102"
            cy="122"
            rx="30"
            ry="12"
            fill={p.perut}
            opacity="0.85"
          />
          {/* garis pelat & sekrup */}
          <path
            d="M70 100 H130"
            stroke={gelap}
            strokeWidth="1.5"
            opacity="0.5"
          />
          <circle cx="66" cy="96" r="2" fill={gelap} />
          <circle cx="134" cy="96" r="2" fill={gelap} />
          {/* inti dada */}
          <circle
            cx="118"
            cy="110"
            r="7"
            fill={`url(#${id}-inti)`}
            className={kelas("pet-denyut")}
          />

          {kaki(84, "a")}
          {kaki(108, "b")}

          {/* leher */}
          <rect x="128" y="86" width="20" height="16" rx="6" fill={gelap} />

          {/* kepala (diskalakan lebih besar saat anak) */}
          <g
            transform={`translate(146 74) scale(${sk.kepala}) translate(-146 -74)`}
          >
            {/* telinga */}
            {jenis === "kucing" ? (
              <g>
                <polygon
                  points="126,58 132,26 152,52"
                  fill={p.badan}
                  stroke={gelap}
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <polygon
                  points="156,52 172,28 176,60"
                  fill={p.badan}
                  stroke={gelap}
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <polygon points="132,56 136,38 148,52" fill={p.aksen} />
                <polygon points="158,54 168,38 170,58" fill={p.aksen} />
              </g>
            ) : null}
            {jenis === "anjing" ? (
              <g>
                <ellipse
                  cx="124"
                  cy="70"
                  rx="9"
                  ry="20"
                  fill={gelap}
                  transform="rotate(12 124 70)"
                />
                <ellipse
                  cx="170"
                  cy="72"
                  rx="9"
                  ry="20"
                  fill={gelap}
                  transform="rotate(-12 170 72)"
                />
                <line
                  x1="150"
                  y1="50"
                  x2="154"
                  y2="34"
                  stroke={gelap}
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <circle
                  cx="155"
                  cy="31"
                  r="4"
                  fill={p.mata}
                  className={kelas("pet-denyut")}
                />
              </g>
            ) : null}
            {jenis === "kapibara" ? (
              <g>
                <circle cx="128" cy="54" r="7" fill={gelap} />
                <circle cx="166" cy="54" r="7" fill={gelap} />
              </g>
            ) : null}

            {/* tengkorak */}
            {jenis === "kapibara" ? (
              <rect
                x="118"
                y="48"
                width="58"
                height="52"
                rx="22"
                fill={`url(#${id}-badan)`}
                stroke={gelap}
                strokeWidth="2"
              />
            ) : (
              <rect
                x="120"
                y="50"
                width="54"
                height="48"
                rx={jenis === "kucing" ? 18 : 22}
                fill={`url(#${id}-badan)`}
                stroke={gelap}
                strokeWidth="2"
              />
            )}
            {/* moncong */}
            <ellipse
              cx="164"
              cy="84"
              rx={jenis === "kapibara" ? 16 : 12}
              ry="9"
              fill={p.perut}
            />
            <ellipse cx="170" cy="80" rx="4" ry="3" fill="#1F2937" />
            {/* mulut */}
            {tidur ? (
              <path
                d="M160 90 h8"
                stroke="#1F2937"
                strokeWidth="2"
                strokeLinecap="round"
              />
            ) : suasana === "lapar" ? (
              <path
                d="M158 92 q6 -4 12 0"
                fill="none"
                stroke="#1F2937"
                strokeWidth="2"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M158 90 q6 6 12 0"
                fill="none"
                stroke="#1F2937"
                strokeWidth="2"
                strokeLinecap="round"
              />
            )}
            {/* layar mata */}
            <rect x="128" y="60" width="40" height="18" rx="7" fill="#0F172A" />
            {tidur ? (
              <g
                stroke={p.mata}
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
              >
                <path d="M132 70 q5 4 10 0" />
                <path d="M152 70 q5 4 10 0" />
              </g>
            ) : (
              <g
                className={kelas("pet-kedip")}
                style={{ transformBox: "fill-box", transformOrigin: "center" }}
              >
                <circle cx="138" cy="69" r="5" fill={p.mata} />
                <circle cx="158" cy="69" r="5" fill={p.mata} />
                <circle cx="140" cy="67" r="1.6" fill="#FFFFFF" />
                <circle cx="160" cy="67" r="1.6" fill="#FFFFFF" />
              </g>
            )}
            {/* pipi */}
            <circle cx="130" cy="82" r="3" fill={p.aksen} opacity="0.7" />

            {/* pernik tahap DEWASA */}
            {tahap === "dewasa" && jenis === "kucing" ? (
              <g>
                <path
                  d="M124 96 Q146 108 170 96"
                  fill="none"
                  stroke="#DC2626"
                  strokeWidth="4"
                />
                <circle
                  cx="146"
                  cy="104"
                  r="5"
                  fill="#F59E0B"
                  stroke="#B45309"
                  strokeWidth="1"
                />
              </g>
            ) : null}
            {tahap === "dewasa" && jenis === "anjing" ? (
              <g>
                <path
                  d="M122 92 Q146 100 172 92 L150 114 Z"
                  fill="#DC2626"
                  stroke="#7F1D1D"
                  strokeWidth="1"
                />
                <path
                  d="M132 96 h28"
                  stroke="#F9FAFB"
                  strokeWidth="1.5"
                  opacity="0.6"
                />
              </g>
            ) : null}
            {tahap === "dewasa" && jenis === "kapibara" ? (
              <g>
                <circle
                  cx="146"
                  cy="44"
                  r="9"
                  fill="#F97316"
                  stroke="#C2410C"
                  strokeWidth="1.5"
                />
                <path
                  d="M146 36 q6 -6 10 -2"
                  fill="none"
                  stroke="#16A34A"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </g>
            ) : null}
          </g>

          {/* kilau tahap ANAK */}
          {tahap === "anak" ? (
            <g fill="#FDE047">
              <circle cx="40" cy="60" r="3" className={kelas("pet-kilau")} />
              <circle
                cx="180"
                cy="40"
                r="2.5"
                className={kelas("pet-kilau")}
                style={{ animationDelay: "0.5s" }}
              />
              <circle
                cx="60"
                cy="140"
                r="2"
                className={kelas("pet-kilau")}
                style={{ animationDelay: "0.9s" }}
              />
            </g>
          ) : null}
          {/* zZ saat tidur */}
          {tidur ? (
            <g fill={p.mata} fontFamily="inherit" fontWeight="800">
              <text
                x="176"
                y="40"
                fontSize="14"
                className={kelas("pet-denyut")}
              >
                z
              </text>
              <text x="186" y="26" fontSize="10" opacity="0.7">
                z
              </text>
            </g>
          ) : null}
        </g>
      </g>
    </svg>
  );
}

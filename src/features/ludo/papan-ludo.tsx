"use client";

// ============================================================
// PapanLudo (3 Sep 2026) — papan Ludo 15×15 vektor (600×600) dengan token
// berupa ROBOT PET tiap pemain. Empat markas berwarna, lintasan 52 petak,
// petak aman berbintang, jalur rumah berwarna, pusat empat segitiga. Token
// yang boleh jalan berdenyut dan bisa diketuk. Dadu 3D-ish dengan animasi
// berputar. Semua geometri dari lib/ludo (sumber kebenaran yang sama dengan server).
// ============================================================

import { useEffect, useState } from "react";
import {
  KOORDINAT_JALUR_RUMAH,
  KOORDINAT_LINTASAN,
  KOORDINAT_MARKAS,
  PETAK_AMAN,
  PETAK_AWAL,
  POS_MARKAS,
  WARNA,
  koordinatToken,
  type Pemain,
  type StateLudo,
} from "@/lib/ludo";
import { RobotSvg } from "@/features/pet/robot-svg";
import { cn } from "@/lib/utils";

const SEL = 40;
const UKURAN = SEL * 15;

function Bintang({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) {
  const titik: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    titik.push(`${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`);
  }
  return <polygon points={titik.join(" ")} fill={fill} />;
}

type TokenTampil = {
  pemain: number;
  token: number;
  warna: number;
  x: number;
  y: number;
  boleh: boolean;
  diMarkas: boolean;
};

export function PapanLudo({
  pemain,
  state,
  sayaIndeks,
  onGerak,
  sibuk,
}: {
  pemain: Pemain[];
  state: StateLudo;
  sayaIndeks: number;
  onGerak: (token: number) => void;
  sibuk: boolean;
}) {
  const giliranSaya = state.giliran === sayaIndeks && state.fase === "pilih" && state.pemenang === null;
  // Susun token + geser bila beberapa token berbagi petak.
  const daftar: TokenTampil[] = [];
  pemain.forEach((p, j) => {
    state.token[j]?.forEach((pos, t) => {
      const [kx, ky] = koordinatToken(p.warna, pos, t);
      daftar.push({
        pemain: j,
        token: t,
        warna: p.warna,
        x: kx * SEL,
        y: ky * SEL,
        boleh: giliranSaya && state.boleh.includes(t) && j === sayaIndeks,
        diMarkas: pos === POS_MARKAS,
      });
    });
  });
  const kelompok = new Map<string, TokenTampil[]>();
  for (const t of daftar) {
    const k = `${Math.round(t.x)},${Math.round(t.y)}`;
    kelompok.set(k, [...(kelompok.get(k) ?? []), t]);
  }
  const posisiAkhir = new Map<TokenTampil, { x: number; y: number }>();
  for (const grup of kelompok.values()) {
    grup.forEach((t, i) => {
      const geser = grup.length > 1 ? (i - (grup.length - 1) / 2) * 11 : 0;
      posisiAkhir.set(t, { x: t.x + geser, y: t.y - Math.abs(geser) * 0.3 });
    });
  }

  return (
    <svg viewBox={`0 0 ${UKURAN} ${UKURAN}`} className="h-auto w-full max-w-[600px] select-none" role="img" aria-label="Papan Ludo">
      <defs>
        {WARNA.map((w, i) => (
          <linearGradient key={i} id={`ludo-w${i}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={w.utama} />
            <stop offset="1" stopColor={w.gelap} />
          </linearGradient>
        ))}
        <linearGradient id="ludo-papan" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F8FAFC" />
          <stop offset="1" stopColor="#E2E8F0" />
        </linearGradient>
        <filter id="ludo-bayang" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000000" floodOpacity="0.28" />
        </filter>
      </defs>

      {/* Dasar papan */}
      <rect x="0" y="0" width={UKURAN} height={UKURAN} rx="18" fill="url(#ludo-papan)" />

      {/* Empat markas */}
      {[
        [0, 0],
        [9, 0],
        [9, 9],
        [0, 9],
      ].map(([kx, ky], w) => (
        <g key={w}>
          <rect x={kx * SEL} y={ky * SEL} width={6 * SEL} height={6 * SEL} rx={w === 0 ? 18 : 0} fill={`url(#ludo-w${w})`} />
          <rect x={kx * SEL + SEL} y={ky * SEL + SEL} width={4 * SEL} height={4 * SEL} rx="16" fill="#FFFFFF" opacity="0.92" />
          {KOORDINAT_MARKAS[w].map(([mx, my], i) => (
            <circle key={i} cx={mx * SEL} cy={my * SEL} r="17" fill={WARNA[w].terang} stroke={WARNA[w].utama} strokeWidth="2.5" />
          ))}
          <text x={kx * SEL + 3 * SEL} y={ky * SEL + 6 * SEL - 8} textAnchor="middle" fontSize="11" fontWeight="800" fill="#FFFFFF" opacity="0.9" fontFamily="inherit">
            {WARNA[w].nama.toUpperCase()}
          </text>
        </g>
      ))}

      {/* Lintasan 52 petak */}
      {KOORDINAT_LINTASAN.map(([x, y], i) => {
        const awal = (PETAK_AWAL as readonly number[]).indexOf(i);
        const aman = PETAK_AMAN.has(i);
        return (
          <g key={i}>
            <rect
              x={x * SEL + 2}
              y={y * SEL + 2}
              width={SEL - 4}
              height={SEL - 4}
              rx="7"
              fill={awal >= 0 ? WARNA[awal].utama : "#FFFFFF"}
              stroke={awal >= 0 ? WARNA[awal].gelap : "#CBD5E1"}
              strokeWidth="1.2"
            />
            {aman && awal < 0 ? <Bintang cx={x * SEL + SEL / 2} cy={y * SEL + SEL / 2} r={11} fill="#CBD5E1" /> : null}
            {awal >= 0 ? <Bintang cx={x * SEL + SEL / 2} cy={y * SEL + SEL / 2} r={9} fill="#FFFFFF" /> : null}
          </g>
        );
      })}

      {/* Jalur rumah */}
      {KOORDINAT_JALUR_RUMAH.map((jalur, w) =>
        jalur.map(([x, y], i) => (
          <rect key={`${w}-${i}`} x={x * SEL + 2} y={y * SEL + 2} width={SEL - 4} height={SEL - 4} rx="7" fill={WARNA[w].terang} stroke={WARNA[w].utama} strokeWidth="1.2" />
        )),
      )}

      {/* Pusat: empat segitiga */}
      <rect x={6 * SEL} y={6 * SEL} width={3 * SEL} height={3 * SEL} fill="#FFFFFF" />
      <polygon points={`${6 * SEL},${6 * SEL} ${6 * SEL},${9 * SEL} ${7.5 * SEL},${7.5 * SEL}`} fill={WARNA[0].utama} />
      <polygon points={`${6 * SEL},${6 * SEL} ${9 * SEL},${6 * SEL} ${7.5 * SEL},${7.5 * SEL}`} fill={WARNA[1].utama} />
      <polygon points={`${9 * SEL},${6 * SEL} ${9 * SEL},${9 * SEL} ${7.5 * SEL},${7.5 * SEL}`} fill={WARNA[2].utama} />
      <polygon points={`${6 * SEL},${9 * SEL} ${9 * SEL},${9 * SEL} ${7.5 * SEL},${7.5 * SEL}`} fill={WARNA[3].utama} />
      <circle cx={7.5 * SEL} cy={7.5 * SEL} r="13" fill="#FFFFFF" stroke="#94A3B8" strokeWidth="2" />
      <text x={7.5 * SEL} y={7.5 * SEL + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill="#334155" fontFamily="inherit">
        🏠
      </text>

      {/* Token = robot pet pemain */}
      {daftar.map((t) => {
        const p = pemain[t.pemain];
        const pos = posisiAkhir.get(t) ?? { x: t.x, y: t.y };
        const w = WARNA[t.warna];
        const lebar = t.diMarkas ? 26 : 28;
        return (
          <g
            key={`${t.pemain}-${t.token}`}
            transform={`translate(${pos.x}, ${pos.y})`}
            style={{ transition: "transform 420ms cubic-bezier(0.22, 1, 0.36, 1)", cursor: t.boleh && !sibuk ? "pointer" : "default" }}
            onClick={() => t.boleh && !sibuk && onGerak(t.token)}
            role={t.boleh ? "button" : undefined}
            aria-label={t.boleh ? `Gerakkan robot ${p.robot.nama} nomor ${t.token + 1}` : undefined}
            filter="url(#ludo-bayang)"
          >
            {t.boleh ? <circle r="21" fill="none" stroke="#F59E0B" strokeWidth="4" className="ludo-denyut" /> : null}
            <circle r="17" fill={w.utama} stroke="#FFFFFF" strokeWidth="2.5" />
            <g transform={`translate(${-lebar / 2}, ${-lebar * 0.72})`}>
              <RobotSvg jenis={p.robot.jenis} suasana="senang" terpasang={p.robot.terpasang} sparepart={p.robot.sparepart} ukuran={lebar} animasi={false} />
            </g>
            <text y="30" textAnchor="middle" fontSize="9" fontWeight="800" fill={w.gelap} fontFamily="inherit">
              {t.token + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------
// Dadu
// ------------------------------------------------------------
const PIP: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [28, 28],
    [50, 50],
    [72, 72],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [28, 28],
    [72, 28],
    [50, 50],
    [28, 72],
    [72, 72],
  ],
  6: [
    [28, 26],
    [72, 26],
    [28, 50],
    [72, 50],
    [28, 74],
    [72, 74],
  ],
};

export function Dadu({ nilai, berputar, warna, onLempar, boleh }: { nilai: number | null; berputar: boolean; warna: string; onLempar: () => void; boleh: boolean }) {
  // Saat berputar, wajah dadu diacak tiap 90 ms; selain itu tampil nilai server.
  const [acakNilai, setAcakNilai] = useState(6);
  useEffect(() => {
    if (!berputar) return;
    const t = setInterval(() => setAcakNilai(1 + Math.floor(Math.random() * 6)), 90);
    return () => clearInterval(t);
  }, [berputar]);
  const tampil = berputar ? acakNilai : (nilai ?? 6);

  return (
    <button
      type="button"
      onClick={onLempar}
      disabled={!boleh || berputar}
      aria-label={boleh ? "Lempar dadu" : `Dadu ${nilai ?? "-"}`}
      className={cn("btn-tekan relative flex h-[76px] w-[76px] items-center justify-center rounded-2xl disabled:cursor-default", boleh && !berputar && "ludo-giliran")}
      style={{ background: "linear-gradient(145deg, #FFFFFF, #E2E8F0)", boxShadow: "0 8px 20px rgba(15,23,42,0.25), inset 0 -3px 0 rgba(0,0,0,0.08)" }}
    >
      <svg viewBox="0 0 100 100" className={cn("h-[60px] w-[60px]", berputar && "ludo-dadu-putar")}>
        <rect x="6" y="6" width="88" height="88" rx="18" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="3" />
        {(PIP[tampil] ?? PIP[6]).map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="8" fill={warna} />
        ))}
      </svg>
      {boleh && !berputar ? <span className="absolute -bottom-5 text-[10px] font-extrabold text-amber-500">KETUK!</span> : null}
    </button>
  );
}

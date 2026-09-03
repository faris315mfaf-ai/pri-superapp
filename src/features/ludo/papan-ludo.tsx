"use client";

// ============================================================
// PapanLudo 2,5D (3 Sep 2026) — papan Ludo 15×15 dimiringkan dengan perspektif
// (rotateX) di atas "panggung" 3D: sel-sel diekstrusi (muka atas + sisi gelap),
// markas kaca berkilau, pusat berbentuk piramida, bintang aman bercahaya.
// Bidak = ROBOT PET tiap pemain sebagai papan iklan (billboard) yang berdiri
// tegak di atas papan (kontra-rotasi) lengkap dengan bayangan di lantai dan
// cakram warna. Dadu = kubus CSS 3D enam sisi yang berguling lalu mendarat di
// sisi hasil server. Semua geometri dari lib/ludo (sama dengan server).
// ============================================================

import { useEffect, useRef, useState } from "react";
import {
  KOORDINAT_JALUR_RUMAH,
  KOORDINAT_LINTASAN,
  KOORDINAT_MARKAS,
  PETAK_AMAN,
  PETAK_AWAL,
  POS_MARKAS,
  POS_RUMAH,
  WARNA,
  koordinatToken,
  type Pemain,
  type StateLudo,
} from "@/lib/ludo";
import { RobotSvg } from "@/features/pet/robot-svg";
import { cn } from "@/lib/utils";

const SEL = 40;
const UKURAN = SEL * 15;
/** Kemiringan papan (derajat). */
const MIRING = 52;
/** Jarak kamera perspektif (px) — makin besar makin "lembut" distorsinya. */
const KAMERA = 2000;
/** Faktor pelebaran sisi dekat papan akibat perspektif; dipakai agar papan selalu muat di wadah. */
const LEBAR_DEKAT = 1.16;
/** Tebal ekstrusi sel (px). */
const TEBAL = 5;

function Bintang({
  cx,
  cy,
  r,
  fill,
  opacity = 1,
}: {
  cx: number;
  cy: number;
  r: number;
  fill: string;
  opacity?: number;
}) {
  const titik: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    titik.push(
      `${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`,
    );
  }
  return <polygon points={titik.join(" ")} fill={fill} opacity={opacity} />;
}

/** Sel diekstrusi: sisi gelap di bawah + muka atas bergradasi + kilau tepi. */
function Sel({
  x,
  y,
  warnaAtas,
  warnaSisi,
  tepi,
  id,
}: {
  x: number;
  y: number;
  warnaAtas: string;
  warnaSisi: string;
  tepi: string;
  id: string;
}) {
  const px = x * SEL + 2;
  const py = y * SEL + 2;
  const w = SEL - 4;
  return (
    <g>
      <rect
        x={px}
        y={py + TEBAL}
        width={w}
        height={w}
        rx="7"
        fill={warnaSisi}
      />
      <rect
        x={px}
        y={py}
        width={w}
        height={w}
        rx="7"
        fill={`url(#${id})`}
        stroke={tepi}
        strokeWidth="1"
      />
      <rect
        x={px + 3}
        y={py + 2}
        width={w - 6}
        height={Math.round(w * 0.42)}
        rx="5"
        fill="#FFFFFF"
        opacity="0.28"
      />
      <rect
        x={px}
        y={py}
        width={w}
        height={w}
        rx="7"
        fill="none"
        stroke={warnaAtas}
        strokeWidth="0.6"
        opacity="0.6"
      />
    </g>
  );
}

type TokenTampil = {
  pemain: number;
  token: number;
  warna: number;
  x: number;
  y: number;
  boleh: boolean;
  diMarkas: boolean;
  diRumah: boolean;
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
  // Skala panggung mengikuti lebar wadah (papan tetap 600 px lalu diperkecil).
  const wadah = useRef<HTMLDivElement>(null);
  const [skala, setSkala] = useState(0.55);
  useEffect(() => {
    const el = wadah.current;
    if (!el) return;
    const ukur = () =>
      setSkala(
        Math.max(0.3, Math.min(1, el.clientWidth / (UKURAN * LEBAR_DEKAT))),
      );
    ukur();
    const ro = new ResizeObserver(ukur);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const giliranSaya =
    state.giliran === sayaIndeks &&
    state.fase === "pilih" &&
    state.pemenang === null;
  const warnaGiliran =
    state.pemenang === null ? (pemain[state.giliran]?.warna ?? -1) : -1;
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
        diRumah: pos >= POS_RUMAH,
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
      const geser = grup.length > 1 ? (i - (grup.length - 1) / 2) * 12 : 0;
      posisiAkhir.set(t, { x: t.x + geser, y: t.y + Math.abs(geser) * 0.25 });
    });
  }
  // Token digambar dari belakang (y kecil) ke depan (y besar) supaya tumpang tindihnya benar.
  const urutan = [...daftar].sort(
    (a, b) => (posisiAkhir.get(a)?.y ?? 0) - (posisiAkhir.get(b)?.y ?? 0),
  );

  const tinggiPanggung = Math.round(UKURAN * skala * 0.76);

  return (
    <div
      ref={wadah}
      className="relative w-full overflow-hidden rounded-3xl"
      style={{
        height: tinggiPanggung,
        background:
          "radial-gradient(ellipse at 50% 30%, #334155 0%, #1E293B 45%, #0B1220 100%)",
      }}
    >
      {/* Kilau lampu meja */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.14), rgba(255,255,255,0) 70%)",
        }}
      />
      {/* Panggung 600×600 diperkecil; diposisikan absolut di tengah karena margin auto tidak bisa menengahkan kotak yang lebih lebar dari wadahnya. */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          marginLeft: -UKURAN / 2,
          width: UKURAN,
          height: UKURAN,
          transform: `scale(${skala})`,
          transformOrigin: "top center",
          perspective: KAMERA,
          perspectiveOrigin: "50% 25%",
        }}
      >
        <div
          style={{
            position: "relative",
            width: UKURAN,
            height: UKURAN,
            transformStyle: "preserve-3d",
            transform: `translateY(${-UKURAN * 0.17}px) rotateX(${MIRING}deg)`,
            transformOrigin: "50% 50%",
          }}
        >
          {/* Ketebalan papan: lapisan lebih gelap sedikit di bawah bidang papan → sisi dekat terlihat tebal */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: -14,
              borderRadius: 26,
              background: "linear-gradient(180deg, #3B2718 0%, #24160D 100%)",
              transform: "translateZ(-16px)",
            }}
          />
          {/* Bayangan papan di "meja" */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: -14,
              borderRadius: 40,
              background: "rgba(2, 6, 23, 0.45)",
              filter: "blur(18px)",
              transform: "translateZ(-30px) translateY(26px)",
            }}
          />

          <svg
            viewBox={`0 0 ${UKURAN} ${UKURAN}`}
            width={UKURAN}
            height={UKURAN}
            className="absolute inset-0 select-none"
            role="img"
            aria-label="Papan Ludo"
          >
            <defs>
              {WARNA.map((w, i) => (
                <linearGradient
                  key={`q${i}`}
                  id={`ludo-q${i}`}
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="1"
                >
                  <stop offset="0" stopColor={w.terang} />
                  <stop offset="0.45" stopColor={w.utama} />
                  <stop offset="1" stopColor={w.gelap} />
                </linearGradient>
              ))}
              {WARNA.map((w, i) => (
                <linearGradient
                  key={`c${i}`}
                  id={`ludo-sel-w${i}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0" stopColor={w.terang} />
                  <stop offset="1" stopColor={w.utama} />
                </linearGradient>
              ))}
              {WARNA.map((w, i) => (
                <linearGradient
                  key={`h${i}`}
                  id={`ludo-rumah-w${i}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0" stopColor="#FFFFFF" />
                  <stop offset="1" stopColor={w.terang} />
                </linearGradient>
              ))}
              <linearGradient id="ludo-sel-putih" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#FFFFFF" />
                <stop offset="1" stopColor="#E2E8F0" />
              </linearGradient>
              <linearGradient id="ludo-bingkai" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#7C5A3A" />
                <stop offset="0.5" stopColor="#4A3222" />
                <stop offset="1" stopColor="#2B1B12" />
              </linearGradient>
              <linearGradient id="ludo-lantai" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#F1F5F9" />
                <stop offset="1" stopColor="#CBD5E1" />
              </linearGradient>
              <radialGradient id="ludo-sorot" cx="0.5" cy="0.35" r="0.75">
                <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
                <stop offset="0.6" stopColor="#FFFFFF" stopOpacity="0.05" />
                <stop offset="1" stopColor="#0F172A" stopOpacity="0.22" />
              </radialGradient>
              <radialGradient id="ludo-kilau" cx="0.3" cy="0.25" r="0.8">
                <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.85" />
                <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.15" />
                <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
              </radialGradient>
              <filter
                id="ludo-glow"
                x="-60%"
                y="-60%"
                width="220%"
                height="220%"
              >
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter
                id="ludo-bayang-dalam"
                x="-10%"
                y="-10%"
                width="120%"
                height="120%"
              >
                <feDropShadow
                  dx="0"
                  dy="3"
                  stdDeviation="3"
                  floodColor="#000000"
                  floodOpacity="0.25"
                />
              </filter>
            </defs>

            {/* Bingkai kayu + lantai papan */}
            <rect
              x="-14"
              y="-14"
              width={UKURAN + 28}
              height={UKURAN + 28}
              rx="26"
              fill="url(#ludo-bingkai)"
            />
            <rect
              x="-11"
              y="-11"
              width={UKURAN + 22}
              height={UKURAN + 22}
              rx="24"
              fill="none"
              stroke="#C9A97E"
              strokeWidth="1.5"
              opacity="0.5"
            />
            <rect
              x="0"
              y="0"
              width={UKURAN}
              height={UKURAN}
              rx="16"
              fill="url(#ludo-lantai)"
            />

            {/* Empat markas: kaca berwarna dengan kilau */}
            {[
              [0, 0],
              [9, 0],
              [9, 9],
              [0, 9],
            ].map(([kx, ky], w) => (
              <g key={w} filter="url(#ludo-bayang-dalam)">
                <rect
                  x={kx * SEL}
                  y={ky * SEL}
                  width={6 * SEL}
                  height={6 * SEL}
                  rx="16"
                  fill={`url(#ludo-q${w})`}
                />
                <rect
                  x={kx * SEL}
                  y={ky * SEL}
                  width={6 * SEL}
                  height={6 * SEL}
                  rx="16"
                  fill="url(#ludo-kilau)"
                />
                <rect
                  x={kx * SEL + SEL - 4}
                  y={ky * SEL + SEL + 2}
                  width={4 * SEL + 8}
                  height={4 * SEL + 8}
                  rx="20"
                  fill="#0F172A"
                  opacity="0.18"
                />
                <rect
                  x={kx * SEL + SEL - 4}
                  y={ky * SEL + SEL - 4}
                  width={4 * SEL + 8}
                  height={4 * SEL + 8}
                  rx="20"
                  fill="#FFFFFF"
                  opacity="0.94"
                />
                {KOORDINAT_MARKAS[w].map(([mx, my], i) => (
                  <g key={i}>
                    <circle
                      cx={mx * SEL}
                      cy={my * SEL + 3}
                      r="19"
                      fill="#0F172A"
                      opacity="0.14"
                    />
                    <circle
                      cx={mx * SEL}
                      cy={my * SEL}
                      r="19"
                      fill={WARNA[w].terang}
                      stroke={WARNA[w].utama}
                      strokeWidth="2.5"
                    />
                    <circle
                      cx={mx * SEL}
                      cy={my * SEL}
                      r="11"
                      fill="none"
                      stroke={WARNA[w].utama}
                      strokeWidth="1"
                      opacity="0.5"
                    />
                  </g>
                ))}
                <text
                  x={kx * SEL + 3 * SEL}
                  y={ky * SEL + 6 * SEL - 9}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="800"
                  fill="#FFFFFF"
                  opacity="0.92"
                  fontFamily="inherit"
                  letterSpacing="2"
                >
                  {WARNA[w].nama.toUpperCase()}
                </text>
                {warnaGiliran === w ? (
                  <rect
                    className="ludo-markas-giliran"
                    x={kx * SEL + 2}
                    y={ky * SEL + 2}
                    width={6 * SEL - 4}
                    height={6 * SEL - 4}
                    rx="15"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="4"
                  />
                ) : null}
              </g>
            ))}

            {/* Lintasan 52 petak (ekstrusi) */}
            {KOORDINAT_LINTASAN.map(([x, y], i) => {
              const awal = (PETAK_AWAL as readonly number[]).indexOf(i);
              const aman = PETAK_AMAN.has(i);
              return (
                <g key={i}>
                  <Sel
                    x={x}
                    y={y}
                    id={awal >= 0 ? `ludo-sel-w${awal}` : "ludo-sel-putih"}
                    warnaAtas={awal >= 0 ? WARNA[awal].terang : "#FFFFFF"}
                    warnaSisi={awal >= 0 ? WARNA[awal].gelap : "#94A3B8"}
                    tepi={awal >= 0 ? WARNA[awal].gelap : "#CBD5E1"}
                  />
                  {aman && awal < 0 ? (
                    <Bintang
                      cx={x * SEL + SEL / 2}
                      cy={y * SEL + SEL / 2}
                      r={11}
                      fill="#F59E0B"
                      opacity={0.9}
                    />
                  ) : null}
                  {aman && awal < 0 ? (
                    <Bintang
                      cx={x * SEL + SEL / 2}
                      cy={y * SEL + SEL / 2 - 1}
                      r={6}
                      fill="#FDE68A"
                    />
                  ) : null}
                  {awal >= 0 ? (
                    <Bintang
                      cx={x * SEL + SEL / 2}
                      cy={y * SEL + SEL / 2}
                      r={9}
                      fill="#FFFFFF"
                      opacity={0.95}
                    />
                  ) : null}
                </g>
              );
            })}

            {/* Jalur rumah */}
            {KOORDINAT_JALUR_RUMAH.map((jalur, w) =>
              jalur.map(([x, y], i) => (
                <g key={`${w}-${i}`}>
                  <Sel
                    x={x}
                    y={y}
                    id={`ludo-rumah-w${w}`}
                    warnaAtas="#FFFFFF"
                    warnaSisi={WARNA[w].utama}
                    tepi={WARNA[w].utama}
                  />
                  <circle
                    cx={x * SEL + SEL / 2}
                    cy={y * SEL + SEL / 2}
                    r="3"
                    fill={WARNA[w].utama}
                    opacity="0.55"
                  />
                </g>
              )),
            )}

            {/* Pusat: piramida empat muka */}
            <rect
              x={6 * SEL}
              y={6 * SEL + TEBAL}
              width={3 * SEL}
              height={3 * SEL}
              rx="6"
              fill="#334155"
            />
            <rect
              x={6 * SEL}
              y={6 * SEL}
              width={3 * SEL}
              height={3 * SEL}
              rx="6"
              fill="#FFFFFF"
            />
            <polygon
              points={`${6 * SEL},${6 * SEL} ${6 * SEL},${9 * SEL} ${7.5 * SEL},${7.5 * SEL}`}
              fill={WARNA[0].utama}
            />
            <polygon
              points={`${6 * SEL},${6 * SEL} ${9 * SEL},${6 * SEL} ${7.5 * SEL},${7.5 * SEL}`}
              fill={WARNA[1].terang}
            />
            <polygon
              points={`${9 * SEL},${6 * SEL} ${9 * SEL},${9 * SEL} ${7.5 * SEL},${7.5 * SEL}`}
              fill={WARNA[2].utama}
            />
            <polygon
              points={`${6 * SEL},${9 * SEL} ${9 * SEL},${9 * SEL} ${7.5 * SEL},${7.5 * SEL}`}
              fill={WARNA[3].gelap}
            />
            <polygon
              points={`${6 * SEL},${6 * SEL} ${9 * SEL},${6 * SEL} ${7.5 * SEL},${7.5 * SEL}`}
              fill="#FFFFFF"
              opacity="0.25"
            />
            <polygon
              points={`${6 * SEL},${9 * SEL} ${9 * SEL},${9 * SEL} ${7.5 * SEL},${7.5 * SEL}`}
              fill="#000000"
              opacity="0.25"
            />
            <circle
              cx={7.5 * SEL}
              cy={7.5 * SEL + 2}
              r="15"
              fill="#000000"
              opacity="0.25"
            />
            <circle
              cx={7.5 * SEL}
              cy={7.5 * SEL}
              r="15"
              fill="#FDE68A"
              stroke="#F59E0B"
              strokeWidth="2.5"
              filter="url(#ludo-glow)"
            />
            <text
              x={7.5 * SEL}
              y={7.5 * SEL + 5}
              textAnchor="middle"
              fontSize="13"
              fontWeight="800"
              fill="#7C2D12"
              fontFamily="inherit"
            >
              🏠
            </text>

            {/* Sorot lampu + vignette */}
            <rect
              x="0"
              y="0"
              width={UKURAN}
              height={UKURAN}
              rx="16"
              fill="url(#ludo-sorot)"
              style={{ pointerEvents: "none" }}
            />
          </svg>

          {/* Bidak robot: berdiri tegak di atas papan (kontra-rotasi) */}
          {urutan.map((t) => {
            const p = pemain[t.pemain];
            const pos = posisiAkhir.get(t) ?? { x: t.x, y: t.y };
            const w = WARNA[t.warna];
            const lebar = t.diMarkas ? 30 : 34;
            return (
              <div
                key={`${t.pemain}-${t.token}`}
                style={{
                  position: "absolute",
                  left: pos.x,
                  top: pos.y,
                  width: 0,
                  height: 0,
                  transformStyle: "preserve-3d",
                  transition:
                    "left 460ms cubic-bezier(0.22, 1, 0.36, 1), top 460ms cubic-bezier(0.22, 1, 0.36, 1)",
                  zIndex: Math.round(pos.y),
                }}
              >
                {/* bayangan & cakram di lantai */}
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: -22,
                    top: -10,
                    width: 44,
                    height: 20,
                    borderRadius: "50%",
                    background: "rgba(2,6,23,0.42)",
                    filter: "blur(3px)",
                  }}
                />
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: -17,
                    top: -8,
                    width: 34,
                    height: 16,
                    borderRadius: "50%",
                    background: `radial-gradient(ellipse at 40% 35%, ${w.terang}, ${w.utama} 55%, ${w.gelap})`,
                    boxShadow: `0 0 0 2px #FFFFFF, 0 2px 0 ${w.gelap}`,
                  }}
                />
                {t.boleh ? (
                  <div
                    aria-hidden="true"
                    className="ludo-denyut"
                    style={{
                      position: "absolute",
                      left: -26,
                      top: -12,
                      width: 52,
                      height: 24,
                      borderRadius: "50%",
                      border: "3px solid #F59E0B",
                      boxShadow: "0 0 12px rgba(245,158,11,0.8)",
                    }}
                  />
                ) : null}
                {/* billboard tegak; pembungkus di-key posisi supaya animasi lompat diputar ulang tiap pindah petak */}
                <div
                  key={`${Math.round(pos.x)},${Math.round(pos.y)}`}
                  className="ludo-lompat"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: 0,
                    height: 0,
                    transformStyle: "preserve-3d",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => t.boleh && !sibuk && onGerak(t.token)}
                    disabled={!t.boleh || sibuk}
                    aria-label={
                      t.boleh
                        ? `Gerakkan robot ${p.robot.nama} nomor ${t.token + 1}`
                        : `Robot ${p.nama} nomor ${t.token + 1}`
                    }
                    className={cn(
                      "flex flex-col items-center",
                      t.boleh && !sibuk ? "cursor-pointer" : "cursor-default",
                      t.boleh ? "ludo-token-boleh" : "",
                    )}
                    style={{
                      position: "absolute",
                      left: -lebar / 2 - 4,
                      bottom: 2,
                      width: lebar + 8,
                      transform: `rotateX(-${MIRING}deg)`,
                      transformOrigin: "50% 100%",
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      filter: "drop-shadow(0 4px 3px rgba(0,0,0,0.35))",
                      opacity: t.diRumah ? 0.85 : 1,
                    }}
                  >
                    <RobotSvg
                      jenis={p.robot.jenis}
                      suasana="senang"
                      terpasang={p.robot.terpasang}
                      sparepart={p.robot.sparepart}
                      skin={p.robot.skin ?? null}
                      warna={p.robot.warna ?? null}
                      ukuran={lebar}
                      animasi={t.boleh}
                      vitalitas={t.boleh ? "semangat" : "normal"}
                    />
                    <span
                      style={{
                        marginTop: -6,
                        fontSize: 9,
                        fontWeight: 800,
                        lineHeight: 1,
                        color: "#FFFFFF",
                        background: w.gelap,
                        borderRadius: 999,
                        padding: "1px 5px",
                        border: "1px solid #FFFFFF",
                      }}
                    >
                      {t.token + 1}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Dadu kubus 3D
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
/** Muka kubus: nilai → transform muka; ROTASI: nilai → rotasi kubus agar muka itu di depan. */
const MUKA: [number, string][] = [
  [1, "translateZ(30px)"],
  [6, "rotateY(180deg) translateZ(30px)"],
  [3, "rotateY(90deg) translateZ(30px)"],
  [4, "rotateY(-90deg) translateZ(30px)"],
  [5, "rotateX(90deg) translateZ(30px)"],
  [2, "rotateX(-90deg) translateZ(30px)"],
];
const ROTASI: Record<number, string> = {
  1: "rotateX(-12deg) rotateY(14deg)",
  6: "rotateX(-12deg) rotateY(194deg)",
  3: "rotateX(-12deg) rotateY(-76deg)",
  4: "rotateX(-12deg) rotateY(104deg)",
  5: "rotateX(-102deg) rotateY(14deg)",
  2: "rotateX(78deg) rotateY(14deg)",
};

function MukaDadu({
  nilai,
  warna,
  transform,
}: {
  nilai: number;
  warna: string;
  transform: string;
}) {
  return (
    <div
      className="ludo-muka"
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 12,
        background:
          "linear-gradient(145deg, #FFFFFF 0%, #F1F5F9 55%, #CBD5E1 100%)",
        border: "1.5px solid #CBD5E1",
        transform,
        backfaceVisibility: "hidden",
      }}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full">
        {(PIP[nilai] ?? PIP[6]).map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="8.5" fill={warna} />
        ))}
      </svg>
    </div>
  );
}

export function Dadu({
  nilai,
  berputar,
  warna,
  onLempar,
  boleh,
}: {
  nilai: number | null;
  berputar: boolean;
  warna: string;
  onLempar: () => void;
  boleh: boolean;
}) {
  const akhir = ROTASI[nilai ?? 6] ?? ROTASI[6];
  return (
    <button
      type="button"
      onClick={onLempar}
      disabled={!boleh || berputar}
      aria-label={boleh ? "Lempar dadu" : `Dadu ${nilai ?? "-"}`}
      className={cn(
        "btn-tekan relative flex h-[84px] w-[84px] items-center justify-center rounded-2xl disabled:cursor-default",
        boleh && !berputar && "ludo-giliran",
      )}
      style={{
        perspective: 320,
        background:
          "radial-gradient(circle at 50% 30%, rgba(255,255,255,0.7), rgba(226,232,240,0.35))",
        boxShadow: "0 10px 24px rgba(15,23,42,0.22)",
      }}
    >
      <div
        className={cn("ludo-kubus", berputar && "ludo-kubus-putar")}
        style={{
          position: "relative",
          width: 60,
          height: 60,
          transformStyle: "preserve-3d",
          transform: berputar ? undefined : akhir,
          transition: berputar
            ? "none"
            : "transform 700ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {MUKA.map(([n, tr]) => (
          <MukaDadu key={n} nilai={n} warna={warna} transform={tr} />
        ))}
      </div>
      {boleh && !berputar ? (
        <span className="absolute -bottom-5 text-[10px] font-extrabold text-amber-500">
          KETUK!
        </span>
      ) : null}
    </button>
  );
}

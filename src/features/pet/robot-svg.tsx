"use client";

// ============================================================
// RobotSvg (Pet Robot, 3 Sep 2026) — gambar robot vektor yang sama dipakai
// di layar Pet, toko (pratinjau aksesoris), dan robot melayang beranda.
//   • jenis   : pria (biru-hitam, kepala bersudut, alis visor, inti bintang)
//               wanita (pink-putih, kepala bulat, bulu mata, pipi merona, inti hati)
//   • suasana : ekspresi wajah (senang/biasa/lapar/lelah/sedih/kotor/tidur)
//   • terpasang: aksesoris per slot (lihat lib/pet KATALOG_AKSESORIS)
// Animasi (opsional): goyang melayang, kedip, denyut inti, api jetpack,
// cincin aura berputar — semuanya CSS transform/opacity (ringan).
// ============================================================

import { useId, type CSSProperties } from "react";
import { PALET, type JenisRobot, type SlotAksesoris, type Suasana } from "@/lib/pet";

type Props = {
  jenis: JenisRobot;
  suasana?: Suasana;
  terpasang?: Partial<Record<SlotAksesoris, string>>;
  /** Lebar gambar (px); tinggi mengikuti rasio. */
  ukuran?: number;
  animasi?: boolean;
  className?: string;
  style?: CSSProperties;
};

const LEBAR = 220;
const TINGGI = 300;

export function RobotSvg({ jenis, suasana = "senang", terpasang = {}, ukuran = 200, animasi = true, className, style }: Props) {
  const p = PALET[jenis];
  const wanita = jenis === "wanita";
  const tidur = suasana === "tidur";
  // Id gradien unik per gambar (ada banyak robot di satu halaman).
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const g = (nama: string) => `url(#${id}-${nama})`;
  const kelas = (k: string) => (animasi ? k : undefined);

  const kepala = terpasang.kepala;
  const mata = terpasang.mata;
  const leher = terpasang.leher;
  const badan = terpasang.badan;
  const punggung = terpasang.punggung;
  const tangan = terpasang.tangan;
  const aura = terpasang.aura;

  return (
    <svg
      viewBox={`-10 -30 ${LEBAR} ${TINGGI}`}
      width={ukuran}
      height={Math.round((ukuran * TINGGI) / LEBAR)}
      className={className}
      style={style}
      role="img"
      aria-label={`Robot ${wanita ? "wanita" : "pria"}`}
    >
      <defs>
        <linearGradient id={`${id}-kepala`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.utama} />
          <stop offset="1" stopColor={p.utamaGelap} />
        </linearGradient>
        <linearGradient id={`${id}-badan`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.badan} />
          <stop offset="1" stopColor={p.badanGelap} />
        </linearGradient>
        <radialGradient id={`${id}-inti`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.35" stopColor={p.mata} />
          <stop offset="1" stopColor={p.mata} stopOpacity="0.15" />
        </radialGradient>
        <radialGradient id={`${id}-disc`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={p.mata} stopOpacity="0.75" />
          <stop offset="1" stopColor={p.mata} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-aura`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FDE68A" stopOpacity="0.55" />
          <stop offset="0.7" stopColor="#F59E0B" stopOpacity="0.25" />
          <stop offset="1" stopColor="#F59E0B" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-pesta`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F59E0B" />
          <stop offset="0.5" stopColor="#EC4899" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>

      {/* Aura emas (statis di belakang semuanya) */}
      {aura === "aura_emas" ? (
        <g>
          <circle cx="100" cy="130" r="122" fill={g("aura")} />
          <circle cx="100" cy="130" r="108" fill="none" stroke="#FCD34D" strokeWidth="2.5" strokeDasharray="10 16" opacity="0.8" className={kelas("pet-putar")} />
        </g>
      ) : null}

      {/* Piringan melayang (statis, robot bergoyang di atasnya) */}
      <ellipse cx="100" cy="250" rx="50" ry="11" fill={g("disc")} />
      <ellipse cx="100" cy="250" rx="28" ry="5" fill={p.mata} opacity="0.45" className={kelas("pet-denyut")} />

      <g className={kelas("pet-goyang")}>
        {/* Punggung: sayap / jetpack (di belakang badan) */}
        {punggung === "sayap" ? (
          <g>
            <path d="M58 134 Q10 108 6 162 Q30 150 34 178 Q48 172 60 192 Z" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="2" />
            <path d="M142 134 Q190 108 194 162 Q170 150 166 178 Q152 172 140 192 Z" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="2" />
          </g>
        ) : null}
        {punggung === "jetpack" ? (
          <g>
            <rect x="40" y="120" width="18" height="66" rx="9" fill="#6B7280" stroke="#374151" strokeWidth="2" />
            <rect x="142" y="120" width="18" height="66" rx="9" fill="#6B7280" stroke="#374151" strokeWidth="2" />
            <g className={kelas("pet-api")}>
              <polygon points="42,186 56,186 49,214" fill="#F97316" />
              <polygon points="45,186 53,186 49,204" fill="#60A5FA" />
            </g>
            <g className={kelas("pet-api")}>
              <polygon points="144,186 158,186 151,214" fill="#F97316" />
              <polygon points="147,186 155,186 151,204" fill="#60A5FA" />
            </g>
          </g>
        ) : null}
        {/* Jubah (di belakang badan) */}
        {badan === "jubah" ? (
          <g>
            <path d="M62 118 Q40 190 52 234 L100 216 L148 234 Q160 190 138 118 Z" fill="#7C3AED" opacity="0.95" />
            <ellipse cx="100" cy="118" rx="42" ry="10" fill="#A78BFA" />
          </g>
        ) : null}

        {/* Kaki */}
        <rect x="80" y="206" width="14" height="26" rx="7" fill={p.badanGelap} stroke={p.utamaGelap} strokeWidth="1.5" />
        <rect x="106" y="206" width="14" height="26" rx="7" fill={p.badanGelap} stroke={p.utamaGelap} strokeWidth="1.5" />
        <ellipse cx="87" cy="234" rx="12" ry="5" fill={p.aksen} stroke={p.utamaGelap} strokeWidth="1.5" />
        <ellipse cx="113" cy="234" rx="12" ry="5" fill={p.aksen} stroke={p.utamaGelap} strokeWidth="1.5" />

        {/* Badan */}
        <rect x="58" y="118" width="84" height="92" rx="24" fill={g("badan")} stroke={p.utamaGelap} strokeWidth="2" />
        <rect x="58" y="194" width="84" height="16" rx="8" fill={p.utama} opacity="0.9" />
        <circle cx="70" cy="202" r="3" fill={p.aksen} />
        <circle cx="130" cy="202" r="3" fill={p.aksen} />
        {/* Panel dada + inti */}
        <rect x="74" y="134" width="52" height="44" rx="12" fill={p.layar} />
        <circle cx="100" cy="156" r="12" fill={g("inti")} className={kelas("pet-denyut")} />
        {wanita ? (
          <path d="M100 162 l-6 -5.5 a3.5 3.5 0 1 1 6 -4 a3.5 3.5 0 1 1 6 4 z" fill="#FFFFFF" opacity="0.95" />
        ) : (
          <polygon points="100,149 102,154 107,154 103,157 104.5,162 100,159 95.5,162 97,157 93,154 98,154" fill="#FFFFFF" opacity="0.95" />
        )}

        {/* Badan: kaos / rompi (di depan badan) */}
        {badan === "kaos_pri" ? (
          <g>
            <rect x="60" y="122" width="80" height="62" rx="16" fill="#DC2626" />
            <rect x="52" y="124" width="12" height="22" rx="5" fill="#B91C1C" />
            <rect x="136" y="124" width="12" height="22" rx="5" fill="#B91C1C" />
            <text x="100" y="160" textAnchor="middle" fontSize="20" fontWeight="800" fill="#FFFFFF" fontFamily="inherit">
              PRI
            </text>
          </g>
        ) : null}
        {badan === "rompi" ? (
          <g>
            <rect x="60" y="124" width="32" height="60" rx="8" fill="#92400E" stroke="#78350F" strokeWidth="1.5" />
            <rect x="108" y="124" width="32" height="60" rx="8" fill="#92400E" stroke="#78350F" strokeWidth="1.5" />
            <circle cx="96" cy="150" r="2.5" fill="#FDE68A" />
            <circle cx="96" cy="166" r="2.5" fill="#FDE68A" />
          </g>
        ) : null}

        {/* Lengan */}
        <rect x="34" y="126" width="20" height="58" rx="10" fill={p.badanGelap} stroke={p.utamaGelap} strokeWidth="1.5" />
        <rect x="146" y="126" width="20" height="58" rx="10" fill={p.badanGelap} stroke={p.utamaGelap} strokeWidth="1.5" />
        <circle cx="44" cy="190" r="10" fill={p.utama} stroke={p.utamaGelap} strokeWidth="1.5" />
        <circle cx="156" cy="190" r="10" fill={p.utama} stroke={p.utamaGelap} strokeWidth="1.5" />

        {/* Tangan: balon / bendera (dipegang tangan kanan) */}
        {tangan === "balon" ? (
          <g>
            <line x1="156" y1="190" x2="176" y2="118" stroke="#9CA3AF" strokeWidth="2" />
            <ellipse cx="176" cy="98" rx="16" ry="21" fill="#EF4444" />
            <ellipse cx="170" cy="90" rx="4" ry="7" fill="#FFFFFF" opacity="0.4" />
            <polygon points="172,118 180,118 176,124" fill="#B91C1C" />
          </g>
        ) : null}
        {tangan === "bendera" ? (
          <g>
            <line x1="156" y1="190" x2="156" y2="94" stroke="#6B7280" strokeWidth="3" strokeLinecap="round" />
            <rect x="157" y="94" width="42" height="14" fill="#DC2626" />
            <rect x="157" y="108" width="42" height="14" fill="#F9FAFB" stroke="#D1D5DB" strokeWidth="1" />
          </g>
        ) : null}

        {/* Leher */}
        <rect x="86" y="104" width="28" height="16" rx="6" fill={p.aksenTerang} stroke={p.utamaGelap} strokeWidth="1.5" />
        {leher === "dasi_kupu" ? (
          <g>
            <polygon points="84,108 100,114 84,120" fill="#DC2626" />
            <polygon points="116,108 100,114 116,120" fill="#DC2626" />
            <circle cx="100" cy="114" r="4" fill="#7F1D1D" />
          </g>
        ) : null}
        {leher === "syal_merah" ? (
          <g>
            <rect x="80" y="104" width="40" height="18" rx="9" fill="#DC2626" />
            <path d="M106 120 l10 28 l-15 -5 z" fill="#B91C1C" />
          </g>
        ) : null}
        {leher === "kalung_bintang" ? (
          <g>
            <path d="M78 108 Q100 130 122 108" fill="none" stroke="#D4AF37" strokeWidth="2.5" />
            <polygon points="100,120 102.5,125.5 108,126 104,130 105,136 100,133 95,136 96,130 92,126 97.5,125.5" fill="#FCD34D" stroke="#D97706" strokeWidth="1" />
          </g>
        ) : null}

        {/* Kepala */}
        <rect x="40" y="18" width="120" height="90" rx={wanita ? 40 : 24} fill={g("kepala")} stroke={p.utamaGelap} strokeWidth="2" />
        <path d={wanita ? "M56 34 Q80 20 110 26" : "M52 34 Q80 22 112 26"} fill="none" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" opacity="0.22" />
        <circle cx="40" cy="63" r="9" fill={p.aksen} stroke={p.utamaGelap} strokeWidth="1.5" />
        <circle cx="160" cy="63" r="9" fill={p.aksen} stroke={p.utamaGelap} strokeWidth="1.5" />
        {/* Layar wajah */}
        <rect x="54" y="32" width="92" height="60" rx={wanita ? 24 : 14} fill={p.layar} />
        {!wanita ? <rect x="60" y="43" width="80" height="3" rx="1.5" fill={p.utama} opacity="0.55" /> : null}
        {wanita ? (
          <g opacity="0.55">
            <circle cx="62" cy="78" r="5" fill="#F472B6" />
            <circle cx="138" cy="78" r="5" fill="#F472B6" />
          </g>
        ) : null}

        {/* Mata */}
        {tidur ? (
          <g fill="none" stroke={p.mata} strokeWidth="3" strokeLinecap="round">
            <path d="M64 58 Q75 67 86 58" />
            <path d="M114 58 Q125 67 136 58" />
            <text x="150" y="30" fontSize="16" fontWeight="800" fill={p.mata} fontFamily="inherit" className={kelas("pet-denyut")}>
              z
            </text>
            <text x="160" y="16" fontSize="12" fontWeight="800" fill={p.mata} fontFamily="inherit" opacity="0.7">
              z
            </text>
          </g>
        ) : (
          <g className={kelas("pet-kedip")}>
            {wanita ? (
              <g>
                <circle cx="75" cy="60" r="9" fill={p.mata} />
                <circle cx="125" cy="60" r="9" fill={p.mata} />
                <circle cx="78" cy="57" r="3" fill="#FFFFFF" />
                <circle cx="128" cy="57" r="3" fill="#FFFFFF" />
                <g stroke={p.mata} strokeWidth="2" strokeLinecap="round">
                  <line x1="66" y1="50" x2="63" y2="45" />
                  <line x1="75" y1="48" x2="75" y2="43" />
                  <line x1="84" y1="50" x2="87" y2="45" />
                  <line x1="116" y1="50" x2="113" y2="45" />
                  <line x1="125" y1="48" x2="125" y2="43" />
                  <line x1="134" y1="50" x2="137" y2="45" />
                </g>
              </g>
            ) : (
              <g>
                <rect x="64" y="50" width="22" height="16" rx="5" fill={p.mata} />
                <rect x="114" y="50" width="22" height="16" rx="5" fill={p.mata} />
                <circle cx="71" cy="55" r="3" fill="#FFFFFF" opacity="0.9" />
                <circle cx="121" cy="55" r="3" fill="#FFFFFF" opacity="0.9" />
              </g>
            )}
          </g>
        )}

        {/* Mulut sesuai suasana */}
        <g fill="none" stroke={p.mata} strokeWidth="3" strokeLinecap="round">
          {suasana === "senang" ? <path d="M82 78 Q100 92 118 78" /> : null}
          {suasana === "biasa" ? <path d="M86 82 H114" /> : null}
          {suasana === "sedih" ? <path d="M82 86 Q100 74 118 86" /> : null}
          {suasana === "lelah" ? <path d="M88 84 Q100 80 112 84" /> : null}
          {suasana === "kotor" ? <path d="M80 82 q6 -6 12 0 t12 0 t12 0" /> : null}
          {suasana === "tidur" ? <path d="M90 84 H110" /> : null}
        </g>
        {suasana === "lapar" ? <ellipse cx="100" cy="82" rx="9" ry="7" fill={p.mata} opacity="0.9" /> : null}
        {suasana === "kotor" ? (
          <g fill="#78716C" opacity="0.55">
            <circle cx="70" cy="40" r="4" />
            <circle cx="132" cy="96" r="5" />
            <circle cx="66" cy="150" r="4" />
          </g>
        ) : null}

        {/* Mata: kacamata / monokel */}
        {mata === "kacamata_bulat" ? (
          <g fill="none" stroke="#92400E" strokeWidth="3">
            <circle cx="75" cy="60" r="14" />
            <circle cx="125" cy="60" r="14" />
            <path d="M89 60 H111" />
            <path d="M61 60 H54" />
            <path d="M139 60 H146" />
          </g>
        ) : null}
        {mata === "kacamata_hitam" ? (
          <g>
            <rect x="58" y="50" width="34" height="20" rx="6" fill="#111827" opacity="0.92" />
            <rect x="108" y="50" width="34" height="20" rx="6" fill="#111827" opacity="0.92" />
            <path d="M92 58 H108" stroke="#111827" strokeWidth="3" />
            <path d="M63 55 H75" stroke="#FFFFFF" strokeWidth="2" opacity="0.35" strokeLinecap="round" />
            <path d="M113 55 H125" stroke="#FFFFFF" strokeWidth="2" opacity="0.35" strokeLinecap="round" />
          </g>
        ) : null}
        {mata === "monokel" ? (
          <g fill="none" stroke="#D4AF37" strokeWidth="3">
            <circle cx="125" cy="60" r="14" />
            <path d="M137 68 q8 12 0 26" strokeWidth="2" />
          </g>
        ) : null}

        {/* Antena */}
        <line x1="100" y1="18" x2="100" y2="-4" stroke={wanita ? p.utamaGelap : p.aksen} strokeWidth="4" strokeLinecap="round" />
        <circle cx="100" cy="-8" r="7" fill={p.utama} stroke={p.utamaGelap} strokeWidth="1.5" className={kelas("pet-denyut")} />

        {/* Kepala: topi / bandana / pita / mahkota */}
        {kepala === "topi_pesta" ? (
          <g>
            <polygon points="100,-26 76,20 124,20" fill={g("pesta")} />
            <polygon points="100,-26 90,-6 110,-6" fill="#FFFFFF" opacity="0.35" />
            <circle cx="100" cy="-26" r="6" fill="#FDE68A" stroke="#F59E0B" strokeWidth="1.5" />
          </g>
        ) : null}
        {kepala === "bandana" ? (
          <g>
            <rect x="38" y="22" width="124" height="14" rx="7" fill="#DC2626" />
            <circle cx="162" cy="29" r="6" fill="#B91C1C" />
            <path d="M166 29 l16 -9 l-3 12 z" fill="#DC2626" />
          </g>
        ) : null}
        {kepala === "pita_besar" ? (
          <g>
            <ellipse cx="140" cy="22" rx="15" ry="9" fill="#F472B6" transform="rotate(-20 140 22)" />
            <ellipse cx="166" cy="22" rx="15" ry="9" fill="#F472B6" transform="rotate(20 166 22)" />
            <circle cx="153" cy="22" r="6" fill="#BE185D" />
          </g>
        ) : null}
        {kepala === "topi_baseball" ? (
          <g>
            <path d="M46 26 Q100 -24 154 26 Z" fill="#2563EB" stroke="#1E3A8A" strokeWidth="1.5" />
            <ellipse cx="118" cy="26" rx="46" ry="8" fill="#1E3A8A" />
            <circle cx="100" cy="-2" r="4" fill="#1E3A8A" />
          </g>
        ) : null}
        {kepala === "mahkota" ? (
          <g>
            <polygon points="62,20 62,-10 78,6 100,-22 122,6 138,-10 138,20" fill="#F59E0B" stroke="#B45309" strokeWidth="2" strokeLinejoin="round" />
            <circle cx="78" cy="8" r="3" fill="#EF4444" />
            <circle cx="100" cy="-6" r="4" fill="#3B82F6" />
            <circle cx="122" cy="8" r="3" fill="#10B981" />
          </g>
        ) : null}
      </g>
    </svg>
  );
}

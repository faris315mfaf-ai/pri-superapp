"use client";

// ============================================================
// robot-aksesoris-v5.tsx — GAMBAR keluarga aksesoris KATALOG v5 (5 Sep 2026):
// slot KAKI (sepatu, bot, sandal, kaus kaki, LED, roda, pelindung lutut,
// roket), TANGAN (sarung tangan, gelang, jam, tameng, pedang LED, bola,
// raket), KEPALA (helm, mahkota bunga), JAKET PRI / TV Rakyat (7 gaya +
// kapten, dengan tulisan), dan 14 keluarga ITEM LANGKA.
//
// Koordinat RobotSvg (viewBox -10 -30 220 300): kepala x40–160 / y18–108,
// leher y104–120, badan x58–142 / y118–210, lengan kiri x34–54 (tangan ≈
// (44,190)), lengan kanan x146–166 (tangan ≈ (156,190)), kaki: dua tungkai
// x80–94 & x106–120 (y206–232) dengan telapak elips di (87,234) & (113,234).
// Semua gambar hanya SVG statis + kelas animasi CSS yang sudah ada
// (pet-denyut, pet-kilau, pet-putar, pet-kepak, pet-api-atas) — ringan.
// ============================================================

import type { ReactNode } from "react";
import { gelapkan, terangkan, type Aksesoris } from "@/lib/pet";

type Ctx = { kelas: (k: string) => string | undefined };

/** Sepasang sepatu dasar (dipakai kets/bot/LED/roda/roket). */
function sepatu(w: string, gelap: string, terang: string, tinggi: number, isi?: ReactNode) {
  return (
    <g>
      {[74, 100].map((x) => (
        <g key={x}>
          <path
            d={`M${x + 2} ${240 - tinggi} h16 q10 0 12 8 v6 q0 4 -4 4 h-26 q-3 0 -3 -3 v-${tinggi + 2} q0 -3 3 -3 z`}
            fill={w}
            stroke={gelap}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d={`M${x - 1} 254 h30`} stroke={gelap} strokeWidth="3" strokeLinecap="round" />
          <path d={`M${x + 4} ${244 - tinggi} h10`} stroke={terang} strokeWidth="1.5" opacity="0.7" />
          {isi}
        </g>
      ))}
    </g>
  );
}

function teksJaket(label: string, warnaTeks: string) {
  const panjang = label.length > 4;
  return (
    <text
      x="100"
      y={panjang ? 172 : 174}
      textAnchor="middle"
      fontSize={panjang ? 9.5 : 14}
      fontWeight="900"
      fontFamily="inherit"
      fill={warnaTeks}
      letterSpacing={panjang ? 0 : 1}
    >
      {label}
    </text>
  );
}

/** Dasar jaket: badan + lengan pendek di bahu; tiap gaya menambah pernik. */
function dasarJaket(w: string, gelap: string, terang: string, label: string, pernik: ReactNode, warnaTeks: string) {
  return (
    <g>
      <rect x="56" y="120" width="88" height="74" rx="14" fill={w} stroke={gelap} strokeWidth="1.5" />
      <rect x="46" y="124" width="16" height="30" rx="7" fill={w} stroke={gelap} strokeWidth="1.5" />
      <rect x="138" y="124" width="16" height="30" rx="7" fill={w} stroke={gelap} strokeWidth="1.5" />
      <path d="M100 124 V192" stroke={gelap} strokeWidth="2" strokeDasharray="4 3" opacity="0.8" />
      <path d="M66 190 h68" stroke={terang} strokeWidth="2" opacity="0.5" />
      {pernik}
      {teksJaket(label, warnaTeks)}
    </g>
  );
}

/**
 * Gambar keluarga v5; null bila `gambar` bukan milik v5 (penggambar lama
 * yang menangani). Dipanggil dari gambarAksesorisBaru (robot-aksesoris.tsx).
 */
export function gambarAksesorisV5(item: Aksesoris, { kelas }: Ctx): ReactNode | null {
  const w = item.warna ?? "#DC2626";
  const gelap = gelapkan(w, 0.35);
  const terang = terangkan(w, 0.35);
  const label = item.label ?? "";
  // Teks jaket: putih di jaket gelap, merah di jaket putih.
  const warnaTeks = w.toUpperCase() === "#F8FAFC" ? "#DC2626" : "#FFFFFF";

  switch (item.gambar) {
    // ================= KAKI =================
    case "kets":
      return sepatu(w, gelap, terang, 10, (
        <>
          <path d="M80 236 l4 -4 l4 4 l4 -4 M106 236 l4 -4 l4 4 l4 -4" stroke="#FFFFFF" strokeWidth="1.5" fill="none" />
          <path d="M77 240 h20 M103 240 h20" stroke="#FFFFFF" strokeWidth="2.5" opacity="0.9" />
        </>
      ));
    case "bot":
      return sepatu(w, gelap, terang, 20, (
        <>
          <path d="M78 224 h18 M104 224 h18 M78 230 h18 M104 230 h18" stroke={gelap} strokeWidth="1.5" opacity="0.7" />
          <path d="M74 252 h30 M100 252 h30" stroke="#78350F" strokeWidth="4" strokeLinecap="round" />
        </>
      ));
    case "sandal":
      return (
        <g>
          {[75, 101].map((x) => (
            <g key={x}>
              <path d={`M${x} 236 h26 q4 0 4 4 v4 q0 4 -4 4 h-26 q-4 0 -4 -4 v-4 q0 -4 4 -4 z`} fill={w} stroke={gelap} strokeWidth="1.5" />
              <path d={`M${x + 12} 236 l-8 -8 M${x + 12} 236 l10 -8`} stroke={gelap} strokeWidth="3" strokeLinecap="round" />
              <circle cx={x + 12} cy="236" r="2" fill={terang} />
            </g>
          ))}
        </g>
      );
    case "kauskaki":
      return (
        <g>
          {[80, 106].map((x) => (
            <g key={x}>
              <rect x={x - 1} y="212" width="16" height="22" rx="6" fill={w} stroke={gelap} strokeWidth="1.5" />
              <path d={`M${x} 216 h14 M${x} 221 h14`} stroke={terang} strokeWidth="2" opacity="0.8" />
              <rect x={x - 1} y="230" width="16" height="6" rx="3" fill={gelap} opacity="0.5" />
            </g>
          ))}
        </g>
      );
    case "sepatuled":
      return sepatu(w, gelap, terang, 10, (
        <>
          <path d="M72 250 h32 M98 250 h32" stroke={terang} strokeWidth="3" strokeLinecap="round" className={kelas("pet-denyut")} />
          <circle cx="84" cy="236" r="2" fill="#FFFFFF" className={kelas("pet-kilau")} />
          <circle cx="112" cy="236" r="2" fill="#FFFFFF" className={kelas("pet-kilau")} style={{ animationDelay: "0.4s" }} />
        </>
      ));
    case "sepaturoda":
      return (
        <g>
          {sepatu(w, gelap, terang, 12)}
          {[78, 92, 104, 118].map((x, i) => (
            <g key={x}>
              <circle cx={x} cy="258" r="5" fill="#374151" stroke="#111827" strokeWidth="1" className={kelas("pet-putar")} style={{ transformBox: "fill-box", transformOrigin: "center", animationDelay: `${i * 0.1}s` }} />
              <circle cx={x} cy="258" r="1.6" fill={terang} />
            </g>
          ))}
        </g>
      );
    case "pelindunglutut":
      return (
        <g>
          {[87, 113].map((x) => (
            <g key={x}>
              <ellipse cx={x} cy="216" rx="10" ry="8" fill={w} stroke={gelap} strokeWidth="1.5" />
              <path d={`M${x - 6} 216 h12`} stroke={terang} strokeWidth="2" opacity="0.7" />
              <path d={`M${x - 10} 210 h20 M${x - 10} 222 h20`} stroke={gelap} strokeWidth="2" opacity="0.5" />
            </g>
          ))}
        </g>
      );
    case "sepaturoket":
      return (
        <g>
          {sepatu(w, gelap, terang, 12, (
            <path d="M78 232 h6 v6 h-6 z M104 232 h6 v6 h-6 z" fill="#9CA3AF" stroke="#4B5563" strokeWidth="1" />
          ))}
          {[72, 98].map((x) => (
            <g key={x} className={kelas("pet-api-atas")} style={{ transformBox: "fill-box", transformOrigin: "50% 0%" }}>
              <polygon points={`${x},246 ${x + 8},246 ${x + 4},266`} fill="#F97316" opacity="0.9" />
              <polygon points={`${x + 2},246 ${x + 6},246 ${x + 4},258`} fill="#FDE047" />
            </g>
          ))}
        </g>
      );

    // ================= TANGAN =================
    case "sarungtangan":
      return (
        <g>
          {[44, 156].map((x) => (
            <g key={x}>
              <circle cx={x} cy="190" r="12" fill={w} stroke={gelap} strokeWidth="1.5" />
              <path d={`M${x - 8} 182 h16`} stroke={terang} strokeWidth="2.5" opacity="0.8" />
              <path d={`M${x - 3} 194 v6 M${x + 3} 194 v6`} stroke={gelap} strokeWidth="1.2" opacity="0.6" />
            </g>
          ))}
        </g>
      );
    case "gelang":
      return (
        <g>
          {[44, 156].map((x) => (
            <g key={x}>
              <rect x={x - 12} y="172" width="24" height="8" rx="4" fill={w} stroke={gelap} strokeWidth="1.5" />
              <rect x={x - 9} y="174" width="18" height="2.5" rx="1" fill={terang} opacity="0.8" />
            </g>
          ))}
        </g>
      );
    case "jamtangan":
      return (
        <g>
          <rect x="32" y="170" width="24" height="10" rx="4" fill={gelap} />
          <rect x="36" y="164" width="16" height="22" rx="4" fill={w} stroke={gelap} strokeWidth="1.5" />
          <rect x="39" y="168" width="10" height="14" rx="2" fill="#0F172A" />
          <path d="M41 173 h6 M41 177 h4" stroke="#22D3EE" strokeWidth="1.5" className={kelas("pet-denyut")} />
        </g>
      );
    case "tameng":
      return (
        <g>
          <path d="M18 138 Q44 128 70 138 V176 Q44 208 18 176 Z" fill={w} stroke={gelap} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M26 144 Q44 136 62 144 V172 Q44 194 26 172 Z" fill="none" stroke={terang} strokeWidth="2" opacity="0.7" />
          <polygon points="44,148 47,158 57,158 49,164 52,174 44,168 36,174 39,164 31,158 41,158" fill="#FDE047" stroke="#A16207" strokeWidth="1" />
        </g>
      );
    case "pedangled":
      return (
        <g>
          <rect x="152" y="176" width="8" height="24" rx="3" fill="#374151" stroke="#111827" strokeWidth="1" />
          <rect x="146" y="172" width="20" height="6" rx="3" fill="#9CA3AF" />
          <rect x="153" y="96" width="6" height="78" rx="3" fill={w} opacity="0.95" className={kelas("pet-denyut")} />
          <rect x="155" y="100" width="2" height="70" rx="1" fill="#FFFFFF" opacity="0.9" />
          <rect x="150" y="94" width="12" height="82" rx="6" fill={w} opacity="0.25" />
        </g>
      );
    case "bolasepak":
      return (
        <g>
          <circle cx="170" cy="192" r="14" fill="#F8FAFC" stroke="#111827" strokeWidth="1.5" />
          <polygon points="170,184 177,189 174,197 166,197 163,189" fill="#111827" />
          <path d="M170 184 v-6 M177 189 l6 -3 M174 197 l4 6 M166 197 l-4 6 M163 189 l-6 -3" stroke="#111827" strokeWidth="1.5" />
        </g>
      );
    case "bolabasket":
      return (
        <g>
          <circle cx="170" cy="192" r="14" fill={w} stroke={gelap} strokeWidth="1.5" />
          <path d="M156 192 h28 M170 178 v28 M160 182 q10 10 20 20 M160 202 q10 -10 20 -20" stroke={gelap} strokeWidth="1.5" fill="none" />
        </g>
      );
    case "raket":
      return (
        <g>
          <rect x="153" y="164" width="7" height="34" rx="3" fill="#78350F" stroke="#451A03" strokeWidth="1" />
          <ellipse cx="156" cy="136" rx="17" ry="24" fill="#FDE68A" opacity="0.5" stroke={w} strokeWidth="3.5" />
          <path d="M143 126 h26 M143 136 h26 M143 146 h26 M148 116 v40 M156 112 v48 M164 116 v40" stroke="#E5E7EB" strokeWidth="0.8" opacity="0.9" />
        </g>
      );

    // ================= KEPALA =================
    case "helm":
      return (
        <g>
          <path d="M38 62 Q100 -18 162 62 V70 Q100 58 38 70 Z" fill={w} stroke={gelap} strokeWidth="2" />
          <path d="M60 30 Q100 6 140 30" fill="none" stroke={terang} strokeWidth="3" opacity="0.7" />
          <path d="M52 66 Q100 78 148 66 V86 Q100 96 52 86 Z" fill="#0F172A" opacity="0.75" />
          <path d="M58 70 Q100 80 142 70" fill="none" stroke="#67E8F9" strokeWidth="1.5" opacity="0.7" />
        </g>
      );
    case "mahkotabunga":
      return (
        <g>
          <path d="M44 34 Q100 18 156 34" fill="none" stroke="#16A34A" strokeWidth="4" strokeLinecap="round" />
          {[52, 72, 92, 112, 132, 150].map((x, i) => {
            const y = 26 + Math.abs(i - 2.5) * 2.4;
            const c = i % 2 ? terang : w;
            return (
              <g key={x}>
                {[0, 72, 144, 216, 288].map((r) => (
                  <ellipse key={r} cx={x} cy={y - 5} rx="3.2" ry="5" fill={c} transform={`rotate(${r} ${x} ${y})`} />
                ))}
                <circle cx={x} cy={y} r="2.5" fill="#FDE047" />
              </g>
            );
          })}
        </g>
      );

    // ================= JAKET PRI / TV RAKYAT =================
    case "jaket_bomber":
      return dasarJaket(w, gelap, terang, label, (
        <>
          <rect x="60" y="186" width="80" height="8" rx="3" fill={gelap} opacity="0.6" />
          <path d="M66 190 h68" stroke={terang} strokeWidth="1" strokeDasharray="2 2" />
          <path d="M84 120 h32 v8 h-32 z" fill={gelap} opacity="0.7" />
          <rect x="46" y="146" width="16" height="8" rx="3" fill={gelap} opacity="0.6" />
          <rect x="138" y="146" width="16" height="8" rx="3" fill={gelap} opacity="0.6" />
        </>
      ), warnaTeks);
    case "jaket_hoodie":
      return dasarJaket(w, gelap, terang, label, (
        <>
          <path d="M70 128 Q100 100 130 128 Q100 140 70 128 Z" fill={gelap} opacity="0.55" />
          <path d="M92 132 v14 M108 132 v14" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity="0.9" />
          <rect x="70" y="176" width="60" height="12" rx="4" fill={gelap} opacity="0.35" />
        </>
      ), warnaTeks);
    case "jaket_varsity":
      return dasarJaket(w, gelap, terang, label, (
        <>
          <rect x="46" y="124" width="16" height="30" rx="7" fill="#1F2937" />
          <rect x="138" y="124" width="16" height="30" rx="7" fill="#1F2937" />
          <circle cx="100" cy="134" r="1.8" fill="#1F2937" />
          <circle cx="100" cy="146" r="1.8" fill="#1F2937" />
          <circle cx="100" cy="158" r="1.8" fill="#1F2937" />
          <rect x="60" y="188" width="80" height="6" rx="3" fill="#1F2937" opacity="0.8" />
        </>
      ), warnaTeks);
    case "jaket_parka":
      return dasarJaket(w, gelap, terang, label, (
        <>
          <path d="M64 124 Q100 148 136 124" fill="none" stroke="#D6D3D1" strokeWidth="9" strokeLinecap="round" />
          <path d="M64 124 Q100 148 136 124" fill="none" stroke="#F5F5F4" strokeWidth="5" strokeLinecap="round" strokeDasharray="2 3" />
          <rect x="64" y="166" width="16" height="14" rx="3" fill={gelap} opacity="0.5" />
          <rect x="120" y="166" width="16" height="14" rx="3" fill={gelap} opacity="0.5" />
        </>
      ), warnaTeks);
    case "jaket_windbreaker":
      return dasarJaket(w, gelap, terang, label, (
        <>
          <path d="M60 140 h80 M60 148 h80" stroke={terang} strokeWidth="2.5" opacity="0.9" />
          <path d="M60 144 h80" stroke="#111827" strokeWidth="1.5" opacity="0.5" />
          <rect x="97" y="122" width="6" height="70" rx="2" fill="#374151" opacity="0.8" />
          <rect x="96" y="184" width="8" height="6" rx="2" fill="#9CA3AF" />
        </>
      ), warnaTeks);
    case "jaket_blazer":
      return dasarJaket(w, gelap, terang, label, (
        <>
          <polygon points="84,120 100,144 116,120" fill="#F8FAFC" opacity="0.95" />
          <polygon points="84,120 100,144 92,134" fill={gelap} opacity="0.5" />
          <polygon points="116,120 100,144 108,134" fill={gelap} opacity="0.5" />
          <circle cx="104" cy="160" r="1.8" fill={gelap} />
          <circle cx="104" cy="170" r="1.8" fill={gelap} />
          <rect x="120" y="150" width="12" height="4" rx="1" fill="#F8FAFC" opacity="0.8" />
        </>
      ), warnaTeks);
    case "jaket_denim":
      return dasarJaket(w, gelap, terang, label, (
        <>
          <path d="M60 126 h80 M60 190 h80" stroke="#FDE68A" strokeWidth="1" strokeDasharray="2 2" opacity="0.9" />
          <rect x="64" y="134" width="14" height="12" rx="2" fill="none" stroke="#FDE68A" strokeWidth="1" />
          <rect x="122" y="134" width="14" height="12" rx="2" fill="none" stroke="#FDE68A" strokeWidth="1" />
          <circle cx="100" cy="132" r="2" fill="#CA8A04" />
          <circle cx="100" cy="184" r="2" fill="#CA8A04" />
        </>
      ), warnaTeks);
    case "jaket_kapten":
      return dasarJaket(w, gelap, terang, label, (
        <>
          <rect x="46" y="124" width="16" height="6" rx="2" fill="#EAB308" stroke="#A16207" strokeWidth="1" />
          <rect x="138" y="124" width="16" height="6" rx="2" fill="#EAB308" stroke="#A16207" strokeWidth="1" />
          <circle cx="76" cy="140" r="6" fill="#EAB308" stroke="#A16207" strokeWidth="1" />
          <polygon points="76,135 77.5,139 82,139 78.5,141.5 80,146 76,143 72,146 73.5,141.5 70,139 74.5,139" fill="#FEF3C7" />
          <path d="M60 188 h80" stroke="#EAB308" strokeWidth="3" />
        </>
      ), warnaTeks);

    // ================= LANGKA =================
    case "sayapapi":
      return (
        <g>
          <g className={kelas("pet-kepak")}>
            <path d="M58 130 Q-4 70 -6 176 Q22 148 30 192 Q46 176 62 200 Z" fill={w} opacity="0.92" stroke={gelap} strokeWidth="2" strokeLinejoin="round" />
            <path d="M52 140 Q14 110 6 160" fill="none" stroke={terang} strokeWidth="3" opacity="0.8" />
            <path d="M48 154 Q26 140 22 172" fill="none" stroke="#FFFFFF" strokeWidth="1.5" opacity="0.6" />
          </g>
          <g className={kelas("pet-kepak-kanan")}>
            <path d="M142 130 Q204 70 206 176 Q178 148 170 192 Q154 176 138 200 Z" fill={w} opacity="0.92" stroke={gelap} strokeWidth="2" strokeLinejoin="round" />
            <path d="M148 140 Q186 110 194 160" fill="none" stroke={terang} strokeWidth="3" opacity="0.8" />
            <path d="M152 154 Q174 140 178 172" fill="none" stroke="#FFFFFF" strokeWidth="1.5" opacity="0.6" />
          </g>
          {[10, 190, 24, 176].map((x, i) => (
            <circle key={x} cx={x} cy={i < 2 ? 120 : 190} r="3" fill={terang} className={kelas("pet-kilau")} style={{ animationDelay: `${i * 0.3}s` }} />
          ))}
        </g>
      );
    case "mahkotapermata":
      return (
        <g>
          <path d="M46 44 L60 12 L78 36 L100 4 L122 36 L140 12 L154 44 Z" fill="#EAB308" stroke="#A16207" strokeWidth="2" strokeLinejoin="round" />
          <rect x="46" y="40" width="108" height="12" rx="4" fill="#CA8A04" stroke="#A16207" strokeWidth="1.5" />
          <polygon points="100,12 110,26 100,40 90,26" fill={w} stroke={gelap} strokeWidth="1" className={kelas("pet-denyut")} />
          <circle cx="60" cy="18" r="4" fill={w} />
          <circle cx="140" cy="18" r="4" fill={w} />
          {[58, 80, 100, 120, 142].map((x) => <circle key={x} cx={x} cy="46" r="2.5" fill={terang} />)}
          <circle cx="100" cy="20" r="2.5" fill="#FFFFFF" className={kelas("pet-kilau")} />
        </g>
      );
    case "auralangka":
      return (
        <g>
          <circle cx="100" cy="130" r="126" fill={w} opacity="0.08" />
          <circle cx="100" cy="130" r="116" fill="none" stroke={w} strokeWidth="6" strokeDasharray="30 12" opacity="0.7" className={kelas("pet-putar")} style={{ transformBox: "fill-box", transformOrigin: "center" }} />
          <circle cx="100" cy="130" r="104" fill="none" stroke={terang} strokeWidth="2" strokeDasharray="6 10" opacity="0.8" className={kelas("pet-putar")} style={{ transformBox: "fill-box", transformOrigin: "center", animationDirection: "reverse" }} />
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <polygon key={deg} points="100,4 104,14 100,24 96,14" fill={terang} transform={`rotate(${deg} 100 130)`} className={kelas("pet-kilau")} style={{ animationDelay: `${deg / 600}s` }} />
          ))}
        </g>
      );
    case "helmastronot":
      return (
        <g>
          <ellipse cx="100" cy="60" rx="66" ry="60" fill="#DBEAFE" opacity="0.28" stroke={w} strokeWidth="4" />
          <path d="M48 40 Q100 -20 152 40" fill="none" stroke="#FFFFFF" strokeWidth="4" opacity="0.6" />
          <rect x="60" y="104" width="80" height="14" rx="6" fill={w} stroke={gelap} strokeWidth="1.5" />
          <circle cx="72" cy="111" r="3" fill="#22D3EE" className={kelas("pet-denyut")} />
          <circle cx="128" cy="111" r="3" fill="#F87171" className={kelas("pet-denyut")} />
          {[60, 130, 150].map((x, i) => <circle key={x} cx={x} cy={i === 0 ? 30 : i === 1 ? 20 : 70} r="1.5" fill="#FFFFFF" className={kelas("pet-kilau")} style={{ animationDelay: `${i * 0.4}s` }} />)}
        </g>
      );
    case "topengnaga":
      return (
        <g>
          <path d="M52 52 Q100 36 148 52 L146 90 Q100 100 54 90 Z" fill={w} stroke={gelap} strokeWidth="2" strokeLinejoin="round" />
          <polygon points="58,52 44,20 72,46" fill={gelap} stroke={gelap} strokeWidth="1" />
          <polygon points="142,52 156,20 128,46" fill={gelap} stroke={gelap} strokeWidth="1" />
          <ellipse cx="80" cy="70" rx="10" ry="6" fill="#FDE047" className={kelas("pet-denyut")} />
          <ellipse cx="120" cy="70" rx="10" ry="6" fill="#FDE047" className={kelas("pet-denyut")} />
          <path d="M84 86 l4 6 l4 -6 l4 6 l4 -6 l4 6 l4 -6" fill="none" stroke="#FFFFFF" strokeWidth="1.5" />
        </g>
      );
    case "jubahraja":
      return (
        <g>
          <path d="M54 124 Q100 116 146 124 L156 214 Q100 226 44 214 Z" fill={w} stroke={gelap} strokeWidth="2" strokeLinejoin="round" />
          <path d="M60 130 Q100 150 140 130" fill="none" stroke="#F5F5F4" strokeWidth="9" strokeLinecap="round" />
          <path d="M60 130 Q100 150 140 130" fill="none" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" strokeDasharray="2 3" />
          <circle cx="100" cy="146" r="6" fill="#EAB308" stroke="#A16207" strokeWidth="1.5" />
          <circle cx="100" cy="146" r="2.5" fill="#E11D48" />
          {[70, 100, 130].map((x) => <circle key={x} cx={x} cy="200" r="2" fill="#FFFFFF" opacity="0.8" />)}
        </g>
      );
    case "pedanglegenda":
      return (
        <g>
          <rect x="152" y="178" width="8" height="26" rx="3" fill="#EAB308" stroke="#A16207" strokeWidth="1" />
          <path d="M142 176 h28 l-4 -6 h-20 z" fill="#EAB308" stroke="#A16207" strokeWidth="1" />
          <polygon points="151,170 161,170 158,84 156,74 154,84" fill={w} stroke={gelap} strokeWidth="1" className={kelas("pet-denyut")} />
          <path d="M156 164 V90" stroke="#FFFFFF" strokeWidth="1.5" opacity="0.8" />
          <polygon points="147,172 165,172 160,80 156,66 152,80" fill={w} opacity="0.25" />
          <circle cx="156" cy="72" r="3" fill={terang} className={kelas("pet-kilau")} />
        </g>
      );
    case "sepatuterbang":
      return (
        <g>
          {sepatu(w, gelap, terang, 10, (
            <path d="M80 240 h14 M106 240 h14" stroke="#FFFFFF" strokeWidth="2" opacity="0.8" />
          ))}
          {[68, 126].map((x, i) => (
            <g key={x} className={kelas(i === 0 ? "pet-kepak" : "pet-kepak-kanan")} style={{ transformBox: "fill-box", transformOrigin: i === 0 ? "100% 50%" : "0% 50%" }}>
              <path d={i === 0 ? "M72 240 Q52 222 48 240 Q56 238 60 246 Q66 242 72 248 Z" : "M128 240 Q148 222 152 240 Q144 238 140 246 Q134 242 128 248 Z"} fill="#FFFFFF" stroke={gelap} strokeWidth="1.2" />
            </g>
          ))}
        </g>
      );
    case "tamengnaga":
      return (
        <g>
          <path d="M14 134 Q44 122 74 134 V178 Q44 214 14 178 Z" fill={w} stroke={gelap} strokeWidth="3" strokeLinejoin="round" />
          {[144, 156, 168].map((y) => (
            <path key={y} d={`M22 ${y} q11 -6 22 0 q11 -6 22 0`} fill="none" stroke={gelap} strokeWidth="1.5" opacity="0.6" />
          ))}
          <circle cx="44" cy="164" r="9" fill="#FDE047" className={kelas("pet-denyut")} />
          <circle cx="44" cy="164" r="4" fill="#FFFFFF" />
          <polygon points="24,130 30,116 36,130" fill={gelap} />
          <polygon points="52,130 58,116 64,130" fill={gelap} />
        </g>
      );
    case "kalungpermata":
      return (
        <g>
          <path d="M74 108 Q100 142 126 108" fill="none" stroke="#EAB308" strokeWidth="4" />
          <path d="M74 108 Q100 142 126 108" fill="none" stroke="#FEF3C7" strokeWidth="1.5" strokeDasharray="2 3" />
          <polygon points="100,130 110,142 100,158 90,142" fill={w} stroke={gelap} strokeWidth="1.5" className={kelas("pet-denyut")} />
          <polygon points="100,133 106,142 100,151 94,142" fill={terang} opacity="0.7" />
          <circle cx="97" cy="138" r="1.8" fill="#FFFFFF" className={kelas("pet-kilau")} />
        </g>
      );
    case "sayapmalaikat":
      return (
        <g>
          <g className={kelas("pet-kepak")}>
            {[0, 1, 2].map((i) => (
              <path key={i} d={`M60 ${132 + i * 14} Q${8 - i * 4} ${104 + i * 18} ${8 + i * 6} ${168 + i * 10} Q${34 + i * 4} ${156 + i * 8} 62 ${180 + i * 6} Z`} fill={w} stroke={gelap} strokeWidth="1.5" opacity={0.95 - i * 0.15} />
            ))}
          </g>
          <g className={kelas("pet-kepak-kanan")}>
            {[0, 1, 2].map((i) => (
              <path key={i} d={`M140 ${132 + i * 14} Q${192 + i * 4} ${104 + i * 18} ${192 - i * 6} ${168 + i * 10} Q${166 - i * 4} ${156 + i * 8} 138 ${180 + i * 6} Z`} fill={w} stroke={gelap} strokeWidth="1.5" opacity={0.95 - i * 0.15} />
            ))}
          </g>
          <ellipse cx="100" cy="2" rx="26" ry="6" fill="none" stroke="#FDE047" strokeWidth="3" opacity="0.9" className={kelas("pet-denyut")} />
        </g>
      );
    case "rodapetir":
      return (
        <g>
          {[87, 113].map((x) => (
            <g key={x}>
              <circle cx={x} cy="238" r="14" fill="#1F2937" stroke={w} strokeWidth="3" />
              <circle cx={x} cy="238" r="7" fill={w} className={kelas("pet-putar")} style={{ transformBox: "fill-box", transformOrigin: "center" }} />
              <polygon points={`${x - 2},226 ${x + 4},236 ${x},236 ${x + 2},250 ${x - 4},240 ${x},240`} fill="#FFFFFF" className={kelas("pet-kilau")} />
            </g>
          ))}
          <path d="M70 224 l-8 -10 M130 224 l8 -10" stroke={w} strokeWidth="2.5" strokeLinecap="round" className={kelas("pet-kilau")} />
        </g>
      );
    case "jamemas":
      return (
        <g>
          <rect x="32" y="170" width="24" height="10" rx="4" fill="#A16207" />
          <rect x="35" y="163" width="18" height="24" rx="5" fill={w} stroke={gelap} strokeWidth="1.5" />
          <circle cx="44" cy="175" r="7" fill="#0F172A" />
          <path d="M44 175 v-4 M44 175 h3" stroke="#FDE047" strokeWidth="1.5" strokeLinecap="round" />
          {[38, 50].map((x) => <circle key={x} cx={x} cy="166" r="1.2" fill="#E0F2FE" className={kelas("pet-kilau")} />)}
        </g>
      );
    case "kacamatalaser":
      return (
        <g>
          <rect x="54" y="58" width="92" height="18" rx="6" fill="#0F172A" stroke={gelap} strokeWidth="1.5" />
          <rect x="60" y="63" width="80" height="8" rx="3" fill={w} opacity="0.9" className={kelas("pet-denyut")} />
          <path d="M46 66 h8 M146 66 h8" stroke={gelap} strokeWidth="3" />
          <path d="M140 67 L215 60" stroke={w} strokeWidth="1.5" opacity="0.6" className={kelas("pet-kilau")} />
          <path d="M140 67 L215 74" stroke={w} strokeWidth="1.5" opacity="0.6" className={kelas("pet-kilau")} style={{ animationDelay: "0.3s" }} />
        </g>
      );
    default:
      return null;
  }
}

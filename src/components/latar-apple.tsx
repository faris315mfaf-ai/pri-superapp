"use client";

// ============================================================
// LatarApple (6 Okt 2026) — latar belakang ilustrasi desain Apple di
// belakang SETIAP layar (dipasang MeshBackground). Tiga suasana:
//   Pagi  — gunung & danau, terang cerah
//   Sore  — pantai senja
//   Malam — bulan & bintang (hanya di mode gelap)
// Versi lebar untuk layar landscape, versi potret untuk HP. Pergantian
// memudar (crossfade) — semua lapisan tetap terpasang, hanya opacity yang
// berubah, jadi tidak ada kedip. Di mode gelap Pagi & Sore diredupkan.
// ============================================================

import { useAppStore } from "@/hooks/use-app-store";
import { latarEfektif, useLatarApple, type Latar } from "@/hooks/use-latar-apple";

export function LatarApple() {
  const [latar] = useLatarApple();
  const gelap = useAppStore((s) => s.tema === "dark");
  const aktif = latarEfektif(latar, gelap);
  const op = (l: Latar) => (aktif === l ? 1 : 0);

  return (
    <div aria-hidden="true" className="latar-apple fixed inset-0 -z-10 overflow-hidden" style={{ background: "#0B1026" }}>
      <div className="latar-lapis" style={{ opacity: op("pagi") }}>
        <AdeganPagi />
      </div>
      <div className="latar-lapis" style={{ opacity: op("sore") }}>
        <AdeganSore />
      </div>
      <div className="latar-lapis" style={{ opacity: op("malam") }}>
        <AdeganMalam />
      </div>
      <div className="latar-lapis" style={{ opacity: gelap && aktif !== "malam" ? 1 : 0, background: "rgba(0,0,0,0.45)" }} />
    </div>
  );
}

// ------------------------------------------------------------ Pagi
function AdeganPagi() {
  return (
    <>
      <svg className="latar-lanskap" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="la-pg-langit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8CCBFF" />
            <stop offset="0.5" stopColor="#D6EDFF" />
            <stop offset="0.72" stopColor="#FFF4E4" />
          </linearGradient>
          <radialGradient id="la-pg-sinar" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#FFFBEA" stopOpacity="1" />
            <stop offset="0.3" stopColor="#FFF0BF" stopOpacity="0.75" />
            <stop offset="1" stopColor="#FFF0BF" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="la-pg-danau" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#C9E4F6" />
            <stop offset="1" stopColor="#86B7DE" />
          </linearGradient>
        </defs>
        <rect width="1440" height="900" fill="url(#la-pg-langit)" />
        <circle cx="1060" cy="300" r="240" fill="url(#la-pg-sinar)" />
        <circle cx="1060" cy="300" r="56" fill="#FFFDF2" />
        <path d="M0 520 Q 120 450 230 490 Q 330 420 430 380 Q 520 430 600 470 Q 700 400 790 360 Q 900 430 1000 460 Q 1110 400 1210 420 Q 1330 460 1440 430 L1440 640 L0 640 Z" fill="#C5DBEF" />
        <path d="M0 580 Q 150 500 280 540 Q 400 470 520 440 Q 640 520 760 560 Q 880 470 990 450 Q 1120 530 1240 520 Q 1350 500 1440 540 L1440 640 L0 640 Z" fill="#9FC0DF" />
        <path d="M0 640 L0 600 Q 200 560 380 610 Q 560 570 760 615 Q 960 575 1160 612 Q 1320 590 1440 605 L1440 640 Z" fill="#7AA3CB" />
        <rect y="640" width="1440" height="260" fill="url(#la-pg-danau)" />
        <path d="M0 580 Q 150 500 280 540 Q 400 470 520 440 Q 640 520 760 560 Q 880 470 990 450 Q 1120 530 1240 520 Q 1350 500 1440 540 L1440 640 L0 640 Z" fill="#9FC0DF" opacity="0.28" transform="translate(0 1280) scale(1 -1)" />
        <rect x="1000" y="668" width="120" height="3" rx="1.5" fill="#FFFDF2" opacity="0.8" />
        <rect x="1020" y="690" width="80" height="3" rx="1.5" fill="#FFFDF2" opacity="0.6" />
        <rect x="1036" y="712" width="48" height="3" rx="1.5" fill="#FFFDF2" opacity="0.45" />
        <rect x="180" y="740" width="220" height="2" rx="1" fill="#FFFFFF" opacity="0.45" />
        <rect x="560" y="790" width="160" height="2" rx="1" fill="#FFFFFF" opacity="0.35" />
        <rect x="1180" y="820" width="200" height="2" rx="1" fill="#FFFFFF" opacity="0.35" />
      </svg>
      <svg className="latar-potret" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="la-pgp-langit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8CCBFF" />
            <stop offset="0.48" stopColor="#D6EDFF" />
            <stop offset="0.68" stopColor="#FFF4E4" />
          </linearGradient>
          <radialGradient id="la-pgp-sinar" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#FFFBEA" stopOpacity="1" />
            <stop offset="0.3" stopColor="#FFF0BF" stopOpacity="0.75" />
            <stop offset="1" stopColor="#FFF0BF" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="la-pgp-danau" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#C9E4F6" />
            <stop offset="1" stopColor="#86B7DE" />
          </linearGradient>
        </defs>
        <rect width="390" height="844" fill="url(#la-pgp-langit)" />
        <circle cx="290" cy="210" r="120" fill="url(#la-pgp-sinar)" />
        <circle cx="290" cy="210" r="30" fill="#FFFDF2" />
        <path d="M0 500 Q 50 450 100 470 Q 150 410 200 400 Q 250 440 290 455 Q 340 420 390 430 L390 600 L0 600 Z" fill="#C5DBEF" />
        <path d="M0 545 Q 60 490 120 515 Q 180 470 240 480 Q 300 525 340 515 Q 370 505 390 520 L390 600 L0 600 Z" fill="#9FC0DF" />
        <path d="M0 600 L0 572 Q 100 555 190 580 Q 290 560 390 575 L390 600 Z" fill="#7AA3CB" />
        <rect y="600" width="390" height="244" fill="url(#la-pgp-danau)" />
        <path d="M0 545 Q 60 490 120 515 Q 180 470 240 480 Q 300 525 340 515 Q 370 505 390 520 L390 600 L0 600 Z" fill="#9FC0DF" opacity="0.28" transform="translate(0 1200) scale(1 -1)" />
        <rect x="262" y="624" width="56" height="3" rx="1.5" fill="#FFFDF2" opacity="0.8" />
        <rect x="274" y="644" width="32" height="3" rx="1.5" fill="#FFFDF2" opacity="0.55" />
        <rect x="40" y="700" width="90" height="2" rx="1" fill="#FFFFFF" opacity="0.4" />
      </svg>
    </>
  );
}

// ------------------------------------------------------------ Sore
function AdeganSore() {
  return (
    <>
      <svg className="latar-lanskap" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="la-sr-langit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4E4583" />
            <stop offset="0.38" stopColor="#C96F97" />
            <stop offset="0.6" stopColor="#FFA57A" />
            <stop offset="0.66" stopColor="#FFD39A" />
          </linearGradient>
          <radialGradient id="la-sr-sinar" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#FFE7B0" stopOpacity="0.95" />
            <stop offset="1" stopColor="#FFB37A" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="la-sr-laut" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F2A27F" />
            <stop offset="0.5" stopColor="#B07595" />
            <stop offset="1" stopColor="#5E4F8E" />
          </linearGradient>
          <linearGradient id="la-sr-pasir" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F6D6B0" />
            <stop offset="1" stopColor="#E7B98A" />
          </linearGradient>
        </defs>
        <rect width="1440" height="900" fill="url(#la-sr-langit)" />
        <circle cx="760" cy="590" r="320" fill="url(#la-sr-sinar)" />
        <circle cx="760" cy="596" r="92" fill="#FFE6AE" />
        <rect y="596" width="1440" height="200" fill="url(#la-sr-laut)" />
        <rect x="660" y="606" width="200" height="4" rx="2" fill="#FFE6AE" opacity="0.85" />
        <rect x="690" y="624" width="140" height="4" rx="2" fill="#FFE6AE" opacity="0.7" />
        <rect x="712" y="644" width="96" height="4" rx="2" fill="#FFE6AE" opacity="0.55" />
        <rect x="730" y="666" width="60" height="3" rx="1.5" fill="#FFE6AE" opacity="0.4" />
        <rect x="742" y="690" width="36" height="3" rx="1.5" fill="#FFE6AE" opacity="0.3" />
        <path d="M0 772 C 240 742 480 800 720 782 S 1200 748 1440 784 L1440 900 L0 900 Z" fill="url(#la-sr-pasir)" />
        <path d="M0 772 C 240 742 480 800 720 782 S 1200 748 1440 784" fill="none" stroke="#FFFFFF" strokeWidth="3" opacity="0.7" />
        <path d="M150 900 C 160 800 190 700 238 600" fill="none" stroke="#3B2A4D" strokeWidth="14" strokeLinecap="round" />
        <path d="M238 600 C 190 560 130 560 80 590 C 140 575 190 585 238 600 Z" fill="#3B2A4D" />
        <path d="M238 600 C 220 545 180 515 120 512 C 175 530 210 560 238 600 Z" fill="#3B2A4D" />
        <path d="M238 600 C 270 545 320 528 380 540 C 320 548 280 570 238 600 Z" fill="#3B2A4D" />
        <path d="M238 600 C 290 590 340 610 372 650 C 330 625 285 612 238 600 Z" fill="#3B2A4D" />
        <path d="M238 600 C 250 550 248 512 228 478 C 254 512 258 556 238 600 Z" fill="#3B2A4D" />
        <path d="M1010 330 l 12 8 l 12 -8 M 1050 300 l 9 6 l 9 -6" fill="none" stroke="#4E3A63" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
      </svg>
      <svg className="latar-potret" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="la-srp-langit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4E4583" />
            <stop offset="0.38" stopColor="#C96F97" />
            <stop offset="0.58" stopColor="#FFA57A" />
            <stop offset="0.66" stopColor="#FFD39A" />
          </linearGradient>
          <radialGradient id="la-srp-sinar" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#FFE7B0" stopOpacity="0.95" />
            <stop offset="1" stopColor="#FFB37A" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="la-srp-laut" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F2A27F" />
            <stop offset="0.5" stopColor="#B07595" />
            <stop offset="1" stopColor="#5E4F8E" />
          </linearGradient>
          <linearGradient id="la-srp-pasir" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F6D6B0" />
            <stop offset="1" stopColor="#E7B98A" />
          </linearGradient>
        </defs>
        <rect width="390" height="844" fill="url(#la-srp-langit)" />
        <circle cx="210" cy="556" r="170" fill="url(#la-srp-sinar)" />
        <circle cx="210" cy="560" r="54" fill="#FFE6AE" />
        <rect y="560" width="390" height="160" fill="url(#la-srp-laut)" />
        <rect x="160" y="570" width="100" height="3" rx="1.5" fill="#FFE6AE" opacity="0.85" />
        <rect x="176" y="588" width="68" height="3" rx="1.5" fill="#FFE6AE" opacity="0.65" />
        <rect x="190" y="606" width="40" height="3" rx="1.5" fill="#FFE6AE" opacity="0.45" />
        <path d="M0 712 C 80 696 170 726 260 712 S 360 700 390 714 L390 844 L0 844 Z" fill="url(#la-srp-pasir)" />
        <path d="M0 712 C 80 696 170 726 260 712 S 360 700 390 714" fill="none" stroke="#FFFFFF" strokeWidth="2.5" opacity="0.7" />
        <path d="M30 844 C 34 760 48 680 74 600" fill="none" stroke="#3B2A4D" strokeWidth="9" strokeLinecap="round" />
        <path d="M74 600 C 50 578 18 578 -6 594 C 24 586 50 590 74 600 Z" fill="#3B2A4D" />
        <path d="M74 600 C 64 568 42 552 12 550 C 40 560 60 576 74 600 Z" fill="#3B2A4D" />
        <path d="M74 600 C 92 568 120 558 152 564 C 120 570 96 582 74 600 Z" fill="#3B2A4D" />
        <path d="M74 600 C 102 594 128 606 146 628 C 124 614 100 606 74 600 Z" fill="#3B2A4D" />
      </svg>
    </>
  );
}

// ------------------------------------------------------------ Malam
const BINTANG_LEBAR: [number, number, number, number][] = [
  [80, 60, 1.4, 0.9], [190, 140, 1, 0.6], [260, 40, 1.8, 1], [340, 210, 1.1, 0.7], [420, 90, 1.3, 0.8],
  [520, 170, 0.9, 0.5], [600, 60, 1.6, 0.9], [690, 250, 1, 0.6], [760, 120, 1.2, 0.75], [850, 40, 1, 0.6],
  [910, 300, 1.4, 0.7], [960, 110, 0.9, 0.5], [1190, 80, 1.5, 0.85], [1260, 190, 1, 0.6], [1330, 60, 1.8, 0.95],
  [1400, 260, 1.1, 0.65], [130, 320, 1, 0.5], [300, 380, 1.3, 0.6], [470, 300, 1, 0.55], [560, 420, 0.8, 0.4],
  [820, 380, 1.1, 0.55], [1220, 360, 1, 0.5], [1360, 420, 0.9, 0.45], [40, 450, 1, 0.4], [1000, 420, 0.8, 0.4],
  [700, 140, 2.2, 1], [1150, 330, 2, 0.9], [380, 130, 2, 0.9],
];
const BINTANG_POTRET: [number, number, number, number][] = [
  [30, 60, 1.2, 0.9], [80, 140, 0.9, 0.6], [130, 40, 1.6, 1], [170, 210, 1, 0.7], [210, 90, 1.2, 0.8],
  [240, 280, 0.8, 0.5], [60, 300, 1.3, 0.7], [120, 380, 0.9, 0.5], [350, 300, 1.2, 0.7], [370, 70, 1, 0.6],
  [20, 430, 0.9, 0.45], [200, 420, 1, 0.5], [300, 400, 0.8, 0.45], [100, 240, 2, 0.95], [330, 250, 1.8, 0.9],
];

function AdeganMalam() {
  return (
    <>
      <svg className="latar-lanskap" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="la-ml-langit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#060A1E" />
            <stop offset="0.55" stopColor="#121A45" />
            <stop offset="0.75" stopColor="#262E68" />
          </linearGradient>
          <radialGradient id="la-ml-sinar" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#F4EDCB" stopOpacity="0.35" />
            <stop offset="1" stopColor="#F4EDCB" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="la-ml-air" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1A2257" />
            <stop offset="1" stopColor="#070B22" />
          </linearGradient>
          <mask id="la-ml-sabit">
            <rect width="1440" height="900" fill="#FFFFFF" />
            <circle cx="1086" cy="208" r="58" fill="#000000" />
          </mask>
        </defs>
        <rect width="1440" height="900" fill="url(#la-ml-langit)" />
        <g fill="#FFFFFF" className="latar-bintang">
          {BINTANG_LEBAR.map(([x, y, r, o], i) => (
            <circle key={i} cx={x} cy={y} r={r} opacity={o} />
          ))}
        </g>
        <path d="M300 190 l 120 40" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" opacity="0.45" />
        <circle cx="1060" cy="230" r="230" fill="url(#la-ml-sinar)" />
        <circle cx="1060" cy="230" r="62" fill="#F4EDCB" mask="url(#la-ml-sabit)" />
        <path d="M0 640 Q 160 560 320 600 Q 470 540 620 590 Q 780 610 900 570 Q 1060 530 1220 590 Q 1340 610 1440 580 L1440 680 L0 680 Z" fill="#161D47" />
        <path d="M0 680 L0 650 Q 200 620 400 660 Q 640 630 860 664 Q 1100 640 1300 660 Q 1380 655 1440 650 L1440 680 Z" fill="#0D1333" />
        <rect y="680" width="1440" height="220" fill="url(#la-ml-air)" />
        <rect x="1010" y="700" width="100" height="3" rx="1.5" fill="#F4EDCB" opacity="0.5" />
        <rect x="1030" y="722" width="60" height="3" rx="1.5" fill="#F4EDCB" opacity="0.35" />
        <rect x="1044" y="744" width="32" height="2" rx="1" fill="#F4EDCB" opacity="0.25" />
      </svg>
      <svg className="latar-potret" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="la-mlp-langit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#060A1E" />
            <stop offset="0.55" stopColor="#121A45" />
            <stop offset="0.74" stopColor="#262E68" />
          </linearGradient>
          <radialGradient id="la-mlp-sinar" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#F4EDCB" stopOpacity="0.35" />
            <stop offset="1" stopColor="#F4EDCB" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="la-mlp-air" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1A2257" />
            <stop offset="1" stopColor="#070B22" />
          </linearGradient>
          <mask id="la-mlp-sabit">
            <rect width="390" height="844" fill="#FFFFFF" />
            <circle cx="304" cy="160" r="38" fill="#000000" />
          </mask>
        </defs>
        <rect width="390" height="844" fill="url(#la-mlp-langit)" />
        <g fill="#FFFFFF" className="latar-bintang">
          {BINTANG_POTRET.map(([x, y, r, o], i) => (
            <circle key={i} cx={x} cy={y} r={r} opacity={o} />
          ))}
        </g>
        <path d="M40 180 l 70 24" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" opacity="0.4" />
        <circle cx="290" cy="172" r="130" fill="url(#la-mlp-sinar)" />
        <circle cx="290" cy="172" r="40" fill="#F4EDCB" mask="url(#la-mlp-sabit)" />
        <path d="M0 610 Q 60 570 120 590 Q 190 560 250 585 Q 320 600 390 575 L390 650 L0 650 Z" fill="#161D47" />
        <path d="M0 650 L0 628 Q 100 610 200 634 Q 300 618 390 630 L390 650 Z" fill="#0D1333" />
        <rect y="650" width="390" height="194" fill="url(#la-mlp-air)" />
        <rect x="262" y="670" width="56" height="3" rx="1.5" fill="#F4EDCB" opacity="0.5" />
        <rect x="276" y="690" width="28" height="2" rx="1" fill="#F4EDCB" opacity="0.3" />
      </svg>
    </>
  );
}

// ------------------------------------------------------------ Gambar mini untuk pemilih
export function GambarMiniLatar({ latar }: { latar: Latar }) {
  if (latar === "classic") {
    // Tampilan asli aplikasi: latar mesh lembut, kartu kaca, aksen merah.
    return (
      <svg viewBox="0 0 90 120" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <defs>
          <filter id="lm-cl-kabur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
        </defs>
        <rect width="90" height="120" fill="#F1F5F9" />
        <g filter="url(#lm-cl-kabur)">
          <circle cx="10" cy="14" r="26" fill="#F43F5E" opacity="0.45" />
          <circle cx="84" cy="34" r="24" fill="#FB923C" opacity="0.4" />
          <circle cx="16" cy="104" r="26" fill="#93C5FD" opacity="0.55" />
          <circle cx="80" cy="96" r="18" fill="#F0ABFC" opacity="0.4" />
        </g>
        <rect x="10" y="16" width="70" height="26" rx="6" fill="#DC2626" />
        <rect x="16" y="23" width="30" height="4" rx="2" fill="#FFFFFF" opacity="0.9" />
        <rect x="16" y="31" width="20" height="3" rx="1.5" fill="#FFFFFF" opacity="0.6" />
        <rect x="10" y="50" width="70" height="22" rx="6" fill="#FFFFFF" opacity="0.75" />
        <rect x="16" y="57" width="34" height="3" rx="1.5" fill="#0F172A" opacity="0.5" />
        <rect x="16" y="63" width="22" height="3" rx="1.5" fill="#64748B" opacity="0.45" />
        <rect x="10" y="78" width="70" height="22" rx="6" fill="#FFFFFF" opacity="0.75" />
        <rect x="16" y="85" width="28" height="3" rx="1.5" fill="#0F172A" opacity="0.5" />
        <rect x="16" y="91" width="40" height="3" rx="1.5" fill="#64748B" opacity="0.45" />
        <rect x="14" y="106" width="62" height="10" rx="5" fill="#FFFFFF" opacity="0.8" />
        <rect x="38" y="107.5" width="14" height="7" rx="3.5" fill="#DC2626" />
      </svg>
    );
  }
  if (latar === "pagi") {
    return (
      <svg viewBox="0 0 90 120" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="lm-pg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8CCBFF" />
            <stop offset="0.55" stopColor="#E4F3FF" />
            <stop offset="0.68" stopColor="#FFF4E4" />
          </linearGradient>
        </defs>
        <rect width="90" height="120" fill="url(#lm-pg)" />
        <circle cx="66" cy="30" r="7" fill="#FFFDF2" />
        <path d="M0 70 Q 20 56 36 62 Q 52 48 68 54 Q 80 58 90 56 L90 82 L0 82 Z" fill="#A9C7E3" />
        <path d="M0 82 L0 76 Q 45 70 90 78 L90 82 Z" fill="#7AA3CB" />
        <rect y="82" width="90" height="38" fill="#A9D0EC" />
        <rect x="58" y="88" width="16" height="2" rx="1" fill="#FFFDF2" opacity="0.8" />
      </svg>
    );
  }
  if (latar === "sore") {
    return (
      <svg viewBox="0 0 90 120" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="lm-sr" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4E4583" />
            <stop offset="0.45" stopColor="#E07F92" />
            <stop offset="0.64" stopColor="#FFD39A" />
          </linearGradient>
        </defs>
        <rect width="90" height="120" fill="url(#lm-sr)" />
        <circle cx="46" cy="78" r="12" fill="#FFE6AE" />
        <rect y="78" width="90" height="22" fill="#C27C92" />
        <rect x="36" y="82" width="20" height="2" rx="1" fill="#FFE6AE" opacity="0.8" />
        <path d="M0 98 C 30 94 60 102 90 97 L90 120 L0 120 Z" fill="#F2CFA6" />
        <path d="M10 120 C 12 106 16 96 22 86" fill="none" stroke="#3B2A4D" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M22 86 C 14 82 6 82 0 86 C 8 84 16 85 22 86 Z M22 86 C 28 80 36 79 42 81 C 34 82 28 84 22 86 Z" fill="#3B2A4D" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 90 120" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id="lm-ml" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#060A1E" />
          <stop offset="0.7" stopColor="#232B62" />
        </linearGradient>
        <mask id="lm-ml-sabit">
          <rect width="90" height="120" fill="#FFFFFF" />
          <circle cx="68" cy="26" r="9" fill="#000000" />
        </mask>
      </defs>
      <rect width="90" height="120" fill="url(#lm-ml)" />
      <g fill="#FFFFFF">
        <circle cx="12" cy="16" r="0.9" />
        <circle cx="30" cy="40" r="0.7" opacity="0.7" />
        <circle cx="44" cy="14" r="1" />
        <circle cx="20" cy="60" r="0.7" opacity="0.6" />
        <circle cx="80" cy="58" r="0.8" opacity="0.7" />
      </g>
      <circle cx="64" cy="29" r="10" fill="#F4EDCB" mask="url(#lm-ml-sabit)" />
      <path d="M0 84 Q 20 74 40 80 Q 66 72 90 80 L90 90 L0 90 Z" fill="#161D47" />
      <rect y="90" width="90" height="30" fill="#0F1638" />
      <rect x="56" y="94" width="16" height="2" rx="1" fill="#F4EDCB" opacity="0.45" />
    </svg>
  );
}

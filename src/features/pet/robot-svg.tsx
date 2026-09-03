"use client";

// ============================================================
// RobotSvg (Pet Robot v2, 3 Sep 2026) — gambar robot vektor yang sama dipakai
// di layar Pet, toko (pratinjau item), robot melayang beranda, dan profil chat.
//   • jenis     : pria (biru-hitam) / wanita (pink-putih)
//   • suasana   : ekspresi wajah (senang/biasa/lapar/lelah/sedih/kotor/tidur)
//   • vitalitas : animasi tubuh dari energi & kenyang (7 ragam, lib/pet)
//   • sparepart : bentuk kepala/mata/tubuh/kaki/tangan (30 varian)
//   • terpasang : aksesoris per slot (30 item)
//   • menyapa   : lengan kanan melambai (profil chat)
//   • makan     : mulut mengunyah
// Semua animasi CSS transform/opacity (ringan); kelas ada di globals.css.
// ============================================================

import { useId, type CSSProperties } from "react";
import { PALET, type BagianSparepart, type JenisRobot, type SlotAksesoris, type Suasana, type Vitalitas } from "@/lib/pet";

type Props = {
  jenis: JenisRobot;
  suasana?: Suasana;
  vitalitas?: Vitalitas;
  terpasang?: Partial<Record<SlotAksesoris, string>>;
  sparepart?: Partial<Record<BagianSparepart, string>>;
  /** Lebar gambar (px); tinggi mengikuti rasio. */
  ukuran?: number;
  animasi?: boolean;
  menyapa?: boolean;
  makan?: boolean;
  className?: string;
  style?: CSSProperties;
};

const LEBAR = 220;
const TINGGI = 300;

const KELAS_VITALITAS: Record<Vitalitas, string> = {
  normal: "pet-goyang",
  lemas: "pet-lemas",
  lapar: "pet-lapar",
  lelah: "pet-lelah",
  keroncongan: "pet-keroncongan",
  semangat: "pet-semangat",
  tidur: "pet-tidur",
};

function Bintang({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) {
  const titik: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    titik.push(`${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`);
  }
  return <polygon points={titik.join(" ")} fill={fill} />;
}

function Hati({ cx, cy, s, fill, stroke }: { cx: number; cy: number; s: number; fill: string; stroke?: string }) {
  // Hati simetris berpusat (cx, cy) dengan "jari-jari" s.
  const d = `M${cx} ${cy + s * 0.9} L${cx - s} ${cy} A${s * 0.5} ${s * 0.5} 0 0 1 ${cx} ${cy - s * 0.5} A${s * 0.5} ${s * 0.5} 0 0 1 ${cx + s} ${cy} Z`;
  return <path d={d} fill={fill} stroke={stroke} strokeWidth={stroke ? 2.5 : 0} strokeLinejoin="round" />;
}

export function RobotSvg({
  jenis,
  suasana = "senang",
  vitalitas = "normal",
  terpasang = {},
  sparepart = {},
  ukuran = 200,
  animasi = true,
  menyapa = false,
  makan = false,
  className,
  style,
}: Props) {
  const p = PALET[jenis];
  const wanita = jenis === "wanita";
  const tidur = suasana === "tidur";
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const g = (nama: string) => `url(#${id}-${nama})`;
  const kelas = (k: string) => (animasi ? k : undefined);

  const { kepala, mata, leher, badan, punggung, tangan, aura } = terpasang;
  const spKepala = sparepart.kepala ?? "";
  const spMata = sparepart.mata ?? "";
  const spTubuh = sparepart.tubuh ?? "";
  const spKaki = sparepart.kaki ?? "";
  const spTangan = sparepart.tangan ?? "";
  const kelasTubuh = kelas(tidur ? KELAS_VITALITAS.tidur : KELAS_VITALITAS[vitalitas]);

  // ---------- bagian: tubuh ----------
  const tubuh = (() => {
    switch (spTubuh) {
      case "tubuh_kapsul":
        return <rect x="58" y="118" width="84" height="92" rx="42" fill={g("badan")} stroke={p.utamaGelap} strokeWidth="2" />;
      case "tubuh_kotak":
        return (
          <g>
            <rect x="56" y="118" width="88" height="92" rx="8" fill={g("badan")} stroke={p.utamaGelap} strokeWidth="2" />
            {[62, 138].map((x) =>
              [124, 204].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.5" fill={p.aksenTerang} />),
            )}
          </g>
        );
      case "tubuh_armor":
        return (
          <g>
            <rect x="58" y="118" width="84" height="92" rx="16" fill={g("badan")} stroke={p.utamaGelap} strokeWidth="2" />
            <polygon points="50,118 78,112 84,130 56,136" fill={p.aksenTerang} stroke={p.utamaGelap} strokeWidth="1.5" />
            <polygon points="150,118 122,112 116,130 144,136" fill={p.aksenTerang} stroke={p.utamaGelap} strokeWidth="1.5" />
            <polygon points="66,186 134,186 128,206 72,206" fill={p.utama} opacity="0.8" />
          </g>
        );
      case "tubuh_bulat":
        return <ellipse cx="100" cy="164" rx="52" ry="48" fill={g("badan")} stroke={p.utamaGelap} strokeWidth="2" />;
      case "tubuh_tabung":
        return (
          <g>
            <rect x="60" y="118" width="80" height="92" rx="30" fill={g("badan")} stroke={p.utamaGelap} strokeWidth="2" />
            {[132, 152, 172, 192].map((y) => (
              <rect key={y} x="60" y={y} width="80" height="4" fill={p.utama} opacity="0.55" />
            ))}
          </g>
        );
      case "tubuh_jelly":
        return (
          <g>
            <rect x="58" y="118" width="84" height="92" rx="30" fill={p.mata} opacity="0.35" stroke={p.utamaGelap} strokeWidth="2" />
            <circle cx="76" cy="150" r="3" fill="#FFFFFF" className={kelas("pet-kilau")} />
            <circle cx="124" cy="186" r="2.5" fill="#FFFFFF" className={kelas("pet-kilau")} style={{ animationDelay: "0.5s" }} />
            <circle cx="86" cy="196" r="2" fill="#FFFFFF" className={kelas("pet-kilau")} style={{ animationDelay: "0.9s" }} />
          </g>
        );
      default:
        return (
          <g>
            <rect x="58" y="118" width="84" height="92" rx="24" fill={g("badan")} stroke={p.utamaGelap} strokeWidth="2" />
            <rect x="58" y="194" width="84" height="16" rx="8" fill={p.utama} opacity="0.9" />
            <circle cx="70" cy="202" r="3" fill={p.aksen} />
            <circle cx="130" cy="202" r="3" fill={p.aksen} />
          </g>
        );
    }
  })();

  // ---------- bagian: kaki ----------
  const kaki = (() => {
    switch (spKaki) {
      case "kaki_roda":
        return (
          <g>
            <rect x="80" y="204" width="40" height="8" rx="4" fill={p.badanGelap} />
            {[86, 114].map((cx) => (
              <g key={cx} className={kelas("pet-roda")}>
                <circle cx={cx} cy="224" r="14" fill={p.aksen} stroke={p.utamaGelap} strokeWidth="2" />
                <circle cx={cx} cy="224" r="5" fill={p.utama} />
                <path d={`M${cx - 12} 224 H${cx + 12} M${cx} 212 V236`} stroke={p.utamaGelap} strokeWidth="2" />
              </g>
            ))}
          </g>
        );
      case "kaki_roket":
        return (
          <g>
            <polygon points="82,206 118,206 108,234 92,234" fill="#6B7280" stroke="#374151" strokeWidth="2" />
            <g className={kelas("pet-api")}>
              <polygon points="90,234 110,234 100,256" fill="#F97316" />
              <polygon points="95,234 105,234 100,248" fill="#60A5FA" />
            </g>
          </g>
        );
      case "kaki_kucing":
        return (
          <g>
            <rect x="80" y="206" width="14" height="22" rx="7" fill={p.badanGelap} stroke={p.utamaGelap} strokeWidth="1.5" />
            <rect x="106" y="206" width="14" height="22" rx="7" fill={p.badanGelap} stroke={p.utamaGelap} strokeWidth="1.5" />
            {[87, 113].map((cx) => (
              <g key={cx}>
                <ellipse cx={cx} cy="232" rx="13" ry="7" fill={p.aksen} stroke={p.utamaGelap} strokeWidth="1.5" />
                <circle cx={cx - 6} cy="230" r="2" fill="#F472B6" />
                <circle cx={cx} cy="229" r="2" fill="#F472B6" />
                <circle cx={cx + 6} cy="230" r="2" fill="#F472B6" />
              </g>
            ))}
          </g>
        );
      case "kaki_tank":
        return (
          <g>
            <rect x="58" y="208" width="84" height="26" rx="13" fill="#374151" stroke="#111827" strokeWidth="2" />
            {[72, 90, 108, 126].map((cx) => (
              <circle key={cx} cx={cx} cy="221" r="7" fill="#9CA3AF" stroke="#111827" strokeWidth="1.5" className={kelas("pet-roda")} />
            ))}
          </g>
        );
      case "kaki_pegas":
        return (
          <g fill="none" stroke={p.utamaGelap} strokeWidth="3" strokeLinecap="round">
            <path d="M87 206 l-6 5 l12 5 l-12 5 l12 5 l-6 5" />
            <path d="M113 206 l-6 5 l12 5 l-12 5 l12 5 l-6 5" />
            <ellipse cx="87" cy="234" rx="12" ry="5" fill={p.aksen} />
            <ellipse cx="113" cy="234" rx="12" ry="5" fill={p.aksen} />
          </g>
        );
      case "kaki_hover":
        return (
          <g>
            <ellipse cx="100" cy="214" rx="34" ry="8" fill={p.utama} opacity="0.85" />
            <ellipse cx="100" cy="226" rx="26" ry="6" fill={p.mata} opacity="0.55" className={kelas("pet-denyut")} />
          </g>
        );
      default:
        return (
          <g>
            <rect x="80" y="206" width="14" height="26" rx="7" fill={p.badanGelap} stroke={p.utamaGelap} strokeWidth="1.5" />
            <rect x="106" y="206" width="14" height="26" rx="7" fill={p.badanGelap} stroke={p.utamaGelap} strokeWidth="1.5" />
            <ellipse cx="87" cy="234" rx="12" ry="5" fill={p.aksen} stroke={p.utamaGelap} strokeWidth="1.5" />
            <ellipse cx="113" cy="234" rx="12" ry="5" fill={p.aksen} stroke={p.utamaGelap} strokeWidth="1.5" />
          </g>
        );
    }
  })();

  // ---------- bagian: tangan (kiri statis, kanan bisa melambai) ----------
  const lenganKiri = (() => {
    switch (spTangan) {
      case "tangan_capit":
        return (
          <g>
            <rect x="34" y="126" width="20" height="54" rx="10" fill={p.badanGelap} stroke={p.utamaGelap} strokeWidth="1.5" />
            <polygon points="36,178 52,178 44,200" fill={p.utama} stroke={p.utamaGelap} strokeWidth="1.5" />
            <polygon points="30,176 40,176 34,196" fill={p.utama} stroke={p.utamaGelap} strokeWidth="1.5" />
          </g>
        );
      case "tangan_tinju":
        return (
          <g>
            <rect x="34" y="126" width="20" height="54" rx="10" fill={p.badanGelap} stroke={p.utamaGelap} strokeWidth="1.5" />
            <circle cx="44" cy="190" r="15" fill="#DC2626" stroke="#7F1D1D" strokeWidth="2" />
          </g>
        );
      case "tangan_tentakel":
        return <path d="M44 128 q-20 16 -4 30 t-6 30 t8 24" fill="none" stroke={p.utama} strokeWidth="12" strokeLinecap="round" />;
      case "tangan_sayap":
        return <path d="M56 130 Q20 132 26 168 Q40 158 44 178 Q52 166 58 184 Z" fill={p.aksen} stroke={p.utamaGelap} strokeWidth="2" />;
      case "tangan_kuat":
        return (
          <g>
            <rect x="26" y="124" width="30" height="60" rx="15" fill={p.badanGelap} stroke={p.utamaGelap} strokeWidth="1.5" />
            <circle cx="41" cy="192" r="14" fill={p.utama} stroke={p.utamaGelap} strokeWidth="1.5" />
          </g>
        );
      default:
        return (
          <g>
            <rect x="34" y="126" width="20" height="58" rx="10" fill={p.badanGelap} stroke={p.utamaGelap} strokeWidth="1.5" />
            <circle cx="44" cy="190" r="10" fill={p.utama} stroke={p.utamaGelap} strokeWidth="1.5" />
          </g>
        );
    }
  })();
  const lenganKanan = (() => {
    switch (spTangan) {
      case "tangan_capit":
        return (
          <g>
            <rect x="146" y="126" width="20" height="54" rx="10" fill={p.badanGelap} stroke={p.utamaGelap} strokeWidth="1.5" />
            <polygon points="148,178 164,178 156,200" fill={p.utama} stroke={p.utamaGelap} strokeWidth="1.5" />
            <polygon points="160,176 170,176 166,196" fill={p.utama} stroke={p.utamaGelap} strokeWidth="1.5" />
          </g>
        );
      case "tangan_tinju":
        return (
          <g>
            <rect x="146" y="126" width="20" height="54" rx="10" fill={p.badanGelap} stroke={p.utamaGelap} strokeWidth="1.5" />
            <circle cx="156" cy="190" r="15" fill="#DC2626" stroke="#7F1D1D" strokeWidth="2" />
          </g>
        );
      case "tangan_tentakel":
        return <path d="M156 128 q20 16 4 30 t6 30 t-8 24" fill="none" stroke={p.utama} strokeWidth="12" strokeLinecap="round" />;
      case "tangan_sayap":
        return <path d="M144 130 Q180 132 174 168 Q160 158 156 178 Q148 166 142 184 Z" fill={p.aksen} stroke={p.utamaGelap} strokeWidth="2" />;
      case "tangan_laser":
        return (
          <g>
            <rect x="146" y="126" width="20" height="50" rx="10" fill={p.badanGelap} stroke={p.utamaGelap} strokeWidth="1.5" />
            <rect x="142" y="172" width="28" height="26" rx="6" fill="#374151" stroke="#111827" strokeWidth="1.5" />
            <circle cx="156" cy="202" r="6" fill="#F87171" className={kelas("pet-denyut")} />
          </g>
        );
      case "tangan_kuat":
        return (
          <g>
            <rect x="144" y="124" width="30" height="60" rx="15" fill={p.badanGelap} stroke={p.utamaGelap} strokeWidth="1.5" />
            <circle cx="159" cy="192" r="14" fill={p.utama} stroke={p.utamaGelap} strokeWidth="1.5" />
          </g>
        );
      default:
        return (
          <g>
            <rect x="146" y="126" width="20" height="58" rx="10" fill={p.badanGelap} stroke={p.utamaGelap} strokeWidth="1.5" />
            <circle cx="156" cy="190" r="10" fill={p.utama} stroke={p.utamaGelap} strokeWidth="1.5" />
          </g>
        );
    }
  })();

  // ---------- bagian: kepala ----------
  const kepalaBentuk = (() => {
    const rx = wanita ? 40 : 24;
    switch (spKepala) {
      case "kepala_kotak":
        return <rect x="40" y="18" width="120" height="90" rx="8" fill={g("kepala")} stroke={p.utamaGelap} strokeWidth="2" />;
      case "kepala_bulat":
        return <ellipse cx="100" cy="63" rx="62" ry="48" fill={g("kepala")} stroke={p.utamaGelap} strokeWidth="2" />;
      case "kepala_kucing":
        return (
          <g>
            <polygon points="48,34 56,-6 82,24" fill={g("kepala")} stroke={p.utamaGelap} strokeWidth="2" strokeLinejoin="round" />
            <polygon points="152,34 144,-6 118,24" fill={g("kepala")} stroke={p.utamaGelap} strokeWidth="2" strokeLinejoin="round" />
            <polygon points="56,26 60,4 74,22" fill="#F9A8D4" />
            <polygon points="144,26 140,4 126,22" fill="#F9A8D4" />
            <rect x="40" y="18" width="120" height="90" rx="30" fill={g("kepala")} stroke={p.utamaGelap} strokeWidth="2" />
          </g>
        );
      case "kepala_kubah":
        return (
          <g>
            <path d="M40 74 A60 56 0 0 1 160 74 V100 a8 8 0 0 1 -8 8 H48 a8 8 0 0 1 -8 -8 Z" fill={g("kepala")} stroke={p.utamaGelap} strokeWidth="2" />
            <path d="M52 60 Q70 26 106 26" fill="none" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" opacity="0.35" />
          </g>
        );
      case "kepala_segi6":
        return <polygon points="70,18 130,18 160,63 130,108 70,108 40,63" fill={g("kepala")} stroke={p.utamaGelap} strokeWidth="2" strokeLinejoin="round" />;
      case "kepala_tv":
        return (
          <g>
            <line x1="86" y1="18" x2="70" y2="-10" stroke={p.aksen} strokeWidth="3" strokeLinecap="round" />
            <line x1="114" y1="18" x2="130" y2="-10" stroke={p.aksen} strokeWidth="3" strokeLinecap="round" />
            <rect x="40" y="18" width="120" height="90" rx="10" fill={g("kepala")} stroke={p.utamaGelap} strokeWidth="2" />
            <circle cx="150" cy="82" r="4" fill={p.aksen} />
            <circle cx="150" cy="96" r="4" fill={p.aksen} />
          </g>
        );
      default:
        return (
          <g>
            <rect x="40" y="18" width="120" height="90" rx={rx} fill={g("kepala")} stroke={p.utamaGelap} strokeWidth="2" />
            <path d={wanita ? "M56 34 Q80 20 110 26" : "M52 34 Q80 22 112 26"} fill="none" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" opacity="0.22" />
          </g>
        );
    }
  })();

  // ---------- bagian: mata ----------
  const mataTerbuka = (() => {
    switch (spMata) {
      case "mata_bulat":
        return (
          <g>
            <circle cx="75" cy="60" r="13" fill={p.mata} />
            <circle cx="125" cy="60" r="13" fill={p.mata} />
            <circle cx="79" cy="56" r="4" fill="#FFFFFF" />
            <circle cx="129" cy="56" r="4" fill="#FFFFFF" />
          </g>
        );
      case "mata_kotak":
        return (
          <g>
            <rect x="64" y="49" width="22" height="22" rx="2" fill={p.mata} />
            <rect x="114" y="49" width="22" height="22" rx="2" fill={p.mata} />
            <rect x="68" y="53" width="6" height="6" fill="#FFFFFF" />
            <rect x="118" y="53" width="6" height="6" fill="#FFFFFF" />
          </g>
        );
      case "mata_visor":
        return (
          <g>
            <rect x="60" y="52" width="80" height="14" rx="7" fill={p.mata} />
            <rect x="66" y="55" width="26" height="4" rx="2" fill="#FFFFFF" opacity="0.7" />
          </g>
        );
      case "mata_bintang":
        return (
          <g>
            <Bintang cx={75} cy={60} r={13} fill={p.mata} />
            <Bintang cx={125} cy={60} r={13} fill={p.mata} />
          </g>
        );
      case "mata_hati":
        return (
          <g>
            <Hati cx={75} cy={60} s={11} fill={p.mata} />
            <Hati cx={125} cy={60} s={11} fill={p.mata} />
          </g>
        );
      case "mata_led":
        return (
          <g>
            {[72, 100, 128].map((cx, i) => (
              <circle key={cx} cx={cx} cy="60" r="7" fill={p.mata} className={kelas("pet-denyut")} style={{ animationDelay: `${i * 0.3}s` }} />
            ))}
          </g>
        );
      default:
        return wanita ? (
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
        );
    }
  })();

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
        <linearGradient id={`${id}-pelangi`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#EF4444" />
          <stop offset="0.2" stopColor="#F59E0B" />
          <stop offset="0.4" stopColor="#FDE047" />
          <stop offset="0.6" stopColor="#22C55E" />
          <stop offset="0.8" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#A855F7" />
        </linearGradient>
      </defs>

      {/* Aura (statis di belakang semuanya) */}
      {aura === "aura_emas" ? (
        <g>
          <circle cx="100" cy="130" r="122" fill={g("aura")} />
          <circle cx="100" cy="130" r="108" fill="none" stroke="#FCD34D" strokeWidth="2.5" strokeDasharray="10 16" opacity="0.8" className={kelas("pet-putar")} />
        </g>
      ) : null}
      {aura === "aura_pelangi" ? (
        <g>
          <circle cx="100" cy="130" r="112" fill="none" stroke={g("pelangi")} strokeWidth="7" opacity="0.85" strokeDasharray="60 18" className={kelas("pet-putar")} />
          <circle cx="100" cy="130" r="118" fill={g("pelangi")} opacity="0.08" />
        </g>
      ) : null}

      {/* Piringan melayang (statis, robot bergoyang di atasnya) */}
      <ellipse cx="100" cy="250" rx="50" ry="11" fill={g("disc")} />
      <ellipse cx="100" cy="250" rx="28" ry="5" fill={p.mata} opacity="0.45" className={kelas("pet-denyut")} />

      <g className={kelasTubuh}>
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
        {badan === "jubah" ? (
          <g>
            <path d="M62 118 Q40 190 52 234 L100 216 L148 234 Q160 190 138 118 Z" fill="#7C3AED" opacity="0.95" />
            <ellipse cx="100" cy="118" rx="42" ry="10" fill="#A78BFA" />
          </g>
        ) : null}

        {kaki}
        {tubuh}

        {/* Panel dada + inti */}
        <rect x="74" y="134" width="52" height="44" rx="12" fill={p.layar} />
        <circle cx="100" cy="156" r="12" fill={g("inti")} className={kelas("pet-denyut")} />
        {wanita ? (
          <path d="M100 162 l-6 -5.5 a3.5 3.5 0 1 1 6 -4 a3.5 3.5 0 1 1 6 4 z" fill="#FFFFFF" opacity="0.95" />
        ) : (
          <polygon points="100,149 102,154 107,154 103,157 104.5,162 100,159 95.5,162 97,157 93,154 98,154" fill="#FFFFFF" opacity="0.95" />
        )}

        {/* Badan: pakaian (di depan badan) */}
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
        {badan === "apron" ? (
          <g>
            <rect x="70" y="128" width="60" height="74" rx="10" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1.5" />
            <path d="M78 128 Q100 112 122 128" fill="none" stroke="#CBD5E1" strokeWidth="3" />
            <rect x="84" y="166" width="32" height="18" rx="4" fill="#E2E8F0" />
          </g>
        ) : null}
        {badan === "jas_hitam" ? (
          <g>
            <rect x="60" y="122" width="80" height="70" rx="14" fill="#111827" />
            <polygon points="100,124 84,124 92,156" fill="#F9FAFB" />
            <polygon points="100,124 116,124 108,156" fill="#F9FAFB" />
            <polygon points="84,124 100,124 92,148 76,140" fill="#1F2937" />
            <polygon points="116,124 100,124 108,148 124,140" fill="#1F2937" />
            <rect x="97" y="130" width="6" height="22" rx="3" fill="#B91C1C" />
          </g>
        ) : null}

        {/* Lengan */}
        {lenganKiri}
        <g className={menyapa ? kelas("pet-lambai") : undefined}>{lenganKanan}</g>

        {/* Tangan: barang di tangan kanan */}
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
        {tangan === "mic" ? (
          <g>
            <line x1="156" y1="190" x2="158" y2="152" stroke="#374151" strokeWidth="5" strokeLinecap="round" />
            <ellipse cx="159" cy="140" rx="9" ry="12" fill="#4B5563" stroke="#111827" strokeWidth="1.5" />
            <path d="M152 136 H166 M152 141 H166 M152 146 H166" stroke="#9CA3AF" strokeWidth="1.5" />
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
        {leher === "dasi_panjang" ? (
          <g>
            <rect x="94" y="108" width="12" height="8" rx="2" fill="#7F1D1D" />
            <polygon points="100,114 91,126 100,164 109,126" fill="#B91C1C" />
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
            <Bintang cx={100} cy={128} r={8} fill="#FCD34D" />
          </g>
        ) : null}
        {leher === "kalung_bunga" ? (
          <g>
            <path d="M72 110 Q100 140 128 110" fill="none" stroke="#16A34A" strokeWidth="3" />
            {[
              [78, 116, "#F472B6"],
              [89, 125, "#FDE047"],
              [100, 129, "#F472B6"],
              [111, 125, "#FDE047"],
              [122, 116, "#F472B6"],
            ].map(([cx, cy, w]) => (
              <circle key={String(cx)} cx={Number(cx)} cy={Number(cy)} r="5" fill={String(w)} stroke="#FFFFFF" strokeWidth="1" />
            ))}
          </g>
        ) : null}

        {/* Kepala */}
        {kepalaBentuk}
        {spKepala !== "kepala_bulat" && spKepala !== "kepala_segi6" ? (
          <g>
            <circle cx="40" cy="63" r="9" fill={p.aksen} stroke={p.utamaGelap} strokeWidth="1.5" />
            <circle cx="160" cy="63" r="9" fill={p.aksen} stroke={p.utamaGelap} strokeWidth="1.5" />
          </g>
        ) : null}
        {/* Layar wajah */}
        <rect x="54" y="32" width="92" height="60" rx={wanita ? 24 : 14} fill={p.layar} />
        {!wanita && !spMata ? <rect x="60" y="43" width="80" height="3" rx="1.5" fill={p.utama} opacity="0.55" /> : null}
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
          <g className={kelas("pet-kedip")}>{mataTerbuka}</g>
        )}

        {/* Mulut sesuai suasana / makan */}
        {makan ? (
          <ellipse cx="100" cy="82" rx="10" ry="8" fill={p.mata} opacity="0.9" className={kelas("pet-makan-mulut")} />
        ) : (
          <g fill="none" stroke={p.mata} strokeWidth="3" strokeLinecap="round">
            {suasana === "senang" ? <path d="M82 78 Q100 92 118 78" /> : null}
            {suasana === "biasa" ? <path d="M86 82 H114" /> : null}
            {suasana === "sedih" ? <path d="M82 86 Q100 74 118 86" /> : null}
            {suasana === "lelah" ? <path d="M88 84 Q100 80 112 84" /> : null}
            {suasana === "kotor" ? <path d="M80 82 q6 -6 12 0 t12 0 t12 0" /> : null}
            {suasana === "tidur" ? <path d="M90 84 H110" /> : null}
          </g>
        )}
        {!makan && suasana === "lapar" ? <ellipse cx="100" cy="82" rx="9" ry="7" fill={p.mata} opacity="0.9" /> : null}
        {suasana === "kotor" ? (
          <g fill="#78716C" opacity="0.55">
            <circle cx="70" cy="40" r="4" />
            <circle cx="132" cy="96" r="5" />
            <circle cx="66" cy="150" r="4" />
          </g>
        ) : null}
        {/* Tanda kondisi: keringat saat lemas, kilau saat semangat */}
        {!tidur && vitalitas === "lemas" ? <path d="M150 40 q6 10 0 14 q-6 -4 0 -14 z" fill="#60A5FA" opacity="0.85" /> : null}
        {!tidur && vitalitas === "semangat" ? (
          <g>
            <Bintang cx={30} cy={14} r={7} fill="#FDE047" />
            <Bintang cx={172} cy={0} r={5} fill="#FDE047" />
            <Bintang cx={178} cy={40} r={6} fill="#FDE047" />
          </g>
        ) : null}

        {/* Mata: kacamata / monokel / penutup */}
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
        {mata === "kacamata_hati" ? (
          <g>
            <Hati cx={75} cy={60} s={15} fill="rgba(236,72,153,0.25)" stroke="#EC4899" />
            <Hati cx={125} cy={60} s={15} fill="rgba(236,72,153,0.25)" stroke="#EC4899" />
            <path d="M89 60 H111" stroke="#EC4899" strokeWidth="2.5" />
          </g>
        ) : null}
        {mata === "monokel" ? (
          <g fill="none" stroke="#D4AF37" strokeWidth="3">
            <circle cx="125" cy="60" r="14" />
            <path d="M137 68 q8 12 0 26" strokeWidth="2" />
          </g>
        ) : null}
        {mata === "penutup_bajak_laut" ? (
          <g>
            <path d="M42 46 L134 54" stroke="#111827" strokeWidth="3" />
            <circle cx="125" cy="60" r="13" fill="#111827" />
          </g>
        ) : null}

        {/* Antena */}
        {spKepala !== "kepala_tv" ? (
          <g>
            <line x1="100" y1="18" x2="100" y2="-4" stroke={wanita ? p.utamaGelap : p.aksen} strokeWidth="4" strokeLinecap="round" />
            <circle cx="100" cy="-8" r="7" fill={p.utama} stroke={p.utamaGelap} strokeWidth="1.5" className={kelas("pet-denyut")} opacity={vitalitas === "lemas" ? 0.4 : 1} />
          </g>
        ) : null}

        {/* Kepala: topi / bandana / pita / mahkota / dll. */}
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
        {kepala === "topi_koki" ? (
          <g>
            <ellipse cx="100" cy="-6" rx="42" ry="20" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.5" />
            <rect x="64" y="0" width="72" height="26" rx="4" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.5" />
          </g>
        ) : null}
        {kepala === "helm_proyek" ? (
          <g>
            <path d="M44 26 Q100 -30 156 26 Z" fill="#FACC15" stroke="#CA8A04" strokeWidth="1.5" />
            <rect x="36" y="22" width="128" height="9" rx="4.5" fill="#EAB308" stroke="#CA8A04" strokeWidth="1.5" />
            <rect x="92" y="-14" width="16" height="30" rx="4" fill="#FDE68A" opacity="0.7" />
          </g>
        ) : null}
        {kepala === "topi_wisuda" ? (
          <g>
            <rect x="70" y="14" width="60" height="16" rx="4" fill="#111827" />
            <polygon points="100,-18 170,10 100,26 30,10" fill="#111827" stroke="#374151" strokeWidth="1.5" />
            <line x1="170" y1="10" x2="174" y2="36" stroke="#FCD34D" strokeWidth="2" />
            <circle cx="174" cy="38" r="3.5" fill="#FCD34D" />
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

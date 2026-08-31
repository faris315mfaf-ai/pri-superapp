"use client";

// ============================================================
// BORDER "Mythical" (revisi 1 Sep 2026 — permintaan user: BUKAN
// badge/cincin polos, tapi BORDER ornamen bergaya bingkai game:
// sayap bulu emas di kiri-kanan, permata di puncak & bawah, aura
// menyala — seperti bingkai avatar Mobile Legends / League of
// Legends). Diberikan pada juara 1-2-3 dari SETIAP kategori
// leaderboard; peringkat border = peringkat terbaik yang diraih:
//   #1 Mythical Immortal (emas-merah membara)
//   #2 Mythical Glory    (emas murni)
//   #3 Mythical Honor    (emas-ungu)
//
// Bingkai digambar SVG murni (tajam di semua ukuran, warna per tier,
// tanpa berkas gambar) — bulu-bulunya DIBANGKITKAN dari parameter
// supaya kedua sayap simetris sempurna. Animasi framer-motion:
// aura berdenyut, sayap mengepak halus, permata berkilau, bintang
// gemerlap. Kotak layout tetap seukuran avatar (ornamen melebar
// keluar secara dekoratif — tata letak tidak bergeser).
// ============================================================

import { useEffect, useId, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { getTop3Tvr, type JuaraTvr } from "@/services";
import { useSegarOtomatis } from "@/hooks/use-segar-otomatis";

type WarnaTier = {
  nama: string;
  /** Gradasi bulu sayap: pangkal → tengah → ujung */
  buluTerang: string;
  bulu: string;
  buluUjung: string;
  /** Permata atas & bawah */
  permata: string;
  permataTerang: string;
  /** Aura cahaya di belakang bingkai */
  cahaya: string;
  labelGradasi: string;
};

export const TIER_MYTHIC: Record<number, WarnaTier> = {
  1: {
    nama: "Mythical Immortal",
    buluTerang: "#FEF3C7",
    bulu: "#F59E0B",
    buluUjung: "#DC2626",
    permata: "#EF4444",
    permataTerang: "#FCA5A5",
    cahaya: "rgba(249, 115, 22, 0.6)",
    labelGradasi: "linear-gradient(135deg, #F97316, #DC2626)",
  },
  2: {
    // Revisi 1 Sep 2026 (permintaan user): Glory berwarna BIRU, 3x lebih megah.
    nama: "Mythical Glory",
    buluTerang: "#E0F2FE",
    bulu: "#38BDF8",
    buluUjung: "#1D4ED8",
    permata: "#3B82F6",
    permataTerang: "#BAE6FD",
    cahaya: "rgba(59, 130, 246, 0.6)",
    labelGradasi: "linear-gradient(135deg, #38BDF8, #1D4ED8)",
  },
  3: {
    nama: "Mythical Honor",
    buluTerang: "#FDE68A",
    bulu: "#E9A23B",
    buluUjung: "#8B5CF6",
    permata: "#A855F7",
    permataTerang: "#D8B4FE",
    cahaya: "rgba(139, 92, 246, 0.55)",
    labelGradasi: "linear-gradient(135deg, #8B5CF6, #6D28D9)",
  },
};

/** Satu helai bulu sayap: pisau melengkung menunjuk ke atas, pangkal di (0,0). */
function jalurBulu(panjang: number): string {
  const l = panjang;
  return [
    `M0 3`,
    `C ${l * 0.22} -${l * 0.1}, ${l * 0.26} -${l * 0.55}, ${l * 0.12} -${l}`,
    `C ${l * 0.02} -${l * 0.72}, -${l * 0.12} -${l * 0.4}, -${l * 0.16} -${l * 0.12}`,
    `C -${l * 0.14} -${l * 0.02}, -${l * 0.07} 2, 0 3`,
    `Z`,
  ].join(" ");
}

/** Bintang kilau 4 sudut. */
function jalurBintang(r: number): string {
  const k = r * 0.28;
  return `M0 -${r} L${k} -${k} L${r} 0 L${k} ${k} L0 ${r} L-${k} ${k} L-${r} 0 L-${k} -${k} Z`;
}

/**
 * Tingkat KEMEGAHAN per tier (revisi 1 Sep 2026):
 *   #1 Immortal → 5x lebih megah & berkilau: 3 lapis sayap, 10 bintang,
 *      lidah api naik, sinar berputar, aura ganda;
 *   #2 Glory    → biru, 3x lebih megah: 2 lapis sayap, 7 bintang, aura ganda;
 *   #3 Honor    → tetap seperti semula.
 */
const MEGAH: Record<
  number,
  { lapis: number; kilau: number; api: boolean; sinar: boolean; auraGanda: boolean }
> = {
  1: { lapis: 3, kilau: 10, api: true, sinar: true, auraGanda: true },
  2: { lapis: 2, kilau: 7, api: false, sinar: false, auraGanda: true },
  3: { lapis: 1, kilau: 4, api: false, sinar: false, auraGanda: false },
};

/** Posisi bintang kilau (dipakai berurutan sebanyak MEGAH.kilau). */
const TITIK_KILAU = [
  { x: 30, y: 60, r: 5, tunda: 0 },
  { x: 194, y: 74, r: 4, tunda: 0.6 },
  { x: 42, y: 178, r: 4, tunda: 1.1 },
  { x: 186, y: 168, r: 5, tunda: 1.6 },
  { x: 110, y: 4, r: 4, tunda: 0.3 },
  { x: 16, y: 118, r: 4, tunda: 1.4 },
  { x: 204, y: 122, r: 4, tunda: 0.9 },
  { x: 74, y: 22, r: 3.5, tunda: 1.9 },
  { x: 148, y: 20, r: 3.5, tunda: 0.45 },
  { x: 110, y: 214, r: 4, tunda: 1.25 },
];

/**
 * Bingkai ornamen mengelilingi avatar. `ukuran` = diameter AVATAR
 * (kotak layout); sayap, permata & aura melebar keluar dari situ.
 */
export function CincinMythic({
  tier,
  ukuran,
  children,
  denganMahkota = true, // dipertahankan agar pemanggil lama tak berubah
}: {
  tier: number;
  ukuran: number;
  children: ReactNode;
  denganMahkota?: boolean;
}) {
  void denganMahkota;
  const t = TIER_MYTHIC[tier];
  const m = MEGAH[tier] ?? MEGAH[3];
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (!t) return <>{children}</>;

  // Geometri: lubang avatar di viewBox = lingkaran r56 @ (110,112).
  const skala = ukuran / 112;
  const total = 220 * skala;
  const ofs = (total - ukuran) / 2;

  // Bulu kedua sayap dibangkitkan simetris: sudut derajat posisi pada
  // lingkaran (0° = kanan, searah jarum jam ke bawah) + panjang helai.
  const heliks: { sudut: number; panjang: number }[] = [
    { sudut: 148, panjang: 34 },
    { sudut: 163, panjang: 44 },
    { sudut: 178, panjang: 52 },
    { sudut: 193, panjang: 56 },
    { sudut: 208, panjang: 50 },
    { sudut: 222, panjang: 40 },
    { sudut: 235, panjang: 30 },
  ];
  const CX = 110;
  const CY = 112;
  // Lapisan sayap (kemegahan): tiap lapis lebih jauh, lebih panjang,
  // lebih transparan — memberi kesan sayap tebal berlapis.
  const LAPIS = [
    { r: 64, s: 1, o: 1 },
    { r: 73, s: 1.26, o: 0.8 },
    { r: 84, s: 1.52, o: 0.6 },
  ].slice(0, m.lapis);

  function bulu(sisiKanan: boolean, lapis: { r: number; s: number; o: number }, kunci: string) {
    return heliks.map(({ sudut, panjang }, i) => {
      const a = sisiKanan ? 180 - sudut : sudut; // cermin sempurna
      const rad = (a * Math.PI) / 180;
      // Sudut matematis → koordinat layar (sumbu y layar mengarah turun).
      const x = CX + lapis.r * Math.cos(rad);
      const y = CY - lapis.r * Math.sin(rad);
      // Helai menunjuk MENJAUH dari pusat: rotasi = arah radial.
      const arah = 90 - a;
      return (
        <path
          key={`${kunci}-${sisiKanan ? "ka" : "ki"}-${i}`}
          d={jalurBulu(panjang * lapis.s)}
          transform={`translate(${x} ${y}) rotate(${arah}) ${sisiKanan ? "scale(-1 1)" : ""}`}
          fill={`url(#bulu-${uid})`}
          stroke="rgba(120, 53, 15, 0.45)"
          strokeWidth="0.8"
          opacity={lapis.o}
        />
      );
    });
  }

  const kilau = TITIK_KILAU.slice(0, m.kilau);
  // Lidah api Immortal: naik dari kiri-kanan bawah lalu memudar.
  const api = [
    { x: 58, y: 176, tunda: 0 },
    { x: 162, y: 176, tunda: 0.7 },
    { x: 84, y: 196, tunda: 1.2 },
    { x: 136, y: 196, tunda: 0.4 },
  ];

  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center align-middle"
      style={{ width: ukuran, height: ukuran }}
    >
      {/* Aura istimewa berdenyut di belakang bingkai */}
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute rounded-full blur-lg"
        style={{
          inset: -(ukuran * (m.api ? 0.4 : 0.28)),
          background: `radial-gradient(circle, ${t.cahaya} 0%, transparent 68%)`,
        }}
        animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.1, 1] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Aura kedua (Glory/Immortal — lebih megah): denyut berlawanan */}
      {m.auraGanda && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full blur-md"
          style={{
            inset: -(ukuran * 0.16),
            background: `radial-gradient(circle, ${t.cahaya} 0%, transparent 60%)`,
          }}
          animate={{ opacity: [0.9, 0.4, 0.9], scale: [1.06, 1, 1.06] }}
          transition={{ duration: 2.1, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {/* Bingkai ornamen (sayap + cincin + permata + kilau) */}
      <motion.svg
        aria-hidden="true"
        viewBox="0 0 220 220"
        className="pointer-events-none absolute z-10"
        style={{ width: total, height: total, top: -ofs, left: -ofs }}
        animate={{ scale: [1, 1.02, 1] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <defs>
          <linearGradient id={`bulu-${uid}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={t.buluTerang} />
            <stop offset="45%" stopColor={t.bulu} />
            <stop offset="100%" stopColor={t.buluUjung} />
          </linearGradient>
          <linearGradient id={`cincin-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={t.buluTerang} />
            <stop offset="45%" stopColor={t.bulu} />
            <stop offset="100%" stopColor="#92400E" />
          </linearGradient>
          <radialGradient id={`permata-${uid}`} cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="30%" stopColor={t.permataTerang} />
            <stop offset="100%" stopColor={t.permata} />
          </radialGradient>
        </defs>

        {/* Sinar kemuliaan berputar (khusus Immortal) */}
        {m.sinar && (
          <motion.g
            animate={{ rotate: 360 }}
            transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "110px 112px" }}
            opacity="0.22"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <path
                key={i}
                d="M110 112 L104 22 L116 22 Z"
                transform={`rotate(${i * 30} 110 112)`}
                fill={`url(#bulu-${uid})`}
              />
            ))}
          </motion.g>
        )}

        {/* Sayap kiri & kanan berlapis — mengepak sangat halus.
            Lapisan terluar digambar duluan supaya lapisan inti di depan. */}
        <motion.g
          animate={{ rotate: [-1.4, 1.4, -1.4] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "110px 112px" }}
        >
          {[...LAPIS].reverse().map((lapis, li) => (
            <g key={li}>
              {bulu(false, lapis, `l${li}`)}
              {bulu(true, lapis, `l${li}`)}
            </g>
          ))}
        </motion.g>

        {/* Lidah api naik (khusus Immortal — berkilau membara).
            Posisi lewat <g> statis; motion hanya menganimasikan
            kenaikan relatifnya (kalau digabung, transform base tertimpa). */}
        {m.api &&
          api.map((f, i) => (
            <g key={`api-${i}`} transform={`translate(${f.x} ${f.y})`}>
              <motion.path
                d="M0 0 C 5 -6, 5 -14, 0 -20 C -5 -14, -5 -6, 0 0 Z"
                fill={`url(#permata-${uid})`}
                animate={{ y: [0, -26], opacity: [0, 0.9, 0], scale: [0.7, 1.15, 0.8] }}
                transition={{
                  duration: 1.7,
                  repeat: Infinity,
                  ease: "easeOut",
                  delay: f.tunda,
                }}
              />
            </g>
          ))}

        {/* Cincin bingkai berlapis */}
        <circle cx={CX} cy={CY} r="66" fill="none" stroke="rgba(120,53,15,0.6)" strokeWidth="2" />
        <circle cx={CX} cy={CY} r="62" fill="none" stroke={`url(#cincin-${uid})`} strokeWidth="6.5" />
        <circle cx={CX} cy={CY} r="57.5" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.2" />

        {/* Puncak: lengkung mahkota + permata perisai */}
        <path
          d={`M74 42 C 88 24, 132 24, 146 42`}
          fill="none"
          stroke={`url(#cincin-${uid})`}
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d="M110 12 L126 32 L110 50 L94 32 Z"
          fill={`url(#cincin-${uid})`}
          stroke="rgba(120,53,15,0.6)"
          strokeWidth="1.5"
        />
        <motion.path
          d="M110 19 L120 32 L110 43 L100 32 Z"
          fill={`url(#permata-${uid})`}
          animate={{ opacity: [0.75, 1, 0.75] }}
          transition={{ duration: 1.7, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Bawah: permata tetes + sulur emas */}
        <path
          d={`M84 190 C 96 200, 124 200, 136 190`}
          fill="none"
          stroke={`url(#cincin-${uid})`}
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path
          d="M110 172 C 124 182, 124 198, 110 208 C 96 198, 96 182, 110 172 Z"
          fill={`url(#cincin-${uid})`}
          stroke="rgba(120,53,15,0.6)"
          strokeWidth="1.5"
        />
        <motion.path
          d="M110 179 C 119 186, 119 196, 110 202 C 101 196, 101 186, 110 179 Z"
          fill={`url(#permata-${uid})`}
          animate={{ opacity: [0.75, 1, 0.75] }}
          transition={{ duration: 1.9, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
        />

        {/* Bintang kilau gemerlap bergantian */}
        {kilau.map((s, i) => (
          <motion.path
            key={i}
            d={jalurBintang(s.r)}
            transform={`translate(${s.x} ${s.y})`}
            fill="#FFFFFF"
            animate={{ opacity: [0, 1, 0], scale: [0.5, 1.15, 0.5] }}
            transition={{
              duration: 1.8,
              repeat: Infinity,
              ease: "easeInOut",
              delay: s.tunda,
              repeatDelay: 0.9,
            }}
          />
        ))}
      </motion.svg>

      {/* Avatar asli di tengah lubang bingkai — ukurannya DIPAKSA persis
          (fix 1 Sep 2026: foto kadang melenceng karena wadah tanpa ukuran
          eksplisit mengikuti baseline teks). */}
      {/* (Tanpa overflow-hidden: topi ulang tahun/badge kamera di profil
          menonjol keluar lingkaran dan tidak boleh terpotong.) */}
      <span
        className="relative z-20 inline-flex shrink-0 items-center justify-center"
        style={{ width: ukuran, height: ukuran }}
      >
        {children}
      </span>
    </span>
  );
}

/** Chip label border, mis. "Mythical Immortal". */
export function LabelMythic({ tier, kecil = false }: { tier: number; kecil?: boolean }) {
  const t = TIER_MYTHIC[tier];
  if (!t) return null;
  return (
    <span
      className={
        kecil
          ? "rounded-full px-2 py-0.5 text-[9px] font-extrabold tracking-wide text-white uppercase"
          : "rounded-full px-2.5 py-1 text-[10px] font-extrabold tracking-wide text-white uppercase"
      }
      style={{ background: t.labelGradasi, boxShadow: `0 4px 14px ${t.cahaya}` }}
    >
      {t.nama}
    </span>
  );
}

// ------------------------------------------------------------
// Pemegang border bersama (cache modul + penyegaran 60 dtk)
// ------------------------------------------------------------
let cacheTop3: { data: JuaraTvr[]; pada: number } | null = null;
let sedangAmbil: Promise<JuaraTvr[]> | null = null;
const TTL_MS = 60_000;
const pendengar = new Set<(d: JuaraTvr[]) => void>();

async function ambilTop3Bersama(paksa = false): Promise<JuaraTvr[]> {
  if (!paksa && cacheTop3 && Date.now() - cacheTop3.pada < TTL_MS) return cacheTop3.data;
  if (!sedangAmbil) {
    sedangAmbil = getTop3Tvr()
      .then((d) => {
        cacheTop3 = { data: d, pada: Date.now() };
        for (const fn of pendengar) fn(d);
        return d;
      })
      .finally(() => {
        sedangAmbil = null;
      });
  }
  return sedangAmbil;
}

/** Semua pemegang border (juara 1-3 kategori mana pun) — dipakai
 *  cincin border avatar & layar mana pun. */
export function useTop3Tvr(): JuaraTvr[] {
  const [data, setData] = useState<JuaraTvr[]>(cacheTop3?.data ?? []);
  useEffect(() => {
    pendengar.add(setData);
    void ambilTop3Bersama().then((d) => setData(d)).catch(() => {});
    return () => {
      pendengar.delete(setData);
    };
  }, []);
  // "Realtime": disegarkan tiap 60 dtk + saat aplikasi dibuka kembali.
  useSegarOtomatis(() => {
    void ambilTop3Bersama(true).catch(() => {});
  }, 60);
  return data;
}

/**
 * Bungkus avatar SIAPA PUN: bila pemiliknya juara 1-3 di kategori
 * mana pun, border Mythical menyala; selain itu avatar tampil biasa.
 */
export function CincinJuara({
  userId,
  ukuran,
  children,
  denganMahkota = true,
}: {
  userId: string | number;
  ukuran: number;
  children: ReactNode;
  denganMahkota?: boolean;
}) {
  const top3 = useTop3Tvr();
  const tier = top3.find((j) => String(j.user_id) === String(userId))?.peringkat;
  if (!tier) return <>{children}</>;
  return (
    <CincinMythic tier={tier} ukuran={ukuran} denganMahkota={denganMahkota}>
      {children}
    </CincinMythic>
  );
}

"use client";

// ============================================================
// Perlengkapan ulang tahun:
// - ulangTahunHariIni(u)  : apakah pengguna ini berulang tahun (WIB)
// - <ConfettiUltah />     : hujan confetti ringan (CSS murni, tanpa
//                           library) untuk halaman profil yang ultah
// - <TopiUltah />         : topi pesta kecil di pojok avatar
// - <KartuUltah />        : banner beranda "hari ini ulang tahun …"
// ============================================================

import { useEffect, useState } from "react";
import { Cake } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { FadeInUp } from "@/components/pri-ui";
import { getUltahHariIni, type OrangUltah } from "@/services";

export function ulangTahunHariIni(u: { tanggal_lahir?: string | null }): boolean {
  const t = (u.tanggal_lahir ?? "").slice(5, 10); // "MM-DD"
  if (!t) return false;
  const wib = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(5, 10);
  return t === wib;
}

// ------------------------------------------------------------
// Confetti: 24 kepingan emoji yang jatuh dengan kecepatan/putaran
// acak-tetap (di-seed dari indeks supaya render server & klien sama).
// pointer-events-none — murni hiasan, tidak menghalangi ketukan.
// ------------------------------------------------------------

const KEPING = ["🎉", "🎊", "✨", "🎈", "⭐"];

export function ConfettiUltah() {
  // KENAPA skala tinggi: confetti jatuh sejauh 110vh dalam durasi TETAP,
  // jadi di layar tinggi (desktop) jaraknya lebih panjang sehingga
  // TERLIHAT jatuh lebih cepat, dan di layar pendek lebih lambat —
  // itulah "kecepatan tidak konsisten" yang dilaporkan. Dengan
  // menskalakan durasi sebanding tinggi layar, KECEPATAN (px/detik)
  // jadi seragam di semua ukuran. Nilai awal 1 supaya render server &
  // klien cocok; disetel setelah mount tanpa memicu render beruntun.
  const [skala, setSkala] = useState(1);
  useEffect(() => {
    const TINGGI_ACUAN = 800; // acuan ~layar HP
    const sesuaikan = () => setSkala(window.innerHeight / TINGGI_ACUAN);
    void Promise.resolve().then(sesuaikan);
    window.addEventListener("resize", sesuaikan);
    return () => window.removeEventListener("resize", sesuaikan);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden="true">
      {Array.from({ length: 24 }, (_, i) => {
        const kiri = (i * 37) % 100; // sebaran horizontal deterministik
        // Durasi dasar 4–8 detik, diskalakan tinggi layar agar kecepatan
        // jatuhnya seragam di HP maupun desktop.
        const durasi = (4 + ((i * 13) % 40) / 10) * skala;
        const tunda = ((i * 7) % 30) / 10; // 0–3 detik
        return (
          <span
            key={i}
            className="confetti-jatuh absolute -top-8 text-lg"
            style={{
              left: `${kiri}%`,
              animationDuration: `${durasi}s`,
              animationDelay: `${tunda}s`,
            }}
          >
            {KEPING[i % KEPING.length]}
          </span>
        );
      })}
      {/* <style> polos (bukan styled-jsx): App Router tidak memasang
          registry styled-jsx; nama kelasnya unik jadi aman global. */}
      <style>{`
        .confetti-jatuh {
          animation-name: confetti-turun;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        @keyframes confetti-turun {
          0% {
            transform: translateY(-2rem) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(110vh) rotate(540deg);
            opacity: 0.6;
          }
        }
      `}</style>
    </div>
  );
}

/** Topi pesta kecil di pojok kanan-atas avatar yang berulang tahun. */
export function TopiUltah() {
  return (
    <span
      className="absolute -top-2 -right-1 rotate-12 text-xl drop-shadow"
      aria-label="Sedang berulang tahun"
      role="img"
    >
      🥳
    </span>
  );
}

/** Banner beranda: siapa saja yang berulang tahun hari ini. */
export function KartuUltah({ idKu }: { idKu?: string }) {
  const [orang, setOrang] = useState<OrangUltah[] | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getUltahHariIni();
        if (hidup) setOrang(hasil);
      } catch {
        if (hidup) setOrang([]);
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  if (!orang || orang.length === 0) return null;

  const aku = orang.some((o) => o.id === idKu);
  const nama = orang.map((o) => o.nama_panggilan).join(", ");

  return (
    <FadeInUp delay={0.02}>
      <GlassCard className="mt-4 flex items-center gap-3 p-3.5">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)" }}
          aria-hidden="true"
        >
          <Cake className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-teks-utama">
            {aku ? "Selamat ulang tahun! 🎉" : "Ada yang ulang tahun 🎂"}
          </p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-teks-sekunder">
            {aku
              ? "Semoga panjang umur, sehat, dan makin berdampak untuk rakyat!"
              : `Hari ini adalah ulang tahun ${nama}. Jangan lupa beri ucapan!`}
          </p>
        </div>
      </GlassCard>
    </FadeInUp>
  );
}

"use client";

// ============================================================
// KartuSiaranKoordinator (15 Okt 2026) — di TV Rakyat Saya anggota.
//
// Anggota menyetujui saat mendaftar bahwa Koordinator TV Rakyat boleh memposting ke akun
// sosmed yang ia tautkan. Kartu ini membuat itu TERLIHAT: apa yang diposting ke akunnya,
// kapan, di platform mana, dan apa yang gagal (mis. perlu login ulang). Tidak tampil
// sama sekali bila belum pernah ada siaran ke akunnya.
// ============================================================

import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { labelPlatform } from "@/components/platform-icon";
import { getSiaranSaya, type SiaranSaya } from "@/services";
import { cn } from "@/lib/utils";

const STATUS: Record<string, { teks: string; kelas: string }> = {
  terkirim: { teks: "Terbit", kelas: "bg-[#DCFCE7] text-[#14532D]" },
  menunggu: { teks: "Menunggu giliran", kelas: "bg-black/5 text-teks-sekunder dark:bg-white/10" },
  diproses: { teks: "Sedang dikirim", kelas: "bg-[#FEF3C7] text-[#78350F]" },
  gagal: { teks: "Gagal", kelas: "bg-[#FEE2E2] text-[#7F1D1D]" },
  dibatalkan: { teks: "Dibatalkan", kelas: "bg-black/5 text-teks-sekunder dark:bg-white/10" },
};

function waktuWib(iso: string | null): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "";
  const d = new Date(t + 7 * 3600_000);
  const dua = (n: number) => String(n).padStart(2, "0");
  return `${dua(d.getUTCDate())}/${dua(d.getUTCMonth() + 1)} ${dua(d.getUTCHours())}.${dua(d.getUTCMinutes())} WIB`;
}

export function KartuSiaranKoordinator() {
  const [data, setData] = useState<SiaranSaya[] | null>(null);

  useEffect(() => {
    let hidup = true;
    getSiaranSaya()
      .then((d) => {
        if (hidup) setData(d);
      })
      .catch(() => {
        // Kartu pelengkap: gagal dimuat = tidak ditampilkan.
        if (hidup) setData([]);
      });
    return () => {
      hidup = false;
    };
  }, []);

  if (!data || data.length === 0) return null;

  return (
    <GlassCard className="mt-3 p-4">
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#EDE9FE] text-[#5B21B6]" aria-hidden="true">
          <Megaphone className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-[15px] font-bold text-teks-utama">Siaran Koordinator</p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-teks-sekunder">
            Saat mendaftar, Anda menyetujui bahwa Koordinator TV Rakyat dapat memposting video ke akun sosmed yang Anda
            tautkan di SuperApp. Semua siaran ke akun Anda tercatat di sini.
          </p>
        </div>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {data.slice(0, 10).map((s) => {
          const st = STATUS[s.status] ?? { teks: s.status, kelas: "bg-black/5 text-teks-sekunder dark:bg-white/10" };
          return (
            <li key={s.id} className="glass-soft flex flex-col gap-1.5 rounded-xl p-3">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-teks-utama">{s.judul}</span>
                <span className="shrink-0 text-[11px] text-teks-sekunder">{waktuWib(s.waktu)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-bold", st.kelas)}>{st.teks}</span>
                {s.platforms.map((p) => (
                  <span key={p} className="glass rounded-full px-2 py-0.5 text-[10.5px] font-semibold text-teks-utama">
                    {labelPlatform(p)}
                  </span>
                ))}
                {s.kategori && (
                  <span className="rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[10.5px] font-bold text-[#1E3A8A] dark:bg-[#172554]/40 dark:text-[#BFDBFE]">
                    {s.kategori}
                  </span>
                )}
              </div>
              {s.pesan && s.status !== "terkirim" && <p className="m-0 text-[11px] leading-snug text-teks-sekunder">{s.pesan}</p>}
              {s.status === "terkirim" && s.pesan.startsWith("Terkirim sebagian") && (
                <p className="m-0 text-[11px] leading-snug text-[#B45309]">{s.pesan} — sambungkan ulang akun yang gagal di bagian Hubungkan.</p>
              )}
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}

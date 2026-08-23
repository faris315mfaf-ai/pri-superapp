"use client";

// ============================================================
// KepatuhanAkunCard — tingkat kepatuhan per akun wajib.
// Bar progres horizontal bergaya kaca dengan animasi width
// (framer-motion) dan warna sesuai ambang kepatuhan.
// ============================================================

import { motion } from "framer-motion";
import { AtSign } from "lucide-react";
import { EmptyState } from "@/components/pri-ui";
import { GlassCard } from "@/components/glass-card";
import { warnaKepatuhan } from "@/lib/format";

type KepatuhanAkunCardProps = {
  data: { akun_wajib: string; persen: number }[];
};

export function KepatuhanAkunCard({ data }: KepatuhanAkunCardProps) {
  return (
    <GlassCard className="p-4">
      <h3 className="font-heading text-[15px] font-bold text-teks-utama">
        Kepatuhan per Akun Wajib
      </h3>

      {data.length === 0 ? (
        <EmptyState
          ikon={AtSign}
          judul="Belum ada akun wajib"
          keterangan="Daftar akun wajib beserta tingkat kepatuhannya akan tampil di sini."
          className="py-6"
        />
      ) : (
        <ol className="mt-4 flex flex-col gap-4">
          {data.map((akun, i) => {
            const warna = warnaKepatuhan(akun.persen);
            const persen = Math.min(100, Math.max(0, akun.persen));
            return (
              <li key={akun.akun_wajib}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-teks-utama">
                    @{akun.akun_wajib}
                  </span>
                  <span
                    className="angka-tab shrink-0 text-sm font-bold"
                    style={{ color: warna }}
                  >
                    {persen}%
                  </span>
                </div>

                {/* Track kaca lembut + fill gradient beranimasi */}
                <div
                  className="h-2.5 w-full overflow-hidden rounded-full"
                  style={{ background: "var(--glass-bg-soft)" }}
                  role="progressbar"
                  aria-label={`Kepatuhan akun @${akun.akun_wajib}`}
                  aria-valuenow={persen}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: `linear-gradient(90deg, ${warna}B3, ${warna})` }}
                    initial={{ width: 0 }}
                    animate={{ width: `${persen}%` }}
                    transition={{
                      delay: 0.15 + i * 0.12,
                      duration: 0.7,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </GlassCard>
  );
}

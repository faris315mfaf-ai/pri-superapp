"use client";

// ============================================================
// TopKaderCard — peringkat 5 kader teraktif. Tiga teratas
// memakai lingkaran medali gradient (emas/perak/perunggu),
// peringkat 4–5 memakai lingkaran polos bergaya kaca.
// ============================================================

import { Medal, Trophy } from "lucide-react";
import { AvatarInisial, EmptyState } from "@/components/pri-ui";
import { GlassCard } from "@/components/glass-card";
import type { PeringkatKader } from "@/services";

/** Gaya medali untuk 3 peringkat teratas */
const MEDALI_TOP3 = [
  {
    gradien: "linear-gradient(135deg, #F59E0B, #FBBF24)",
    teks: "#FFFFFF",
    bayangan: "0 4px 10px rgba(245, 158, 11, 0.45)",
  },
  {
    gradien: "linear-gradient(135deg, #CBD5E1, #E2E8F0)",
    teks: "#1E293B",
    bayangan: "0 4px 10px rgba(148, 163, 184, 0.45)",
  },
  {
    gradien: "linear-gradient(135deg, #D97706, #F59E0B)",
    teks: "#FFFFFF",
    bayangan: "0 4px 10px rgba(217, 119, 6, 0.45)",
  },
];

type TopKaderCardProps = {
  peringkat: PeringkatKader[];
};

export function TopKaderCard({ peringkat }: TopKaderCardProps) {
  const limaTeratas = peringkat.slice(0, 5);

  return (
    <GlassCard className="p-4">
      <h3 className="font-heading text-[15px] font-bold text-teks-utama">
        Peringkat Kader Teraktif
      </h3>

      {limaTeratas.length === 0 ? (
        <EmptyState
          ikon={Trophy}
          judul="Belum ada peringkat"
          keterangan="Peringkat kader paling aktif berkomentar akan tampil di sini."
          className="py-6"
        />
      ) : (
        <ol className="mt-4 flex flex-col gap-3.5">
          {limaTeratas.map((kader, i) => {
            const medali = MEDALI_TOP3[i];
            return (
              <li key={kader.id} className="flex items-center gap-3">
                {medali ? (
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center gap-0.5 rounded-full font-heading text-[11px] font-extrabold"
                    style={{
                      background: medali.gradien,
                      color: medali.teks,
                      boxShadow: medali.bayangan,
                    }}
                    aria-label={`Peringkat ${i + 1}`}
                  >
                    {i === 0 && <Medal className="h-3 w-3" aria-hidden="true" />}
                    <span className="angka-tab">{i + 1}</span>
                  </span>
                ) : (
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-teks-sekunder"
                    style={{
                      background: "var(--glass-bg-soft)",
                      border: "1px solid var(--glass-border)",
                    }}
                    aria-label={`Peringkat ${i + 1}`}
                  >
                    <span className="angka-tab">{i + 1}</span>
                  </span>
                )}

                <AvatarInisial nama={kader.nama_kader} ukuran="sm" />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-teks-utama">
                    {kader.nama_kader}
                  </p>
                  <p className="text-[10px] text-teks-sekunder">komentar</p>
                </div>

                <span className="angka-tab shrink-0 text-sm font-bold text-teks-utama">
                  {kader.jumlah_komentar}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </GlassCard>
  );
}

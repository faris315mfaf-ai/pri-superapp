"use client";

// ============================================================
// AktivitasFeed — timeline vertikal aktivitas terbaru.
// Titik timeline berwarna + ikon kecil per jenis aktivitas:
// QC (merah), VIDEO (emas), ROSTER (hijau), SISTEM (abu).
// ============================================================

import { History, Settings2, ShieldCheck, Users, Video } from "lucide-react";
import { EmptyState } from "@/components/pri-ui";
import { GlassCard } from "@/components/glass-card";
import type { Aktivitas } from "@/types";

const KONFIG_JENIS: Record<Aktivitas["jenis"], { warna: string; Ikon: React.ElementType }> = {
  QC: { warna: "#DC2626", Ikon: ShieldCheck },
  VIDEO: { warna: "#F59E0B", Ikon: Video },
  ROSTER: { warna: "#10B981", Ikon: Users },
  SISTEM: { warna: "#94A3B8", Ikon: Settings2 },
};

type AktivitasFeedProps = {
  aktivitas: Aktivitas[];
};

export function AktivitasFeed({ aktivitas }: AktivitasFeedProps) {
  const enamTerbaru = aktivitas.slice(0, 6);

  return (
    <GlassCard className="p-4">
      <h3 className="font-heading text-[15px] font-bold text-teks-utama">Aktivitas Terbaru</h3>

      {enamTerbaru.length === 0 ? (
        <EmptyState
          ikon={History}
          judul="Belum ada aktivitas"
          keterangan="Catatan aktivitas terbaru dari seluruh modul akan tampil di sini."
          className="py-6"
        />
      ) : (
        <ol className="mt-4 flex flex-col">
          {enamTerbaru.map((item, i) => {
            const kfg = KONFIG_JENIS[item.jenis] ?? KONFIG_JENIS.SISTEM;
            const terakhir = i === enamTerbaru.length - 1;
            return (
              <li key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
                {/* Garis vertikal kaca tipis */}
                {!terakhir && (
                  <span
                    aria-hidden="true"
                    className="absolute top-7 bottom-0 left-[13px] w-px"
                    style={{ background: "rgba(148, 163, 184, 0.3)" }}
                  />
                )}

                {/* Titik timeline + ikon jenis */}
                <span
                  className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                  style={{ background: `${kfg.warna}1F`, border: `1px solid ${kfg.warna}59` }}
                  aria-hidden="true"
                >
                  <kfg.Ikon className="h-3.5 w-3.5" style={{ color: kfg.warna }} />
                </span>

                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-sm leading-snug text-teks-utama">{item.teks}</p>
                  <p className="mt-0.5 text-[11px] text-teks-sekunder">{item.waktu_relatif}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </GlassCard>
  );
}

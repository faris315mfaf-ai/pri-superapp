"use client";

// ============================================================
// Panel Master → SAKELAR MODUL (24 Sep 2026)
//
// Modul aplikasi yang bisa dinyalakan/dimatikan master tanpa deploy:
// kepatuhan komentar (bawaan mati) dan ganti username/sandi dari Profil.
// Berbeda dengan fitur berat, sakelar ini tidak terpengaruh mode hemat.
// Katalognya di lib/sakelar-modul.
// ============================================================

import { ToggleRight } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { SectionTitle } from "@/components/pri-ui";
import { SwitchKaca } from "./switch-kaca";
import { DAFTAR_MODUL, nilaiModul } from "@/lib/sakelar-modul";
import { useAppStore } from "@/hooks/use-app-store";
import { getSakelar } from "@/services";
import { cn } from "@/lib/utils";

export function SeksiSakelarModul({
  pengaturan,
  sedangProses,
  onJalankan,
}: {
  pengaturan: Record<string, string>;
  sedangProses: boolean;
  onJalankan: (aksi: string, isi: Record<string, string | boolean>, pesan: string) => Promise<void>;
}) {
  // Layar master sendiri ikut berubah seketika, tidak menunggu penyegaran
  // 5 menit di page.tsx.
  async function ubah(kunci: string, nilai: boolean, pesan: string) {
    await onJalankan("sakelar_modul", { kunci, nilai }, pesan);
    try {
      const s = await getSakelar();
      useAppStore.getState().setSakelar({ fitur: s.fitur, hemat: s.hemat, modul: s.modul });
    } catch {
      // Gagal menyegarkan = tetap benar setelah penyegaran berkala.
    }
  }

  return (
    <div className="mt-6">
      <SectionTitle judul="Sakelar Modul" />
      <GlassCard className="mt-2.5 p-4">
        <p className="flex items-center gap-1.5 text-[11px] leading-relaxed text-teks-sekunder">
          <ToggleRight className="h-3.5 w-3.5 shrink-0 text-pri" aria-hidden="true" />
          Menyembunyikan atau menampilkan modul untuk semua pengguna. Berlaku dalam ±1 menit.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {DAFTAR_MODUL.map((m) => {
            const nyala = nilaiModul(pengaturan[`modul_${m.kunci}`], m.kunci);
            return (
              <div
                key={m.kunci}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5",
                  nyala
                    ? "border-emerald-400/30 bg-emerald-400/8"
                    : "border-black/5 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.04]",
                )}
              >
                <div className="min-w-0">
                  <p className="text-[12.5px] font-bold text-teks-utama">{m.label}</p>
                  <p className="text-[10.5px] leading-snug text-teks-sekunder">{m.keterangan}</p>
                </div>
                <SwitchKaca
                  aktif={nyala}
                  disabled={sedangProses}
                  onUbah={() =>
                    void ubah(m.kunci, !nyala, nyala ? `${m.label} DIMATIKAN` : `${m.label} dinyalakan`)
                  }
                  labelAria={m.label}
                />
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}

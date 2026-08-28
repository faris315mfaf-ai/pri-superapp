"use client";

// ============================================================
// AturMenuScreen (fitur 1.20/4) — pengguna memilih modul apa saja
// yang tampil di menu bawah (footer) aplikasinya sendiri.
//
// - Daftarnya HANYA modul yang memang menjadi haknya (tabPenuh dari
//   page.tsx) — menyalakan sesuatu di sini tidak pernah menambah hak.
// - KONTEN wajib tampil (fitur 1.20/5) dan PROFIL wajib tampil
//   (pintu pengaturan) — keduanya terkunci.
// - Pilihan disimpan di server (ikut antar-perangkat).
// ============================================================

import { useState } from "react";
import { ArrowLeft, Lock, PanelBottom } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { SwitchKaca } from "./switch-kaca";
import { toast } from "@/hooks/use-app-store";
import { simpanPreferensi } from "@/services";
import { KONFIG_TAB, type KunciTab } from "@/components/bottom-nav";
import { cn } from "@/lib/utils";

const TAB_WAJIB = new Set<KunciTab>(["konten", "profil"]);

export function AturMenuScreen({
  tabPenuh,
  sembunyi,
  onUbah,
  onKembali,
}: {
  /** Semua modul yang menjadi hak pengguna ini (belum tersaring) */
  tabPenuh: KunciTab[];
  /** Kunci modul yang sedang disembunyikan */
  sembunyi: string[];
  /** Terapkan daftar sembunyi baru (page.tsx menyimpan state-nya) */
  onUbah: (baru: string[]) => void;
  onKembali: () => void;
}) {
  const [sedang, setSedang] = useState(false);

  async function toggle(tab: KunciTab) {
    if (sedang || TAB_WAJIB.has(tab)) return;
    const baru = sembunyi.includes(tab)
      ? sembunyi.filter((t) => t !== tab)
      : [...sembunyi, tab];
    // Optimis: nav bawah langsung berubah; gagal simpan = dikembalikan.
    onUbah(baru);
    setSedang(true);
    try {
      await simpanPreferensi("footer", { sembunyi: baru });
    } catch (e) {
      onUbah(sembunyi);
      toast("error", "Gagal menyimpan menu", e instanceof Error ? e.message : "");
    } finally {
      setSedang(false);
    }
  }

  return (
    <div className="kolom-aplikasi px-4 pt-5 pb-16">
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={onKembali}
          aria-label="Kembali"
          className="glass btn-tekan flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-teks-utama"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading truncate text-xl font-extrabold tracking-tight text-teks-utama">
            Atur Menu Bawah
          </h1>
          <p className="text-xs text-teks-sekunder">Pilih modul yang tampil di footer</p>
        </div>
        <PanelBottom className="h-5 w-5 shrink-0 text-pri" aria-hidden="true" />
      </header>

      <GlassCard className="mt-4 p-2">
        {tabPenuh.map((tab, i) => {
          const konfig = KONFIG_TAB[tab];
          const wajib = TAB_WAJIB.has(tab);
          const tampil = wajib || !sembunyi.includes(tab);
          return (
            <div
              key={tab}
              className={cn(
                "flex items-center gap-3 px-3 py-3",
                i > 0 && "border-t border-glass-border",
              )}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
                style={{
                  backgroundColor: "rgba(220,38,38,0.10)",
                  borderColor: "rgba(220,38,38,0.22)",
                  color: "#DC2626",
                }}
                aria-hidden="true"
              >
                <konfig.ikon className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-teks-utama">{konfig.label}</p>
                {wajib && (
                  <p className="flex items-center gap-1 text-[10.5px] text-teks-sekunder">
                    <Lock className="h-3 w-3" aria-hidden="true" />
                    Wajib tampil
                  </p>
                )}
              </div>
              {wajib ? (
                <span className="rounded-full bg-sukses/15 px-2.5 py-1 text-[10.5px] font-bold text-sukses">
                  Selalu
                </span>
              ) : (
                <SwitchKaca
                  aktif={tampil}
                  disabled={sedang}
                  onUbah={() => void toggle(tab)}
                  labelAria={`Tampilkan modul ${konfig.label} di menu bawah`}
                />
              )}
            </div>
          );
        })}
      </GlassCard>

      <p className="mt-3 text-center text-[11px] leading-relaxed text-teks-sekunder">
        Menyembunyikan modul hanya merapikan menu — hak aksesmu tidak berubah,
        dan pilihan ini ikut ke semua perangkatmu.
      </p>
    </div>
  );
}

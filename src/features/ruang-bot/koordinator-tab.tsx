"use client";

// ============================================================
// KoordinatorTab (15 Okt 2026) — tab "Koordinator" di Ruang Bot (master) dengan tiga sub tab:
//   • Arahan & Usulan — Nara membaca arahan dan mengusulkan tugas bot (KoordinatorView, tahap 3).
//   • Siaran Anggota  — siarkan satu video ke akun sosmed anggota lewat upload-post (wizard).
//   • Riwayat Siaran  — pantau siaran per akun: jeda, lanjut, ulangi yang gagal, batalkan.
// Wizard tetap terpasang saat berpindah sub tab supaya isian tidak hilang; riwayat hanya
// dipasang saat dibuka (ia menyegarkan diri berkala).
// ============================================================

import { useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { KoordinatorView } from "./koordinator-view";
import { SiaranAnggotaView } from "./siaran-anggota-view";
import { RiwayatSiaranView } from "./riwayat-siaran-view";

type SubTab = "arahan" | "siaran" | "riwayat";

const SUB: { kunci: SubTab; label: string; baru?: boolean }[] = [
  { kunci: "arahan", label: "Arahan & Usulan" },
  { kunci: "siaran", label: "Siaran Anggota", baru: true },
  { kunci: "riwayat", label: "Riwayat Siaran" },
];

export function KoordinatorTab() {
  const [sub, setSub] = useState<SubTab>("arahan");
  const tombol = useRef<(HTMLButtonElement | null)[]>([]);

  function geser(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const arah = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!arah) return;
    e.preventDefault();
    const j = (i + arah + SUB.length) % SUB.length;
    setSub(SUB[j]!.kunci);
    tombol.current[j]?.focus();
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Sub tab koordinator" className="flex w-fit max-w-full flex-wrap gap-1 rounded-2xl bg-black/5 p-1 dark:bg-white/10">
        {SUB.map((t, i) => {
          const aktif = sub === t.kunci;
          return (
            <button
              key={t.kunci}
              ref={(el) => {
                tombol.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`kd-tab-${t.kunci}`}
              aria-selected={aktif}
              aria-controls={`kd-panel-${t.kunci}`}
              tabIndex={aktif ? 0 : -1}
              onClick={() => setSub(t.kunci)}
              onKeyDown={(e) => geser(e, i)}
              className={cn(
                "btn-tekan flex min-h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold",
                aktif ? "bg-white text-teks-utama shadow-sm dark:bg-white/15" : "text-teks-sekunder",
              )}
            >
              {t.label}
              {t.baru && <span className="rounded-full bg-[#1D4ED8] px-1.5 py-0.5 text-[9.5px] font-extrabold text-white">BARU</span>}
            </button>
          );
        })}
      </div>

      <div id="kd-panel-arahan" role="tabpanel" aria-labelledby="kd-tab-arahan" hidden={sub !== "arahan"}>
        <KoordinatorView />
      </div>
      <div id="kd-panel-siaran" role="tabpanel" aria-labelledby="kd-tab-siaran" hidden={sub !== "siaran"}>
        <SiaranAnggotaView onTerkirim={() => setSub("riwayat")} />
      </div>
      {sub === "riwayat" && (
        <div id="kd-panel-riwayat" role="tabpanel" aria-labelledby="kd-tab-riwayat">
          <RiwayatSiaranView />
        </div>
      )}
    </div>
  );
}

"use client";

// ============================================================
// ModalHadiahHarian (5 Sep 2026) — HADIAH LOGIN HARIAN.
// Sekali per hari (WIB) saat aplikasi dibuka: kalender 7 hari beruntun,
// tombol Klaim. Diperiksa SEKALI per sesi tab (sessionStorage) supaya tidak
// ada permintaan berulang; tanpa animasi berat — hanya transisi CSS ringan.
// ============================================================

import { useEffect, useState } from "react";
import { Check, Gift, Sparkles, X } from "lucide-react";
import { toast, useAppStore } from "@/hooks/use-app-store";
import { getPetHarian, klaimPetHarian, type KeadaanHarian } from "@/services";
import { cn } from "@/lib/utils";

const KUNCI_CEK = "pri-harian-cek";

function tanggalWib(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

export function ModalHadiahHarian({ tunda = false }: { tunda?: boolean }) {
  // `tunda` (mis. changelog sedang terbuka) hanya MENYEMBUNYIKAN tampilan —
  // komponen tetap terpasang supaya pemeriksaan sekali-per-sesi tidak hangus.
  const user = useAppStore((s) => s.user);
  const [k, setK] = useState<KeadaanHarian | null>(null);
  const [buka, setBuka] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [sukses, setSukses] = useState(false);

  useEffect(() => {
    if (!user) return;
    const hari = tanggalWib();
    try {
      if (sessionStorage.getItem(KUNCI_CEK) === `${user.id}:${hari}`) return;
    } catch {
      // sessionStorage terblokir → periksa saja
    }
    let hidup = true;
    getPetHarian()
      .then((d) => {
        if (!hidup) return;
        try {
          sessionStorage.setItem(KUNCI_CEK, `${user.id}:${hari}`);
        } catch {
          // abaikan
        }
        setK(d);
        if (!d.sudah_klaim && d.koin_hari_ini > 0) setBuka(true);
      })
      .catch(() => {
        // hadiah hanyalah bonus — jangan ganggu alur aplikasi
      });
    return () => {
      hidup = false;
    };
  }, [user]);

  async function klaim() {
    if (sibuk || !k) return;
    setSibuk(true);
    try {
      const r = await klaimPetHarian();
      setK(r);
      setSukses(true);
      toast("sukses", r.pesan ?? "Hadiah diklaim");
      setTimeout(() => setBuka(false), 1400);
    } catch (e) {
      toast("error", "Gagal klaim", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(false);
    }
  }

  if (!buka || !k || tunda) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-5" role="dialog" aria-modal="true" aria-label="Hadiah login harian">
      <div className="glass-strong w-full max-w-[360px] rounded-3xl p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: "linear-gradient(135deg, #F59E0B, #DC2626)" }} aria-hidden="true">
            <Gift className="h-5.5 w-5.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-heading text-base font-extrabold text-teks-utama">Hadiah Login Harian</p>
            <p className="text-[11.5px] text-teks-sekunder">
              Hari ke-{k.hari_ke} dari 7 · beruntun {k.streak} hari. Login tiap hari, hari ke-7 dapat dua kali lipat!
            </p>
          </div>
          <button type="button" onClick={() => setBuka(false)} aria-label="Tutup" className="glass btn-tekan flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-teks-utama">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {k.kalender.map((h) => (
            <div
              key={h.hari}
              className={cn(
                "flex flex-col items-center rounded-xl border py-2 text-center",
                h.hari_ini
                  ? "border-amber-400 bg-amber-400/15 shadow-[0_0_0_2px_rgba(245,158,11,0.35)]"
                  : h.diklaim
                    ? "border-emerald-400/50 bg-emerald-400/10"
                    : "border-black/10 bg-black/[0.03] dark:border-white/10 dark:bg-white/[0.04]",
              )}
            >
              <span className="text-[9px] font-bold uppercase text-teks-sekunder">H{h.hari}</span>
              <span className="mt-0.5 flex h-6 w-6 items-center justify-center">
                {h.diklaim && !h.hari_ini ? (
                  <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                ) : (
                  <img src="/KMP.svg" alt="" aria-hidden="true" className={cn("h-5 w-5", h.hari === 7 && "drop-shadow-[0_0_4px_rgba(245,158,11,0.9)]")} />
                )}
              </span>
              <span className="text-[10px] font-extrabold text-teks-utama">{h.koin}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void klaim()}
          disabled={sibuk || sukses || k.sudah_klaim}
          className="btn-tekan mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-extrabold text-white disabled:opacity-70"
          style={{ background: sukses ? "linear-gradient(135deg, #16A34A, #15803D)" : "linear-gradient(135deg, #DC2626, #B91C1C)" }}
        >
          {sukses ? <Check className="h-5 w-5" aria-hidden="true" /> : <Sparkles className="h-5 w-5" aria-hidden="true" />}
          {sukses ? `+${k.kalender[k.hari_ke - 1]?.koin ?? k.koin_hari_ini} koin diterima!` : sibuk ? "Mengklaim…" : `Klaim +${k.koin_hari_ini} koin`}
        </button>
        <p className="mt-2 text-center text-[10.5px] text-teks-sekunder">Saldo: {k.saldo} koin · koin dipakai di Toko Pet & Pasar</p>
      </div>
    </div>
  );
}

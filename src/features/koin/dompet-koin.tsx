"use client";

// ============================================================
// Dompet Koin di Beranda (5 Okt 2026) — kartu saldo ala e-wallet.
//
// Saldo bisa disembunyikan (ikon mata, diingat per perangkat), riwayat
// transaksi terbaru dibuka sebagai lembar bawah. Pimpinan Redaksi,
// superadmin, dan master mendapat tombol "Kelola Koin": memberi koin per
// video anggota dan me-reset koin (features/koin/kelola-koin).
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff, History, Loader2, Settings2, X } from "lucide-react";
import { useSegarOtomatis } from "@/hooks/use-segar-otomatis";
import { getDompetKoin, type DompetKoin } from "@/services";
import { teksAngkaKoin } from "@/lib/koin-chat";
import { cn } from "@/lib/utils";
import { KelolaKoin } from "./kelola-koin";

const KUNCI_SEMBUNYI = "dompet-koin-sembunyi";

function bacaSembunyi(): boolean {
  try {
    return localStorage.getItem(KUNCI_SEMBUNYI) === "1";
  } catch {
    return false;
  }
}

const tanggalPendek = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function DompetKoinBeranda() {
  const [data, setData] = useState<DompetKoin | null>(null);
  const [galat, setGalat] = useState(false);
  const [sembunyi, setSembunyi] = useState(bacaSembunyi);
  const [lembar, setLembar] = useState<"riwayat" | "kelola" | null>(null);

  const muat = useCallback(() => {
    getDompetKoin()
      .then((d) => {
        setData(d);
        setGalat(false);
      })
      .catch(() => setGalat(true));
  }, []);
  // Muat saat kartu pertama dibuka; penyegaran berkala baru berjalan kemudian.
  useEffect(() => { muat(); }, [muat]);
  useSegarOtomatis(muat, 60);

  function aturSembunyi() {
    setSembunyi((v) => {
      try {
        localStorage.setItem(KUNCI_SEMBUNYI, v ? "0" : "1");
      } catch {
        // penyimpanan diblokir: cukup untuk sesi ini
      }
      return !v;
    });
  }

  return (
    <>
      <section
        aria-label="Dompet koin"
        className="relative mt-4 overflow-hidden rounded-3xl p-4 text-white shadow-lg"
        style={{ background: "linear-gradient(135deg, #00AED6 0%, #0284C7 55%, #1E40AF 100%)" }}
      >
        {/* Lingkaran hiasan seperti kartu e-wallet */}
        <span className="pointer-events-none absolute -top-10 -right-8 h-36 w-36 rounded-full bg-white/10" aria-hidden="true" />
        <span className="pointer-events-none absolute -bottom-14 left-1/3 h-32 w-32 rounded-full bg-white/5" aria-hidden="true" />

        <div className="relative flex items-center gap-2">
          <img src="/KMP.svg" alt="" aria-hidden="true" className="h-6 w-6 drop-shadow" />
          <p className="text-[12.5px] font-bold tracking-wide text-white/90">Dompet Koin</p>
          <button
            type="button"
            onClick={aturSembunyi}
            aria-label={sembunyi ? "Tampilkan saldo" : "Sembunyikan saldo"}
            className="btn-tekan ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/15"
          >
            {sembunyi ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <div className="relative mt-2 flex items-baseline gap-1.5" aria-live="polite">
          {data === null && !galat ? (
            <Loader2 className="h-6 w-6 animate-spin text-white/80" />
          ) : (
            <>
              <span className="angka-tab font-heading text-[30px] leading-none font-extrabold">
                {galat && data === null ? "—" : sembunyi ? "••••••" : teksAngkaKoin(data?.saldo ?? 0)}
              </span>
              <span className="text-[13px] font-bold text-white/80">koin</span>
            </>
          )}
        </div>
        <p className="relative mt-1 text-[10.5px] text-white/75">
          Koin diberikan Pimpinan Redaksi untuk video yang kamu unggah.
        </p>

        <div className="relative mt-3.5 flex gap-2">
          <TombolDompet ikon={History} label="Riwayat" onClick={() => setLembar("riwayat")} />
          {data?.boleh_kelola && <TombolDompet ikon={Settings2} label="Kelola Koin" onClick={() => setLembar("kelola")} />}
        </div>
      </section>

      {lembar === "riwayat" && <LembarRiwayat data={data} onTutup={() => setLembar(null)} />}
      {lembar === "kelola" && (
        <KelolaKoin
          onTutup={() => {
            setLembar(null);
            muat();
          }}
        />
      )}
    </>
  );
}

function TombolDompet({ ikon: Ikon, label, onClick }: { ikon: typeof History; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white/15 py-2.5 text-[12px] font-bold backdrop-blur-sm"
    >
      <Ikon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}

function LembarRiwayat({ data, onTutup }: { data: DompetKoin | null; onTutup: () => void }) {
  if (typeof document === "undefined") return null;
  const riwayat = data?.riwayat ?? [];
  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Riwayat koin">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onTutup} />
      <div className="glass relative flex max-h-[80dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl">
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          <History className="h-5 w-5 text-sky-500" aria-hidden="true" />
          <p className="font-heading text-[15px] font-extrabold text-teks-utama">Riwayat Koin</p>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            className="glass btn-tekan ml-auto flex h-9 w-9 items-center justify-center rounded-xl text-teks-utama"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="scrollbar-tipis flex-1 overflow-y-auto px-4 pb-4">
          {riwayat.length === 0 ? (
            <p className="glass-soft rounded-xl p-3 text-[12px] text-teks-sekunder">Belum ada transaksi koin.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {riwayat.map((r) => (
                <li key={r.id} className="glass-soft flex items-center gap-3 rounded-xl p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-bold text-teks-utama">{r.label}</p>
                    <p className="text-[10.5px] text-teks-sekunder">
                      {tanggalPendek(r.tanggal)}
                      {r.catatan ? ` · ${r.catatan}` : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "angka-tab shrink-0 text-[13px] font-extrabold",
                      r.jumlah >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-gagal",
                    )}
                  >
                    {r.jumlah >= 0 ? "+" : "−"}
                    {teksAngkaKoin(Math.abs(r.jumlah))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

"use client";

// ============================================================
// DompetTmp (7 Okt 2026, desain baru — lib/desain-apple desainBaru):
// dompet koin tampil sebagai TOKEN MERAH PUTIH (TMP). Saldo besar,
// transfer masuk terakhir beserta PENGIRIMNYA, dan Riwayat transfer yang
// tiap barisnya bisa dibuka (pengirim, penerima, keterangan, waktu, ID).
// Tanpa grafik/tukar/statistik. Data sama dengan DompetKoinBeranda
// (/api/koin); pengirim dicatat sejak sql/62.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronRight, Eye, EyeOff, History, Settings2, TrendingUp, X } from "lucide-react";
import { AvatarInisial } from "@/components/pri-ui";
import { useAppStore } from "@/hooks/use-app-store";
import { useSegarOtomatis } from "@/hooks/use-segar-otomatis";
import { teksAngkaKoin } from "@/lib/koin-chat";
import { cn } from "@/lib/utils";
import { getDompetKoin, type DompetKoin, type RiwayatKoin } from "@/services";
import { KelolaKoin } from "./kelola-koin";

const KUNCI_SEMBUNYI = "dompet-koin-sembunyi";
const PEGAS = { type: "spring", bounce: 0, duration: 0.45 } as const;

function bacaSembunyi(): boolean {
  try {
    return localStorage.getItem(KUNCI_SEMBUNYI) === "1";
  } catch {
    return false;
  }
}

const waktuPendek = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

/** Logo token: lingkaran merah–putih bertuliskan TMP. */
export function LogoTmp({ ukuran = 38 }: { ukuran?: number }) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{ width: ukuran, height: ukuran, boxShadow: "0 0 0 2px rgba(255,255,255,0.85), 0 4px 10px rgba(0,0,0,0.25)" }}
    >
      <span className="absolute inset-x-0 top-0 h-1/2 bg-[#E11D2E]" />
      <span className="absolute inset-x-0 bottom-0 h-1/2 bg-white" />
      <b className="relative text-[9.5px] font-black tracking-wide text-white" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6), 0 0 6px rgba(150,0,0,0.6)" }}>
        TMP
      </b>
    </span>
  );
}

function FotoPengirim({ r, ukuran }: { r: RiwayatKoin; ukuran: number }) {
  const p = r.pemberi;
  if (p?.avatar_url) {
    return <img src={p.avatar_url} alt="" className="shrink-0 rounded-full object-cover" style={{ width: ukuran, height: ukuran }} />;
  }
  return <AvatarInisial nama={p?.nama || r.label || "PRI"} ukuran={ukuran} />;
}

const namaPengirim = (r: RiwayatKoin) => r.pemberi?.nama || "Sistem PRI SuperApp";

export function DompetTmp() {
  const user = useAppStore((s) => s.user);
  const [data, setData] = useState<DompetKoin | null>(null);
  const [galat, setGalat] = useState(false);
  const [sembunyi, setSembunyi] = useState(bacaSembunyi);
  const [lembar, setLembar] = useState<{ jenis: "riwayat"; buka?: string } | { jenis: "kelola" } | null>(null);

  const muat = useCallback(() => {
    getDompetKoin()
      .then((d) => {
        setData(d);
        setGalat(false);
      })
      .catch(() => setGalat(true));
  }, []);
  useEffect(() => { muat(); }, [muat]);
  useSegarOtomatis(muat, 60);

  const masuk = useMemo(() => (data?.riwayat ?? []).filter((r) => r.jumlah > 0), [data]);
  const pekanIni = useMemo(() => {
    const batas = Date.now() - 7 * 24 * 3600 * 1000;
    return masuk.filter((r) => new Date(r.tanggal).getTime() >= batas).reduce((a, r) => a + r.jumlah, 0);
  }, [masuk]);

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
        aria-label="Dompet Token Merah Putih"
        className="dompet-tmp relative isolate h-full overflow-hidden rounded-[24px] p-[18px] text-white sm:p-5"
      >
        <div className="flex items-center gap-2.5">
          <LogoTmp />
          <span className="min-w-0 flex-1">
            <b className="block text-[15px]">Token Merah Putih</b>
            <span className="block truncate text-xs text-white/70">TMP · Dompet @{user?.username ?? "saya"}</span>
          </span>
          <span className="hidden h-[26px] items-center gap-1.5 rounded-full bg-white/15 px-2.5 text-[11.5px] font-bold sm:inline-flex">
            <span className="tmp-nadi h-1.5 w-1.5 rounded-full bg-white" />
            Aktif
          </span>
          {data?.boleh_kelola && (
            <button type="button" onClick={() => setLembar({ jenis: "kelola" })} aria-label="Kelola koin anggota" className="btn-tekan flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
              <Settings2 className="h-4 w-4" />
            </button>
          )}
          <button type="button" onClick={aturSembunyi} aria-label={sembunyi ? "Tampilkan saldo" : "Sembunyikan saldo"} className="btn-tekan flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
            {sembunyi ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <div className="mt-3.5 grid gap-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:items-end">
          <div>
            <p className="text-xs text-white/70">Saldo</p>
            <p className={cn("angka-tab mt-0.5 text-[clamp(42px,6vw,58px)] leading-none font-bold tracking-[-0.045em] transition-[filter] duration-500", sembunyi && "blur-[12px]")} aria-live="polite">
              {galat && data === null ? "—" : data === null ? "…" : teksAngkaKoin(data.saldo)}
              <small className="ml-2 text-base font-bold tracking-wider text-white/80">TMP</small>
            </p>
            <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[12.5px] font-bold">
              <TrendingUp className="h-3.5 w-3.5" />+{teksAngkaKoin(pekanIni)} TMP <span className="font-medium text-white/70">pekan ini</span>
            </p>
            <button
              type="button"
              onClick={() => setLembar({ jenis: "riwayat" })}
              className="btn-tekan mt-4 flex h-[42px] w-fit items-center gap-2 rounded-[13px] bg-white pr-3.5 pl-4 text-sm font-bold text-[#9E0B1F] shadow-[0_8px_18px_rgba(0,0,0,0.18)]"
            >
              <History className="h-4 w-4" />Riwayat transfer<ChevronRight className="h-4 w-4 opacity-60" />
            </button>
          </div>
          <div className="min-w-0">
            <p className="mb-1.5 ml-0.5 text-xs font-semibold text-white/70">Transfer masuk terakhir</p>
            {masuk.length === 0 ? (
              <p className="rounded-[14px] bg-white/10 px-3 py-3 text-[12.5px] text-white/80">
                {data === null ? "Memuat…" : "Belum ada transfer. TMP diberikan Pimpinan Redaksi untuk video Anda."}
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {masuk.slice(0, 3).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setLembar({ jenis: "riwayat", buka: r.id })}
                    className="btn-tekan flex w-full items-center gap-2.5 rounded-[14px] bg-white/10 px-2.5 py-2 text-left transition-colors hover:bg-white/[0.18]"
                  >
                    <FotoPengirim r={r} ukuran={34} />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[13.5px]">{namaPengirim(r)}</b>
                      <span className="block truncate text-xs text-white/70">{r.pemberi?.jabatan || r.label} · {waktuPendek(r.tanggal)}</span>
                    </span>
                    <b className="angka-tab rounded-full bg-white/15 px-2.5 py-0.5 text-[15px]">+{teksAngkaKoin(r.jumlah)}</b>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {lembar?.jenis === "riwayat" && (
        <LembarRiwayatTmp data={data} bukaAwal={lembar.buka} namaSaya={user?.nama ?? ""} onTutup={() => setLembar(null)} />
      )}
      {lembar?.jenis === "kelola" && (
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

function LembarRiwayatTmp({ data, bukaAwal, namaSaya, onTutup }: { data: DompetKoin | null; bukaAwal?: string; namaSaya: string; onTutup: () => void }) {
  const [buka, setBuka] = useState<string | undefined>(bukaAwal);
  const [tampil, setTampil] = useState(true);
  const riwayat = data?.riwayat ?? [];
  const totalMasuk = riwayat.filter((r) => r.jumlah > 0).reduce((a, r) => a + r.jumlah, 0);

  useEffect(() => {
    const tekan = (e: KeyboardEvent) => e.key === "Escape" && setTampil(false);
    window.addEventListener("keydown", tekan);
    return () => window.removeEventListener("keydown", tekan);
  }, []);

  return createPortal(
    <AnimatePresence onExitComplete={onTutup}>
      {tampil && (
        <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label="Riwayat Token Merah Putih">
          <motion.div className="absolute inset-0 bg-black/25" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setTampil(false)} />
          <motion.section
            className="glass-strong absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden sm:inset-y-3 sm:right-3 sm:w-[420px] sm:rounded-[26px]"
            initial={{ x: "105%" }}
            animate={{ x: 0 }}
            exit={{ x: "105%" }}
            transition={PEGAS}
          >
            <div className="flex items-center gap-2.5 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
              <h2 className="flex-1 font-heading text-[26px] font-bold tracking-tight text-teks-utama">Riwayat TMP</h2>
              <button type="button" onClick={() => setTampil(false)} aria-label="Tutup" className="glass btn-tekan flex h-10 w-10 items-center justify-center rounded-full text-teks-utama">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-8">
              <section className="dompet-tmp relative isolate mb-3 overflow-hidden rounded-[22px] p-4 text-white">
                <div className="flex items-center gap-2.5">
                  <LogoTmp ukuran={34} />
                  <span className="flex-1"><b className="block">Token Merah Putih</b><span className="text-xs text-white/70">Saldo saat ini</span></span>
                </div>
                <p className="angka-tab mt-3 text-[44px] leading-none font-bold tracking-[-0.045em]">
                  {teksAngkaKoin(data?.saldo ?? 0)}<small className="ml-2 text-base font-bold text-white/80">TMP</small>
                </p>
                <p className="mt-1.5 text-xs text-white/75">{riwayat.length} transaksi terakhir · masuk +{teksAngkaKoin(totalMasuk)} TMP</p>
              </section>
              <p className="mx-1.5 mb-2 text-[10.5px] font-bold tracking-[0.07em] text-teks-sekunder uppercase">Ketuk untuk melihat pengirim & keterangannya</p>
              {riwayat.length === 0 ? (
                <p className="glass rounded-2xl p-5 text-center text-sm text-teks-sekunder">Belum ada riwayat.</p>
              ) : (
                <div className="glass rounded-[22px] p-1.5">
                  {riwayat.map((r, i) => {
                    const terbuka = buka === r.id;
                    return (
                      <div key={r.id} className={cn(i > 0 && "border-t border-teks-utama/10")}>
                        <button type="button" onClick={() => setBuka(terbuka ? undefined : r.id)} aria-expanded={terbuka} className="btn-tekan flex w-full items-center gap-3 rounded-2xl p-2.5 text-left hover:bg-teks-utama/5">
                          <FotoPengirim r={r} ukuran={38} />
                          <span className="min-w-0 flex-1">
                            <b className="block truncate text-[14.5px] text-teks-utama">{r.jumlah > 0 ? `Dari ${namaPengirim(r)}` : r.label}</b>
                            <span className="block truncate text-xs text-teks-sekunder">{r.pemberi?.jabatan || r.label} · {waktuPendek(r.tanggal)}</span>
                          </span>
                          <b className={cn("angka-tab text-[15px]", r.jumlah > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-teks-sekunder")}>
                            {r.jumlah > 0 ? "+" : "−"}{teksAngkaKoin(Math.abs(r.jumlah))}
                          </b>
                          <ChevronDown className={cn("h-4 w-4 shrink-0 text-teks-sekunder transition-transform duration-300", terbuka && "rotate-180")} />
                        </button>
                        <AnimatePresence initial={false}>
                          {terbuka && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={PEGAS} className="overflow-hidden">
                              <dl className="grid gap-1.5 px-2.5 pb-3">
                                {[
                                  ["Pengirim", r.pemberi ? `${r.pemberi.nama}${r.pemberi.jabatan ? ` · ${r.pemberi.jabatan}` : ""}` : "Sistem PRI SuperApp"],
                                  ["Penerima", namaSaya],
                                  ["Keterangan", [r.label, r.catatan].filter(Boolean).join(" · ")],
                                  ["Waktu", `${waktuPendek(r.tanggal)} WIB`],
                                  ["ID transaksi", `TMP-${r.id}`],
                                ].map(([k, v]) => (
                                  <div key={k} className="flex justify-between gap-3 rounded-[10px] bg-teks-utama/[0.06] px-2.5 py-1.5 text-[13px]">
                                    <dt className="text-teks-sekunder">{k}</dt>
                                    <dd className="text-right font-semibold text-teks-utama">{v}</dd>
                                  </div>
                                ))}
                              </dl>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.section>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

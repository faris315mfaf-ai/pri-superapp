"use client";

// ============================================================
// ModalKirimLaporan — KIRIM LAPORAN VIDEO HARI INI ke WhatsApp (5 Sep 2026).
// Pop-up memastikan semua video siap, lalu bot mengirim ke grup/nomor yang
// diatur master. Batas: 2× per hari (WIB), jeda 1 jam.
// ============================================================

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2, MessageCircle, Send, X } from "lucide-react";
import { PlatformIcon, labelPlatform } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import { getKirimLaporan, kirimLaporanWa, type KeadaanKirimLaporan } from "@/services";
import { jamWIB } from "@/lib/format";
import { cn } from "@/lib/utils";

const LABEL_KANAL: Record<string, string> = { fonnte_grup: "grup WhatsApp", convia_nomor: "nomor WhatsApp", belum: "belum diatur" };

export function ModalKirimLaporan({ onTutup }: { onTutup: () => void }) {
  const [k, setK] = useState<KeadaanKirimLaporan | null>(null);
  const [galat, setGalat] = useState("");
  const [siap, setSiap] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [selesai, setSelesai] = useState(false);

  useEffect(() => {
    let hidup = true;
    getKirimLaporan()
      .then((d) => hidup && setK(d))
      .catch((e) => hidup && setGalat(e instanceof Error ? e.message : "Gagal memuat"));
    return () => {
      hidup = false;
    };
  }, []);

  async function kirim() {
    if (sibuk || !k?.boleh || !siap) return;
    setSibuk(true);
    try {
      const r = await kirimLaporanWa();
      setK(r);
      setSelesai(true);
      toast("sukses", "Laporan terkirim ke WhatsApp", `${r.jumlah ?? 0} video · sisa jatah hari ini ${Math.max(0, r.batas_per_hari - r.terkirim_hari_ini)}×`);
    } catch (e) {
      toast("error", "Gagal mengirim", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(false);
    }
  }

  const per = Object.entries(k?.per_platform ?? {}).filter(([, d]) => d.length > 0);
  return (
    <AnimatePresence>
      <motion.div key="kirim" className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-3 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onTutup}>
        <motion.div role="dialog" aria-modal="true" aria-label="Kirim laporan ke WhatsApp" className="glass-strong max-h-[88vh] w-full max-w-[420px] overflow-y-auto rounded-3xl p-5" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }} transition={{ type: "spring", stiffness: 360, damping: 30 }} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: "linear-gradient(135deg, #16A34A, #15803D)" }} aria-hidden="true">
              <MessageCircle className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-heading text-base font-extrabold text-teks-utama">Kirim laporan ke WhatsApp</p>
              <p className="text-[11.5px] text-teks-sekunder">Bot mengirim daftar video hari ini ke {k ? LABEL_KANAL[k.kanal] : "…"}. Maks {k?.batas_per_hari ?? 2}× sehari, jeda {k?.jeda_menit ?? 60} menit.</p>
            </div>
            <button type="button" onClick={onTutup} aria-label="Tutup" className="glass btn-tekan flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-teks-utama">
              <X className="h-4 w-4" />
            </button>
          </div>

          {galat ? (
            <p className="mt-4 rounded-xl bg-gagal/10 px-3 py-2 text-[12px] text-gagal">{galat}</p>
          ) : !k ? (
            <p className="mt-4 flex items-center gap-2 text-[12px] text-teks-sekunder">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Menyiapkan daftar video…
            </p>
          ) : (
            <>
              <div className="mt-4 rounded-2xl bg-black/[0.03] p-3 dark:bg-white/[0.05]">
                <p className="text-[11px] font-bold uppercase tracking-wide text-teks-sekunder">
                  Video hari ini · {k.jumlah ?? 0} tercatat{k.menunggu ? ` · ${k.menunggu} menunggu ACC` : ""}
                </p>
                {per.length === 0 ? (
                  <p className="mt-1 text-[12px] text-teks-sekunder">Belum ada video tercatat hari ini.</p>
                ) : (
                  per.map(([pf, daftar]) => (
                    <div key={pf} className="mt-2">
                      <p className="flex items-center gap-1 text-[11.5px] font-bold text-teks-utama">
                        <PlatformIcon platform={pf} size={12} /> {labelPlatform(pf)} ({daftar.length})
                      </p>
                      {daftar.map((u) => (
                        <p key={u} className="truncate pl-4 text-[11px] text-teks-sekunder">{u}</p>
                      ))}
                    </div>
                  ))
                )}
              </div>

              {k.riwayat.length > 0 ? (
                <p className="mt-2 text-[11px] text-teks-sekunder">
                  Hari ini: {k.riwayat.map((r) => `${jamWIB(r.dikirim_pada)} (${r.status})`).join(", ")}
                </p>
              ) : null}

              {selesai ? (
                <p className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-500/12 px-3 py-2.5 text-[12.5px] font-bold text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Laporan terkirim. Sisa jatah hari ini: {Math.max(0, k.batas_per_hari - k.terkirim_hari_ini)}×
                </p>
              ) : (
                <>
                  {!k.boleh ? <p className="mt-3 rounded-xl bg-amber-400/15 px-3 py-2 text-[12px] font-semibold text-amber-800 dark:text-amber-200">{k.alasan}</p> : null}
                  <label className={cn("mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5", siap ? "border-emerald-400/60 bg-emerald-400/10" : "border-black/10 dark:border-white/10")}>
                    <input type="checkbox" checked={siap} onChange={(e) => setSiap(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#16A34A]" />
                    <span className="text-[12px] leading-snug text-teks-utama">Saya memastikan semua video hari ini sudah siap dikirimkan sebagai laporan.</span>
                  </label>
                  <button type="button" onClick={() => void kirim()} disabled={!k.boleh || !siap || sibuk || (k.jumlah ?? 0) + (k.menunggu ?? 0) === 0} className="btn-tekan mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[13.5px] font-extrabold text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg, #16A34A, #15803D)" }}>
                    {sibuk ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                    {sibuk ? "Mengirim…" : "Kirim sekarang"}
                  </button>
                </>
              )}
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

"use client";

// ============================================================
// Panel Master → FITUR BERAT & MODE HEMAT (4 Sep 2026)
//
// Sakelar fitur yang membebani server (Ludo, robot melayang, efek juara,
// asisten AI). Dua lapis:
//   • MODE HEMAT — satu tombol darurat: semua fitur berat mati sekaligus
//     (dinyalakan otomatis oleh pemantau server bila "hemat otomatis" aktif).
//   • Sakelar per fitur — berlaku saat mode hemat MATI.
// Ditambah tombol "Periksa server sekarang" yang menjalankan pemantau yang
// sama dengan cron 10 menit dan menampilkan hasilnya.
// ============================================================

import { useState } from "react";
import { Activity, Gauge, Loader2, ShieldAlert } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { SectionTitle } from "@/components/pri-ui";
import { SwitchKaca } from "./switch-kaca";
import { toast } from "@/hooks/use-app-store";
import { aksiMasterHasil } from "@/services";
import { DAFTAR_FITUR_BERAT } from "@/lib/sakelar";
import { cn } from "@/lib/utils";

type HasilPantau = {
  anomali: string[];
  db_ms: number | null;
  galat_klien: number;
  siaran_macet: number;
  hemat_dinyalakan: boolean;
  notif_dikirim: string;
  metrik: { cpu_persen: number | null; ram_persen: number | null; disk_persen: number | null } | null;
  galat_metrik: string;
};

export function SeksiSakelarBerat({
  pengaturan,
  sedangProses,
  onJalankan,
}: {
  pengaturan: Record<string, string>;
  sedangProses: boolean;
  onJalankan: (aksi: string, isi: Record<string, string | boolean>, pesan: string) => Promise<void>;
}) {
  const hemat = pengaturan.mode_hemat === "true";
  const hematOtomatis = pengaturan.hemat_otomatis !== "false";
  const [memeriksa, setMemeriksa] = useState(false);
  const [hasil, setHasil] = useState<HasilPantau | null>(null);

  async function periksa() {
    if (memeriksa) return;
    setMemeriksa(true);
    try {
      const r = await aksiMasterHasil("pantau_sekarang");
      const h = (r.hasil ?? null) as HasilPantau | null;
      setHasil(h);
      if (h && h.anomali.length > 0) toast("error", "Server anomali", h.anomali.join(" · "));
      else toast("sukses", "Server normal", "Tidak ada anomali terdeteksi.");
    } catch (e) {
      toast("error", "Gagal memeriksa server", e instanceof Error ? e.message : "");
    } finally {
      setMemeriksa(false);
    }
  }

  return (
    <div className="mt-6">
      <SectionTitle judul="Fitur Berat & Mode Hemat" />
      <GlassCard className="mt-2.5 p-4">
        {/* Mode hemat */}
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
              hemat ? "bg-red-500/15 text-red-600 dark:text-red-400" : "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
            )}
          >
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-teks-utama">Mode hemat server</p>
              <SwitchKaca
                aktif={hemat}
                disabled={sedangProses}
                onUbah={() =>
                  void onJalankan(
                    "mode_hemat",
                    { nilai: !hemat },
                    hemat ? "Mode hemat DIMATIKAN — fitur berat mengikuti sakelar masing-masing" : "MODE HEMAT menyala — semua fitur berat dimatikan",
                  )
                }
                labelAria="Mode hemat server"
              />
            </div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-teks-sekunder">
              Tombol darurat: mematikan SEMUA fitur berat sekaligus supaya server lega saat proses besar (unggah video serentak, render Studio). Nyalakan sebelum acara besar, matikan setelah aman.
            </p>
            <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.05]">
              <p className="text-[11.5px] font-semibold text-teks-utama">Nyalakan otomatis saat anomali</p>
              <SwitchKaca
                aktif={hematOtomatis}
                disabled={sedangProses}
                onUbah={() =>
                  void onJalankan(
                    "hemat_otomatis",
                    { nilai: !hematOtomatis },
                    hematOtomatis ? "Mode hemat otomatis dimatikan" : "Mode hemat otomatis dinyalakan",
                  )
                }
                labelAria="Mode hemat otomatis saat anomali"
              />
            </div>
          </div>
        </div>

        {/* Sakelar per fitur */}
        <div className="mt-4 flex flex-col gap-2">
          {DAFTAR_FITUR_BERAT.map((f) => {
            const nyala = !hemat && pengaturan[`fitur_${f.kunci}`] !== "false";
            return (
              <div
                key={f.kunci}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5",
                  nyala ? "border-emerald-400/30 bg-emerald-400/8" : "border-black/5 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.04]",
                )}
              >
                <div className="min-w-0">
                  <p className="text-[12.5px] font-bold text-teks-utama">
                    {f.label}
                    {hemat && (
                      <span className="ml-1.5 rounded-full bg-red-500/12 px-1.5 py-0.5 text-[9.5px] font-bold text-red-600 dark:text-red-400">mode hemat</span>
                    )}
                  </p>
                  <p className="text-[10.5px] leading-snug text-teks-sekunder">{f.keterangan}</p>
                </div>
                <SwitchKaca
                  aktif={nyala}
                  disabled={sedangProses || hemat}
                  onUbah={() => {
                    const kini = pengaturan[`fitur_${f.kunci}`] !== "false";
                    void onJalankan(
                      "sakelar_fitur",
                      { kunci: f.kunci, nilai: !kini },
                      kini ? `${f.label} DIMATIKAN sementara` : `${f.label} dinyalakan lagi`,
                    );
                  }}
                  labelAria={f.label}
                />
              </div>
            );
          })}
        </div>

        {/* Periksa server sekarang */}
        <button
          type="button"
          onClick={() => void periksa()}
          disabled={memeriksa}
          className="btn-tekan mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
        >
          {memeriksa ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Activity className="h-4 w-4" aria-hidden="true" />}
          {memeriksa ? "Memeriksa…" : "Periksa server sekarang"}
        </button>
        <p className="mt-1.5 text-center text-[10.5px] text-teks-sekunder">
          Pemantau otomatis berjalan tiap 10 menit; master diberi notifikasi khusus saat ada pertanda server akan down.
        </p>

        {hasil && (
          <div
            className={cn(
              "mt-3 rounded-xl border px-3 py-2.5 text-[11.5px]",
              hasil.anomali.length > 0 ? "border-red-400/40 bg-red-400/10" : "border-emerald-400/40 bg-emerald-400/10",
            )}
          >
            <p className="flex items-center gap-1.5 font-bold text-teks-utama">
              <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
              {hasil.anomali.length > 0 ? `Anomali: ${hasil.anomali.join(" · ")}` : "Server normal"}
            </p>
            <p className="mt-1 text-teks-sekunder">
              CPU {hasil.metrik?.cpu_persen ?? "?"}% · RAM {hasil.metrik?.ram_persen ?? "?"}% · Disk {hasil.metrik?.disk_persen ?? "?"}% · DB {hasil.db_ms ?? "?"} ms · galat klien 10 mnt: {hasil.galat_klien} · siaran macet: {hasil.siaran_macet}
              {hasil.galat_metrik ? ` · metrik: ${hasil.galat_metrik}` : ""}
              {hasil.hemat_dinyalakan ? " · MODE HEMAT dinyalakan otomatis" : ""}
            </p>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

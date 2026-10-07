"use client";

// ============================================================
// Laporan PEMBARUAN 2.1 (7 Okt 2026) di modul Audit — master & superadmin.
// AKTIF = sudah verifikasi WhatsApp + konfirmasi data diri; TIDAK AKTIF =
// belum. Laporan saja: tidak ada akun yang dinonaktifkan otomatis.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { getLaporanPembaruan21, type LaporanPembaruan21 } from "@/services";
import { cn } from "@/lib/utils";

type Saring = "tidak" | "aktif";

const waktu = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })
    : "—";

export function KartuPembaruan21() {
  const [data, setData] = useState<LaporanPembaruan21 | null>(null);
  const [galat, setGalat] = useState("");
  const [buka, setBuka] = useState(false);
  const [saring, setSaring] = useState<Saring>("tidak");
  const [cari, setCari] = useState("");

  useEffect(() => {
    let hidup = true;
    getLaporanPembaruan21()
      .then((d) => hidup && setData(d))
      .catch((e) => hidup && setGalat(e instanceof Error ? e.message : "Laporan gagal dimuat."));
    return () => {
      hidup = false;
    };
  }, []);

  const daftar = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return (data?.pengguna ?? []).filter(
      (p) =>
        (saring === "aktif" ? p.aktif : !p.aktif) &&
        (!q || `${p.nama} ${p.username} ${p.divisi} ${p.jabatan}`.toLowerCase().includes(q)),
    );
  }, [data, saring, cari]);

  const persen = data && data.total > 0 ? Math.round((100 * data.aktif) / data.total) : 0;

  return (
    <GlassCard className="p-3.5">
      <button type="button" onClick={() => setBuka((b) => !b)} aria-expanded={buka} className="flex w-full items-center gap-2.5 text-left">
        <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-teks-utama">Akun aktif · Update 2.1</p>
          <p className="text-[11px] text-teks-sekunder">
            {data
              ? `${data.aktif} aktif · ${data.tidak_aktif} belum verifikasi · ${data.tutorial_selesai} selesai tutorial`
              : galat || "Memuat…"}
          </p>
        </div>
        {data ? (
          <span className="angka-tab shrink-0 text-[15px] font-extrabold text-teks-utama">{persen}%</span>
        ) : (
          !galat && <Loader2 className="h-4 w-4 animate-spin text-teks-sekunder" />
        )}
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-teks-sekunder transition-transform", buka && "rotate-180")} />
      </button>
      {data && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10" aria-hidden="true">
          <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${persen}%` }} />
        </div>
      )}

      {buka && data && (
        <div className="mt-3">
          <p className="text-[10.5px] text-teks-sekunder">
            Aktif = sudah verifikasi WhatsApp & konfirmasi data diri sejak rilis {waktu(data.rilis_pada)} WIB.
          </p>
          <div className="mt-2 flex gap-1.5">
            {(
              [
                ["tidak", `Belum verifikasi (${data.tidak_aktif})`],
                ["aktif", `Aktif (${data.aktif})`],
              ] as [Saring, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setSaring(k)}
                aria-pressed={saring === k}
                className={cn(
                  "btn-tekan shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-bold",
                  saring === k ? "bg-pri text-white" : "glass text-teks-sekunder",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari nama, username, divisi…"
            aria-label="Cari pengguna"
            className="glass mt-2 h-9 w-full rounded-lg px-3 text-[12.5px] text-teks-utama outline-none placeholder:text-teks-sekunder"
          />
          <ul className="scrollbar-tipis mt-2 flex max-h-80 flex-col gap-1 overflow-y-auto">
            {daftar.map((p) => (
              <li key={p.id} className="glass-soft flex items-center gap-2 rounded-lg px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-teks-utama">{p.nama}</p>
                  <p className="truncate text-[10.5px] text-teks-sekunder">
                    {[p.username && `@${p.username}`, p.divisi, p.nomor].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="shrink-0 text-right text-[10px] text-teks-sekunder">
                  {p.aktif ? `Verifikasi ${waktu(p.verifikasi_pada)}` : `Terakhir masuk ${waktu(p.terakhir_masuk)}`}
                </span>
              </li>
            ))}
            {daftar.length === 0 && <p className="py-2 text-center text-[11.5px] text-teks-sekunder">Tidak ada.</p>}
          </ul>
        </div>
      )}
    </GlassCard>
  );
}

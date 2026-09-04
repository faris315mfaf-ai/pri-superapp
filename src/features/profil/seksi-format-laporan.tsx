"use client";

// ============================================================
// Panel Master → FORMAT LAPORAN UPLOAD HARIAN (4 Sep 2026)
//
// Satu kolom besar berisi "pengkodingan sederhana" (template) yang
// menentukan bentuk teks laporan list nama yang upload hari itu — dipakai
// tombol Salin / Bagikan WhatsApp di Studio PALUGODAM → tab Laporan Harian.
// Pratinjau dirender LANGSUNG di layar memakai data contoh, jadi master bisa
// melihat hasilnya sebelum menyimpan.
// ============================================================

import { useEffect, useState } from "react";
import { FileCode2, RotateCcw, Save } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { SectionTitle } from "@/components/pri-ui";
import { contohDataLaporan, renderTemplate, TEMPLATE_LAPORAN_BAWAAN, validasiTemplate } from "@/lib/template-laporan";
import { cn } from "@/lib/utils";

const PANDUAN: [string, string][] = [
  ["{tanggal}", "2026-09-04"],
  ["{tanggal_panjang}", "Jumat, 4 September 2026"],
  ["{jam}", "jam dibuat (WIB)"],
  ["{dibuat_oleh}", "nama pembuat laporan"],
  ["{jumlah_orang} / {jumlah_link}", "total orang / total link"],
  ["{#orang} … {/orang}", "diulang tiap orang: {no} {nama} {username} {divisi} {jumlah}"],
  ["{#platform} … {/platform}", "di dalam orang: {platform} {PLATFORM} {jumlah}"],
  ["{#link} … {/link}", "di dalam platform: {no} {url}"],
  ["{^orang} … {/orang}", "tampil hanya bila TIDAK ada yang upload"],
];

export function SeksiFormatLaporan({
  nilaiTersimpan,
  sedangProses,
  onSimpan,
}: {
  /** Template tersimpan di pengaturan (kosong = pakai bawaan). */
  nilaiTersimpan: string;
  sedangProses: boolean;
  onSimpan: (nilai: string) => Promise<void>;
}) {
  const [teks, setTeks] = useState(nilaiTersimpan || TEMPLATE_LAPORAN_BAWAAN);
  const [dasar, setDasar] = useState(nilaiTersimpan);
  // Bila data tersimpan berubah (setelah simpan / muat ulang), sinkronkan.
  useEffect(() => {
    if (nilaiTersimpan !== dasar) {
      const t = setTimeout(() => {
        setDasar(nilaiTersimpan);
        setTeks(nilaiTersimpan || TEMPLATE_LAPORAN_BAWAAN);
      }, 0);
      return () => clearTimeout(t);
    }
  }, [nilaiTersimpan, dasar]);

  const galat = validasiTemplate(teks);
  const pratinjau = galat ? "" : renderTemplate(teks, contohDataLaporan() as unknown as Record<string, never>);
  const berubah = teks !== (nilaiTersimpan || TEMPLATE_LAPORAN_BAWAAN);

  return (
    <div className="mt-6">
      <SectionTitle judul="Format Laporan Upload Harian" />
      <GlassCard className="mt-2.5 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-500/12 text-violet-600 dark:text-violet-400">
            <FileCode2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-teks-utama">Template laporan (kode sederhana)</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-teks-sekunder">
              Menentukan bentuk teks &quot;list nama yang upload hari ini&quot; saat Admin PALUGODAM menekan Salin / Bagikan WhatsApp. Tulis teks biasa, sisipkan kode kurung kurawal di bawah.
            </p>
          </div>
        </div>

        <textarea
          value={teks}
          onChange={(e) => setTeks(e.target.value)}
          rows={12}
          spellCheck={false}
          aria-label="Template laporan upload harian"
          className={cn(
            "glass-input mt-3 w-full rounded-xl px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-teks-utama",
            galat && "border-red-500/60",
          )}
        />
        {galat ? (
          <p className="mt-1.5 text-[11px] font-semibold text-red-600 dark:text-red-400">Template belum sah: {galat}</p>
        ) : (
          <p className="mt-1.5 text-[11px] text-teks-sekunder">Template sah · {teks.length} karakter</p>
        )}

        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={sedangProses || Boolean(galat) || !berubah}
            onClick={() => void onSimpan(teks.trim() === TEMPLATE_LAPORAN_BAWAAN.trim() ? "" : teks)}
            className="btn-tekan flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-bold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            Simpan format
          </button>
          <button
            type="button"
            disabled={sedangProses}
            onClick={() => setTeks(TEMPLATE_LAPORAN_BAWAAN)}
            className="btn-tekan glass flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-[12.5px] font-bold text-teks-utama disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Bawaan
          </button>
        </div>

        {/* Pratinjau */}
        <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-teks-sekunder">Pratinjau (data contoh)</p>
        <pre className="mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-black/[0.04] p-3 font-sans text-[11.5px] leading-relaxed text-teks-utama dark:bg-white/[0.06]">
          {pratinjau || "—"}
        </pre>

        {/* Panduan kode */}
        <details className="mt-3">
          <summary className="cursor-pointer text-[11.5px] font-bold text-pri">Daftar kode yang bisa dipakai</summary>
          <div className="mt-2 flex flex-col gap-1">
            {PANDUAN.map(([kode, arti]) => (
              <div key={kode} className="flex gap-2 text-[11px]">
                <code className="shrink-0 rounded bg-black/[0.05] px-1.5 py-0.5 font-mono text-[10.5px] text-teks-utama dark:bg-white/[0.08]">{kode}</code>
                <span className="text-teks-sekunder">{arti}</span>
              </div>
            ))}
          </div>
        </details>
      </GlassCard>
    </div>
  );
}

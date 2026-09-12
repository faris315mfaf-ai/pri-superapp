"use client";

// ============================================================
// PanelKenaikanNasional (12 Sep 2026) — panel paling atas modul
// TV Rakyat Nasional.
//
// Bedanya dengan dashboard nasional yang sudah ada: di sini yang
// ditampilkan KENAIKANNYA, bukan totalnya. "Berapa pengikut kita" sudah
// terjawab di tempat lain; yang belum pernah terjawab adalah "hari ini
// naik berapa" — dan justru itu yang menunjukkan apakah kerja hari ini
// membuahkan hasil.
//
// Kejujuran angka dijaga di dua tempat:
//   • Kenaikan hanya muncul bila ada rekaman pembanding. Kalau belum
//     ada, panel mengatakannya apa adanya, bukan menampilkan nol yang
//     terbaca seperti "tidak ada kemajuan".
//   • Angka negatif ditampilkan negatif. Pengikut memang bisa berkurang.
// ============================================================

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, TrendingUp } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { EmptyState, GlassSkeleton } from "@/components/pri-ui";
import { formatAngkaRingkas } from "@/lib/format";
import { getKenaikanNasional, type IndikatorNasional, type KenaikanNasional } from "@/services";
import { cn } from "@/lib/utils";

const LABEL: Record<IndikatorNasional, string> = {
  pengikut: "Pengikut",
  tayangan: "Tayangan",
  jangkauan: "Jangkauan",
  suka: "Suka",
  komentar: "Komentar",
  bagikan: "Dibagikan",
};

const URUTAN: IndikatorNasional[] = [
  "pengikut",
  "tayangan",
  "jangkauan",
  "suka",
  "komentar",
  "bagikan",
];

/** Pilihan bawaan sebelum jawaban server datang, supaya tombolnya tidak
 *  muncul-hilang saat panel pertama kali dibuka. */
const PILIHAN_AWAL = [
  { kunci: "hari_ini", label: "Hari ini" },
  { kunci: "kemarin", label: "Kemarin" },
  { kunci: "minggu", label: "1 minggu" },
  { kunci: "bulan", label: "1 bulan" },
  { kunci: "semua", label: "Semua" },
];

function tampilkan(v: number | null, totalan: boolean): string {
  if (v === null) return "–";
  if (totalan) return formatAngkaRingkas(v);
  // Tanda "+" dituliskan supaya jelas ini pertambahan, bukan jumlah.
  const tanda = v > 0 ? "+" : v < 0 ? "−" : "";
  return tanda + formatAngkaRingkas(Math.abs(v));
}

function warna(v: number | null, totalan: boolean): string {
  if (totalan || v === null || v === 0) return "";
  return v > 0 ? "text-[#059669]" : "text-[#DC2626]";
}

export function PanelKenaikanNasional() {
  const [rentang, setRentang] = useState("hari_ini");
  const [data, setData] = useState<KenaikanNasional | null>(null);
  const [galat, setGalat] = useState("");
  const [muat, setMuat] = useState(0);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      // Rangka pemuatan ditampilkan lebih dulu supaya angka rentang lama
      // tidak sempat terbaca sebagai angka rentang yang baru dipilih.
      setData(null);
      try {
        const d = await getKenaikanNasional(rentang);
        if (!hidup) return;
        setData(d);
        setGalat("");
      } catch (e) {
        if (!hidup) return;
        setGalat(e instanceof Error ? e.message : "Gagal memuat.");
      }
    })();
    return () => {
      hidup = false;
    };
  }, [rentang, muat]);

  const pilihan = data?.pilihan?.length ? data.pilihan : PILIHAN_AWAL;
  const totalan = rentang === "semua";

  return (
    <GlassCard className="p-4">
      <div className="flex items-start gap-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-white"
          style={{ background: "linear-gradient(135deg, #7C3AED, #5B21B6)" }}
          aria-hidden="true"
        >
          <TrendingUp className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-[15px] font-bold text-teks-utama">
            {totalan ? "Total Nasional" : "Kenaikan Nasional"}
          </p>
          <p className="mt-0.5 text-[11px] text-teks-sekunder">
            Gabungan TV Rakyat Official + seluruh akun anggota, semua sosial media
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMuat((n) => n + 1)}
          aria-label="Muat ulang"
          className="glass btn-tekan flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-teks-utama"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Pemilih rentang */}
      <div className="scrollbar-tipis -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {pilihan.map((p) => (
          <button
            key={p.kunci}
            type="button"
            onClick={() => setRentang(p.kunci)}
            aria-pressed={rentang === p.kunci}
            className={cn(
              "btn-tekan shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-bold transition-colors",
              rentang === p.kunci
                ? "bg-pri text-white"
                : "glass-soft text-teks-sekunder",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {galat ? (
        <EmptyState
          ikon={AlertTriangle}
          judul="Gagal memuat"
          keterangan={galat}
          labelAksi="Coba Lagi"
          onAksi={() => setMuat((n) => n + 1)}
        />
      ) : !data ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {URUTAN.map((k) => (
            <GlassSkeleton key={k} className="h-[62px] rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {URUTAN.map((k) => {
              const v = totalan ? data.sekarang[k] : data.kenaikan[k];
              return (
                <div key={k} className="glass-soft rounded-xl p-2.5 text-center">
                  <p
                    className={cn(
                      "angka-tab font-heading text-[17px] leading-none font-extrabold text-teks-utama",
                      warna(v, totalan),
                    )}
                  >
                    {tampilkan(v, totalan)}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold text-teks-sekunder">
                    {LABEL[k]}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="mt-2.5 text-[10.5px] leading-relaxed text-teks-sekunder">
            {data.catatan}
          </p>
        </>
      )}
    </GlassCard>
  );
}

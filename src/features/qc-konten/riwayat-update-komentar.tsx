"use client";

// ============================================================
// RiwayatUpdateKomentar (fitur 1.22.x/3-perbaikan) — riwayat KAPAN
// Ayrshare memperbarui komentar QC (waktu + jumlah postingan/komentar/
// comply tiap kali analisis dijalankan). Membuat fitur analisis terasa
// SATU kesatuan: jalankan → lihat kapan terakhir di-update.
//
// Komentar mentahnya sendiri hanya disimpan sementara (2 hari, lalu
// dihapus otomatis) — dijelaskan di catatan kecil di bawah daftar.
// ============================================================

import { useEffect, useState } from "react";
import { History, RefreshCw } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { EmptyState, GlassSkeleton } from "@/components/pri-ui";
import { getRiwayatUpdateKomentar, type RiwayatUpdateKomentar } from "@/services";
import { cn } from "@/lib/utils";

function waktuWib(iso: string): string {
  try {
    return (
      new Intl.DateTimeFormat("id-ID", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
      }).format(new Date(iso)) + " WIB"
    );
  } catch {
    return iso;
  }
}

export function RiwayatUpdateKomentar({
  muatUlang = 0,
  onPilih,
  periodeAktif,
}: {
  muatUlang?: number;
  /**
   * Fitur Riwayat (31 Agu 2026): bila diisi, tiap entri BISA DIKLIK —
   * layar otomatis berpindah menampilkan data periode entri itu.
   */
  onPilih?: (periode: string) => void;
  /** Periode yang sedang ditampilkan (untuk sorotan entri aktif). */
  periodeAktif?: string;
}) {
  const [data, setData] = useState<RiwayatUpdateKomentar[] | null>(null);
  const [memuat, setMemuat] = useState(false);

  async function muat() {
    setMemuat(true);
    try {
      setData(await getRiwayatUpdateKomentar());
    } finally {
      setMemuat(false);
    }
  }

  useEffect(() => {
    const id = setTimeout(() => void muat(), 0);
    return () => clearTimeout(id);
  }, [muatUlang]);

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <History className="h-4 w-4 text-pri" aria-hidden="true" />
        <p className="text-[12.5px] font-bold text-teks-utama">Riwayat Update Komentar</p>
        <button
          type="button"
          onClick={() => void muat()}
          disabled={memuat}
          aria-label="Segarkan riwayat"
          className="glass btn-tekan ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-teks-sekunder disabled:opacity-60"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", memuat && "animate-spin")} />
        </button>
      </div>

      {data === null ? (
        <GlassSkeleton className="h-16 rounded-xl" />
      ) : data.length === 0 ? (
        <EmptyState
          ikon={History}
          judul="Belum ada pembaruan"
          keterangan="Deteksi komentar berjalan otomatis (±30 menit sekali) — setiap pembaruan tercatat di sini."
          className="py-6"
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          {data.map((r) => {
            const bisaKlik = Boolean(onPilih && r.periode);
            const aktif = Boolean(periodeAktif && r.periode === periodeAktif);
            const isi = (
              <>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-teks-utama">
                    {waktuWib(r.dijalankan_pada)}
                  </p>
                  <p className="mt-0.5 text-[10.5px] text-teks-sekunder">
                    {r.postingan} postingan · {r.komentar} komentar · {r.comply} comply
                    {r.gagal_cek > 0 ? ` · ${r.gagal_cek} perlu cek manual` : ""}
                  </p>
                </div>
                {aktif && (
                  <span className="shrink-0 rounded-full bg-pri/15 px-2 py-0.5 text-[10px] font-bold text-pri">
                    ditampilkan
                  </span>
                )}
                {!r.selesai && (
                  <span className="shrink-0 rounded-full bg-kuning/15 px-2 py-0.5 text-[10px] font-semibold text-kuning">
                    sebagian
                  </span>
                )}
              </>
            );
            // Bisa diklik → seluruh layar berpindah ke data periode entri
            // ini (fitur Riwayat). Tanpa onPilih → kartu pasif (perilaku lama).
            return bisaKlik ? (
              <button
                key={r.id}
                type="button"
                onClick={() => onPilih!(r.periode!)}
                aria-pressed={aktif}
                className={cn(
                  "btn-tekan flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left",
                  aktif
                    ? "border-pri/40 bg-pri/[0.06]"
                    : "glass border-transparent hover:bg-black/[0.03] dark:hover:bg-white/[0.05]",
                )}
              >
                {isi}
              </button>
            ) : (
              <GlassCard key={r.id} className="flex items-center gap-3 px-3 py-2">
                {isi}
              </GlassCard>
            );
          })}
        </div>
      )}

      <p className="mt-2 text-[10.5px] leading-snug text-teks-sekunder">
        Komentar mentah disimpan <b>sementara</b> dan terhapus otomatis setelah 2 hari.
        Angka kepatuhan (comply) tetap tersimpan permanen di rekap.
      </p>
    </div>
  );
}

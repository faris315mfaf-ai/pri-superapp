"use client";

// ============================================================
// NavHalaman — deret tombol halaman 1, 2, 3, … untuk daftar
// panjang yang dibikin ringkas. Dipakai Aktivitas Terbaru,
// Rencana Kerja Anggota, dan Absensi di dashboard.
//
// Bila halamannya banyak, hanya sekitar halaman aktif yang
// ditampilkan (1 … 4 5 6 … 12) supaya barisnya tidak meluber.
// ============================================================

import { cn } from "@/lib/utils";

export function NavHalaman({
  total,
  perHalaman,
  halaman,
  onGanti,
}: {
  /** Jumlah seluruh butir data */
  total: number;
  perHalaman: number;
  /** Halaman aktif, mulai dari 1 */
  halaman: number;
  onGanti: (h: number) => void;
}) {
  const jumlahHalaman = Math.max(1, Math.ceil(total / perHalaman));
  if (jumlahHalaman <= 1) return null;

  // Susun daftar nomor: selalu 1 & terakhir, plus tetangga halaman aktif.
  const nomor: (number | "…")[] = [];
  for (let h = 1; h <= jumlahHalaman; h++) {
    if (h === 1 || h === jumlahHalaman || Math.abs(h - halaman) <= 1) {
      nomor.push(h);
    } else if (nomor[nomor.length - 1] !== "…") {
      nomor.push("…");
    }
  }

  return (
    <nav className="mt-3 flex items-center justify-center gap-1.5" aria-label="Navigasi halaman">
      {nomor.map((n, i) =>
        n === "…" ? (
          <span key={`elipsis-${i}`} className="px-1 text-[11px] text-teks-sekunder">
            …
          </span>
        ) : (
          <button
            key={n}
            type="button"
            onClick={() => onGanti(n)}
            aria-label={`Halaman ${n}`}
            aria-current={n === halaman ? "page" : undefined}
            className={cn(
              "btn-tekan angka-tab flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-[12px] font-bold",
              n === halaman ? "text-white" : "glass text-teks-sekunder",
            )}
            style={
              n === halaman
                ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                : undefined
            }
          >
            {n}
          </button>
        ),
      )}
    </nav>
  );
}

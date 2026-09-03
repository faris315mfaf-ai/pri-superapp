"use client";

// ============================================================
// RunningTextJuara (3 Sep 2026) — teks berjalan di beranda sepanjang periode
// (19.00 → 18.59 WIB): penghargaan untuk juara 1–3 komentator terbanyak
// postingan TV Rakyat Official pada periode yang BARU SAJA selesai.
// Sumber: /api/juara-komen. Tidak tampil bila belum ada periode selesai.
// ============================================================

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { getJuaraKomen, type HasilJuaraKomen } from "@/services";
import { tanggalIndonesia } from "@/lib/format";

const MEDALI = ["🥇", "🥈", "🥉"];
const SEGAR_MS = 5 * 60_000;

export function RunningTextJuara() {
  const [data, setData] = useState<HasilJuaraKomen | null>(null);

  useEffect(() => {
    let hidup = true;
    const muat = () =>
      getJuaraKomen()
        .then((d) => hidup && setData(d))
        .catch(() => {
          // gagal memuat = tidak tampil; bukan alasan mengganggu beranda
        });
    void muat();
    const t = setInterval(() => void muat(), SEGAR_MS);
    return () => {
      hidup = false;
      clearInterval(t);
    };
  }, []);

  if (!data || !data.periode || !data.tanggal || data.juara.length === 0) return null;

  const teks =
    `🏆 Juara komentar periode ${tanggalIndonesia(`${data.tanggal}T00:00:00+07:00`)} (19.00–18.59 WIB): ` +
    data.juara.map((j) => `${MEDALI[j.peringkat - 1] ?? "🏅"} ${j.nama} · ${j.total_komentar} komentar`).join("   •   ") +
    "   —   Terima kasih sudah menjaga TV Rakyat!";
  // Durasi mengikuti panjang teks supaya kecepatan bacanya tetap.
  const durasi = Math.max(18, Math.round(teks.length * 0.2));

  return (
    <div
      className="glass mt-3 flex items-center gap-2 overflow-hidden rounded-xl px-3 py-2"
      role="marquee"
      aria-label="Juara komentar periode terakhir"
    >
      <Trophy className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
      <div className="min-w-0 flex-1 overflow-hidden">
        <span className="teks-berjalan whitespace-nowrap text-[12px] font-bold text-teks-utama" style={{ animationDuration: `${durasi}s` }}>
          {teks}
        </span>
      </div>
    </div>
  );
}

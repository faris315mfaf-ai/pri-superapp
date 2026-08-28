"use client";

// ============================================================
// KepatuhanKaderPanel — HR Center (spek 1.15): siapa yang SUDAH
// komen dan siapa yang BELUM, per kader, untuk periode hari ini.
//
// - Chip Sudah/Belum = filter; kotak cari menyaring nama (spek 7:
//   search global di modul berdata banyak).
// - Klik kader -> POPUP BESAR berisi rincian kepatuhan orang itu:
//   status per akun wajib x postingan + jumlah komentarnya.
// - Pengurus melihat tombol "Ingatkan via WA" (wa.me) untuk kader
//   yang belum penuh.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, MessageCircleWarning, Search, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, GlassSkeleton, SectionTitle, StatusBadge } from "@/components/pri-ui";
import {
  getDetailKepatuhanKader,
  getRingkasKepatuhan,
  type BarisKepatuhan,
  type RingkasKepatuhanKader,
} from "@/services";
// Tanggal WIB perangkat — pola lokal yang sama dengan beranda-screen.
function tanggalWibPerangkat(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}
import { cn } from "@/lib/utils";

type RingkasKader = RingkasKepatuhanKader;

export function KepatuhanKaderPanel({
  muatUlang = 0,
  editable = true,
}: {
  muatUlang?: number;
  /**
   * false = mode BACA-SAJA (modul Dashboard 1.19/3.3.c): tombol aksi
   * "Ingatkan via WhatsApp" disembunyikan — dashboard tempat memantau,
   * bukan menindak. Data & tampilan lainnya persis sama.
   */
  editable?: boolean;
}) {
  const [perKaderMentah, setPerKaderMentah] = useState<RingkasKader[] | null>(null);
  const [saring, setSaring] = useState<"semua" | "sudah" | "belum">("belum");
  // Saringan platform (spek 1.18/2.1g)
  const [platformSaring, setPlatformSaring] = useState<string>("");
  const [cari, setCari] = useState("");
  const [dibuka, setDibuka] = useState<RingkasKader | null>(null);
  // Rincian per kader diambil LAZY saat popup dibuka — daftar utama
  // memakai agregat database (bebas cap 1000 baris PostgREST).
  const [rincian, setRincian] = useState<BarisKepatuhan[] | null>(null);
  const periode = `${tanggalWibPerangkat()} 00:00-23:59`;

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getRingkasKepatuhan(periode, platformSaring || undefined);
        if (hidup) setPerKaderMentah(hasil);
      } catch {
        if (hidup) setPerKaderMentah([]);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muatUlang, platformSaring]);

  useEffect(() => {
    if (!dibuka) return;
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getDetailKepatuhanKader(periode, dibuka.nama_kader);
        if (hidup) setRincian(hasil);
      } catch {
        if (hidup) setRincian([]);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [dibuka]);

  const perKader = useMemo<RingkasKader[]>(
    () =>
      [...(perKaderMentah ?? [])].sort(
        (a, b) =>
          (a.total ? a.sudah / a.total : 0) - (b.total ? b.sudah / b.total : 0) ||
          a.nama_kader.localeCompare(b.nama_kader),
      ),
    [perKaderMentah],
  );

  const tersaring = perKader.filter((k) => {
    if (saring === "sudah" && k.sudah < k.total) return false;
    if (saring === "belum" && k.sudah >= k.total) return false;
    if (cari.trim() && !k.nama_kader.toLowerCase().includes(cari.trim().toLowerCase())) return false;
    return true;
  });

  const jumlahSudah = perKader.filter((k) => k.sudah >= k.total && k.total > 0).length;
  const jumlahBelum = perKader.length - jumlahSudah;

  return (
    <>
      <SectionTitle judul="Siapa Sudah & Belum Komen" className="mt-6" />
      <GlassCard className="p-3">
        {perKaderMentah === null ? (
          <GlassSkeleton className="h-24 rounded-xl" />
        ) : perKader.length === 0 ? (
          <p className="py-5 text-center text-xs text-teks-sekunder">
            Belum ada data kepatuhan periode hari ini — jalankan analisis dulu.
          </p>
        ) : (
          <>
            {/* Saringan status + cari nama */}
            <div className="flex items-center gap-1.5">
              {(
                [
                  ["belum", `Belum ${jumlahBelum}`, "merah"],
                  ["sudah", `Sudah ${jumlahSudah}`, "hijau"],
                  ["semua", `Semua ${perKader.length}`, "biru"],
                ] as const
              ).map(([id, label, warna]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSaring(id)}
                  aria-pressed={saring === id}
                  className={cn(
                    "btn-tekan rounded-full transition-opacity",
                    saring !== id && "opacity-45",
                  )}
                >
                  <StatusBadge label={label} warna={warna} />
                </button>
              ))}
            </div>
            {/* Saringan platform */}
            <div className="mt-1.5 flex gap-1.5">
              {[
                ["", "Semua Platform"],
                ["instagram", "Instagram"],
                ["tiktok", "TikTok"],
              ].map(([id, label]) => (
                <button
                  key={id || "semua"}
                  type="button"
                  onClick={() => {
                    setPerKaderMentah(null);
                    setPlatformSaring(id);
                  }}
                  aria-pressed={platformSaring === id}
                  className={cn(
                    "btn-tekan rounded-full px-3 py-1.5 text-[11px] font-semibold",
                    platformSaring === id ? "text-white" : "glass-soft text-teks-sekunder",
                  )}
                  style={
                    platformSaring === id
                      ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                      : undefined
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="relative mt-2">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-teks-sekunder"
                aria-hidden="true"
              />
              <input
                value={cari}
                onChange={(e) => setCari(e.target.value)}
                placeholder="Cari nama kader…"
                aria-label="Cari nama kader"
                className="glass h-9 w-full rounded-xl pr-3 pl-9 text-[12.5px] text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
              />
            </div>

            <div className="mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto">
              {tersaring.length === 0 ? (
                <p className="py-4 text-center text-xs text-teks-sekunder">
                  Tidak ada yang cocok.
                </p>
              ) : (
                tersaring.map((k) => (
                  <button
                    key={k.nama_kader}
                    type="button"
                    onClick={() => {
                      setRincian(null); // kosongkan dulu — rincian dimuat lazy
                      setDibuka(k);
                    }}
                    aria-label={`Rincian kepatuhan ${k.nama_kader}`}
                    className="btn-tekan flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left"
                  >
                    <AvatarInisial nama={k.nama_kader} ukuran={30} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold text-teks-utama">
                        {k.nama_kader}
                      </p>
                      <p className="text-[10px] text-teks-sekunder">
                        {k.sudah}/{k.total} kewajiban terpenuhi
                      </p>
                    </div>
                    <span
                      className={cn(
                        "angka-tab shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold",
                        k.sudah >= k.total
                          ? "bg-sukses/15 text-sukses"
                          : "bg-gagal/15 text-gagal",
                      )}
                    >
                      {k.total > 0 ? Math.round((k.sudah / k.total) * 100) : 0}%
                    </span>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </GlassCard>

      {/* POPUP BESAR rincian per kader (spek 1.15) */}
      <AnimatePresence>
        {dibuka && (
          <motion.div
            className="fixed inset-0 z-[90] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label={`Kepatuhan ${dibuka.nama_kader}`}
          >
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
              onClick={() => setDibuka(null)}
            />
            <motion.div
              className="glass-strong relative flex max-h-[88dvh] w-full max-w-[520px] flex-col rounded-3xl p-5"
              initial={{ scale: 0.94, opacity: 0, y: 14 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: "spring", stiffness: 340, damping: 30 }}
            >
              <div className="flex shrink-0 items-center gap-3">
                <AvatarInisial nama={dibuka.nama_kader} ukuran={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-heading text-base font-bold text-teks-utama">
                    {dibuka.nama_kader}
                  </p>
                  <p className="text-[11px] text-teks-sekunder">
                    {dibuka.sudah}/{dibuka.total} kewajiban komentar hari ini
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDibuka(null)}
                  aria-label="Tutup"
                  className="glass btn-tekan flex h-9 w-9 items-center justify-center rounded-full text-teks-utama"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Rincian per akun wajib x postingan (lazy) */}
              <div className="scrollbar-tipis mt-3 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
                {rincian === null ? (
                  <p className="py-6 text-center text-xs text-teks-sekunder">Memuat rincian…</p>
                ) : (
                rincian.map((r) => (
                  <div
                    key={r.id_unik}
                    className="glass-soft flex items-center gap-2.5 rounded-xl px-3 py-2"
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                        r.sudah_komentar
                          ? "bg-sukses/15 text-sukses"
                          : "bg-gagal/15 text-gagal",
                      )}
                      aria-hidden="true"
                    >
                      {r.sudah_komentar ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-teks-utama">
                        @{r.akun_wajib} · {r.platform}
                      </p>
                      <p className="truncate text-[10px] text-teks-sekunder">
                        {r.id_postingan}
                        {r.sudah_komentar ? ` · ${r.jumlah_komentar} komentar` : " · belum komentar"}
                      </p>
                    </div>
                  </div>
                ))
                )}
              </div>

              {/* Ingatkan via WA — hanya bila nomor tersedia (pengurus)
                  dan panel TIDAK sedang mode baca-saja (3.3.c) */}
              {editable && dibuka.nomor_wa && dibuka.sudah < dibuka.total && (
                <a
                  href={`https://wa.me/${dibuka.nomor_wa.replace(/\D/g, "")}?text=${encodeURIComponent(
                    `Halo ${dibuka.nama_kader.split(" ")[0]}, jangan lupa komentar di akun wajib hari ini ya. Masih ${dibuka.total - dibuka.sudah} postingan yang belum. 🙏`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-tekan mt-3 flex shrink-0 items-center justify-center gap-1.5 rounded-xl py-2.5 font-heading text-sm font-bold text-white"
                  style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
                >
                  <MessageCircleWarning className="h-4 w-4" aria-hidden="true" />
                  Ingatkan via WhatsApp
                </a>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

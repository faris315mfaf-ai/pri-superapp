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
  getAkunWajib,
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
import { periodeSaatIni } from "@/lib/periode-qc";

type RingkasKader = RingkasKepatuhanKader;

export function KepatuhanKaderPanel({
  muatUlang = 0,
  editable = true,
  periode: periodeProp,
}: {
  muatUlang?: number;
  /**
   * false = mode BACA-SAJA (modul Dashboard 1.19/3.3.c): tombol aksi
   * "Ingatkan via WhatsApp" disembunyikan — dashboard tempat memantau,
   * bukan menindak. Data & tampilan lainnya persis sama.
   */
  editable?: boolean;
  /**
   * Periode yang ditampilkan (fitur Riwayat 31 Agu 2026, format
   * "YYYY-MM-DD 00:00-23:59"). Kosong = hari ini — perilaku lama.
   */
  periode?: string;
}) {
  const [perKaderMentah, setPerKaderMentah] = useState<RingkasKader[] | null>(null);
  const [saring, setSaring] = useState<"semua" | "sudah" | "belum">("belum");
  // Saringan platform (spek 1.18/2.1g)
  const [platformSaring, setPlatformSaring] = useState<string>("");
  // Saringan KELOMPOK AKUN wajib (31 Agu 2026): tv rakyat / dpp.pri /
  // muhammad nazaruddin. Opsinya dibaca dari akun_wajib (nama tampilan).
  const [akunSaring, setAkunSaring] = useState<string>("");
  const [akunOpsi, setAkunOpsi] = useState<string[]>([]);
  // Urutan: persen TERTINGGI di atas (bawaan, permintaan user) ⇄ terendah.
  const [urut, setUrut] = useState<"tinggi" | "rendah">("tinggi");
  const [cari, setCari] = useState("");
  const [dibuka, setDibuka] = useState<RingkasKader | null>(null);
  // Rincian per kader diambil LAZY saat popup dibuka — daftar utama
  // memakai agregat database (bebas cap 1000 baris PostgREST).
  const [rincian, setRincian] = useState<BarisKepatuhan[] | null>(null);
  const periode = periodeProp || periodeSaatIni();

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getRingkasKepatuhan(
          periode,
          platformSaring || undefined,
          akunSaring || undefined,
        );
        if (hidup) setPerKaderMentah(hasil);
      } catch {
        if (hidup) setPerKaderMentah([]);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muatUlang, platformSaring, akunSaring, periode]);

  // Opsi kelompok akun (sekali muat) — nama tampilan akun wajib unik.
  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const daftar = await getAkunWajib();
        if (hidup) {
          setAkunOpsi([...new Set(daftar.map((a) => a.nama_tampilan).filter(Boolean))]);
        }
      } catch {
        // Tanpa opsi akun, saringan platform tetap jalan.
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

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
  }, [dibuka, periode]);

  const perKader = useMemo<RingkasKader[]>(
    () =>
      [...(perKaderMentah ?? [])].sort((a, b) => {
        const pa = a.total ? a.sudah / a.total : 0;
        const pb = b.total ? b.sudah / b.total : 0;
        const beda = urut === "tinggi" ? pb - pa : pa - pb;
        return beda || a.nama_kader.localeCompare(b.nama_kader);
      }),
    [perKaderMentah, urut],
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
            {/* Saringan status + urutan persen */}
            <div className="tanpa-scrollbar -mx-3 flex items-center gap-1.5 overflow-x-auto px-3">
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
                    "btn-tekan shrink-0 rounded-full transition-opacity",
                    saring !== id && "opacity-45",
                  )}
                >
                  <StatusBadge label={label} warna={warna} />
                </button>
              ))}
              {/* Urutan persen — bawaan TERTINGGI di atas */}
              <button
                type="button"
                onClick={() => setUrut((u) => (u === "tinggi" ? "rendah" : "tinggi"))}
                className="glass-soft btn-tekan ml-auto shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold text-teks-sekunder"
                title="Balik urutan persen"
              >
                {urut === "tinggi" ? "％ Tertinggi ↓" : "％ Terendah ↓"}
              </button>
            </div>
            {/* Saringan platform — bisa digulir ke samping */}
            <div className="tanpa-scrollbar -mx-3 mt-1.5 flex gap-1.5 overflow-x-auto px-3">
              {[
                ["", "Semua Platform"],
                ["instagram", "Instagram"],
                ["tiktok", "TikTok"],
                ["youtube", "YT Short"],
                ["threads", "Threads"],
                ["facebook", "Facebook"],
                ["twitter", "X"],
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
                    "btn-tekan shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold",
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
            {/* Saringan KELOMPOK AKUN (tv rakyat aktif; dpp.pri & muhammad
                nazaruddin tampil tapi datanya menyusul setelah akun mereka
                tersambung) — bisa digulir ke samping */}
            {akunOpsi.length > 0 && (
              <div className="tanpa-scrollbar -mx-3 mt-1.5 flex gap-1.5 overflow-x-auto px-3">
                {["", ...akunOpsi].map((nama) => (
                  <button
                    key={nama || "semua-akun"}
                    type="button"
                    onClick={() => {
                      setPerKaderMentah(null);
                      setAkunSaring(nama);
                    }}
                    aria-pressed={akunSaring === nama}
                    className={cn(
                      "btn-tekan shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold capitalize",
                      akunSaring === nama ? "text-white" : "glass-soft text-teks-sekunder",
                    )}
                    style={
                      akunSaring === nama
                        ? { background: "linear-gradient(135deg, #B45309, #F59E0B)" }
                        : undefined
                    }
                  >
                    {nama || "Semua Akun"}
                  </button>
                ))}
              </div>
            )}
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
                    {/* Bar GRADIEN ala pengisian daya: merah (0%) →
                        kuning (50%) → hijau (100%). Warna & isi bar
                        mengikuti persennya. */}
                    {(() => {
                      const persen = k.total > 0 ? Math.round((k.sudah / k.total) * 100) : 0;
                      const hue = Math.round((persen / 100) * 120); // 0=merah, 120=hijau
                      return (
                        <span className="flex shrink-0 flex-col items-end gap-0.5">
                          <span
                            className="angka-tab text-[10.5px] font-extrabold"
                            style={{ color: `hsl(${hue} 75% 42%)` }}
                          >
                            {persen}%
                          </span>
                          <span className="block h-2 w-16 overflow-hidden rounded-full border border-black/10 bg-black/10 dark:border-white/10 dark:bg-white/10">
                            <span
                              className="block h-full rounded-full transition-[width] duration-300"
                              style={{
                                width: `${Math.max(persen, 4)}%`,
                                background: `linear-gradient(90deg, hsl(0 80% 52%), hsl(${hue} 75% 45%))`,
                              }}
                            />
                          </span>
                        </span>
                      );
                    })()}
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

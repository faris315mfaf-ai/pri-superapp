"use client";

// ============================================================
// ModalStatus (12 Sep 2026) — dibuka dengan mengetuk foto profil di
// beranda. Isinya dua hal yang selama ini tidak bisa dilihat anggota:
//
//   1. SIAPA saja yang sedang membuka aplikasi (bukan cuma berapa).
//   2. KEADAAN SERVER: prosesor, memori, dan penyimpanan.
//
// Keadaan server dibuka untuk semua orang sejak aplikasi pindah ke
// server milik sendiri. Kalau aplikasi terasa berat, siapa pun bisa
// melihat sendiri apakah servernya memang sedang sibuk — tanpa bertanya
// dan tanpa menunggu jawaban.
//
// Datanya diambil saat panel DIBUKA saja, tidak berulang di latar
// belakang. Panel yang jarang dibuka tidak pantas membebani server
// setiap beberapa detik.
// ============================================================

import { useEffect, useState } from "react";
import { Cpu, HardDrive, MemoryStick, RefreshCw, Users, X } from "lucide-react";
import { AvatarInisial, EmptyState, GlassSkeleton, TitikOnline } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { GlassCard } from "@/components/glass-card";
import { getStatus, type StatusAplikasi } from "@/services";
import { cn } from "@/lib/utils";

/** Hijau tenang → kuning → merah, mengikuti seberapa penuh. */
function warnaPakai(persen: number | null): string {
  if (persen == null) return "#94A3B8";
  if (persen >= 90) return "#DC2626";
  if (persen >= 75) return "#F59E0B";
  return "#10B981";
}

function Bilah({
  ikon: Ikon,
  judul,
  persen,
  keterangan,
}: {
  ikon: typeof Cpu;
  judul: string;
  persen: number | null;
  keterangan: string;
}) {
  const warna = warnaPakai(persen);
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: warna + "1a", color: warna }}
        aria-hidden="true"
      >
        <Ikon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[12px] font-bold text-teks-utama">{judul}</span>
          <span className="angka-tab text-[12px] font-extrabold" style={{ color: warna }}>
            {persen == null ? "—" : `${persen}%`}
          </span>
        </span>
        <span
          className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-teks-sekunder/15"
          role="img"
          aria-label={`${judul} ${persen ?? 0} persen`}
        >
          <span
            className="block h-full rounded-full"
            style={{
              width: `${Math.max(2, Math.min(100, persen ?? 0))}%`,
              background: warna,
              // Perubahan angka bergerak halus, bukan meloncat.
              transition: "width 400ms cubic-bezier(0.23, 1, 0.32, 1)",
            }}
          />
        </span>
        <span className="mt-0.5 block text-[10.5px] text-teks-sekunder">{keterangan}</span>
      </span>
    </div>
  );
}

const gb = (b: number | null) => (b == null ? "?" : `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`);

export function ModalStatus({ onTutup }: { onTutup: () => void }) {
  const [data, setData] = useState<StatusAplikasi | null>(null);
  const [galat, setGalat] = useState("");
  const [muat, setMuat] = useState(0);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const d = await getStatus();
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
  }, [muat]);

  // Tutup dengan tombol Esc — kebiasaan yang diharapkan di layar besar.
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onTutup();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onTutup]);

  const s = data?.server ?? null;

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col justify-end sm:items-center sm:justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Status aplikasi"
    >
      <button
        type="button"
        aria-label="Tutup"
        onClick={onTutup}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <div
        className={cn(
          "glass-strong relative mx-auto flex max-h-[85dvh] w-full max-w-[440px] flex-col",
          "rounded-t-[2rem] px-5 pt-3 pb-7 sm:rounded-[2rem]",
        )}
      >
        <div className="mb-3 flex shrink-0 justify-center sm:hidden">
          <span className="h-1.5 w-12 rounded-full bg-teks-sekunder/40" aria-hidden="true" />
        </div>

        <div className="mb-3 flex shrink-0 items-center gap-2">
          <h2 className="min-w-0 flex-1 font-heading text-lg font-bold text-teks-utama">
            Sedang Online
          </h2>
          <button
            type="button"
            onClick={() => {
              setData(null);
              setMuat((n) => n + 1);
            }}
            aria-label="Muat ulang"
            className="glass btn-tekan flex h-8 w-8 items-center justify-center rounded-full text-teks-utama"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            className="glass btn-tekan flex h-8 w-8 items-center justify-center rounded-full text-teks-utama"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="scrollbar-tipis min-h-0 flex-1 overflow-y-auto pr-1">
          {galat ? (
            <EmptyState
              ikon={Users}
              judul="Gagal memuat"
              keterangan={galat}
              labelAksi="Coba Lagi"
              onAksi={() => setMuat((n) => n + 1)}
            />
          ) : !data ? (
            <div className="flex flex-col gap-2">
              <GlassSkeleton className="h-16 w-full" />
              <GlassSkeleton className="h-24 w-full" />
            </div>
          ) : (
            <>
              <GlassCard className="p-3.5">
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white"
                    style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
                    aria-hidden="true"
                  >
                    <Users className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="angka-tab font-heading text-xl font-extrabold text-teks-utama">
                      {data.online.jumlah} orang
                    </p>
                    <p className="text-[11px] text-teks-sekunder">sedang membuka aplikasi</p>
                  </div>
                </div>

                {data.online.orang.length > 0 ? (
                  <ul className="mt-3 flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-1">
                    {data.online.orang.map((o) => (
                      <li key={o.id} className="flex items-center gap-2.5">
                        <span className="relative shrink-0">
                          {o.avatar_url ? (
                            <FotoBulat src={o.avatar_url} ukuran={30} />
                          ) : (
                            <AvatarInisial nama={o.nama} ukuran={30} />
                          )}
                          <TitikOnline ukuran={9} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-bold text-teks-utama">
                            {o.nama}
                          </span>
                          {o.struktur && (
                            <span className="block truncate text-[10.5px] text-teks-sekunder">
                              {o.struktur}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2.5 text-[11.5px] text-teks-sekunder">
                    Belum ada yang terdeteksi membuka aplikasi saat ini.
                  </p>
                )}
              </GlassCard>

              <h3 className="mt-4 mb-2 font-heading text-[13px] font-bold text-teks-utama">
                Keadaan Server
              </h3>
              {s ? (
                <GlassCard className="flex flex-col gap-3 p-3.5">
                  <Bilah
                    ikon={Cpu}
                    judul="Prosesor"
                    persen={s.cpu_persen}
                    keterangan={`${s.cpu_inti} inti${s.beban_1m != null ? ` · beban ${s.beban_1m.toFixed(2)}` : ""}`}
                  />
                  <Bilah
                    ikon={MemoryStick}
                    judul="Memori"
                    persen={s.ram_persen}
                    keterangan={`${gb(s.ram_terpakai)} terpakai dari ${gb(s.ram_total)}`}
                  />
                  <Bilah
                    ikon={HardDrive}
                    judul="Penyimpanan"
                    persen={s.disk_persen}
                    keterangan="ruang disk server"
                  />
                </GlassCard>
              ) : (
                <GlassCard className="p-3.5">
                  <p className="text-[11.5px] text-teks-sekunder">
                    Keadaan server belum bisa dibaca dari sini.
                  </p>
                </GlassCard>
              )}
              <p className="mt-2 text-[10.5px] leading-relaxed text-teks-sekunder">
                Angka online dihitung dari perangkat yang aplikasinya terbuka dalam
                satu menit terakhir.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

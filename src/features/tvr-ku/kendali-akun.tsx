"use client";

// ============================================================
// KENDALI AKUN PALUGODAM — "senjata utama" Admin PALUGODAM (4 Sep 2026)
//
// Deretan bulatan (gaya galeri Konten) berisi semua anggota Divisi
// PALUGODAM. Menekan satu bulatan = admin BERALIH menjadi akun itu, tetapi
// HANYA untuk modul TV Rakyat Saya: semua permintaan modul ini membawa
// header X-Sebagai yang hanya dihormati endpoint /api/tvr/* (lib/sebagai).
// Modul lain, notifikasi, profil, dsb. tetap milik admin sendiri.
// ============================================================

import { useEffect, useState } from "react";
import { Crown, Link2, LogOut, Users } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, GlassSkeleton, SectionTitle } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { toast } from "@/hooks/use-app-store";
import { useVersiSegar } from "@/hooks/use-segar-otomatis";
import { getKendaliAkun, type AnggotaKendali } from "@/services";
import { cn } from "@/lib/utils";

function Avatar({ a, ukuran }: { a: AnggotaKendali; ukuran: number }) {
  return a.avatar_url ? <FotoBulat src={a.avatar_url} ukuran={ukuran} alt={a.nama} /> : <AvatarInisial nama={a.nama} ukuran={ukuran} />;
}

export function KendaliAkun({
  aktif,
  onPilih,
}: {
  /** Anggota yang sedang dikendalikan (null = akun admin sendiri). */
  aktif: AnggotaKendali | null;
  onPilih: (a: AnggotaKendali | null) => void;
}) {
  const versiSegar = useVersiSegar();
  const [daftar, setDaftar] = useState<AnggotaKendali[] | null>(null);

  useEffect(() => {
    let hidup = true;
    getKendaliAkun()
      .then((d) => hidup && setDaftar(d))
      .catch((e) => {
        if (!hidup) return;
        setDaftar([]);
        toast("error", "Daftar akun PALUGODAM gagal dimuat", e instanceof Error ? e.message : "");
      });
    return () => {
      hidup = false;
    };
  }, [versiSegar]);

  return (
    <section>
      <SectionTitle judul="Kendali Akun PALUGODAM" />
      <GlassCard className="mt-2.5 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <Users className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-teks-utama">Beralih menjadi akun anggota</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-teks-sekunder">
              Tekan satu bulatan untuk mengendalikan, memantau, dan mengerjakan seluruh TV Rakyat Saya atas nama anggota itu (unggah, jadwal, laporan, akun tertaut). Modul lain tidak ikut berubah.
            </p>
          </div>
        </div>

        {daftar === null ? (
          <GlassSkeleton className="mt-3 h-24 rounded-2xl" />
        ) : daftar.length === 0 ? (
          <p className="mt-3 text-center text-[11.5px] text-teks-sekunder">Belum ada anggota aktif di Divisi PALUGODAM.</p>
        ) : (
          <div className="mt-3 grid grid-cols-6 gap-x-1.5 gap-y-3">
            {daftar.map((a) => {
              const dipilih = aktif?.id === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onPilih(dipilih ? null : a)}
                  aria-pressed={dipilih}
                  aria-label={dipilih ? `Berhenti mengendalikan ${a.nama}` : `Kendalikan akun ${a.nama}`}
                  className="btn-tekan flex flex-col items-center gap-1"
                >
                  <span
                    className={cn(
                      "relative rounded-full p-[2px] transition-transform duration-200",
                      dipilih ? "scale-110 bg-[linear-gradient(135deg,#F59E0B,#DC2626)]" : a.profil ? "bg-emerald-500/70" : "bg-black/10 dark:bg-white/15",
                    )}
                  >
                    <span className="block rounded-full bg-[var(--app-bg)] p-[2px]">
                      <Avatar a={a} ukuran={40} />
                    </span>
                    {a.posisi === "kepala" && (
                      <span className="absolute -left-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-white" aria-hidden="true">
                        <Crown className="h-2.5 w-2.5" />
                      </span>
                    )}
                    <span
                      className="angka-tab absolute -bottom-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center gap-0.5 rounded-full px-1 text-[9px] font-bold text-white"
                      style={{ background: a.tertaut > 0 ? "#059669" : "#0F172A" }}
                      aria-hidden="true"
                      title={`${a.tertaut} sosmed tertaut`}
                    >
                      <Link2 className="h-2 w-2" />
                      {a.tertaut}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "w-full truncate text-center text-[9.5px] font-semibold leading-tight",
                      dipilih ? "text-pri" : "text-teks-utama",
                    )}
                  >
                    {a.nama.split(" ")[0]}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {aktif && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2">
            <Avatar a={aktif} ukuran={28} />
            <p className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-teks-utama">
              Mengendalikan <span className="font-bold">{aktif.nama}</span>
              {aktif.profil ? <span className="text-teks-sekunder"> · profil {aktif.profil}</span> : <span className="text-teks-sekunder"> · belum punya profil upload-post</span>}
            </p>
            <button
              type="button"
              onClick={() => onPilih(null)}
              className="btn-tekan flex h-8 shrink-0 items-center gap-1 rounded-lg bg-black/[0.06] px-2.5 text-[11px] font-bold text-teks-utama dark:bg-white/10"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Keluar
            </button>
          </div>
        )}
      </GlassCard>
    </section>
  );
}

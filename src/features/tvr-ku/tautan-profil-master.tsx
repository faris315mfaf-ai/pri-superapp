"use client";

// ============================================================
// TautanProfilMaster (13 Okt 2026) — bagian TVR Saya khusus master:
// menautkan profil upload-post yang SUDAH ADA ke akun superapp mana pun
// (anggota biasa maupun akun Divisi BOT), dengan pencarian dan filter divisi
// di pemilih akun. Memakai modal & API yang sama dengan HR Center.
// ============================================================

import { useEffect, useState } from "react";
import { Link2, Plus } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton, SectionTitle } from "@/components/pri-ui";
import { PlatformIcon } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import { useVersiSegar } from "@/hooks/use-segar-otomatis";
import { getTvAnggotaDashboard, type ProfilBelumTertaut } from "@/services";
import { ModalTautkanProfil, type PermintaanTautkan } from "@/features/dashboard/modal-tautkan-profil";
import { cn } from "@/lib/utils";

const PLATFORM6 = ["instagram", "tiktok", "youtube", "facebook", "threads", "twitter"];

export function TautanProfilMaster() {
  const versiSegar = useVersiSegar();
  const [tik, setTik] = useState(0);
  const [data, setData] = useState<{ siap: boolean; kuota: number; terpakai: number; belum: ProfilBelumTertaut[] } | null>(null);
  const [tautkan, setTautkan] = useState<PermintaanTautkan | null>(null);

  useEffect(() => {
    let hidup = true;
    getTvAnggotaDashboard()
      .then((d) => hidup && setData({ siap: d.siap, kuota: d.kuota, terpakai: d.terpakai, belum: d.belum_tertaut }))
      .catch((e) => {
        if (!hidup) return;
        setData({ siap: false, kuota: 0, terpakai: 0, belum: [] });
        toast("error", "Daftar profil upload-post gagal dimuat", e instanceof Error ? e.message : "");
      });
    return () => {
      hidup = false;
    };
  }, [versiSegar, tik]);

  return (
    <section>
      <SectionTitle judul="Tautkan Profil Upload-Post" />
      <GlassCard className="mt-2.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-teks-sekunder">
            Profil yang dibuat di dashboard upload-post belum dikenal aplikasi. Tautkan ke akun superapp
            (anggota atau akun BOT) supaya menjadi profil TV Rakyat Saya akun itu. Pemilih akun punya
            pencarian dan filter divisi.
          </p>
          <button
            type="button"
            onClick={() => setTautkan({ mode: "buat" })}
            className="btn-tekan flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold text-white"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Profil baru
          </button>
        </div>

        {data === null ? (
          <GlassSkeleton className="mt-3 h-24 rounded-2xl" />
        ) : !data.siap ? (
          <p className="mt-3 text-center text-[11.5px] text-teks-sekunder">upload-post belum tersambung.</p>
        ) : (
          <>
            <p className="mt-3 text-[12px] font-bold text-teks-utama">
              Profil belum ditautkan ({data.belum.length})
              <span className="ml-2 font-normal text-teks-sekunder">
                kuota {data.terpakai}/{data.kuota}
              </span>
            </p>
            {data.belum.length === 0 ? (
              <p className="mt-1 text-[12px] text-teks-sekunder">Semua profil upload-post sudah tertaut.</p>
            ) : (
              <div className="scrollbar-tipis mt-2 flex max-h-72 flex-col gap-1.5 overflow-y-auto">
                {data.belum.map((p) => (
                  <div key={p.profil} className="flex items-center gap-2.5 rounded-xl px-2 py-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pri/10 text-pri">
                      <Link2 className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-teks-utama">{p.profil}</span>
                      <span className="mt-0.5 flex items-center gap-1">
                        {PLATFORM6.map((pf) => (
                          <PlatformIcon
                            key={pf}
                            platform={pf}
                            className={cn("h-3 w-3", p.akun[pf] ? "text-emerald-500" : "text-teks-sekunder/30")}
                          />
                        ))}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setTautkan({ mode: "tautkan", profil: p.profil })}
                      className="btn-tekan rounded-full bg-pri/12 px-3 py-1.5 text-[11px] font-bold text-pri"
                    >
                      Tautkan
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </GlassCard>

      {tautkan && (
        <ModalTautkanProfil
          permintaan={tautkan}
          onTutup={() => setTautkan(null)}
          onSelesai={() => {
            setTautkan(null);
            setTik((t) => t + 1);
          }}
        />
      )}
    </section>
  );
}

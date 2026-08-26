"use client";

// ============================================================
// PengaturanFiturScreen — super admin menyalakan/mematikan fitur
// untuk tiap PERAN. Yang dimatikan langsung hilang dari ponsel
// pemegang peran itu, tanpa perlu rilis aplikasi baru.
//
// Aturan yang tampak di layar: sakelar HIJAU = nyala. Tidak ada
// baris tersimpan berarti nyala, jadi fitur baru otomatis tersedia
// dan tidak ada peran yang mendadak terkunci.
//
// Peran master sengaja TIDAK ada di daftar: dialah yang memegang
// panel ini, dan mengunci dirinya sendiri hanya akan membuat
// sistem tidak bisa dipulihkan dari dalam aplikasi.
// ============================================================

import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, SlidersHorizontal } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { FadeInUp, GlassSkeleton, SectionTitle } from "@/components/pri-ui";
import { SwitchKaca } from "./switch-kaca";
import { toast, useAppStore } from "@/hooks/use-app-store";
import { getIzinFitur, getMatriksFitur, setIzinFitur, type MatriksFitur } from "@/services";
import { cn } from "@/lib/utils";

export function PengaturanFiturScreen({ onKembali }: { onKembali: () => void }) {
  const [data, setData] = useState<MatriksFitur | null>(null);
  const [peranAktif, setPeranAktif] = useState<string>("anggota");
  const [sedangUbah, setSedangUbah] = useState<string | null>(null);
  const setIzinSaya = useAppStore((s) => s.setIzinFitur);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getMatriksFitur();
        if (hidup) setData(hasil);
      } catch (e) {
        if (hidup) {
          setData(null);
          toast("error", "Gagal memuat pengaturan", e instanceof Error ? e.message : "");
        }
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  async function ubah(fitur: string, nyala: boolean) {
    if (sedangUbah) return;
    setSedangUbah(fitur);
    try {
      await setIzinFitur(peranAktif, fitur, nyala);
      // Perbarui salinan di layar tanpa memuat ulang seluruh matriks.
      setData((lama) => {
        if (!lama) return lama;
        const mati = { ...lama.mati };
        const daftar = new Set(mati[peranAktif] ?? []);
        if (nyala) daftar.delete(fitur);
        else daftar.add(fitur);
        mati[peranAktif] = Array.from(daftar);
        return { ...lama, mati };
      });
      // Bila yang diubah adalah peran SAYA sendiri, segarkan izin yang
      // dipakai layar-layar lain supaya perubahannya langsung terasa.
      const peranSaya = useAppStore.getState().user?.role;
      if (peranSaya === peranAktif) setIzinSaya(await getIzinFitur());
    } catch (e) {
      toast("error", "Gagal menyimpan", e instanceof Error ? e.message : "");
    } finally {
      setSedangUbah(null);
    }
  }

  const mati = new Set(data?.mati[peranAktif] ?? []);
  const kelompok = Array.from(new Set((data?.katalog ?? []).map((f) => f.kelompok)));

  return (
    <div className="kolom-aplikasi px-4 pt-5 pb-16">
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={onKembali}
          aria-label="Kembali"
          className="glass btn-tekan flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-teks-utama"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading truncate text-xl font-extrabold tracking-tight text-teks-utama">
            Pengaturan Fitur
          </h1>
          <p className="text-xs text-teks-sekunder">Atur fitur per peran</p>
        </div>
        <SlidersHorizontal className="h-5 w-5 shrink-0 text-pri" aria-hidden="true" />
      </header>

      {data === null ? (
        <GlassSkeleton className="mt-4 h-40 rounded-2xl" />
      ) : (
        <>
          {/* Pemilih peran */}
          <div className="scrollbar-tipis mt-4 flex gap-2 overflow-x-auto pb-1">
            {data.peran.map((p) => {
              const jumlahMati = (data.mati[p.id] ?? []).length;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeranAktif(p.id)}
                  className={cn(
                    "btn-tekan flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold",
                    peranAktif === p.id ? "text-white" : "glass text-teks-sekunder",
                  )}
                  style={
                    peranAktif === p.id
                      ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                      : undefined
                  }
                >
                  {p.label}
                  {jumlahMati > 0 && (
                    <span
                      className={cn(
                        "angka-tab rounded-full px-1.5 text-[10px]",
                        peranAktif === p.id ? "bg-white/25" : "bg-gagal/15 text-gagal",
                      )}
                    >
                      {jumlahMati} mati
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-teks-sekunder">
            Sakelar mati berarti fiturnya hilang dari aplikasi pemegang peran{" "}
            <b>{data.peran.find((p) => p.id === peranAktif)?.label}</b>, dan
            permintaannya ditolak server — bukan sekadar tombol yang disembunyikan.
          </p>

          {/* Daftar fitur per kelompok */}
          {kelompok.map((k, ik) => (
            <FadeInUp key={k} delay={Math.min(ik * 0.03, 0.2)}>
              <SectionTitle judul={k} className="mt-5" />
              <div className="flex flex-col gap-2">
                {data.katalog
                  .filter((f) => f.kelompok === k)
                  .map((f) => {
                    const nyala = !mati.has(f.kunci);
                    return (
                      <GlassCard key={f.kunci} className="flex items-center gap-3 p-3.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-teks-utama">{f.label}</p>
                          <p className="mt-0.5 text-[11px] leading-snug text-teks-sekunder">
                            {f.keterangan}
                          </p>
                        </div>
                        {sedangUbah === f.kunci ? (
                          <Loader2
                            className="h-4 w-4 shrink-0 animate-spin text-teks-sekunder"
                            aria-hidden="true"
                          />
                        ) : (
                          <SwitchKaca
                            aktif={nyala}
                            onUbah={() => void ubah(f.kunci, !nyala)}
                            labelAria={`${f.label} untuk ${peranAktif}`}
                          />
                        )}
                      </GlassCard>
                    );
                  })}
              </div>
            </FadeInUp>
          ))}
        </>
      )}
    </div>
  );
}

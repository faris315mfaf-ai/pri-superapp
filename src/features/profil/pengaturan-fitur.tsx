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
import {
  getBonusKoin,
  getIzinFitur,
  getMatriksFitur,
  setBonusKoin,
  setIzinFitur,
  type MatriksFitur,
} from "@/services";
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

          {/* Target DIVISI (spek 1.16): fitur bisa dimatikan per divisi */}
          <p className="mt-3 text-[10.5px] font-bold tracking-wide text-teks-sekunder uppercase">
            Atau per divisi
          </p>
          <div className="scrollbar-tipis mt-1.5 flex gap-2 overflow-x-auto pb-1">
            {(data.divisi ?? []).map((d) => {
              const id = `divisi:${d}`;
              const jumlahMati = (data.mati[id] ?? []).length;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPeranAktif(id)}
                  className={cn(
                    "btn-tekan flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold",
                    peranAktif === id ? "text-white" : "glass text-teks-sekunder",
                  )}
                  style={
                    peranAktif === id
                      ? { background: "linear-gradient(135deg, #F59E0B, #D97706)" }
                      : undefined
                  }
                >
                  {d.replace(/^Divisi /, "")}
                  {jumlahMati > 0 && (
                    <span
                      className={cn(
                        "angka-tab rounded-full px-1.5 text-[10px]",
                        peranAktif === id ? "bg-white/25" : "bg-gagal/15 text-gagal",
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
            Sakelar mati berarti fiturnya hilang dari aplikasi{" "}
            <b>
              {peranAktif.startsWith("divisi:")
                ? `seluruh anggota ${peranAktif.slice(7)}`
                : `pemegang peran ${data.peran.find((p) => p.id === peranAktif)?.label ?? peranAktif}`}
            </b>
            , dan permintaannya ditolak server — bukan sekadar tombol yang
            disembunyikan. Bila mati di peran ATAU divisi, fiturnya mati.
          </p>

          {/* Bonus Koin (spek 1.16) — hanya master yang bisa mengubah */}
          <SeksiBonusKoin />

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

// ------------------------------------------------------------
// SeksiBonusKoin — master mengatur jumlah koin tiap aktivitas
// (spek 1.16). 0 = aktivitas itu tidak berhadiah.
// ------------------------------------------------------------

const AKTIVITAS_TAMPIL = [
  { id: "absen", label: "Absen masuk harian" },
  { id: "chat_baru", label: "Chat pertama ke teman baru" },
  { id: "laporan_video", label: "Laporan video tersimpan" },
  { id: "akun_sosmed", label: "Menambahkan akun sosmed" },
] as const;

function SeksiBonusKoin() {
  const user = useAppStore((s) => s.user);
  const [bonus, setBonus] = useState<Record<string, number> | null>(null);
  const [sedang, setSedang] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getBonusKoin();
        if (hidup) setBonus(hasil);
      } catch {
        if (hidup) setBonus({});
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  if (user?.role !== "master") return null;

  async function simpan(id: string, nilai: number) {
    if (sedang) return;
    setSedang(id);
    try {
      await setBonusKoin(id, nilai);
      setBonus((b) => ({ ...(b ?? {}), [id]: nilai }));
      toast("sukses", "Bonus koin tersimpan", `${nilai} koin per aktivitas.`);
    } catch (e) {
      toast("error", "Gagal menyimpan bonus", e instanceof Error ? e.message : "");
    } finally {
      setSedang(null);
    }
  }

  return (
    <>
      <SectionTitle judul="Bonus Koin" className="mt-6" />
      <p className="mb-2 text-[11px] leading-relaxed text-teks-sekunder">
        Jumlah koin yang didapat anggota dari tiap aktivitas. Isi 0 untuk
        mematikan hadiah aktivitas itu.
      </p>
      <div className="flex flex-col gap-2">
        {AKTIVITAS_TAMPIL.map((a) => (
          <GlassCard key={a.id} className="flex items-center gap-3 p-3">
            <img src="/KMP.svg" alt="" aria-hidden="true" className="h-6 w-6 shrink-0" />
            <p className="min-w-0 flex-1 text-[12.5px] font-semibold text-teks-utama">
              {a.label}
            </p>
            {bonus === null ? (
              <Loader2 className="h-4 w-4 animate-spin text-teks-sekunder" />
            ) : (
              <input
                type="number"
                min={0}
                max={1000}
                defaultValue={bonus[a.id] ?? 0}
                disabled={sedang === a.id}
                aria-label={`Bonus koin ${a.label}`}
                onBlur={(e) => {
                  const n = Math.max(0, Math.min(1000, Math.floor(Number(e.target.value) || 0)));
                  if (n !== (bonus[a.id] ?? 0)) void simpan(a.id, n);
                }}
                className="glass angka-tab h-9 w-20 rounded-lg px-2 text-center text-sm font-bold text-teks-utama focus:outline-none disabled:opacity-50"
              />
            )}
          </GlassCard>
        ))}
      </div>
    </>
  );
}

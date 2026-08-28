"use client";

// ============================================================
// KelolaAksesDashboardScreen (fitur 1.19/3.3) — master/super admin
// menyalakan/mematikan tiap sub-dashboard PER JABATAN.
//
// Sakelar HIJAU = jabatan itu bisa membuka sub-dashboard tsb.
// Berkebalikan dengan Pengaturan Fitur: di sini baris tersimpan =
// NYALA, dan jabatan baru mulai dari mati — dashboard berisi data
// lintas anggota, jadi aksesnya harus dinyalakan secara sadar.
//
// Peran master tidak ada di daftar: aksesnya selalu penuh supaya
// pemegang kendali tidak bisa mengunci dirinya sendiri.
// ============================================================

import { useEffect, useState } from "react";
import { ArrowLeft, Bot, LayoutDashboard } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton } from "@/components/pri-ui";
import { SwitchKaca } from "@/features/profil/switch-kaca";
import { toast } from "@/hooks/use-app-store";
import {
  getAksesAsisten,
  getMatriksDashboard,
  setAksesAsisten,
  setAksesDashboard,
  type MatriksDashboard,
} from "@/services";
import { KATALOG_DASHBOARD } from "@/lib/dashboard-katalog";
import { cn } from "@/lib/utils";

export function KelolaAksesDashboardScreen({ onKembali }: { onKembali: () => void }) {
  const [data, setData] = useState<MatriksDashboard | null>(null);
  const [peranAktif, setPeranAktif] = useState<string>("ketua");
  const [sedangUbah, setSedangUbah] = useState<string | null>(null);
  // Akses Asisten AI per jabatan (fitur 1.20/3) — dikelola di layar
  // yang sama supaya master punya SATU pintu pengaturan akses.
  const [asistenNyala, setAsistenNyala] = useState<string[] | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const [hasil, asisten] = await Promise.all([
          getMatriksDashboard(),
          getAksesAsisten().catch(() => null),
        ]);
        if (!hidup) return;
        setData(hasil);
        if (asisten) setAsistenNyala(asisten.nyala);
      } catch (e) {
        if (hidup) {
          setData(null);
          toast("error", "Gagal memuat akses", e instanceof Error ? e.message : "");
        }
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  async function ubahAsisten(role: string, nyala: boolean) {
    if (sedangUbah) return;
    setSedangUbah(`asisten:${role}`);
    try {
      await setAksesAsisten(role, nyala);
      setAsistenNyala((lama) => {
        const set = new Set(lama ?? []);
        if (nyala) set.add(role);
        else set.delete(role);
        return Array.from(set);
      });
    } catch (e) {
      toast("error", "Gagal menyimpan", e instanceof Error ? e.message : "");
    } finally {
      setSedangUbah(null);
    }
  }

  async function ubah(kunci: string, nyala: boolean) {
    if (sedangUbah) return;
    setSedangUbah(kunci);
    try {
      await setAksesDashboard(peranAktif, kunci, nyala);
      // Perbarui salinan layar tanpa memuat ulang seluruh matriks.
      setData((lama) => {
        if (!lama) return lama;
        const nyalaBaru = { ...lama.nyala };
        const daftar = new Set(nyalaBaru[peranAktif] ?? []);
        if (nyala) daftar.add(kunci);
        else daftar.delete(kunci);
        nyalaBaru[peranAktif] = Array.from(daftar);
        return { ...lama, nyala: nyalaBaru };
      });
    } catch (e) {
      toast("error", "Gagal menyimpan", e instanceof Error ? e.message : "");
    } finally {
      setSedangUbah(null);
    }
  }

  const nyala = new Set(data?.nyala[peranAktif] ?? []);

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
            Kelola Akses Dashboard
          </h1>
          <p className="text-xs text-teks-sekunder">Atur dashboard per jabatan</p>
        </div>
        <LayoutDashboard className="h-5 w-5 shrink-0 text-pri" aria-hidden="true" />
      </header>

      {data === null ? (
        <GlassSkeleton className="mt-4 h-40 rounded-2xl" />
      ) : (
        <>
          {/* Pemilih jabatan */}
          <div className="scrollbar-tipis mt-4 flex gap-2 overflow-x-auto pb-1">
            {data.peran.map((p) => {
              const jumlah = (data.nyala[p.id] ?? []).length;
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
                  {jumlah > 0 && (
                    <span
                      className={cn(
                        "angka-tab rounded-full px-1.5 py-0.5 text-[10px] leading-none font-bold",
                        peranAktif === p.id
                          ? "bg-white/25 text-white"
                          : "bg-sukses/15 text-sukses",
                      )}
                    >
                      {jumlah}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <GlassCard className="mt-4 p-2">
            {KATALOG_DASHBOARD.map((d, i) => (
              <div
                key={d.kunci}
                className={cn(
                  "flex items-center gap-3 px-3 py-3",
                  i > 0 && "border-t border-glass-border",
                )}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
                  style={{
                    backgroundColor: "rgba(220,38,38,0.10)",
                    borderColor: "rgba(220,38,38,0.22)",
                    color: "#DC2626",
                  }}
                  aria-hidden="true"
                >
                  <d.ikon className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-teks-utama">{d.label}</p>
                  <p className="truncate text-[11px] text-teks-sekunder">{d.keterangan}</p>
                </div>
                <SwitchKaca
                  aktif={nyala.has(d.kunci)}
                  disabled={sedangUbah === d.kunci}
                  onUbah={() => void ubah(d.kunci, !nyala.has(d.kunci))}
                  labelAria={`${d.label} untuk ${peranAktif}`}
                />
              </div>
            ))}
          </GlassCard>

          {/* Akses Asisten AI per jabatan (fitur 1.20/3) */}
          {asistenNyala !== null && (
            <GlassCard className="mt-4 p-4">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-pri" aria-hidden="true" />
                <p className="text-sm font-bold text-teks-utama">Asisten AI (Chatbot)</p>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-teks-sekunder">
                Chatbot data internal (teks + suara). Nyalakan hanya untuk
                jabatan yang memang boleh membaca data lintas anggota.
              </p>
              <div className="mt-2.5 flex flex-col gap-1.5">
                {data.peran.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-xl bg-black/5 px-3 py-2 dark:bg-white/5"
                  >
                    <span className="min-w-0 flex-1 text-[12.5px] font-semibold text-teks-utama">
                      {p.label}
                    </span>
                    <SwitchKaca
                      aktif={asistenNyala.includes(p.id)}
                      disabled={sedangUbah === `asisten:${p.id}`}
                      onUbah={() => void ubahAsisten(p.id, !asistenNyala.includes(p.id))}
                      labelAria={`Asisten AI untuk ${p.label}`}
                    />
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          <p className="mt-3 text-center text-[11px] leading-relaxed text-teks-sekunder">
            Sakelar hijau = jabatan itu bisa membuka dashboard-nya. Perubahan
            berlaku maksimal 5 menit di ponsel anggota (atau seketika setelah
            aplikasinya dibuka ulang).
          </p>
        </>
      )}
    </div>
  );
}

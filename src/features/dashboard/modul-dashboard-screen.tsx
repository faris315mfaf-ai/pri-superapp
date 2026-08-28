"use client";

// ============================================================
// ModulDashboardScreen (fitur 1.19/3.3) — TAB "Dashboard".
//
// BEDAKAN dengan DashboardScreen (dashboard-screen.tsx) yang
// merupakan layar BERANDA super admin — nama mirip tapi perannya
// lain, karena itu file & nama komponen ini sengaja dibedakan.
//
// Sub-dashboard yang tampil MENGIKUTI akses jabatan (tabel
// dashboard_access, diatur master di "Kelola Akses Dashboard").
// Jabatan tanpa akses sama sekali melihat pesan, bukan layar kosong.
//
// Semua sub-dashboard bersifat BACA-SAJA: tempat memantau, bukan
// tempat mengubah data. Grafik dimuat malas (recharts besar).
// ============================================================

import { useState } from "react";
import dynamic from "next/dynamic";
import { Lock, Settings2 } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { FadeInUp, GlassSkeleton } from "@/components/pri-ui";
import { KATALOG_DASHBOARD } from "@/lib/dashboard-katalog";
import type { User } from "@/types";
import { cn } from "@/lib/utils";

// Sub-dashboard dimuat malas: tiap sub membawa tabel/grafik besar
// (recharts) yang tidak perlu ikut bundle awal aplikasi.
const AbsensiHariIniScreen = dynamic(
  () =>
    import("@/features/pengguna/absensi-hari-ini-screen").then(
      (m) => m.AbsensiHariIniScreen,
    ),
  { ssr: false, loading: () => <GlassSkeleton className="h-64 rounded-2xl" /> },
);
const KpiAnggotaDashboard = dynamic(
  () => import("./kpi-anggota-dashboard").then((m) => m.KpiAnggotaDashboard),
  { ssr: false, loading: () => <GlassSkeleton className="h-64 rounded-2xl" /> },
);
const KepatuhanKaderPanel = dynamic(
  () =>
    import("@/features/qc-konten/kepatuhan-kader-panel").then(
      (m) => m.KepatuhanKaderPanel,
    ),
  { ssr: false, loading: () => <GlassSkeleton className="h-64 rounded-2xl" /> },
);

type ModulDashboardScreenProps = {
  user: User;
  /** Kunci sub-dashboard yang boleh dibuka jabatan ini (dari server). */
  boleh: string[];
  /** Buka halaman Kelola Akses Dashboard (master/super admin). */
  onBukaKelola?: () => void;
};

export function ModulDashboardScreen({ user, boleh, onBukaKelola }: ModulDashboardScreenProps) {
  const daftar = KATALOG_DASHBOARD.filter((d) => boleh.includes(d.kunci));
  const [subAktif, setSubAktif] = useState<string | null>(null);
  const pengatur = user.role === "master" || user.role === "super_admin";

  // Sub aktif efektif: pilihan pengguna bila masih boleh, selain itu
  // sub pertama yang tersedia (tanpa effect — dihitung saat render).
  const aktif =
    subAktif && daftar.some((d) => d.kunci === subAktif)
      ? subAktif
      : (daftar[0]?.kunci ?? null);

  return (
    <div className="kolom-aplikasi px-4 pt-5 pb-28 lg:pb-10">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-teks-utama">
            Dashboard
          </h1>
          <p className="mt-0.5 text-xs text-teks-sekunder">
            Pantauan baca-saja sesuai akses jabatan
          </p>
        </div>
        {pengatur && onBukaKelola && (
          <button
            type="button"
            onClick={onBukaKelola}
            className="glass btn-tekan flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-xs font-bold text-teks-utama"
          >
            <Settings2 className="h-4 w-4 text-pri" aria-hidden="true" />
            Kelola Akses
          </button>
        )}
      </header>

      {daftar.length === 0 ? (
        // Jabatan ini belum diberi akses apa pun.
        <FadeInUp>
          <GlassCard className="mt-6 flex flex-col items-center gap-3 p-8 text-center">
            <span
              className="flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: "rgba(220,38,38,0.10)", color: "#DC2626" }}
              aria-hidden="true"
            >
              <Lock className="h-6 w-6" />
            </span>
            <p className="font-heading text-base font-bold text-teks-utama">
              Belum Ada Akses Dashboard
            </p>
            <p className="max-w-[300px] text-xs leading-relaxed text-teks-sekunder">
              Jabatan Anda belum diberi akses ke dashboard mana pun. Hubungi
              master/pengurus bila Anda merasa seharusnya punya akses.
            </p>
          </GlassCard>
        </FadeInUp>
      ) : (
        <>
          {/* Pemilih sub-dashboard */}
          <div className="scrollbar-tipis mt-4 flex gap-2 overflow-x-auto pb-1">
            {daftar.map((d) => (
              <button
                key={d.kunci}
                type="button"
                onClick={() => setSubAktif(d.kunci)}
                className={cn(
                  "btn-tekan flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold",
                  aktif === d.kunci ? "text-white" : "glass text-teks-sekunder",
                )}
                style={
                  aktif === d.kunci
                    ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                    : undefined
                }
              >
                <d.ikon className="h-3.5 w-3.5" aria-hidden="true" />
                {d.label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            <IsiSubDashboard kunci={aktif} />
          </div>
        </>
      )}
    </div>
  );
}

/** Isi tiap sub-dashboard — diisi bertahap (3.3.a sampai 3.3.e). */
function IsiSubDashboard({ kunci }: { kunci: string | null }) {
  // 3.3.a: komponen yang SAMA dengan halaman HR Center — mode
  // terbenam (tanpa header/tombol kembali). Memang baca-saja.
  if (kunci === "absensi") return <AbsensiHariIniScreen terbenam />;
  // 3.3.b: KPI harian per anggota + rencana besar divisi.
  if (kunci === "kpi") return <KpiAnggotaDashboard />;
  // 3.3.c: panel kepatuhan yang SAMA dengan HR Center, mode baca-saja
  // (tanpa tombol "Ingatkan via WA").
  if (kunci === "kepatuhan") return <KepatuhanKaderPanel editable={false} />;

  const info = KATALOG_DASHBOARD.find((d) => d.kunci === kunci);
  if (!info) return null;
  return (
    <GlassCard className="flex flex-col items-center gap-2 p-8 text-center">
      <info.ikon className="h-8 w-8 text-teks-sekunder/50" aria-hidden="true" />
      <p className="font-heading text-sm font-bold text-teks-utama">{info.label}</p>
      <p className="text-xs text-teks-sekunder">Segera hadir.</p>
    </GlassCard>
  );
}

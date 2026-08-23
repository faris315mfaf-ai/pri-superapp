"use client";

// ============================================================
// PRI SuperApp — Cangkang Aplikasi (satu-satunya route "/")
// Login → Splash → Aplikasi (tab per role + sub-layar QC).
// Semua layar fitur digabung di sini.
// ============================================================

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MeshBackground } from "@/components/mesh-background";
import { ToastViewport } from "@/components/toast-viewport";
import { PushBannerStack } from "@/components/push-banner";
import { BottomNav, type KunciTab } from "@/components/bottom-nav";
import { LoginScreen } from "@/features/auth/login-screen";
import { SplashScreen } from "@/features/auth/splash-screen";
import { DashboardScreen } from "@/features/dashboard/dashboard-screen";
import { QcScreen } from "@/features/qc-konten/qc-screen";
import { AccountDetailScreen } from "@/features/qc-konten/account-detail-screen";
import { PostDetailScreen } from "@/features/qc-konten/post-detail-screen";
import { TvScreen } from "@/features/tv-rakyat/tv-screen";
import { NotifikasiScreen } from "@/features/notifikasi/notifikasi-screen";
import { ProfilScreen } from "@/features/profil/profil-screen";
import { useAppStore } from "@/hooks/use-app-store";
import { getNotifikasi } from "@/services";
import type { Role, User } from "@/types";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------
// Navigasi
// ------------------------------------------------------------

type SubLayar =
  | { nama: "qc-akun"; akunWajib: string }
  | { nama: "qc-postingan"; idPostingan: string; akunWajib: string };

const TAB_AWAL: Record<Role, KunciTab> = {
  super_admin: "beranda",
  admin_hr: "qc",
  admin_tv: "tv",
};

const TAB_ROLE: Record<Role, KunciTab[]> = {
  super_admin: ["beranda", "qc", "tv", "notifikasi", "profil"],
  admin_hr: ["qc", "notifikasi", "profil"],
  admin_tv: ["tv", "notifikasi", "profil"],
};

const berlanggananKosong = () => () => {};

export default function Page() {
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const tema = useAppStore((s) => s.tema);
  const notifikasi = useAppStore((s) => s.notifikasi);

  // Deteksi mount tanpa setState-in-effect (aman SSR/hidrasi)
  const siap = useSyncExternalStore(
    berlanggananKosong,
    () => true,
    () => false,
  );

  // Splash 0,8 detik hanya setelah login baru (bukan sesi tersimpan)
  const [menyambut, setMenyambut] = useState(false);
  const [tab, setTab] = useState<KunciTab>(() => {
    const tersimpan = useAppStore.getState().user;
    return tersimpan ? TAB_AWAL[tersimpan.role] : "beranda";
  });
  const [subLayar, setSubLayar] = useState<SubLayar | null>(null);
  const pushTerkirim = useRef(false);

  // ------------------------------------------------------------
  // Sinkronisasi tema → class .dark pada <html>
  // ------------------------------------------------------------
  useEffect(() => {
    document.documentElement.classList.toggle("dark", tema === "dark");
  }, [tema]);

  // Pengaman tanpa effect: tab efektif selalu valid untuk role aktif
  const tabEfektif = useMemo(() => {
    if (!user) return tab;
    return TAB_ROLE[user.role].includes(tab) ? tab : TAB_AWAL[user.role];
  }, [user, tab]);

  // ------------------------------------------------------------
  // Muat notifikasi saat aplikasi aktif
  // ------------------------------------------------------------
  const aplikasiAktif = siap && !!user && !menyambut;
  useEffect(() => {
    if (!aplikasiAktif) return;
    let hidup = true;
    void (async () => {
      try {
        const items = await getNotifikasi();
        if (hidup) useAppStore.getState().setNotifikasi(items);
      } catch {
        // Notifikasi gagal dimuat — biarkan tanpa daftar
      }
    })();
    return () => {
      hidup = false;
    };
  }, [aplikasiAktif]);

  // ------------------------------------------------------------
  // Simulasi push notification: 2 banner beberapa detik setelah login
  // ------------------------------------------------------------
  useEffect(() => {
    if (!aplikasiAktif || pushTerkirim.current || notifikasi.length === 0) return;
    pushTerkirim.current = true;

    const pertama = notifikasi[0];
    const kedua = notifikasi[1];
    const timer1 = pertama
      ? setTimeout(() => {
          useAppStore.getState().pushPushBanner({
            judul: pertama.judul,
            isi: pertama.isi,
            waktu: "sekarang",
            target: pertama.target,
          });
        }, 3500)
      : undefined;
    const timer2 = kedua
      ? setTimeout(() => {
          useAppStore.getState().pushPushBanner({
            judul: kedua.judul,
            isi: kedua.isi,
            waktu: "sekarang",
            target: kedua.target,
          });
        }, 9000)
      : undefined;

    return () => {
      if (timer1) clearTimeout(timer1);
      if (timer2) clearTimeout(timer2);
    };
  }, [aplikasiAktif, notifikasi]);

  // Reset scroll saat pindah layar
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab, subLayar]);

  const belumBaca = useMemo(
    () => notifikasi.filter((n) => !n.dibaca).length,
    [notifikasi],
  );

  // ------------------------------------------------------------
  // Aksi navigasi
  // ------------------------------------------------------------

  function loginBerhasil(userBaru: User) {
    setUser(userBaru);
    setTab(TAB_AWAL[userBaru.role]);
    setSubLayar(null);
    pushTerkirim.current = false;
    setMenyambut(true);
    setTimeout(() => setMenyambut(false), 800);
  }

  function keluar() {
    useAppStore.getState().logout();
    useAppStore.getState().setNotifikasi([]);
    setSubLayar(null);
    setTab("beranda");
    pushTerkirim.current = false;
    setMenyambut(false);
  }

  function pilihTab(t: KunciTab) {
    setSubLayar(null);
    setTab(t);
  }

  function handleTarget(target: "qc" | "tv" | "dashboard" | "notifikasi" | null) {
    if (!user) return;
    if (target === "qc" && (user.role === "super_admin" || user.role === "admin_hr")) {
      pilihTab("qc");
    } else if (target === "tv" && (user.role === "super_admin" || user.role === "admin_tv")) {
      pilihTab("tv");
    } else if (target === "dashboard" && user.role === "super_admin") {
      pilihTab("beranda");
    } else if (target === "notifikasi") {
      pilihTab("notifikasi");
    }
  }

  // ------------------------------------------------------------
  // Layar-layar tab (selalu terpasang agar state terjaga)
  // ------------------------------------------------------------

  const layarTab: { kunci: KunciTab; isi: React.ReactNode }[] = [];
  if (user) {
    if (user.role === "super_admin") {
      layarTab.push({
        kunci: "beranda",
        isi: (
          <DashboardScreen
            user={user}
            onBukaModulQc={() => pilihTab("qc")}
            onBukaModulTv={() => pilihTab("tv")}
            onBukaNotifikasi={() => pilihTab("notifikasi")}
            jumlahBelumBaca={belumBaca}
          />
        ),
      });
    }
    if (user.role === "super_admin" || user.role === "admin_hr") {
      layarTab.push({
        kunci: "qc",
        isi: (
          <QcScreen
            onBukaAkun={(akunWajib) => setSubLayar({ nama: "qc-akun", akunWajib })}
          />
        ),
      });
    }
    if (user.role === "super_admin" || user.role === "admin_tv") {
      layarTab.push({ kunci: "tv", isi: <TvScreen user={user} /> });
    }
    layarTab.push({
      kunci: "notifikasi",
      isi: <NotifikasiScreen onTarget={handleTarget} />,
    });
    layarTab.push({ kunci: "profil", isi: <ProfilScreen user={user} onLogout={keluar} /> });
  }

  const kunciSub = subLayar
    ? subLayar.nama === "qc-akun"
      ? `qc-akun-${subLayar.akunWajib}`
      : `qc-postingan-${subLayar.idPostingan}`
    : null;

  // ------------------------------------------------------------
  // Render
  // ------------------------------------------------------------

  return (
    <>
      <MeshBackground />

      {/* Boot singkat: hindari ketidakcocokan hidrasi */}
      {!siap && null}

      {/* Layar login */}
      {siap && !user && (
        <motion.div
          key="login"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <LoginScreen onLoginBerhasil={loginBerhasil} />
        </motion.div>
      )}

      {/* Splash transisi setelah login */}
      {siap && user && menyambut && (
        <motion.div
          key="splash"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <SplashScreen user={user} />
        </motion.div>
      )}

      {/* Aplikasi utama */}
      {siap && user && !menyambut && (
        <div className="relative min-h-dvh">
          {/* Tumpukan layar tab — semua terpasang, state terjaga */}
          <div className="relative">
            {layarTab.map(({ kunci, isi }) => (
              <div
                key={kunci}
                aria-hidden={kunci !== tabEfektif}
                className={cn(
                  "transition-[opacity,visibility] duration-300",
                  kunci === tabEfektif
                    ? "relative visible opacity-100"
                    : "invisible pointer-events-none absolute inset-0 overflow-hidden opacity-0",
                )}
              >
                {isi}
              </div>
            ))}
          </div>

          {/* Bottom navigation (tersembunyi saat sub-layar aktif) */}
          {!subLayar && (
            <BottomNav
              role={user.role}
              tabAktif={tabEfektif}
              onTab={pilihTab}
              belumBaca={belumBaca}
            />
          )}

          {/* Sub-layar QC: slide dari kanan, menutupi layar tab */}
          <AnimatePresence>
            {subLayar && (
              <motion.div
                key={kunciSub}
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", stiffness: 340, damping: 34 }}
                className="fixed inset-0 z-40 overflow-y-auto overscroll-contain"
              >
                <MeshBackground />
                {subLayar.nama === "qc-akun" ? (
                  <AccountDetailScreen
                    akunWajib={subLayar.akunWajib}
                    onKembali={() => setSubLayar(null)}
                    onBukaPostingan={(idPostingan) =>
                      setSubLayar({
                        nama: "qc-postingan",
                        idPostingan,
                        akunWajib: subLayar.akunWajib,
                      })
                    }
                  />
                ) : (
                  <PostDetailScreen
                    idPostingan={subLayar.idPostingan}
                    akunWajib={subLayar.akunWajib}
                    onKembali={() =>
                      setSubLayar({ nama: "qc-akun", akunWajib: subLayar.akunWajib })
                    }
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Lapisan global: toast + push banner */}
      <ToastViewport />
      <PushBannerStack onTarget={handleTarget} />
    </>
  );
}

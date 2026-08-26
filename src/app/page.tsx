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
import { PagarGalat } from "@/components/pagar-galat";
import { SideNav } from "@/components/side-nav";
import { AuthScreen } from "@/features/auth/auth-screen";
import { SplashScreen } from "@/features/auth/splash-screen";
import { DashboardScreen } from "@/features/dashboard/dashboard-screen";
import { QcScreen } from "@/features/qc-konten/qc-screen";
import { AccountDetailScreen } from "@/features/qc-konten/account-detail-screen";
import { PostDetailScreen } from "@/features/qc-konten/post-detail-screen";
import { TvScreen } from "@/features/tv-rakyat/tv-screen";
import { KelolaPenggunaScreen } from "@/features/pengguna/kelola-pengguna-screen";
import { KontenScreen } from "@/features/konten/konten-screen";
import { TvrKuScreen } from "@/features/tvr-ku/tvrku-screen";
import { ChatScreen } from "@/features/chat/chat-screen";
import { NotifikasiScreen } from "@/features/notifikasi/notifikasi-screen";
import { ProfilScreen } from "@/features/profil/profil-screen";
import { AbsensiScreen } from "@/features/absensi/absensi-screen";
import { LaporanKerjaScreen } from "@/features/laporan-kerja/laporan-kerja-screen";
import { PanelMasterScreen } from "@/features/profil/panel-master";
import { PengaturanFiturScreen } from "@/features/profil/pengaturan-fitur";
import { BerandaScreen } from "@/features/beranda/beranda-screen";
import { DatabaseScreen } from "@/features/database/database-screen";
import { ModalVerifikasiWa } from "@/features/profil/pengaturan-akun";
import { bolehFitur } from "@/lib/fitur";
import { toast, useAppStore } from "@/hooks/use-app-store";
import { adalahPimred } from "@/lib/jabatan";
import {
  getIzinFitur,
  getNotifikasi,
  keluar as keluarService,
  masukOtomatis,
} from "@/services";
import type { Role, User } from "@/types";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------
// Navigasi
// ------------------------------------------------------------

type SubLayar =
  | { nama: "qc-akun"; akunWajib: string }
  | { nama: "qc-postingan"; idPostingan: string; akunWajib: string }
  // Panel super admin: menyetujui pendaftar & menetapkan peran
  | { nama: "kelola-pengguna" }
  // Kehadiran & kinerja (dibuka dari tab Profil)
  | { nama: "absensi" }
  | { nama: "laporan-kerja" }
  // Notifikasi: kini dibuka dari lonceng kanan atas, bukan tab bawah
  | { nama: "notifikasi" }
  // Panel Master — kewenangan tertinggi, hanya peran master
  | { nama: "panel-master" }
  // Matriks izin fitur per peran (super admin)
  | { nama: "pengaturan-fitur" }
  // Database anggota (detail per pengguna, untuk pengurus)
  | { nama: "database" };

const TAB_AWAL: Record<Role, KunciTab> = {
  master: "beranda",
  super_admin: "beranda",
  admin_hr: "qc",
  admin_tv: "tv",
  ketua: "beranda",
  anggota: "beranda",
};

const TAB_ROLE: Record<Role, KunciTab[]> = {
  master: ["beranda", "qc", "tv", "tvrku", "chat", "profil"],
  // Super admin TIDAK punya tab TV Rakyat: otomatisasi video adalah
  // tanggung jawab tim TV Rakyat (lihat bolehProsesVideo di types).
  super_admin: ["beranda", "qc", "chat", "profil"],
  admin_hr: ["qc", "chat", "profil"],
  admin_tv: ["tv", "chat", "profil"],
  ketua: ["beranda", "konten", "tvrku", "chat", "profil"],
  anggota: ["beranda", "konten", "tvrku", "chat", "profil"],
};

const berlanggananKosong = () => () => {};

export default function Page() {
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const tema = useAppStore((s) => s.tema);
  const skalaFont = useAppStore((s) => s.skalaFont);

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
  // Id notifikasi yang sudah pernah terlihat di sesi ini. Dipakai untuk
  // membedakan notifikasi yang benar-benar BARU datang (layak dimunculkan
  // sebagai banner) dari yang memang sudah ada sejak awal.
  const idPernahDilihat = useRef<Set<string> | null>(null);

  // ------------------------------------------------------------
  // Sinkronisasi tema → class .dark pada <html>
  // ------------------------------------------------------------
  useEffect(() => {
    document.documentElement.classList.toggle("dark", tema === "dark");
  }, [tema]);

  // Skala teks pilihan pengguna. Seluruh ukuran Tailwind berbasis rem,
  // jadi mengubah font-size akar menskalakan seluruh aplikasi.
  useEffect(() => {
    const peta = { kecil: "14px", normal: "16px", besar: "18px" } as const;
    document.documentElement.style.fontSize = peta[skalaFont] ?? "16px";
  }, [skalaFont]);

  // ------------------------------------------------------------
  // Masuk otomatis
  //
  // Aplikasi menyimpan token perangkat, bukan kata sandi. Saat dibuka,
  // token itu ditukar dengan profil TERBARU dari server — sehingga
  // peran yang baru diubah super admin, atau akun yang baru dicabut,
  // langsung berlaku tanpa perlu pengguna keluar-masuk.
  //
  // Tidak ada batas waktu sesi: sekali masuk tetap masuk sampai menekan
  // Keluar, atau sampai super admin mencabut aksesnya dari server.
  // ------------------------------------------------------------
  const [memeriksaSesi, setMemeriksaSesi] = useState(true);
  // true = master menyalakan mode perbaikan; semua orang selain master
  // tertahan di layar khusus sampai perbaikan selesai.
  const [modePerbaikan, setModePerbaikan] = useState(false);
  useEffect(() => {
    if (!siap) return;
    let hidup = true;

    void (async () => {
      try {
        const tersimpan = await masukOtomatis();
        if (!hidup) return;
        if (tersimpan === "perbaikan") {
          // Token masih sah, tapi aplikasi sedang diperbaiki. Jangan
          // buang apa pun — begitu master mematikannya, buka ulang
          // aplikasi langsung masuk seperti biasa.
          setModePerbaikan(true);
        } else if (tersimpan) {
          setUser(tersimpan);
          setTab(TAB_AWAL[tersimpan.role]);
        } else if (useAppStore.getState().user) {
          // Ada sisa profil di penyimpanan lokal tapi tokennya sudah
          // tidak berlaku — bersihkan supaya tidak menampilkan data
          // milik akun yang aksesnya sudah dicabut.
          useAppStore.getState().logout();
        }
      } catch {
        // Gagal menghubungi server: biarkan apa adanya, pengguna bisa
        // masuk manual.
      } finally {
        if (hidup) setMemeriksaSesi(false);
      }
    })();

    return () => {
      hidup = false;
    };
  }, [siap, setUser]);

  // Daftar tab pengguna ini. Pimpinan Redaksi TV Rakyat mendapat tab
  // TV Rakyat OFFICIAL apa pun peran aplikasinya — hak penuhnya di
  // modul itu berasal dari jabatan, bukan dari role.
  const tabBoleh = useMemo<KunciTab[]>(() => {
    if (!user) return [];
    const dasar = [...TAB_ROLE[user.role]];
    if (adalahPimred(user) && !dasar.includes("tv")) {
      dasar.splice(dasar.indexOf("tvrku") >= 0 ? dasar.indexOf("tvrku") : 1, 0, "tv");
    }
    return dasar;
  }, [user]);

  // Pengaman tanpa effect: tab efektif selalu valid untuk role aktif
  const tabEfektif = useMemo(() => {
    if (!user) return tab;
    return tabBoleh.includes(tab) ? tab : TAB_AWAL[user.role];
  }, [user, tab, tabBoleh]);

  // ------------------------------------------------------------
  // Muat notifikasi saat aplikasi aktif
  // ------------------------------------------------------------
  const aplikasiAktif = siap && !!user && !menyambut;

  // Izin fitur per peran (diatur super admin). Dimuat sekali saat
  // masuk dan disegarkan tiap 5 menit, supaya fitur yang baru
  // dimatikan/dinyalakan ikut berlaku tanpa perlu keluar-masuk.
  useEffect(() => {
    if (!aplikasiAktif) return;
    let hidup = true;
    async function muatIzin() {
      const izin = await getIzinFitur();
      if (hidup) useAppStore.getState().setIzinFitur(izin);
    }
    void muatIzin();
    const detak = setInterval(() => void muatIzin(), 5 * 60_000);
    return () => {
      hidup = false;
      clearInterval(detak);
    };
  }, [aplikasiAktif]);

  /**
   * Muat notifikasi, lalu munculkan banner untuk yang benar-benar baru.
   *
   * Notifikasi dibuat oleh workflow n8n (mis. saat render video selesai),
   * jadi ia bisa datang kapan saja selagi aplikasi terbuka. Karena itu
   * daftarnya disegarkan berkala, bukan sekali saat login.
   *
   * Pemuatan PERTAMA tidak memunculkan banner apa pun — kalau tidak,
   * setiap kali masuk aplikasi admin akan dihujani banner untuk
   * notifikasi lama yang sudah pernah dilihatnya.
   */
  useEffect(() => {
    if (!aplikasiAktif) return;
    let hidup = true;

    async function muat() {
      // Jangan bekerja saat tab disembunyikan — hemat kuota & baterai.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const items = await getNotifikasi();
        if (!hidup) return;

        const pertamaKali = idPernahDilihat.current === null;
        if (pertamaKali) {
          idPernahDilihat.current = new Set(items.map((n) => n.id));
        } else {
          const dilihat = idPernahDilihat.current!;
          // Maksimal 2 banner sekaligus supaya layar tidak tertutup penuh
          // bila beberapa video selesai berbarengan.
          const baru = items.filter((n) => !dilihat.has(n.id)).slice(0, 2);
          for (const n of baru) {
            useAppStore.getState().pushPushBanner({
              judul: n.judul,
              isi: n.isi,
              waktu: n.waktu_relatif,
              target: n.target,
            });
          }
          items.forEach((n) => dilihat.add(n.id));
        }

        useAppStore.getState().setNotifikasi(items);
      } catch {
        // Gangguan sesaat tidak perlu diributkan — percobaan berikutnya
        // akan menyusul beberapa detik lagi.
      } finally {
        // WAJIB di finally: bila hanya diset saat sukses, satu kegagalan
        // membuat layar Notifikasi memuat tanpa henti selamanya.
        if (hidup) useAppStore.getState().setNotifikasiSiap();
      }
    }

    void muat();
    const berkala = setInterval(() => void muat(), 30_000);
    // Begitu admin kembali ke tab ini, segarkan langsung supaya tidak
    // perlu menunggu giliran berikutnya.
    const saatTerlihat = () => {
      if (document.visibilityState === "visible") void muat();
    };
    document.addEventListener("visibilitychange", saatTerlihat);

    return () => {
      hidup = false;
      clearInterval(berkala);
      document.removeEventListener("visibilitychange", saatTerlihat);
    };
  }, [aplikasiAktif]);

  // Banner push kini dimunculkan oleh efek pemuatan notifikasi di atas,
  // hanya untuk notifikasi yang benar-benar baru datang — bukan lagi dua
  // banner tiruan berjadwal beberapa detik setelah login.

  // Reset scroll saat pindah layar
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab, subLayar]);

  // Sengaja berlangganan ANGKA-nya, bukan array notifikasi mentahnya.
  //
  // KENAPA PENTING DI BERKAS INI: page.tsx memasang SELURUH layar tab
  // sekaligus, jadi satu render di sini berarti render ulang seluruh isi
  // aplikasi. Notifikasi dimuat ulang tiap 30 detik dan hampir selalu
  // menghasilkan array BARU; kalau yang dilanggan array-nya, seluruh aplikasi
  // ikut dirender ulang tiap 30 detik walau tidak ada satu pun notifikasi
  // yang berubah. Dengan berlangganan angka, zustand hanya membangunkan
  // komponen ini ketika jumlah belum-dibaca benar-benar berganti.
  const belumBaca = useAppStore(
    (s) => s.notifikasi.reduce((n, item) => (item.dibaca ? n : n + 1), 0),
  );

  // ------------------------------------------------------------
  // Aksi navigasi
  // ------------------------------------------------------------

  function loginBerhasil(userBaru: User) {
    setUser(userBaru);
    setTab(TAB_AWAL[userBaru.role]);
    setSubLayar(null);
    // Sesi baru: lupakan daftar id yang pernah dilihat, supaya pemuatan
    // pertama milik pengguna berikutnya juga tidak memunculkan banner.
    idPernahDilihat.current = null;
    setMenyambut(true);
    setTimeout(() => setMenyambut(false), 800);
  }

  function keluar() {
    // Cabut token di server, bukan sekadar hapus di ponsel. Kalau hanya
    // dihapus lokal, token lamanya masih sah dan bisa dipakai kembali
    // oleh siapa pun yang sempat menyalinnya.
    void keluarService();

    useAppStore.getState().logout();
    useAppStore.getState().setNotifikasi([]);
    setSubLayar(null);
    setTab("beranda");
    // Sesi baru: lupakan daftar id yang pernah dilihat, supaya pemuatan
    // pertama milik pengguna berikutnya juga tidak memunculkan banner.
    idPernahDilihat.current = null;
    setMenyambut(false);
  }

  function pilihTab(t: KunciTab) {
    setSubLayar(null);
    setTab(t);
  }

  // ------------------------------------------------------------
  // Tagihan verifikasi WhatsApp — muncul lagi tiap 3 jam sampai
  // nomornya diverifikasi. Stempel waktunya di localStorage supaya
  // menutup aplikasi tidak me-reset hitungannya.
  // ------------------------------------------------------------
  const izinFitur = useAppStore((s) => s.izinFitur);
  const [nagVerifWa, setNagVerifWa] = useState(false);
  useEffect(() => {
    if (!aplikasiAktif || !user || user.wa_terverifikasi !== false) return;
    const JEDA_MS = 3 * 60 * 60 * 1000;
    function cek() {
      let terakhir = 0;
      try {
        terakhir = Number(localStorage.getItem("pri-nag-verif-wa") ?? 0);
      } catch {
        // localStorage terblokir: tagih sekali per sesi saja.
      }
      if (Date.now() - terakhir >= JEDA_MS) setNagVerifWa(true);
    }
    cek();
    const detak = setInterval(cek, 10 * 60_000);
    return () => clearInterval(detak);
  }, [aplikasiAktif, user]);

  function tutupNagVerifWa() {
    try {
      localStorage.setItem("pri-nag-verif-wa", String(Date.now()));
    } catch {
      // dibiarkan — nag berikutnya muncul saat aplikasi dibuka lagi
    }
    setNagVerifWa(false);
  }

  // ------------------------------------------------------------
  // Tombol BACK Android (dan gestur kembali) — navigasi mulus.
  //
  // Aplikasi ini satu halaman, jadi tombol back bawaan ponsel akan
  // MENUTUP aplikasi begitu saja. Kita pasang satu entri riwayat
  // "penjaga" saat masuk; menekan back memicu popstate, dan kita yang
  // memutuskan artinya:
  //   1. Ada sub-layar terbuka  → tutup sub-layar itu.
  //   2. Bukan di tab awal      → kembali ke tab awal.
  //   3. Sudah di tab awal      → toast "tekan sekali lagi untuk
  //      keluar"; back kedua dalam 2 detik benar-benar keluar.
  // Penjaganya dipasang ulang setiap kali tertelan supaya back
  // berikutnya tetap kita yang menangani.
  // ------------------------------------------------------------
  const subLayarRef = useRef<SubLayar | null>(null);
  const tabRef = useRef<KunciTab>(tab);
  const siapKeluarRef = useRef(0);
  useEffect(() => {
    subLayarRef.current = subLayar;
    tabRef.current = tab;
  }, [subLayar, tab]);

  useEffect(() => {
    if (!user) return;
    history.pushState({ pri: true }, "");

    function saatBack() {
      const tabAwal = TAB_AWAL[useAppStore.getState().user?.role ?? "anggota"] ?? "beranda";
      if (subLayarRef.current) {
        setSubLayar(null);
        history.pushState({ pri: true }, "");
        return;
      }
      if (tabRef.current !== tabAwal) {
        setSubLayar(null);
        setTab(tabAwal);
        history.pushState({ pri: true }, "");
        return;
      }
      if (Date.now() - siapKeluarRef.current < 2000) {
        // Back kedua: biarkan keluar sungguhan.
        history.back();
        return;
      }
      siapKeluarRef.current = Date.now();
      toast("info", "Tekan kembali sekali lagi untuk keluar");
      history.pushState({ pri: true }, "");
    }

    window.addEventListener("popstate", saatBack);
    return () => window.removeEventListener("popstate", saatBack);
  }, [user]);

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
    // Tab yang tersedia mengikuti TAB_ROLE — satu sumber kebenaran,
    // supaya daftar tab di navigasi bawah dan layar yang dipasang di
    // sini tidak pernah berbeda.

    if (tabBoleh.includes("konten")) {
      layarTab.push({
        kunci: "konten",
        isi: (
          <KontenScreen
            user={user}
            onBukaLaporanKerja={() => setSubLayar({ nama: "laporan-kerja" })}
            onBukaNotifikasi={() => setSubLayar({ nama: "notifikasi" })}
          />
        ),
      });
    }
    if (tabBoleh.includes("beranda") && (user.role === "ketua" || user.role === "anggota")) {
      layarTab.push({
        kunci: "beranda",
        isi: (
          <BerandaScreen
            user={user}
            onBukaNotifikasi={() => setSubLayar({ nama: "notifikasi" })}
            onBukaLaporanKerja={() => setSubLayar({ nama: "laporan-kerja" })}
            onBukaAbsensi={() => setSubLayar({ nama: "absensi" })}
            onBukaTvrKu={() => pilihTab("tvrku")}
          />
        ),
      });
    } else if (tabBoleh.includes("beranda")) {
      layarTab.push({
        kunci: "beranda",
        isi: (
          <DashboardScreen
            onBukaDatabase={
              user.role !== "anggota" &&
              bolehFitur(izinFitur, "database.detail", user.role)
                ? () => setSubLayar({ nama: "database" })
                : undefined
            }
            user={user}
            onBukaKelolaPengguna={() => setSubLayar({ nama: "kelola-pengguna" })}
            onBukaModulQc={() => pilihTab("qc")}
            onBukaModulTv={() => pilihTab("tv")}
            onBukaNotifikasi={() => setSubLayar({ nama: "notifikasi" })}
            jumlahBelumBaca={belumBaca}
          />
        ),
      });
    }
    if (tabBoleh.includes("qc")) {
      layarTab.push({
        kunci: "qc",
        isi: (
          <QcScreen
            onBukaAkun={(akunWajib) => setSubLayar({ nama: "qc-akun", akunWajib })}
            onBukaNotifikasi={() => setSubLayar({ nama: "notifikasi" })}
          />
        ),
      });
    }
    if (tabBoleh.includes("tv")) {
      layarTab.push({
        kunci: "tv",
        isi: (
          <TvScreen
            user={user}
            onBukaNotifikasi={() => setSubLayar({ nama: "notifikasi" })}
          />
        ),
      });
    }
    if (tabBoleh.includes("tvrku")) {
      layarTab.push({
        kunci: "tvrku",
        isi: (
          <TvrKuScreen
            user={user}
            onBukaNotifikasi={() => setSubLayar({ nama: "notifikasi" })}
          />
        ),
      });
    }
    if (tabBoleh.includes("chat")) {
      layarTab.push({
        kunci: "chat",
        isi: (
          <ChatScreen
            user={user}
            onBukaNotifikasi={() => setSubLayar({ nama: "notifikasi" })}
          />
        ),
      });
    }

    layarTab.push({
      kunci: "profil",
      isi: (
        <ProfilScreen
          user={user}
          onLogout={keluar}
          onBukaAbsensi={() => setSubLayar({ nama: "absensi" })}
          onBukaLaporanKerja={() => setSubLayar({ nama: "laporan-kerja" })}
          onBukaNotifikasi={() => setSubLayar({ nama: "notifikasi" })}
          onBukaPanelMaster={() => setSubLayar({ nama: "panel-master" })}
          onBukaPengaturanFitur={() => setSubLayar({ nama: "pengaturan-fitur" })}
        />
      ),
    });
  }

  const kunciSub = subLayar
    ? subLayar.nama === "qc-akun"
      ? `qc-akun-${subLayar.akunWajib}`
      : subLayar.nama === "qc-postingan"
        ? `qc-postingan-${subLayar.idPostingan}`
        : subLayar.nama
    : null;

  // ------------------------------------------------------------
  // Render
  // ------------------------------------------------------------

  return (
    <>
      <MeshBackground />

      {/* Boot singkat: hindari ketidakcocokan hidrasi */}
      {!siap && null}

      {/* Mode perbaikan: pengganti seluruh aplikasi bagi non-master */}
      {siap && modePerbaikan && (
        <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
          <span
            className="flex h-20 w-20 items-center justify-center rounded-3xl text-4xl"
            style={{ background: "linear-gradient(135deg, #F59E0B22, #D9770622)" }}
            aria-hidden="true"
          >
            🛠️
          </span>
          <h1 className="font-heading mt-5 text-xl font-extrabold tracking-tight text-teks-utama">
            Sedang Dalam Perbaikan
          </h1>
          <p className="mt-2 max-w-[300px] text-sm leading-relaxed text-teks-sekunder">
            Aplikasi sedang ditingkatkan oleh pengelola. Data Anda aman — silakan
            coba lagi beberapa saat lagi.
          </p>
          <button
            type="button"
            onClick={() => location.reload()}
            className="btn-tekan mt-6 rounded-xl px-6 py-3 text-sm font-bold text-white"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Layar login */}
      {siap && !user && !memeriksaSesi && !modePerbaikan && (
        <motion.div
          key="login"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <AuthScreen onMasukBerhasil={loginBerhasil} />
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

      {/* Tagihan verifikasi WA (tiap 3 jam bagi yang belum) */}
      {siap && user && !menyambut && nagVerifWa && (
        <ModalVerifikasiWa onTutup={tutupNagVerifWa} />
      )}

      {/* Aplikasi utama */}
      {siap && user && !menyambut && (
        <div className="relative min-h-dvh">
          {/* Navigasi samping — hanya tampil di layar lebar (PC) */}
          <SideNav
            role={user.role}
            tabAktif={tabEfektif}
            onTab={pilihTab}
            belumBaca={belumBaca}
            tabs={tabBoleh}
          />

          {/* Tumpukan layar tab — semua terpasang, state terjaga.
              Di PC digeser ke kanan selebar rel navigasi samping. */}
          <div className="relative lg:pl-60">
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
                <PagarGalat nama={kunci}>{isi}</PagarGalat>
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
              tabs={tabBoleh}
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
                className="fixed inset-0 z-40 overflow-y-auto overscroll-contain lg:left-60"
              >
                <MeshBackground />
                <PagarGalat nama={subLayar.nama}>
                {subLayar.nama === "kelola-pengguna" ? (
                  <KelolaPenggunaScreen onKembali={() => setSubLayar(null)} />
                ) : subLayar.nama === "database" ? (
                  <DatabaseScreen onKembali={() => setSubLayar(null)} />
                ) : subLayar.nama === "pengaturan-fitur" ? (
                  <PengaturanFiturScreen onKembali={() => setSubLayar(null)} />
                ) : subLayar.nama === "panel-master" ? (
                  <PanelMasterScreen onKembali={() => setSubLayar(null)} />
                ) : subLayar.nama === "notifikasi" ? (
                  <NotifikasiScreen
                    onTarget={handleTarget}
                    onKembali={() => setSubLayar(null)}
                  />
                ) : subLayar.nama === "absensi" ? (
                  <AbsensiScreen user={user} onKembali={() => setSubLayar(null)} />
                ) : subLayar.nama === "laporan-kerja" ? (
                  <LaporanKerjaScreen user={user} onKembali={() => setSubLayar(null)} />
                ) : subLayar.nama === "qc-akun" ? (
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
                </PagarGalat>
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

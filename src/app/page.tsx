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
import { ModulDashboardScreen } from "@/features/dashboard/modul-dashboard-screen";
import { KelolaAksesDashboardScreen } from "@/features/dashboard/kelola-akses-screen";
import { AturMenuScreen } from "@/features/profil/atur-menu-screen";
import { AsistenScreen } from "@/features/asisten/asisten-screen";
import { QcScreen } from "@/features/qc-konten/qc-screen";
import { AccountDetailScreen } from "@/features/qc-konten/account-detail-screen";
import { PostDetailScreen } from "@/features/qc-konten/post-detail-screen";
import { TvScreen } from "@/features/tv-rakyat/tv-screen";
import { KelolaPenggunaScreen } from "@/features/pengguna/kelola-pengguna-screen";
import { PengumumanScreen } from "@/features/pengguna/pengumuman-screen";
import { PersetujuanKpiScreen } from "@/features/pengguna/persetujuan-kpi-screen";
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
import { LayarPerbaikan } from "@/features/perbaikan/layar-perbaikan";
import { PilihUcapanUltah } from "@/features/notifikasi/pilih-ucapan-ultah";
import { ModalChangelog } from "@/features/profil/modal-changelog";
import { AcaraScreen } from "@/features/acara/acara-screen";
import { TabelAnggotaScreen } from "@/features/pengguna/tabel-anggota-screen";
import { AbsensiHariIniScreen } from "@/features/pengguna/absensi-hari-ini-screen";
import { RobotMelayang } from "@/features/asisten/robot-asisten";
import { LayarSuara } from "@/features/asisten/layar-suara";
import dynamic from "next/dynamic";
import { ScreenHeader } from "@/components/pri-ui";

// Layar KPI Video anggota (berat: grafik + tabel) — dimuat saat dibuka.
const KpiAnggotaDashboard = dynamic(
  () =>
    import("@/features/dashboard/kpi-anggota-dashboard").then(
      (m) => m.KpiAnggotaDashboard,
    ),
  { ssr: false },
);
// Dashboard TV Rakyat Nasional (1 Sep 2026) — dimuat saat dibuka.
const TvNasionalDashboard = dynamic(
  () =>
    import("@/features/dashboard/tv-nasional-dashboard").then(
      (m) => m.TvNasionalDashboard,
    ),
  { ssr: false },
);
// Sub-dashboard dari Dashboard utama (1 Sep 2026) — dimuat saat dibuka.
const KepatuhanKaderPanelLayar = dynamic(
  () =>
    import("@/features/qc-konten/kepatuhan-kader-panel").then(
      (m) => m.KepatuhanKaderPanel,
    ),
  { ssr: false },
);
const TvAnalitikDashboardLayar = dynamic(
  () =>
    import("@/features/dashboard/tv-analitik-dashboard").then(
      (m) => m.TvAnalitikDashboard,
    ),
  { ssr: false },
);
import { SetelKpiScreen } from "@/features/pengguna/setel-kpi-screen";
import { modulUntukDivisi } from "@/lib/modul-divisi";
import { adalahHR } from "@/lib/hr";
import { KUNCI_CHANGELOG_DILIHAT } from "@/lib/changelog";
import { VERSI_APLIKASI } from "@/lib/versi";
import { bolehFitur } from "@/lib/fitur";
import { toast, useAppStore } from "@/hooks/use-app-store";
import { adalahPimred } from "@/lib/jabatan";
import {
  getIzinFitur,
  getWewenangTv,
  getStatusPerbaikan,
  getNotifikasi,
  getAksesDashboard,
  getPreferensi,
  getStatusAsisten,
  keluar as keluarService,
  masukOtomatis,
  simpanToken,
  type UserLengkap,
} from "@/services";
import type { Role, User } from "@/types";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------
// Navigasi
// ------------------------------------------------------------

type SubLayar =
  | { nama: "qc-akun"; akunWajib: string; periode?: string }
  | { nama: "qc-postingan"; idPostingan: string; akunWajib: string; periode?: string }
  // Panel super admin: menyetujui pendaftar & menetapkan peran
  | { nama: "kelola-pengguna" }
  // Kehadiran & kinerja (dibuka dari tab Profil)
  | { nama: "absensi" }
  | { nama: "laporan-kerja" }
  // Halaman HR Center 1.18: tabel anggota, absensi harian, setel KPI
  | { nama: "tabel-anggota" }
  | { nama: "absensi-hari-ini" }
  | { nama: "setel-kpi" }
  // Meja ACC HR: laporan video manual & permohonan sosmed terblokir (2 Sep 2026)
  | { nama: "persetujuan-kpi" }
  // KPI Video anggota dibuka dari kartu ringkasan dashboard (1 Sep 2026)
  | { nama: "dashboard-kpi" }
  // Dashboard TV Rakyat Nasional (1 Sep 2026)
  | { nama: "tv-nasional" }
  // Sub-dashboard dibuka dari Dashboard utama (1 Sep 2026):
  // kepatuhan komen (baca-saja) & analitik TV Rakyat.
  | { nama: "dashboard-kepatuhan" }
  | { nama: "dashboard-tv" }
  // Kirim pengumuman ke divisi/semua (HR Center, fitur 1.22.x/1)
  | { nama: "pengumuman" }
  // Notifikasi: kini dibuka dari lonceng kanan atas, bukan tab bawah
  | { nama: "notifikasi" }
  // Panel Master — kewenangan tertinggi, hanya peran master
  | { nama: "panel-master" }
  // Matriks izin fitur per peran (super admin)
  | { nama: "pengaturan-fitur" }
  // Matriks akses dashboard per jabatan (fitur 1.19/3.3, master/super)
  | { nama: "kelola-dashboard" }
  // Susunan modul footer pilihan pengguna (fitur 1.20/4)
  | { nama: "atur-menu" }
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

// ------------------------------------------------------------
// Posisi navigasi tersimpan (fitur 1 Sep 2026): refresh peramban
// TIDAK melempar ke beranda — kembali ke tab & sub-layar terakhir.
// sessionStorage dipilih sadar: hidup selama tab peramban itu
// (refresh selamat), tapi buka aplikasi besok = mulai bersih.
// ------------------------------------------------------------
const KUNCI_NAV = "pri_nav_v1";

function bacaNavTersimpan(
  userId: string | number | null | undefined,
): { tab: KunciTab; subLayar: SubLayar | null } | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const mentah = sessionStorage.getItem(KUNCI_NAV);
    if (!mentah) return null;
    const j = JSON.parse(mentah) as {
      userId?: unknown;
      tab?: unknown;
      subLayar?: { nama?: unknown } | null;
    };
    // Milik akun lain (ganti login di tab sama) → abaikan.
    if (String(j.userId) !== String(userId)) return null;
    if (typeof j.tab !== "string") return null;
    const subLayar =
      j.subLayar && typeof j.subLayar === "object" && typeof j.subLayar.nama === "string"
        ? (j.subLayar as SubLayar)
        : null;
    return { tab: j.tab as KunciTab, subLayar };
  } catch {
    return null;
  }
}

/** Tab tersimpan hanya dipakai bila masih sah untuk peran ini. */
function tabAwalDenganRestor(role: Role, userId: string | number | null | undefined): KunciTab {
  const tersimpan = bacaNavTersimpan(userId);
  if (tersimpan && (TAB_ROLE[role] ?? []).includes(tersimpan.tab)) return tersimpan.tab;
  return TAB_AWAL[role];
}

const TAB_ROLE: Record<Role, KunciTab[]> = {
  // Modul KONTEN kembali & WAJIB untuk semua peran (fitur 1.20/5):
  // menampilkan tarikan konten sosmed TV Rakyat dari Ayrshare.
  master: ["beranda", "konten", "qc", "tv", "tvrku", "chat", "profil"],
  // Super admin TIDAK punya tab TV Rakyat: otomatisasi video adalah
  // tanggung jawab tim TV Rakyat (lihat bolehProsesVideo di types).
  super_admin: ["beranda", "konten", "qc", "chat", "profil"],
  admin_hr: ["konten", "qc", "chat", "profil"],
  admin_tv: ["konten", "tv", "chat", "profil"],
  ketua: ["beranda", "konten", "tvrku", "chat", "profil"],
  anggota: ["beranda", "konten", "tvrku", "chat", "profil"],
};

const berlanggananKosong = () => () => {};

export default function Page() {
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const tema = useAppStore((s) => s.tema);
  const skalaFont = useAppStore((s) => s.skalaFont);
  const tvAnggota = useAppStore((s) => s.tvAnggota);

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
    return tersimpan ? tabAwalDenganRestor(tersimpan.role, tersimpan.id) : "beranda";
  });
  const [subLayar, setSubLayar] = useState<SubLayar | null>(() => {
    // Refresh peramban: buka lagi sub-layar terakhir (fitur 1 Sep 2026).
    const tersimpan = useAppStore.getState().user;
    return tersimpan ? (bacaNavTersimpan(tersimpan.id)?.subLayar ?? null) : null;
  });
  // Kunci sub-dashboard yang boleh dibuka jabatan ini (fitur 1.19/3.3).
  // Diisi effect di bawah; dipakai tabBoleh, jadi dideklarasikan di sini.
  const [aksesDashboard, setAksesDashboard] = useState<string[]>([]);
  // Akun berstatus "menunggu" yang ditemukan saat boot (fitur 1.19.1:
  // daftar lewat Google / daftar biasa yang dibuka ulang) — ditahan di
  // HALAMAN TUNGGU AuthScreen, bukan dimasukkan ke aplikasi.
  const [menungguUser, setMenungguUser] = useState<UserLengkap | null>(null);
  // Modul footer yang DISEMBUNYIKAN pengguna (fitur 1.20/4). Bentuk
  // "daftar yang disembunyikan" dipilih supaya modul BARU otomatis
  // tampil tanpa migrasi preferensi.
  const [sembunyiTab, setSembunyiTab] = useState<string[]>([]);
  // Jabatan ini boleh memakai Asisten AI? (fitur 1.20/3)
  const [bolehAsisten, setBolehAsisten] = useState(false);
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
  const [infoPerbaikan, setInfoPerbaikan] = useState<{ sampai: string | null; pesan: string } | null>(null);
  useEffect(() => {
    if (!siap) return;
    let hidup = true;

    // --- Hasil balik Google OAuth (fitur 1.19/3.1) ---
    // Callback mengantarkan token lewat ?gtoken=...; simpan sebagai
    // token perangkat SEBELUM masuk otomatis berjalan, lalu bersihkan
    // URL supaya token tidak tertinggal di riwayat peramban.
    try {
      const q = new URLSearchParams(window.location.search);
      const gtoken = q.get("gtoken");
      const gerror = q.get("gerror");
      if (gtoken || gerror || q.get("gtautkan")) {
        if (gtoken) simpanToken(gtoken);
        if (gerror) {
          useAppStore.getState().pushToast({
            jenis: "error",
            judul: "Login Google gagal",
            isi: gerror,
          });
        }
        if (q.get("gtautkan")) {
          useAppStore.getState().pushToast({
            jenis: "sukses",
            judul: "Akun Google terhubung",
            isi: "Akun Google Anda berhasil ditautkan.",
          });
        }
        window.history.replaceState(null, "", window.location.pathname);
      }
    } catch {
      // URLSearchParams selalu ada di peramban; penjaga bila dirender
      // di lingkungan tanpa window utuh.
    }

    void (async () => {
      try {
        const tersimpan = await masukOtomatis();
        if (!hidup) return;
        if (tersimpan === "perbaikan") {
          // Token masih sah, tapi aplikasi sedang diperbaiki. Jangan
          // buang apa pun — begitu master mematikannya, buka ulang
          // aplikasi langsung masuk seperti biasa. Ambil perkiraan jam
          // selesai untuk hitung mundur di layar terkunci.
          const st = await getStatusPerbaikan();
          if (hidup) setInfoPerbaikan({ sampai: st.sampai, pesan: st.pesan });
        } else if (tersimpan && tersimpan.status === "menunggu") {
          // Pendaftar (Google/biasa) yang belum disetujui pengurus:
          // tahan di halaman tunggu — LayarMenunggu memoles status
          // tiap 5 detik dan berpindah SENDIRI ke Beranda begitu
          // pengurus menekan Setujui (fitur 1.19.1).
          setMenungguUser(tersimpan);
        } else if (tersimpan) {
          setUser(tersimpan);
          // Hormati posisi navigasi tersimpan (refresh ≠ lempar ke awal).
          setTab(tabAwalDenganRestor(tersimpan.role, tersimpan.id));
          const navTersimpan = bacaNavTersimpan(tersimpan.id);
          if (navTersimpan?.subLayar) setSubLayar(navTersimpan.subLayar);
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
  // tabPenuh = SEMUA modul yang dia berhak (dipakai layar Atur Menu);
  // tabBoleh = tabPenuh dikurangi yang disembunyikan pengguna.
  const tabPenuh = useMemo<KunciTab[]>(() => {
    if (!user) return [];
    const dasar = [...TAB_ROLE[user.role]];
    // Modul TV terbuka untuk Pimred (jabatan) ATAU anggota tim TV yang
    // ditunjuk Pimred (tvAnggota dari server).
    if ((adalahPimred(user) || tvAnggota) && !dasar.includes("tv")) {
      dasar.splice(dasar.indexOf("tvrku") >= 0 ? dasar.indexOf("tvrku") : 1, 0, "tv");
    }
    // Modul per-divisi (spek 1.5): tiap divisi punya SATU modul
    // tambahan — daftarnya di lib/modul-divisi.ts, gampang diperluas.
    const modul = modulUntukDivisi(user.divisi);
    if (modul && !dasar.includes(modul)) {
      dasar.splice(dasar.indexOf("chat") >= 0 ? dasar.indexOf("chat") : dasar.length - 1, 0, modul);
    }
    // Orang HR (peran admin_hr ATAU Divisi HR — fitur 1.22.x/1) mendapat
    // modul HR Center (tab qc): tempat Kelola Pengguna & kirim pengumuman.
    if (adalahHR(user) && !dasar.includes("qc")) {
      dasar.splice(dasar.indexOf("chat") >= 0 ? dasar.indexOf("chat") : dasar.length - 1, 0, "qc");
    }
    // Modul Dashboard (fitur 1.19/3.3): tampil hanya bila jabatan ini
    // diberi akses minimal satu sub-dashboard oleh master.
    if (aksesDashboard.length > 0 && !dasar.includes("dashboard")) {
      dasar.splice(dasar.indexOf("chat") >= 0 ? dasar.indexOf("chat") : dasar.length - 1, 0, "dashboard");
    }
    // Asisten AI (fitur 1.20/3): tampil bila jabatannya dinyalakan.
    if (bolehAsisten && !dasar.includes("asisten")) {
      dasar.splice(dasar.indexOf("chat") >= 0 ? dasar.indexOf("chat") : dasar.length - 1, 0, "asisten");
    }
    return dasar;
  }, [user, tvAnggota, aksesDashboard, bolehAsisten]);

  // Kustomisasi footer (fitur 1.20/4): modul yang disembunyikan
  // pengguna dibuang — kecuali KONTEN (wajib, fitur 1.20/5) dan
  // PROFIL (pintu pengaturan; tanpa ini pengguna mengunci dirinya).
  const tabBoleh = useMemo<KunciTab[]>(() => {
    const wajib = new Set<KunciTab>(["konten", "profil"]);
    const tampil = tabPenuh.filter((t) => wajib.has(t) || !sembunyiTab.includes(t));
    // Pengaman: preferensi rusak tidak boleh mengosongkan navigasi.
    return tampil.length >= 2 ? tampil : tabPenuh;
  }, [tabPenuh, sembunyiTab]);

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
      const [izin, wewenang] = await Promise.all([getIzinFitur(), getWewenangTv()]);
      if (hidup) {
        useAppStore.getState().setIzinFitur(izin);
        useAppStore.getState().setTvAnggota(wewenang.anggota);
        useAppStore.getState().setWewenangTv(wewenang);
      }
    }
    void muatIzin();
    const detak = setInterval(() => void muatIzin(), 5 * 60_000);
    return () => {
      hidup = false;
      clearInterval(detak);
    };
  }, [aplikasiAktif]);

  // Akses modul Dashboard per jabatan (fitur 1.19/3.3). Ritme sama
  // dengan izin fitur: dimuat saat masuk + disegarkan tiap 5 menit,
  // supaya akses yang baru dinyalakan/dimatikan master ikut terasa.
  useEffect(() => {
    if (!aplikasiAktif) return;
    let hidup = true;
    async function muatAkses() {
      const [boleh, pref, asisten] = await Promise.all([
        getAksesDashboard(),
        getPreferensi(),
        getStatusAsisten(),
      ]);
      if (!hidup) return;
      setAksesDashboard(boleh);
      setBolehAsisten(asisten.boleh);
      // Susunan footer pilihan pengguna (fitur 1.20/4)
      const footer = pref["footer"] as { sembunyi?: unknown } | undefined;
      const sembunyi = Array.isArray(footer?.sembunyi)
        ? footer.sembunyi.map(String)
        : [];
      setSembunyiTab(sembunyi);
    }
    void muatAkses();
    const detak = setInterval(() => void muatAkses(), 5 * 60_000);
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
    // Bila datang dari halaman tunggu (baru disetujui), tandanya dibuang.
    setMenungguUser(null);
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

  const izinFitur = useAppStore((s) => s.izinFitur);
  const [ultahBuka, setUltahBuka] = useState(false);
  // Robot maskot Ketua Umum (fitur 1 Sep 2026): diklik → tersenyum →
  // langsung masuk mode suara asisten dengan sapaan "Halo Pak Ketum".
  const [suaraRobotBuka, setSuaraRobotBuka] = useState(false);
  // Changelog "Apa yang Baru" (spek 1.4): tampil otomatis SEKALI
  // begitu pengguna pertama membuka aplikasi setelah update.
  const [changelogBuka, setChangelogBuka] = useState(false);

  useEffect(() => {
    if (!aplikasiAktif) return;
    // Jeda mikro supaya setState tidak sinkron di dalam effect
    // (menghindari render beruntun; aturan react-hooks/set-state-in-effect).
    const id = setTimeout(() => {
      try {
        if (localStorage.getItem(KUNCI_CHANGELOG_DILIHAT) !== VERSI_APLIKASI) {
          setChangelogBuka(true);
        }
      } catch {
        // localStorage bisa tidak tersedia (mode privat) — lewati saja.
      }
    }, 600);
    return () => clearTimeout(id);
  }, [aplikasiAktif]);

  function tutupChangelog() {
    setChangelogBuka(false);
    try {
      localStorage.setItem(KUNCI_CHANGELOG_DILIHAT, VERSI_APLIKASI);
    } catch {
      // Gagal menyimpan penanda hanya berarti modalnya muncul lagi nanti.
    }
  }
  // Catatan: tagihan (nag) verifikasi WhatsApp DIHAPUS — OTP kini via
  // email dan nomor WA hanya data opsional; verifikasi WA tetap bisa
  // dilakukan sukarela dari layar Profil.

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

  // ------------------------------------------------------------
  // Riwayat navigasi bertumpuk (fitur 1 Sep 2026): back = MUNDUR ke
  // modul yang dibuka sebelumnya (persis riwayat peramban), bukan
  // langsung melompat ke tab awal. Effect ini merekam SETIAP
  // perpindahan (tab maupun sub-layar) dari mana pun asalnya —
  // footer, kartu, notifikasi — tanpa perlu membungkus semua
  // pemanggil setTab/setSubLayar satu per satu.
  // ------------------------------------------------------------
  const riwayatNavRef = useRef<{ tab: KunciTab; subLayar: SubLayar | null }[]>([]);
  const lewatiCatatRef = useRef(false);
  const posisiKiniRef = useRef<{ tab: KunciTab; subLayar: SubLayar | null }>({
    tab,
    subLayar,
  });
  useEffect(() => {
    const sebelum = posisiKiniRef.current;
    const berubah =
      sebelum.tab !== tab ||
      JSON.stringify(sebelum.subLayar) !== JSON.stringify(subLayar);
    if (!berubah) return;
    if (lewatiCatatRef.current) {
      // Perpindahan ini HASIL menekan back — jangan direkam lagi,
      // kalau direkam back akan bolak-balik antara dua layar.
      lewatiCatatRef.current = false;
    } else {
      riwayatNavRef.current.push({ ...sebelum });
      // Batasi 40 langkah — cukup dalam, tidak menimbun memori.
      if (riwayatNavRef.current.length > 40) riwayatNavRef.current.shift();
    }
    posisiKiniRef.current = { tab, subLayar };
  }, [tab, subLayar]);

  // Simpan posisi terakhir untuk restor saat refresh (fitur 1 Sep 2026).
  useEffect(() => {
    try {
      if (!user) {
        sessionStorage.removeItem(KUNCI_NAV);
        return;
      }
      sessionStorage.setItem(
        KUNCI_NAV,
        JSON.stringify({ userId: user.id, tab, subLayar }),
      );
    } catch {
      // Penyimpanan penuh/diblokir — navigasi tetap jalan tanpa restor.
    }
  }, [user, tab, subLayar]);

  useEffect(() => {
    if (!user) return;
    // Ganti akun/login baru: riwayat milik sesi lama tidak relevan.
    riwayatNavRef.current = [];
    history.pushState({ pri: true }, "");

    function saatBack() {
      // 1. Ada riwayat → mundur SATU langkah ke posisi sebelumnya.
      const tumpukan = riwayatNavRef.current;
      if (tumpukan.length > 0) {
        const sebelum = tumpukan.pop();
        if (sebelum) {
          lewatiCatatRef.current = true;
          setSubLayar(sebelum.subLayar);
          setTab(sebelum.tab);
          history.pushState({ pri: true }, "");
          return;
        }
      }
      // 2. Riwayat kosong tapi sub-layar terbuka (mis. habis refresh
      //    langsung di sub-layar) → tutup sub-layarnya dulu.
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
            onBukaAbsensi={() => setSubLayar({ nama: "absensi-hari-ini" })}
            onBukaKpiVideo={() => setSubLayar({ nama: "dashboard-kpi" })}
            onBukaTvNasional={() => setSubLayar({ nama: "tv-nasional" })}
            onBukaKepatuhan={() => setSubLayar({ nama: "dashboard-kepatuhan" })}
            onBukaTvAnalitik={() => setSubLayar({ nama: "dashboard-tv" })}
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
            bolehHR={adalahHR(user)}
            onBukaHalaman={(nama) =>
              setSubLayar({
                nama: nama as
                  | "tabel-anggota"
                  | "absensi-hari-ini"
                  | "setel-kpi"
                  | "persetujuan-kpi"
                  | "kelola-pengguna"
                  | "pengumuman",
              })
            }
            onBukaAkun={(akunWajib, periode) =>
              setSubLayar({ nama: "qc-akun", akunWajib, periode })
            }
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
    if (tabBoleh.includes("dashboard")) {
      layarTab.push({
        kunci: "dashboard",
        isi: (
          <ModulDashboardScreen
            user={user}
            boleh={aksesDashboard}
            onBukaKelola={() => setSubLayar({ nama: "kelola-dashboard" })}
          />
        ),
      });
    }
    if (tabBoleh.includes("asisten")) {
      layarTab.push({
        kunci: "asisten",
        isi: <AsistenScreen onBukaNotifikasi={() => setSubLayar({ nama: "notifikasi" })} />,
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
    if (tabBoleh.includes("acara")) {
      layarTab.push({
        kunci: "acara",
        isi: (
          <AcaraScreen
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
          onBukaAturMenu={() => setSubLayar({ nama: "atur-menu" })}
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

      {/* Mode perbaikan: layar terkunci penuh (maskot + hitung mundur) */}
      {siap && infoPerbaikan && (
        <LayarPerbaikan sampai={infoPerbaikan.sampai} pesan={infoPerbaikan.pesan} />
      )}

      {/* Layar login */}
      {siap && !user && !memeriksaSesi && !infoPerbaikan && (
        <motion.div
          key="login"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <AuthScreen onMasukBerhasil={loginBerhasil} awalMenunggu={menungguUser} />
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

      {/* Changelog otomatis pasca-update (spek 1.4) */}
      {aplikasiAktif && changelogBuka && <ModalChangelog onTutup={tutupChangelog} />}

      {/* Pemilih ucapan ulang tahun (dari notifikasi ultah yang diklik) */}
      {siap && user && !menyambut && ultahBuka && (
        <PilihUcapanUltah
          onTutup={() => setUltahBuka(false)}
          onBukaChat={() => {
            setUltahBuka(false);
            setSubLayar(null);
            pilihTab("chat");
          }}
        />
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
                ) : subLayar.nama === "kelola-dashboard" ? (
                  <KelolaAksesDashboardScreen onKembali={() => setSubLayar(null)} />
                ) : subLayar.nama === "atur-menu" ? (
                  <AturMenuScreen
                    tabPenuh={tabPenuh}
                    sembunyi={sembunyiTab}
                    onUbah={setSembunyiTab}
                    onKembali={() => setSubLayar(null)}
                  />
                ) : subLayar.nama === "panel-master" ? (
                  <PanelMasterScreen onKembali={() => setSubLayar(null)} />
                ) : subLayar.nama === "tabel-anggota" ? (
                  <TabelAnggotaScreen onKembali={() => setSubLayar(null)} />
                ) : subLayar.nama === "absensi-hari-ini" ? (
                  <AbsensiHariIniScreen onKembali={() => setSubLayar(null)} />
                ) : subLayar.nama === "dashboard-kpi" ? (
                  <div className="kolom-aplikasi px-4 pb-32">
                    <ScreenHeader
                      judul="KPI Video Anggota"
                      onKembali={() => setSubLayar(null)}
                    />
                    <KpiAnggotaDashboard />
                  </div>
                ) : subLayar.nama === "tv-nasional" ? (
                  <div className="kolom-aplikasi px-4 pb-32">
                    <ScreenHeader
                      judul="TV Rakyat Nasional"
                      onKembali={() => setSubLayar(null)}
                    />
                    <TvNasionalDashboard />
                  </div>
                ) : subLayar.nama === "dashboard-kepatuhan" ? (
                  <div className="kolom-aplikasi px-4 pb-32">
                    <ScreenHeader
                      judul="Kepatuhan Komen"
                      onKembali={() => setSubLayar(null)}
                    />
                    {/* Baca-saja: dashboard tempat memantau, aksi WA-nya
                        tetap di HR Center. */}
                    <KepatuhanKaderPanelLayar editable={false} />
                  </div>
                ) : subLayar.nama === "dashboard-tv" ? (
                  <div className="kolom-aplikasi px-4 pb-32">
                    <ScreenHeader
                      judul="Dashboard TV Rakyat"
                      onKembali={() => setSubLayar(null)}
                    />
                    <TvAnalitikDashboardLayar />
                  </div>
                ) : subLayar.nama === "setel-kpi" ? (
                  <SetelKpiScreen user={user} onKembali={() => setSubLayar(null)} />
                ) : subLayar.nama === "persetujuan-kpi" ? (
                  <PersetujuanKpiScreen onKembali={() => setSubLayar(null)} />
                ) : subLayar.nama === "pengumuman" ? (
                  <PengumumanScreen user={user} onKembali={() => setSubLayar(null)} />
                ) : subLayar.nama === "notifikasi" ? (
                  <NotifikasiScreen
                    onTarget={handleTarget}
                    onUltah={() => setUltahBuka(true)}
                    onKembali={() => setSubLayar(null)}
                  />
                ) : subLayar.nama === "absensi" ? (
                  <AbsensiScreen user={user} onKembali={() => setSubLayar(null)} />
                ) : subLayar.nama === "laporan-kerja" ? (
                  <LaporanKerjaScreen user={user} onKembali={() => setSubLayar(null)} />
                ) : subLayar.nama === "qc-akun" ? (
                  <AccountDetailScreen
                    akunWajib={subLayar.akunWajib}
                    periode={subLayar.periode}
                    onKembali={() => setSubLayar(null)}
                    onBukaPostingan={(idPostingan) =>
                      setSubLayar({
                        nama: "qc-postingan",
                        idPostingan,
                        akunWajib: subLayar.akunWajib,
                        periode: subLayar.periode,
                      })
                    }
                  />
                ) : (
                  <PostDetailScreen
                    idPostingan={subLayar.idPostingan}
                    akunWajib={subLayar.akunWajib}
                    periode={subLayar.periode}
                    onKembali={() =>
                      setSubLayar({
                        nama: "qc-akun",
                        akunWajib: subLayar.akunWajib,
                        periode: subLayar.periode,
                      })
                    }
                  />
                )}
                </PagarGalat>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Robot AI Ketua Umum (fitur 1 Sep 2026) — melayang di SEMUA
          layar khusus super admin/master. Disembunyikan saat mode
          suaranya sendiri sedang terbuka. */}
      {user && (user.role === "super_admin" || user.role === "master") && !suaraRobotBuka && (
        <RobotMelayang onBuka={() => setSuaraRobotBuka(true)} />
      )}
      {suaraRobotBuka && (
        <LayarSuara
          sapaan="Halo Pak Ketum, ada yang bisa dibantu?"
          onTutup={() => setSuaraRobotBuka(false)}
        />
      )}

      {/* Lapisan global: toast + push banner */}
      <ToastViewport />
      <PushBannerStack onTarget={handleTarget} />
    </>
  );
}

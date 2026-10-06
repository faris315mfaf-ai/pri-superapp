"use client";

// ============================================================
// PRI SuperApp — Cangkang Aplikasi (satu-satunya route "/")
// Login → Splash → Aplikasi (tab per role + sub-layar QC).
// Semua layar fitur digabung di sini.
// ============================================================

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { modeSimpelAktif } from "@/lib/mode-simpel";
import { MeshBackground } from "@/components/mesh-background";
import { ToastViewport } from "@/components/toast-viewport";
import { PushBannerStack } from "@/components/push-banner";
import { BottomNav, type KunciTab } from "@/components/bottom-nav";
import { PagarGalat } from "@/components/pagar-galat";
import { SideNav } from "@/components/side-nav";
import { Dock } from "@/components/dock";
import { bolehDesainApple, desainBaru, tataLebar } from "@/lib/desain-apple";
import { useLayarLebar } from "@/hooks/use-layar-lebar";
import { PEGAS_HALAMAN } from "@/lib/pegas";
import { useModeNav } from "@/hooks/use-mode-nav";
import { temaApple, useLatarApple } from "@/hooks/use-latar-apple";
import { SplashScreen } from "@/features/auth/splash-screen";
import { bolehPet } from "@/lib/pet-akses";
import { MODUL_AKUN, bolehAudit, modulDibuka } from "@/lib/peran";
import { useDetakGlobal } from "@/hooks/use-detak-global";
import { KonteksTabAktif } from "@/hooks/use-tab-aktif";
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
// ------------------------------------------------------------
// PEMECAHAN HALAMAN (28 Sep 2026, rencana "200 orang tanpa lag" #8).
// Dulu ±45 layar diimpor statis ke cangkang ini, sehingga pembukaan
// pertama mengunduh ±2,8 MB JavaScript (Ludo, Pet, Studio, Panel
// Master, pustaka grafik …) walau anggota tidak pernah membukanya.
// Kini tiap layar diunduh saat PERTAMA KALI ditampilkan; yang tetap
// ada di awal hanya cangkang: splash, navigasi, latar, toast.
// ------------------------------------------------------------
const AuthScreen = dynamic(() => import("@/features/auth/auth-screen").then((m) => m.AuthScreen), { ssr: false, loading: MuatLayar });
const DashboardScreen = dynamic(() => import("@/features/dashboard/dashboard-screen").then((m) => m.DashboardScreen), { ssr: false, loading: MuatLayar });
const ModulDashboardScreen = dynamic(() => import("@/features/dashboard/modul-dashboard-screen").then((m) => m.ModulDashboardScreen), { ssr: false, loading: MuatLayar });
const KelolaAksesDashboardScreen = dynamic(() => import("@/features/dashboard/kelola-akses-screen").then((m) => m.KelolaAksesDashboardScreen), { ssr: false, loading: MuatLayar });
const AturMenuScreen = dynamic(() => import("@/features/profil/atur-menu-screen").then((m) => m.AturMenuScreen), { ssr: false, loading: MuatLayar });
const AsistenScreen = dynamic(() => import("@/features/asisten/asisten-screen").then((m) => m.AsistenScreen), { ssr: false, loading: MuatLayar });
const QcScreen = dynamic(() => import("@/features/qc-konten/qc-screen").then((m) => m.QcScreen), { ssr: false, loading: MuatLayar });
const AccountDetailScreen = dynamic(() => import("@/features/qc-konten/account-detail-screen").then((m) => m.AccountDetailScreen), { ssr: false, loading: MuatLayar });
const PostDetailScreen = dynamic(() => import("@/features/qc-konten/post-detail-screen").then((m) => m.PostDetailScreen), { ssr: false, loading: MuatLayar });
const TvScreen = dynamic(() => import("@/features/tv-rakyat/tv-screen").then((m) => m.TvScreen), { ssr: false, loading: MuatLayar });
const TvNasionalScreen = dynamic(() => import("@/features/tv-rakyat/tv-nasional-screen").then((m) => m.TvNasionalScreen), { ssr: false, loading: MuatLayar });
const PengumumanScreen = dynamic(() => import("@/features/pengguna/pengumuman-screen").then((m) => m.PengumumanScreen), { ssr: false, loading: MuatLayar });
const PersetujuanKpiScreen = dynamic(() => import("@/features/pengguna/persetujuan-kpi-screen").then((m) => m.PersetujuanKpiScreen), { ssr: false, loading: MuatLayar });
const KontenScreen = dynamic(() => import("@/features/konten/konten-screen").then((m) => m.KontenScreen), { ssr: false, loading: MuatLayar });
const TvrKuScreen = dynamic(() => import("@/features/tvr-ku/tvrku-screen").then((m) => m.TvrKuScreen), { ssr: false, loading: MuatLayar });
const ChatScreen = dynamic(() => import("@/features/chat/chat-screen").then((m) => m.ChatScreen), { ssr: false, loading: MuatLayar });
const NotifikasiScreen = dynamic(() => import("@/features/notifikasi/notifikasi-screen").then((m) => m.NotifikasiScreen), { ssr: false, loading: MuatLayar });
const ProfilScreen = dynamic(() => import("@/features/profil/profil-screen").then((m) => m.ProfilScreen), { ssr: false, loading: MuatLayar });
const AbsensiScreen = dynamic(() => import("@/features/absensi/absensi-screen").then((m) => m.AbsensiScreen), { ssr: false, loading: MuatLayar });
const LaporanKerjaScreen = dynamic(() => import("@/features/laporan-kerja/laporan-kerja-screen").then((m) => m.LaporanKerjaScreen), { ssr: false, loading: MuatLayar });
const KelolaLaporanKpiScreen = dynamic(() => import("@/features/laporan-kerja/kelola-laporan-kpi-screen").then((m) => m.KelolaLaporanKpiScreen), { ssr: false, loading: MuatLayar });
const AuditScreen = dynamic(() => import("@/features/audit/audit-screen").then((m) => m.AuditScreen), { ssr: false, loading: MuatLayar });
const PanelMasterScreen = dynamic(() => import("@/features/profil/panel-master").then((m) => m.PanelMasterScreen), { ssr: false, loading: MuatLayar });
const PengaturanFiturScreen = dynamic(() => import("@/features/profil/pengaturan-fitur").then((m) => m.PengaturanFiturScreen), { ssr: false, loading: MuatLayar });
const BerandaScreen = dynamic(() => import("@/features/beranda/beranda-screen").then((m) => m.BerandaScreen), { ssr: false, loading: MuatLayar });
const BerandaSimpelGlass = dynamic(() => import("@/features/beranda/beranda-simpel-glass").then((m) => m.BerandaSimpelGlass), { ssr: false, loading: MuatLayar });
const BerandaFaris = dynamic(() => import("@/features/beranda/beranda-faris").then((m) => m.BerandaFaris), { ssr: false, loading: MuatLayar });
const LeaderboardKomenScreen = dynamic(() => import("@/features/beranda/layar-anggota").then((m) => m.LeaderboardKomenScreen), { ssr: false, loading: MuatLayar });
const PengumumanDaftarScreen = dynamic(() => import("@/features/beranda/layar-anggota").then((m) => m.PengumumanDaftarScreen), { ssr: false, loading: MuatLayar });
const DatabaseScreen = dynamic(() => import("@/features/database/database-screen").then((m) => m.DatabaseScreen), { ssr: false, loading: MuatLayar });
const LayarPerbaikan = dynamic(() => import("@/features/perbaikan/layar-perbaikan").then((m) => m.LayarPerbaikan), { ssr: false, loading: MuatLayar });
const PetScreen = dynamic(() => import("@/features/pet/pet-screen").then((m) => m.PetScreen), { ssr: false, loading: MuatLayar });
const LudoScreen = dynamic(() => import("@/features/ludo/ludo-screen").then((m) => m.LudoScreen), { ssr: false, loading: MuatLayar });
const AcaraScreen = dynamic(() => import("@/features/acara/acara-screen").then((m) => m.AcaraScreen), { ssr: false, loading: MuatLayar });
const TabelAnggotaScreen = dynamic(() => import("@/features/pengguna/tabel-anggota-screen").then((m) => m.TabelAnggotaScreen), { ssr: false, loading: MuatLayar });
const AbsensiHariIniScreen = dynamic(() => import("@/features/pengguna/absensi-hari-ini-screen").then((m) => m.AbsensiHariIniScreen), { ssr: false, loading: MuatLayar });
const SetelKpiScreen = dynamic(() => import("@/features/pengguna/setel-kpi-screen").then((m) => m.SetelKpiScreen), { ssr: false, loading: MuatLayar });
// Elemen mengambang & modal: tidak perlu penanda muat.
const BannerKendali = dynamic(() => import("@/components/banner-kendali").then((m) => m.BannerKendali), { ssr: false, loading: () => null });
const PilihUcapanUltah = dynamic(() => import("@/features/notifikasi/pilih-ucapan-ultah").then((m) => m.PilihUcapanUltah), { ssr: false, loading: () => null });
const ModalChangelog = dynamic(() => import("@/features/profil/modal-changelog").then((m) => m.ModalChangelog), { ssr: false, loading: () => null });
const TurPemandu = dynamic(() => import("@/features/tur/tur-pemandu").then((m) => m.TurPemandu), { ssr: false, loading: () => null });
const TurTvr = dynamic(() => import("@/features/tur/tur-tvr").then((m) => m.TurTvr), { ssr: false, loading: () => null });
const ModalKembangApi = dynamic(() => import("@/features/beranda/modal-kembang-api").then((m) => m.ModalKembangApi), { ssr: false, loading: () => null });
const PetMelayang = dynamic(() => import("@/features/pet/pet-melayang").then((m) => m.PetMelayang), { ssr: false, loading: () => null });
const ModalHadiahHarian = dynamic(() => import("@/features/pet/modal-hadiah-harian").then((m) => m.ModalHadiahHarian), { ssr: false, loading: () => null });
const HewanMelayang = dynamic(() => import("@/features/pet/hewan-melayang").then((m) => m.HewanMelayang), { ssr: false, loading: () => null });
const RobotMelayang = dynamic(() => import("@/features/asisten/robot-asisten").then((m) => m.RobotMelayang), { ssr: false, loading: () => null });
const LayarSuara = dynamic(() => import("@/features/asisten/layar-suara").then((m) => m.LayarSuara), { ssr: false, loading: () => null });

/** Penanda muat ringan selagi kode sebuah layar diunduh (sekali per layar). */
function MuatLayar() {
  return (
    <div className="flex min-h-[40dvh] items-center justify-center" role="status" aria-label="Memuat layar">
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-pri/25 border-t-pri" aria-hidden="true" />
    </div>
  );
}
import { modulUntukDivisi } from "@/lib/modul-divisi";
import { adalahHR, diDivisiHR } from "@/lib/hr";
import { KUNCI_CHANGELOG_DILIHAT } from "@/lib/changelog";
import { VERSI_APLIKASI } from "@/lib/versi";
import { toast, useAppStore } from "@/hooks/use-app-store";
import { adalahTvrNasional, adalahPimred } from "@/lib/jabatan";
import {
  getIzinFitur,
  getWewenangTv,
  getStatusPerbaikan,
  getNotifikasi,
  getAksesDashboard,
  getSakelar,
  getPreferensi,
  getStatusAsisten,
  keluar as keluarService,
  masukOtomatis,
  simpanToken,
  ambilToken,
  type UserLengkap,
} from "@/services";
import type { Role, User } from "@/types";
import { cn } from "@/lib/utils";
import { PERISTIWA_BUKA_CHAT } from "@/lib/peristiwa";
import { useModulAktif } from "@/hooks/use-modul";

// ------------------------------------------------------------
// Navigasi
// ------------------------------------------------------------

type SubLayar =
  | { nama: "qc-akun"; akunWajib: string; periode?: string }
  | {
      nama: "qc-postingan";
      idPostingan: string;
      akunWajib: string;
      periode?: string;
    }
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
  // Kelola laporan KPI video anggota: HR / Pimred / master / super admin (5 Sep 2026)
  | { nama: "kelola-laporan-kpi" }
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
  // Audit aktivitas seluruh pengguna — superadmin & master (6 Okt 2026)
  | { nama: "audit" }
  // Pet Robot (percobaan master, 3 Sep 2026)
  | { nama: "pet"; tab?: "rawat" | "toko" | "lemari" | "pasar" }
  // Ludo Robot multipemain (percobaan, 3 Sep 2026)
  | { nama: "ludo" }
  // Matriks izin fitur per peran (super admin)
  | { nama: "pengaturan-fitur" }
  // Matriks akses dashboard per jabatan (fitur 1.19/3.3, master/super)
  | { nama: "kelola-dashboard" }
  // Susunan modul footer pilihan pengguna (fitur 1.20/4)
  | { nama: "atur-menu" }
  // Database anggota (detail per pengguna, untuk pengurus)
  | { nama: "database" }
  // Beranda anggota tanpa jabatan (10 Sep 2026): daftar pengumuman & leaderboard komen
  | { nama: "pengumuman-daftar" }
  | { nama: "leaderboard-komen" };

const TAB_AWAL: Record<Role, KunciTab> = {
  master: "beranda",
  super_admin: "beranda",
  superadmin: "beranda",
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
// Sub-layar yang sudah tidak ada. Posisi tersimpan yang menunjuknya dibuang:
// cabang terakhir rantai render sub-layar adalah Detail Postingan, jadi nama
// yang tak dikenal akan membuka layar itu tanpa data.
// "auto-edit": Auto Edit master pindah ke TV Rakyat Saya (1 Okt 2026).
const SUBLAYAR_DIHAPUS = new Set(["auto-edit"]);

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
      j.subLayar &&
      typeof j.subLayar === "object" &&
      typeof j.subLayar.nama === "string" &&
      !SUBLAYAR_DIHAPUS.has(j.subLayar.nama)
        ? (j.subLayar as SubLayar)
        : null;
    return { tab: j.tab as KunciTab, subLayar };
  } catch {
    return null;
  }
}

/** Tab tersimpan hanya dipakai bila masih sah untuk peran ini. */
function tabAwalDenganRestor(
  role: Role,
  userId: string | number | null | undefined,
): KunciTab {
  const tersimpan = bacaNavTersimpan(userId);
  if (tersimpan && (TAB_ROLE[role] ?? []).includes(tersimpan.tab))
    return tersimpan.tab;
  return TAB_AWAL[role];
}

/** Urutan baku tab bila susunannya perlu dibakukan ulang (modul per akun). */
const URUTAN_TAB: KunciTab[] = ["beranda", "konten", "qc", "tv", "tvnas", "tvrku", "dashboard", "asisten", "acara", "chat", "notifikasi", "profil"];

const TAB_ROLE: Record<Role, KunciTab[]> = {
  // Modul KONTEN kembali & WAJIB untuk semua peran (fitur 1.20/5):
  // menampilkan tarikan konten sosmed TV Rakyat dari Ayrshare.
  master: ["beranda", "konten", "qc", "tv", "tvrku", "chat", "profil"],
  // Super admin TIDAK punya tab TV Rakyat: otomatisasi video adalah
  // tanggung jawab tim TV Rakyat (lihat bolehProsesVideo di types).
  // HR Center (qc) hanya untuk Divisi HR (10 Sep 2026) — ditambahkan
  // dinamis oleh adalahHR(), bukan bawaan peran.
  super_admin: ["beranda", "konten", "chat", "profil"],
  // superadmin (10 Sep 2026): beranda = Dashboard penuh, Konten penuh,
  // tab Dashboard ditambahkan dinamis (aksesPenuh). Tanpa TV Official,
  // chat, robot, dan perintah suara.
  superadmin: ["beranda", "konten", "profil"],
  admin_hr: ["konten", "qc", "chat", "profil"],
  admin_tv: ["konten", "tv", "chat", "profil"],
  ketua: ["beranda", "konten", "tvrku", "chat", "profil"],
  anggota: ["beranda", "konten", "tvrku", "chat", "profil"],
};

const berlanggananKosong = () => () => {};

export default function Page() {
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const sakelar = useAppStore((s) => s.sakelar);
  const setSakelar = useAppStore((s) => s.setSakelar);
  const komenAktif = useModulAktif("kepatuhan_komen");
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
    return tersimpan
      ? tabAwalDenganRestor(tersimpan.role, tersimpan.id)
      : "beranda";
  });
  // Tab yang sudah pernah dibuka — isinya dipasang sekali lalu dipertahankan.
  // PENTING: jangan pasang SEMUA tab sejak login. Tab Dashboard/QC memuat
  // API pengurus; kalau ikut hidup di latar untuk anggota biasa, konsol
  // penuh 403 padahal layar beranda sendiri baik-baik saja.
  const [tabPernahDibuka, setTabPernahDibuka] = useState<Set<KunciTab>>(
    () => new Set([
      useAppStore.getState().user
        ? tabAwalDenganRestor(
            useAppStore.getState().user!.role,
            useAppStore.getState().user!.id,
          )
        : "beranda",
    ]),
  );
  const [subLayar, setSubLayar] = useState<SubLayar | null>(() => {
    // Refresh peramban: buka lagi sub-layar terakhir (fitur 1 Sep 2026).
    const tersimpan = useAppStore.getState().user;
    return tersimpan
      ? (bacaNavTersimpan(tersimpan.id)?.subLayar ?? null)
      : null;
  });
  // Audit (6 Okt 2026): layar yang sedang dibuka ditaruh di <html data-layar>;
  // detak berikutnya membawanya ke server (lama pemakaian per layar).
  useEffect(() => {
    document.documentElement.dataset.layar = subLayar?.nama ?? tab;
  }, [tab, subLayar]);
  // Desain Apple (6 Okt 2026, uji coba akun Faris): tema lewat
  // <html data-desain="apple"> (globals.css) + pilihan Sidebar ↔ Dock.
  // Tema "Classic" (6 Okt 2026) = tampilan asli aplikasi: desain Apple mati.
  const [temaPilihan] = useLatarApple();
  const desainApple = bolehDesainApple(user) && temaApple(temaPilihan);
  const [modeNav, aturModeNav] = useModeNav();
  const pakaiDock = desainApple && modeNav === "dock";
  useEffect(() => {
    if (desainApple) document.documentElement.dataset.desain = "apple";
    else delete document.documentElement.dataset.desain;
  }, [desainApple]);
  // Desain baru (7 Okt 2026): <html data-baru> mengaktifkan kurva pegas &
  // gaya desain baru (globals.css); tab berpindah dengan geser searah.
  const pakaiDesainBaru = desainBaru(user);
  useEffect(() => {
    if (pakaiDesainBaru) document.documentElement.dataset.baru = "1";
    else delete document.documentElement.dataset.baru;
  }, [pakaiDesainBaru]);
  // <html data-nav="dock">: layar setinggi layar (Chat terbagi) memberi
  // ruang bawah untuk Dock lewat kelas .ruang-dock (globals.css).
  useEffect(() => {
    if (pakaiDock) document.documentElement.dataset.nav = "dock";
    else delete document.documentElement.dataset.nav;
  }, [pakaiDock]);
  // Tata letak lebar (7 Okt 2026, master): di PC notifikasi tampil sebagai
  // panel samping kanan di atas layar yang sedang dibuka, bukan layar penuh.
  const layarLebar = useLayarLebar();
  // Jarak konten dari navigasi kiri: Dock = tanpa rel; sidebar Apple
  // mengambang (12 + 240 + 12 px); sidebar biasa menempel (240 px).
  const kiriKonten = pakaiDock ? "" : desainApple ? "lg:pl-[264px]" : "lg:pl-60";
  const kiriSubLayar = pakaiDock ? "lg:left-0" : desainApple ? "lg:left-[264px]" : "lg:left-60";
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
  // Gulir TVR Saya ke seksi tertentu saat dibuka dari beranda ringkas (10 Sep 2026).
  const [fokusTvrku, setFokusTvrku] = useState<{ seksi: string; tik: number } | null>(null);
  // Id notifikasi yang sudah pernah terlihat di sesi ini. Dipakai untuk
  // membedakan notifikasi yang benar-benar BARU datang (layak dimunculkan
  // sebagai banner) dari yang memang sudah ada sejak awal.
  const idPernahDilihat = useRef<Set<string> | null>(null);

  // Mode Simpel (4 Sep 2026): cadangan skrip inline layout — bila
  // penanda perangkat ada dan token tersimpan, pindah ke /simpel.
  useEffect(() => {
    if (modeSimpelAktif() && ambilToken()) window.location.replace("/simpel");
  }, []);

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
  const [infoPerbaikan, setInfoPerbaikan] = useState<{
    sampai: string | null;
    pesan: string;
  } | null>(null);
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
          // Mode Simpel (4 Sep 2026): perangkat ini memilih versi ringan →
          // pindah sebelum satu pun modul berat dimuat.
          if (modeSimpelAktif()) {
            window.location.replace("/simpel");
            return;
          }
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
      dasar.splice(
        dasar.indexOf("tvrku") >= 0 ? dasar.indexOf("tvrku") : 1,
        0,
        "tv",
      );
    }
    // Jabatan TV Rakyat Nasional (12 Sep 2026): modul gabungan. Jabatan
    // ini BERDAMPINGAN dengan jabatan lain, jadi tidak boleh menggeser
    // atau menghapus modul yang sudah didapat dari jabatan aslinya.
    if (adalahTvrNasional(user) && !dasar.includes("tvnas")) {
      dasar.splice(
        dasar.indexOf("tvrku") >= 0 ? dasar.indexOf("tvrku") : dasar.length - 1,
        0,
        "tvnas",
      );
    }
    // Modul per-divisi (spek 1.5): tiap divisi punya SATU modul
    // tambahan — daftarnya di lib/modul-divisi.ts, gampang diperluas.
    const modul = modulUntukDivisi(user.divisi);
    if (modul && !dasar.includes(modul)) {
      dasar.splice(
        dasar.indexOf("chat") >= 0 ? dasar.indexOf("chat") : dasar.length - 1,
        0,
        modul,
      );
    }
    // Orang HR (peran admin_hr ATAU Divisi HR — fitur 1.22.x/1) mendapat
    // modul HR Center (tab qc): tempat Kelola Pengguna & kirim pengumuman.
    if (adalahHR(user) && !dasar.includes("qc")) {
      dasar.splice(
        dasar.indexOf("chat") >= 0 ? dasar.indexOf("chat") : dasar.length - 1,
        0,
        "qc",
      );
    }
    // Modul Dashboard (fitur 1.19/3.3): tampil hanya bila jabatan ini
    // diberi akses minimal satu sub-dashboard oleh master.
    if (aksesDashboard.length > 0 && !dasar.includes("dashboard")) {
      dasar.splice(
        dasar.indexOf("chat") >= 0 ? dasar.indexOf("chat") : dasar.length - 1,
        0,
        "dashboard",
      );
    }
    // Asisten AI (fitur 1.20/3): tampil bila jabatannya dinyalakan.
    if (bolehAsisten && !dasar.includes("asisten")) {
      dasar.splice(
        dasar.indexOf("chat") >= 0 ? dasar.indexOf("chat") : dasar.length - 1,
        0,
        "asisten",
      );
    }
    // MODUL PER AKUN (10 Sep 2026): master membuka/menutup modul saat membuat
    // akun. Dibuka → tab ditambahkan; ditutup → dibuang (Konten & Profil
    // tidak pernah dibuang). Setelah itu urutan tab dibakukan.
    if (user.modul_izin) {
      for (const m of MODUL_AKUN) {
        // Modul yang bukan tab (mis. Edit Otomatis di TVR Saya) diatur di
        // layarnya sendiri, tidak pernah menambah/membuang tab.
        if ("bukanTab" in m) continue;
        const v = modulDibuka(user, m.kunci);
        if (v === true && !dasar.includes(m.kunci)) dasar.push(m.kunci);
        // (Konten & Profil tidak ada di katalog modul, jadi tak pernah terbuang.)
        if (v === false) {
          const i = dasar.indexOf(m.kunci);
          if (i >= 0) dasar.splice(i, 1);
        }
      }
      dasar.sort((a, b) => URUTAN_TAB.indexOf(a) - URUTAN_TAB.indexOf(b));
    }
    // Divisi HR SELALU punya HR Center (24 Sep 2026) — modul per akun tidak
    // boleh menutupnya bagi orang yang memang bertugas di sana.
    if (diDivisiHR(user) && !dasar.includes("qc")) {
      dasar.push("qc");
      dasar.sort((a, b) => URUTAN_TAB.indexOf(a) - URUTAN_TAB.indexOf(b));
    }
    return dasar;
  }, [user, tvAnggota, aksesDashboard, bolehAsisten]);

  // Kustomisasi footer (fitur 1.20/4): modul yang disembunyikan
  // pengguna dibuang — kecuali KONTEN (wajib, fitur 1.20/5) dan
  // PROFIL (pintu pengaturan; tanpa ini pengguna mengunci dirinya).
  const tabBoleh = useMemo<KunciTab[]>(() => {
    const wajib = new Set<KunciTab>(["konten", "profil"]);
    const tampil = tabPenuh.filter(
      (t) => wajib.has(t) || !sembunyiTab.includes(t),
    );
    // Pengaman: preferensi rusak tidak boleh mengosongkan navigasi.
    return tampil.length >= 2 ? tampil : tabPenuh;
  }, [tabPenuh, sembunyiTab]);

  // Pengaman tanpa effect: tab efektif selalu valid untuk role aktif
  const tabEfektif = useMemo(() => {
    if (!user) return tab;
    return tabBoleh.includes(tab) ? tab : TAB_AWAL[user.role];
  }, [user, tab, tabBoleh]);

  // Desain baru: tab yang baru dibuka masuk bergeser searah urutan menu
  // (PC: juga muncul dari blur) dengan kurva pegas. Tanpa fill — setelah
  // selesai tidak ada transform tersisa yang mengurung elemen fixed.
  const tabSebelumRef = useRef<KunciTab | null>(null);
  useEffect(() => {
    const sebelum = tabSebelumRef.current;
    tabSebelumRef.current = tabEfektif;
    if (!pakaiDesainBaru || !sebelum || sebelum === tabEfektif) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = document.querySelector<HTMLElement>(`[data-tab="${tabEfektif}"]`);
    if (!el) return;
    const arah = Math.sign(tabBoleh.indexOf(tabEfektif) - tabBoleh.indexOf(sebelum)) || 1;
    const pc = window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches;
    el.animate(
      [
        { opacity: 0, transform: `translate3d(${arah * (pc ? 36 : 22)}px,0,0) scale(0.99)`, filter: pc ? "blur(8px)" : "none" },
        { opacity: 1, transform: "none", filter: "none" },
      ],
      { duration: PEGAS_HALAMAN.durasi, easing: PEGAS_HALAMAN.easing },
    );
  }, [tabEfektif, pakaiDesainBaru, tabBoleh]);

  // ------------------------------------------------------------
  // Muat notifikasi saat aplikasi aktif
  // ------------------------------------------------------------
  const aplikasiAktif = siap && !!user && !menyambut;

  // PENYEGARAN LATAR BELAKANG 10 DETIK (10 Sep 2026): satu detak ringan
  // menanyakan "ada yang baru?"; bila ada, seluruh layar yang terbuka
  // menarik ulang datanya lewat jalur segarkanData() yang sudah ada.
  useDetakGlobal(aplikasiAktif);

  // Izin fitur per peran (diatur super admin). Dimuat sekali saat
  // masuk dan disegarkan tiap 5 menit, supaya fitur yang baru
  // dimatikan/dinyalakan ikut berlaku tanpa perlu keluar-masuk.
  useEffect(() => {
    if (!aplikasiAktif) return;
    let hidup = true;
    async function muatIzin() {
      const [izin, wewenang] = await Promise.all([
        getIzinFitur(),
        getWewenangTv(),
      ]);
      if (hidup) {
        useAppStore.getState().setIzinFitur(izin);
        useAppStore.getState().setTvAnggota(wewenang.anggota);
        useAppStore.getState().setWewenangTv(wewenang);
      }
    }
    void muatIzin();
    // Hanya saat aplikasi terlihat (28 Sep 2026) — dulu tetap jalan di latar.
    const detak = setInterval(() => {
      if (document.visibilityState === "visible") void muatIzin();
    }, 5 * 60_000);
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
      const [boleh, pref, asisten, sakelar] = await Promise.all([
        getAksesDashboard(),
        getPreferensi(),
        getStatusAsisten(),
        // Sakelar fitur berat (4 Sep 2026) — gagal = anggap semua nyala.
        getSakelar().catch(() => null),
      ]);
      if (!hidup) return;
      setAksesDashboard(boleh);
      if (sakelar) setSakelar({ fitur: sakelar.fitur, hemat: sakelar.hemat, modul: sakelar.modul });
      // Asisten AI ikut sakelar fitur berat.
      setBolehAsisten(asisten.boleh && (sakelar ? sakelar.fitur.asisten !== false : true));
      // Susunan footer pilihan pengguna (fitur 1.20/4)
      const footer = pref["footer"] as { sembunyi?: unknown } | undefined;
      const sembunyi = Array.isArray(footer?.sembunyi)
        ? footer.sembunyi.map(String)
        : [];
      setSembunyiTab(sembunyi);
    }
    void muatAkses();
    const detak = setInterval(() => {
      if (document.visibilityState === "visible") void muatAkses();
    }, 5 * 60_000);
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
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      )
        return;
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
    // 10 Sep 2026: 30 → 60 detik. Notifikasi baru kini terasa jauh lebih
    // cepat lewat DETAK 10 detik (useDetakGlobal → "pri:segarkan" →
    // muat()), jadi jaring pengaman berkala ini boleh separuh lebih
    // jarang — beban server turun, notifikasi justru lebih segar.
    // 28 Sep 2026: 60 → 300 detik. Notifikasi baru kini membangunkan HP
    // penerimanya lewat sinyal pribadi di detak, dan notifikasi umum lewat
    // tanda global — penarikan berkala tinggal jaring pengaman.
    const berkala = setInterval(() => void muat(), 300_000);
    // Begitu admin kembali ke tab ini, segarkan langsung supaya tidak
    // perlu menunggu giliran berikutnya.
    const saatTerlihat = () => {
      if (document.visibilityState === "visible") void muat();
    };
    document.addEventListener("visibilitychange", saatTerlihat);
    // Tombol refresh sistem (kanan atas) → notifikasi ikut disegarkan.
    const saatDiminta = () => void muat();
    window.addEventListener("pri:segarkan", saatDiminta);

    return () => {
      hidup = false;
      clearInterval(berkala);
      document.removeEventListener("visibilitychange", saatTerlihat);
      window.removeEventListener("pri:segarkan", saatDiminta);
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
  const belumBaca = useAppStore((s) =>
    s.notifikasi.reduce((n, item) => (item.dibaca ? n : n + 1), 0),
  );

  // Catat tab aktif sebagai "pernah dibuka" supaya state-nya tetap hidup
  // setelah pindah, tanpa memasang tab yang belum disentuh. Disesuaikan
  // saat render (pola resmi React), bukan lewat effect: tab baru langsung
  // terpasang pada render yang sama, tanpa satu render kosong.
  if (!tabPernahDibuka.has(tabEfektif)) {
    setTabPernahDibuka((sebelum) => {
      if (sebelum.has(tabEfektif)) return sebelum;
      const lanjut = new Set(sebelum);
      lanjut.add(tabEfektif);
      return lanjut;
    });
  }

  // ------------------------------------------------------------
  // Aksi navigasi
  // ------------------------------------------------------------

  function loginBerhasil(userBaru: User) {
    // Mode Simpel (4 Sep 2026): perangkat ini memilih versi ringan.
    if (modeSimpelAktif()) {
      setUser(userBaru);
      window.location.replace("/simpel");
      return;
    }
    // Bila datang dari halaman tunggu (baru disetujui), tandanya dibuang.
    setMenungguUser(null);
    setUser(userBaru);
    const awal = TAB_AWAL[userBaru.role];
    setTab(awal);
    setTabPernahDibuka(new Set([awal]));
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
    setTabPernahDibuka(new Set(["beranda"]));
    // Sesi baru: lupakan daftar id yang pernah dilihat, supaya pemuatan
    // pertama milik pengguna berikutnya juga tidak memunculkan banner.
    idPernahDilihat.current = null;
    setMenyambut(false);
  }

  function pilihTab(t: KunciTab) {
    setSubLayar(null);
    setTab(t);
  }

  // Tombol chat di daftar "sedang online" (12 Sep 2026). Panelnya ada
  // jauh di dalam beranda, sementara yang bisa berpindah tab hanya
  // halaman ini — jadi permintaannya dikirim lewat peristiwa.
  useEffect(() => {
    const keChat = () => pilihTab("chat");
    window.addEventListener(PERISTIWA_BUKA_CHAT, keChat);
    return () => window.removeEventListener(PERISTIWA_BUKA_CHAT, keChat);
  }, []);

  const izinFitur = useAppStore((s) => s.izinFitur);
  const [ultahBuka, setUltahBuka] = useState(false);
  // Robot maskot Ketua Umum (fitur 1 Sep 2026): diklik → tersenyum →
  // langsung masuk mode suara asisten dengan sapaan "Halo Pak Ketum".
  const [suaraRobotBuka, setSuaraRobotBuka] = useState(false);
  // Changelog "Apa yang Baru" (spek 1.4): tampil otomatis SEKALI
  // begitu pengguna pertama membuka aplikasi setelah update.
  const [changelogBuka, setChangelogBuka] = useState(false);
  // Pet Robot (3 Sep 2026): naik tiap kali robot dirawat → robot melayang di beranda ikut segar.
  const [versiPet, setVersiPet] = useState(0);

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
  const riwayatNavRef = useRef<{ tab: KunciTab; subLayar: SubLayar | null }[]>(
    [],
  );
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
      const tabAwal =
        TAB_AWAL[useAppStore.getState().user?.role ?? "anggota"] ?? "beranda";
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

  function handleTarget(
    target: "qc" | "tv" | "dashboard" | "notifikasi" | "tvrku" | null,
  ) {
    if (!user) return;
    if (
      target === "qc" &&
      (user.role === "super_admin" || user.role === "admin_hr")
    ) {
      pilihTab("qc");
    } else if (
      target === "tv" &&
      (user.role === "super_admin" || user.role === "admin_tv" || adalahPimred(user))
    ) {
      pilihTab("tv");
    } else if (target === "tvrku") {
      // Request video / laporan KPI (5 Sep 2026) -> TV Rakyat Saya
      pilihTab("tvrku");
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
  // Kelola Laporan KPI anggota: pengurus pusat (termasuk superadmin), HR, Pimred.
  const bolehKelolaKpi = Boolean(
    user && (user.role === "master" || user.role === "super_admin" || user.role === "superadmin" || adalahHR(user) || adalahPimred(user)),
  );
  // Database Anggota = gabungan Kelola Pengguna (23 Sep 2026). Bagian kelola
  // (persetujuan, peran, jabatan, struktur, hapus) mengikuti hak server:
  // super admin, master, dan orang HR. superadmin tersembunyi tidak ikut.
  const bolehKelolaAnggota = Boolean(
    user && (user.role === "master" || user.role === "super_admin" || adalahHR(user)),
  );
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
    if (
      tabBoleh.includes("beranda") &&
      (user.role === "ketua" || user.role === "anggota")
    ) {
      // 10 Sep 2026: TANPA jabatan → beranda ringkas ala Mode Simpel berkulit
      // kaca merah; pemegang jabatan tetap memakai beranda lengkap.
      const tanpaJabatan = !(user.jabatan ?? "").trim();
      layarTab.push({
        kunci: "beranda",
        // Desain baru (7 Okt 2026): beranda dari mockup lokal untuk akun uji coba.
        isi: desainBaru(user) ? (
          <BerandaFaris
            user={user}
            onBukaNotifikasi={() => setSubLayar({ nama: "notifikasi" })}
            onBukaAbsensi={() => setSubLayar({ nama: "absensi" })}
            onBukaLaporanKerja={() => setSubLayar({ nama: "laporan-kerja" })}
            onBukaTvrKu={tabBoleh.includes("tvrku") ? (seksi) => {
              if (seksi) setFokusTvrku({ seksi, tik: Date.now() });
              pilihTab("tvrku");
            } : undefined}
            onBukaKonten={tabBoleh.includes("konten") ? () => pilihTab("konten") : undefined}
            onBukaProfil={() => pilihTab("profil")}
            onBukaPengumuman={() => setSubLayar({ nama: "pengumuman-daftar" })}
          />
        ) : tanpaJabatan ? (
          <BerandaSimpelGlass
            user={user}
            onBukaNotifikasi={() => setSubLayar({ nama: "notifikasi" })}
            onBukaAbsensi={() => setSubLayar({ nama: "absensi" })}
            onBukaTvrKu={(seksi) => {
              if (seksi) setFokusTvrku({ seksi, tik: Date.now() });
              pilihTab("tvrku");
            }}
            onBukaKonten={() => pilihTab("konten")}
            onBukaProfil={() => pilihTab("profil")}
            onBukaPengumuman={() => setSubLayar({ nama: "pengumuman-daftar" })}
            onBukaLeaderboard={() => setSubLayar({ nama: "leaderboard-komen" })}
          />
        ) : (
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
            user={user}
            onBukaKelolaPengguna={
              // superadmin (10 Sep 2026): tanpa Kelola Pengguna (bukan bagian fiturnya).
              user.role !== "superadmin" ? () => setSubLayar({ nama: "kelola-pengguna" }) : undefined
            }
            // HR Center / TV Official hanya bila modulnya memang ada di tab pemakai.
            onBukaModulQc={tabBoleh.includes("qc") ? () => pilihTab("qc") : undefined}
            onBukaModulTv={tabBoleh.includes("tv") ? () => pilihTab("tv") : undefined}
            onBukaAbsensi={() => setSubLayar({ nama: "absensi-hari-ini" })}
            onBukaKpiVideo={() => setSubLayar({ nama: "dashboard-kpi" })}
            onBukaTvNasional={() => setSubLayar({ nama: "tv-nasional" })}
            onBukaKepatuhan={() => setSubLayar({ nama: "dashboard-kepatuhan" })}
            onBukaTvAnalitik={() => setSubLayar({ nama: "dashboard-tv" })}
            onBukaNotifikasi={() => setSubLayar({ nama: "notifikasi" })}
            jumlahBelumBaca={belumBaca}
            // Desain baru (7 Okt 2026): Kehadiran + Dompet TMP + Ruang karya di atas dashboard.
            desainBaru={desainBaru(user)}
            onBukaAbsensiSaya={() => setSubLayar({ nama: "absensi" })}
            onBukaTvrKu={tabBoleh.includes("tvrku") ? (seksi) => {
              setFokusTvrku({ seksi, tik: Date.now() });
              pilihTab("tvrku");
            } : undefined}
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
            bolehAturMesin={user?.role === "master"}
            onBukaHalaman={(nama) =>
              setSubLayar({
                nama: nama as
                  | "tabel-anggota"
                  | "database"
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
    if (tabBoleh.includes("tvnas")) {
      layarTab.push({
        kunci: "tvnas",
        isi: (
          <TvNasionalScreen
            onBukaNotifikasi={() => setSubLayar({ nama: "notifikasi" })}
          />
        ),
      });
    }
    if (tabBoleh.includes("dashboard")) {
      // 10 Sep 2026: SELURUH pemegang jabatan (dan akun yang modul Dashboard-nya
      // dibuka master) mendapat Dashboard PENUH — layar yang sama dengan
      // beranda pengurus pusat, bukan daftar sub-dashboard yang ringkas.
      const dashboardPenuh =
        (user.role === "ketua" || user.role === "anggota") &&
        ((user.jabatan ?? "").trim() !== "" || modulDibuka(user, "dashboard") === true);
      layarTab.push({
        kunci: "dashboard",
        isi: dashboardPenuh ? (
          <DashboardScreen
            user={user}
            onBukaKelolaPengguna={adalahHR(user) ? () => setSubLayar({ nama: "kelola-pengguna" }) : undefined}
            onBukaModulQc={tabBoleh.includes("qc") ? () => pilihTab("qc") : undefined}
            onBukaModulTv={tabBoleh.includes("tv") ? () => pilihTab("tv") : undefined}
            onBukaAbsensi={() => setSubLayar({ nama: "absensi-hari-ini" })}
            onBukaKpiVideo={() => setSubLayar({ nama: "dashboard-kpi" })}
            onBukaTvNasional={() => setSubLayar({ nama: "tv-nasional" })}
            onBukaKepatuhan={() => setSubLayar({ nama: "dashboard-kepatuhan" })}
            onBukaTvAnalitik={() => setSubLayar({ nama: "dashboard-tv" })}
            onBukaNotifikasi={() => setSubLayar({ nama: "notifikasi" })}
            jumlahBelumBaca={belumBaca}
          />
        ) : (
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
        isi: (
          <AsistenScreen
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
            gulirKe={fokusTvrku}
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
          onBukaKelolaLaporanKpi={
            bolehKelolaKpi ? () => setSubLayar({ nama: "kelola-laporan-kpi" }) : undefined
          }
          onBukaNotifikasi={() => setSubLayar({ nama: "notifikasi" })}
          onBukaPanelMaster={() => setSubLayar({ nama: "panel-master" })}
          onBukaAudit={bolehAudit(user) ? () => setSubLayar({ nama: "audit" }) : undefined}
          onBukaPet={bolehPet(user) ? () => setSubLayar({ nama: "pet" }) : undefined}
          onBukaLudo={sakelar.fitur.ludo === false ? undefined : () => setSubLayar({ nama: "ludo" })}
          onBukaPengaturanFitur={() =>
            setSubLayar({ nama: "pengaturan-fitur" })
          }
          onBukaAturMenu={() => setSubLayar({ nama: "atur-menu" })}
        />
      ),
    });
  }

  const panelNotif = subLayar?.nama === "notifikasi" && layarLebar && tataLebar(user);
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
        <LayarPerbaikan
          sampai={infoPerbaikan.sampai}
          pesan={infoPerbaikan.pesan}
        />
      )}

      {/* Layar login */}
      {siap && !user && !memeriksaSesi && !infoPerbaikan && (
        <motion.div
          key="login"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <AuthScreen
            onMasukBerhasil={loginBerhasil}
            awalMenunggu={menungguUser}
          />
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
      {aplikasiAktif && changelogBuka && (
        <ModalChangelog onTutup={tutupChangelog} />
      )}

      {/* Tutorial interaktif daftar akun → Kepatuhan Komen (3 Sep 2026);
          menunggu changelog ditutup dulu supaya tidak bertumpuk. */}
      {/* Perayaan reset periode + juara komentar (3 Sep 2026) */}
      {/* Juara komentar ikut sakelar modul kepatuhan_komen (24 Sep 2026). */}
      {aplikasiAktif && !changelogBuka && komenAktif && sakelar.fitur.juara_efek !== false && <ModalKembangApi />}
      {/* Hadiah login harian (v5, 5 Sep 2026): sekali per hari, diperiksa sekali per sesi. */}
      {aplikasiAktif && user && <ModalHadiahHarian tunda={changelogBuka} />}
      {/* Tutorial ini menuntun ke Kepatuhan Komen — ikut sakelar modulnya. */}
      {aplikasiAktif && !changelogBuka && komenAktif && <TurPemandu />}
      {/* Tutorial TVR Saya (5 Okt 2026): sambung ulang akun → Edit Otomatis → Stok Video. */}
      {aplikasiAktif && !changelogBuka && tabBoleh.includes("tvrku") && <TurTvr />}

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
          {/* Navigasi layar lebar (PC): rel kiri, atau Dock macOS (desain Apple) */}
          <AnimatePresence>
            {pakaiDock && (
              <Dock
                key="dock"
                role={user.role}
                tabAktif={tabEfektif}
                onTab={pilihTab}
                belumBaca={belumBaca}
                tabs={tabBoleh}
                onJadikanSidebar={() => aturModeNav("sidebar")}
              />
            )}
          </AnimatePresence>
          {!pakaiDock && (
            <SideNav
              role={user.role}
              tabAktif={tabEfektif}
              onTab={pilihTab}
              belumBaca={belumBaca}
              tabs={tabBoleh}
              apple={desainApple}
              onJadikanDock={() => aturModeNav("dock")}
            />
          )}

          {/* Tumpukan layar tab — yang sudah dibuka tetap terpasang
              (state terjaga), yang belum dibuka belum di-mount supaya
              API pengurus di tab Dashboard/QC tidak ikut terpanggil
              saat anggota biasa baru login. */}
          <div className={cn("relative transition-[padding] duration-500 ease-[var(--ease-laci)]", kiriKonten)}>
            {layarTab.map(({ kunci, isi }) => (
              <div
                key={kunci}
                data-tab={kunci}
                aria-hidden={kunci !== tabEfektif}
                className={cn(
                  "transition-[opacity,visibility] duration-300",
                  kunci === tabEfektif
                    ? "relative visible opacity-100"
                    : "invisible pointer-events-none absolute inset-0 overflow-hidden opacity-0",
                )}
              >
                {tabPernahDibuka.has(kunci) ? (
                  // Tab tersembunyi (atau tertutup sub-layar) tidak menarik
                  // data sampai terlihat lagi — lihat hooks/use-tab-aktif.
                  <KonteksTabAktif.Provider value={kunci === tabEfektif && !subLayar}>
                    <PagarGalat nama={kunci}>{isi}</PagarGalat>
                  </KonteksTabAktif.Provider>
                ) : null}
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
              gayaDock={desainBaru(user)}
              tabs={tabBoleh}
              apple={desainApple}
            />
          )}

          {/* Sub-layar QC: slide dari kanan, menutupi layar tab */}
          <AnimatePresence>
            {panelNotif && (
              <motion.div
                key="tirai-notif"
                aria-hidden="true"
                onClick={() => setSubLayar(null)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="fixed inset-0 z-40 bg-black/15"
              />
            )}
            {subLayar && (
              <motion.div
                key={kunciSub}
                initial={{ x: panelNotif ? "110%" : "100%" }}
                animate={{ x: 0 }}
                exit={{ x: panelNotif ? "110%" : "100%" }}
                transition={{ type: "spring", stiffness: 340, damping: 34 }}
                className={cn(
                  "fixed z-40 overflow-y-auto overscroll-contain",
                  panelNotif
                    ? "glass-strong top-3 right-3 bottom-3 w-[420px] rounded-3xl shadow-2xl"
                    : cn("inset-0", kiriSubLayar),
                )}
              >
                {!panelNotif && <MeshBackground />}
                <PagarGalat nama={subLayar.nama}>
                  {subLayar.nama === "kelola-pengguna" || subLayar.nama === "tabel-anggota" ? (
                    // Kelola Pengguna DIGABUNG ke Database Anggota (23 Sep 2026):
                    // rute lama tetap hidup (kartu beranda) dan membuka layar yang
                    // sama, langsung ke pendaftar yang menunggu bila ada.
                    <TabelAnggotaScreen
                      onKembali={() => setSubLayar(null)}
                      bolehKelola={bolehKelolaAnggota}
                      utamakanPendaftar={subLayar.nama === "kelola-pengguna"}
                      bolehBeriSuperadmin={user?.role === "master" && !user.superadmin}
                    />
                  ) : subLayar.nama === "database" ? (
                    <DatabaseScreen onKembali={() => setSubLayar(null)} />
                  ) : subLayar.nama === "pengaturan-fitur" ? (
                    <PengaturanFiturScreen
                      onKembali={() => setSubLayar(null)}
                    />
                  ) : subLayar.nama === "kelola-dashboard" ? (
                    <KelolaAksesDashboardScreen
                      onKembali={() => setSubLayar(null)}
                    />
                  ) : subLayar.nama === "atur-menu" ? (
                    <AturMenuScreen
                      tabPenuh={tabPenuh}
                      sembunyi={sembunyiTab}
                      onUbah={setSembunyiTab}
                      onKembali={() => setSubLayar(null)}
                    />
                  ) : subLayar.nama === "panel-master" ? (
                    // Superadmin (peran efektif master) tidak membuka Panel Master.
                    user?.role === "master" && !user.superadmin ? (
                      <PanelMasterScreen onKembali={() => setSubLayar(null)} />
                    ) : null
                  ) : subLayar.nama === "audit" ? (
                    bolehAudit(user) ? <AuditScreen onKembali={() => setSubLayar(null)} /> : null
                  ) : subLayar.nama === "ludo" ? (
                    <LudoScreen onKembali={() => setSubLayar(null)} />
                  ) : subLayar.nama === "pet" ? (
                    <PetScreen
                      onKembali={() => setSubLayar(null)}
                      onBerubah={() => setVersiPet((v) => v + 1)}
                      tabAwal={subLayar.tab}
                    />
                  ) : subLayar.nama === "absensi-hari-ini" ? (
                    <AbsensiHariIniScreen onKembali={() => setSubLayar(null)} />
                  ) : subLayar.nama === "dashboard-kpi" ? (
                    <div className="kolom-aplikasi px-4 pb-32">
                      <ScreenHeader
                        judul="KPI Video Anggota"
                        onKembali={() => setSubLayar(null)}
                        kanan={
                          // Kelola Laporan KPI Anggota langsung dari fitur KPI (10 Sep 2026).
                          bolehKelolaKpi ? (
                            <button
                              type="button"
                              onClick={() => setSubLayar({ nama: "kelola-laporan-kpi" })}
                              className="btn-tekan flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-bold text-white"
                              style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)", boxShadow: "0 8px 18px rgba(220,38,38,0.35)" }}
                            >
                              Kelola Laporan
                            </button>
                          ) : undefined
                        }
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
                    <SetelKpiScreen
                      user={user}
                      onKembali={() => setSubLayar(null)}
                    />
                  ) : subLayar.nama === "persetujuan-kpi" ? (
                    <PersetujuanKpiScreen onKembali={() => setSubLayar(null)} />
                  ) : subLayar.nama === "pengumuman-daftar" ? (
                    <PengumumanDaftarScreen onKembali={() => setSubLayar(null)} />
                  ) : subLayar.nama === "leaderboard-komen" ? (
                    <LeaderboardKomenScreen onKembali={() => setSubLayar(null)} namaSaya={user?.nama ?? ""} />
                  ) : subLayar.nama === "kelola-laporan-kpi" ? (
                    <KelolaLaporanKpiScreen onKembali={() => setSubLayar(null)} />
                  ) : subLayar.nama === "pengumuman" ? (
                    <PengumumanScreen
                      user={user}
                      onKembali={() => setSubLayar(null)}
                    />
                  ) : subLayar.nama === "notifikasi" ? (
                    <NotifikasiScreen
                      onTarget={handleTarget}
                      onUltah={() => setUltahBuka(true)}
                      onKembali={() => setSubLayar(null)}
                    />
                  ) : subLayar.nama === "absensi" ? (
                    <AbsensiScreen
                      user={user}
                      onKembali={() => setSubLayar(null)}
                    />
                  ) : subLayar.nama === "laporan-kerja" ? (
                    <LaporanKerjaScreen
                      user={user}
                      onKembali={() => setSubLayar(null)}
                    />
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
      {/* Pet Robot melayang (percobaan, khusus master; 3 Sep 2026) — hanya di
          tab Beranda (dashboard master), tanpa sub-layar terbuka. */}
      {/* v5 (5 Sep 2026): pet dimatikan untuk pemegang jabatan (bolehPet).
          Desain baru (7 Okt 2026): pet & hewan melayang disembunyikan. */}
      {user && bolehPet(user) && !pakaiDesainBaru && tabEfektif === "beranda" && !subLayar && sakelar.fitur.pet_beranda !== false && (
        <PetMelayang
          onBuka={(tab) => setSubLayar({ nama: "pet", tab })}
          versi={versiPet}
        />
      )}
      {user && bolehPet(user) && !pakaiDesainBaru && tabEfektif === "beranda" && !subLayar && sakelar.fitur.pet_beranda !== false && (
        <HewanMelayang
          onBuka={() => setSubLayar({ nama: "pet" })}
          versi={versiPet}
        />
      )}
      {user &&
        (user.role === "super_admin" || user.role === "master") &&
        !suaraRobotBuka && (
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
      {/* Pita "masuk sebagai …" saat admin PALUGODAM mengendalikan akun (6 Sep 2026) */}
      <BannerKendali namaAktif={user?.nama} />
    </>
  );
}

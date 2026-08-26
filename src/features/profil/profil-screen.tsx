"use client";

// ============================================================
// ProfilScreen — tab utama profil pengguna & pengaturan.
// Kartu profil dengan badge peran, daftar pengaturan kaca,
// modal tentang aplikasi, dan konfirmasi keluar.
// ============================================================

import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  CalendarCheck,
  Camera,
  Crown,
  ClipboardList,
  Globe,
  KeyRound,
  Info,
  LogOut,
  MessageCircle,
  Moon,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Tv,
  User as UserIcon,
  Zap,
  Sparkles,
} from "lucide-react";
import { LogoPri } from "@/components/logo-pri";
import {
  AvatarInisial,
  FadeInUp,
  SectionTitle,
  StatusBadge,
  ThemeToggle,
} from "@/components/pri-ui";
import { toast, useAppStore } from "@/hooks/use-app-store";
import { FotoBulat } from "@/components/foto-bulat";
import { ConfettiUltah, TopiUltah, ulangTahunHariIni } from "@/components/ultah";
import { KartuLengkapiData } from "./lengkapi-data";
import { deskripsiStruktur } from "@/lib/struktur";
import {
  aktifkanPush,
  langgananIzinNotifikasi,
  matikanPush,
  statusPush,
  type StatusPush,
} from "@/lib/push";
import type { KomponenIkon, Role, User } from "@/types";
import { TombolLonceng } from "@/components/tombol-lonceng";
import { cn } from "@/lib/utils";
import { SwitchKaca } from "./switch-kaca";
import {
  ModalAkunSosmed,
  ModalGantiFoto,
  ModalGantiSandi,
  ModalVerifikasiWa,
  TombolAkunSosmed,
} from "./pengaturan-akun";
import { VERSI_APLIKASI, VERSI_TAMPIL } from "@/lib/versi";
import { ModalChangelog } from "./modal-changelog";
import { AntreanAccTim, KartuTim, MenuUpdateAplikasi } from "./keanggotaan-tim";
import { BarisUkuranTeks, SeksiMasukan } from "./masukan-dan-font";

// ------------------------------------------------------------
// Tipe & konstanta
// ------------------------------------------------------------

type ProfilScreenProps = {
  user: User;
  onLogout: () => void;
  onBukaAbsensi?: () => void;
  onBukaLaporanKerja?: () => void;
  onBukaNotifikasi?: () => void;
  onBukaPanelMaster?: () => void;
  onBukaPengaturanFitur?: () => void;
};

const KONFIG_ROLE: Record<
  Role,
  {
    label: string;
    ikon: KomponenIkon;
    latar: string;
    tepi: string;
    kelasTeks: string;
    warnaIkon: string;
  }
> = {
  // Peran master memakai label netral "Super Admin" secara sengaja:
  // keberadaannya tidak boleh terlihat, termasuk di layar profil yang
  // bisa saja dilihat orang lain dari balik bahu.
  master: {
    label: "Super Admin",
    ikon: Zap,
    latar: "linear-gradient(135deg, rgba(220,38,38,0.16), rgba(245,158,11,0.22))",
    tepi: "rgba(220, 38, 38, 0.32)",
    kelasTeks: "text-pri",
    warnaIkon: "#DC2626",
  },
  ketua: {
    label: "Ketua",
    ikon: ShieldCheck,
    latar: "linear-gradient(135deg, rgba(245,158,11,0.20), rgba(217,119,6,0.14))",
    tepi: "rgba(245, 158, 11, 0.38)",
    kelasTeks: "text-emas",
    warnaIkon: "#F59E0B",
  },
  anggota: {
    label: "Anggota",
    ikon: UserIcon,
    latar: "linear-gradient(135deg, rgba(59,130,246,0.18), rgba(37,99,235,0.14))",
    tepi: "rgba(59, 130, 246, 0.34)",
    kelasTeks: "text-blue-500",
    warnaIkon: "#3B82F6",
  },
  super_admin: {
    label: "Super Admin",
    ikon: Zap,
    latar: "linear-gradient(135deg, rgba(220,38,38,0.16), rgba(245,158,11,0.22))",
    tepi: "rgba(220, 38, 38, 0.32)",
    kelasTeks: "text-pri",
    warnaIkon: "#DC2626",
  },
  admin_hr: {
    label: "Admin HR",
    ikon: ShieldCheck,
    latar: "linear-gradient(135deg, rgba(245,158,11,0.20), rgba(217,119,6,0.14))",
    tepi: "rgba(245, 158, 11, 0.38)",
    kelasTeks: "text-emas",
    warnaIkon: "#F59E0B",
  },
  admin_tv: {
    label: "Admin TV",
    ikon: Tv,
    latar: "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(5,150,105,0.14))",
    tepi: "rgba(16, 185, 129, 0.34)",
    kelasTeks: "text-sukses",
    warnaIkon: "#10B981",
  },
};

// ------------------------------------------------------------
// ModalKaca — modal kaca reusable (Escape / klik backdrop tutup)
// ------------------------------------------------------------

type ModalKacaProps = {
  terbuka: boolean;
  onTutup: () => void;
  labelAria: string;
  children: React.ReactNode;
};

function ModalKaca({ terbuka, onTutup, labelAria, children }: ModalKacaProps) {
  // Tombol Escape menutup modal
  useEffect(() => {
    if (!terbuka) return;
    function tanganiEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onTutup();
    }
    window.addEventListener("keydown", tanganiEscape);
    return () => window.removeEventListener("keydown", tanganiEscape);
  }, [terbuka, onTutup]);

  // Kunci scroll body selama modal terbuka
  useEffect(() => {
    if (!terbuka) return;
    const sebelumnya = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = sebelumnya;
    };
  }, [terbuka]);

  return (
    <AnimatePresence>
      {terbuka && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-6 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onTutup}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={labelAria}
            className="glass-strong w-full max-w-[320px] rounded-2xl p-5"
            initial={{ scale: 0.9, opacity: 0, y: 14 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 10 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ------------------------------------------------------------
// BarisPengaturan — baris kartu kaca tipis daftar pengaturan
// ------------------------------------------------------------

type BarisPengaturanProps = {
  ikon: KomponenIkon;
  warnaIkon: string;
  label: string;
  kanan?: React.ReactNode;
  onClick?: () => void;
  merah?: boolean;
  redup?: boolean;
};

function BarisPengaturan({
  ikon: Ikon,
  warnaIkon,
  label,
  kanan,
  onClick,
  merah = false,
  redup = false,
}: BarisPengaturanProps) {
  const isi = (
    <>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
        style={{
          backgroundColor: `${warnaIkon}1a`,
          borderColor: `${warnaIkon}38`,
          color: warnaIkon,
        }}
        aria-hidden="true"
      >
        <Ikon className="h-4.5 w-4.5" />
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 text-sm font-semibold",
          merah ? "text-gagal" : "text-teks-utama",
        )}
      >
        {label}
      </span>
      {kanan}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "glass flex min-h-[54px] w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left",
          redup ? "cursor-default opacity-70" : "btn-tekan cursor-pointer",
        )}
      >
        {isi}
      </button>
    );
  }

  return (
    <div className="glass flex min-h-[54px] w-full items-center gap-3 rounded-2xl px-4 py-2.5">
      {isi}
    </div>
  );
}

// ------------------------------------------------------------
// ProfilScreen
// ------------------------------------------------------------

export function ProfilScreen({
  user,
  onLogout,
  onBukaAbsensi,
  onBukaLaporanKerja,
  onBukaNotifikasi,
  onBukaPanelMaster,
  onBukaPengaturanFitur,
}: ProfilScreenProps) {
  const tema = useAppStore((s) => s.tema);
  const toggleTema = useAppStore((s) => s.toggleTema);

  // Status notifikasi Android sungguhan (Web Push), bukan sakelar hiasan.
  //
  // Izin notifikasi adalah keadaan milik peramban, bukan milik React —
  // dan bisa berubah dari luar aplikasi (Pengaturan ponsel). Karena itu
  // dibaca lewat useSyncExternalStore, bukan disalin ke state di dalam
  // effect (yang juga dilarang aturan React 19 di proyek ini).
  const izinPeramban = useSyncExternalStore(
    langgananIzinNotifikasi,
    statusPush,
    () => "belum-diminta" as StatusPush,
  );
  // Hasil aksi pengguna menimpa bacaan peramban sampai render berikutnya,
  // supaya sakelarnya langsung bergerak begitu ditekan.
  const [statusManual, setStatusManual] = useState<StatusPush | null>(null);
  const statusNotifikasi = statusManual ?? izinPeramban;
  const [sedangUbahPush, setSedangUbahPush] = useState(false);
  const pushAktif = statusNotifikasi === "aktif";
  const setStatusNotifikasi = setStatusManual;

  async function ubahPush() {
    if (sedangUbahPush) return;
    setSedangUbahPush(true);
    try {
      if (pushAktif) {
        await matikanPush();
        setStatusNotifikasi("belum-diminta");
        toast("info", "Notifikasi push dimatikan", "Perangkat ini tidak akan dibunyikan lagi.");
      } else {
        const hasil = await aktifkanPush(user.email);
        setStatusNotifikasi(hasil);
        if (hasil === "aktif") {
          toast("sukses", "Notifikasi push aktif", "Perangkat ini akan menerima kabar dari sistem.");
        } else if (hasil === "ditolak") {
          // Sekali ditolak, dialog izin tidak akan muncul lagi — satu-satunya
          // jalan adalah lewat pengaturan sistem. Katakan apa adanya.
          toast(
            "peringatan",
            "Izin notifikasi ditolak",
            "Aktifkan lewat Pengaturan ponsel → Aplikasi → PRI SuperApp → Notifikasi.",
          );
        } else if (hasil === "tidak-didukung") {
          toast("info", "Tidak didukung di perangkat ini", "Coba buka lewat aplikasi atau Chrome Android.");
        }
      }
    } catch (err) {
      toast(
        "error",
        "Gagal mengubah notifikasi",
        err instanceof Error ? err.message : "Coba lagi sebentar.",
      );
    } finally {
      setSedangUbahPush(false);
    }
  }

  const [waAktif, setWaAktif] = useState(true);
  const [modalSosmed, setModalSosmed] = useState(false);
  // Dinaikkan saat pop-up ditutup agar jumlah akun di tombol ikut segar
  const [versiSosmed, setVersiSosmed] = useState(0);
  const [modalFoto, setModalFoto] = useState(false);
  const [modalSandi, setModalSandi] = useState(false);
  const [modalVerifWa, setModalVerifWa] = useState(false);
  // Foto yang baru diunggah dipakai langsung supaya perubahannya
  // terlihat seketika, tanpa menunggu profil dimuat ulang dari server.
  const [avatarBaru, setAvatarBaru] = useState<string>("");
  const [modalTentang, setModalTentang] = useState(false);
  const [modalChangelog, setModalChangelog] = useState(false);
  const [modalKeluar, setModalKeluar] = useState(false);

  const gelap = tema === "dark";
  const peran = KONFIG_ROLE[user.role];
  // Efek meriah + topi avatar khusus di hari ulang tahun pemilik profil.
  const ultah = ulangTahunHariIni(user);
  const IkonPeran = peran.ikon;
  const IkonTema = gelap ? Moon : Sun;
  const warnaIkonTema = gelap ? "#94A3B8" : "#F59E0B";

  return (
    <div className="kolom-aplikasi px-4 pt-5 pb-32">
      {ultah && <ConfettiUltah />}
      {/* Header tab utama — tanpa tombol kembali */}
      <header className="sticky top-0 z-30 -mx-4 mb-4 flex items-center justify-between gap-3 bg-gradient-to-b from-[var(--app-bg)] via-[var(--app-bg)] to-transparent px-4 pb-3 pt-1">
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-teks-utama">
          Profil
        </h1>
        <TombolLonceng onBuka={onBukaNotifikasi} />
        <ThemeToggle />
      </header>

      {/* Kartu profil kaca */}
      <FadeInUp>
        <div className="glass rounded-[1.25rem] px-5 py-6">
          <div className="flex flex-col items-center text-center">
            <button
              type="button"
              onClick={() => setModalFoto(true)}
              className="btn-tekan relative rounded-full"
              aria-label="Ganti foto profil"
            >
              {avatarBaru || user.avatar_url ? (
                <FotoBulat src={avatarBaru || user.avatar_url} ukuran={72} />
              ) : (
                <AvatarInisial nama={user.nama} ukuran={72} />
              )}
              {ultah && <TopiUltah />}
              <span
                className="absolute right-0 bottom-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white/80 text-white dark:border-slate-900/80"
                style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
                aria-hidden="true"
              >
                <Camera className="h-3 w-3" />
              </span>
            </button>
            <h2 className="mt-3.5 font-heading text-xl font-extrabold tracking-tight text-teks-utama">
              {user.nama}
            </h2>
            <p className="mt-1 text-xs text-teks-sekunder">{user.email}</p>
            <span
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold"
              style={{ background: peran.latar, borderColor: peran.tepi }}
            >
              <IkonPeran
                className="h-3.5 w-3.5"
                style={{ color: peran.warnaIkon }}
                aria-hidden="true"
              />
              <span className={peran.kelasTeks}>{peran.label}</span>
            </span>
            <p className="mt-2.5 text-[11px] font-medium text-teks-sekunder">
              {deskripsiStruktur(user) || user.jabatan}
            </p>
            {ultah && (
              <p className="mt-1 text-[12px] font-bold text-amber-600 dark:text-amber-400">
                🎂 Selamat ulang tahun{user.nama_panggilan ? `, ${user.nama_panggilan}` : ""}!
              </p>
            )}
          </div>
        </div>
      </FadeInUp>

      {/* Ajakan melengkapi data baru (panggilan/tgl lahir/divisi) */}
      <KartuLengkapiData user={user} />

      {/* Panel Master — hanya untuk peran master, tidak untuk yang lain */}
      {user.role === "master" && onBukaPanelMaster && (
        <FadeInUp delay={0.03}>
          <button
            type="button"
            onClick={onBukaPanelMaster}
            className="btn-tekan mt-6 flex w-full items-center gap-3 rounded-2xl border border-emas/40 bg-emas/10 px-4 py-3 text-left"
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
              style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)" }}
              aria-hidden="true"
            >
              <Crown className="h-4.5 w-4.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-teks-utama">Panel Master</span>
              <span className="block text-[11px] text-teks-sekunder">
                Peran istimewa, akun wajib QC, log galat
              </span>
            </span>
          </button>
        </FadeInUp>
      )}

      {/* Menu update aplikasi — hanya tampil bila ada versi baru */}
      <MenuUpdateAplikasi />

      {/* Antrean ACC pengajuan tim — khusus super admin / admin HR */}
      <AntreanAccTim user={user} />

      {/* Keanggotaan tim: ketua mengajukan anggota (aktif setelah ACC),
          memberi tugas, dan memantau; anggota melihat siapa atasannya. */}
      <KartuTim user={user} />

      {/* Kehadiran & kinerja harian */}
      <FadeInUp delay={0.06}>
        <SectionTitle judul="Kehadiran & Kinerja" className="mt-6" />
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <BarisPengaturan
            ikon={CalendarCheck}
            warnaIkon="#10B981"
            label="Absensi"
            onClick={onBukaAbsensi}
            kanan={
              <span className="text-xs font-medium text-teks-sekunder">Kamera + GPS</span>
            }
          />
          <BarisPengaturan
            ikon={ClipboardList}
            warnaIkon="#3B82F6"
            label="Laporan Kerja"
            onClick={onBukaLaporanKerja}
            kanan={
              <span className="text-xs font-medium text-teks-sekunder">Rencana & KPI</span>
            }
          />
        </div>
      </FadeInUp>

      {/* Daftar pengaturan */}
      <FadeInUp delay={0.08}>
        <SectionTitle judul="Pengaturan" className="mt-6" />
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:items-start">
          {/* 1. Mode Tema — sinkron dengan store global */}
          <BarisPengaturan
            ikon={IkonTema}
            warnaIkon={warnaIkonTema}
            label="Mode Tema"
            kanan={
              <SwitchKaca aktif={gelap} onUbah={toggleTema} labelAria="Mode gelap" />
            }
          />

          {/* 2. Notifikasi Push */}
          <BarisPengaturan
            ikon={Bell}
            warnaIkon="#DC2626"
            label="Notifikasi Push"
            kanan={
              <SwitchKaca
                aktif={pushAktif}
                disabled={sedangUbahPush || statusNotifikasi === "tidak-didukung"}
                onUbah={() => void ubahPush()}
                labelAria="Notifikasi push"
              />
            }
          />

          {/* Pengaturan fitur per peran — super admin & master */}
          {(user.role === "super_admin" || user.role === "master") &&
            onBukaPengaturanFitur && (
              <BarisPengaturan
                ikon={SlidersHorizontal}
                warnaIkon="#8B5CF6"
                label="Pengaturan Fitur"
                onClick={onBukaPengaturanFitur}
                kanan={
                  <span className="text-xs font-medium text-teks-sekunder">Per peran</span>
                }
              />
            )}

          {/* Ukuran teks aplikasi (kecil / normal / besar) */}
          <BarisUkuranTeks />

          {/* Bug / kritik / saran → pengembang; SA juga punya kotak masuk */}
          <SeksiMasukan user={user} />

          {/* Akun sosmed — tombol pembuka pop-up kelola */}
          <TombolAkunSosmed
            onBuka={() => setModalSosmed(true)}
            versiData={versiSosmed}
          />

          {/* 3. Notifikasi WhatsApp */}
          <BarisPengaturan
            ikon={MessageCircle}
            warnaIkon="#10B981"
            label="Notifikasi WhatsApp"
            kanan={
              <SwitchKaca
                aktif={waAktif}
                onUbah={() => setWaAktif((v) => !v)}
                labelAria="Notifikasi WhatsApp"
              />
            }
          />

          {/* Verifikasi nomor WhatsApp akun */}
          <BarisPengaturan
            ikon={ShieldCheck}
            warnaIkon="#10B981"
            label="Verifikasi WhatsApp"
            onClick={user.wa_terverifikasi ? undefined : () => setModalVerifWa(true)}
            kanan={
              user.wa_terverifikasi ? (
                <StatusBadge label="terverifikasi" warna="hijau" />
              ) : (
                <StatusBadge label="belum" warna="kuning" />
              )
            }
          />

          {/* Ganti kata sandi lewat OTP WhatsApp */}
          <BarisPengaturan
            ikon={KeyRound}
            warnaIkon="#3B82F6"
            label="Ganti Kata Sandi"
            onClick={() => setModalSandi(true)}
          />

          {/* 4. Bahasa — belum bisa diubah */}
          <BarisPengaturan
            ikon={Globe}
            warnaIkon="#F59E0B"
            label="Bahasa"
            onClick={() => toast("info", "Bahasa lain segera hadir")}
            redup
            kanan={
              <span className="flex items-center gap-2">
                <span className="text-xs font-medium text-teks-sekunder">Indonesia</span>
                <StatusBadge label="nonaktif" warna="netral" />
              </span>
            }
          />

          {/* Changelog "Apa yang Baru" (spek 1.4) */}
          <BarisPengaturan
            ikon={Sparkles}
            warnaIkon="#F59E0B"
            label="Apa yang Baru"
            onClick={() => setModalChangelog(true)}
            kanan={
              <span className="text-xs font-medium text-teks-sekunder">v{VERSI_APLIKASI}</span>
            }
          />

          {/* 5. Tentang Aplikasi */}
          <BarisPengaturan
            ikon={Info}
            warnaIkon="#DC2626"
            label="Tentang Aplikasi"
            onClick={() => setModalTentang(true)}
            kanan={
              <span className="text-xs font-medium text-teks-sekunder">Versi {VERSI_APLIKASI}</span>
            }
          />

          {/* 6. Keluar */}
          <BarisPengaturan
            ikon={LogOut}
            warnaIkon="#EF4444"
            label="Keluar"
            merah
            onClick={() => setModalKeluar(true)}
          />
        </div>
      </FadeInUp>

      {/* Tanda bawah aplikasi */}
      <FadeInUp delay={0.16}>
        <p className="mt-8 text-center text-[11px] text-teks-sekunder/70">
          PRI SuperApp · © 2026 Partai Rakyat Indonesia
        </p>
      </FadeInUp>

      {modalChangelog && <ModalChangelog onTutup={() => setModalChangelog(false)} />}

      {/* Modal Tentang Aplikasi */}
      {modalSosmed && (
        <ModalAkunSosmed
          onTutup={() => {
            setModalSosmed(false);
            setVersiSosmed((n) => n + 1);
          }}
        />
      )}

      {modalFoto && (
        <ModalGantiFoto
          onTutup={() => setModalFoto(false)}
          onSelesai={(url) => {
            setAvatarBaru(url);
            setModalFoto(false);
          }}
        />
      )}

      {modalVerifWa && <ModalVerifikasiWa onTutup={() => setModalVerifWa(false)} />}

      {modalSandi && (
        <ModalGantiSandi
          nomorWa={(user as { nomor_wa?: string | null }).nomor_wa ?? null}
          onTutup={() => setModalSandi(false)}
        />
      )}

      <ModalKaca
        terbuka={modalTentang}
        onTutup={() => setModalTentang(false)}
        labelAria="Tentang aplikasi"
      >
        <div className="flex flex-col items-center text-center">
          {/* Judul di bawahnya sudah menyebut "PRI SuperApp", jadi lambang
              ini hiasan saja bagi pembaca layar. */}
          <LogoPri ukuran={56} dekoratif />
          <h3 className="mt-3.5 font-heading text-base font-bold text-teks-utama">
            PRI SuperApp {VERSI_TAMPIL}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-teks-sekunder">
            Pusat Kendali Digital Partai Rakyat Indonesia
          </p>
          <div
            className="my-3.5 h-px w-full"
            style={{ background: "var(--glass-border)" }}
            aria-hidden="true"
          />
          <p className="text-[11px] leading-relaxed text-teks-sekunder">
            Dikembangkan oleh Tim Digital DPP Partai Rakyat Indonesia untuk
            memantau kepatuhan komentar kader dan mengelola siaran TV Rakyat.
          </p>
          <p className="mt-2 text-[11px] text-teks-sekunder/80">
            © 2026 Partai Rakyat Indonesia
          </p>
          <button
            type="button"
            onClick={() => setModalTentang(false)}
            className="glass btn-tekan mt-4 w-full rounded-xl py-2.5 text-sm font-semibold text-teks-utama"
          >
            Tutup
          </button>
        </div>
      </ModalKaca>

      {/* Modal Konfirmasi Keluar */}
      <ModalKaca
        terbuka={modalKeluar}
        onTutup={() => setModalKeluar(false)}
        labelAria="Konfirmasi keluar"
      >
        <div className="flex flex-col items-center text-center">
          <span
            className="flex h-12 w-12 items-center justify-center rounded-full border"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.14)",
              borderColor: "rgba(239, 68, 68, 0.30)",
              color: "#EF4444",
            }}
            aria-hidden="true"
          >
            <LogOut className="h-5 w-5" />
          </span>
          <h3 className="mt-3.5 font-heading text-base font-bold text-teks-utama">
            Keluar dari PRI SuperApp?
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-teks-sekunder">
            Anda akan kembali ke halaman masuk.
          </p>
          <div className="mt-5 flex w-full gap-2.5">
            <button
              type="button"
              onClick={() => setModalKeluar(false)}
              className="glass btn-tekan flex-1 rounded-xl py-2.5 text-sm font-semibold text-teks-utama"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => {
                setModalKeluar(false);
                onLogout();
              }}
              className="btn-tekan flex-1 rounded-xl py-2.5 font-heading text-sm font-bold text-white"
              style={{
                background: "linear-gradient(135deg, #DC2626, #B91C1C)",
                boxShadow: "0 8px 20px rgba(220, 38, 38, 0.35)",
              }}
            >
              Ya, Keluar
            </button>
          </div>
        </div>
      </ModalKaca>
    </div>
  );
}

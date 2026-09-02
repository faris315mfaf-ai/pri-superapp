"use client";
import { adalahKetum } from "@/lib/jabatan";

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
  Heart, ExternalLink, Pencil, Check, X, Loader2, PanelBottom, Fingerprint } from "lucide-react";
import { LogoPri } from "@/components/logo-pri";
import {
  AvatarInisial,
  FadeInUp,
  SectionTitle,
  StatusBadge,
  ThemeToggle,
  GlassSkeleton,
} from "@/components/pri-ui";
import { toast, useAppStore } from "@/hooks/use-app-store";
import { FotoBulat } from "@/components/foto-bulat";
import { CincinJuara } from "@/features/peringkat/cincin-mythic";
import { ConfettiUltah, TopiUltah, ulangTahunHariIni } from "@/components/ultah";
import { KartuLengkapiData } from "./lengkapi-data";
import { GaleriMomen } from "./galeri-momen";
import { PlatformIcon } from "@/components/platform-icon";
import { VideoEmbedMini } from "@/components/video-embed-mini";
import { KoinChip } from "@/components/koin-chip";
import { IkonGoogle } from "@/components/tombol-google";
import { urlProfilSosmed } from "@/lib/format";
import {
  ambilToken,
  bacaGalatSidikJari,
  daftarkanSidikJari,
  getProfilMomen,
  getStatusSidikJari,
  getStreakSaya,
  matikanSidikJari,
  perangkatDukungSidikJari,
  ubahProfilSaya,
  type ProfilMomen,
} from "@/services";
import { IkonStreak } from "@/components/ikon-streak";
import { deskripsiStruktur } from "@/lib/struktur";
import {
  aktifkanPush,
  langgananIzinNotifikasi,
  matikanPush,
  statusPush,
  type StatusPush,
} from "@/lib/push";
import type { KomponenIkon, Role, User } from "@/types";
import { LoncengDropdown } from "@/components/lonceng-dropdown";
import { cn } from "@/lib/utils";
import { SwitchKaca } from "./switch-kaca";
import {
  ModalAkunSosmed,
  ModalGantiFoto,
  ModalGantiSandi,
  ModalVerifikasiWa,
  TombolAkunSosmed,
} from "./pengaturan-akun";
import { BarisWajah } from "./wajah-panel";
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
  /** Buka layar Atur Menu Bawah (fitur 1.20/4) */
  onBukaAturMenu?: () => void;
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
  onBukaAturMenu,
}: ProfilScreenProps) {
  const tema = useAppStore((s) => s.tema);
  const toggleTema = useAppStore((s) => s.toggleTema);
  const setUser = useAppStore((s) => s.setUser);

  // Edit nama lengkap inline di hero (fitur 1.19/3.2).
  const [editNama, setEditNama] = useState(false);
  const [namaBaru, setNamaBaru] = useState("");
  const [menyimpanNama, setMenyimpanNama] = useState(false);

  async function simpanNama() {
    const n = namaBaru.trim();
    if (menyimpanNama) return;
    if (n.length < 2 || n.length > 100) {
      toast("error", "Nama lengkap 2–100 karakter");
      return;
    }
    if (n === user.nama) {
      setEditNama(false);
      return;
    }
    setMenyimpanNama(true);
    try {
      // Server mencatat jejak audit "Mengubah nama dari X menjadi Y";
      // setUser membuat nama baru langsung tampil di seluruh aplikasi.
      const segar = await ubahProfilSaya({ nama: n });
      setUser(segar);
      setEditNama(false);
      toast("sukses", "Nama diperbarui", `Sekarang tercatat sebagai ${segar.nama}.`);
    } catch (e) {
      toast("error", "Gagal menyimpan nama", e instanceof Error ? e.message : undefined);
    } finally {
      setMenyimpanNama(false);
    }
  }

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
  // Pengaturan 2 tab (spek 1.2): Display vs Profil & Keamanan
  const [tabPengaturan, setTabPengaturan] = useState<"display" | "keamanan">("display");
  // Profil ala ML (spek 4.3): galeri momen + skor suka + streak
  const [momen, setMomen] = useState<ProfilMomen | null>(null);
  const [streakku, setStreakku] = useState(0);
  const [muatMomen, setMuatMomen] = useState(0);
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

  useEffect(() => {
    let hidup = true;
    void (async () => {
      const [mm, st] = await Promise.allSettled([getProfilMomen(), getStreakSaya()]);
      if (!hidup) return;
      if (mm.status === "fulfilled") setMomen(mm.value);
      if (st.status === "fulfilled") setStreakku(st.value.hari);
    })();
    return () => {
      hidup = false;
    };
  }, [muatMomen]);

  return (
    <div className="kolom-aplikasi px-4 pt-5 pb-32">
      {ultah && <ConfettiUltah />}
      {/* HERO GRADIENT (fix 1.19/4.3a): lonceng dropdown di kanan
          atas DALAM area gradient, avatar menumpuk setengah keluar. */}
      <section
        className="relative -mx-4 overflow-visible rounded-b-[2rem] px-4 pt-4 pb-16 text-center md:pb-20"
        style={{
          background:
            "linear-gradient(150deg, #DC2626 0%, #B91C1C 55%, #7F1D1D 100%)",
          minHeight: 200,
        }}
      >
        {/* Hiasan lembut di dalam gradient */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-10 -right-10 h-44 w-44 rounded-full bg-white/10 blur-2xl"
        />
        <div className="relative flex items-center justify-between">
          <h1 className="font-heading text-xl font-extrabold tracking-tight text-white">
            Profil
          </h1>
          <div className="flex items-center gap-2">
            {/* Lonceng DROPDOWN (fix 4.3b) — panel di tempat */}
            <LoncengDropdown
              varianTerang
              onBukaTarget={() => onBukaNotifikasi?.()}
            />
            <ThemeToggle />
          </div>
        </div>

        <div className="relative mt-4 flex flex-col items-center">
          {/* Cincin Mythical (1 Sep 2026): mengikuti pemilik peringkat
              1-3 leaderboard TVR sampai ke halaman profilnya. */}
          <CincinJuara userId={user.id} ukuran={120}>
          <button
            type="button"
            onClick={() => setModalFoto(true)}
            className="btn-tekan avatar-denyut relative rounded-full border-4 border-white/90 shadow-2xl"
            aria-label="Ganti foto profil"
          >
            {avatarBaru || user.avatar_url ? (
              <FotoBulat src={avatarBaru || user.avatar_url} ukuran={112} />
            ) : (
              <AvatarInisial nama={user.nama} ukuran={112} />
            )}
            {ultah && <TopiUltah />}
            <span
              className="absolute right-1 bottom-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white/90 text-white"
              style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
              aria-hidden="true"
            >
              <Camera className="h-3 w-3" />
            </span>
          </button>
          </CincinJuara>
          {/* Nama + edit inline (fitur 1.19/3.2): ikon pensil membuka
              input di tempat; Simpan memanggil PATCH /api/profil dan
              tercatat di jejak audit. */}
          {editNama ? (
            <div className="mt-3 flex w-full max-w-[300px] flex-col items-center gap-2">
              <input
                value={namaBaru}
                onChange={(e) => setNamaBaru(e.target.value)}
                maxLength={100}
                autoFocus
                disabled={menyimpanNama}
                aria-label="Nama lengkap baru"
                className="h-11 w-full rounded-xl border border-white/40 bg-white/15 px-3.5 text-center font-heading text-lg font-bold text-white placeholder:text-white/50 backdrop-blur-sm focus:border-white/70 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void simpanNama();
                  if (e.key === "Escape") setEditNama(false);
                }}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void simpanNama()}
                  disabled={menyimpanNama || namaBaru.trim().length < 2}
                  className="btn-tekan flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-[12px] font-bold text-pri disabled:opacity-60"
                >
                  {menyimpanNama ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Simpan
                </button>
                <button
                  type="button"
                  onClick={() => setEditNama(false)}
                  disabled={menyimpanNama}
                  className="btn-tekan flex h-9 items-center gap-1.5 rounded-full bg-white/20 px-4 text-[12px] font-semibold text-white"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  Batal
                </button>
              </div>
            </div>
          ) : (
            <h2 className="mt-3 flex items-center gap-2 font-heading text-2xl font-extrabold tracking-tight text-white drop-shadow-sm">
              {user.nama}
              <button
                type="button"
                onClick={() => {
                  setNamaBaru(user.nama);
                  setEditNama(true);
                }}
                aria-label="Edit nama lengkap"
                className="btn-tekan flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </h2>
          )}
          <p className="mt-0.5 text-[12px] font-medium text-white/80">
            @{user.email.split("@")[0]}
            {(user.jabatan || user.divisi) &&
              ` · ${user.jabatan || user.divisi}`}
          </p>
        </div>
      </section>

      {/* Kartu profil kaca — MENUMPUK ke gradient (avatar overlap) */}
      <FadeInUp>
        <div className="glass kartu-hover -mt-10 rounded-[1.25rem] px-5 py-6">
          <div className="flex flex-col items-center text-center">
            <p className="text-xs text-teks-sekunder">{user.email}</p>
            {/* Saldo koin gamifikasi (spek 1.16) — di bawah nama anggota */}
            {momen && <KoinChip saldo={momen.koin} className="mt-2.5" />}
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
            {/* Skor ala ML (spek 4.3): suka profil + api streak */}
            <div className="mt-3 flex items-center gap-2">
              <span className="glass-soft flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold text-teks-utama">
                <Heart
                  className="h-3.5 w-3.5 text-red-500"
                  style={{ fill: "#ef4444" }}
                  aria-hidden="true"
                />
                <span className="angka-tab">{momen?.suka_profil ?? 0}</span>
                <span className="font-medium text-teks-sekunder">suka</span>
              </span>
              {streakku > 0 && (
                <span className="glass-soft flex items-center rounded-full px-3 py-1.5">
                  <IkonStreak hari={streakku} />
                </span>
              )}
            </div>
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

      {/* TV Rakyat Saya di profil (spek 1.15): username + video embed */}
      {momen && (momen.akun_tvr.length > 0 || momen.video_terbaru.length > 0) && (
        <FadeInUp delay={0.05}>
          {momen.akun_tvr.length > 0 && (
            <>
              <SectionTitle judul="Akun TV Rakyat Saya" className="mt-6" />
              <div className="flex flex-wrap gap-1.5">
                {momen.akun_tvr.map((a) => (
                  /* Bisa DIKLIK menuju profil akunnya (spek 1.16) */
                  <a
                    key={`${a.platform}-${a.username}`}
                    href={urlProfilSosmed(a.platform, a.username)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="glass-soft btn-tekan flex items-center gap-1.5 rounded-full px-3 py-1.5"
                  >
                    <PlatformIcon platform={a.platform} size={14} />
                    <span className="text-[11.5px] font-bold text-teks-utama">
                      @{a.username}
                    </span>
                    <ExternalLink className="h-3 w-3 text-teks-sekunder" aria-hidden="true" />
                  </a>
                ))}
              </div>
            </>
          )}
          {momen.video_terbaru.length > 0 && (
            <>
              <SectionTitle judul="Video Saya" className="mt-5" />
              <VideoEmbedMini video={momen.video_terbaru} />
            </>
          )}
        </FadeInUp>
      )}

      {/* Momen Terbaik PRI (spek 4.3) */}
      <FadeInUp delay={0.06}>
        <SectionTitle judul="Momen Terbaik PRI" className="mt-6" />
        {momen === null ? (
          <GlassSkeleton className="h-24 rounded-2xl" />
        ) : (
          <GaleriMomen
            foto={momen.foto}
            milikSendiri
            onBerubah={() => setMuatMomen((n) => n + 1)}
          />
        )}
      </FadeInUp>

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

      {/* Kehadiran & kinerja harian — Ketua Umum bukan objek absensi/KPI (2 Sep 2026) */}
      {!adalahKetum(user) && (
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
      )}

      {/* Daftar pengaturan */}
      <FadeInUp delay={0.08}>
        <SectionTitle judul="Pengaturan" className="mt-6" />
        {/* Dua tab (spek 1.2): Display / Profil & Keamanan */}
        <div className="glass mb-2 flex rounded-xl p-1">
          {(
            [
              { id: "display", label: "Display" },
              { id: "keamanan", label: "Profil & Keamanan" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTabPengaturan(t.id)}
              aria-pressed={tabPengaturan === t.id}
              className={cn(
                "btn-tekan flex-1 rounded-lg py-2 text-[12.5px] font-bold transition-colors",
                tabPengaturan === t.id ? "text-white" : "text-teks-sekunder",
              )}
              style={
                tabPengaturan === t.id
                  ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                  : undefined
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:items-start">
          {tabPengaturan === "display" && (
          <>
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

          {/* Ukuran teks aplikasi (kecil / normal / besar) */}
          <BarisUkuranTeks />

          {/* Susunan modul footer (fitur 1.20/4) */}
          {onBukaAturMenu && (
            <BarisPengaturan
              ikon={PanelBottom}
              warnaIkon="#0EA5E9"
              label="Atur Menu Bawah"
              onClick={onBukaAturMenu}
              kanan={
                <span className="text-xs font-medium text-teks-sekunder">Pilih modul</span>
              }
            />
          )}

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
          </>
          )}

          {tabPengaturan === "keamanan" && (
          <>
          {/* Ganti kata sandi lewat OTP WhatsApp */}
          <BarisPengaturan
            ikon={KeyRound}
            warnaIkon="#3B82F6"
            label="Ganti Kata Sandi"
            onClick={() => setModalSandi(true)}
          />

          {/* Verifikasi nomor WhatsApp akun (≈ "tautkan WhatsApp") */}
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

          {/* Akun Google (fitur 1.19/3.1): terhubung = badge hijau;
              belum = klik memulai alur tautkan lewat state bertanda
              tangan (bukan token sesi telanjang di URL Google). */}
          <BarisPengaturan
            ikon={IkonGoogle}
            warnaIkon="#4285F4"
            label="Akun Google"
            onClick={
              user.google_linked
                ? undefined
                : () => {
                    // Navigasi dokumen penuh — route API akan 302 ke
                    // halaman izin Google (router Next tak bisa).
                    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- tujuan akhirnya situs Google, bukan halaman Next
                    window.location.href = `${window.location.origin}/api/login/google?mode=tautkan&t=${encodeURIComponent(ambilToken())}`;
                  }
            }
            kanan={
              user.google_linked ? (
                <StatusBadge label="terhubung" warna="hijau" />
              ) : (
                <span className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-pri">Hubungkan</span>
                  <StatusBadge label="belum" warna="kuning" />
                </span>
              )
            }
          />

          {/* Masuk dengan Sidik Jari (fitur 1.21) — toggle aktif/nonaktif */}
          <BarisSidikJari />

          {/* Verifikasi Wajah (fitur 1.22/3) — daftar wajah untuk absen & login */}
          <BarisWajah />

          {/* Akun sosmed — tombol pembuka pop-up kelola */}
          <TombolAkunSosmed
            onBuka={() => setModalSosmed(true)}
            versiData={versiSosmed}
          />

          {/* Bug / kritik / saran → pengembang; SA juga punya kotak masuk */}
          <SeksiMasukan user={user} />

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
          </>
          )}

          {/* Baris umum — tampil di kedua tab */}
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

      {modalSandi && <ModalGantiSandi onTutup={() => setModalSandi(false)} />}

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

// ------------------------------------------------------------
// BarisSidikJari (fitur 1.21) — toggle login sidik jari di Keamanan.
// Aktif = ada kredensial terdaftar. Tombolnya hanya muncul di
// perangkat yang mendukung biometrik.
// ------------------------------------------------------------

function BarisSidikJari() {
  const [dukung, setDukung] = useState<boolean | null>(null);
  const [aktif, setAktif] = useState(false);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      const d = await perangkatDukungSidikJari();
      if (!hidup) return;
      setDukung(d);
      if (d) {
        const s = await getStatusSidikJari();
        if (hidup) setAktif(s.aktif);
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  // Perangkat tak mendukung / masih mengecek → sembunyikan barisnya.
  if (dukung !== true) return null;

  async function ubah() {
    if (sibuk) return;
    setSibuk(true);
    try {
      if (aktif) {
        await matikanSidikJari();
        setAktif(false);
        toast("sukses", "Sidik jari dinonaktifkan");
      } else {
        await daftarkanSidikJari();
        setAktif(true);
        toast("sukses", "Sidik jari aktif", "Kini Anda bisa masuk dengan sidik jari.");
      }
    } catch (e) {
      // Pesan ramah (bug 1.22) — pembatalan tak ditampilkan sebagai galat.
      const { pesan, dibatalkan } = bacaGalatSidikJari(e);
      if (!dibatalkan) toast("error", "Sidik jari gagal", pesan);
    } finally {
      setSibuk(false);
    }
  }

  return (
    <BarisPengaturan
      ikon={Fingerprint}
      warnaIkon="#8B5CF6"
      label="Masuk dengan Sidik Jari"
      kanan={
        <span className="flex items-center gap-2">
          {sibuk && <Loader2 className="h-3.5 w-3.5 animate-spin text-teks-sekunder" aria-hidden="true" />}
          <SwitchKaca
            aktif={aktif}
            disabled={sibuk}
            onUbah={() => void ubah()}
            labelAria="Aktifkan masuk dengan sidik jari"
          />
        </span>
      }
    />
  );
}

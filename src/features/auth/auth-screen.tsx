"use client";

// ============================================================
// AuthScreen — pintu masuk aplikasi.
//
// Layar utama hanya berisi identitas partai dan dua tombol besar.
// Semua pengisian terjadi di dalam pop-up, sesuai permintaan:
//   Masuk  → nomor WhatsApp/username + kata sandi
//   Daftar → username, kata sandi, nomor WhatsApp → OTP → profil
//
// Setelah pendaftaran, akun berstatus "menunggu" sampai super admin
// menyetujui dan menetapkan perannya.
// ============================================================

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Eye,
  EyeOff,
  Fingerprint,
  Loader2,
  Lock,
  Mail,
  Phone,
  ScanFace,
  ShieldCheck,
  TerminalSquare,
  User as IkonUser,
  UserPlus,
  X,
} from "lucide-react";
import { LogoPri } from "@/components/logo-pri";
import { ThemeToggle } from "@/components/pri-ui";
import { TombolGoogle } from "@/components/tombol-google";
import { DevMode } from "@/features/auth/dev-mode";
import { KameraWajah } from "@/features/profil/wajah-panel";
import { toast } from "@/hooks/use-app-store";
import { useEffect } from "react";
import {
  ambilToken,
  bacaGalatSidikJari,
  daftar as daftarService,
  kirimUlangOtp,
  lengkapiProfil,
  login as loginService,
  lupaSandiKirim,
  lupaSandiSetel,
  masukOtomatis,
  masukSidikJari,
  masukWajah,
  perangkatDukungSidikJari,
  verifikasiOtp,
  wajahLoginTersedia,
  type UserLengkap,
} from "@/services";
import { butuhSubDivisi, DIVISI, pilihanSubDivisi } from "@/lib/struktur";
import { cn } from "@/lib/utils";

type Langkah = "tertutup" | "masuk" | "daftar" | "otp" | "profil" | "menunggu" | "lupa" | "developer";

type AuthScreenProps = {
  onMasukBerhasil: (user: UserLengkap) => void;
  /** Akun "menunggu" yang ditemukan saat boot → langsung halaman tunggu */
  awalMenunggu?: UserLengkap | null;
};

/** Ukuran maksimal foto profil sebelum dikirim (server juga memeriksa) */
const MAKS_FOTO_BYTE = 2 * 1024 * 1024;

export function AuthScreen({ onMasukBerhasil, awalMenunggu = null }: AuthScreenProps) {
  // awalMenunggu (fitur 1.19.1): boot aplikasi menemukan token milik
  // akun berstatus "menunggu" (mis. baru daftar lewat Google) — layar
  // langsung dibuka di HALAMAN TUNGGU, bukan di menu masuk/daftar.
  const [langkah, setLangkah] = useState<Langkah>(awalMenunggu ? "menunggu" : "tertutup");
  // Nomor yang sedang diverifikasi, dibawa dari langkah daftar ke OTP.
  const [nomorOtp, setNomorOtp] = useState("");
  const [userSementara, setUserSementara] = useState<UserLengkap | null>(awalMenunggu);

  function tutup() {
    setLangkah("tertutup");
  }

  /**
   * Satu pintu keluar untuk semua langkah: begitu akun berstatus aktif
   * DAN profilnya lengkap, pengguna masuk ke aplikasi. Selain itu ia
   * diarahkan ke langkah yang masih kurang.
   */
  function lanjutkan(user: UserLengkap) {
    if (!user.profil_lengkap) {
      setUserSementara(user);
      setLangkah("profil");
      return;
    }
    if (user.status !== "aktif") {
      setUserSementara(user);
      setLangkah("menunggu");
      return;
    }
    onMasukBerhasil(user);
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <div className="absolute top-5 right-5">
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="flex w-full max-w-[380px] flex-col items-center"
      >
        {/* Lambang resmi partai; namanya sudah tertulis di <h1> di bawah,
            jadi lambangnya cukup jadi hiasan bagi pembaca layar. */}
        <LogoPri ukuran={80} dekoratif prioritas />

        <h1 className="font-heading mt-5 text-center text-2xl font-extrabold tracking-tight text-teks-utama">
          PRI SuperApp
        </h1>
        <p className="mt-1.5 text-center text-sm leading-relaxed text-teks-sekunder">
          Pusat Kendali Digital
          <br />
          Partai Rakyat Indonesia
        </p>

        {/* Dua tombol utama */}
        <div className="mt-9 flex w-full flex-col gap-3">
          <button
            type="button"
            onClick={() => setLangkah("masuk")}
            className="btn-tekan flex h-13 items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-bold text-white"
            style={{
              background: "linear-gradient(135deg, #DC2626, #B91C1C)",
              boxShadow: "0 10px 26px rgba(220, 38, 38, 0.35)",
            }}
          >
            <ShieldCheck className="h-5 w-5" />
            Masuk
          </button>
          <button
            type="button"
            onClick={() => setLangkah("daftar")}
            className="glass btn-tekan flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-bold text-teks-utama"
          >
            <UserPlus className="h-5 w-5" />
            Daftar
          </button>
        </div>

        <p className="mt-6 text-center text-[11.5px] leading-relaxed text-teks-sekunder">
          Pendaftaran diverifikasi lewat WhatsApp dan perlu
          <br />
          persetujuan pengurus sebelum dapat digunakan.
        </p>
      </motion.div>

      {/* Tombol kecil "developer mode" (fitur 1.22/1) — di ujung bawah
          layar, sengaja samar. Membuka mode impersonasi sesi (peran/
          jabatan/divisi apa pun) yang digerbang password developer. */}
      <button
        type="button"
        onClick={() => setLangkah("developer")}
        className="mt-8 inline-flex items-center gap-1.5 text-[11px] font-medium text-teks-sekunder/60 transition-opacity hover:opacity-100"
      >
        <TerminalSquare className="h-3.5 w-3.5" aria-hidden="true" />
        developer mode
      </button>

      <AnimatePresence>
        {langkah !== "tertutup" && (
          <ModalAuth
            key={langkah}
            // Langkah OTP dan profil tidak boleh ditinggalkan sembarangan
            // di tengah jalan — pendaftarannya jadi menggantung.
            bisaTutup={
              langkah === "masuk" ||
              langkah === "daftar" ||
              langkah === "lupa" ||
              langkah === "developer"
            }
            onTutup={tutup}
            judul={
              langkah === "masuk"
                ? "Masuk"
                : langkah === "daftar"
                  ? "Buat Akun Baru"
                  : langkah === "otp"
                    ? "Verifikasi WhatsApp"
                    : langkah === "profil"
                      ? "Lengkapi Profil"
                      : langkah === "lupa"
                        ? "Lupa Kata Sandi"
                        : langkah === "developer"
                          ? "Mode Developer"
                          : "Menunggu Persetujuan"
            }
          >
            {langkah === "masuk" && (
              <FormMasuk
                onBerhasil={lanjutkan}
                keDaftar={() => setLangkah("daftar")}
                keLupa={() => setLangkah("lupa")}
              />
            )}
            {langkah === "lupa" && (
              <FormLupaSandi kembali={() => setLangkah("masuk")} />
            )}
            {langkah === "developer" && <DevMode onBerhasil={lanjutkan} />}
            {langkah === "daftar" && (
              <FormDaftar
                onTerkirim={(nomor, otpTerkirim) => {
                  setNomorOtp(nomor);
                  // OTP gagal terkirim → lewati verifikasi, langsung ke
                  // layar menunggu persetujuan (HR/master sudah dikabari).
                  setLangkah(otpTerkirim ? "otp" : "menunggu");
                }}
                keMasuk={() => setLangkah("masuk")}
              />
            )}
            {langkah === "otp" && (
              <FormOtp
                nomor={nomorOtp}
                onBerhasil={lanjutkan}
                kembali={() => setLangkah("daftar")}
              />
            )}
            {langkah === "profil" && (
              <FormProfil awal={userSementara} onBerhasil={lanjutkan} />
            )}
            {langkah === "menunggu" && (
              <LayarMenunggu
                nama={userSementara?.nama ?? ""}
                onTutup={tutup}
                onDisetujui={(u) => {
                  toast("sukses", "Akun Anda disetujui \ud83c\udf89");
                  onMasukBerhasil(u);
                }}
              />
            )}
          </ModalAuth>
        )}
      </AnimatePresence>
    </div>
  );
}

// ------------------------------------------------------------
// Cangkang pop-up
// ------------------------------------------------------------

function ModalAuth({
  judul,
  bisaTutup,
  onTutup,
  children,
}: {
  judul: string;
  bisaTutup: boolean;
  onTutup: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[70] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={judul}
    >
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-md"
        onClick={bisaTutup ? onTutup : undefined}
      />
      <motion.div
        initial={{ y: "102%" }}
        animate={{ y: 0 }}
        exit={{ y: "102%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        className="glass-strong relative mx-auto flex max-h-[92dvh] w-full max-w-[440px] flex-col rounded-t-[2rem]"
      >
        <div className="flex shrink-0 justify-center pt-2.5 pb-1">
          <span className="h-1.5 w-12 rounded-full bg-teks-sekunder/40" aria-hidden="true" />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2">
          <h2 className="font-heading text-lg font-bold text-teks-utama">{judul}</h2>
          {bisaTutup && (
            <button
              type="button"
              onClick={onTutup}
              aria-label="Tutup"
              className="glass btn-tekan flex h-9 w-9 items-center justify-center rounded-full text-teks-utama"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          )}
        </div>
        <div className="scrollbar-tipis min-h-0 flex-1 overflow-y-auto px-5 pt-1 pb-8">
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Kolom isian bergaya kaca dengan ikon di kiri */
function Kolom({
  ikon: Ikon,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  ikon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="relative">
      <Ikon className="pointer-events-none absolute top-1/2 left-3.5 h-4.5 w-4.5 -translate-y-1/2 text-teks-sekunder" />
      <input
        {...props}
        className={cn(
          "glass-soft h-12 w-full rounded-xl pr-3.5 pl-11 text-[15px] text-teks-utama outline-none placeholder:text-teks-sekunder/70 focus:ring-2 focus:ring-pri/50 disabled:opacity-60",
          props.className,
        )}
      />
    </div>
  );
}

/** Tombol utama merah dengan keadaan memuat */
function TombolUtama({
  memuat,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { memuat?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || memuat}
      className="btn-tekan flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        background: "linear-gradient(135deg, #DC2626, #B91C1C)",
        boxShadow: "0 8px 20px rgba(220, 38, 38, 0.3)",
      }}
    >
      {memuat ? <Loader2 className="h-5 w-5 animate-spin" /> : children}
    </button>
  );
}

function PesanError({ pesan }: { pesan: string | null }) {
  if (!pesan) return null;
  return (
    <p className="rounded-xl border border-gagal/40 bg-gagal/10 px-3 py-2 text-[12.5px] leading-snug text-gagal">
      {pesan}
    </p>
  );
}

// ------------------------------------------------------------
// Langkah: Masuk
// ------------------------------------------------------------

function FormMasuk({
  onBerhasil,
  keDaftar,
  keLupa,
}: {
  onBerhasil: (u: UserLengkap) => void;
  keDaftar: () => void;
  keLupa: () => void;
}) {
  const [identitas, setIdentitas] = useState("");
  const [sandi, setSandi] = useState("");
  const [lihat, setLihat] = useState(false);
  const [memuat, setMemuat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Login sidik jari (fitur 1.21) — tombolnya hanya muncul di perangkat
  // yang punya biometrik.
  const [dukungSidik, setDukungSidik] = useState(false);
  const [sidikJalan, setSidikJalan] = useState(false);
  // Login wajah (fitur 1.22/3) — hanya muncul bila penyedia aktif.
  const [wajahAda, setWajahAda] = useState(false);
  const [kameraWajah, setKameraWajah] = useState(false);
  const [wajahJalan, setWajahJalan] = useState(false);

  useEffect(() => {
    let hidup = true;
    void perangkatDukungSidikJari().then((d) => {
      if (hidup) setDukungSidik(d);
    });
    void wajahLoginTersedia().then((a) => {
      if (hidup) setWajahAda(a);
    });
    return () => {
      hidup = false;
    };
  }, []);

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    if (memuat) return;
    setError(null);
    setMemuat(true);
    try {
      const user = await loginService(identitas.trim(), sandi);
      onBerhasil(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal masuk. Coba lagi.");
    } finally {
      setMemuat(false);
    }
  }

  async function masukSidik() {
    if (sidikJalan) return;
    setError(null);
    setSidikJalan(true);
    try {
      const user = await masukSidikJari();
      onBerhasil(user);
    } catch (err) {
      // Pesan diklasifikasikan (bug 1.22): galat WebAuthn dibungkus jadi
      // WebAuthnError — dulu teks mentah W3C bocor ke layar. Kini pesan
      // Indonesia yang jelas, dan pembatalan tak ditampilkan merah.
      const { pesan, dibatalkan } = bacaGalatSidikJari(err);
      setError(dibatalkan ? null : pesan);
      if (dibatalkan) toast("info", "Sidik jari", pesan);
    } finally {
      setSidikJalan(false);
    }
  }

  function bukaKameraWajah() {
    if (identitas.trim().length < 3) {
      setError("Ketik dulu username atau nomor WhatsApp Anda, lalu pindai wajah.");
      return;
    }
    setError(null);
    setKameraWajah(true);
  }

  async function masukDenganWajah(image: string) {
    setKameraWajah(false);
    if (wajahJalan) return;
    setWajahJalan(true);
    try {
      const user = await masukWajah(identitas.trim(), image);
      onBerhasil(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wajah tidak dikenali. Coba lagi.");
    } finally {
      setWajahJalan(false);
    }
  }

  const sah = identitas.trim().length >= 3 && sandi.length >= 1;

  return (
    <form onSubmit={kirim} className="flex flex-col gap-3" noValidate>
      <div>
        <label htmlFor="identitas" className="mb-1.5 block text-[12.5px] font-semibold text-teks-sekunder">
          Nomor WhatsApp atau Username
        </label>
        <Kolom
          id="identitas"
          ikon={Phone}
          value={identitas}
          onChange={(e) => setIdentitas(e.target.value)}
          placeholder="0812xxxxxxx atau username"
          autoComplete="username"
          disabled={memuat}
        />
      </div>

      <div>
        <label htmlFor="sandi" className="mb-1.5 block text-[12.5px] font-semibold text-teks-sekunder">
          Kata Sandi
        </label>
        <div className="relative">
          <Kolom
            id="sandi"
            ikon={Lock}
            type={lihat ? "text" : "password"}
            value={sandi}
            onChange={(e) => setSandi(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            disabled={memuat}
            className="pr-12"
          />
          <button
            type="button"
            onClick={() => setLihat((v) => !v)}
            aria-label={lihat ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-teks-sekunder"
          >
            {lihat ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
          </button>
        </div>
      </div>

      <div className="-mt-1 text-right">
        <button
          type="button"
          onClick={keLupa}
          className="text-[12px] font-semibold text-teks-sekunder underline-offset-4 hover:underline"
        >
          Lupa kata sandi?
        </button>
      </div>

      <PesanError pesan={error} />

      <TombolUtama type="submit" memuat={memuat} disabled={!sah}>
        Masuk
        <ArrowRight className="h-4.5 w-4.5" />
      </TombolUtama>

      {/* Masuk dengan sidik jari (fitur 1.21) — muncul hanya di
          perangkat berbiometrik & untuk akun yang sudah mengaktifkannya
          di Profil → Keamanan. */}
      {dukungSidik && (
        <button
          type="button"
          onClick={() => void masukSidik()}
          disabled={sidikJalan || memuat}
          className="btn-tekan flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-glass-border text-sm font-bold text-teks-utama disabled:opacity-60"
        >
          {sidikJalan ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <Fingerprint className="h-5 w-5 text-pri" aria-hidden="true" />
          )}
          Masuk dengan Sidik Jari
        </button>
      )}

      {/* Masuk dengan Wajah (fitur 1.22/3) — muncul hanya bila penyedia
          wajah aktif. Butuh identitas (username/nomor) lalu pindai wajah. */}
      {wajahAda && (
        <button
          type="button"
          onClick={bukaKameraWajah}
          disabled={wajahJalan || memuat}
          className="btn-tekan flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-glass-border text-sm font-bold text-teks-utama disabled:opacity-60"
        >
          {wajahJalan ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <ScanFace className="h-5 w-5 text-sky-500" aria-hidden="true" />
          )}
          Masuk dengan Wajah
        </button>
      )}

      <AnimatePresence>
        {kameraWajah && (
          <KameraWajah onFoto={(img) => void masukDenganWajah(img)} onTutup={() => setKameraWajah(false)} />
        )}
      </AnimatePresence>

      {/* Pintu masuk Google (fitur 1.19/3.1): divider "atau" + tombol
          branding Google. Belum terdaftar pun bisa — akunnya dibuat
          otomatis oleh callback. */}
      <TombolGoogle disabled={memuat} />

      <p className="mt-1 text-center text-[12.5px] text-teks-sekunder">
        Belum punya akun?{" "}
        <button type="button" onClick={keDaftar} className="font-semibold text-pri underline-offset-4 hover:underline">
          Daftar di sini
        </button>
      </p>
    </form>
  );
}

// ------------------------------------------------------------
// Langkah: Daftar
// ------------------------------------------------------------

function FormDaftar({
  onTerkirim,
  keMasuk,
}: {
  onTerkirim: (nomor: string, otpTerkirim: boolean) => void;
  keMasuk: () => void;
}) {
  const [nama, setNama] = useState("");
  const [username, setUsername] = useState("");
  const [sandi, setSandi] = useState("");
  const [nomor, setNomor] = useState("");
  const [lihat, setLihat] = useState(false);
  const [memuat, setMemuat] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usernameSah = /^[a-z0-9._]{3,20}$/.test(username.trim());
  const nomorSah = /^0?8[0-9]{8,12}$/.test(nomor.replace(/[^0-9]/g, ""));
  const sandiSah = sandi.length >= 8;
  const sah = usernameSah && nomorSah && sandiSah && nama.trim().length >= 2;

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    if (memuat || !sah) return;
    setError(null);
    setMemuat(true);
    try {
      const { nomor_wa, otp_terkirim } = await daftarService({
        nama: nama.trim(),
        username: username.trim(),
        password: sandi,
        nomor_wa: nomor,
      });
      if (otp_terkirim) {
        toast("sukses", "Kode terkirim", "Cek WhatsApp Anda untuk kode 6 angka.");
      } else {
        toast(
          "info",
          "Pendaftaran diterima",
          "Kode WhatsApp gagal terkirim — akun Anda menunggu persetujuan pengurus.",
        );
      }
      onTerkirim(nomor_wa, otp_terkirim);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mendaftar. Coba lagi.");
    } finally {
      setMemuat(false);
    }
  }

  return (
    <form onSubmit={kirim} className="flex flex-col gap-3" noValidate>
      <div>
        <label htmlFor="d-nama" className="mb-1.5 block text-[12.5px] font-semibold text-teks-sekunder">
          Nama Lengkap
        </label>
        <Kolom
          id="d-nama"
          ikon={IkonUser}
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          placeholder="Nama sesuai KTP"
          autoComplete="name"
          disabled={memuat}
        />
      </div>

      <div>
        <label htmlFor="d-username" className="mb-1.5 block text-[12.5px] font-semibold text-teks-sekunder">
          Username
        </label>
        <Kolom
          id="d-username"
          ikon={Mail}
          type="text"
          value={username}
          onChange={(e) =>
            setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, ""))
          }
          placeholder="username_anda"
          autoComplete="username"
          disabled={memuat}
        />
        <p className="mt-1 text-[11px] text-teks-sekunder">
          Dipakai untuk masuk (selain nomor WhatsApp). 3–20 karakter:
          huruf kecil, angka, titik, garis bawah.
        </p>
      </div>

      <div>
        <label htmlFor="d-nomor" className="mb-1.5 block text-[12.5px] font-semibold text-teks-sekunder">
          Nomor WhatsApp
        </label>
        <Kolom
          id="d-nomor"
          ikon={Phone}
          type="tel"
          inputMode="numeric"
          value={nomor}
          onChange={(e) => setNomor(e.target.value)}
          placeholder="0812xxxxxxx"
          autoComplete="tel"
          disabled={memuat}
        />
        <p className="mt-1 text-[11.5px] text-teks-sekunder">
          Kode verifikasi dikirim ke nomor ini. Pastikan aktif di WhatsApp.
        </p>
      </div>

      <div>
        <label htmlFor="d-sandi" className="mb-1.5 block text-[12.5px] font-semibold text-teks-sekunder">
          Kata Sandi
        </label>
        <div className="relative">
          <Kolom
            id="d-sandi"
            ikon={Lock}
            type={lihat ? "text" : "password"}
            value={sandi}
            onChange={(e) => setSandi(e.target.value)}
            placeholder="Minimal 8 karakter"
            autoComplete="new-password"
            disabled={memuat}
            className="pr-12"
          />
          <button
            type="button"
            onClick={() => setLihat((v) => !v)}
            aria-label={lihat ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-teks-sekunder"
          >
            {lihat ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
          </button>
        </div>
        {sandi.length > 0 && !sandiSah && (
          <p className="mt-1 text-[11.5px] text-gagal">Kata sandi minimal 8 karakter.</p>
        )}
      </div>

      <PesanError pesan={error} />

      <TombolUtama type="submit" memuat={memuat} disabled={!sah}>
        Kirim Kode ke WhatsApp
        <ArrowRight className="h-4.5 w-4.5" />
      </TombolUtama>

      {/* Daftar lewat Google (fitur 1.19.1): tanpa isi formulir & OTP —
          akun dibuat otomatis berstatus menunggu persetujuan. */}
      <TombolGoogle disabled={memuat} label="Daftar dengan Google" />

      <p className="mt-1 text-center text-[12.5px] text-teks-sekunder">
        Sudah punya akun?{" "}
        <button type="button" onClick={keMasuk} className="font-semibold text-pri underline-offset-4 hover:underline">
          Masuk di sini
        </button>
      </p>
    </form>
  );
}

// ------------------------------------------------------------
// Langkah: OTP
// ------------------------------------------------------------

function FormOtp({
  nomor,
  onBerhasil,
  kembali,
}: {
  nomor: string;
  onBerhasil: (u: UserLengkap) => void;
  kembali: () => void;
}) {
  const [kode, setKode] = useState("");
  const [memuat, setMemuat] = useState(false);
  const [mengirimUlang, setMengirimUlang] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tampilkan nomornya sebagian saja — cukup untuk memastikan tidak
  // salah nomor, tanpa memajang nomor lengkap di layar.
  const nomorSamar = nomor.replace(/^(62\d{3})\d+(\d{3})$/, "$1••••$2");

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    if (memuat || kode.length !== 6) return;
    setError(null);
    setMemuat(true);
    try {
      const user = await verifikasiOtp(nomor, kode);
      toast("sukses", "Nomor terverifikasi");
      onBerhasil(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kode tidak diterima.");
      setKode("");
    } finally {
      setMemuat(false);
    }
  }

  async function ulang() {
    if (mengirimUlang) return;
    setMengirimUlang(true);
    setError(null);
    try {
      await kirimUlangOtp(nomor);
      toast("sukses", "Kode baru terkirim");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim ulang.");
    } finally {
      setMengirimUlang(false);
    }
  }

  return (
    <form onSubmit={kirim} className="flex flex-col gap-4" noValidate>
      <p className="text-[13px] leading-relaxed text-teks-sekunder">
        Kami mengirim 6 angka ke WhatsApp{" "}
        <span className="font-semibold text-teks-utama">{nomorSamar}</span>. Masukkan di
        bawah ini.
      </p>

      <input
        value={kode}
        onChange={(e) => setKode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="Kode verifikasi 6 angka"
        placeholder="······"
        disabled={memuat}
        className="glass-soft h-16 w-full rounded-2xl text-center font-mono text-[30px] tracking-[0.5em] text-teks-utama outline-none placeholder:text-teks-sekunder/40 focus:ring-2 focus:ring-pri/50 disabled:opacity-60"
      />

      <PesanError pesan={error} />

      <TombolUtama type="submit" memuat={memuat} disabled={kode.length !== 6}>
        Verifikasi
        <ShieldCheck className="h-4.5 w-4.5" />
      </TombolUtama>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={kembali}
          className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-teks-sekunder"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Ubah nomor
        </button>
        <button
          type="button"
          onClick={() => void ulang()}
          disabled={mengirimUlang}
          className="text-[12.5px] font-semibold text-pri underline-offset-4 hover:underline disabled:opacity-50"
        >
          {mengirimUlang ? "Mengirim…" : "Kirim ulang kode"}
        </button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------
// Langkah: Lengkapi profil
// ------------------------------------------------------------

function FormProfil({
  awal,
  onBerhasil,
}: {
  awal: UserLengkap | null;
  onBerhasil: (u: UserLengkap) => void;
}) {
  const [nama, setNama] = useState(awal?.nama ?? "");
  const [panggilan, setPanggilan] = useState("");
  const [tanggalLahir, setTanggalLahir] = useState("");
  const [divisi, setDivisi] = useState("");
  const [subDivisi, setSubDivisi] = useState("");
  const [foto, setFoto] = useState<string>("");
  const [memuat, setMemuat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const berkasRef = useRef<HTMLInputElement>(null);

  // Sub-divisi hanya berlaku untuk Sayap Partai & Zona — ganti divisi
  // berarti pilihan sub yang lama tidak sah lagi.
  const daftarSub = pilihanSubDivisi(divisi);

  function pilihFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAKS_FOTO_BYTE) {
      setError("Ukuran foto maksimal 2 MB.");
      return;
    }
    const pembaca = new FileReader();
    pembaca.onload = () => {
      setFoto(String(pembaca.result ?? ""));
      setError(null);
    };
    pembaca.onerror = () => setError("Gagal membaca foto.");
    pembaca.readAsDataURL(f);
  }

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    if (memuat) return;
    setError(null);
    setMemuat(true);
    try {
      const user = await lengkapiProfil({
        nama: nama.trim(),
        nama_panggilan: panggilan.trim(),
        tanggal_lahir: tanggalLahir,
        divisi,
        sub_divisi: subDivisi,
        foto: foto || undefined,
      });
      toast("sukses", "Profil tersimpan");
      onBerhasil(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan profil.");
    } finally {
      setMemuat(false);
    }
  }

  const sah =
    nama.trim().length >= 2 &&
    panggilan.trim().length >= 2 &&
    Boolean(tanggalLahir) &&
    Boolean(divisi) &&
    (!butuhSubDivisi(divisi) || Boolean(subDivisi));

  return (
    <form onSubmit={kirim} className="flex flex-col gap-4" noValidate>
      {/* Foto profil */}
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => berkasRef.current?.click()}
          className="btn-tekan relative h-24 w-24 overflow-hidden rounded-full"
          aria-label="Pilih foto profil"
        >
          {foto ? (
            <img src={foto} alt="" className="h-full w-full object-cover" />
          ) : (
            <span
              className="flex h-full w-full items-center justify-center text-white"
              style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
            >
              <Camera className="h-8 w-8" />
            </span>
          )}
          <span className="absolute inset-0 rounded-full ring-2 ring-white/30" />
        </button>
        <input
          ref={berkasRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={pilihFoto}
          className="hidden"
        />
        <p className="text-[11.5px] text-teks-sekunder">
          {foto ? "Ketuk untuk mengganti" : "Ketuk untuk pilih foto (opsional)"}
        </p>
      </div>

      <div>
        <label htmlFor="p-nama" className="mb-1.5 block text-[12.5px] font-semibold text-teks-sekunder">
          Nama Lengkap
        </label>
        <Kolom
          id="p-nama"
          ikon={IkonUser}
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          placeholder="Nama sesuai KTP"
          disabled={memuat}
        />
      </div>

      <div>
        <label htmlFor="p-panggilan" className="mb-1.5 block text-[12.5px] font-semibold text-teks-sekunder">
          Nama Panggilan
        </label>
        <Kolom
          id="p-panggilan"
          ikon={IkonUser}
          value={panggilan}
          onChange={(e) => setPanggilan(e.target.value)}
          placeholder="Dipakai untuk sapaan, mis. Budi"
          maxLength={30}
          disabled={memuat}
        />
      </div>

      <div>
        <label htmlFor="p-lahir" className="mb-1.5 block text-[12.5px] font-semibold text-teks-sekunder">
          Tanggal Lahir
        </label>
        <input
          id="p-lahir"
          type="date"
          value={tanggalLahir}
          onChange={(e) => setTanggalLahir(e.target.value)}
          disabled={memuat}
          className="glass-soft h-12 w-full rounded-xl px-3.5 text-[15px] text-teks-utama outline-none focus:ring-2 focus:ring-pri/50 disabled:opacity-60"
        />
      </div>

      <div>
        <label htmlFor="p-divisi" className="mb-1.5 block text-[12.5px] font-semibold text-teks-sekunder">
          Divisi
        </label>
        <select
          id="p-divisi"
          value={divisi}
          onChange={(e) => {
            setDivisi(e.target.value);
            setSubDivisi("");
          }}
          disabled={memuat}
          className="glass-soft h-12 w-full rounded-xl px-3.5 text-[15px] text-teks-utama outline-none focus:ring-2 focus:ring-pri/50 disabled:opacity-60"
        >
          <option value="">— Pilih divisi —</option>
          {DIVISI.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-teks-sekunder">
          Jabatan resmi & posisi Kepala/Anggota diatur pengurus, bukan diisi sendiri.
        </p>
      </div>

      {daftarSub.length > 0 && (
        <div>
          <label htmlFor="p-sub" className="mb-1.5 block text-[12.5px] font-semibold text-teks-sekunder">
            {divisi === "Divisi Zona" ? "Zona" : "Sayap Partai"}
          </label>
          <select
            id="p-sub"
            value={subDivisi}
            onChange={(e) => setSubDivisi(e.target.value)}
            disabled={memuat}
            className="glass-soft h-12 w-full rounded-xl px-3.5 text-[15px] text-teks-utama outline-none focus:ring-2 focus:ring-pri/50 disabled:opacity-60"
          >
            <option value="">— Pilih —</option>
            {daftarSub.map((sub) => (
              <option key={sub.nilai} value={sub.nilai}>
                {sub.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <PesanError pesan={error} />

      <TombolUtama type="submit" memuat={memuat} disabled={!sah}>
        Simpan Profil
        <ArrowRight className="h-4.5 w-4.5" />
      </TombolUtama>
    </form>
  );
}

// ------------------------------------------------------------
// Langkah: Lupa kata sandi (OTP ke WhatsApp terdaftar)
// ------------------------------------------------------------

function FormLupaSandi({ kembali }: { kembali: () => void }) {
  const [tahap, setTahap] = useState<"minta" | "setel" | "selesai">("minta");
  const [identitas, setIdentitas] = useState("");
  const [kode, setKode] = useState("");
  const [sandiBaru, setSandiBaru] = useState("");
  const [lihat, setLihat] = useState(false);
  const [memuat, setMemuat] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function minta(e: React.FormEvent) {
    e.preventDefault();
    if (memuat) return;
    setError(null);
    setMemuat(true);
    try {
      await lupaSandiKirim(identitas.trim());
      setTahap("setel");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim kode.");
    } finally {
      setMemuat(false);
    }
  }

  async function setel(e: React.FormEvent) {
    e.preventDefault();
    if (memuat) return;
    setError(null);
    setMemuat(true);
    try {
      await lupaSandiSetel({
        identitas: identitas.trim(),
        kode,
        sandi_baru: sandiBaru,
      });
      setTahap("selesai");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyetel sandi baru.");
    } finally {
      setMemuat(false);
    }
  }

  if (tahap === "selesai") {
    return (
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <span
          className="flex h-16 w-16 items-center justify-center rounded-2xl text-white"
          style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
        >
          <ShieldCheck className="h-7 w-7" />
        </span>
        <p className="text-[13px] leading-relaxed text-teks-sekunder">
          Kata sandi berhasil diganti. Semua perangkat lama otomatis keluar —
          silakan masuk dengan sandi baru Anda.
        </p>
        <button
          type="button"
          onClick={kembali}
          className="glass btn-tekan w-full rounded-xl py-3 text-sm font-bold text-teks-utama"
        >
          Ke Halaman Masuk
        </button>
      </div>
    );
  }

  if (tahap === "setel") {
    return (
      <form onSubmit={setel} className="flex flex-col gap-3" noValidate>
        <p className="text-[13px] leading-relaxed text-teks-sekunder">
          Kode 6 angka dikirim ke WhatsApp yang TERDAFTAR pada akun itu.
          Masukkan kodenya lalu buat sandi baru.
        </p>
        <input
          value={kode}
          onChange={(e) => setKode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label="Kode verifikasi 6 angka"
          placeholder="\u00b7\u00b7\u00b7\u00b7\u00b7\u00b7"
          disabled={memuat}
          className="glass-soft h-14 w-full rounded-2xl text-center font-mono text-[26px] tracking-[0.45em] text-teks-utama outline-none placeholder:text-teks-sekunder/40 focus:ring-2 focus:ring-pri/50 disabled:opacity-60"
        />
        <div className="relative">
          <Kolom
            ikon={Lock}
            type={lihat ? "text" : "password"}
            value={sandiBaru}
            onChange={(e) => setSandiBaru(e.target.value)}
            placeholder="Kata sandi baru (min. 8 karakter)"
            autoComplete="new-password"
            disabled={memuat}
            className="pr-12"
          />
          <button
            type="button"
            onClick={() => setLihat((v) => !v)}
            aria-label={lihat ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-teks-sekunder"
          >
            {lihat ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
          </button>
        </div>
        <PesanError pesan={error} />
        <TombolUtama type="submit" memuat={memuat} disabled={kode.length !== 6 || sandiBaru.length < 8}>
          Setel Sandi Baru
          <ShieldCheck className="h-4.5 w-4.5" />
        </TombolUtama>
        <button
          type="button"
          onClick={() => setTahap("minta")}
          className="inline-flex items-center gap-1 self-start text-[12.5px] font-semibold text-teks-sekunder"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Ganti akun
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={minta} className="flex flex-col gap-3" noValidate>
      <p className="text-[13px] leading-relaxed text-teks-sekunder">
        Masukkan username atau nomor WhatsApp akun Anda. Kode pemulihan akan
        dikirim ke WhatsApp yang terdaftar.
      </p>
      <Kolom
        ikon={Phone}
        value={identitas}
        onChange={(e) => setIdentitas(e.target.value)}
        placeholder="0812xxxxxxx atau username"
        autoComplete="username"
        disabled={memuat}
      />
      <PesanError pesan={error} />
      <TombolUtama type="submit" memuat={memuat} disabled={identitas.trim().length < 3}>
        Kirim Kode
        <ArrowRight className="h-4.5 w-4.5" />
      </TombolUtama>
      <button
        type="button"
        onClick={kembali}
        className="inline-flex items-center gap-1 self-start text-[12.5px] font-semibold text-teks-sekunder"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Kembali ke Masuk
      </button>
    </form>
  );
}

// ------------------------------------------------------------
// Langkah: Menunggu persetujuan
// ------------------------------------------------------------

function LayarMenunggu({
  nama,
  onTutup,
  onDisetujui,
}: {
  nama: string;
  onTutup: () => void;
  onDisetujui: (u: UserLengkap) => void;
}) {
  const [ditolak, setDitolak] = useState(false);

  // Halaman tunggu HIDUP: tiap 5 detik menanyakan status ke server.
  // Begitu pengurus menekan Terima, layar ini sendiri yang membawa
  // pengguna masuk — tanpa refresh manual. Ditolak? Tokennya dicabut
  // server, dan kita tampilkan kabarnya apa adanya.
  useEffect(() => {
    let hidup = true;
    const detak = setInterval(() => {
      void (async () => {
        const hasil = await masukOtomatis();
        if (!hidup) return;
        if (hasil && hasil !== "perbaikan" && hasil.status === "aktif") {
          clearInterval(detak);
          onDisetujui(hasil);
        } else if (hasil === null && !ambilToken()) {
          // 401 membuang token = akun ditolak/dihapus pengurus.
          clearInterval(detak);
          setDitolak(true);
        }
      })();
    }, 5000);
    return () => {
      hidup = false;
      clearInterval(detak);
    };
  }, [onDisetujui]);

  if (ditolak) {
    return (
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <span
          className="flex h-16 w-16 items-center justify-center rounded-2xl text-white"
          style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
        >
          <X className="h-7 w-7" />
        </span>
        <div>
          <p className="font-heading text-base font-bold text-teks-utama">
            Pendaftaran ditolak
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-teks-sekunder">
            Mohon maaf, pendaftaran Anda tidak disetujui pengurus. Silakan hubungi
            HRD bila merasa ini keliru.
          </p>
        </div>
        <button
          type="button"
          onClick={onTutup}
          className="glass btn-tekan mt-1 w-full rounded-xl py-3 text-sm font-bold text-teks-utama"
        >
          Kembali
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <span
        className="flex h-16 w-16 items-center justify-center rounded-2xl text-white"
        style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)" }}
      >
        <Loader2 className="h-7 w-7 animate-spin" />
      </span>

      <div>
        <p className="font-heading text-base font-bold text-teks-utama">
          Terima kasih{nama ? `, ${nama.split(" ")[0]}` : ""}
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-teks-sekunder">
          Akun Anda sedang dalam proses verifikasi oleh HRD/Superadmin. Halaman ini
          akan berpindah SENDIRI begitu akun disetujui — biarkan saja terbuka.
        </p>
      </div>

      <button
        type="button"
        onClick={onTutup}
        className="glass btn-tekan mt-1 w-full rounded-xl py-3 text-sm font-bold text-teks-utama"
      >
        Mengerti
      </button>
    </div>
  );
}

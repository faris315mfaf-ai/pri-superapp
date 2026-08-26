"use client";

// ============================================================
// LoginScreen — halaman pertama aplikasi.
// Kartu kaca: logo, form email/sandi, akun demo, toggle tema.
// ============================================================

import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, Zap, ShieldCheck, Tv, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { ThemeToggle } from "@/components/pri-ui";
import { login as loginService } from "@/services";
import { useAppStore } from "@/hooks/use-app-store";
import type { KomponenIkon, User } from "@/types";
import { cn } from "@/lib/utils";

type LoginScreenProps = {
  onLoginBerhasil: (user: User) => void;
};

type AkunDemo = {
  label: string;
  email: string;
  ikon: KomponenIkon;
  kelasIkon: string;
};

const AKUN_DEMO: AkunDemo[] = [
  { label: "Super Admin", email: "super@pri.id", ikon: Zap, kelasIkon: "text-pri" },
  { label: "Admin HR", email: "hr@pri.id", ikon: ShieldCheck, kelasIkon: "text-emas" },
  { label: "Admin TV", email: "tv@pri.id", ikon: Tv, kelasIkon: "text-sukses" },
];

export function LoginScreen({ onLoginBerhasil }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [sandi, setSandi] = useState("");
  const [lihatSandi, setLihatSandi] = useState(false);
  const [ingatSaya, setIngatSaya] = useState(true);
  const [memproses, setMemproses] = useState(false);
  const [errorEmail, setErrorEmail] = useState<string | null>(null);
  const [errorUmum, setErrorUmum] = useState<string | null>(null);
  const [guncang, setGuncang] = useState(false);

  const toggleTema = useAppStore((s) => s.toggleTema);

  function validasi(): boolean {
    let sah = true;
    if (!email.trim()) {
      setErrorEmail("Email tidak boleh kosong");
      sah = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorEmail("Format email tidak valid");
      sah = false;
    } else {
      setErrorEmail(null);
    }
    return sah;
  }

  async function submit(emailFinal?: string, sandiFinal?: string) {
    if (memproses) return;
    setErrorUmum(null);

    const emailDipakai = (emailFinal ?? email).trim();
    const sandiDipakai = sandiFinal ?? sandi;

    if (emailFinal === undefined) {
      // Submit manual — jalankan validasi form
      setEmail(emailDipakai);
      if (!validasi()) return;
      if (!sandiDipakai) {
        setErrorUmum("Kata sandi tidak boleh kosong");
        picuGuncang();
        return;
      }
    }

    setMemproses(true);
    try {
      // Minimal 1,2 detik animasi "Memverifikasi..."
      const [user] = await Promise.all([
        loginService(emailDipakai, sandiDipakai),
        new Promise((r) => setTimeout(r, 1200)),
      ]);
      onLoginBerhasil(user);
    } catch (err) {
      setErrorUmum(
        err instanceof Error ? err.message : "Email atau kata sandi salah",
      );
      picuGuncang();
    } finally {
      setMemproses(false);
    }
  }

  function picuGuncang() {
    setGuncang(true);
    setTimeout(() => setGuncang(false), 550);
  }

  return (
    <div className="kolom-aplikasi relative flex min-h-dvh flex-col px-5">
      {/* Toggle tema pojok kanan atas */}
      <div className="flex items-center justify-end pt-5">
        <ThemeToggle />
      </div>

      <div className="flex flex-1 flex-col justify-center pb-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className={cn(guncang && "animasi-guncang")}
        >
          <GlassCard className="p-6 sm:p-7">
            {/* Logo + identitas */}
            <div className="flex flex-col items-center text-center">
              <motion.span
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 260, damping: 18 }}
                className="flex h-16 w-16 items-center justify-center rounded-full font-heading text-lg font-extrabold tracking-tight text-white shadow-xl"
                style={{
                  background: "linear-gradient(135deg, #DC2626 20%, #F59E0B 100%)",
                  boxShadow: "0 12px 30px rgba(220, 38, 38, 0.4)",
                }}
                aria-hidden="true"
              >
                PRI
              </motion.span>
              <h1 className="mt-4 font-heading text-2xl font-extrabold tracking-tight text-teks-utama">
                PRI SuperApp
              </h1>
              <p className="mt-1 text-xs leading-relaxed text-teks-sekunder">
                Pusat Kendali Digital Partai Rakyat Indonesia
              </p>
            </div>

            {/* Form */}
            <form
              className="mt-6 flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
              noValidate
            >
              {/* Email */}
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-xs font-semibold text-teks-sekunder"
                >
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-3.5 h-4.5 w-4.5 -translate-y-1/2 text-teks-sekunder" />
                  <input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="nama@pri.id"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errorEmail) setErrorEmail(null);
                    }}
                    disabled={memproses}
                    className={cn(
                      "glass-input h-12 w-full rounded-xl pl-11 pr-4 text-sm text-teks-utama placeholder:text-teks-sekunder/70",
                      errorEmail && "border-gagal/60",
                    )}
                    aria-invalid={!!errorEmail}
                    aria-describedby={errorEmail ? "pesan-email" : undefined}
                  />
                </div>
                {errorEmail && (
                  <p id="pesan-email" className="mt-1.5 text-xs font-medium text-gagal">
                    {errorEmail}
                  </p>
                )}
              </div>

              {/* Kata sandi */}
              <div>
                <label
                  htmlFor="sandi"
                  className="mb-1.5 block text-xs font-semibold text-teks-sekunder"
                >
                  Kata Sandi
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute top-1/2 left-3.5 h-4.5 w-4.5 -translate-y-1/2 text-teks-sekunder" />
                  <input
                    id="sandi"
                    type={lihatSandi ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={sandi}
                    onChange={(e) => {
                      setSandi(e.target.value);
                      if (errorUmum) setErrorUmum(null);
                    }}
                    disabled={memproses}
                    className="glass-input h-12 w-full rounded-xl pr-12 pl-11 text-sm text-teks-utama placeholder:text-teks-sekunder/70"
                  />
                  <button
                    type="button"
                    onClick={() => setLihatSandi((v) => !v)}
                    aria-label={lihatSandi ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                    className="btn-tekan absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-2 text-teks-sekunder hover:text-teks-utama"
                  >
                    {lihatSandi ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>
              </div>

              {/* Ingat saya + lupa sandi */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIngatSaya((v) => !v)}
                  className="flex min-h-[32px] items-center gap-2 text-xs font-medium text-teks-sekunder"
                  aria-pressed={ingatSaya}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-md border transition-colors",
                      ingatSaya
                        ? "border-pri bg-pri text-white"
                        : "border-black/20 bg-transparent dark:border-white/25",
                    )}
                    aria-hidden="true"
                  >
                    {ingatSaya && (
                      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
                        <path
                          d="M2.5 6.5L5 9l4.5-5.5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  Ingat saya
                </button>
                <button
                  type="button"
                  className="text-xs font-semibold text-pri underline-offset-4 hover:underline"
                  onClick={() =>
                    useAppStore
                      .getState()
                      .pushToast({
                        jenis: "info",
                        judul: "Fitur dalam pengembangan",
                        isi: "Hubungi admin DPP untuk reset kata sandi.",
                      })
                  }
                >
                  Lupa kata sandi?
                </button>
              </div>

              {/* Pesan error kredensial */}
              {errorUmum && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass rounded-xl border-gagal/40 px-3.5 py-2.5 text-xs font-medium text-gagal"
                  role="alert"
                >
                  {errorUmum}
                </motion.p>
              )}

              {/* Tombol Masuk */}
              <button
                type="submit"
                disabled={memproses}
                className={cn(
                  "btn-tekan flex h-12 w-full items-center justify-center gap-2 rounded-xl font-heading text-sm font-bold text-white",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
                style={{
                  background: "linear-gradient(135deg, #DC2626, #B91C1C)",
                  boxShadow: "0 10px 24px rgba(220, 38, 38, 0.35)",
                }}
              >
                {memproses ? (
                  <>
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                    Memverifikasi...
                  </>
                ) : (
                  "Masuk"
                )}
              </button>
            </form>

            {/* Panel akun demo */}
            <div className="glass-soft mt-5 rounded-2xl p-4">
              <p className="text-center text-[11px] font-semibold tracking-wide text-teks-sekunder uppercase">
                Akun Demo
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {AKUN_DEMO.map((akun) => (
                  <button
                    key={akun.email}
                    type="button"
                    disabled={memproses}
                    onClick={() => {
                      setEmail(akun.email);
                      setSandi("demo123");
                      setErrorEmail(null);
                      setErrorUmum(null);
                      void submit(akun.email, "demo123");
                    }}
                    className="glass btn-tekan flex min-h-[44px] items-center gap-3 rounded-xl px-3.5 py-2 text-left disabled:opacity-50"
                  >
                    <akun.ikon className={cn("h-4.5 w-4.5 shrink-0", akun.kelasIkon)} />
                    <span className="flex-1 text-xs font-semibold text-teks-utama">
                      {akun.label}
                    </span>
                    <span className="font-mono text-[11px] text-teks-sekunder">
                      {akun.email}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2.5 text-center text-[10px] text-teks-sekunder/80">
                Semua kata sandi demo: demo123
              </p>
            </div>
          </GlassCard>
        </motion.div>
      </div>
    </div>
  );
}

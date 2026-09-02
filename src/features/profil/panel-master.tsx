"use client";

// ============================================================
// PanelMaster — kewenangan yang HANYA dimiliki peran 'master'.
//
// Dibuka dari Profil. Isinya empat hal yang memang tidak pantas
// dipegang peran lain:
//
// 1. PERAN ISTIMEWA — sejak v1.7 panel super admin hanya bisa
//    memberi Ketua/Anggota. Peran Super Admin / Admin TV / Admin HR
//    tetap perlu bisa diberikan, tapi hanya lewat sini.
// 2. AKUN WAJIB QC — daftar akun yang komentarnya diwajibkan.
// 3. LOG GALAT — laporan error dari perangkat pengguna (telemetri).
// 4. PAKSA KELUAR — mencabut seluruh sesi seseorang.
//
// Barisnya sendiri disembunyikan dari peran lain, dan server tetap
// menolak dengan 404 bila ada yang mencoba memanggil langsung.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { useVersiSegar } from "@/hooks/use-segar-otomatis";
import { SeksiKuota } from "./seksi-kuota";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Bot,
  Bug,
  Crown,
  Database,
  FileText,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  UserCog,
  UserCheck,
  KeyRound,
  ScanFace,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { FotoBulat } from "@/components/foto-bulat";
import { SwitchKaca } from "./switch-kaca";
import { KontrolPerbaikan } from "./kontrol-perbaikan";
import {
  AvatarInisial,
  FadeInUp,
  GlassSkeleton,
  SectionTitle,
  StatusBadge,
} from "@/components/pri-ui";
import { PlatformIcon } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import {
  aksiMaster,
  getBasisAI,
  getDataMaster,
  getLatihAsisten,
  getPengguna,
  hapusBahanAjarAI,
  refreshBasisAI,
  simpanCatatanBasisAI,
  simpanLatihAsisten,
  tambahBahanAjarAI,
  type DataMaster,
  type PenggunaAdmin,
  type StatusBasisAI,
  getFotoMaster,
  type FotoMaster,
} from "@/services";
import { jamWIB, tanggalIndonesia } from "@/lib/format";
import { cn } from "@/lib/utils";

const PERAN_PILIHAN = [
  { id: "super_admin", label: "Super Admin", warna: "#DC2626" },
  { id: "admin_tv", label: "Admin TV Rakyat", warna: "#10B981" },
  { id: "admin_hr", label: "Admin HR", warna: "#F59E0B" },
  { id: "ketua", label: "Ketua", warna: "#F59E0B" },
  { id: "anggota", label: "Anggota", warna: "#3B82F6" },
] as const;

export function PanelMasterScreen({ onKembali }: { onKembali: () => void }) {
  const [data, setData] = useState<DataMaster | null>(null);
  const [pengguna, setPengguna] = useState<PenggunaAdmin[]>([]);
  const [muatUlang, setMuatUlang] = useState(0);
  const versiSegar = useVersiSegar();
  const [sedangProses, setSedangProses] = useState(false);
  const [pilihPeranUntuk, setPilihPeranUntuk] = useState<PenggunaAdmin | null>(null);
  const [akunBaru, setAkunBaru] = useState("");
  const [platformBaru, setPlatformBaru] = useState<"instagram" | "tiktok">("instagram");
  // Akun yang sedang di-reset sandinya (spek 1.15)
  const [resetUntuk, setResetUntuk] = useState<PenggunaAdmin | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      const [m, p] = await Promise.allSettled([getDataMaster(), getPengguna()]);
      if (!hidup) return;
      if (m.status === "fulfilled") setData(m.value);
      else {
        setData(null);
        toast("error", "Panel master tidak bisa dimuat", "");
      }
      if (p.status === "fulfilled") setPengguna(p.value.data);
    })();
    return () => {
      hidup = false;
    };
  }, [muatUlang, versiSegar]);

  async function jalankan(
    aksi: string,
    isi: Record<string, string | boolean>,
    pesan: string,
  ) {
    if (sedangProses) return;
    setSedangProses(true);
    try {
      await aksiMaster(aksi, isi);
      toast("sukses", pesan);
      setPilihPeranUntuk(null);
      setMuatUlang((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal", e instanceof Error ? e.message : "");
    } finally {
      setSedangProses(false);
    }
  }

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
            Panel Master
          </h1>
          <p className="text-xs text-teks-sekunder">Kewenangan tertinggi sistem</p>
        </div>
        <Crown className="h-5 w-5 shrink-0 text-emas" aria-hidden="true" />
      </header>

      {data === null ? (
        <GlassSkeleton className="mt-4 h-32 rounded-2xl" />
      ) : (
        <>
          {/* Ringkasan sistem */}
          <FadeInUp>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {(
                [
                  { label: "Pengguna", nilai: data.ringkasan.pengguna_aktif },
                  { label: "Percakapan", nilai: data.ringkasan.percakapan },
                  { label: "Video", nilai: data.ringkasan.video },
                  { label: "Galat", nilai: data.ringkasan.galat },
                ] as const
              ).map((r) => (
                <GlassCard key={r.label} className="px-2 py-2.5 text-center">
                  <p className="angka-tab font-heading text-lg font-extrabold text-teks-utama">
                    {r.nilai}
                  </p>
                  <p className="text-[10px] text-teks-sekunder">{r.label}</p>
                </GlassCard>
              ))}
            </div>
          </FadeInUp>

          {/* 1. Peran istimewa */}
          <FadeInUp delay={0.04}>
            {/* Mode perbaikan: kontrol lengkap (jam selesai + pesan) */}
            <KontrolPerbaikan />

            {/* Bypass persetujuan pendaftaran: pengguna baru langsung aktif. */}
            <GlassCard className="mt-4 p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
                  <UserCheck className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-teks-utama">
                      Daftar tanpa persetujuan
                    </p>
                    <SwitchKaca
                      aktif={data.pengaturan.daftar_auto_aktif === "true"}
                      disabled={sedangProses}
                      onUbah={() => {
                        const nyala = data.pengaturan.daftar_auto_aktif === "true";
                        void jalankan(
                          "daftar_auto_aktif",
                          { nilai: !nyala },
                          nyala
                            ? "Persetujuan pendaftaran DIWAJIBKAN lagi"
                            : "Pendaftar baru kini langsung aktif",
                        );
                      }}
                      labelAria="Bypass persetujuan pendaftaran"
                    />
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-teks-sekunder">
                    Bila nyala, pengguna baru langsung AKTIF tanpa menunggu persetujuan
                    pengurus. Verifikasi email tetap berlaku bila pengirim email sudah diatur.
                  </p>
                </div>
              </div>
            </GlassCard>

            {/* Akurasi face recognition (31 Agu 2026) — memperketat ambang
                tanpa deploy; obat bug "wajah beda bisa masuk". */}
            <KontrolWajah
              pengaturan={data.pengaturan}
              sedangProses={sedangProses}
              onSimpan={(kunci, persen) =>
                jalankan(
                  "wajah_akurasi",
                  { username: kunci, nilai: String(persen) },
                  "Akurasi wajah tersimpan — berlaku seketika",
                )
              }
            />

            <SectionTitle judul="Peran Istimewa" className="mt-6" />
            <p className="mb-2 text-[11px] leading-relaxed text-teks-sekunder">
              Panel super admin hanya bisa memberi Ketua/Anggota. Peran Super Admin,
              Admin TV, dan Admin HR hanya bisa ditetapkan dari sini.
            </p>
            <div className="flex flex-col gap-2">
              {pengguna
                .filter((u) => u.status === "aktif")
                .map((u) => (
                  <GlassCard key={u.id} className="flex items-center gap-3 p-3">
                    {u.avatar_url ? (
                      <FotoBulat src={u.avatar_url} ukuran={36} />
                    ) : (
                      <AvatarInisial nama={u.nama} ukuran={36} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-teks-utama">{u.nama}</p>
                      <p className="text-[10.5px] text-teks-sekunder">
                        {PERAN_PILIHAN.find((p) => p.id === u.role)?.label ?? u.role}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPilihPeranUntuk(u)}
                      aria-label={`Ubah peran ${u.nama}`}
                      className="glass btn-tekan flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-teks-utama"
                    >
                      <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
                      Peran
                    </button>
                    <button
                      type="button"
                      disabled={sedangProses || u.role === "master"}
                      onClick={() => setResetUntuk(u)}
                      aria-label={`Reset sandi ${u.nama}`}
                      className="btn-tekan p-1.5 text-teks-sekunder disabled:opacity-40"
                    >
                      <KeyRound className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={sedangProses}
                      onClick={() =>
                        void jalankan(
                          "cabut_sesi",
                          { user_id: u.id },
                          `${u.nama} dikeluarkan dari semua perangkat`,
                        )
                      }
                      aria-label={`Paksa keluar ${u.nama}`}
                      className="btn-tekan p-1.5 text-gagal disabled:opacity-50"
                    >
                      <LogOut className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </GlassCard>
                ))}
            </div>
          </FadeInUp>

          {/* Database foto unggahan (spek 1.15) */}
          <FadeInUp delay={0.07}>
            <GaleriFotoMaster />
          </FadeInUp>

          {/* 2. Akun wajib QC */}
          <FadeInUp delay={0.08}>
            <SectionTitle judul="Akun Wajib QC" className="mt-6" />
            <div className="mb-2 flex gap-2">
              <div className="glass flex shrink-0 gap-1 rounded-xl p-1">
                {(["instagram", "tiktok"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlatformBaru(p)}
                    aria-label={p}
                    className={cn(
                      "btn-tekan flex h-8 w-8 items-center justify-center rounded-lg",
                      platformBaru === p ? "bg-pri/15" : "",
                    )}
                  >
                    <PlatformIcon platform={p} size={15} />
                  </button>
                ))}
              </div>
              <input
                value={akunBaru}
                onChange={(e) => setAkunBaru(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, ""))}
                placeholder="username akun wajib"
                className="glass min-w-0 flex-1 rounded-xl px-3.5 py-2.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
              />
              <button
                type="button"
                disabled={akunBaru.length < 2 || sedangProses}
                onClick={() =>
                  void jalankan(
                    "tambah_akun_wajib",
                    { username: akunBaru, platform: platformBaru },
                    `@${akunBaru} ditambahkan ke akun wajib`,
                  ).then(() => setAkunBaru(""))
                }
                aria-label="Tambah akun wajib"
                className="btn-tekan flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
              >
                {sedangProses ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-5 w-5" />
                )}
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {data.akun_wajib.map((a) => (
                <GlassCard key={a.id} className="flex items-center gap-3 p-3">
                  <PlatformIcon platform={a.platform} size={16} denganWadah />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-teks-utama">@{a.username}</p>
                    <p className="text-[10.5px] text-teks-sekunder">{a.platform}</p>
                  </div>
                  {!a.aktif && <StatusBadge label="nonaktif" warna="netral" />}
                  <button
                    type="button"
                    disabled={sedangProses}
                    onClick={() =>
                      void jalankan(
                        "hapus_akun_wajib",
                        { id: a.id },
                        `@${a.username} dihapus dari akun wajib`,
                      )
                    }
                    aria-label={`Hapus @${a.username}`}
                    className="btn-tekan p-1.5 text-gagal disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </GlassCard>
              ))}
            </div>
          </FadeInUp>

          {/* 3. Log galat */}
          <FadeInUp delay={0.12}>
            <div className="mt-6 flex items-center justify-between">
              <SectionTitle judul="Log Galat Aplikasi" className="!mt-0" />
              {data.log.length > 0 && (
                <button
                  type="button"
                  disabled={sedangProses}
                  onClick={() => void jalankan("bersihkan_log", {}, "Log dibersihkan")}
                  className="btn-tekan rounded-full border border-gagal/40 bg-gagal/5 px-3 py-1.5 text-[11px] font-semibold text-gagal disabled:opacity-50"
                >
                  Bersihkan
                </button>
              )}
            </div>
            {data.log.length === 0 ? (
              <GlassCard className="p-4">
                <p className="text-center text-xs text-teks-sekunder">
                  Tidak ada galat tercatat. Aplikasi berjalan bersih.
                </p>
              </GlassCard>
            ) : (
              <div className="flex flex-col gap-2">
                {data.log.map((l) => (
                  <GlassCard key={l.id} className="p-3">
                    <div className="flex items-start gap-2">
                      <Bug className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gagal" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11.5px] leading-snug break-words text-teks-utama">
                          {l.pesan}
                        </p>
                        <p className="mt-1 text-[10px] text-teks-sekunder">
                          {tanggalIndonesia(l.waktu)} {jamWIB(l.waktu)}
                          {l.versi ? ` · v${l.versi}` : ""}
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            )}
          </FadeInUp>

          {/* 4. Latih Asisten AI (fitur 1.20.2) — khusus master */}
          <FadeInUp delay={0.16}>
            <SeksiLatihAsisten />
          </FadeInUp>

          {/* 5. Basis Pengetahuan AI (fitur 1.20.4) — khusus master */}
          <FadeInUp delay={0.18}>
            <SeksiBasisPengetahuan />
          </FadeInUp>

          {/* 6. Kuota & Penyimpanan (2 Sep 2026) — pantauan pemakaian
              Supabase / Cloudinary / upload-post dalam satu layar. */}
          <FadeInUp delay={0.2}>
            <SeksiKuota />
          </FadeInUp>
        </>
      )}

      {/* Modal pilih peran istimewa */}
      <AnimatePresence>
        {pilihPeranUntuk && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-6 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPilihPeranUntuk(null)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Pilih peran istimewa"
              className="glass-strong w-full max-w-[340px] rounded-2xl p-5"
              initial={{ scale: 0.92, opacity: 0, y: 14 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 10 }}
              transition={{ type: "spring", stiffness: 360, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-heading text-base font-bold text-teks-utama">
                Peran untuk {pilihPeranUntuk.nama.split(" ")[0]}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-teks-sekunder">
                Mengubah peran otomatis mengeluarkan yang bersangkutan dari semua
                perangkat, supaya akses lamanya tidak terbawa.
              </p>
              <div className="mt-3.5 flex flex-col gap-2">
                {PERAN_PILIHAN.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={sedangProses}
                    onClick={() =>
                      void jalankan(
                        "beri_peran_khusus",
                        { user_id: pilihPeranUntuk.id, role: p.id },
                        `${pilihPeranUntuk.nama} kini ${p.label}`,
                      )
                    }
                    className={cn(
                      "glass-soft btn-tekan flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left disabled:opacity-50",
                      pilihPeranUntuk.role === p.id && "ring-2 ring-pri/60",
                    )}
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: `${p.warna}1A`, color: p.warna }}
                    >
                      <ShieldCheck className="h-4.5 w-4.5" />
                    </span>
                    <span className="flex-1 text-sm font-bold text-teks-utama">{p.label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal reset sandi (spek 1.15): sandi TIDAK BISA dibaca siapa
          pun (hash satu-arah) — master hanya bisa MENGGANTINYA. */}
      {resetUntuk && (
        <ModalResetSandi
          target={resetUntuk}
          sedang={sedangProses}
          onTutup={() => setResetUntuk(null)}
          onKirim={(sandiBaru) =>
            void jalankan(
              "reset_sandi",
              { user_id: resetUntuk.id, nilai: sandiBaru },
              `Sandi ${resetUntuk.nama.split(" ")[0]} diganti — semua sesinya dicabut`,
            ).then(() => setResetUntuk(null))
          }
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// ModalResetSandi — master mengganti sandi satu akun. Sandi lama
// mustahil ditampilkan (hash satu-arah); yang ada hanya penggantian.
// ------------------------------------------------------------

function ModalResetSandi({
  target,
  sedang,
  onTutup,
  onKirim,
}: {
  target: PenggunaAdmin;
  sedang: boolean;
  onTutup: () => void;
  onKirim: (sandiBaru: string) => void;
}) {
  const [sandi, setSandi] = useState("");

  function acakSandi() {
    // 10 karakter mudah dibacakan lewat WA/telepon (tanpa 0/O, 1/l).
    const HURUF = "abcdefghjkmnpqrstuvwxyz23456789";
    let hasil = "";
    const acak = new Uint32Array(10);
    crypto.getRandomValues(acak);
    for (const n of acak) hasil += HURUF[n % HURUF.length];
    setSandi(hasil);
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center px-8"
      role="dialog"
      aria-modal="true"
      aria-label={`Reset sandi ${target.nama}`}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onTutup} />
      <div className="glass-strong relative w-full max-w-[320px] rounded-2xl p-5">
        <p className="text-sm font-bold text-teks-utama">Reset sandi {target.nama}</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-teks-sekunder">
          Sandi lama tidak bisa dilihat (tersimpan terenkripsi satu arah).
          Buat sandi baru lalu sampaikan ke orangnya — semua sesi lamanya
          otomatis keluar.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={sandi}
            onChange={(e) => setSandi(e.target.value)}
            placeholder="Sandi baru (min 8)…"
            aria-label="Sandi baru"
            className="glass h-10 min-w-0 flex-1 rounded-xl px-3.5 font-mono text-sm text-teks-utama placeholder:font-sans placeholder:text-teks-sekunder/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={acakSandi}
            aria-label="Buat sandi acak"
            className="glass btn-tekan rounded-xl px-3 text-[11px] font-bold text-teks-utama"
          >
            Acak
          </button>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onTutup}
            className="glass btn-tekan flex-1 rounded-xl py-2.5 text-sm font-semibold text-teks-utama"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={sandi.length < 8 || sedang}
            onClick={() => onKirim(sandi)}
            className="btn-tekan flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            Ganti Sandi
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// GaleriFotoMaster — master menjelajah SEMUA foto unggahan per
// bucket (avatar / absensi / chat / momen), berhalaman, lewat
// signed URL 1 jam (spek 1.15).
// ------------------------------------------------------------

const BUCKET_GALERI = [
  { id: "avatar", label: "Avatar" },
  { id: "absensi", label: "Absensi" },
  { id: "chat", label: "Chat" },
  { id: "momen", label: "Momen" },
] as const;

function GaleriFotoMaster() {
  const [bucket, setBucket] = useState<string>("avatar");
  const [halaman, setHalaman] = useState(1);
  const [hasil, setHasil] = useState<{ total: number; data: FotoMaster[] } | null>(null);
  const [dibuka, setDibuka] = useState<FotoMaster | null>(null);
  const [terbuka, setTerbuka] = useState(false);

  useEffect(() => {
    if (!terbuka) return;
    let hidup = true;
    void (async () => {
      try {
        const r = await getFotoMaster(bucket, halaman);
        if (hidup) setHasil({ total: r.total, data: r.data });
      } catch {
        if (hidup) setHasil({ total: 0, data: [] });
      }
    })();
    return () => {
      hidup = false;
    };
  }, [bucket, halaman, terbuka]);

  return (
    <>
      <SectionTitle judul="Database Foto" className="mt-6" />
      <GlassCard className="p-3">
        {!terbuka ? (
          <button
            type="button"
            onClick={() => setTerbuka(true)}
            className="btn-tekan w-full py-2 text-center text-[12px] font-semibold text-pri"
          >
            Buka penjelajah foto unggahan (avatar, absensi, chat, momen)
          </button>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {BUCKET_GALERI.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setHasil(null); // kosongkan — galeri dimuat ulang
                    setBucket(b.id);
                    setHalaman(1);
                  }}
                  aria-pressed={bucket === b.id}
                  className={cn(
                    "btn-tekan rounded-full px-3 py-1.5 text-[11.5px] font-semibold",
                    bucket === b.id ? "text-white" : "glass-soft text-teks-sekunder",
                  )}
                  style={
                    bucket === b.id
                      ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                      : undefined
                  }
                >
                  {b.label}
                </button>
              ))}
            </div>

            {hasil === null ? (
              <GlassSkeleton className="mt-2 h-24 rounded-xl" />
            ) : hasil.data.length === 0 ? (
              <p className="py-5 text-center text-xs text-teks-sekunder">
                Tidak ada foto di bucket ini.
              </p>
            ) : (
              <>
                <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                  {hasil.data.map((f) => (
                    <button
                      key={f.path}
                      type="button"
                      onClick={() => setDibuka(f)}
                      aria-label={`Buka ${f.path}`}
                      className="btn-tekan aspect-square overflow-hidden rounded-lg"
                    >
                      <img
                        src={f.url}
                        alt={f.path}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[10.5px] text-teks-sekunder">
                    {hasil.total} file · hal {halaman}
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={halaman <= 1}
                      onClick={() => {
                        setHasil(null);
                        setHalaman((h) => h - 1);
                      }}
                      className="glass btn-tekan rounded-lg px-2.5 py-1 text-[11px] font-bold text-teks-utama disabled:opacity-40"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      disabled={halaman * 24 >= hasil.total}
                      onClick={() => {
                        setHasil(null);
                        setHalaman((h) => h + 1);
                      }}
                      className="glass btn-tekan rounded-lg px-2.5 py-1 text-[11px] font-bold text-teks-utama disabled:opacity-40"
                    >
                      ›
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </GlassCard>

      {/* Lightbox foto + jalurnya */}
      {dibuka && (
        <div
          className="fixed inset-0 z-[95] flex flex-col items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Foto ukuran penuh"
          onClick={() => setDibuka(null)}
        >
          <img
            src={dibuka.url}
            alt={dibuka.path}
            className="max-h-[80dvh] max-w-full rounded-xl object-contain"
          />
          <p className="mt-2 max-w-full truncate text-[11px] text-white/80">{dibuka.path}</p>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------
// SeksiLatihAsisten (fitur 1.20.2) — master menulis instruksi/
// pengetahuan yang disuntikkan ke SETIAP percakapan Asisten AI
// (teks & suara). Berlaku seketika; setiap simpan tercatat di
// jejak audit.
// ------------------------------------------------------------

function SeksiLatihAsisten() {
  const [instruksi, setInstruksi] = useState("");
  const [maks, setMaks] = useState(6000);
  const [memuat, setMemuat] = useState(true);
  const [menyimpan, setMenyimpan] = useState(false);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getLatihAsisten();
        if (!hidup) return;
        setInstruksi(hasil.instruksi);
        setMaks(hasil.maks);
      } catch (e) {
        if (hidup) toast("error", "Gagal memuat pelatihan", e instanceof Error ? e.message : "");
      } finally {
        if (hidup) setMemuat(false);
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  async function simpan() {
    if (menyimpan) return;
    setMenyimpan(true);
    try {
      await simpanLatihAsisten(instruksi);
      toast("sukses", "Pelatihan tersimpan", "Berlaku seketika di semua percakapan berikutnya.");
    } catch (e) {
      toast("error", "Gagal menyimpan", e instanceof Error ? e.message : "");
    } finally {
      setMenyimpan(false);
    }
  }

  return (
    <>
      <SectionTitle judul="Latih Asisten AI" className="mt-6" />
      <GlassCard className="p-4">
        <div className="flex items-start gap-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
            style={{ background: "linear-gradient(135deg, #8B5CF6, #6D28D9)" }}
            aria-hidden="true"
          >
            <Bot className="h-4.5 w-4.5" />
          </span>
          <p className="text-[11.5px] leading-relaxed text-teks-sekunder">
            Tulis pengetahuan & aturan tambahan untuk asisten — istilah internal
            partai, gaya menjawab, kebijakan, jadwal penting. Berlaku SEKETIKA
            di mode teks & suara untuk semua pengguna. Khusus untuk Anda,
            asisten juga membuka data personal lengkap dan bisa MENGIRIM
            notifikasi, pengumuman, serta chat grup atas perintah Anda — setiap
            aksinya tercatat di jejak audit.
          </p>
        </div>

        {memuat ? (
          <GlassSkeleton className="mt-3 h-32 rounded-xl" />
        ) : (
          <>
            <textarea
              value={instruksi}
              onChange={(e) => setInstruksi(e.target.value.slice(0, maks))}
              rows={7}
              placeholder={
                "Contoh:\n- Panggil pengguna dengan sebutan 'Kader'.\n- KPI video harian standar adalah 5 video.\n- Rapat pleno tiap Senin 09:00 WIB.\n- Jawab selalu ringkas, maksimal 5 kalimat."
              }
              aria-label="Instruksi pelatihan Asisten AI"
              className="glass-input mt-3 w-full rounded-xl px-3 py-2.5 text-[12.5px] leading-relaxed text-teks-utama placeholder:text-teks-sekunder/60"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="angka-tab text-[10.5px] text-teks-sekunder">
                {instruksi.length}/{maks}
              </span>
              <button
                type="button"
                onClick={() => void simpan()}
                disabled={menyimpan}
                className="btn-tekan flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #8B5CF6, #6D28D9)" }}
              >
                {menyimpan && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Simpan Pelatihan
              </button>
            </div>
          </>
        )}
      </GlassCard>
    </>
  );
}

// ------------------------------------------------------------
// SeksiBasisPengetahuan (fitur 1.20.4) — "database besar khusus"
// yang dilihat AI: snapshot terstruktur SELURUH data, disegarkan
// otomatis tiap jam (saat AI membacanya). Master bisa memaksa
// refresh, melihat ringkasan cakupan, dan menulis CATATAN MANUAL
// (fakta tambahan) yang selalu digabung segar.
// ------------------------------------------------------------

function SeksiBasisPengetahuan() {
  const [basis, setBasis] = useState<StatusBasisAI | null>(null);
  const [catatan, setCatatan] = useState("");
  const [memuat, setMemuat] = useState(true);
  const [menyegarkan, setMenyegarkan] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);
  // Bahan belajar TXT (fitur 1.22/4)
  const [mengunggah, setMengunggah] = useState(false);
  const berkasRef = useRef<HTMLInputElement>(null);

  async function muat() {
    try {
      const hasil = await getBasisAI();
      setBasis(hasil);
      setCatatan(hasil.catatan);
    } catch (e) {
      toast("error", "Gagal memuat basis", e instanceof Error ? e.message : "");
    } finally {
      setMemuat(false);
    }
  }

  useEffect(() => {
    let hidup = true;
    void (async () => {
      const hasil = await getBasisAI().catch(() => null);
      if (!hidup) return;
      if (hasil) {
        setBasis(hasil);
        setCatatan(hasil.catatan);
      }
      setMemuat(false);
    })();
    return () => {
      hidup = false;
    };
  }, []);

  async function segarkan() {
    if (menyegarkan) return;
    setMenyegarkan(true);
    try {
      await refreshBasisAI();
      await muat();
      toast("sukses", "Basis pengetahuan disegarkan", "AI kini melihat data terbaru.");
    } catch (e) {
      toast("error", "Gagal menyegarkan", e instanceof Error ? e.message : "");
    } finally {
      setMenyegarkan(false);
    }
  }

  async function simpanCatatan() {
    if (menyimpan) return;
    setMenyimpan(true);
    try {
      await simpanCatatanBasisAI(catatan);
      toast("sukses", "Catatan tersimpan", "Fakta ini kini dilihat AI di setiap percakapan.");
    } catch (e) {
      toast("error", "Gagal menyimpan catatan", e instanceof Error ? e.message : "");
    } finally {
      setMenyimpan(false);
    }
  }

  // Unggah bahan belajar TXT (fitur 1.22/4): baca berkas jadi teks di
  // sisi klien, lalu kirim isinya. Hanya .txt agar isinya pasti teks
  // yang bisa dibaca AI.
  async function unggahBahan(berkas: File | undefined) {
    if (!berkas || mengunggah) return;
    const namaKecil = berkas.name.toLowerCase();
    const tipeOk =
      berkas.type.startsWith("text/") || namaKecil.endsWith(".txt") || namaKecil.endsWith(".md");
    if (!tipeOk) {
      toast("peringatan", "Harus berkas teks", "Unggah berkas .txt (atau .md).");
      return;
    }
    if (berkas.size > 2 * 1024 * 1024) {
      toast("peringatan", "Berkas terlalu besar", "Maksimal 2 MB teks.");
      return;
    }
    setMengunggah(true);
    try {
      const isi = await berkas.text();
      const { dipotong } = await tambahBahanAjarAI(berkas.name, isi);
      toast(
        "sukses",
        "Bahan belajar ditambahkan",
        dipotong
          ? "Berkas panjang — hanya bagian awalnya yang disimpan untuk AI."
          : "AI kini menjadikannya rujukan saat menjawab.",
      );
      await muat();
    } catch (e) {
      toast("error", "Gagal mengunggah", e instanceof Error ? e.message : "");
    } finally {
      setMengunggah(false);
      if (berkasRef.current) berkasRef.current.value = "";
    }
  }

  async function hapusBahan(id: string) {
    try {
      await hapusBahanAjarAI(id);
      await muat();
    } catch (e) {
      toast("error", "Gagal menghapus", e instanceof Error ? e.message : "");
    }
  }

  const cakupan = basis ? Object.keys(basis.konten).filter((k) => k !== "dibuat_pada" && k !== "tanggal") : [];
  const umur = basis?.umur_menit;
  const umurTeks =
    umur == null ? "belum pernah" : umur < 1 ? "baru saja" : umur < 60 ? `${umur} menit lalu` : `${Math.floor(umur / 60)} jam lalu`;

  return (
    <>
      <SectionTitle judul="Basis Pengetahuan AI" className="mt-6" />
      <GlassCard className="p-4">
        <div className="flex items-start gap-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
            style={{ background: "linear-gradient(135deg, #0EA5E9, #0369A1)" }}
            aria-hidden="true"
          >
            <Database className="h-4.5 w-4.5" />
          </span>
          <p className="text-[11.5px] leading-relaxed text-teks-sekunder">
            Satu ringkasan TERSTRUKTUR seluruh data partai (keanggotaan, absensi,
            KPI, kepatuhan, TV Rakyat, koin, rencana, acara, dll) yang dilihat AI
            secara utuh. Disegarkan otomatis tiap jam saat AI membacanya.
          </p>
        </div>

        {memuat ? (
          <GlassSkeleton className="mt-3 h-24 rounded-xl" />
        ) : (
          <>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-black/5 px-3 py-2.5 dark:bg-white/5">
              <div className="min-w-0">
                <p className="text-[12px] font-bold text-teks-utama">
                  {cakupan.length} kategori data
                </p>
                <p className="text-[10.5px] text-teks-sekunder">Diperbarui {umurTeks}</p>
              </div>
              <button
                type="button"
                onClick={() => void segarkan()}
                disabled={menyegarkan}
                className="btn-tekan flex h-9 items-center gap-1.5 rounded-xl px-3 text-[11.5px] font-bold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #0EA5E9, #0369A1)" }}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", menyegarkan && "animate-spin")} aria-hidden="true" />
                Perbarui
              </button>
            </div>

            {cakupan.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {cakupan.map((k) => (
                  <span
                    key={k}
                    className="rounded-full bg-sky-500/12 px-2 py-0.5 text-[9.5px] font-semibold text-sky-600 dark:text-sky-400"
                  >
                    {k}
                  </span>
                ))}
              </div>
            )}

            <p className="mt-4 mb-1.5 text-[11px] font-bold text-teks-utama">
              Catatan / Fakta Tambahan
            </p>
            <textarea
              value={catatan}
              onChange={(e) => setCatatan(e.target.value.slice(0, basis?.maks_catatan ?? 8000))}
              rows={5}
              placeholder={
                "Tulis fakta/pengetahuan yang tidak ada di database, mis:\n- Sekretariat DPP: Jl. Merdeka No. 1, Jakarta.\n- Target rekrutmen kuartal ini: 500 kader.\n- Narahubung media: 0812-xxxx."
              }
              aria-label="Catatan tambahan Basis Pengetahuan"
              className="glass-input w-full rounded-xl px-3 py-2.5 text-[12.5px] leading-relaxed text-teks-utama placeholder:text-teks-sekunder/60"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="angka-tab text-[10.5px] text-teks-sekunder">
                {catatan.length}/{basis?.maks_catatan ?? 8000}
              </span>
              <button
                type="button"
                onClick={() => void simpanCatatan()}
                disabled={menyimpan}
                className="btn-tekan flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #0EA5E9, #0369A1)" }}
              >
                {menyimpan && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Simpan Catatan
              </button>
            </div>

            {/* Bahan belajar TXT (fitur 1.22/4): unggah berkas teks yang
                dijadikan AI rujukan tambahan saat menjawab. */}
            <div className="mt-5 border-t border-glass-border pt-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold text-teks-utama">
                  Bahan Belajar (TXT)
                </p>
                <span className="angka-tab text-[10px] text-teks-sekunder">
                  {basis?.bahan_ajar.length ?? 0}/{basis?.maks_bahan_jumlah ?? 30}
                </span>
              </div>
              <p className="mt-0.5 mb-2 text-[10.5px] leading-relaxed text-teks-sekunder">
                Unggah berkas .txt (mis. panduan, FAQ, materi) — AI membacanya
                sebagai bahan belajar tambahan.
              </p>

              <input
                ref={berkasRef}
                type="file"
                accept=".txt,.md,text/plain"
                onChange={(e) => void unggahBahan(e.target.files?.[0])}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => berkasRef.current?.click()}
                disabled={mengunggah}
                className="glass btn-tekan flex h-10 w-full items-center justify-center gap-2 rounded-xl text-[12.5px] font-bold text-teks-utama disabled:opacity-60"
              >
                {mengunggah ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="h-4 w-4" aria-hidden="true" />
                )}
                Unggah Berkas TXT
              </button>

              {(basis?.bahan_ajar.length ?? 0) > 0 && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {basis!.bahan_ajar.map((b) => (
                    <div
                      key={b.id}
                      className="glass-soft flex items-center gap-2.5 rounded-xl px-3 py-2"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-sky-500" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold text-teks-utama">
                          {b.nama}
                        </p>
                        <p className="angka-tab text-[10px] text-teks-sekunder">
                          {(b.ukuran / 1000).toFixed(1)} rb karakter
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void hapusBahan(b.id)}
                        aria-label={`Hapus ${b.nama}`}
                        className="btn-tekan p-1.5 text-teks-sekunder/70 hover:text-gagal"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </GlassCard>
    </>
  );
}

// ------------------------------------------------------------
// KontrolWajah — akurasi face recognition (31 Agu 2026).
//
// Tiga ambang (disimpan desimal di pengaturan_sistem, tampil PERSEN):
// - wajah_ambang_login : ketat login wajah 1:N (bawaan 85%)
// - wajah_margin       : selisih anti-kembar kandidat 1 vs 2 (bawaan 10%)
// - wajah_ambang       : verifikasi absen 1:1 (bawaan 75%)
// Menaikkan angka = lebih ketat (lebih sulit wajah orang lain lolos).
// ------------------------------------------------------------
function KontrolWajah({
  pengaturan,
  sedangProses,
  onSimpan,
}: {
  pengaturan: Record<string, string>;
  sedangProses: boolean;
  onSimpan: (kunci: string, persen: number) => Promise<void> | void;
}) {
  const BARIS = [
    {
      kunci: "wajah_ambang_login",
      label: "Ketat login wajah",
      ket: "Kemiripan minimal saat masuk pakai wajah (1:N).",
      bawaan: 85,
      min: 50,
      maks: 99,
    },
    {
      kunci: "wajah_margin",
      label: "Jarak anti-mirip",
      ket: "Selisih minimal kandidat teratas vs kedua — penangkal wajah mirip/kembar.",
      bawaan: 10,
      min: 0,
      maks: 50,
    },
    {
      kunci: "wajah_ambang",
      label: "Ketat absen wajah",
      ket: "Kemiripan minimal verifikasi absen (1:1).",
      bawaan: 75,
      min: 50,
      maks: 99,
    },
  ] as const;

  // Nilai tampil: dari pengaturan (desimal) → persen; kosong = bawaan.
  const [nilai, setNilai] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      BARIS.map((b) => {
        const d = Number(pengaturan[b.kunci]);
        return [b.kunci, String(Number.isFinite(d) && d > 0 ? Math.round(d * 100) : b.bawaan)];
      }),
    ),
  );

  return (
    <GlassCard className="mt-4 p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-500/12 text-blue-600 dark:text-blue-400">
          <ScanFace className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-bold text-teks-utama">Akurasi Face Recognition</p>
          <p className="text-[11px] text-teks-sekunder">
            Semakin TINGGI semakin ketat — berlaku seketika tanpa deploy.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2.5">
        {BARIS.map((b) => (
          <div key={b.kunci} className="glass-soft rounded-xl p-2.5">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold text-teks-utama">
                  {b.label}{" "}
                  <span className="font-normal text-teks-sekunder">(bawaan {b.bawaan}%)</span>
                </p>
                <p className="text-[10px] leading-snug text-teks-sekunder">{b.ket}</p>
              </div>
              <input
                type="number"
                min={b.min}
                max={b.maks}
                value={nilai[b.kunci] ?? ""}
                onChange={(e) =>
                  setNilai((lama) => ({ ...lama, [b.kunci]: e.target.value }))
                }
                aria-label={b.label}
                className="glass-input h-9 w-16 shrink-0 rounded-lg text-center text-[13px] font-bold text-teks-utama"
              />
              <span className="text-[11px] text-teks-sekunder">%</span>
              <button
                type="button"
                disabled={sedangProses}
                onClick={() => {
                  const n = Math.round(Number(nilai[b.kunci]));
                  if (!Number.isFinite(n) || n < b.min || n > b.maks) {
                    toast("peringatan", `Nilai harus ${b.min}-${b.maks}%`);
                    return;
                  }
                  void onSimpan(b.kunci, n);
                }}
                className="glass btn-tekan shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-teks-utama disabled:opacity-50"
              >
                Simpan
              </button>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

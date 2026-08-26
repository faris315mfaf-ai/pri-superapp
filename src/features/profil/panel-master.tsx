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

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Bug,
  Crown,
  Loader2,
  LogOut,
  Plus,
  ShieldCheck,
  Trash2,
  UserCog,
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
  getDataMaster,
  getPengguna,
  type DataMaster,
  type PenggunaAdmin,
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
  const [sedangProses, setSedangProses] = useState(false);
  const [pilihPeranUntuk, setPilihPeranUntuk] = useState<PenggunaAdmin | null>(null);
  const [akunBaru, setAkunBaru] = useState("");
  const [platformBaru, setPlatformBaru] = useState<"instagram" | "tiktok">("instagram");

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
  }, [muatUlang]);

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
    </div>
  );
}

"use client";

// ============================================================
// KelolaPenggunaScreen — panel super admin.
//
// Di sinilah pendaftar baru disetujui dan perannya ditetapkan:
// Super Admin, Admin TV Rakyat, atau Admin HR. Selain itu peran
// akun lama bisa diubah dan akun bisa dinonaktifkan.
//
// Semua tindakan diperiksa ulang di server berdasarkan token —
// menyembunyikan tombol di sini bukan pengamanan, hanya kerapian.
// ============================================================

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Check,
  Clock,
  Loader2,
  ShieldCheck,
  Tv,
  UserCog,
  Trash2,
  UserRound,
  UserX,
  Users,
  X,
} from "lucide-react";
import { EmptyState, FadeInUp, GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { GlassCard } from "@/components/glass-card";
import { FotoBulat } from "@/components/foto-bulat";
import { toast } from "@/hooks/use-app-store";
import { getPengguna, ubahPengguna, type PenggunaAdmin } from "@/services";
import { butuhSubDivisi, DIVISI, pilihanSubDivisi } from "@/lib/struktur";
import { JABATAN_PARTAI, KUOTA_JABATAN, jabatanLengkap } from "@/lib/jabatan";
import { cn } from "@/lib/utils";

type Saringan = "menunggu" | "aktif" | "semua";

// Peran yang bisa DIPILIH kini hanya Ketua & Anggota. Peran lama
// (super admin / admin TV / admin HR) tetap TAMPIL untuk akun yang
// sudah memegangnya (PERAN_LAMA), tapi tidak bisa diberikan lagi
// dari panel — sesuai kebijakan: super admin tersembunyi, hanya
// akun-akun lama yang memilikinya.
const PERAN: {
  id: string;
  label: string;
  singkat: string;
  ikon: React.ComponentType<{ className?: string }>;
  warna: string;
}[] = [
  { id: "ketua", label: "Ketua", singkat: "Ketua", ikon: ShieldCheck, warna: "#F59E0B" },
  { id: "anggota", label: "Anggota", singkat: "Anggota", ikon: UserRound, warna: "#3B82F6" },
];

const PERAN_LAMA: typeof PERAN = [
  ...PERAN,
  { id: "super_admin", label: "Super Admin", singkat: "Super", ikon: ShieldCheck, warna: "#DC2626" },
  { id: "admin_tv", label: "Admin TV Rakyat", singkat: "TV", ikon: Tv, warna: "#10B981" },
  { id: "admin_hr", label: "Admin HR", singkat: "HR", ikon: Users, warna: "#F59E0B" },
];

function labelPeran(id: string): string {
  return PERAN_LAMA.find((p) => p.id === id)?.label ?? id;
}

// Daftar jabatan + kuota: src/lib/jabatan.ts (satu sumber dengan API).

export function KelolaPenggunaScreen({ onKembali }: { onKembali: () => void }) {
  const [daftar, setDaftar] = useState<PenggunaAdmin[] | null>(null);
  const [ringkasan, setRingkasan] = useState<Record<string, number>>({});
  const [saringan, setSaringan] = useState<Saringan>("menunggu");
  // Akun yang sedang dibukakan pilihan perannya untuk disetujui
  const [memilihPeran, setMemilihPeran] = useState<PenggunaAdmin | null>(null);
  // Akun yang sedang dipilihkan jabatan struktur partainya
  const [memilihJabatan, setMemilihJabatan] = useState<PenggunaAdmin | null>(null);
  const [sedangProses, setSedangProses] = useState<string | null>(null);
  const [muatUlang, setMuatUlang] = useState(0);
  // Penghapusan tidak bisa dibatalkan, jadi selalu lewat konfirmasi
  const [konfirmasiHapus, setKonfirmasiHapus] = useState<PenggunaAdmin | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getPengguna();
        if (!hidup) return;
        setDaftar(hasil.data);
        setRingkasan(hasil.ringkasan);
      } catch (err) {
        if (!hidup) return;
        setDaftar([]);
        toast(
          "error",
          "Gagal memuat pengguna",
          err instanceof Error ? err.message : "Coba lagi sebentar.",
        );
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muatUlang]);

  const [memilihDivisi, setMemilihDivisi] = useState<PenggunaAdmin | null>(null);

  async function jalankan(
    u: PenggunaAdmin,
    tindakan:
      | "setujui"
      | "tolak"
      | "ubah_peran"
      | "nonaktifkan"
      | "aktifkan"
      | "hapus"
      | "ubah_jabatan",
    role?: string,
    pesanSukses?: string,
    jabatan?: string,
    bidang?: string,
  ) {
    if (sedangProses) return;
    setSedangProses(u.id);
    try {
      await ubahPengguna(u.id, tindakan, role, jabatan, bidang);
      toast("sukses", pesanSukses ?? "Perubahan tersimpan");
      setMemilihPeran(null);
      setMemilihJabatan(null);
      setMuatUlang((n) => n + 1);
    } catch (err) {
      toast(
        "error",
        "Gagal menyimpan",
        err instanceof Error ? err.message : "Coba lagi sebentar.",
      );
    } finally {
      setSedangProses(null);
    }
  }

  const terfilter = (daftar ?? []).filter((u) =>
    saringan === "semua" ? true : u.status === saringan,
  );

  const CHIP: { id: Saringan; label: string; jumlah?: number }[] = [
    { id: "menunggu", label: "Menunggu", jumlah: ringkasan.menunggu },
    { id: "aktif", label: "Aktif", jumlah: ringkasan.aktif },
    { id: "semua", label: "Semua", jumlah: daftar?.length },
  ];

  async function simpanDivisi(
    u: PenggunaAdmin,
    info: { divisi: string; sub_divisi: string; posisi_divisi: string },
  ) {
    if (sedangProses) return;
    setSedangProses(u.id);
    try {
      await ubahPengguna(u.id, "ubah_divisi", undefined, undefined, undefined, info);
      toast(
        "sukses",
        info.divisi
          ? `${u.nama.split(" ")[0]} kini ${info.posisi_divisi === "kepala" ? "Kepala" : "Anggota"} ${info.divisi}`
          : "Divisi dikosongkan",
      );
      setMemilihDivisi(null);
      setMuatUlang((n) => n + 1);
    } catch (err) {
      toast("error", "Gagal menyimpan", err instanceof Error ? err.message : "");
    } finally {
      setSedangProses(null);
    }
  }

  return (
    <div className="kolom-aplikasi px-4 pb-32">
      {/* Kepala */}
      <header className="flex items-center gap-3 pt-5">
        <button
          type="button"
          onClick={onKembali}
          aria-label="Kembali"
          className="glass btn-tekan flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-teks-utama"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="font-heading truncate text-xl font-extrabold tracking-tight text-teks-utama">
            Kelola Pengguna
          </h1>
          <p className="text-xs text-teks-sekunder">
            Setujui pendaftar dan tetapkan perannya
          </p>
        </div>
      </header>

      {/* Saringan */}
      <div className="scrollbar-tipis mt-4 flex gap-2 overflow-x-auto pb-1">
        {CHIP.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setSaringan(c.id)}
            className={cn(
              "btn-tekan shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
              saringan === c.id
                ? "text-white"
                : "glass-soft text-teks-sekunder",
            )}
            style={
              saringan === c.id
                ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                : undefined
            }
          >
            {c.label}
            {typeof c.jumlah === "number" && c.jumlah > 0 && (
              <span className="ml-1.5 opacity-80">{c.jumlah}</span>
            )}
          </button>
        ))}
      </div>

      <GlassCard className="mt-3 p-3">
        {daftar === null ? (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {[0, 1, 2].map((i) => (
              <GlassSkeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : terfilter.length === 0 ? (
          <EmptyState
            ikon={Users}
            judul={
              saringan === "menunggu"
                ? "Tidak ada pendaftar baru"
                : "Tidak ada pengguna"
            }
            keterangan={
              saringan === "menunggu"
                ? "Semua pendaftaran sudah ditindaklanjuti."
                : "Coba pilih saringan lain."
            }
            className="py-8"
          />
        ) : (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 md:items-start">
            {terfilter.map((u, i) => (
              <BarisPengguna
                key={u.id}
                pengguna={u}
                urutan={i}
                sedangProses={sedangProses === u.id}
                onSetujui={() => setMemilihPeran(u)}
                onTolak={() =>
                  void jalankan(u, "tolak", undefined, "Pendaftaran ditolak")
                }
                onUbahPeran={() => setMemilihPeran(u)}
                onUbahJabatan={() => setMemilihJabatan(u)}
                onUbahDivisi={() => setMemilihDivisi(u)}
                onNonaktifkan={() =>
                  void jalankan(u, "nonaktifkan", undefined, "Akun dinonaktifkan")
                }
                onHapus={() => setKonfirmasiHapus(u)}
                onAktifkan={() =>
                  void jalankan(u, "aktifkan", undefined, "Akun diaktifkan")
                }
              />
            ))}
          </div>
        )}
      </GlassCard>

      {/* Konfirmasi hapus keanggotaan */}
      <AnimatePresence>
        {konfirmasiHapus && (
          <KonfirmasiHapus
            pengguna={konfirmasiHapus}
            sedangProses={sedangProses === konfirmasiHapus.id}
            onBatal={() => setKonfirmasiHapus(null)}
            onHapus={() => {
              const u = konfirmasiHapus;
              setKonfirmasiHapus(null);
              void jalankan(u, "hapus", undefined, `${u.nama} dihapus dari keanggotaan`);
            }}
          />
        )}
      </AnimatePresence>

      {/* Pemilih jabatan struktur partai */}
      <AnimatePresence>
        {memilihJabatan && (
          <PilihJabatan
            pengguna={memilihJabatan}
            sedangProses={sedangProses === memilihJabatan.id}
            onTutup={() => setMemilihJabatan(null)}
            onPilih={(jabatan, bidang) =>
              void jalankan(
                memilihJabatan,
                "ubah_jabatan",
                undefined,
                jabatan
                  ? `Jabatan ${memilihJabatan.nama.split(" ")[0]} kini ${jabatanLengkap(jabatan, bidang)}`
                  : "Jabatan dikosongkan",
                jabatan,
                bidang,
              )
            }
          />
        )}
      </AnimatePresence>

      {/* Pemilih divisi + posisi kepala/anggota */}
      <AnimatePresence>
        {memilihDivisi && (
          <PilihDivisi
            pengguna={memilihDivisi}
            sedangProses={sedangProses === memilihDivisi.id}
            onTutup={() => setMemilihDivisi(null)}
            onSimpan={(info) => void simpanDivisi(memilihDivisi, info)}
          />
        )}
      </AnimatePresence>

      {/* Pemilih peran */}
      <AnimatePresence>
        {memilihPeran && (
          <PilihPeran
            pengguna={memilihPeran}
            sedangProses={sedangProses === memilihPeran.id}
            onTutup={() => setMemilihPeran(null)}
            onPilih={(role) =>
              void jalankan(
                memilihPeran,
                memilihPeran.status === "aktif" ? "ubah_peran" : "setujui",
                role,
                memilihPeran.status === "aktif"
                  ? `Peran diubah menjadi ${labelPeran(role)}`
                  : `${memilihPeran.nama} disetujui sebagai ${labelPeran(role)}`,
              )
            }
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ------------------------------------------------------------

function BarisPengguna({
  pengguna: u,
  urutan,
  sedangProses,
  onSetujui,
  onTolak,
  onUbahPeran,
  onUbahJabatan,
  onUbahDivisi,
  onNonaktifkan,
  onAktifkan,
  onHapus,
}: {
  pengguna: PenggunaAdmin;
  urutan: number;
  sedangProses: boolean;
  onSetujui: () => void;
  onTolak: () => void;
  onUbahPeran: () => void;
  onUbahJabatan: () => void;
  onUbahDivisi: () => void;
  onNonaktifkan: () => void;
  onAktifkan: () => void;
  onHapus: () => void;
}) {
  const inisial = (u.nama || "?")
    .split(" ")
    .slice(0, 2)
    .map((k) => k[0])
    .join("")
    .toUpperCase();

  const peran = PERAN_LAMA.find((p) => p.id === u.role);
  const menunggu = u.status === "menunggu";

  return (
    <FadeInUp delay={Math.min(urutan * 0.04, 0.25)}>
      <div className="glass-soft rounded-2xl p-3">
        <div className="flex gap-3">
          {u.avatar_url ? (
            <FotoBulat src={u.avatar_url} ukuran={48} />
          ) : (
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
              style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
            >
              {inisial}
            </span>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="line-clamp-1 min-w-0 flex-1 text-sm font-semibold text-teks-utama">
                {u.nama}
              </p>
              {menunggu ? (
                <StatusBadge label="Menunggu" warna="kuning" className="shrink-0" />
              ) : u.status === "ditolak" ? (
                <StatusBadge label="Ditolak" warna="merah" className="shrink-0" />
              ) : !u.aktif ? (
                <StatusBadge label="Nonaktif" warna="netral" className="shrink-0" />
              ) : (
                <StatusBadge label="Aktif" warna="hijau" className="shrink-0" />
              )}
            </div>

            <p className="mt-0.5 truncate text-[11.5px] text-teks-sekunder">
              {u.nomor_wa ? `+${u.nomor_wa}` : u.email}
              {u.jabatan ? ` · ${jabatanLengkap(u.jabatan, u.bidang_jabatan)}` : ""}
            </p>

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {peran && !menunggu && (
                <span
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10.5px] font-semibold"
                  style={{ background: `${peran.warna}1A`, color: peran.warna }}
                >
                  <peran.ikon className="h-3 w-3" />
                  {peran.label}
                </span>
              )}
              {!u.wa_terverifikasi && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-gagal/10 px-2 py-0.5 text-[10.5px] font-semibold text-gagal">
                  <Clock className="h-3 w-3" />
                  WA belum diverifikasi
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tindakan */}
        <div className="mt-2.5 flex flex-wrap gap-2">
          {sedangProses ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-teks-sekunder">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Menyimpan…
            </span>
          ) : menunggu ? (
            <>
              <button
                type="button"
                onClick={onSetujui}
                className="btn-tekan inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-bold text-white"
                style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
              >
                <Check className="h-4 w-4" />
                Setujui & Beri Peran
              </button>
              <button
                type="button"
                onClick={onTolak}
                className="btn-tekan inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-gagal/40 bg-gagal/5 px-3 text-[12.5px] font-semibold text-gagal"
              >
                <X className="h-4 w-4" />
                Tolak
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onUbahPeran}
                className="glass btn-tekan inline-flex h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-[12.5px] font-semibold text-teks-utama"
              >
                <UserCog className="h-4 w-4" />
                Ubah Peran
              </button>
              <button
                type="button"
                onClick={onUbahJabatan}
                className="glass btn-tekan inline-flex h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-[12.5px] font-semibold text-teks-utama"
              >
                <Briefcase className="h-4 w-4" />
                Jabatan
              </button>
              <button
                type="button"
                onClick={onUbahDivisi}
                className="glass btn-tekan inline-flex h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-[12.5px] font-semibold text-teks-utama"
              >
                <Building2 className="h-4 w-4" />
                Divisi
              </button>
              {u.aktif ? (
                <button
                  type="button"
                  onClick={onNonaktifkan}
                  className="btn-tekan inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-gagal/40 bg-gagal/5 px-3 text-[12.5px] font-semibold text-gagal"
                >
                  <UserX className="h-4 w-4" />
                  Nonaktifkan
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onAktifkan}
                  className="btn-tekan inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-sukses/40 bg-sukses/5 px-3 text-[12.5px] font-semibold text-sukses"
                >
                  <Check className="h-4 w-4" />
                  Aktifkan
                </button>
              )}
              <button
                type="button"
                onClick={onHapus}
                aria-label={`Hapus keanggotaan ${u.nama}`}
                className="btn-tekan inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-gagal/40 bg-gagal/5 px-3 text-[12.5px] font-semibold text-gagal"
              >
                <Trash2 className="h-4 w-4" />
                Hapus
              </button>
            </>
          )}
        </div>
      </div>
    </FadeInUp>
  );
}

// ------------------------------------------------------------

function PilihPeran({
  pengguna,
  sedangProses,
  onPilih,
  onTutup,
}: {
  pengguna: PenggunaAdmin;
  sedangProses: boolean;
  onPilih: (role: string) => void;
  onTutup: () => void;
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
      aria-label="Pilih peran"
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-md" onClick={onTutup} />
      <motion.div
        initial={{ y: "102%" }}
        animate={{ y: 0 }}
        exit={{ y: "102%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        className="glass-strong relative mx-auto w-full max-w-[440px] rounded-t-[2rem] px-5 pt-3 pb-8"
      >
        <div className="mb-3 flex justify-center">
          <span className="h-1.5 w-12 rounded-full bg-teks-sekunder/40" aria-hidden="true" />
        </div>

        <h2 className="font-heading text-lg font-bold text-teks-utama">
          Peran untuk {pengguna.nama.split(" ")[0]}
        </h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-teks-sekunder">
          Peran menentukan modul apa yang bisa dibuka. Bisa diubah kapan saja.
        </p>

        <div className="mt-4 flex flex-col gap-2.5">
          {PERAN.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={sedangProses}
              onClick={() => onPilih(p.id)}
              className={cn(
                "glass-soft btn-tekan flex items-center gap-3 rounded-2xl p-3 text-left disabled:opacity-50",
                pengguna.role === p.id && "ring-2 ring-pri/60",
              )}
            >
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                style={{ background: `${p.warna}1A`, color: p.warna }}
              >
                <p.ikon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-teks-utama">{p.label}</span>
                <span className="block text-[11.5px] leading-snug text-teks-sekunder">
                  {p.id === "super_admin"
                    ? "Akses semua modul dan mengatur pengguna"
                    : p.id === "admin_tv"
                      ? "Modul TV Rakyat: berita & proses video"
                      : p.id === "admin_hr"
                        ? "Modul QC Konten: kepatuhan kader"
                        : "Hanya melihat konten & mengurus profilnya"}
                </span>
              </span>
              {pengguna.role === p.id && (
                <Check className="h-4.5 w-4.5 shrink-0 text-sukses" />
              )}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onTutup}
          disabled={sedangProses}
          className="glass btn-tekan mt-3 w-full rounded-xl py-3 text-sm font-bold text-teks-utama disabled:opacity-50"
        >
          Batal
        </button>
      </motion.div>
    </motion.div>
  );
}

// ------------------------------------------------------------

function KonfirmasiHapus({
  pengguna,
  sedangProses,
  onBatal,
  onHapus,
}: {
  pengguna: PenggunaAdmin;
  sedangProses: boolean;
  onBatal: () => void;
  onHapus: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/55 p-6 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Konfirmasi hapus keanggotaan"
      onClick={onBatal}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 8 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        className="glass-strong w-full max-w-[340px] rounded-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-heading text-base font-bold text-teks-utama">
          Hapus keanggotaan {pengguna.nama.split(" ")[0]}?
        </h3>
        <p className="mt-2 text-[13px] leading-relaxed text-teks-sekunder">
          Akun <span className="font-semibold text-teks-utama">{pengguna.nama}</span>{" "}
          akan dihapus permanen beserta akun media sosial yang didaftarkannya.
          Tindakan ini <span className="font-semibold text-gagal">tidak bisa dibatalkan</span>.
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-teks-sekunder">
          Kalau hanya ingin mencabut akses sementara, pakai
          <span className="font-semibold"> Nonaktifkan</span> — datanya tetap tersimpan.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onBatal}
            disabled={sedangProses}
            className="glass btn-tekan h-11 rounded-xl text-sm font-bold text-teks-utama disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onHapus}
            disabled={sedangProses}
            className="btn-tekan flex h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            {sedangProses ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ya, Hapus"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ------------------------------------------------------------

function PilihDivisi({
  pengguna,
  sedangProses,
  onSimpan,
  onTutup,
}: {
  pengguna: PenggunaAdmin;
  sedangProses: boolean;
  onSimpan: (info: { divisi: string; sub_divisi: string; posisi_divisi: string }) => void;
  onTutup: () => void;
}) {
  const [divisi, setDivisi] = useState(pengguna.divisi ?? "");
  const [sub, setSub] = useState(pengguna.sub_divisi ?? "");
  const [posisi, setPosisi] = useState(pengguna.posisi_divisi === "kepala" ? "kepala" : "anggota");
  const daftarSub = pilihanSubDivisi(divisi);
  const sah = !divisi || !butuhSubDivisi(divisi) || Boolean(sub);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[70] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Atur divisi anggota"
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-md" onClick={onTutup} />
      <motion.div
        initial={{ y: "102%" }}
        animate={{ y: 0 }}
        exit={{ y: "102%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        className="glass-strong relative mx-auto flex max-h-[85dvh] w-full max-w-[440px] flex-col rounded-t-[2rem] px-5 pt-3 pb-8"
      >
        <div className="mb-3 flex shrink-0 justify-center">
          <span className="h-1.5 w-12 rounded-full bg-teks-sekunder/40" aria-hidden="true" />
        </div>

        <h2 className="shrink-0 font-heading text-lg font-bold text-teks-utama">
          Divisi untuk {pengguna.nama.split(" ")[0]}
        </h2>
        <p className="mt-1 shrink-0 text-[12.5px] leading-relaxed text-teks-sekunder">
          Anggota memilih divisinya sendiri saat mendaftar; posisi
          <b> Kepala/Anggota</b> hanya bisa diatur dari sini.
        </p>

        <div className="scrollbar-tipis mt-4 flex flex-col gap-3 overflow-y-auto">
          <select
            value={divisi}
            onChange={(e) => {
              setDivisi(e.target.value);
              setSub("");
            }}
            aria-label="Divisi"
            className="glass-soft h-11 w-full rounded-xl px-3 text-sm text-teks-utama outline-none focus:ring-2 focus:ring-pri/50"
          >
            <option value="">— Tanpa divisi —</option>
            {DIVISI.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {daftarSub.length > 0 && (
            <select
              value={sub}
              onChange={(e) => setSub(e.target.value)}
              aria-label="Sub-divisi"
              className="glass-soft h-11 w-full rounded-xl px-3 text-sm text-teks-utama outline-none focus:ring-2 focus:ring-pri/50"
            >
              <option value="">— Pilih sub-divisi —</option>
              {daftarSub.map((x) => (
                <option key={x.nilai} value={x.nilai}>
                  {x.label}
                </option>
              ))}
            </select>
          )}

          {divisi && (
            <div className="flex gap-2">
              {(["anggota", "kepala"] as const).map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setPosisi(pos)}
                  className={cn(
                    "btn-tekan h-10 flex-1 rounded-xl text-[13px] font-bold",
                    posisi === pos ? "text-white" : "glass text-teks-sekunder",
                  )}
                  style={
                    posisi === pos
                      ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                      : undefined
                  }
                >
                  {pos === "kepala" ? "Kepala Divisi" : "Anggota Divisi"}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            disabled={!sah || sedangProses}
            onClick={() => onSimpan({ divisi, sub_divisi: sub, posisi_divisi: posisi })}
            className="btn-tekan flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            {sedangProses && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Simpan Divisi
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function PilihJabatan({
  pengguna,
  sedangProses,
  onPilih,
  onTutup,
}: {
  pengguna: PenggunaAdmin;
  sedangProses: boolean;
  onPilih: (jabatan: string, bidang?: string) => void;
  onTutup: () => void;
}) {
  const [terpilih, setTerpilih] = useState<string>(pengguna.jabatan || "");
  const [bidang, setBidang] = useState<string>(pengguna.bidang_jabatan ?? "");
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[70] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Pilih jabatan partai"
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-md" onClick={onTutup} />
      <motion.div
        initial={{ y: "102%" }}
        animate={{ y: 0 }}
        exit={{ y: "102%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        className="glass-strong relative mx-auto flex max-h-[85dvh] w-full max-w-[440px] flex-col rounded-t-[2rem] px-5 pt-3 pb-8"
      >
        <div className="mb-3 flex shrink-0 justify-center">
          <span className="h-1.5 w-12 rounded-full bg-teks-sekunder/40" aria-hidden="true" />
        </div>

        <h2 className="shrink-0 font-heading text-lg font-bold text-teks-utama">
          Jabatan untuk {pengguna.nama.split(" ")[0]}
        </h2>
        <p className="mt-1 shrink-0 text-[12.5px] leading-relaxed text-teks-sekunder">
          Pilih jabatan bakunya, lalu tulis bidang spesifiknya bila perlu —
          mis. Kepala Sekretariat <b>Bidang Administrasi</b>.
          Jabatan berkuota tidak bisa dirangkap melebihi batasnya.
        </p>

        <div className="scrollbar-tipis mt-4 flex flex-col gap-2 overflow-y-auto">
          {JABATAN_PARTAI.map((j) => (
            <button
              key={j}
              type="button"
              disabled={sedangProses}
              onClick={() => setTerpilih(j)}
              className={cn(
                "glass-soft btn-tekan flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left disabled:opacity-50",
                terpilih === j && "ring-2 ring-pri/60",
              )}
              aria-pressed={terpilih === j}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "#F59E0B1A", color: "#F59E0B" }}
              >
                <Briefcase className="h-4.5 w-4.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-teks-utama">{j}</span>
                {KUOTA_JABATAN[j] && (
                  <span className="block text-[10px] text-teks-sekunder">
                    {KUOTA_JABATAN[j] === 1
                      ? "hanya 1 orang"
                      : `maksimal ${KUOTA_JABATAN[j]} orang`}
                  </span>
                )}
              </span>
              {terpilih === j && <Check className="h-4 w-4 shrink-0 text-pri" />}
            </button>
          ))}

        </div>

        {/* Bidang spesifik (teks bebas) + tombol aksi */}
        <div className="mt-3 shrink-0">
          <input
            value={bidang}
            onChange={(e) => setBidang(e.target.value)}
            maxLength={120}
            placeholder="Bidang spesifik (opsional) — mis. Bidang Sosial Media"
            className="glass w-full rounded-xl px-3.5 py-2.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
          />
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              disabled={sedangProses || !pengguna.jabatan}
              onClick={() => onPilih("")}
              className="glass btn-tekan flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold text-teks-sekunder disabled:opacity-40"
            >
              <X className="h-3.5 w-3.5" />
              Kosongkan
            </button>
            <button
              type="button"
              disabled={sedangProses || !terpilih}
              onClick={() => onPilih(terpilih, bidang)}
              className="btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 font-heading text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
            >
              <Check className="h-4 w-4" />
              Simpan Jabatan
            </button>
          </div>
        </div>

        {sedangProses && (
          <p className="mt-3 flex shrink-0 items-center justify-center gap-1.5 text-[12px] text-teks-sekunder">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Menyimpan…
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}

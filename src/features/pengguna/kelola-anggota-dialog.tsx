"use client";

// ============================================================
// Dialog kelola anggota — pemilih peran, jabatan, struktur, dan
// konfirmasi hapus.
//
// Dulu bagian dari layar "Kelola Pengguna". Sejak 23 Sep 2026 layar itu
// DIGABUNG ke Database Anggota (tabel-anggota-screen.tsx): satu tempat
// untuk persetujuan pendaftar, peran, jabatan, struktur, zona, dan sandi.
// Berkas ini tinggal menyimpan dialog-dialognya.
//
// Semua tindakan diperiksa ulang di server berdasarkan token —
// menyembunyikan tombol di layar bukan pengamanan, hanya kerapian.
// ============================================================

import { useState } from "react";
import { motion } from "framer-motion";
import { Briefcase, Check, Loader2, Radio, ShieldCheck, Tv, UserRound, Users, X } from "lucide-react";
import type { PenggunaAdmin } from "@/services";
import { butuhSubDivisi, DIVISI_SAYAP } from "@/lib/struktur";
import { PilihStrukturBanyak, type NilaiStruktur } from "./pilih-struktur";
import { JABATAN_TVR_NASIONAL, JABATAN_PARTAI, KUOTA_JABATAN, jabatanLengkap } from "@/lib/jabatan";
import { cn } from "@/lib/utils";

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

export const PERAN_LAMA: typeof PERAN = [
  ...PERAN,
  { id: "super_admin", label: "Super Admin", singkat: "Super", ikon: ShieldCheck, warna: "#DC2626" },
  { id: "admin_tv", label: "Admin TV Rakyat", singkat: "TV", ikon: Tv, warna: "#10B981" },
  { id: "admin_hr", label: "Admin HR", singkat: "HR", ikon: Users, warna: "#F59E0B" },
];

export function labelPeran(id: string): string {
  return PERAN_LAMA.find((p) => p.id === id)?.label ?? id;
}

// Daftar jabatan + kuota: src/lib/jabatan.ts (satu sumber dengan API).

// ------------------------------------------------------------

export function PilihPeran({
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
                        ? "HR Center: kepatuhan kader"
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

export function KonfirmasiHapus({
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

export function PilihDivisi({
  pengguna,
  sedangProses,
  onSimpan,
  onTutup,
}: {
  pengguna: PenggunaAdmin;
  sedangProses: boolean;
  onSimpan: (info: { divisi: string; sub_divisi: string; posisi_divisi: string; jabatan_sayap?: string; struktur_lain?: NilaiStruktur[] }) => void;
  onTutup: () => void;
}) {
  // STRUKTUR GANDA (11 Sep 2026): yang pertama = struktur utama, dan
  // itulah yang tetap mengisi kolom divisi/sub_divisi seperti sebelumnya.
  const [strukturDaftar, setStrukturDaftar] = useState<NilaiStruktur[]>(() => {
    const awal: NilaiStruktur[] = [];
    if ((pengguna.divisi ?? "").trim()) {
      awal.push({
        divisi: pengguna.divisi ?? "",
        sub_divisi: pengguna.sub_divisi ?? "",
        jabatan_sayap: pengguna.jabatan_sayap ?? "",
      });
    }
    for (const x of pengguna.struktur_lain ?? []) {
      awal.push({ divisi: x.divisi, sub_divisi: x.sub_divisi, jabatan_sayap: x.jabatan_sayap ?? "" });
    }
    return awal;
  });
  const [posisi, setPosisi] = useState(pengguna.posisi_divisi === "kepala" ? "kepala" : "anggota");
  const utama = strukturDaftar[0];
  const divisi = utama?.divisi ?? "";
  const sub = utama?.sub_divisi ?? "";
  const jabatanSayap = utama?.jabatan_sayap ?? "";
  const diSayap = divisi === DIVISI_SAYAP;
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
          Struktur untuk {pengguna.nama.split(" ")[0]}
        </h2>
        <p className="mt-1 shrink-0 text-[12.5px] leading-relaxed text-teks-sekunder">
          Pilih <b>Zona</b>, <b>Sayap</b>, atau <b>Divisi</b>, lalu isinya. Posisi
          <b> Kepala/Anggota</b> hanya bisa diatur dari sini. Sayap baru bisa
          ditambahkan langsung (Divisi HR, superadmin, master).
        </p>
        <div className="scrollbar-tipis mt-4 flex flex-col gap-3 overflow-y-auto">
          {/* 10 Sep 2026: pemilih dua langkah Zona · Sayap · Divisi */}
          <PilihStrukturBanyak
            daftar={strukturDaftar}
            onUbah={setStrukturDaftar}
            disabled={sedangProses}
            bolehKosong
            bolehJabatanSayap
          />
          {/* Jabatan DPP direset saat masuk sayap — katakan sebelum, bukan
              sesudah, supaya tidak ada jabatan yang hilang mengagetkan. */}
          {diSayap && pengguna.jabatan ? (
            <p className="rounded-xl bg-gagal/10 px-3 py-2 text-[11.5px] leading-relaxed text-gagal">
              Jabatan DPP <b>{jabatanLengkap(pengguna.jabatan, pengguna.bidang_jabatan)}</b> akan
              dikosongkan: anggota Sayap Partai memakai jabatan sayap saja.
            </p>
          ) : null}
          {divisi && !diSayap && (
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
                  {pos === "kepala" ? "Kepala" : "Anggota"}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            disabled={!sah || sedangProses}
            onClick={() =>
              onSimpan({
                divisi,
                sub_divisi: sub,
                posisi_divisi: posisi,
                jabatan_sayap: diSayap ? jabatanSayap : "",
                struktur_lain: strukturDaftar.slice(1),
              })
            }
            className="btn-tekan flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            {sedangProses && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Simpan Struktur
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function PilihJabatan({
  pengguna,
  sedangProses,
  onPilih,
  onTutup,
}: {
  pengguna: PenggunaAdmin;
  sedangProses: boolean;
  onPilih: (jabatan: string, bidang?: string, tvrNasional?: boolean) => void;
  onTutup: () => void;
}) {
  const [terpilih, setTerpilih] = useState<string>(pengguna.jabatan || "");
  const [bidang, setBidang] = useState<string>(pengguna.bidang_jabatan ?? "");
  // Jabatan TV Rakyat Nasional: BERDAMPINGAN, bukan menggantikan —
  // karena itu sakelar sendiri, bukan satu baris lagi di daftar jabatan.
  // Kalau ia ikut daftar, memilihnya berarti melepas jabatan aslinya.
  const [tvrNasional, setTvrNasional] = useState<boolean>(
    (pengguna.jabatan_tvr ?? "") === JABATAN_TVR_NASIONAL,
  );
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

          <button
            type="button"
            disabled={sedangProses}
            onClick={() => setTvrNasional((v) => !v)}
            aria-pressed={tvrNasional}
            className={cn(
              "glass-soft btn-tekan mt-1 flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left disabled:opacity-50",
              tvrNasional && "ring-2 ring-[#7C3AED]/60",
            )}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{ background: "#7C3AED1A", color: "#7C3AED" }}
            >
              <Radio className="h-4.5 w-4.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-teks-utama">
                {JABATAN_TVR_NASIONAL}
              </span>
              <span className="block text-[10px] text-teks-sekunder">
                bisa dirangkap dengan jabatan di atas · membuka modul TV Nasional
              </span>
            </span>
            {tvrNasional && <Check className="h-4 w-4 shrink-0 text-[#7C3AED]" />}
          </button>
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
              disabled={sedangProses || (!pengguna.jabatan && !tvrNasional)}
              onClick={() => onPilih("", "", tvrNasional)}
              className="glass btn-tekan flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold text-teks-sekunder disabled:opacity-40"
            >
              <X className="h-3.5 w-3.5" />
              Kosongkan
            </button>
            <button
              type="button"
              disabled={sedangProses || !terpilih}
              onClick={() => onPilih(terpilih, bidang, tvrNasional)}
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

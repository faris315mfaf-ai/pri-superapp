"use client";

// ============================================================
// AcaraScreen — modul Divisi Acara (spek 1.5): tanggal penting partai.
//
// Semua pengguna bisa MELIHAT daftarnya; menambah/menghapus hanya
// anggota Divisi Acara atau pengurus (dicek ulang di server). Tanggal
// yang ditambahkan otomatis memicu notifikasi ke seluruh pengguna,
// plus pengingat H-1 dan hari-H (dikirim malas dari server).
// ============================================================

import { useEffect, useState } from "react";
import { useVersiSegar } from "@/hooks/use-segar-otomatis";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, CalendarPlus, Loader2, Trash2, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { EmptyState, FadeInUp, GlassSkeleton, SectionTitle, ThemeToggle } from "@/components/pri-ui";
import { TombolLonceng } from "@/components/tombol-lonceng";
import { toast } from "@/hooks/use-app-store";
import { getAcara, hapusAcara, tambahAcara, type AcaraPenting } from "@/services";
import type { User } from "@/types";

function tanggalCantik(iso: string): string {
  return new Date(`${iso}T00:00:00+07:00`).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** "2026-08-30" → sisa hari dari hari ini WIB (0 = hari ini). */
function sisaHari(iso: string): number {
  const hariIni = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  return Math.round((Date.parse(iso) - Date.parse(hariIni)) / 86_400_000);
}

export function AcaraScreen({
  user,
  onBukaNotifikasi,
}: {
  user: User;
  onBukaNotifikasi?: () => void;
}) {
  const [daftar, setDaftar] = useState<AcaraPenting[] | null>(null);
  const [bolehKelola, setBolehKelola] = useState(false);
  const [muatUlang, setMuatUlang] = useState(0);
  const versiSegar = useVersiSegar();
  const [modalTambah, setModalTambah] = useState(false);
  const [sedangHapus, setSedangHapus] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getAcara();
        if (!hidup) return;
        setDaftar(hasil.data);
        setBolehKelola(hasil.boleh_kelola);
      } catch {
        if (hidup) setDaftar([]);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muatUlang, versiSegar]);

  async function hapus(a: AcaraPenting) {
    if (sedangHapus) return;
    setSedangHapus(a.id);
    try {
      await hapusAcara(a.id);
      toast("sukses", "Acara dihapus");
      setMuatUlang((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal menghapus", e instanceof Error ? e.message : "");
    } finally {
      setSedangHapus(null);
    }
  }

  return (
    <div className="kolom-aplikasi px-4 pt-5 pb-32">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
            style={{
              background: "linear-gradient(135deg, #F59E0B, #D97706)",
              boxShadow: "0 10px 24px rgba(245, 158, 11, 0.35)",
            }}
            aria-hidden="true"
          >
            <CalendarDays className="h-5.5 w-5.5" />
          </span>
          <div>
            <h1 className="font-heading text-2xl font-extrabold tracking-tight text-teks-utama">
              Acara
            </h1>
            <p className="text-xs text-teks-sekunder">Tanggal penting partai</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TombolLonceng onBuka={onBukaNotifikasi} />
          <ThemeToggle />
        </div>
      </header>

      <FadeInUp>
        <div className="mt-5 flex items-center justify-between">
          <SectionTitle judul="Acara Mendatang" className="!mt-0" />
          {bolehKelola && (
            <button
              type="button"
              onClick={() => setModalTambah(true)}
              className="btn-tekan flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold text-white"
              style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)" }}
            >
              <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
              Tambah
            </button>
          )}
        </div>

        {daftar === null ? (
          <GlassSkeleton className="mt-2 h-24 rounded-2xl" />
        ) : daftar.length === 0 ? (
          <GlassCard className="mt-2 p-1">
            <EmptyState
              ikon={CalendarDays}
              judul="Belum Ada Acara"
              keterangan={
                bolehKelola
                  ? "Tambahkan tanggal penting partai — seluruh pengguna otomatis diberi tahu."
                  : "Tanggal penting partai akan tampil di sini."
              }
              labelAksi={bolehKelola ? "Tambah Acara" : undefined}
              onAksi={bolehKelola ? () => setModalTambah(true) : undefined}
              className="py-8"
            />
          </GlassCard>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {daftar.map((a) => {
              const sisa = sisaHari(a.tanggal);
              return (
                <GlassCard key={a.id} className="flex items-start gap-3 p-3.5">
                  <div
                    className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl text-white"
                    style={{
                      background:
                        sisa <= 1
                          ? "linear-gradient(135deg, #DC2626, #B91C1C)"
                          : "linear-gradient(135deg, #F59E0B, #D97706)",
                    }}
                  >
                    <span className="angka-tab font-heading text-lg leading-none font-extrabold">
                      {new Date(`${a.tanggal}T00:00:00+07:00`).getDate()}
                    </span>
                    <span className="text-[9px] font-semibold uppercase">
                      {new Date(`${a.tanggal}T00:00:00+07:00`).toLocaleDateString("id-ID", {
                        month: "short",
                      })}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-teks-utama">{a.judul}</p>
                    <p className="mt-0.5 text-[11px] text-teks-sekunder">
                      {tanggalCantik(a.tanggal)}
                      {sisa === 0 ? " · HARI INI" : sisa === 1 ? " · besok" : ` · ${sisa} hari lagi`}
                    </p>
                    {a.keterangan && (
                      <p className="mt-1 text-[12px] leading-relaxed text-teks-sekunder">
                        {a.keterangan}
                      </p>
                    )}
                  </div>
                  {(bolehKelola || a.dibuat_oleh === user.id) && (
                    <button
                      type="button"
                      disabled={sedangHapus === a.id}
                      onClick={() => void hapus(a)}
                      aria-label={`Hapus ${a.judul}`}
                      className="btn-tekan shrink-0 p-1.5 text-teks-sekunder/70 disabled:opacity-50"
                    >
                      {sedangHapus === a.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </GlassCard>
              );
            })}
          </div>
        )}
      </FadeInUp>

      <AnimatePresence>
        {modalTambah && (
          <ModalTambahAcara
            onTutup={() => setModalTambah(false)}
            onTersimpan={() => {
              setModalTambah(false);
              setMuatUlang((n) => n + 1);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ModalTambahAcara({
  onTutup,
  onTersimpan,
}: {
  onTutup: () => void;
  onTersimpan: () => void;
}) {
  const [judul, setJudul] = useState("");
  const [tanggal, setTanggal] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [sedangKirim, setSedangKirim] = useState(false);

  const sah = judul.trim().length >= 3 && /^\d{4}-\d{2}-\d{2}$/.test(tanggal);

  async function simpan() {
    if (!sah || sedangKirim) return;
    setSedangKirim(true);
    try {
      await tambahAcara(judul.trim(), tanggal, keterangan.trim());
      toast("sukses", "Acara tersimpan", "Seluruh pengguna sudah diberi tahu.");
      onTersimpan();
    } catch (e) {
      toast("error", "Gagal menyimpan acara", e instanceof Error ? e.message : "");
    } finally {
      setSedangKirim(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-6 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onTutup}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Tambah acara penting"
        className="glass-strong w-full max-w-[340px] rounded-2xl p-5"
        initial={{ scale: 0.92, opacity: 0, y: 14 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: 10 }}
        transition={{ type: "spring", stiffness: 360, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-base font-bold text-teks-utama">Tambah Acara</h3>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            className="btn-tekan p-1 text-teks-sekunder"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <input
          value={judul}
          onChange={(e) => setJudul(e.target.value.slice(0, 120))}
          placeholder="Nama acara (mis. Rakernas PRI)"
          className="glass mt-3.5 w-full rounded-xl px-3.5 py-2.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
        />
        <input
          type="date"
          value={tanggal}
          onChange={(e) => setTanggal(e.target.value)}
          aria-label="Tanggal acara"
          className="glass mt-2 w-full rounded-xl px-3.5 py-2.5 text-sm text-teks-utama focus:outline-none"
        />
        <textarea
          value={keterangan}
          onChange={(e) => setKeterangan(e.target.value.slice(0, 500))}
          placeholder="Keterangan singkat (opsional)…"
          rows={2}
          className="glass mt-2 w-full resize-none rounded-xl px-3.5 py-2.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
        />
        <div className="mt-4 flex gap-2.5">
          <button
            type="button"
            onClick={onTutup}
            className="glass btn-tekan flex-1 rounded-xl py-2.5 text-sm font-semibold text-teks-utama"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => void simpan()}
            disabled={!sah || sedangKirim}
            className="btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 font-heading text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)" }}
          >
            {sedangKirim ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
            )}
            Simpan
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

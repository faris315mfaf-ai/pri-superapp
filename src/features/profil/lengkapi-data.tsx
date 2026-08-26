"use client";

// ============================================================
// KartuLengkapiData — ajakan bagi ANGGOTA LAMA (terdaftar sebelum
// v1.12) untuk melengkapi data barunya: nama panggilan & tanggal
// lahir. Pendaftar baru mengisinya saat registrasi, jadi kartu ini
// hilang sendiri begitu datanya lengkap.
//
// Aturan 1.14 (spek 1.2):
// - Tanggal lahir hanya bisa diisi SEKALI (wajib sesuai KTP, usia
//   minimal 16) — setelahnya terkunci, koreksi lewat HR/master.
// - DIVISI tidak lagi diisi sendiri: ketua divisi/HR/master yang
//   menetapkan lewat Kelola Pengguna, jadi kolomnya dihapus dari sini.
// ============================================================

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Sparkles, X } from "lucide-react";
import { toast, useAppStore } from "@/hooks/use-app-store";
import { ubahProfilSaya } from "@/services";
import type { User } from "@/types";

export function KartuLengkapiData({ user }: { user: User }) {
  const kurangPanggilan = !(user.nama_panggilan ?? "").trim();
  const kurangLahir = !user.tanggal_lahir;
  const perlu = kurangPanggilan || kurangLahir;

  const [buka, setBuka] = useState(false);
  const [panggilan, setPanggilan] = useState(user.nama_panggilan ?? "");
  const [tanggalLahir, setTanggalLahir] = useState(user.tanggal_lahir ?? "");
  const [memuat, setMemuat] = useState(false);
  const setUser = useAppStore((s) => s.setUser);

  if (!perlu) return null;

  const sah =
    (!kurangPanggilan || panggilan.trim().length >= 2) &&
    (!kurangLahir || Boolean(tanggalLahir));

  async function simpan() {
    if (memuat || !sah) return;
    setMemuat(true);
    try {
      // Hanya kirim kolom yang memang boleh diisi sendiri — divisi
      // ditetapkan ketua divisi/HR (server menolak bila dikirim).
      const segar = await ubahProfilSaya({
        ...(panggilan.trim() ? { nama_panggilan: panggilan.trim() } : {}),
        ...(kurangLahir && tanggalLahir ? { tanggal_lahir: tanggalLahir } : {}),
      });
      setUser(segar);
      toast("sukses", "Data profil lengkap", "Terima kasih sudah melengkapi!");
      setBuka(false);
    } catch (e) {
      toast("error", "Gagal menyimpan", e instanceof Error ? e.message : "");
    } finally {
      setMemuat(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setBuka(true)}
        className="btn-tekan mt-4 flex w-full items-center gap-3 rounded-2xl border border-emas/40 bg-emas/10 px-4 py-3 text-left"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)" }}
          aria-hidden="true"
        >
          <Sparkles className="h-4.5 w-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-teks-utama">Lengkapi Data Profil</span>
          <span className="mt-0.5 block text-[11px] leading-snug text-teks-sekunder">
            Isi{" "}
            {[kurangPanggilan ? "nama panggilan" : "", kurangLahir ? "tanggal lahir" : ""]
              .filter(Boolean)
              .join(" dan ")}{" "}
            — sekali saja, untuk struktur baru & fitur ulang tahun.
          </span>
        </span>
      </button>

      <AnimatePresence>
        {buka && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 backdrop-blur-md sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-label="Lengkapi data profil"
            onClick={() => !memuat && setBuka(false)}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="glass-strong w-full max-w-[420px] rounded-t-3xl p-5 sm:rounded-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <p className="font-heading text-base font-bold text-teks-utama">
                  Lengkapi Data Profil
                </p>
                <button
                  type="button"
                  onClick={() => setBuka(false)}
                  aria-label="Tutup"
                  className="btn-tekan text-teks-sekunder"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 flex flex-col gap-3">
                <div>
                  <label htmlFor="ld-panggilan" className="mb-1 block text-[12px] font-semibold text-teks-sekunder">
                    Nama Panggilan
                  </label>
                  <input
                    id="ld-panggilan"
                    value={panggilan}
                    onChange={(e) => setPanggilan(e.target.value)}
                    maxLength={30}
                    placeholder="mis. Budi"
                    className="glass-soft h-11 w-full rounded-xl px-3.5 text-sm text-teks-utama outline-none focus:ring-2 focus:ring-pri/50"
                  />
                  <p className="mt-1 text-[10.5px] text-teks-sekunder/80">
                    Bisa diganti lagi nanti, maksimal 1x per minggu.
                  </p>
                </div>
                {kurangLahir && (
                  <div>
                    <label htmlFor="ld-lahir" className="mb-1 block text-[12px] font-semibold text-teks-sekunder">
                      Tanggal Lahir
                    </label>
                    <input
                      id="ld-lahir"
                      type="date"
                      value={tanggalLahir}
                      onChange={(e) => setTanggalLahir(e.target.value)}
                      className="glass-soft h-11 w-full rounded-xl px-3.5 text-sm text-teks-utama outline-none focus:ring-2 focus:ring-pri/50"
                    />
                    <p className="mt-1 text-[10.5px] text-teks-sekunder/80">
                      Wajib sesuai KTP (usia minimal 16). Hanya bisa diisi
                      SEKALI — setelahnya terkunci.
                    </p>
                  </div>
                )}
                <p className="rounded-xl bg-pri/5 px-3 py-2 text-[11px] leading-relaxed text-teks-sekunder">
                  Divisi Anda ditetapkan oleh ketua divisi atau HR — tidak
                  perlu diisi di sini.
                </p>

                <button
                  type="button"
                  onClick={() => void simpan()}
                  disabled={!sah || memuat}
                  className="btn-tekan mt-1 flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
                >
                  {memuat && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Simpan
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

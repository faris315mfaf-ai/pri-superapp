"use client";

// ============================================================
// KartuLengkapiData — ajakan bagi ANGGOTA LAMA (terdaftar sebelum
// v1.12) untuk melengkapi data barunya: nama panggilan, tanggal
// lahir, dan divisi. Pendaftar baru mengisinya saat registrasi,
// jadi kartu ini hilang sendiri begitu datanya lengkap.
// ============================================================

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Sparkles, X } from "lucide-react";
import { toast, useAppStore } from "@/hooks/use-app-store";
import { ubahProfilSaya } from "@/services";
import { butuhSubDivisi, DIVISI, pilihanSubDivisi } from "@/lib/struktur";
import type { User } from "@/types";

export function KartuLengkapiData({ user }: { user: User }) {
  const kurangPanggilan = !(user.nama_panggilan ?? "").trim();
  const kurangLahir = !user.tanggal_lahir;
  const kurangDivisi = !(user.divisi ?? "").trim();
  const perlu = kurangPanggilan || kurangLahir || kurangDivisi;

  const [buka, setBuka] = useState(false);
  const [panggilan, setPanggilan] = useState(user.nama_panggilan ?? "");
  const [tanggalLahir, setTanggalLahir] = useState(user.tanggal_lahir ?? "");
  const [divisi, setDivisi] = useState(user.divisi ?? "");
  const [subDivisi, setSubDivisi] = useState(user.sub_divisi ?? "");
  const [memuat, setMemuat] = useState(false);
  const setUser = useAppStore((s) => s.setUser);

  if (!perlu) return null;

  const daftarSub = pilihanSubDivisi(divisi);
  const sah =
    panggilan.trim().length >= 2 &&
    Boolean(tanggalLahir) &&
    Boolean(divisi) &&
    (!butuhSubDivisi(divisi) || Boolean(subDivisi));

  async function simpan() {
    if (memuat || !sah) return;
    setMemuat(true);
    try {
      const segar = await ubahProfilSaya({
        nama_panggilan: panggilan.trim(),
        tanggal_lahir: tanggalLahir,
        divisi,
        sub_divisi: subDivisi,
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
            {[
              kurangPanggilan ? "nama panggilan" : "",
              kurangLahir ? "tanggal lahir" : "",
              kurangDivisi ? "divisi" : "",
            ]
              .filter(Boolean)
              .join(", ")}{" "}
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
                </div>
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
                </div>
                <div>
                  <label htmlFor="ld-divisi" className="mb-1 block text-[12px] font-semibold text-teks-sekunder">
                    Divisi
                  </label>
                  <select
                    id="ld-divisi"
                    value={divisi}
                    onChange={(e) => {
                      setDivisi(e.target.value);
                      setSubDivisi("");
                    }}
                    className="glass-soft h-11 w-full rounded-xl px-3 text-sm text-teks-utama outline-none focus:ring-2 focus:ring-pri/50"
                  >
                    <option value="">— Pilih divisi —</option>
                    {DIVISI.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                {daftarSub.length > 0 && (
                  <div>
                    <label htmlFor="ld-sub" className="mb-1 block text-[12px] font-semibold text-teks-sekunder">
                      {divisi === "Divisi Zona" ? "Zona" : "Sayap Partai"}
                    </label>
                    <select
                      id="ld-sub"
                      value={subDivisi}
                      onChange={(e) => setSubDivisi(e.target.value)}
                      className="glass-soft h-11 w-full rounded-xl px-3 text-sm text-teks-utama outline-none focus:ring-2 focus:ring-pri/50"
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

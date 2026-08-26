"use client";

// ============================================================
// Dua pelengkap profil:
// 1. BarisUkuranTeks — perbesar/perkecil font seluruh aplikasi
//    (mengubah font-size akar; semua ukuran Tailwind berbasis rem
//    ikut menskala). Pilihan tersimpan dan bertahan antar sesi.
// 2. MasukanPengembang — kirim bug/kritik/saran; HANYA sampai ke
//    super admin (developer). Super admin mendapat baris tambahan
//    untuk membaca seluruh masukan.
// ============================================================

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bug, CaseSensitive, Inbox, Loader2, Send } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { toast, useAppStore } from "@/hooks/use-app-store";
import { getMasukan, kirimMasukan, type Masukan } from "@/services";
import { jamWIB, tanggalIndonesia } from "@/lib/format";
import type { User } from "@/types";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------
// Ukuran teks
// ------------------------------------------------------------

export function BarisUkuranTeks() {
  const skalaFont = useAppStore((s) => s.skalaFont);
  const setSkalaFont = useAppStore((s) => s.setSkalaFont);

  return (
    <div className="glass flex min-h-[54px] w-full items-center gap-3 rounded-2xl px-4 py-2.5">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
        style={{
          backgroundColor: "#8B5CF61a",
          borderColor: "#8B5CF638",
          color: "#8B5CF6",
        }}
        aria-hidden="true"
      >
        <CaseSensitive className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0 flex-1 text-sm font-semibold text-teks-utama">
        Ukuran Teks
      </span>
      <div className="flex gap-1">
        {(
          [
            { kunci: "kecil", label: "A", kelas: "text-[11px]" },
            { kunci: "normal", label: "A", kelas: "text-[13px]" },
            { kunci: "besar", label: "A", kelas: "text-[15px]" },
          ] as const
        ).map((u) => (
          <button
            key={u.kunci}
            type="button"
            onClick={() => setSkalaFont(u.kunci)}
            aria-label={`Ukuran teks ${u.kunci}`}
            aria-pressed={skalaFont === u.kunci}
            className={cn(
              "btn-tekan flex h-8 w-8 items-center justify-center rounded-lg font-bold",
              u.kelas,
              skalaFont === u.kunci ? "text-white" : "glass-soft text-teks-sekunder",
            )}
            style={
              skalaFont === u.kunci
                ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                : undefined
            }
          >
            {u.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Masukan pengembang
// ------------------------------------------------------------

export function ModalKirimMasukan({ onTutup }: { onTutup: () => void }) {
  const [jenis, setJenis] = useState<"bug" | "kritik" | "saran">("bug");
  const [isi, setIsi] = useState("");
  const [sedangKirim, setSedangKirim] = useState(false);

  async function kirim() {
    if (isi.trim().length < 5 || sedangKirim) return;
    setSedangKirim(true);
    try {
      await kirimMasukan(jenis, isi.trim());
      toast(
        "sukses",
        "Masukan terkirim",
        "Pesan Anda sampai langsung ke pengembang aplikasi. Terima kasih!",
      );
      onTutup();
    } catch (e) {
      toast("error", "Gagal mengirim", e instanceof Error ? e.message : "");
      setSedangKirim(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-6 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onTutup}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Laporkan bug, kritik, atau saran"
        className="glass-strong w-full max-w-[340px] rounded-2xl p-5"
        initial={{ scale: 0.92, opacity: 0, y: 14 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: 10 }}
        transition={{ type: "spring", stiffness: 360, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-heading text-base font-bold text-teks-utama">
          Laporkan Bug / Kritik / Saran
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-teks-sekunder">
          Pesan ini hanya sampai ke super admin selaku pengembang aplikasi.
        </p>

        <div className="mt-3.5 flex gap-2">
          {(
            [
              { kunci: "bug", label: "🐞 Bug" },
              { kunci: "kritik", label: "Kritik" },
              { kunci: "saran", label: "Saran" },
            ] as const
          ).map((j) => (
            <button
              key={j.kunci}
              type="button"
              onClick={() => setJenis(j.kunci)}
              className={cn(
                "btn-tekan flex-1 rounded-xl py-2 text-xs font-bold",
                jenis === j.kunci ? "text-white" : "glass text-teks-sekunder",
              )}
              style={
                jenis === j.kunci
                  ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                  : undefined
              }
            >
              {j.label}
            </button>
          ))}
        </div>

        <textarea
          value={isi}
          onChange={(e) => setIsi(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder={
            jenis === "bug"
              ? "Ceritakan apa yang rusak dan di layar mana…"
              : "Tulis masukan Anda…"
          }
          className="glass mt-3 w-full resize-none rounded-xl px-3.5 py-2.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
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
            onClick={() => void kirim()}
            disabled={isi.trim().length < 5 || sedangKirim}
            className="btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 font-heading text-sm font-bold text-white disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #DC2626, #B91C1C)",
              boxShadow: "0 8px 20px rgba(220, 38, 38, 0.35)",
            }}
          >
            {sedangKirim ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            Kirim
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Kotak masuk masukan — khusus super admin / master (pengembang). */
export function ModalKotakMasukan({ onTutup }: { onTutup: () => void }) {
  const [daftar, setDaftar] = useState<Masukan[] | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getMasukan();
        if (hidup) setDaftar(hasil);
      } catch {
        if (hidup) setDaftar([]);
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex flex-col justify-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-md" onClick={onTutup} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Kotak masukan pengembang"
        className="glass-strong relative mx-auto flex max-h-[85dvh] w-full max-w-[480px] flex-col rounded-t-[2rem] px-5 pt-3 pb-8"
        initial={{ y: "102%" }}
        animate={{ y: 0 }}
        exit={{ y: "102%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
      >
        <div className="mb-3 flex shrink-0 justify-center">
          <span className="h-1.5 w-12 rounded-full bg-teks-sekunder/40" aria-hidden="true" />
        </div>
        <h2 className="shrink-0 font-heading text-lg font-bold text-teks-utama">
          Kotak Masukan Pengembang
        </h2>
        <div className="scrollbar-tipis mt-3 flex flex-col gap-2 overflow-y-auto">
          {daftar === null ? (
            <GlassSkeleton className="h-20 rounded-2xl" />
          ) : daftar.length === 0 ? (
            <p className="py-8 text-center text-xs text-teks-sekunder">
              Belum ada masukan dari pengguna.
            </p>
          ) : (
            daftar.map((m) => (
              <GlassCard key={m.id} className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-teks-utama">{m.nama}</p>
                  <StatusBadge
                    label={m.jenis}
                    warna={m.jenis === "bug" ? "merah" : m.jenis === "kritik" ? "kuning" : "biru"}
                  />
                </div>
                <p className="mt-1 text-xs leading-relaxed whitespace-pre-wrap text-teks-utama/90">
                  {m.isi}
                </p>
                <p className="mt-1.5 text-[10px] text-teks-sekunder/80">
                  {tanggalIndonesia(m.dibuat_pada)} · {jamWIB(m.dibuat_pada)}
                </p>
              </GlassCard>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ------------------------------------------------------------
// SeksiMasukan — dua baris siap pasang di daftar pengaturan profil
// ------------------------------------------------------------

export function SeksiMasukan({ user }: { user: User }) {
  const [modalKirim, setModalKirim] = useState(false);
  const [modalKotak, setModalKotak] = useState(false);
  const pengembang = user.role === "super_admin" || user.role === "master";

  return (
    <>
      <button
        type="button"
        onClick={() => setModalKirim(true)}
        className="glass btn-tekan flex min-h-[54px] w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
          style={{ backgroundColor: "#EF44441a", borderColor: "#EF444438", color: "#EF4444" }}
          aria-hidden="true"
        >
          <Bug className="h-4.5 w-4.5" />
        </span>
        <span className="min-w-0 flex-1 text-sm font-semibold text-teks-utama">
          Laporkan Bug / Saran
        </span>
      </button>

      {pengembang && (
        <button
          type="button"
          onClick={() => setModalKotak(true)}
          className="glass btn-tekan flex min-h-[54px] w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
            style={{ backgroundColor: "#10B9811a", borderColor: "#10B98138", color: "#10B981" }}
            aria-hidden="true"
          >
            <Inbox className="h-4.5 w-4.5" />
          </span>
          <span className="min-w-0 flex-1 text-sm font-semibold text-teks-utama">
            Kotak Masukan Pengembang
          </span>
        </button>
      )}

      <AnimatePresence>
        {modalKirim && <ModalKirimMasukan onTutup={() => setModalKirim(false)} />}
        {modalKotak && <ModalKotakMasukan onTutup={() => setModalKotak(false)} />}
      </AnimatePresence>
    </>
  );
}

"use client";

// ============================================================
// RangkumanLink (TVR Saya, 3 Sep 2026) — merangkum semua tautan video
// pengguna pada satu tanggal per sosmed ke format laporan WhatsApp:
//   Nama : … / Tanggal : … / INSTAGRAM 1. … 2. … / TIKTOK … / X … / dst.
// + kotak kendala → Generate → teks BISA DIEDIT/DITULIS ULANG (6 Sep 2026)
// → Salin / Bagikan ke WhatsApp (pengguna memilih grup tujuan di aplikasi
// WhatsApp-nya sendiri). Tidak ada pengiriman otomatis lewat bot.
//
// 23 Sep 2026: setelah Generate, tombol bagikan langsung digulir ke depan
// mata; menekan "Bagikan ke WhatsApp" membuka konfirmasi dulu — pengguna
// menyatakan sudah memeriksa semua link. Laporan manual kini langsung
// dihitung tanpa ACC HR, jadi pemeriksaan terakhir ada di tangan pelapor.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CheckSquare, Copy, FileText, Loader2, RefreshCw, Send, ShieldCheck, Sparkles, Square } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { PlatformIcon } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import { useVersiSegar } from "@/hooks/use-segar-otomatis";
import { getRangkumanLink, type RangkumanLink as DataRangkuman } from "@/services";
import { tanggalIndonesia } from "@/lib/format";
import { cn } from "@/lib/utils";

const URUTAN: [string, string][] = [
  ["instagram", "INSTAGRAM"],
  ["tiktok", "TIKTOK"],
  ["twitter", "X"],
  ["facebook", "FACEBOOK"],
  ["youtube", "YOUTUBE"],
  ["threads", "THREADS"],
  ["bilibili", "BILIBILI"],
];
const KENDALA_MAKS = 600;

function tanggalWibPerangkat(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

/** Susun teks laporan persis format yang diminta (baris kosong antar bagian). */
export function susunLaporan(d: DataRangkuman, kendala: string): string {
  const baris: string[] = [`Nama : ${d.nama}`, `Tanggal : ${tanggalIndonesia(`${d.tanggal}T00:00:00+07:00`)}`, ""];
  for (const [kunci, judul] of URUTAN) {
    const daftar = d.per_platform[kunci] ?? [];
    baris.push(judul, "");
    if (daftar.length === 0) baris.push("-");
    else daftar.forEach((u, i) => baris.push(`${i + 1}. ${u}`));
    baris.push("");
  }
  baris.push("KENDALA :", kendala.trim() || "-");
  return baris.join("\n");
}

export function RangkumanLink({ userId, judul }: { /** Rekap anggota lain (admin PALUGODAM, 6 Sep 2026) */ userId?: string; judul?: string } = {}) {
  const [tanggal, setTanggal] = useState(tanggalWibPerangkat);
  const [data, setData] = useState<DataRangkuman | null>(null);
  const [kendala, setKendala] = useState("");
  const [teks, setTeks] = useState("");
  const [konfirmasi, setKonfirmasi] = useState(false);
  // Naik tiap Generate → memicu gulir ke tombol bagikan (lihat efek di bawah).
  const [kaliGenerate, setKaliGenerate] = useState(0);
  const tombolBagikanRef = useRef<HTMLDivElement>(null);
  // "Memuat" diturunkan dari state: data belum ada / masih milik tanggal lain.
  const memuat = data === null || data.tanggal !== tanggal;

  const versiSegar = useVersiSegar();
  useEffect(() => {
    let hidup = true;
    getRangkumanLink(tanggal, userId)
      .then((d) => hidup && setData(d))
      .catch((e) => {
        if (!hidup) return;
        toast("error", "Gagal memuat tautan", e instanceof Error ? e.message : "");
        setData({
          nama: "",
          tanggal,
          per_platform: {
            instagram: [],
            tiktok: [],
            twitter: [],
            facebook: [],
            youtube: [],
            threads: [],
            bilibili: [],
          },
          jumlah: 0,
          menunggu: [],
        });
      });
    return () => {
      hidup = false;
    };
  }, [tanggal, userId, versiSegar]);

  function generate() {
    if (!data) return;
    setTeks(susunLaporan(data, kendala));
    setKaliGenerate((n) => n + 1);
    toast("sukses", "Laporan tersusun", "Periksa, lalu Salin atau Bagikan ke WhatsApp.");
  }

  // Tombol bagikan muncul di bawah teks yang panjang — tanpa digulir,
  // pengguna di ponsel tidak melihat bahwa tombolnya sudah ada.
  useEffect(() => {
    if (kaliGenerate === 0) return;
    const el = tombolBagikanRef.current;
    if (!el) return;
    const halus = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: halus ? "smooth" : "auto", block: "center" });
  }, [kaliGenerate]);

  async function salin() {
    try {
      await navigator.clipboard.writeText(teks);
      toast("sukses", "Laporan disalin");
    } catch {
      toast("peringatan", "Tidak bisa menyalin otomatis", "Blok teksnya lalu salin manual.");
    }
  }

  async function bagikan() {
    if (!teks) return;
    // Tautan resmi WhatsApp tanpa nomor → aplikasi WhatsApp membuka pemilih
    // kontak/grup, pengguna memilih grup tujuannya sendiri.
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(teks)}`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ text: teks });
        return;
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      // jatuh ke tautan WhatsApp
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const jumlah = data?.jumlah ?? 0;

  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-teks-utama">
          <FileText className="h-4 w-4 text-pri" /> {judul ?? "Rangkuman Link Harian"}
        </p>
        <input
          type="date"
          value={tanggal}
          max={tanggalWibPerangkat()}
          onChange={(e) => {
            if (!e.target.value) return;
            setTeks("");
            setTanggal(e.target.value);
          }}
          aria-label="Tanggal laporan"
          className="glass-input h-9 rounded-lg px-2 text-[12px] text-teks-utama"
        />
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-teks-sekunder">
        Semua tautan video {data?.nama ? `akun ${data.nama}` : "Anda"} pada tanggal itu dikumpulkan per sosmed (unggahan lewat aplikasi otomatis tercatat,
        laporan manual langsung ikut), lalu disusun jadi laporan siap kirim ke grup WhatsApp.
      </p>

      {/* Ringkasan per platform */}
      <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
        {URUTAN.map(([kunci, judul]) => {
          const n = data?.per_platform[kunci]?.length ?? 0;
          return (
            <div key={kunci} className={cn("glass-soft flex flex-col items-center rounded-xl py-2", n === 0 && "opacity-60")}>
              <PlatformIcon platform={kunci} size={14} />
              <span className="mt-0.5 text-[9.5px] font-bold text-teks-sekunder">{judul}</span>
              <span className="angka-tab text-[14px] font-extrabold text-teks-utama">{memuat ? "…" : n}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-teks-sekunder">
        {memuat ? "Memuat tautan…" : `${jumlah} tautan tercatat${data?.nama ? ` · ${data.nama}` : ""}`}
      </p>

      <textarea
        value={kendala}
        onChange={(e) => setKendala(e.target.value.slice(0, KENDALA_MAKS))}
        rows={3}
        maxLength={KENDALA_MAKS}
        placeholder="Kendala hari ini (opsional) — mis. akun TikTok kena limit, sinyal lemah…"
        className="glass-input mt-3 w-full rounded-xl px-3 py-2 text-[12.5px] text-teks-utama"
      />
      <button
        type="button"
        onClick={generate}
        disabled={!data || memuat}
        className="btn-tekan mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
        style={{ background: "linear-gradient(135deg, #7C3AED, #4F46E5)" }}
      >
        {memuat ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate laporan
      </button>

      {teks ? (
        <>
          <textarea
            value={teks}
            onChange={(e) => setTeks(e.target.value)}
            rows={Math.min(22, teks.split("\n").length + 1)}
            aria-label="Teks laporan (bisa diedit)"
            spellCheck={false}
            className="glass-input mt-3 w-full rounded-xl px-3 py-2 font-mono text-[11.5px] leading-relaxed whitespace-pre text-teks-utama"
          />
          <p className="mt-1 text-[10.5px] text-teks-sekunder">Teks di atas bisa Anda ubah atau tambah langsung sebelum disalin/dibagikan. Tekan Generate lagi untuk menyusun ulang dari data.</p>
          <motion.div
            key={kaliGenerate}
            ref={tombolBagikanRef}
            className="mt-2 grid scroll-mt-4 grid-cols-2 gap-2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
          >
            <button
              type="button"
              onClick={() => void salin()}
              className="glass btn-tekan flex h-11 items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-bold text-teks-utama"
            >
              <Copy className="h-4 w-4" /> Salin
            </button>
            <button
              type="button"
              onClick={() => setKonfirmasi(true)}
              className="btn-tekan flex h-11 items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-bold text-white"
              style={{ background: "linear-gradient(135deg, #25D366, #128C7E)" }}
            >
              <Send className="h-4 w-4" /> Bagikan ke WhatsApp
            </button>
          </motion.div>
          <p className="mt-1.5 flex items-center gap-1 text-[10.5px] text-teks-sekunder">
            <RefreshCw className="h-3 w-3" /> Setelah menekan Bagikan, pilih grup tujuan di WhatsApp Anda.
          </p>
        </>
      ) : null}
      {/* Portal ke body: GlassCard memakai backdrop-filter, yang membuat
          `position: fixed` di dalamnya menempel ke kartu, bukan ke layar. */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {konfirmasi && (
              <KonfirmasiBagikan
                jumlah={jumlah}
                onBatal={() => setKonfirmasi(false)}
                onYakin={() => {
                  setKonfirmasi(false);
                  // Dipanggil langsung di klik (tanpa await sebelumnya) supaya
                  // izin "gerakan pengguna" untuk navigator.share masih berlaku.
                  void bagikan();
                }}
              />
            )}
          </AnimatePresence>,
          document.body,
        )}
    </GlassCard>
  );
}

// ------------------------------------------------------------
// KonfirmasiBagikan — pernyataan terakhir sebelum laporan dibagikan.
// Centang wajib: tombol bagikan baru aktif setelah pengguna menyatakan
// sudah memeriksa semuanya, bukan sekadar menekan "OK" tanpa membaca.
// ------------------------------------------------------------

function KonfirmasiBagikan({
  jumlah,
  onBatal,
  onYakin,
}: {
  jumlah: number;
  onBatal: () => void;
  onYakin: () => void;
}) {
  const [yakin, setYakin] = useState(false);

  useEffect(() => {
    const tutup = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBatal();
    };
    window.addEventListener("keydown", tutup);
    return () => window.removeEventListener("keydown", tutup);
  }, [onBatal]);

  return (
    <motion.div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-6 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onBatal}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="judul-konfirmasi-bagikan"
        className="glass-strong w-full max-w-[340px] rounded-2xl p-5"
        initial={{ scale: 0.95, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 8 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <h3 id="judul-konfirmasi-bagikan" className="mt-3 font-heading text-base font-bold text-teks-utama">
          Sudah dipastikan benar?
        </h3>
        <p className="mt-1 text-[12px] leading-relaxed text-teks-sekunder">
          Laporan berisi <b className="text-teks-utama">{jumlah} tautan</b> dan langsung terhitung KPI tanpa
          diperiksa HR. Sebelum dibagikan, pastikan:
        </p>
        <ul className="mt-2 flex flex-col gap-1 text-[11.5px] leading-snug text-teks-utama">
          <li>• Setiap link membuka video Anda sendiri.</li>
          <li>• Link berada di bagian sosmed yang benar.</li>
          <li>• Tidak ada link salah, dobel, atau yang terlewat.</li>
          <li>• Nama, tanggal, dan kendala sudah sesuai.</li>
        </ul>
        <button
          type="button"
          role="checkbox"
          aria-checked={yakin}
          onClick={() => setYakin((v) => !v)}
          className="glass-soft btn-tekan mt-3 flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-left"
        >
          {yakin ? (
            <CheckSquare className="mt-px h-4 w-4 shrink-0 text-sukses" aria-hidden="true" />
          ) : (
            <Square className="mt-px h-4 w-4 shrink-0 text-teks-sekunder" aria-hidden="true" />
          )}
          <span className="text-[11.5px] leading-snug font-semibold text-teks-utama">
            Saya sudah memeriksa dan memastikan semua isi laporan ini benar.
          </span>
        </button>
        <div className="mt-4 flex gap-2.5">
          <button
            type="button"
            onClick={onBatal}
            className="glass btn-tekan flex-1 rounded-xl py-2.5 text-[13px] font-semibold text-teks-utama"
          >
            Periksa lagi
          </button>
          <button
            type="button"
            onClick={onYakin}
            disabled={!yakin}
            className="btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold text-white disabled:opacity-45"
            style={{ background: "linear-gradient(135deg, #25D366, #128C7E)" }}
          >
            <Send className="h-4 w-4" aria-hidden="true" /> Bagikan
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

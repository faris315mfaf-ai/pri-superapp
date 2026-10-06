"use client";

// ============================================================
// PanelWaMasuk (7 Okt 2026) — verifikasi WhatsApp ARAH MASUK.
// Pengguna mengetuk tombol → WhatsApp terbuka ke nomor gateway dengan
// pesan berisi kode yang sudah terisi → tekan Kirim → webhook
// (/api/wa/masuk) mencocokkan → panel ini (polling token) lanjut sendiri.
// Tanpa menyalin/mengetik kode. Pasang dengan key={wa.token} supaya
// kode baru memulai panel yang segar.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, MessageCircle, RotateCcw } from "lucide-react";
import { cekOtpWaMasuk, type OtpWaMasuk } from "@/services";

type Status = "menunggu" | "terkonfirmasi" | "kedaluwarsa";

export function PanelWaMasuk({
  wa,
  keterangan,
  onTerkonfirmasi,
  onUlang,
}: {
  wa: OtpWaMasuk;
  /** Kalimat di bawah tombol, mis. "Kirim dari WhatsApp nomor 0812••••123." */
  keterangan: React.ReactNode;
  onTerkonfirmasi: (kode: string) => void;
  onUlang?: () => void;
}) {
  const [status, setStatus] = useState<Status>("menunggu");
  const [dibuka, setDibuka] = useState(false);
  const sudahLapor = useRef(false);
  const laporRef = useRef(onTerkonfirmasi);
  useEffect(() => {
    laporRef.current = onTerkonfirmasi;
  });

  // Polling status: tiap 2,5 dtk + segera saat pengguna kembali dari WhatsApp.
  useEffect(() => {
    let hidup = true;
    let sibuk = false;
    const batas = Date.now() + (wa.berlaku_detik + 15) * 1000;

    async function cek() {
      if (!hidup || sibuk || document.visibilityState === "hidden") return;
      sibuk = true;
      try {
        const s = await cekOtpWaMasuk(wa.token);
        if (!hidup) return;
        if (s.terkonfirmasi) {
          setStatus("terkonfirmasi");
          berhenti();
          if (!sudahLapor.current) {
            sudahLapor.current = true;
            laporRef.current(wa.kode);
          }
        } else if (s.kedaluwarsa || Date.now() > batas) {
          setStatus("kedaluwarsa");
          berhenti();
        }
      } catch {
        // jaringan putus sesaat — coba lagi di putaran berikut
      } finally {
        sibuk = false;
      }
    }

    const id = window.setInterval(() => void cek(), 2500);
    const saatKembali = () => void cek();
    document.addEventListener("visibilitychange", saatKembali);
    window.addEventListener("focus", saatKembali);
    function berhenti() {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", saatKembali);
      window.removeEventListener("focus", saatKembali);
    }
    return () => {
      hidup = false;
      berhenti();
    };
  }, [wa.token, wa.kode, wa.berlaku_detik]);

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-[#25D366]/[0.08] p-3.5 ring-1 ring-[#25D366]/25">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold tracking-[0.06em] text-teks-sekunder uppercase">Kode Anda</span>
        <span className="font-mono text-[22px] font-bold tracking-[0.25em] text-teks-utama">
          {wa.kode.slice(0, 3)} {wa.kode.slice(3)}
        </span>
      </div>

      {status === "terkonfirmasi" ? (
        <p className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#25D366]/15 text-sm font-bold text-[#128C7E] dark:text-[#25D366]">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          WhatsApp terverifikasi
        </p>
      ) : status === "kedaluwarsa" ? (
        <button
          type="button"
          onClick={onUlang}
          disabled={!onUlang}
          className="btn-tekan flex h-12 items-center justify-center gap-2 rounded-xl bg-teks-utama/[0.07] text-sm font-bold text-teks-utama disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Kode kedaluwarsa — minta kode baru
        </button>
      ) : (
        <a
          href={wa.tautan}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setDibuka(true)}
          className="btn-tekan flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-bold text-white shadow-sm"
          style={{ background: "linear-gradient(135deg, #25D366, #128C7E)" }}
        >
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
          {dibuka ? "Buka WhatsApp lagi" : "Verifikasi lewat WhatsApp"}
        </a>
      )}

      {status === "menunggu" && (
        <p className="text-[12px] leading-relaxed text-teks-sekunder">
          {keterangan} Pesan berisi kode sudah terisi — cukup tekan <b>Kirim</b>, lalu kembali ke sini.
          {dibuka && (
            <span className="mt-1.5 flex items-center gap-1.5 font-semibold text-teks-utama">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Menunggu pesan Anda…
            </span>
          )}
        </p>
      )}
    </div>
  );
}

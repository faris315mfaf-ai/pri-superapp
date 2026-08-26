"use client";

// ============================================================
// PagarGalat — pagar pengaman per layar (React Error Boundary).
//
// Pelajaran dari kejadian 25 Agu 2026: page.tsx memasang semua
// layar tab sekaligus agar state-nya terjaga. Konsekuensinya, satu
// galat render di SATU layar (waktu itu: kategori notifikasi tak
// dikenal) menjatuhkan SELURUH aplikasi untuk semua peran — pengguna
// hanya melihat "This page couldn't load" tanpa petunjuk apa pun.
//
// Dengan pagar ini, galat dikurung di layarnya sendiri: tab lain
// tetap hidup, layar yang rusak menampilkan kartu penjelasan +
// tombol muat ulang, dan galatnya dilaporkan ke server supaya
// terlihat dari telemetri (log_klien).
// ============================================================

import React from "react";

type PagarGalatProps = {
  /** Nama layar — ikut terkirim ke telemetri supaya jelas sumbernya */
  nama: string;
  children: React.ReactNode;
};

type PagarGalatState = { rusak: boolean; pesan: string };

export class PagarGalat extends React.Component<PagarGalatProps, PagarGalatState> {
  state: PagarGalatState = { rusak: false, pesan: "" };

  static getDerivedStateFromError(galat: unknown): PagarGalatState {
    return {
      rusak: true,
      pesan: galat instanceof Error ? galat.message : String(galat),
    };
  }

  componentDidCatch(galat: Error, info: React.ErrorInfo) {
    // Laporkan ke telemetri server — tanpa ini, galat yang terkurung
    // pagar justru jadi tak terlihat siapa pun.
    try {
      const isi = JSON.stringify({
        jenis: "layar-" + this.props.nama,
        pesan: String(galat?.message ?? galat).slice(0, 900),
        stack: String(galat?.stack ?? "").slice(0, 2000) + "\n--komponen--" +
          String(info?.componentStack ?? "").slice(0, 1200),
        url: typeof location !== "undefined" ? location.href : "",
        versi: process.env.NEXT_PUBLIC_VERSI_APLIKASI ?? "?",
      });
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/log-klien",
          new Blob([isi], { type: "application/json" }),
        );
      }
    } catch {
      // Pelaporan tidak boleh menimbulkan galat baru.
    }
  }

  render() {
    if (!this.state.rusak) return this.props.children;

    return (
      <div className="kolom-aplikasi px-4 pt-10 pb-32">
        <div className="glass mx-auto max-w-[380px] rounded-2xl p-5 text-center">
          <p className="font-heading text-base font-bold text-teks-utama">
            Layar ini sedang bermasalah
          </p>
          <p className="mt-2 text-xs leading-relaxed text-teks-sekunder">
            Bagian lain aplikasi tetap bisa dipakai. Galatnya sudah
            terlaporkan otomatis ke pengembang.
          </p>
          <p className="mt-2 rounded-lg bg-black/5 px-2 py-1 font-mono text-[10px] break-all text-teks-sekunder dark:bg-white/10">
            {this.state.pesan.slice(0, 140)}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-tekan mt-4 w-full rounded-xl py-2.5 font-heading text-sm font-bold text-white"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            Muat Ulang Aplikasi
          </button>
        </div>
      </div>
    );
  }
}

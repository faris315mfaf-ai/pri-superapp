"use client";

// ============================================================
// KartuKeywordWajib (7 Okt 2026, tata letak master) — Keyword Wajib
// Laporan dinaikkan ke puncak modul TV Rakyat Official sebagai kartu
// utama yang selalu terbuka (bukan seksi lipat di bawah), karena tema
// wajib ini acuan seluruh anggota saat melaporkan video.
// ============================================================

import { Tag } from "lucide-react";
import { KelolaKeywordPanel } from "./kelola-keyword-panel";

export function KartuKeywordWajib() {
  return (
    <section
      id="tv-kelola-keyword"
      className="glass scroll-mt-4 rounded-[24px] p-4 sm:p-5"
      style={{ boxShadow: "inset 0 0 0 1px rgba(255, 159, 10, 0.35), 0 8px 28px rgba(0, 0, 0, 0.1)" }}
    >
      <header className="mb-3 flex items-center gap-3">
        <span
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl text-white"
          style={{
            background: "linear-gradient(135deg, #FF9F0A, #FF453A)",
            boxShadow: "0 8px 20px rgba(255, 69, 58, 0.3)",
          }}
          aria-hidden="true"
        >
          <Tag className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 text-[17px] font-bold tracking-[-0.015em] text-teks-utama">
            Keyword Wajib Laporan
            <span className="rounded-full bg-[#FF9F0A]/20 px-2 py-px text-[10.5px] font-extrabold tracking-[0.02em] text-[#B25000] dark:text-[#FFD60A]">
              PENTING
            </span>
          </h2>
          <p className="mt-0.5 text-xs leading-snug text-teks-sekunder">
            Tema wajib video yang harus diangkat semua anggota
          </p>
        </div>
      </header>
      <KelolaKeywordPanel lebar />
    </section>
  );
}

"use client";

// ============================================================
// LogoPri — lambang resmi Partai Rakyat Indonesia untuk dipakai
// DI DALAM aplikasi (layar masuk, splash, banner notifikasi, modal
// "Tentang Aplikasi"). Menggantikan lingkaran gradien bertuliskan
// teks "PRI" yang dulu dipakai sebagai lambang sementara.
//
// Berkas gambarnya dibuat oleh scripts/buat-ikon-pwa.mjs ke
// public/ikon/logo-app-256.png dengan latar TRANSPARAN.
// ============================================================

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Kenapa memakai berkas 256px untuk semua ukuran?
 * Pemakaian terbesar di aplikasi adalah 80px; pada layar 3x itu setara
 * 240px, jadi 256px sudah tajam. Memuat yang 512px hanya menambah ~230 KB
 * tanpa perbedaan yang terlihat. Berkas 512px disiapkan untuk kebutuhan
 * lain (mis. cetak/bagikan), bukan untuk komponen ini.
 */
const BERKAS_LOGO = "/ikon/logo-app-256.png";

type LogoPriProps = {
  /** Sisi luar lambang dalam piksel (lebar = tinggi). */
  ukuran?: number;
  /** Kelas tambahan; memakai twMerge sehingga alas & bentuk bisa ditimpa. */
  className?: string;
  /**
   * Muat segera dengan prioritas tinggi. Dipakai di layar yang lambangnya
   * harus sudah terlihat pada gambar pertama (layar masuk & splash yang
   * hanya tampil 0,8 detik).
   */
  prioritas?: boolean;
  /**
   * Setel true bila di sebelah lambang SUDAH ada teks "PRI SuperApp" yang
   * terbaca. Pembaca layar akan melewati gambarnya supaya identitas partai
   * tidak dibacakan dua kali. Sengaja default false: bila kelak ada tempat
   * yang memakai lambang tanpa teks pendamping, ia tetap punya alt yang
   * benar tanpa perlu diingat-ingat.
   */
  dekoratif?: boolean;
};

export function LogoPri({
  ukuran = 80,
  className,
  prioritas = false,
  dekoratif = false,
}: LogoPriProps) {
  const [gagalMuat, setGagalMuat] = useState(false);

  // Bayangan merah diskalakan terhadap ukuran supaya "berat" cahayanya
  // terasa sama di 36px maupun 80px. Angka ini sengaja dipilih agar
  // mereproduksi bayangan yang dulu ditulis manual di tiap layar.
  const bayangan = `0 ${Math.round(ukuran * 0.18)}px ${Math.round(ukuran * 0.42)}px rgba(220, 38, 38, 0.35)`;

  // Cadangan: kalau berkas logo gagal dimuat (jaringan mati, cache PWA
  // belum terisi), tampilkan lingkaran gradien bertuliskan "PRI" seperti
  // desain lama — lebih baik daripada kotak kosong.
  if (gagalMuat) {
    return (
      <span
        // <span> bukan gambar, jadi perannya harus dinyatakan sendiri —
        // beda dari <img> yang cukup pakai alt.
        role={dekoratif ? undefined : "img"}
        aria-label={dekoratif ? undefined : "Logo Partai Rakyat Indonesia"}
        aria-hidden={dekoratif || undefined}
        className={cn(
          "font-heading inline-flex shrink-0 items-center justify-center rounded-full font-extrabold tracking-tight text-white",
          className,
        )}
        style={{
          width: ukuran,
          height: ukuran,
          fontSize: Math.max(9, Math.round(ukuran * 0.28)),
          background: "linear-gradient(135deg, #DC2626, #B91C1C)",
          boxShadow: bayangan,
        }}
      >
        PRI
      </span>
    );
  }

  // Lambang digambar 92% dari kotak luar; sisanya jadi pelek putih.
  const sisiGambar = Math.round(ukuran * 0.92);

  /**
   * Alas putih bulat, SELALU tampil di kedua tema — bukan hanya gelap.
   *
   * Alasannya: separuh lingkar bingkai lambang adalah untaian padi yang
   * berwarna HITAM PEKAT di atas latar transparan (terukur: ~25% piksel
   * buram lambang ini nyaris hitam). Di tema gelap (--app-bg #0b1120)
   * untaian itu praktis lenyap, sehingga lambang terlihat pincang —
   * hanya sisi kapas yang putih yang tersisa. Alas putih mengembalikan
   * latar yang memang jadi dasar rancangan lambang ini. Dipasang di kedua
   * tema (bukan cuma dark:) supaya bentuk lambang tidak berubah-ubah
   * saat pengguna menukar tema.
   */
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full bg-white/95",
        className,
      )}
      style={{ width: ukuran, height: ukuran, boxShadow: bayangan }}
    >
      <img
        // alt kosong sudah cukup menandai gambar hiasan; menambah
        // aria-hidden/role di sini justru mubazir.
        alt={dekoratif ? "" : "Logo Partai Rakyat Indonesia"}
        src={BERKAS_LOGO}
        width={sisiGambar}
        height={sisiGambar}
        loading={prioritas ? "eager" : "lazy"}
        fetchPriority={prioritas ? "high" : "auto"}
        decoding="async"
        draggable={false}
        onError={() => setGagalMuat(true)}
        // 92% menyisakan pelek putih tipis supaya ujung daun padi tidak
        // terlihat mentok terpotong di tepi alas.
        className="h-[92%] w-[92%] object-contain select-none"
      />
    </span>
  );
}

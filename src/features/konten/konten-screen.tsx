"use client";

// ============================================================
// KontenScreen — halaman utama anggota biasa (dirombak 2 Sep 2026).
//
// Susunan dari atas:
//   1. BerandaAnggotaPanel — pengumuman + KPI wajib komentar
//      (kartu "Kerja Hari Ini" DISEMBUNYIKAN atas permintaan user).
//   2. KartuVideoBaru — video TV Rakyat terbaru dengan tombol komen/share.
//   3. KartuWajibKomen — postingan wajib dikomentari hari ini (+ tombol
//      refresh sendiri).
//   4. GaleriLingkaran — lingkaran kecil 6x6: TV Rakyat Official + semua
//      akun TV Rakyat anggota; ketuk → pop-up semua video mereka.
//      Ini MENGGANTIKAN tiga kartu akun Instagram lama (dpp.pri,
//      tvrakyat.official, muhammad.nazaruddin_).
//
// Refresh: tombol refresh sistem (kanan atas, dibawa ThemeToggle)
// menaikkan versiSegar → setiap kartu memuat ulang datanya sendiri,
// tanpa memuat ulang layar.
// ============================================================

import { ThemeToggle } from "@/components/pri-ui";
import { KartuVideoBaru } from "@/features/beranda/kartu-video-baru";
import { KartuWajibKomen } from "@/features/konten/kartu-wajib-komen";
import { GaleriLingkaran } from "@/features/konten/galeri-akun";
import { BerandaAnggotaPanel } from "./beranda-anggota";
import { TombolLonceng } from "@/components/tombol-lonceng";
import { bebasKewajiban } from "@/lib/jabatan";
import { useModulAktif } from "@/hooks/use-modul";
import type { User } from "@/types";
import { useRef } from "react";
import { useTataLebar } from "@/hooks/use-tata-lebar";
import { useLebarWadah } from "@/hooks/use-kolom-wadah";
import { cn } from "@/lib/utils";

export function KontenScreen({
  terbenam = false,
  user,
  onBukaLaporanKerja,
  onBukaNotifikasi,
}: {
  /** true = tampil sebagai seksi di Beranda (tanpa header sendiri) */
  terbenam?: boolean;
  user: User;
  onBukaLaporanKerja?: () => void;
  onBukaNotifikasi?: () => void;
}) {
  const komenAktif = useModulAktif("kepatuhan_komen");
  const sapaan = user.nama.split(" ")[0];
  // Tata letak lebar (7 Okt 2026, master; bukan saat tertanam di Beranda):
  // pengumuman/KPI | galeri akun berdampingan, video baru jadi galeri.
  const lebar = useTataLebar() && !terbenam;
  const wadahRef = useRef<HTMLDivElement>(null);
  const lebarWadah = useLebarWadah(wadahRef) ?? 0;

  return (
    <div ref={wadahRef} className={terbenam ? "" : cn("kolom-aplikasi px-4 pb-32", lebar && "kolom-lebar")}>
      {!terbenam && (
        <header className="flex items-start justify-between gap-3 pt-5">
          <div className="min-w-0">
            <p className="text-xs text-teks-sekunder">Selamat datang,</p>
            <h1 className="font-heading truncate text-2xl font-extrabold tracking-tight text-teks-utama">
              {sapaan}
            </h1>
            <p className="mt-0.5 text-xs text-teks-sekunder">Video TV Rakyat & konten resmi partai</p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <TombolLonceng onBuka={onBukaNotifikasi} />
            <ThemeToggle />
          </div>
        </header>
      )}

      <div className={cn(lebar && lebarWadah >= 880 && "grid grid-cols-2 items-start gap-x-4")}>
      <div className="min-w-0">
      {/* Beranda anggota: pengumuman terbaru + KPI wajib komentar */}
      <BerandaAnggotaPanel user={user} onBukaLaporanKerja={onBukaLaporanKerja} />

      {/* Video TV Rakyat terbaru hasil tarikan Ayrshare/upload-post
          (fitur 1.20/5 & 7): bentuk EMBED tanpa judul + jam presisi,
          lengkap dengan kewajiban komen & share. */}
      {!lebar && <KartuVideoBaru />}

      {/* Postingan wajib dikomentari kader hari ini — status DIVERIFIKASI
          dari komentar asli (rekap QC), hasil sinkron otomatis Ayrshare.
          Disembunyikan untuk yang bebas kewajiban (Panel Master, 3 Sep 2026). */}
      {!bebasKewajiban(user) && komenAktif && <KartuWajibKomen />}
      </div>

      <div className="min-w-0">
      {/* Lingkaran akun TV Rakyat (official + anggota) → galeri video */}
      <GaleriLingkaran />
      </div>
      </div>

      {lebar && <KartuVideoBaru lebar />}
    </div>
  );
}

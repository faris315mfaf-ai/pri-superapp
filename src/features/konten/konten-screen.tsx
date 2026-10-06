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
import { GaleriLingkaran, KontenOfficial } from "@/features/konten/galeri-akun";
import { BerandaAnggotaPanel } from "./beranda-anggota";
import { TombolLonceng } from "@/components/tombol-lonceng";
import { bebasKewajiban } from "@/lib/jabatan";
import { useModulAktif } from "@/hooks/use-modul";
import type { User } from "@/types";
import { useRef } from "react";
import { useLebarWadah } from "@/hooks/use-kolom-wadah";
import { FeedVideoTerbaru, RingkasanKonten, useKontenTerbaru } from "./feed-video-terbaru";

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
  // KONTEN LEBIH TERISI (7 Okt 2026, semua pengguna; bukan saat tertanam
  // di Beranda): ringkasan 24 jam + feed "Video terbaru TV Rakyat" dari
  // katalog upload-post, didahului "Konten TV Rakyat Official".
  // Layar lebar (wadah ≥ 900 px): konten resmi + feed di kiri,
  // pengumuman/KPI, wajib komentar & lingkaran akun di kanan. HP: bertumpuk.
  const wadahRef = useRef<HTMLDivElement>(null);
  const lebarWadah = useLebarWadah(wadahRef) ?? 0;
  const duaKolom = !terbenam && lebarWadah >= 900;
  const feed = useKontenTerbaru(!terbenam);
  const wajibKomen = !bebasKewajiban(user) && komenAktif;

  if (terbenam) {
    return (
      <div>
        <BerandaAnggotaPanel user={user} onBukaLaporanKerja={onBukaLaporanKerja} />
        <KartuVideoBaru />
        {wajibKomen && <KartuWajibKomen />}
        <GaleriLingkaran />
      </div>
    );
  }

  const sisi = (
    <>
      {/* Beranda anggota: pengumuman terbaru + KPI wajib komentar */}
      <BerandaAnggotaPanel user={user} onBukaLaporanKerja={onBukaLaporanKerja} />
      {/* Postingan wajib dikomentari kader hari ini (bebas kewajiban: tidak tampil) */}
      {wajibKomen && <KartuWajibKomen />}
      {/* Lingkaran akun TV Rakyat (official + anggota) → galeri video */}
      <GaleriLingkaran />
    </>
  );

  return (
    <div ref={wadahRef} className="kolom-aplikasi kolom-lebar px-4 pb-32">
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

      <div className="mt-4">
        <RingkasanKonten ringkasan={feed.ringkasan} />
      </div>

      {duaKolom ? (
        <div className="mt-1 grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start gap-x-4">
          <div className="flex min-w-0 flex-col gap-3 pt-4">
            {/* Tugas komentar & bagikan video resmi terbaru (bila ada) */}
            <KartuVideoBaru lebar />
            {/* Konten akun resmi selalu tampil — kolom utama tak pernah kosong
                (tugas & pengumuman bisa sama-sama kosong, mis. akun master). */}
            <KontenOfficial />
            <FeedVideoTerbaru feed={feed} />
          </div>
          <div className="min-w-0">{sisi}</div>
        </div>
      ) : (
        <>
          {sisi}
          <KartuVideoBaru />
          <div className="mt-4 flex flex-col gap-3">
            <KontenOfficial />
            <FeedVideoTerbaru feed={feed} />
          </div>
        </>
      )}
    </div>
  );
}

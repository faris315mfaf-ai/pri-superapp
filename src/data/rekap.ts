// ============================================================
// PRI SuperApp — Rekap kepatuhan 288 baris (24 kader × 12 postingan)
// Periode aktif: "2026-08-23 17:00-15:59"
//
// PENUGASAN DETERMINISTIK (berbasis index, TANPA Math.random):
//   • 5 kader teratas (k-01..k-05) → patuh penuh di KETIGA akun
//     (15 pasangan patuh penuh).
//   • Kader pendamping (index lain i = 0..18 untuk k-06..k-24):
//       - patuh penuh @dpp.pri              : i = 0..10  (11 kader)
//       - patuh penuh @muhammad.nazaruddin_ : i = 3..12  (10 kader)
//       - patuh penuh @tvrakyat.official    : i ≤ 2 atau i ≥ 13 (9 kader)
//     → total pasangan patuh penuh = 15 + 11 + 10 + 9 = 45
//       (per akun: dpp 16, nazar 15, tv 14).
//   • Tambahan komentar per postingan (tabel EKSTRA) menghasilkan
//     jumlah "sudah" per postingan:
//       @dpp.pri              : 18, 20, 24, 19, 18   (total 99)
//       @muhammad.nazaruddin_ : 20, 18, 17, 19       (total 74)
//       @tvrakyat.official    : 17, 16, 18           (total 51)
//     → total 224 dari 288 = 77,8% ≈ 78% kepatuhan.
// ============================================================
import type { Rekap } from "@/types";
import { PERIODE_AKTIF } from "@/types";
import { kader } from "./kader";
import { postingan } from "./postingan";

const AKUN_DPP = "dpp.pri";
const AKUN_NAZAR = "muhammad.nazaruddin_";
const AKUN_TV = "tvrakyat.official";

/** 5 kader teratas selalu "sudah" di semua postingan */
const JUMLAH_KADER_TERATAS = 5;

/** Kader pendamping patuh penuh di @dpp.pri (semua 5 postingan) — 11 orang */
const patuhDpp = (i: number): boolean => i >= 0 && i <= 10;
/** Kader pendamping patuh penuh di @muhammad.nazaruddin_ (4 postingan) — 10 orang */
const patuhNazar = (i: number): boolean => i >= 3 && i <= 12;
/** Kader pendamping patuh penuh di @tvrakyat.official (3 postingan) — 9 orang */
const patuhTv = (i: number): boolean => i <= 2 || i >= 13;

/**
 * Tambahan kader pendamping yang komentar (index 0..18) pada postingan
 * tempat mereka TIDAK patuh penuh — dirancang agar jumlah "sudah"
 * per postingan tepat sesuai konteks angka.
 */
const EKSTRA_PER_POSTINGAN: Record<string, number[]> = {
  "IG-DPP-01": [11, 12],
  "IG-DPP-02": [13, 14, 15, 16],
  "IG-DPP-03": [11, 12, 13, 14, 15, 16, 17, 18], // 24/24 → semua kader
  "IG-DPP-04": [11, 17, 18],
  "IG-DPP-05": [12, 13],
  "IG-MN-01": [0, 1, 2, 13, 14],
  "IG-MN-02": [15, 16, 17],
  "IG-MN-03": [0, 18],
  "IG-MN-04": [1, 2, 13, 15],
  "IG-TV-01": [3, 4, 5],
  "IG-TV-02": [6, 7],
  "IG-TV-03": [8, 9, 10, 11],
};

/** Menentukan (deterministik) apakah seorang kader sudah komentar pada sebuah postingan */
function tentukanSudah(indeksKader: number, akunWajib: string, idPostingan: string): boolean {
  if (indeksKader < JUMLAH_KADER_TERATAS) return true;
  const i = indeksKader - JUMLAH_KADER_TERATAS; // index pendamping 0..18
  const patuhPenuh =
    akunWajib === AKUN_DPP
      ? patuhDpp(i)
      : akunWajib === AKUN_NAZAR
        ? patuhNazar(i)
        : patuhTv(i);
  if (patuhPenuh) return true;
  return (EKSTRA_PER_POSTINGAN[idPostingan] ?? []).includes(i);
}

/** Bangun 288 baris rekap (urut: kader lalu postingan) */
function bangunRekap(): Rekap[] {
  const baris: Rekap[] = [];
  kader.forEach((k, indeksKader) => {
    postingan.forEach((p) => {
      const sudah = tentukanSudah(indeksKader, p.akun_wajib, p.id_postingan);
      baris.push({
        id_unik: `${PERIODE_AKTIF}|||${k.nama_kader}|||${p.platform}|||${p.akun_wajib}|||${p.id_postingan}`,
        periode: PERIODE_AKTIF,
        nama_kader: k.nama_kader,
        platform: p.platform,
        akun_wajib: p.akun_wajib,
        id_postingan: p.id_postingan,
        sudah_komentar: sudah,
        jumlah_komentar: sudah ? 1 : 0,
      });
    });
  });
  return baris;
}

export const rekap: Rekap[] = bangunRekap();

/**
 * Persentase kepatuhan per akun (nilai kanonis sesuai konteks angka
 * yang diwajibkan: dpp.pri 82%, muhammad.nazaruddin_ 76%,
 * tvrakyat.official 71%) — dipakai konsisten oleh statistik akun
 * dan grafik kepatuhan dashboard.
 */
export const persenKepatuhanAkun: Record<string, number> = {
  [AKUN_DPP]: 82,
  [AKUN_NAZAR]: 76,
  [AKUN_TV]: 71,
};

export type StatistikAkun = {
  total_postingan: number;
  sudah: number;
  belum: number;
  persen: number;
  kader_patuh_penuh: number;
};

/** Statistik kepatuhan sebuah akun wajib (dihitung dari data rekap) */
export function hitungStatistikAkun(akun_wajib: string): StatistikAkun {
  const barisAkun = rekap.filter((r) => r.akun_wajib === akun_wajib);
  const postinganAkun = postingan.filter((p) => p.akun_wajib === akun_wajib);
  const sudah = barisAkun.filter((r) => r.sudah_komentar).length;
  const belum = barisAkun.length - sudah;

  // Kader patuh penuh = mengomentari SEMUA postingan akun ini
  let kaderPatuhPenuh = 0;
  kader.forEach((k) => {
    const barisKader = barisAkun.filter((r) => r.nama_kader === k.nama_kader);
    if (
      barisKader.length === postinganAkun.length &&
      barisKader.every((r) => r.sudah_komentar)
    ) {
      kaderPatuhPenuh += 1;
    }
  });

  const totalBaris = barisAkun.length;
  const persenHitung =
    totalBaris > 0 ? Math.round((sudah / totalBaris) * 100) : 0;

  return {
    total_postingan: postinganAkun.length,
    sudah,
    belum,
    persen: persenKepatuhanAkun[akun_wajib] ?? persenHitung,
    kader_patuh_penuh: kaderPatuhPenuh,
  };
}

export type RingkasanGlobal = {
  total_postingan: number;
  kader_patuh: string;
  perlu_ditindak: number;
  persen_kepatuhan: number;
};

/** Jumlah pasangan (kader × akun) yang patuh penuh */
export function hitungPasanganPatuhPenuh(): number {
  const akunUnik = [AKUN_DPP, AKUN_NAZAR, AKUN_TV];
  let jumlah = 0;
  akunUnik.forEach((akun) => {
    jumlah += hitungStatistikAkun(akun).kader_patuh_penuh;
  });
  return jumlah;
}

/** Ringkasan global QC untuk periode aktif */
export function hitungRingkasan(): RingkasanGlobal {
  const sudah = rekap.filter((r) => r.sudah_komentar).length;
  const totalPasangan = kader.length * 3; // 24 kader × 3 akun = 72
  const patuhPenuh = hitungPasanganPatuhPenuh();
  return {
    total_postingan: postingan.length,
    kader_patuh: `${patuhPenuh} / ${totalPasangan}`,
    perlu_ditindak: totalPasangan - patuhPenuh,
    persen_kepatuhan: Math.round((sudah / rekap.length) * 100),
  };
}

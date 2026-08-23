// ============================================================
// PRI SuperApp — Roster 24 kader aktif + peringkat dashboard
// ============================================================
import type { Kader } from "@/types";

/** Entri peringkat kader teraktif untuk dashboard */
export type PeringkatItem = {
  id: string;
  nama_kader: string;
  jumlah_komentar: number;
};

export const kader: Kader[] = [
  {
    id: "k-01",
    nama_kader: "Budi Santoso",
    wilayah: "DPC Jakarta Selatan",
    jabatan: "Koordinator Wilayah",
    nomor_wa: "62812514022081",
    ig_username: "budi.santoso79",
    aktif: true,
  },
  {
    id: "k-02",
    nama_kader: "Siti Rahmawati",
    wilayah: "DPC Bandung",
    jabatan: "Sekretaris DPC",
    nomor_wa: "62813771104502",
    ig_username: "siti.rahmawati.id",
    aktif: true,
  },
  {
    id: "k-03",
    nama_kader: "Agus Salim",
    wilayah: "DPC Surabaya",
    jabatan: "Kader Inti",
    nomor_wa: "62852120988713",
    ig_username: "agus.salim83",
    aktif: true,
  },
  {
    id: "k-04",
    nama_kader: "Dewi Lestari",
    wilayah: "DPC Medan",
    jabatan: "Bendahara DPC",
    nomor_wa: "62813761022904",
    ig_username: "dewi.lestari.mdn",
    aktif: true,
  },
  {
    id: "k-05",
    nama_kader: "Rizky Ramadhan",
    wilayah: "DPC Makassar",
    jabatan: "Kader Muda",
    nomor_wa: "62812990455315",
    ig_username: "rizky.rmdn90",
    aktif: true,
  },
  {
    id: "k-06",
    nama_kader: "Hendra Wijaya",
    wilayah: "DPC Semarang",
    jabatan: "Ketua Ranting",
    nomor_wa: "62821335566216",
    ig_username: "hendra.wijaya.smg",
    aktif: true,
  },
  {
    id: "k-07",
    nama_kader: "Ratna Sari",
    wilayah: "DPC Jakarta Timur",
    jabatan: "Kader Inti",
    nomor_wa: "62838410099327",
    ig_username: "ratna.sari.jkt",
    aktif: true,
  },
  {
    id: "k-08",
    nama_kader: "Fajar Nugroho",
    wilayah: "DPC Yogyakarta",
    jabatan: "Kader Muda",
    nomor_wa: "62812770034138",
    ig_username: "fajar.nugroho.yk",
    aktif: true,
  },
  {
    id: "k-09",
    nama_kader: "Indah Permatasari",
    wilayah: "DPC Denpasar",
    jabatan: "Sekretaris Ranting",
    nomor_wa: "62852968812049",
    ig_username: "indah.permatasari.dp",
    aktif: true,
  },
  {
    id: "k-10",
    nama_kader: "Joko Susilo",
    wilayah: "DPC Palembang",
    jabatan: "Koordinator Wilayah",
    nomor_wa: "62813821107410",
    ig_username: "joko.susilo.plm",
    aktif: true,
  },
  {
    id: "k-11",
    nama_kader: "Maya Anggraini",
    wilayah: "DPC Bandung",
    jabatan: "Kader Muda",
    nomor_wa: "62812145576011",
    ig_username: "maya.anggraini.bd",
    aktif: true,
  },
  {
    id: "k-12",
    nama_kader: "Rudi Hartono",
    wilayah: "DPC Medan",
    jabatan: "Ketua Ranting",
    nomor_wa: "62857400992812",
    ig_username: "rudi.hartono.mdn",
    aktif: true,
  },
  {
    id: "k-13",
    nama_kader: "Nurul Aini",
    wilayah: "DPC Surabaya",
    jabatan: "Bendahara DPC",
    nomor_wa: "62813328776523",
    ig_username: "nurul.aini.sby",
    aktif: true,
  },
  {
    id: "k-14",
    nama_kader: "Andi Saputra",
    wilayah: "DPC Makassar",
    jabatan: "Kader Inti",
    nomor_wa: "62821664400934",
    ig_username: "andi.saputra.mks",
    aktif: true,
  },
  {
    id: "k-15",
    nama_kader: "Tri Wahyuni",
    wilayah: "DPC Semarang",
    jabatan: "Kader Muda",
    nomor_wa: "62812903551045",
    ig_username: "tri.wahyuni.smg",
    aktif: true,
  },
  {
    id: "k-16",
    nama_kader: "Bayu Kurniawan",
    wilayah: "DPC Jakarta Selatan",
    jabatan: "Kader Inti",
    nomor_wa: "62838771208056",
    ig_username: "bayu.kurniawan.jsl",
    aktif: true,
  },
  {
    id: "k-17",
    nama_kader: "Yuni Astuti",
    wilayah: "DPC Jakarta Timur",
    jabatan: "Sekretaris Ranting",
    nomor_wa: "62812440997767",
    ig_username: "yuni.astuti.jkt",
    aktif: true,
  },
  {
    id: "k-18",
    nama_kader: "Dedi Kurniawan",
    wilayah: "DPC Yogyakarta",
    jabatan: "Kader Muda",
    nomor_wa: "62852331001178",
    ig_username: "dedi.kurniawan.yk",
    aktif: true,
  },
  {
    id: "k-19",
    nama_kader: "Lina Marlina",
    wilayah: "DPC Denpasar",
    jabatan: "Kader Inti",
    nomor_wa: "62813158904489",
    ig_username: "lina.marlina.dp",
    aktif: true,
  },
  {
    id: "k-20",
    nama_kader: "Eko Prasetyo",
    wilayah: "DPC Palembang",
    jabatan: "Ketua Ranting",
    nomor_wa: "62821887662290",
    ig_username: "eko.prasetyo.plm",
    aktif: true,
  },
  {
    id: "k-21",
    nama_kader: "Fitri Handayani",
    wilayah: "DPC Bandung",
    jabatan: "Bendahara Ranting",
    nomor_wa: "62812009455101",
    ig_username: "fitri.handayani.bd",
    aktif: true,
  },
  {
    id: "k-22",
    nama_kader: "Rina Oktaviani",
    wilayah: "DPC Medan",
    jabatan: "Kader Muda",
    nomor_wa: "62857922003712",
    ig_username: "rina.oktaviani.mdn",
    aktif: true,
  },
  {
    id: "k-23",
    nama_kader: "Galih Pratama",
    wilayah: "DPC Surabaya",
    jabatan: "Kader Muda",
    nomor_wa: "62813447110023",
    ig_username: "galih.pratama.sby",
    aktif: true,
  },
  {
    id: "k-24",
    nama_kader: "Siti Aminah",
    wilayah: "DPC Makassar",
    jabatan: "Sekretaris DPC",
    nomor_wa: "62838395077834",
    ig_username: "siti.aminah.mks",
    aktif: true,
  },
];

/**
 * Peringkat 5 kader teraktif untuk dashboard.
 * Nilai jumlah_komentar mengikuti angka yang diwajibkan spesifikasi
 * (12, 12, 11, 11, 10) — ini ANGKA TAMPILAN leaderboard.
 * Catatan: di data rekap kelima kader ini dipatok patuh penuh di
 * ketiga akun (syarat KONTEKS ANGKA), sehingga baris rekap mereka
 * selalu 12 komentar; gunakan nilai ini apa adanya di UI dashboard.
 */
export const peringkatKader: PeringkatItem[] = [
  { id: "k-01", nama_kader: "Budi Santoso", jumlah_komentar: 12 },
  { id: "k-02", nama_kader: "Siti Rahmawati", jumlah_komentar: 12 },
  { id: "k-03", nama_kader: "Agus Salim", jumlah_komentar: 11 },
  { id: "k-04", nama_kader: "Dewi Lestari", jumlah_komentar: 11 },
  { id: "k-05", nama_kader: "Rizky Ramadhan", jumlah_komentar: 10 },
];

// ============================================================
// PRI SuperApp — Komentar tertangkap per postingan
// Komentar kader SELALU selaras dengan data rekap (kader dengan
// sudah_komentar = true). Ditambah 2–3 komentar warga
// (nama_kader: null). Semua pilihan template & jam bersifat
// DETERMINISTIK via hash string (tanpa Math.random).
// ============================================================
import type { Komentar, Postingan } from "@/types";
import { kader } from "./kader";
import { postingan } from "./postingan";
import { rekap } from "./rekap";

/** Hash string deterministik sederhana (untuk pemilihan template & jam) */
function hashSederhana(teks: string): number {
  let h = 0;
  for (let i = 0; i < teks.length; i++) {
    h = (h * 31 + teks.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** 18 template isi komentar dukungan (bahasa Indonesia natural) */
const TEMPLATE_KOMENTAR: string[] = [
  "Keren pak, semoga semakin maju! 💪",
  "SIAP BOSKU 🔥🔥",
  "Barakallah, semoga lancar semua programnya 🙏",
  "Partai rakyat memang beda, selalu hadir untuk rakyat kecil",
  "Sukses terus PRI, dari Sabang sampai Merauke 🇮🇩",
  "Mantap, programnya sangat dirasakan langsung oleh masyarakat",
  "Ikut bangga melihat perjuangan kader PRI di daerah",
  "Dukungan penuh dari kami para kader di daerah!",
  "Semoga rakyat makin sejahtera, aamiin 🤲",
  "Kontennya selalu inspiratif, saya tunggu tiap hari",
  "Bismillah, PRI pasti menang 🙌",
  "Bangga jadi pendukung setia PRI ❤️",
  "Ini baru partai yang benar-benar dekat dengan rakyat",
  "Terus bergerak untuk Indonesia yang lebih baik!",
  "Semoga ke depannya makin banyak program untuk UMKM",
  "Jangan lupa mampir ke kampung kami ya pak 😄",
  "Tetap rendah hati dan terus kerja keras, sukses selalu!",
  "Luar biasa, semoga amanah sampai akhir ya pak 🙏",
];

/** Kolam akun warga (bukan kader terdaftar) */
const WARGA_POOL: string[] = [
  "warga_bangga88",
  "rakyat_peduli",
  "andi.kurniawan",
  "siti_amlavina",
  "jonher89",
  "indonesia_raya45",
  "netizen_jujur",
  "ibu_ratna.jkt",
  "pemuda_tangguh",
  "dewi_fanpri",
  "suparman.id",
  "kampung_voice",
  "anak_nelayan",
  "penjaga_warung",
];

const BATAS_MENIT_WIB = 15 * 60 + 30; // 15:30 WIB (batas akhir komentar)

/** Ambil jam (menit sejak tengah malam WIB) dari ISO "+07:00" */
function menitWaktu(iso: string): number {
  const jam = Number(iso.slice(11, 13));
  const menit = Number(iso.slice(14, 16));
  return jam * 60 + menit;
}

/** Susun ISO WIB dari tanggal + menit sejak tengah malam */
function isoWib(tanggal: string, menit: number, detik: number): string {
  const hh = String(Math.floor(menit / 60)).padStart(2, "0");
  const mm = String(menit % 60).padStart(2, "0");
  const ss = String(detik).padStart(2, "0");
  return `${tanggal}T${hh}:${mm}:${ss}+07:00`;
}

/** Waktu komentar deterministik di antara waktu posting dan 15:30 WIB */
function waktuKomentar(p: Postingan, kunci: string): string {
  const tanggal = p.waktu_posting.slice(0, 10);
  const mulai = menitWaktu(p.waktu_posting);
  const jendela = Math.max(BATAS_MENIT_WIB - mulai, 1);
  const h = hashSederhana(kunci);
  let menit = mulai + (h % (jendela + 1));
  if (menit >= BATAS_MENIT_WIB) menit = BATAS_MENIT_WIB - 1; // maks. 15:29:59
  const detik = (h % 60) === 0 ? 12 : h % 60; // hindari detik 00 beruntun
  return isoWib(tanggal, menit, detik);
}

function pilihTemplate(kunci: string): string {
  return TEMPLATE_KOMENTAR[hashSederhana(kunci) % TEMPLATE_KOMENTAR.length];
}

/** Bangun komentar untuk satu postingan (kader sesuai rekap + warga) */
function bangunKomentar(p: Postingan): Komentar[] {
  const hasil: Komentar[] = [];
  let nomor = 0;

  const barisRekap = rekap.filter((r) => r.id_postingan === p.id_postingan);
  barisRekap.forEach((r) => {
    if (!r.sudah_komentar) return;
    const infoKader = kader.find((k) => k.nama_kader === r.nama_kader);
    if (!infoKader) return;
    nomor += 1;
    const kunci = `${p.id_postingan}::${infoKader.id}`;
    hasil.push({
      id_komentar: `kmt-${p.id_postingan}-${String(nomor).padStart(3, "0")}`,
      id_postingan: p.id_postingan,
      ig_username: infoKader.ig_username,
      nama_kader: infoKader.nama_kader,
      isi_komentar: pilihTemplate(kunci),
      waktu_komentar: waktuKomentar(p, kunci),
    });
  });

  // 2–3 komentar warga (deterministik per postingan)
  const jumlahWarga = 2 + (hashSederhana(p.id_postingan) % 2);
  const mulai = hashSederhana(`warga-${p.id_postingan}`) % WARGA_POOL.length;
  const langkah = [0, 5, 9]; // offset yang tidak saling menabrak (pool 14 akun)
  for (let j = 0; j < jumlahWarga; j++) {
    const username = WARGA_POOL[(mulai + langkah[j]) % WARGA_POOL.length];
    nomor += 1;
    const kunci = `${p.id_postingan}::${username}`;
    hasil.push({
      id_komentar: `kmt-${p.id_postingan}-${String(nomor).padStart(3, "0")}`,
      id_postingan: p.id_postingan,
      ig_username: username,
      nama_kader: null,
      isi_komentar: pilihTemplate(kunci),
      waktu_komentar: waktuKomentar(p, kunci),
    });
  }

  // Urutkan berdasarkan waktu komentar (terlama → terbaru)
  hasil.sort((a, b) => (a.waktu_komentar < b.waktu_komentar ? -1 : a.waktu_komentar > b.waktu_komentar ? 1 : 0));
  return hasil;
}

/** Komentar per id_postingan — kunci selalu id_postingan yang valid */
export const komentarByPostingan: Record<string, Komentar[]> = Object.fromEntries(
  postingan.map((p) => [p.id_postingan, bangunKomentar(p)]),
);

/** Ambil komentar sebuah postingan (array kosong bila tidak ditemukan) */
export function getKomentarPostingan(idPostingan: string): Komentar[] {
  return komentarByPostingan[idPostingan] ?? [];
}

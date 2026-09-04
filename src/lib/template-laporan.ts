// ============================================================
// TEMPLATE LAPORAN (4 Sep 2026) — mesin template sederhana yang formatnya
// bisa diatur master di Panel Master ("pengkodingan algoritma sederhana").
//
// Sintaks:
//   {nama}            → nilai variabel
//   {#daftar} … {/daftar}   → diulang untuk tiap anggota daftar
//   {^daftar} … {/daftar}   → tampil hanya bila daftar KOSONG
//   Di dalam pengulangan: {no} = nomor urut (mulai 1); variabel induk tetap
//   bisa dipakai. Nama daftar boleh bersarang (orang → platform → link).
//
// Variabel laporan upload harian:
//   {tanggal} {tanggal_panjang} {jam} {dibuat_oleh} {jumlah_orang} {jumlah_link}
//   {#orang}: {no} {nama} {username} {divisi} {jumlah}
//     {#platform}: {no} {platform} {PLATFORM} {jumlah}
//       {#link}: {no} {url}
// ============================================================

export type NilaiTemplate = string | number | boolean | null | undefined | NilaiTemplate[] | { [k: string]: NilaiTemplate };
type Konteks = Record<string, NilaiTemplate>;

const POLA_BUKA = /\{([#^])([a-zA-Z_][a-zA-Z0-9_]*)\}/;

/** Cari indeks penutup {/nama} yang berpasangan (mendukung nama bersarang sama). */
function cariPenutup(tpl: string, nama: string, dari: number): number {
  const buka = new RegExp(`\\{[#^]${nama}\\}`, "g");
  const tutup = `{/${nama}}`;
  let kedalaman = 1;
  let i = dari;
  while (i < tpl.length) {
    const t = tpl.indexOf(tutup, i);
    if (t < 0) return -1;
    buka.lastIndex = i;
    const b = buka.exec(tpl);
    if (b && b.index < t) {
      kedalaman += 1;
      i = b.index + b[0].length;
      continue;
    }
    kedalaman -= 1;
    if (kedalaman === 0) return t;
    i = t + tutup.length;
  }
  return -1;
}

function ambil(ctx: Konteks[], nama: string): NilaiTemplate {
  for (let i = ctx.length - 1; i >= 0; i--) {
    if (nama in ctx[i]) return ctx[i][nama];
  }
  return undefined;
}

function keTeks(v: NilaiTemplate): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "ya" : "tidak";
  if (Array.isArray(v)) return String(v.length);
  if (typeof v === "object") return "";
  return String(v);
}

/** Render template dengan data; tidak pernah melempar (bagian rusak dibiarkan apa adanya). */
export function renderTemplate(tpl: string, data: Konteks): string {
  return renderBagian(tpl, [data]);
}

function renderBagian(tpl: string, ctx: Konteks[]): string {
  let keluar = "";
  let sisa = tpl;
  for (;;) {
    const m = POLA_BUKA.exec(sisa);
    if (!m) {
      keluar += gantiVariabel(sisa, ctx);
      break;
    }
    keluar += gantiVariabel(sisa.slice(0, m.index), ctx);
    const jenis = m[1];
    const nama = m[2];
    const isiMulai = m.index + m[0].length;
    const tutup = cariPenutup(sisa, nama, isiMulai);
    if (tutup < 0) {
      // Tidak ada penutup: tampilkan apa adanya supaya kesalahan terlihat.
      keluar += sisa.slice(m.index);
      break;
    }
    const isi = sisa.slice(isiMulai, tutup);
    const nilai = ambil(ctx, nama);
    const daftar = Array.isArray(nilai) ? nilai : nilai && typeof nilai === "object" ? [nilai] : nilai ? [{}] : [];
    if (jenis === "#") {
      daftar.forEach((item, i) => {
        const lokal: Konteks = typeof item === "object" && item && !Array.isArray(item) ? { ...(item as Konteks) } : { nilai: item };
        lokal.no = i + 1;
        keluar += renderBagian(isi, [...ctx, lokal]);
      });
    } else if (daftar.length === 0) {
      keluar += renderBagian(isi, ctx);
    }
    sisa = sisa.slice(tutup + `{/${nama}}`.length);
  }
  return keluar;
}

function gantiVariabel(teks: string, ctx: Konteks[]): string {
  // Variabel yang tidak dikenal dirender KOSONG (bukan dibiarkan "{xxx}") supaya
  // laporan yang dibagikan tetap bersih; salah ketik ditangkap validasiTemplate.
  return teks.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_asli, nama: string) => keTeks(ambil(ctx, nama)));
}

/** Nama kode yang dikenal template laporan upload (dipakai validasi). */
export const KODE_VARIABEL = ["tanggal", "tanggal_panjang", "jam", "dibuat_oleh", "jumlah_orang", "jumlah_link", "no", "nama", "username", "divisi", "jumlah", "platform", "PLATFORM", "url"] as const;
export const KODE_BAGIAN = ["orang", "platform", "link"] as const;

/** Periksa keseimbangan bagian; kembalikan pesan galat atau null bila sah. */
export function validasiTemplate(tpl: string): string | null {
  const tumpukan: string[] = [];
  const re = /\{([#^/])([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
  for (const m of tpl.matchAll(re)) {
    if (m[1] === "/") {
      const atas = tumpukan.pop();
      if (!atas) return `Penutup {/${m[2]}} tanpa pembuka.`;
      if (atas !== m[2]) return `{/${m[2]}} tidak cocok dengan pembuka {#${atas}}.`;
    } else tumpukan.push(m[2]);
  }
  if (tumpukan.length > 0) return `Bagian {#${tumpukan[tumpukan.length - 1]}} belum ditutup dengan {/${tumpukan[tumpukan.length - 1]}}.`;
  if (tpl.trim().length === 0) return "Template kosong.";
  if (tpl.length > 6000) return "Template terlalu panjang (maks 6000 karakter).";
  // Nama kode harus dikenal — menangkap salah ketik seperti {namaa} sebelum disimpan.
  for (const m of tpl.matchAll(/\{([#^/]?)([a-zA-Z_][a-zA-Z0-9_]*)\}/g)) {
    const daftar: readonly string[] = m[1] ? KODE_BAGIAN : KODE_VARIABEL;
    if (!daftar.includes(m[2])) {
      return m[1]
        ? `Bagian {${m[1]}${m[2]}} tidak dikenal (yang ada: ${KODE_BAGIAN.map((k) => `{#${k}}`).join(", ")}).`
        : `Kode {${m[2]}} tidak dikenal. Lihat daftar kode di bawah.`;
    }
  }
  return null;
}

export const KUNCI_FORMAT_LAPORAN = "format_laporan_upload";

export const TEMPLATE_LAPORAN_BAWAAN = `📋 *LAPORAN UPLOAD VIDEO*
Tanggal: {tanggal_panjang}
Total: {jumlah_orang} orang · {jumlah_link} link

{#orang}{no}. *{nama}* ({jumlah} link)
{#platform}   {PLATFORM}
{#link}   {no}) {url}
{/link}{/platform}
{/orang}{^orang}Belum ada video yang diunggah pada tanggal ini.
{/orang}
Dibuat {jam} WIB oleh {dibuat_oleh}`;

export type OrangLaporan = {
  nama: string;
  username: string;
  divisi: string;
  jumlah: number;
  platform: { platform: string; PLATFORM: string; jumlah: number; link: { url: string }[] }[];
};

export type DataLaporan = {
  tanggal: string;
  tanggal_panjang: string;
  jam: string;
  dibuat_oleh: string;
  jumlah_orang: number;
  jumlah_link: number;
  orang: OrangLaporan[];
};

/** Data contoh untuk pratinjau di Panel Master. */
export function contohDataLaporan(): DataLaporan {
  return {
    tanggal: "2026-09-04",
    tanggal_panjang: "Jumat, 4 September 2026",
    jam: "18.30",
    dibuat_oleh: "ADMIN PALUGODAM",
    jumlah_orang: 2,
    jumlah_link: 3,
    orang: [
      {
        nama: "Salman Adinata",
        username: "salman",
        divisi: "Divisi PALUGODAM",
        jumlah: 2,
        platform: [
          { platform: "instagram", PLATFORM: "INSTAGRAM", jumlah: 1, link: [{ url: "https://www.instagram.com/reel/AbC123/" }] },
          { platform: "tiktok", PLATFORM: "TIKTOK", jumlah: 1, link: [{ url: "https://www.tiktok.com/@tvjakarta/video/1" }] },
        ],
      },
      {
        nama: "Bilqis Nurobani",
        username: "bilqis",
        divisi: "Divisi PALUGODAM",
        jumlah: 1,
        platform: [{ platform: "youtube", PLATFORM: "YOUTUBE", jumlah: 1, link: [{ url: "https://youtube.com/shorts/xyz" }] }],
      },
    ],
  };
}

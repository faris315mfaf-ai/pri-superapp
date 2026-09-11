// ============================================================
// Struktur organisasi: DIVISI & SUB-DIVISI — satu sumber kebenaran.
//
// Dipakai server (validasi /api/profil & /api/pengguna) DAN klien
// (dropdown), jadi file ini tidak boleh mengimpor apa pun yang
// khusus server.
//
// Tiga bagian per orang (terpisah dari `jabatan` resmi partai):
// - `divisi`        : salah satu dari DIVISI di bawah.
// - `sub_divisi`    : WAJIB bila divisinya Sayap Partai / Zona,
//                     kosong untuk divisi lain.
// - `posisi_divisi` : "kepala" | "anggota" — HANYA diatur HRD/
//                     super admin, bukan oleh anggota sendiri.
// ============================================================

export const DIVISI = [
  "Divisi HR",
  "Divisi Survey",
  "Divisi IT",
  "Divisi Admin Medsos & QC Konten",
  "Divisi Editor",
  "Divisi Podcast",
  "Divisi Desain",
  "Divisi Konten Kreator",
  "Divisi TV Rakyat",
  "Divisi Media Online",
  "Divisi KTA",
  "Divisi Sayap Partai",
  "Divisi Zona",
  "Divisi Acara",
  // PALUGODAM (2 Sep 2026): divisi produksi konten mandiri — anggotanya
  // mendapat alur unggah+jadwal sendiri di modul TV Rakyat Saya,
  // setara TV Rakyat Official tapi ke sosmed pribadi masing-masing.
  "Divisi PALUGODAM",
] as const;

/** Divisi produksi konten mandiri (fitur khusus di TV Rakyat Saya). */
export const DIVISI_PALUGODAM = "Divisi PALUGODAM";

// KATEGORI STRUKTUR (10 Sep 2026): di layar, orang memilih dulu salah satu
// dari Zona / Sayap / Divisi, baru isinya. Di database bentuknya tetap
// `divisi` + `sub_divisi` (Zona & Sayap adalah "divisi" dengan sub), jadi
// data lama tidak perlu dimigrasi.
export const DIVISI_ZONA = "Divisi Zona";
export const DIVISI_SAYAP = "Divisi Sayap Partai";
export const KATEGORI_STRUKTUR = [
  { kunci: "zona", label: "Zona", keterangan: "Wilayah kerja partai" },
  { kunci: "sayap", label: "Sayap", keterangan: "Organisasi sayap partai" },
  { kunci: "divisi", label: "Divisi", keterangan: "Divisi kerja pusat" },
] as const;
export type KategoriStruktur = (typeof KATEGORI_STRUKTUR)[number]["kunci"];
/** Divisi kerja biasa (tanpa Zona & Sayap yang punya kategori sendiri). */
export const DIVISI_BIASA = DIVISI.filter((d) => d !== DIVISI_ZONA && d !== DIVISI_SAYAP);
/** Kategori dari nilai `divisi` tersimpan; null bila belum memilih. */
export function kategoriStruktur(divisi?: string | null): KategoriStruktur | null {
  const d = (divisi ?? "").trim();
  if (!d) return null;
  if (d === DIVISI_ZONA) return "zona";
  if (d === DIVISI_SAYAP) return "sayap";
  return "divisi";
}

/** true bila orang ini anggota PALUGODAM (master ikut, untuk pengujian). */
export function adalahPalugodam(u: {
  role?: string;
  divisi?: string | null;
}): boolean {
  if (u.role === "master" || u.role === "super_admin") return true;
  return (u.divisi ?? "").trim() === DIVISI_PALUGODAM;
}

export type Divisi = (typeof DIVISI)[number];

/** Sub-divisi Sayap Partai: nilai singkat disimpan, label panjang tampil. */
export const SUB_SAYAP: { nilai: string; label: string }[] = [
  { nilai: "PATRIOT", label: "PATRIOT — Patriot Rakyat Indonesia" },
  { nilai: "PERI", label: "PERI — Perempuan Rakyat Indonesia" },
  { nilai: "LBH", label: "LBH — Lembaga Bantuan Hukum RI" },
  { nilai: "AMRI", label: "AMRI — Angkatan Muda Rakyat Indonesia" },
  { nilai: "MURI", label: "MURI — Muslimat Rakyat Indonesia" },
  { nilai: "PERISAI", label: "PERISAI — Persatuan Kristen Rakyat Indonesia" },
  { nilai: "SAMUDRA", label: "SAMUDRA — Santri Muda Rakyat Indonesia" },
  { nilai: "PRORI", label: "PRORI — Pusat Robotika Rakyat Indonesia" },
  { nilai: "JURI", label: "JURI — Jurnalis Influencer Rakyat Indonesia" },
  { nilai: "KESUMA RI", label: "KESUMA RI — Kesehatan Untuk Semua Rakyat Indonesia" },
];

export const SUB_ZONA: { nilai: string; label: string }[] = [
  "Sumatera",
  "Papua, Maluku Utara, Maluku",
  "Jawa Tengah, Yogyakarta",
  "Jawa Timur",
  "DKI Jakarta, Banten",
  "Jawa Barat",
  "Bali, NTB, NTT",
  "Kalimantan & Sulawesi",
].map((z) => ({ nilai: z, label: z }));

// ============================================================
// JABATAN DI SAYAP PARTAI (10 Sep 2026)
//
// Sayap punya kepengurusannya sendiri dengan nama jabatan yang KEBETULAN
// sama dengan DPP ("Ketua Umum", dst.) tetapi kuasanya sama sekali
// berbeda: Ketua Umum DPP JURI PRI adalah pemimpin sayap JURI, BUKAN
// pemimpin partai. Karena itu jabatan sayap disimpan di kolom sendiri
// (app_user.jabatan_sayap) dan TIDAK PERNAH menyentuh aturan pusat yang
// membaca `jabatan` — termasuk kenaikan otomatis menjadi super admin.
//
// Yang DIDAPAT pengurus sayap (permintaan user): akses modul Dashboard.
// ============================================================
export const JABATAN_SAYAP = [
  "Ketua Umum",
  "Wakil Ketua Umum",
  "Sekretaris Jenderal",
  "Wakil Sekretaris Jenderal",
  "Bendahara Umum",
  "Wakil Bendahara Umum",
] as const;

export type JabatanSayap = (typeof JABATAN_SAYAP)[number];

/** true bila teks ini salah satu jabatan sayap yang sah. */
export function jabatanSayapSah(nilai: string): boolean {
  return (JABATAN_SAYAP as readonly string[]).includes(nilai.trim());
}

/**
 * Gelar lengkap pengurus sayap: "Ketua Umum DPP JURI PRI".
 * Kosong bila salah satu bagiannya belum ada.
 */
export function gelarSayap(subDivisi?: string | null, jabatanSayap?: string | null): string {
  const s = (subDivisi ?? "").trim();
  const j = (jabatanSayap ?? "").trim();
  if (!s || !j) return "";
  return `${j} DPP ${s} PRI`;
}

/** true bila orang ini pengurus (bukan sekadar anggota) sebuah sayap. */
export function adalahPengurusSayap(u: {
  divisi?: string | null;
  jabatan_sayap?: string | null;
}): boolean {
  return (u.divisi ?? "").trim() === DIVISI_SAYAP && Boolean((u.jabatan_sayap ?? "").trim());
}

/** true bila divisi ini mewajibkan pilihan sub-divisi. */
export function butuhSubDivisi(divisi: string): boolean {
  return divisi === "Divisi Sayap Partai" || divisi === "Divisi Zona";
}

/**
 * Pilihan sub-divisi untuk sebuah divisi (kosong bila tak perlu).
 * `sayapTambahan` = sayap dari tabel sayap_partai (ditambah HR/superadmin/
 * master) yang ikut sah di samping sayap bawaan.
 */
export function pilihanSubDivisi(
  divisi: string,
  sayapTambahan: readonly { nilai: string; label: string }[] = [],
): { nilai: string; label: string }[] {
  if (divisi === "Divisi Sayap Partai") return [...SUB_SAYAP, ...sayapTambahan];
  if (divisi === "Divisi Zona") return SUB_ZONA;
  return [];
}

/**
 * Periksa pasangan divisi + sub-divisi. Melempar Error (status 400)
 * bila tidak sah — dipanggil dari route API sebelum menyimpan.
 */
export function pastikanStrukturSah(
  divisi: string,
  subDivisi: string,
  sayapTambahan: readonly string[] = [],
): void {
  if (!divisi) return; // belum memilih itu boleh; yang salah yang ditolak
  if (!(DIVISI as readonly string[]).includes(divisi)) {
    throw Object.assign(new Error("Divisi tidak dikenal."), { status: 400 });
  }
  const pilihan = pilihanSubDivisi(
    divisi,
    sayapTambahan.map((n) => ({ nilai: n, label: n })),
  );
  if (pilihan.length > 0) {
    if (!pilihan.some((p) => p.nilai === subDivisi)) {
      throw Object.assign(
        new Error(`Pilih sub-divisi untuk ${divisi}.`),
        { status: 400 },
      );
    }
  } else if (subDivisi) {
    throw Object.assign(new Error(`${divisi} tidak punya sub-divisi.`), { status: 400 });
  }
}

// ============================================================
// STRUKTUR GANDA (11 Sep 2026) — satu orang boleh berada di lebih dari
// satu struktur. Contoh: Zona Jawa Barat SEKALIGUS Divisi HR.
//
// Cara menyimpannya sengaja tidak mengubah kolom lama: struktur PERTAMA
// tetap di `divisi`/`sub_divisi`/`jabatan_sayap` (itulah struktur utama,
// dipakai seluruh kode lama tanpa disentuh), sisanya di kolom baru
// `struktur_lain` (jsonb array). Jadi tidak ada migrasi data, dan fitur
// lama tidak bisa rusak karenanya.
// ============================================================

export type StrukturSatuan = {
  divisi: string;
  sub_divisi: string;
  jabatan_sayap?: string;
};

/** Sebanyak-banyaknya struktur yang boleh dipegang satu orang. */
export const MAKS_STRUKTUR = 4;

/** Kunci pembanding supaya struktur yang sama tidak tercatat dua kali. */
export function kunciStruktur(s: StrukturSatuan): string {
  return `${s.divisi.trim().toLowerCase()}|${(s.sub_divisi ?? "").trim().toLowerCase()}`;
}

/** Baca kolom `struktur_lain` apa adanya dari database — tahan data sampah. */
export function bacaStrukturLain(mentah: unknown): StrukturSatuan[] {
  if (!Array.isArray(mentah)) return [];
  const keluar: StrukturSatuan[] = [];
  const sudah = new Set<string>();
  for (const x of mentah) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const divisi = String(o.divisi ?? "").trim();
    if (!divisi) continue;
    const satu: StrukturSatuan = {
      divisi,
      sub_divisi: String(o.sub_divisi ?? "").trim(),
      jabatan_sayap: String(o.jabatan_sayap ?? "").trim(),
    };
    const k = kunciStruktur(satu);
    if (sudah.has(k)) continue;
    sudah.add(k);
    keluar.push(satu);
    if (keluar.length >= MAKS_STRUKTUR) break;
  }
  return keluar;
}

/**
 * Semua struktur seseorang, struktur utama lebih dulu. Yang kosong
 * dibuang, yang kembar disatukan.
 */
export function semuaStruktur(u: {
  divisi?: string | null;
  sub_divisi?: string | null;
  jabatan_sayap?: string | null;
  struktur_lain?: unknown;
}): StrukturSatuan[] {
  const daftar: StrukturSatuan[] = [];
  const utama = (u.divisi ?? "").trim();
  if (utama) {
    daftar.push({
      divisi: utama,
      sub_divisi: (u.sub_divisi ?? "").trim(),
      jabatan_sayap: (u.jabatan_sayap ?? "").trim(),
    });
  }
  const sudah = new Set(daftar.map(kunciStruktur));
  for (const s of bacaStrukturLain(u.struktur_lain)) {
    const k = kunciStruktur(s);
    if (sudah.has(k)) continue;
    sudah.add(k);
    daftar.push(s);
  }
  return daftar.slice(0, MAKS_STRUKTUR);
}

/**
 * Pisahkan daftar struktur jadi bentuk simpan: yang pertama ke kolom
 * lama, sisanya ke `struktur_lain`.
 */
export function pecahStruktur(daftar: StrukturSatuan[]): {
  divisi: string;
  sub_divisi: string;
  jabatan_sayap: string;
  struktur_lain: StrukturSatuan[];
} {
  const bersih = bacaStrukturLain(daftar);
  const utama = bersih[0];
  return {
    divisi: utama?.divisi ?? "",
    sub_divisi: utama?.sub_divisi ?? "",
    jabatan_sayap: utama?.jabatan_sayap ?? "",
    struktur_lain: bersih.slice(1),
  };
}

/** Apakah orang ini berada di divisi tertentu — struktur mana pun. */
export function punyaDivisi(
  u: { divisi?: string | null; struktur_lain?: unknown },
  divisi: string,
): boolean {
  const cari = divisi.trim().toLowerCase();
  if ((u.divisi ?? "").trim().toLowerCase() === cari) return true;
  return bacaStrukturLain(u.struktur_lain).some((s) => s.divisi.trim().toLowerCase() === cari);
}

/**
 * Keterangan struktur untuk ditampilkan di bawah nama:
 * jabatan resmi menang; kalau tidak ada, susun dari divisi.
 * Contoh: "Kepala Divisi Zona · DKI Jakarta, Banten".
 */
export function deskripsiStruktur(u: {
  jabatan?: string | null;
  bidang_jabatan?: string | null;
  divisi?: string | null;
  sub_divisi?: string | null;
  posisi_divisi?: string | null;
  jabatan_sayap?: string | null;
}): string {
  // Pengurus sayap dibaca dengan gelar sayapnya — "Ketua Umum DPP JURI
  // PRI" — dan tidak pernah tertukar dengan jabatan DPP.
  const gelar = gelarSayap(u.sub_divisi, u.jabatan_sayap);
  if (gelar && (u.divisi ?? "").trim() === DIVISI_SAYAP) return gelar;
  const j = (u.jabatan ?? "").trim();
  if (j) {
    const b = (u.bidang_jabatan ?? "").trim();
    return b ? `${j} ${b}` : j;
  }
  const d = (u.divisi ?? "").trim();
  if (!d) return "";
  const awalan = u.posisi_divisi === "kepala" ? "Kepala " : "";
  const sub = (u.sub_divisi ?? "").trim();
  // Zona & Sayap dibaca sebagai kategorinya sendiri (10 Sep 2026):
  // "Kepala Zona Sumatera", "Anggota Sayap PERI" — bukan "Divisi Zona · …".
  if (d === DIVISI_ZONA) return `${awalan}Zona${sub ? ` ${sub}` : ""}`;
  if (d === DIVISI_SAYAP) return `Anggota Sayap${sub ? ` ${sub}` : ""}`;
  return `${awalan}${d}${sub ? ` · ${sub}` : ""}`;
}

/**
 * Admin Studio PALUGODAM (3 Sep 2026): master/super_admin, atau KEPALA
 * Divisi PALUGODAM (akun ADMIN PALUGODAM dibuat dengan posisi kepala).
 * Mengendalikan link → DeepSeek → Creatomate → Siaran Serentak.
 */
export function adalahAdminStudio(u: {
  role?: string;
  divisi?: string | null;
  posisi_divisi?: string | null;
}): boolean {
  if (u.role === "master" || u.role === "super_admin") return true;
  return (u.divisi ?? "").trim() === DIVISI_PALUGODAM && u.posisi_divisi === "kepala";
}

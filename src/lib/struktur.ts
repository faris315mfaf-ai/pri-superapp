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
] as const;

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

/** true bila divisi ini mewajibkan pilihan sub-divisi. */
export function butuhSubDivisi(divisi: string): boolean {
  return divisi === "Divisi Sayap Partai" || divisi === "Divisi Zona";
}

/** Pilihan sub-divisi untuk sebuah divisi (kosong bila tak perlu). */
export function pilihanSubDivisi(divisi: string): { nilai: string; label: string }[] {
  if (divisi === "Divisi Sayap Partai") return SUB_SAYAP;
  if (divisi === "Divisi Zona") return SUB_ZONA;
  return [];
}

/**
 * Periksa pasangan divisi + sub-divisi. Melempar Error (status 400)
 * bila tidak sah — dipanggil dari route API sebelum menyimpan.
 */
export function pastikanStrukturSah(divisi: string, subDivisi: string): void {
  if (!divisi) return; // belum memilih itu boleh; yang salah yang ditolak
  if (!(DIVISI as readonly string[]).includes(divisi)) {
    throw Object.assign(new Error("Divisi tidak dikenal."), { status: 400 });
  }
  const pilihan = pilihanSubDivisi(divisi);
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
}): string {
  const j = (u.jabatan ?? "").trim();
  if (j) {
    const b = (u.bidang_jabatan ?? "").trim();
    return b ? `${j} ${b}` : j;
  }
  const d = (u.divisi ?? "").trim();
  if (!d) return "";
  const awalan = u.posisi_divisi === "kepala" ? "Kepala " : "";
  const sub = (u.sub_divisi ?? "").trim();
  return `${awalan}${d}${sub ? ` · ${sub}` : ""}`;
}

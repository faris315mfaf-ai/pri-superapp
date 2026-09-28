// ============================================================
// UJI BEBAN — skenario & aturan rute (29 Sep 2026). MURNI: dipakai proxy,
// mesin uji (lib/uji-beban), layar Panel Master, dan uji otomatis.
//
// Uji beban meniru ratusan orang membuka aplikasi bersamaan lalu memakai
// fitur terberat. Pengguna virtual memakai TOKEN UJI sementara
// (lib/uji-beban-token) yang dipetakan ke akun sungguhan, supaya cache per
// orang bekerja seperti aslinya. Pengamannya dua lapis:
//   1. proxy.ts menolak token uji untuk apa pun selain GET ke RUTE_UJI;
//   2. rute-rute itu dipilih karena hanya MEMBACA database. Rute yang
//      diam-diam memanggil layanan luar (upload-post, Ayrshare, TikHub, AI)
//      sengaja TIDAK dimasukkan (tvr/hubungkan, tvr/jadwal-saya,
//      tvr/insight-saya, konten/galeri), dan tugas susulannya (rekonsiliasi
//      KPI, sapu profil, sinkron konten, penanda online) dilewati untuk
//      token uji (user.ujiBeban).
// ============================================================

export const AWALAN_TOKEN_UJI = "ujibeban.";

/** true bila nilai header Authorization (atau token mentah) adalah token uji beban. */
export function adalahTokenUji(auth: string | null | undefined): boolean {
  const t = String(auth ?? "").trim();
  const token = t.toLowerCase().startsWith("bearer ") ? t.slice(7).trim() : t;
  return token.startsWith(AWALAN_TOKEN_UJI);
}

/** Rute (pathname) yang boleh dibaca token uji. Hanya GET/HEAD. */
export const RUTE_UJI: readonly string[] = [
  "/api/sesi",
  "/api/detak",
  "/api/notifikasi",
  "/api/fitur",
  "/api/tv/tim",
  "/api/dashboard/akses",
  "/api/preferensi",
  "/api/asisten",
  "/api/sakelar",
  "/api/laporan-kerja",
  "/api/tvr/laporan",
  "/api/absensi",
  "/api/streak",
  "/api/peringkat-tvr",
  "/api/ultah",
  "/api/pengumuman",
  "/api/tvr/unggah",
  "/api/tvr/rangkuman",
  "/api/tvr/akun",
  "/api/chat",
  "/api/chat/grup",
  "/api/dashboard",
  "/api/dashboard/ringkas",
  "/api/dashboard/tv-nasional",
  "/api/tv-nasional/kategori",
  "/api/tv-nasional/video-harian",
  "/api/tv-nasional/kenaikan",
  "/api/tv/keyword",
  "/api/tv/interaksi",
  "/api/tv/video-wajib",
];

export function ruteUjiBoleh(metode: string, pathname: string): boolean {
  const m = String(metode ?? "").toUpperCase();
  if (m !== "GET" && m !== "HEAD") return false;
  const p = String(pathname ?? "").replace(/\/+$/, "") || "/";
  return RUTE_UJI.includes(p);
}

export type SkenarioUji = "normal" | "berat";
export type LangkahUji = { path: string; bobot: number };

/** Konteks yang menentukan parameter kueri (tanggal hari ini, kategori contoh). */
export type KonteksSkenario = { tanggal: string; kategori: string[] };

/** Serbuan "login": semua yang dimuat satu HP saat aplikasi dibuka (Beranda). */
export function langkahBuka(k: KonteksSkenario): string[] {
  return [
    "/api/sesi",
    "/api/fitur",
    "/api/tv/tim",
    "/api/dashboard/akses",
    "/api/preferensi",
    "/api/asisten",
    "/api/sakelar",
    "/api/notifikasi",
    "/api/laporan-kerja?kategori=harian",
    `/api/tvr/laporan?tanggal=${k.tanggal}`,
    "/api/absensi",
    "/api/streak",
    "/api/peringkat-tvr?ringkas=1",
    "/api/ultah",
    "/api/pengumuman",
  ];
}

/**
 * Fitur TERBERAT (skenario "berat"): tiap orang terus berpindah ke layar
 * berat. Rute khusus pengurus ikut dicoba; bagi akun biasa jawabannya 403
 * (murah) dan tidak dihitung galat.
 */
export function langkahBerat(k: KonteksSkenario): LangkahUji[] {
  const d: LangkahUji[] = [
    { path: `/api/tvr/laporan?tanggal=${k.tanggal}`, bobot: 3 },
    { path: "/api/tvr/laporan?riwayat=1", bobot: 1 },
    { path: "/api/tvr/unggah", bobot: 2 },
    { path: `/api/tvr/rangkuman?tanggal=${k.tanggal}`, bobot: 1 },
    { path: "/api/tvr/akun", bobot: 1 },
    { path: "/api/chat", bobot: 2 },
    { path: "/api/chat/grup", bobot: 1 },
    { path: "/api/peringkat-tvr", bobot: 2 },
    { path: "/api/dashboard", bobot: 2 },
    { path: "/api/dashboard/ringkas", bobot: 2 },
    { path: "/api/dashboard/tv-nasional", bobot: 1 },
    { path: `/api/tv-nasional/video-harian?tanggal=${k.tanggal}`, bobot: 2 },
    { path: "/api/tv-nasional/kenaikan?rentang=7", bobot: 1 },
    { path: "/api/tv/keyword", bobot: 1 },
    { path: "/api/tv/interaksi", bobot: 1 },
    { path: "/api/tv/video-wajib", bobot: 1 },
    { path: "/api/pengumuman", bobot: 1 },
    { path: "/api/absensi", bobot: 1 },
    { path: "/api/notifikasi", bobot: 1 },
  ];
  for (const kat of k.kategori.slice(0, 5)) {
    d.push({ path: `/api/tv-nasional/kategori?kategori=${encodeURIComponent(kat)}`, bobot: 1 });
  }
  return d;
}

/** Pemakaian SEHARI-HARI (skenario "normal"): sesekali membuka layar ringan. */
export function langkahNormal(k: KonteksSkenario): LangkahUji[] {
  return [
    { path: `/api/tvr/laporan?tanggal=${k.tanggal}`, bobot: 3 },
    { path: "/api/tvr/unggah", bobot: 1 },
    { path: "/api/chat", bobot: 2 },
    { path: "/api/pengumuman", bobot: 1 },
    { path: "/api/absensi", bobot: 1 },
    { path: "/api/peringkat-tvr?ringkas=1", bobot: 1 },
    { path: "/api/tv/interaksi", bobot: 1 },
  ];
}

/** Irama tiap orang virtual (milidetik). */
export const IRAMA = {
  detakMs: 10_000,
  notifikasiMs: 300_000,
  /** Jeda antar-aksi skenario berat: acak di antara dua angka ini. */
  beratMs: [4_000, 9_000] as const,
  normalMs: [45_000, 90_000] as const,
};

/** Pilih satu langkah menurut bobotnya. */
export function pilihBerbobot(daftar: LangkahUji[], acak: () => number = Math.random): LangkahUji {
  const total = daftar.reduce((s, l) => s + Math.max(0, l.bobot), 0);
  let r = acak() * total;
  for (const l of daftar) {
    r -= Math.max(0, l.bobot);
    if (r < 0) return l;
  }
  return daftar[daftar.length - 1];
}

/** Tahap bertahap: 25%, 50%, 75%, 100% dari jumlah orang (tanpa duplikat, minimal 1). */
export function tahapBertahap(jumlah: number): number[] {
  const n = Math.max(1, Math.floor(jumlah));
  const hasil: number[] = [];
  for (const f of [0.25, 0.5, 0.75, 1]) {
    const v = Math.max(1, Math.round(n * f));
    if (!hasil.includes(v)) hasil.push(v);
  }
  return hasil;
}

/** Ambang lulus/henti. */
export const AMBANG_UJI = {
  /** Tahap dianggap AMAN bila p95 di bawah ini dan galat di bawah GALAT_AMAN. */
  p95AmanMs: 2_000,
  galatAman: 0.02,
  /** Uji DIHENTIKAN otomatis bila p95 30 dtk terakhir melewati ini … */
  p95HentiMs: 5_000,
  /** … atau galat (5xx/putus/waktu habis) melewati ini … */
  galatHenti: 0.1,
  /** … atau CPU Supabase setinggi ini dua kali berturut-turut. */
  cpuHenti: 97,
};

export type RingkasTahap = {
  orang: number;
  permintaan: number;
  per_dtk: number;
  p50: number;
  p95: number;
  galat: number;
  ditolak: number;
  cpu_supabase: number | null;
  cpu_aplikasi: number | null;
  tingkat_db: string;
  aman: boolean;
  lambat_teratas: [string, number, number][];
};

/** Persentil dari daftar angka (0..1). */
export function persentil(angka: number[], p: number): number {
  if (angka.length === 0) return 0;
  const urut = [...angka].sort((a, b) => a - b);
  return urut[Math.min(urut.length - 1, Math.floor(urut.length * p))];
}

/** Alasan menghentikan uji sekarang, atau null bila boleh lanjut. */
export function alasanHenti(o: { p95: number; galat: number; sampel: number; cpuTinggiBeruntun: number; tingkatDb: string }): string | null {
  if (o.tingkatDb === "macet") return "Database macet (penjaga Supabase) — uji dihentikan supaya pengguna sungguhan tidak ikut lambat.";
  if (o.cpuTinggiBeruntun >= 2) return `CPU Supabase ≥ ${AMBANG_UJI.cpuHenti}% dua kali berturut-turut.`;
  if (o.sampel >= 30 && o.p95 > AMBANG_UJI.p95HentiMs) return `Waktu jawab p95 ${Math.round(o.p95)} ms melewati ${AMBANG_UJI.p95HentiMs} ms.`;
  if (o.sampel >= 30 && o.galat > AMBANG_UJI.galatHenti) return `Galat ${Math.round(o.galat * 100)}% melewati ${Math.round(AMBANG_UJI.galatHenti * 100)}%.`;
  return null;
}

/** Jumlah orang terbesar yang tahapnya AMAN (0 bila tidak ada). */
export function kesimpulanAman(tahap: RingkasTahap[]): number {
  let aman = 0;
  for (const t of tahap) {
    if (!t.aman) break;
    aman = t.orang;
  }
  return aman;
}

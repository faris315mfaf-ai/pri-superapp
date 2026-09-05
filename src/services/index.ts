// ============================================================
// PRI SuperApp — Lapisan Services
// Satu-satunya pintu masuk UI ke data. Semua fungsi async dan
// memanggil API routes via fetch RELATIF + jeda simulasi jaringan
// 300–800 ms. Komponen UI TIDAK boleh mengimpor `src/data`
// secara langsung.
// ============================================================
import type {
  Aktivitas,
  AkunWajib,
  Berita,
  HasilProsesVideo,
  Kader,
  KemajuanVideo,
  Komentar,
  KpiItem,
  NotifikasiItem,
  Postingan,
  Rekap,
  User,
  VideoAntrian,
} from "@/types";
import { PERIODE_AKTIF } from "@/types";

// ------------------------------------------------------------
// Tipe tambahan lapisan services
// ------------------------------------------------------------

export type AkunWajibWithStats = AkunWajib & {
  total_postingan: number;
  sudah: number;
  belum: number;
  persen: number;
  kader_patuh_penuh: number;
  /** Thumbnail POSTINGAN TERBARU akun ini pada periode (31 Agu 2026). */
  thumbnail_terbaru?: string;
  /** Kapan data postingan akun ini terakhir disegarkan sinkron. */
  update_terakhir?: string | null;
};

export type PostinganWithKepatuhan = Postingan & {
  sudah_komentar_kader: number;
  belum_komentar_kader: number;
};

export type PeringkatKader = {
  id: string;
  nama_kader: string;
  jumlah_komentar: number;
};

export type RingkasanPostingan = {
  sudah: number;
  belum: number;
  persen: number;
};

export type RingkasanGlobal = {
  total_postingan: number;
  kader_patuh: string;
  perlu_ditindak: number;
  persen_kepatuhan: number;
};

export type DashboardData = {
  kpi: KpiItem[];
  tren: { hari: string; nilai: number }[];
  kepatuhanAkun: { akun_wajib: string; persen: number }[];
  aktivitas: Aktivitas[];
  peringkat: PeringkatKader[];
  ringkasanVideo: Record<string, number>;
  ringkasan: RingkasanGlobal;
};

// ------------------------------------------------------------
// Helper internal
// ------------------------------------------------------------

/**
 * Fetch JSON dari API route (path relatif) dengan penanganan error
 * berbahasa Indonesia. Mengembalikan objek respons apa adanya.
 */
async function fetchJson(path: string, init?: RequestInit): Promise<any> {
  // Token perangkat DISERTAKAN OTOMATIS untuk setiap panggilan API.
  // Sebelumnya tiap pemanggil harus ingat menambahkan headerToken()
  // sendiri, dan yang lupa membuat endpoint-nya terpaksa dibiarkan
  // terbuka tanpa login. Sekarang kebalikannya: aman secara bawaan.
  const res = await fetch(path, {
    ...init,
    headers: {
      ...headerToken(),
      ...((init?.headers ?? {}) as Record<string, string>),
    },
  });

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null; // respons non-JSON (mis. jaringan terputus)
  }

  if (!res.ok) {
    const pesan =
      json && typeof json.error === "string"
        ? json.error
        : `Gagal memuat data dari server (${res.status})`;
    throw new Error(pesan);
  }
  return json;
}

/** Fetch lalu ambil isi field `data` dari respons API */
async function ambilData<T>(path: string): Promise<T> {
  const json = await fetchJson(path);
  return json.data as T;
}

// ------------------------------------------------------------
// Autentikasi
// ------------------------------------------------------------

/** Login pengguna (melempar Error berbahasa Indonesia bila 401) */
/**
 * Nama kunci token perangkat di penyimpanan lokal.
 *
 * Token inilah yang membuat pengguna tidak perlu mengetik apa pun saat
 * membuka aplikasi. Disimpan terpisah dari state Zustand supaya tetap
 * ada meski store di-reset.
 */
const KUNCI_TOKEN = "pri-token-perangkat";

export function ambilToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(KUNCI_TOKEN) ?? "";
  } catch {
    return "";
  }
}

export function simpanToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(KUNCI_TOKEN, token);
    else window.localStorage.removeItem(KUNCI_TOKEN);
  } catch {
    // Penyimpanan penuh atau ditolak — aplikasi tetap jalan, hanya
    // pengguna harus masuk lagi lain kali.
  }
}

// ---- KENDALI AKUN (4 Sep 2026): admin PALUGODAM beralih menjadi anggota ----
// Disimpan di memori saja (bukan localStorage) supaya hilang saat aplikasi
// dimuat ulang — admin tidak pernah "terjebak" sebagai orang lain.
let sebagaiUserId: string | null = null;
/** Atur akun yang sedang dikendalikan (null = akun sendiri). */
export function setSebagai(id: string | null): void {
  sebagaiUserId = id;
}
export function ambilSebagai(): string | null {
  return sebagaiUserId;
}

/** Header Authorization bila ada token; kosong bila belum masuk. */
function headerToken(): Record<string, string> {
  const t = ambilToken();
  if (!t) return {};
  // Header X-Sebagai hanya dihormati endpoint /api/tvr/* (lib/sebagai) —
  // aman ikut terkirim ke endpoint lain (diabaikan).
  return sebagaiUserId ? { Authorization: `Bearer ${t}`, "X-Sebagai": sebagaiUserId } : { Authorization: `Bearer ${t}` };
}

/** Label perangkat sederhana untuk daftar sesi di profil */
function namaPerangkat(): string {
  if (typeof navigator === "undefined") return "Perangkat";
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad/i.test(ua)) return "iPhone/iPad";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac/i.test(ua)) return "Mac";
  return "Perangkat";
}

/** Data akun beserta status pendaftarannya */
export type UserLengkap = User & {
  status: string;
  profil_lengkap: boolean;
  username: string | null;
  nomor_wa: string | null;
};

/**
 * Masuk dengan username, nomor WhatsApp, atau email.
 * Token perangkat langsung disimpan agar pembukaan berikutnya otomatis.
 */
export async function login(
  identitas: string,
  password: string,
): Promise<UserLengkap> {
  const json = await fetchJson("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identitas,
      password,
      nama_perangkat: namaPerangkat(),
    }),
  });
  if (json.token) simpanToken(json.token as string);
  return json.user as UserLengkap;
}

/**
 * Coba masuk otomatis dengan token tersimpan.
 * Mengembalikan null bila belum pernah masuk atau tokennya sudah dicabut.
 */
export async function masukOtomatis(): Promise<
  UserLengkap | null | "perbaikan"
> {
  if (!ambilToken()) return null;
  try {
    const res = await fetch("/api/sesi", { headers: headerToken() });
    if (!res.ok) {
      // 503 dari sesi = master menyalakan mode perbaikan. Token TIDAK
      // dibuang — begitu perbaikan selesai, pengguna langsung masuk lagi.
      if (res.status === 503) return "perbaikan";
      // 401 = token dicabut / akun dinonaktifkan. Buang supaya tidak
      // dicoba terus setiap kali aplikasi dibuka.
      if (res.status === 401) simpanToken("");
      return null;
    }
    const json = (await res.json()) as { user?: UserLengkap };
    return json.user ?? null;
  } catch {
    // Tidak ada koneksi — jangan buang token, cukup gagal diam-diam.
    return null;
  }
}

/** Keluar dari perangkat ini (atau semua perangkat bila diminta). */
export async function keluar(semuaPerangkat = false): Promise<void> {
  const t = ambilToken();
  if (t) {
    await fetch(`/api/sesi${semuaPerangkat ? "?semua=1" : ""}`, {
      method: "DELETE",
      headers: headerToken(),
    }).catch(() => undefined);
  }
  simpanToken("");
}

// ------------------------------------------------------------
// Pendaftaran
// ------------------------------------------------------------

/** Langkah 1 — kirim data diri, kode OTP dikirim ke EMAIL. Nomor WA opsional. */
export async function daftar(data: {
  username: string;
  password: string;
  email: string;
  nama: string;
  nomor_wa?: string;
}): Promise<{ email: string; otp_terkirim: boolean; auto_aktif: boolean }> {
  const json = await fetchJson("/api/daftar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return {
    email: json.email as string,
    // false = OTP gagal terkirim; pengguna lanjut ke layar menunggu
    // persetujuan tanpa verifikasi email (lihat /api/daftar).
    otp_terkirim: json.otp_terkirim !== false,
    // true = sakelar bypass menyala → akun langsung aktif tanpa persetujuan.
    auto_aktif: json.auto_aktif === true,
  };
}

/** Langkah 2 — verifikasi kode EMAIL; berhasil = token tersimpan */
export async function verifikasiOtpEmail(
  email: string,
  kode: string,
): Promise<UserLengkap> {
  const json = await fetchJson("/api/otp-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, kode, nama_perangkat: namaPerangkat() }),
  });
  if (json.token) simpanToken(json.token as string);
  return json.user as UserLengkap;
}

/** Minta kode EMAIL baru dikirim ulang */
export async function kirimUlangOtpEmail(email: string): Promise<void> {
  await fetchJson("/api/otp-email", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

/** Langkah 3 — lengkapi profil (nama, jabatan, foto opsional) */
export async function lengkapiProfil(data: {
  nama: string;
  nama_panggilan: string;
  tanggal_lahir: string; // YYYY-MM-DD
  divisi: string;
  sub_divisi?: string;
  foto?: string;
}): Promise<UserLengkap> {
  const json = await fetchJson("/api/profil", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify(data),
  });
  return json.user as UserLengkap;
}

// ------------------------------------------------------------
// Konten akun resmi (halaman anggota)
// ------------------------------------------------------------

export type PostinganKonten = {
  id: string;
  caption: string;
  thumbnail_url: string;
  link: string;
  waktu_posting: string | null;
  /** Umur postingan yang sudah dihitung database, mis. "3 jam lalu" */
  waktu_relatif: string;
  jumlah_like: number;
  jumlah_komentar: number;
};

export type AkunKonten = {
  username: string;
  nama_akun: string;
  platform: string;
  link_profil: string;
  postingan: PostinganKonten[];
};

export type FeedKonten = {
  akun: AkunKonten[];
  /**
   * Kapan tabel feed terakhir diisi workflow n8n (ISO), null bila
   * workflow-nya belum pernah jalan. Dipakai layar untuk menulis
   * "Diperbarui X menit lalu" — jadi anggota tahu datanya masih segar
   * atau sudah basi, bukan menebak-nebak.
   */
  diperbarui_pada: string | null;
};

/**
 * Postingan terbaru akun resmi partai, dikelompokkan per akun.
 *
 * Berbeda dari fungsi lain di berkas ini, respons API-nya dibaca utuh
 * (bukan lewat `ambilData`) karena `diperbarui_pada` berada di tingkat
 * respons, di luar field `data`.
 */
export async function getKonten(): Promise<FeedKonten> {
  const json = await fetchJson("/api/konten");
  return {
    akun: (json?.data ?? []) as AkunKonten[],
    diperbarui_pada: (json?.diperbarui_pada ?? null) as string | null,
  };
}

/**
 * Feed SATU akun hingga 1000 postingan (fitur 1.22/bug 5) — dipakai
 * tampilan "expand" saat pengguna membuka arsip penuh sebuah akun.
 */
export async function getKontenAkun(
  username: string,
): Promise<AkunKonten | null> {
  const json = await fetchJson(
    `/api/konten?akun=${encodeURIComponent(username)}`,
  );
  const daftar = (json?.data ?? []) as AkunKonten[];
  return daftar[0] ?? null;
}

// ------------------------------------------------------------
// Akun media sosial milik pengguna (acuan QC)
// ------------------------------------------------------------

// QC multi-platform (fitur 1.22.x/2): kader mendaftarkan username untuk
// lima platform. Facebook tak termasuk — komentarnya tak bisa dicocokkan.
export type PlatformSosmed =
  "instagram" | "tiktok" | "twitter" | "threads" | "youtube";

export type AkunSosmed = {
  id: string;
  platform: PlatformSosmed;
  username: string;
  catatan: string | null;
  aktif: boolean;
};

/** Semua akun sosmed milik pengguna (boleh lebih dari satu per platform) */
/** Sakelar tutorial interaktif (Panel Master, 4 Sep 2026). Bawaan: aktif. */
export async function getTurAktif(): Promise<boolean> {
  const json = await fetchJson("/api/tur");
  return json.aktif !== false;
}

/** Sakelar fitur berat (Panel Master / mode hemat, 4 Sep 2026). */
export type SakelarFitur = { fitur: Record<string, boolean>; hemat: boolean; tur: boolean };
export async function getSakelar(): Promise<SakelarFitur> {
  const json = await fetchJson("/api/sakelar");
  return {
    fitur: (json.fitur ?? {}) as Record<string, boolean>,
    hemat: json.hemat === true,
    tur: json.tur !== false,
  };
}

export async function getAkunSosmed(): Promise<AkunSosmed[]> {
  const res = await fetch("/api/akun-sosmed", { headers: headerToken() });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? "Gagal memuat akun sosmed");
  return json.data as AkunSosmed[];
}

export async function tambahAkunSosmed(data: {
  platform: PlatformSosmed;
  username: string;
  catatan?: string;
}): Promise<AkunSosmed> {
  const json = await fetchJson("/api/akun-sosmed", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify(data),
  });
  return json.data as AkunSosmed;
}

export async function ubahAkunSosmed(data: {
  id: string;
  platform: PlatformSosmed;
  username: string;
  catatan?: string;
}): Promise<void> {
  await fetchJson("/api/akun-sosmed", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify(data),
  });
}

export async function hapusAkunSosmed(id: string): Promise<void> {
  await fetchJson("/api/akun-sosmed", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ id }),
  });
}

// ------------------------------------------------------------
// Ganti kata sandi (lewat OTP EMAIL terdaftar, maksimal 1x per minggu)
// ------------------------------------------------------------

/** Langkah 1: minta kode ke EMAIL terdaftar akun (tak perlu ketik apa pun) */
export async function mintaOtpGantiSandi(): Promise<void> {
  await fetchJson("/api/sandi", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({}),
  });
}

/** Langkah 2: kirim kode + sandi baru */
export async function gantiSandi(data: {
  kode: string;
  sandi_baru: string;
}): Promise<void> {
  await fetchJson("/api/sandi", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify(data),
  });
}

/** Ganti foto profil saja (sudah dipotong & dikompres di sisi klien) */
export async function gantiFotoProfil(foto: string): Promise<UserLengkap> {
  const json = await fetchJson("/api/profil", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ foto }),
  });
  return json.user as UserLengkap;
}

// ------------------------------------------------------------
// Kelola pengguna (khusus super admin)
// ------------------------------------------------------------

export type PenggunaAdmin = {
  id: string;
  nama: string;
  /** Nama panggilan (spek 1.18/2.2 tabel Database Anggota) */
  nama_panggilan?: string | null;
  /** Zona anggota (embed dari tabel zona) */
  zona_id?: string | number | null;
  zona?: { nama?: string } | { nama?: string }[] | null;
  email: string;
  username: string | null;
  nomor_wa: string | null;
  role: string;
  jabatan: string;
  avatar_url: string;
  status: string;
  aktif: boolean;
  wa_terverifikasi: boolean;
  profil_lengkap: boolean;
  created_at: string;
  disetujui_oleh: string | null;
  /** Bidang pelengkap jabatan, mis. "Bidang IT dan Infrastruktur" */
  bidang_jabatan?: string;
  divisi?: string;
  sub_divisi?: string;
  posisi_divisi?: string;
};

export async function getPengguna(): Promise<{
  data: PenggunaAdmin[];
  ringkasan: Record<string, number>;
}> {
  const res = await fetch("/api/pengguna", { headers: headerToken() });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.error ?? "Gagal memuat daftar pengguna");
  }
  return {
    data: json.data as PenggunaAdmin[],
    ringkasan: json.ringkasan as Record<string, number>,
  };
}

export async function ubahPengguna(
  id: string,
  tindakan:
    | "setujui"
    | "tolak"
    | "ubah_peran"
    | "nonaktifkan"
    | "aktifkan"
    | "hapus"
    | "ganti_sandi"
    | "ubah_jabatan"
    | "ubah_divisi",
  role?: string,
  jabatan?: string,
  bidang?: string,
  divisiInfo?: { divisi: string; sub_divisi?: string; posisi_divisi?: string },
): Promise<void> {
  await fetchJson("/api/pengguna", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({
      id,
      tindakan,
      role,
      jabatan,
      bidang,
      ...(divisiInfo ?? {}),
    }),
  });
}

// ------------------------------------------------------------
// QC Konten — akun wajib, kader, postingan, komentar, rekap
// ------------------------------------------------------------

/** Daftar akun wajib beserta statistik kepatuhannya */
/**
 * Daftar akun wajib + statistik kepatuhan. `periode` opsional (format
 * "YYYY-MM-DD 00:00-23:59") — kosong = periode terbaru (pilihan server).
 * Dipakai fitur Riwayat HR Center: memilih tanggal mengganti SELURUH
 * data layar ke periode itu.
 */
export async function getAkunWajib(
  periode?: string,
): Promise<AkunWajibWithStats[]> {
  const q = periode ? `?periode=${encodeURIComponent(periode)}` : "";
  return ambilData<AkunWajibWithStats[]>(`/api/akun-wajib${q}`);
}

/** Roster 24 kader aktif */
export async function getKader(): Promise<Kader[]> {
  return ambilData<Kader[]>("/api/kader");
}

/** Postingan terpantau milik sebuah akun (urut waktu naik) + kepatuhan kader */
export async function getPostinganByAkun(
  akun_wajib: string,
  periode?: string,
): Promise<PostinganWithKepatuhan[]> {
  const params = new URLSearchParams({ akun_wajib });
  if (periode) params.set("periode", periode);
  return ambilData<PostinganWithKepatuhan[]>(
    `/api/postingan?${params.toString()}`,
  );
}

/** Komentar tertangkap sebuah postingan (nama_kader null = warga) */
export async function getKomentarByPostingan(
  id_postingan: string,
): Promise<Komentar[]> {
  return ambilData<Komentar[]>(
    `/api/komentar?id_postingan=${encodeURIComponent(id_postingan)}`,
  );
}

/** Rekap kepatuhan sebuah postingan + ringkasan sudah/belum/persen */
export async function getRekapPostingan(
  id_postingan: string,
  periode?: string,
): Promise<{ rekap: Rekap[]; ringkasan: RingkasanPostingan }> {
  // Periode ikut dikirim: postingan hari transisi jendela QC punya rekap
  // di dua label periode — tanpa saringan ini kader terhitung dobel.
  const params = new URLSearchParams({ id_postingan });
  if (periode) params.set("periode", periode);
  const json = await fetchJson(`/api/rekap?${params.toString()}`);
  return {
    rekap: json.data as Rekap[],
    ringkasan: json.ringkasan as RingkasanPostingan,
  };
}

// ------------------------------------------------------------
// QC Konten — memicu analisis n8n lalu memantau sampai benar-benar selesai
// ------------------------------------------------------------

/**
 * Penanda laporan QC terakhir yang ADA DI DATABASE.
 * Bentuknya sama persis dengan yang dikirim /api/analisis.
 */
export type PenandaLaporanQc = {
  id: string | null;
  waktu: string | null;
  judul: string | null;
  isi: string | null;
};

export type HasilPantauAnalisis = {
  /** true hanya bila laporan BARU (milik run ini) sudah muncul */
  selesai: boolean;
  /** true bila pemantauan dihentikan layar (pindah halaman / tombol berhenti) */
  dibatalkan: boolean;
  laporan: PenandaLaporanQc | null;
};

/**
 * Tahap yang SEDANG dikerjakan n8n, ditulis workflow-nya sendiri ke tabel
 * qc_progres di tiap titik alur. Dipakai layar supaya daftar tahap loading
 * mengikuti proses nyata - bukan animasi berbasis hitungan waktu.
 */
export type ProgresAnalisis = {
  tahap: string;
  keterangan: string;
  selesai: boolean;
  mulai_pada: string | null;
  diperbarui_pada: string | null;
};

/**
 * Kemajuan pemeriksaan komentar untuk satu periode, dihitung dari status
 * per postingan di database. Inilah sumber kebenaran layar QC soal
 * "sudah dianalisis atau belum" -- bertahan walau aplikasi ditutup.
 */
export type AntrianQc = {
  periode: string;
  total: number;
  selesai: number;
  menunggu: number;
  gagal: number;
  perlu_cek_manual: number;
  terakhir_diperiksa: string | null;
};

/** Baca kemajuan antrian untuk satu periode. null = belum pernah didata. */
export async function getAntrianQc(periode: string): Promise<AntrianQc | null> {
  if (!periode) return null;
  try {
    const res = await fetch(
      "/api/analisis?periode=" + encodeURIComponent(periode),
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.antrian ?? null) as AntrianQc | null;
  } catch {
    // Gangguan sesaat tidak perlu meledak di layar -- pemanggilan
    // berikutnya akan mencoba lagi.
    return null;
  }
}

/**
 * Lanjutkan pemeriksaan antrian TANPA mendata ulang postingan.
 * Dipakai saat masih ada postingan berstatus menunggu.
 */
/** Riwayat seluruh analisis QC yang pernah dijalankan (per periode). */
export async function getRiwayatAnalisis(): Promise<AntrianQc[]> {
  const json = await fetchJson("/api/analisis?riwayat=1");
  return (json?.data ?? []) as AntrianQc[];
}

export async function lanjutkanPemeriksaanQc(periode: string): Promise<void> {
  await fetchJson("/api/analisis/lanjut", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ periode }),
  });
}

export type AwalAnalisis = {
  penanda: PenandaLaporanQc;
  /** Progres yang tercatat SEBELUM run ini dipicu - pembanding anti-basi */
  progresSebelum: ProgresAnalisis | null;
};

const PENANDA_KOSONG: PenandaLaporanQc = {
  id: null,
  waktu: null,
  judul: null,
  isi: null,
};

/** Jeda antar-pengecekan saat memantau analisis */
const JEDA_PANTAU_MS = 5000;

/** Batas menunggu laporan n8n; workflow normalnya 1–3 menit */
const BATAS_PANTAU_MS = 240_000;

/**
 * Apakah `baru` benar-benar laporan yang lebih baru dari `lama`?
 *
 * Ini inti kebenaran fitur ini. Laporan QC dari run KEMARIN tetap ada di
 * tabel notifikasi, jadi "ada laporan QC" bukan bukti apa-apa — yang jadi
 * bukti adalah id yang lebih besar dari yang tercatat sebelum tombol
 * ditekan. Tanpa perbandingan ini, analisis akan tampak selesai seketika.
 */
function laporanLebihBaru(
  baru: PenandaLaporanQc,
  lama: PenandaLaporanQc | null,
): boolean {
  if (!baru.id) return false;
  if (!lama?.id) return true; // sebelumnya belum pernah ada laporan sama sekali

  const a = Number(baru.id);
  const b = Number(lama.id);
  // id adalah bigint berurut; bandingkan sebagai angka bila memungkinkan
  if (Number.isFinite(a) && Number.isFinite(b)) return a > b;
  return baru.id !== lama.id;
}

/**
 * Tidur `ms`, tapi langsung bangun bila pemantauan dibatalkan.
 * Tanpa ini, membatalkan analisis masih harus menunggu sisa jeda 5 detik.
 */
function tidur(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((selesai) => {
    if (signal?.aborted) {
      selesai();
      return;
    }
    let batal = () => {};
    const pewaktu = setTimeout(() => {
      signal?.removeEventListener("abort", batal);
      selesai();
    }, ms);
    batal = () => {
      clearTimeout(pewaktu);
      selesai();
    };
    signal?.addEventListener("abort", batal, { once: true });
  });
}

/**
 * Picu workflow n8n "QC Konten v5 (TikHub)".
 *
 * Balasannya BUKAN tanda selesai — n8n sengaja membalas seketika lalu
 * bekerja 1–3 menit di latar belakang. Yang dikembalikan di sini adalah
 * penanda laporan LAMA, yang wajib diteruskan ke pantauAnalisisQc().
 */
export async function mulaiAnalisisQc(tanggal?: string): Promise<AwalAnalisis> {
  const json = await fetchJson("/api/analisis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Aturan baru: analisis PER HARI. Tanpa tanggal = hari ini (WIB).
    body: JSON.stringify(tanggal ? { tanggal } : {}),
  });
  return {
    penanda: (json?.penanda_sebelum ?? PENANDA_KOSONG) as PenandaLaporanQc,
    progresSebelum: (json?.progres_sebelum ?? null) as ProgresAnalisis | null,
  };
}

/**
 * Tunggu sampai n8n menuliskan laporan QC yang lebih baru dari
 * `penandaSebelum`.
 *
 * Memakai fetch langsung (bukan fetchJson) karena dipanggil berulang:
 * jeda buatan 300–800 ms milik fetchJson justru mengganggu polling.
 */
export async function pantauAnalisisQc(
  penandaSebelum: PenandaLaporanQc | null,
  opsi: {
    batasMs?: number;
    jedaMs?: number;
    signal?: AbortSignal;
    /**
     * Dipanggil tiap poll dengan progres TERBARU milik run ini. Progres yang
     * belum berubah dari `progresSebelum` disaring di sini, supaya layar
     * tidak menampilkan tahap sisa run kemarin sebagai tahap run sekarang.
     */
    onProgres?: (p: ProgresAnalisis) => void;
    progresSebelum?: ProgresAnalisis | null;
  } = {},
): Promise<HasilPantauAnalisis> {
  const jeda = opsi.jedaMs ?? JEDA_PANTAU_MS;
  const batas = opsi.batasMs ?? BATAS_PANTAU_MS;
  const mulai = Date.now();

  while (Date.now() - mulai < batas) {
    await tidur(jeda, opsi.signal);
    if (opsi.signal?.aborted) {
      return { selesai: false, dibatalkan: true, laporan: null };
    }

    let penanda: PenandaLaporanQc;
    try {
      // `no-store`: seluruh gunanya polling adalah melihat baris yang BARU.
      // Respons route ini tidak membawa header Cache-Control, jadi jangan
      // beri peramban kesempatan menyajikan jawaban lama — analisisnya bisa
      // tampak tidak pernah selesai.
      const res = await fetch("/api/analisis", {
        signal: opsi.signal,
        cache: "no-store",
      });
      if (!res.ok) continue; // gangguan sesaat bukan berarti analisisnya gagal
      const json = await res.json();
      penanda = (json?.penanda ?? PENANDA_KOSONG) as PenandaLaporanQc;

      // Teruskan progres HANYA bila benar-benar lebih baru dari catatan
      // sebelum run dipicu - pembanding diperbarui_pada (string ISO dari
      // jam database, jadi aman dibandingkan leksikografis).
      const progres = (json?.progres ?? null) as ProgresAnalisis | null;
      if (progres && opsi.onProgres) {
        const acuan = opsi.progresSebelum?.diperbarui_pada ?? "";
        if ((progres.diperbarui_pada ?? "") > acuan) opsi.onProgres(progres);
      }
    } catch {
      // Dibatalkan di tengah permintaan → berhenti; selain itu coba lagi.
      if (opsi.signal?.aborted) {
        return { selesai: false, dibatalkan: true, laporan: null };
      }
      continue;
    }

    if (laporanLebihBaru(penanda, penandaSebelum)) {
      return { selesai: true, dibatalkan: false, laporan: penanda };
    }
  }

  // Lewat batas waktu. Ini BUKAN kegagalan: n8n hampir pasti masih
  // bekerja, hanya lebih lambat dari biasanya. Layar yang menjelaskan.
  return { selesai: false, dibatalkan: false, laporan: null };
}

// ------------------------------------------------------------
// TV Rakyat — antrian video, proses video, berita
// ------------------------------------------------------------

/** Antrian & riwayat video + ringkasan jumlah per status */
export async function getVideoAntrian(): Promise<{
  data: VideoAntrian[];
  ringkasan: Record<string, number>;
}> {
  const json = await fetchJson("/api/video-antrian");
  return {
    data: json.data as VideoAntrian[],
    ringkasan: json.ringkasan as Record<string, number>,
  };
}

/**
 * Mulai proses video. Mengembalikan KODE ANTRIAN, bukan hasil jadi —
 * pekerjaannya (unduh, judul AI, render) dikerjakan n8n di latar
 * belakang dan bisa makan beberapa menit.
 *
 * Pantau kemajuannya dengan pantauVideo(kode).
 */
export async function prosesVideo(payload: {
  link: string;
  video_asli?: string;
  judul_overlay?: string;
  highlight?: string;
  caption_asli?: string;
  sumber_akun?: string;
  caption_sumber?: string;
}): Promise<{ kode: string }> {
  const json = await fetchJson("/api/proses-video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return json as { kode: string };
}

/**
 * Tanyakan sudah sampai tahap mana n8n memproses sebuah video.
 * Tanpa jeda buatan — ini dipanggil berulang kali (polling), jadi
 * jeda 300–800 ms milik fetchJson justru mengganggu.
 */
export async function pantauVideo(kode: string): Promise<KemajuanVideo> {
  const res = await fetch(`/api/video-antrian/${encodeURIComponent(kode)}`, {
    headers: headerToken(),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      json && typeof json.error === "string"
        ? json.error
        : `Gagal memantau proses video (${res.status})`,
    );
  }
  return json as KemajuanVideo;
}

/** Simpan suntingan admin pada judul overlay / caption / highlight */
export async function simpanSuntinganVideo(
  kode: string,
  ubahan: {
    judul_overlay?: string;
    caption_asli?: string;
    highlight?: string;
    /** Caption khusus per platform tujuan ({instagram: "...", ...}) */
    caption_platform?: Record<string, string>;
  },
): Promise<void> {
  await fetchJson(`/api/video-antrian/${encodeURIComponent(kode)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ubahan),
  });
}

/** Berita terbaru dari Nusantara TV (dibaca dari database) */
export async function getBeritaTerbaru(): Promise<Berita[]> {
  return ambilData<Berita[]>("/api/berita");
}

// Hasil scraping + status tiap item (fitur 1.22.x/5-bug)
export type HasilScraping = {
  kode: string;
  judul: string;
  sumber: string;
  platform: "instagram" | "tiktok";
  sumber_akun: string;
  link: string;
  thumbnail_url: string;
  jenis: string;
  waktu_terbit: string;
  tahap: "baru" | "ditugaskan" | "video_dibuat" | "tayang";
  penanggung: string;
  status_tugas: string | null;
};

export async function getHasilScraping(): Promise<HasilScraping[]> {
  const json = await fetchJson("/api/berita/hasil", { headers: headerToken() });
  return (json.data ?? []) as HasilScraping[];
}

// ------------------------------------------------------------
// Kelola sumber berita untuk scraping (fitur 1.22/bug 6)
// ------------------------------------------------------------

export type SumberBerita = {
  id: string;
  nama: string;
  username: string;
  platform: "instagram" | "tiktok";
  aktif: boolean;
};

export type DaftarSumberBerita = {
  data: SumberBerita[];
  interval_menit: number;
  interval_min: number;
  interval_maks: number;
};

export async function getSumberBerita(): Promise<DaftarSumberBerita> {
  const json = await fetchJson("/api/tv/sumber-berita", {
    headers: headerToken(),
  });
  return {
    data: (json?.data ?? []) as SumberBerita[],
    interval_menit: Number(json?.interval_menit ?? 60),
    interval_min: Number(json?.interval_min ?? 5),
    interval_maks: Number(json?.interval_maks ?? 1440),
  };
}

export async function tambahSumberBerita(data: {
  nama: string;
  username: string;
  platform: "instagram" | "tiktok";
}): Promise<void> {
  await fetchJson("/api/tv/sumber-berita", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "tambah", ...data }),
  });
}

/** Aktif/nonaktifkan satu sumber (mis. stop Lambe Turah). */
export async function toggleSumberBerita(id: string): Promise<boolean> {
  const json = await fetchJson("/api/tv/sumber-berita", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "toggle", id }),
  });
  return Boolean(json?.aktif);
}

export async function hapusSumberBerita(id: string): Promise<void> {
  await fetchJson("/api/tv/sumber-berita", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "hapus", id }),
  });
}

export async function setIntervalBerita(menit: number): Promise<number> {
  const json = await fetchJson("/api/tv/sumber-berita", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "interval", menit }),
  });
  return Number(json?.interval_menit ?? menit);
}

// ------------------------------------------------------------
// Keyword wajib laporan video (fitur 1.22.x/keyword)
// ------------------------------------------------------------

export type KeywordWajib = { id: string; keyword: string; aktif: boolean };

export async function getKeywordWajib(): Promise<{
  data: KeywordWajib[];
  pimred: boolean;
}> {
  const json = await fetchJson("/api/tv/keyword", { headers: headerToken() });
  return {
    data: (json.data ?? []) as KeywordWajib[],
    pimred: json.pimred === true,
  };
}

export async function tambahKeyword(keyword: string): Promise<void> {
  await fetchJson("/api/tv/keyword", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ keyword }),
  });
}

export async function toggleKeyword(id: string): Promise<void> {
  await fetchJson("/api/tv/keyword", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ id }),
  });
}

export async function hapusKeyword(id: string): Promise<void> {
  await fetchJson("/api/tv/keyword", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ id }),
  });
}

/**
 * Mulai pemindaian berita baru lewat n8n (Apify), lalu TUNGGU sampai
 * hasil barunya muncul di database.
 *
 * n8n membalas segera dan menyelesaikan scraping di latar belakang
 * (sekitar 60 detik untuk 6 profil), jadi fungsi ini memantau tabel
 * berita secara berkala alih-alih menunggu satu permintaan panjang
 * yang pasti kena batas waktu.
 *
 * Mengembalikan daftar terbaru + berapa yang benar-benar baru.
 */
export async function pindaiBeritaBaru(): Promise<{
  data: Berita[];
  jumlah_baru: number;
  selesai: boolean;
}> {
  const awal = await fetchJson("/api/berita", { method: "POST" });
  const sebelum = new Set(((awal.data as Berita[]) ?? []).map((b) => b.id));

  const JEDA_MS = 3000;
  const BATAS_MS = 120_000; // scraping 6 profil ~60 dtk; beri kelonggaran
  const mulai = Date.now();

  while (Date.now() - mulai < BATAS_MS) {
    await new Promise((r) => setTimeout(r, JEDA_MS));

    let sekarang: Berita[];
    try {
      sekarang = await ambilData<Berita[]>("/api/berita");
    } catch {
      continue; // gangguan sesaat bukan berarti pemindaian gagal
    }

    const baru = sekarang.filter((b) => !sebelum.has(b.id));
    if (baru.length > 0) {
      return { data: sekarang, jumlah_baru: baru.length, selesai: true };
    }
  }

  // Lewat batas tanpa ada yang baru. Bisa jadi memang tidak ada video
  // baru sejak pindai terakhir — bukan kegagalan, jadi tetap kembalikan
  // datanya dan biarkan layar yang menjelaskan.
  return {
    data: await ambilData<Berita[]>("/api/berita"),
    jumlah_baru: 0,
    selesai: false,
  };
}

// ------------------------------------------------------------
// Notifikasi & Dashboard
// ------------------------------------------------------------

/** Daftar notifikasi dalam aplikasi */
export async function getNotifikasi(): Promise<NotifikasiItem[]> {
  // Token disertakan supaya server bisa menyaring notifikasi sesuai
  // peran — tanpa itu semua orang menerima semua notifikasi.
  const res = await fetch("/api/notifikasi", { headers: headerToken() });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? "Gagal memuat notifikasi");
  return json.data as NotifikasiItem[];
}

/** Tandai satu notifikasi sudah dibaca (tersimpan permanen di database) */
export async function tandaiNotifikasiDibaca(id: string): Promise<void> {
  await fetchJson("/api/notifikasi", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
}

/** Tandai SEMUA notifikasi sudah dibaca */
export async function tandaiSemuaNotifikasiDibaca(): Promise<void> {
  await fetchJson("/api/notifikasi", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ semua: true }),
  });
}

/** Hapus satu notifikasi (dipakai gestur geser di layar Notifikasi) */
export async function hapusNotifikasiServer(id: string): Promise<void> {
  await fetchJson("/api/notifikasi", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
}

/**
 * Kirim pengingat WhatsApp ke semua kader yang belum komentar di
 * sebuah postingan. Pengirimannya dikerjakan n8n + Fonnte, bukan
 * oleh aplikasi ini.
 */
export async function ingatkanKaderBelumKomentar(
  id_postingan: string,
): Promise<{ terkirim: number; tanpa_nomor?: number; pesan?: string }> {
  return fetchJson("/api/ingatkan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_postingan }),
  });
}

/** Seluruh data dashboard super admin */
export async function getDashboard(): Promise<DashboardData> {
  const json = await fetchJson("/api/dashboard");
  return json as DashboardData;
}

/** Ringkasan 4 angka utama dashboard (kartu paling atas, 1 Sep 2026). */
export type RingkasUtama = {
  periode: string;
  tanggal: string;
  komen: {
    persen: number;
    kader_aktif: number;
    total_kader: number;
    diperbarui?: string | null;
  };
  absensi: { hadir: number; total: number };
  kerja: { sudah_lapor: number; total: number; rata: number };
  video: { tercapai: number; total: number; video_hari_ini: number };
};

export async function getRingkasUtama(): Promise<RingkasUtama> {
  const json = await fetchJson("/api/dashboard/ringkas");
  return json as RingkasUtama;
}

// ---- Dashboard TV Rakyat Nasional (1 Sep 2026) ----
export type MetrikNasional = {
  pengikut: number | null;
  tayangan: number | null;
  jangkauan: number | null;
  suka: number | null;
  komentar: number | null;
  bagikan: number | null;
};

export type TvNasional = {
  indikator: (keyof MetrikNasional)[];
  platforms: string[];
  total: MetrikNasional;
  per_platform: Record<
    string,
    {
      official: MetrikNasional | null;
      pengguna: MetrikNasional;
      total: MetrikNasional;
      akun_terbaca: number;
    }
  >;
  anggota: AnggotaTvrNasional[];
  cakupan: {
    profil_total: number;
    profil_terbaca: number;
    official_terbaca: number;
    catatan: string;
  };
};

export type AnggotaTvrNasional = {
  user_id: string;
  nama: string;
  avatar_url: string;
  profil: string;
  diperbarui: string | null;
  platform: Record<string, MetrikNasional | null>;
  /** Handle per platform (untuk tautan langsung ke profil sosmednya). */
  akun: Record<string, string>;
};

export async function getTvNasional(): Promise<TvNasional> {
  const json = await fetchJson("/api/dashboard/tv-nasional");
  return json as TvNasional;
}

// ---- Leaderboard mahkota TV Rakyat (1 Sep 2026, semua pengguna) ----
export type JuaraTvr = {
  user_id: string;
  nama: string;
  avatar_url: string;
  /** Peringkat terbaik yang diraih di kategori mana pun (1-3). */
  peringkat: number;
  total_pengikut: number;
  /** Jumlah kategori (sosmed × indikator) tempat dia juara 1-3. */
  kategori_juara: number;
};

export type PeringkatTvr = {
  platforms: string[];
  indikator: (keyof MetrikNasional)[];
  anggota: AnggotaTvrNasional[];
  top3: JuaraTvr[];
  diperbarui: string;
};

export async function getPeringkatTvr(): Promise<PeringkatTvr> {
  const json = await fetchJson("/api/peringkat-tvr");
  return json as PeringkatTvr;
}

/** Hanya tiga besar — untuk cincin badge di avatar (ringan). */
export async function getTop3Tvr(): Promise<JuaraTvr[]> {
  const json = await fetchJson("/api/peringkat-tvr?ringkas=1");
  return (json.top3 ?? []) as JuaraTvr[];
}

// ------------------------------------------------------------
// Periode QC
// ------------------------------------------------------------

/**
 * Daftar periode untuk dropdown pemilih periode (terbaru dulu).
 * Diambil dari periode yang BENAR-BENAR ada di database, bukan
 * ditebak dari tanggal hari ini seperti versi dummy dulu.
 *
 * Bila database belum berisi rekap sama sekali, dipakai daftar
 * cadangan berbasis tanggal supaya dropdown tidak kosong melompong.
 */
export async function getPeriodeList(): Promise<string[]> {
  try {
    const daftar = await ambilData<string[]>("/api/periode");
    if (daftar.length > 0) return daftar;
  } catch {
    // database belum siap → pakai cadangan di bawah
  }

  const dasar = new Date(`${PERIODE_AKTIF.slice(0, 10)}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(dasar.getTime() - i * 24 * 60 * 60 * 1000);
    return `${d.toISOString().slice(0, 10)} 00:00-23:59`;
  });
}

// ------------------------------------------------------------
// Absensi (kamera depan + GPS; data terhapus otomatis 7 hari)
// ------------------------------------------------------------

export type AbsensiBaris = {
  id: string;
  user_id: string;
  nama: string;
  jabatan: string;
  jenis: "masuk" | "pulang";
  waktu: string;
  tanggal_wib: string;
  lat: number;
  lng: number;
  akurasi_m: number | null;
  alamat: string | null;
  foto_url: string;
};

export async function getAbsensi(semua = false): Promise<{
  data: AbsensiBaris[];
  tanggal_hari_ini: string;
}> {
  const json = await fetchJson(`/api/absensi${semua ? "?semua=1" : ""}`, {
    headers: headerToken(),
  });
  return json as { data: AbsensiBaris[]; tanggal_hari_ini: string };
}

export async function kirimAbsen(data: {
  jenis: "masuk" | "pulang";
  lat: number;
  lng: number;
  akurasi?: number;
  fotoDataUrl: string;
}): Promise<AbsensiBaris> {
  const json = await fetchJson("/api/absensi", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify(data),
  });
  return json.data as AbsensiBaris;
}

// ------------------------------------------------------------
// Laporan Kerja (rencana pagi → laporan sore → KPI)
// ------------------------------------------------------------

export type KerjaItem = {
  id: string;
  user_id: string;
  tanggal_wib: string;
  deskripsi: string;
  jenis: "rencana" | "tambahan";
  status: "direncanakan" | "selesai" | "tidak_selesai";
  catatan_realisasi: string | null;
  dibuat_pada: string;
  dilaporkan_pada: string | null;
  kategori: "harian" | "besar";
  tenggat: string | null;
  ditugaskan_oleh: string | null;
  /** Nama atasan pemberi tugas; null = ditulis sendiri */
  nama_penugas: string | null;
};

export type KerjaKpi = {
  rencana_total: number;
  rencana_selesai: number;
  rencana_gagal: number;
  rencana_belum_lapor: number;
  tambahan_total: number;
  kpi_persen: number | null;
};

export type KerjaKpiBaris = KerjaKpi & {
  user_id: string;
  nama: string;
  jabatan: string | null;
  tanggal_wib: string;
};

export async function getLaporanKerja(
  tanggal?: string,
  userId?: string,
  kategori: "harian" | "besar" = "harian",
): Promise<{
  tanggal: string;
  hari_ini: string;
  data: KerjaItem[];
  kpi: KerjaKpi;
}> {
  const params = new URLSearchParams({ kategori });
  if (tanggal) params.set("tanggal", tanggal);
  if (userId) params.set("user", userId);
  const json = await fetchJson(`/api/laporan-kerja?${params.toString()}`, {
    headers: headerToken(),
  });
  return json as {
    tanggal: string;
    hari_ini: string;
    data: KerjaItem[];
    kpi: KerjaKpi;
  };
}

export async function getKpiSemua(
  tanggal?: string,
): Promise<{ tanggal: string; data: KerjaKpiBaris[] }> {
  const params = new URLSearchParams({ semua: "1" });
  if (tanggal) params.set("tanggal", tanggal);
  const json = await fetchJson(`/api/laporan-kerja?${params.toString()}`, {
    headers: headerToken(),
  });
  return json as { tanggal: string; data: KerjaKpiBaris[] };
}

export async function tambahRencanaKerja(
  deskripsi: string[],
  kategori: "harian" | "besar" = "harian",
  tenggat?: string,
): Promise<KerjaItem[]> {
  const json = await fetchJson("/api/laporan-kerja", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "rencana", deskripsi, kategori, tenggat }),
  });
  return json.data as KerjaItem[];
}

export async function tambahAktivitasKerja(
  deskripsi: string,
): Promise<KerjaItem> {
  const json = await fetchJson("/api/laporan-kerja", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "tambahan", deskripsi }),
  });
  return json.data as KerjaItem;
}

export async function laporkanKerjaItem(data: {
  id: string;
  status: "selesai" | "tidak_selesai";
  catatan?: string;
}): Promise<KerjaItem> {
  const json = await fetchJson("/api/laporan-kerja", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify(data),
  });
  return json.data as KerjaItem;
}

export async function hapusKerjaItem(id: string): Promise<void> {
  await fetchJson("/api/laporan-kerja", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ id }),
  });
}

// ------------------------------------------------------------
// Ayrshare — insight profil & unggah sosmed sungguhan (TV Rakyat)
// ------------------------------------------------------------

export type InsightProfil = {
  platform: string;
  username: string;
  nama: string;
  fotoProfil: string;
  pengikut: number | null;
  mengikuti: number | null;
  jumlahMedia: number | null;
  suka: number | null;
  komentar: number | null;
  jangkauan: number | null;
  tayangan: number | null;
  diperbarui: string | null;
  berikutnya: string | null;
  catatan: string[];
};

export type AkunTertaut = {
  platform: string;
  username: string;
  displayName: string;
  profileUrl: string;
  userImage: string;
};

export type BalasanInsight = {
  siap: boolean;
  pesan?: string;
  dariCache?: boolean;
  kedaluwarsa?: boolean;
  insight: InsightProfil | null;
  akun: {
    platformAktif: string[];
    akun: AkunTertaut[];
    postBulanIni: number;
  } | null;
};

/** Insight profil sosmed. `paksa` melewati cache — pakai hemat, kuota API terbatas. */
export async function getInsightSosmed(
  paksa = false,
  platform = "instagram",
): Promise<BalasanInsight> {
  const params = new URLSearchParams({ platform });
  if (paksa) params.set("paksa", "1");
  const json = await fetchJson(`/api/tv/insight?${params.toString()}`, {
    headers: headerToken(),
  });
  return json as BalasanInsight;
}

export type HasilUnggahPlatform = {
  platform: string;
  status: string;
  id: string;
  postUrl: string;
  pesan: string;
};

export type BalasanUnggah = {
  sukses: boolean;
  hasil: HasilUnggahPlatform[];
  berhasil: number;
  total: number;
  link: string;
  catatan_simpan: string | null;
};

/** Unggah video ke sosmed lewat Ayrshare — SUNGGUHAN, tidak bisa ditarik kembali. */
export async function unggahVideoSosmed(
  kode: string,
  platforms: string[],
  /** Sampul base64 jpg/png <2MB — dipasang ke YT/IG/TikTok/FB (opsional). */
  sampulDataUrl?: string,
): Promise<BalasanUnggah> {
  const json = await fetchJson("/api/tv/unggah", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ kode, platforms, sampulDataUrl }),
  });
  return json as BalasanUnggah;
}

// ------------------------------------------------------------
// Akun TV Rakyat anggota + pelaporan video (KPI 5/hari)
// ------------------------------------------------------------

export type AkunTvr = {
  id: string;
  platform: string;
  username: string;
  aktif: boolean;
  /** true = hasil penautan login sungguhan (spek 1.17) */
  terhubung?: boolean;
};

export async function getAkunTvr(): Promise<AkunTvr[]> {
  const json = await fetchJson("/api/tvr/akun", { headers: headerToken() });
  return json.data as AkunTvr[];
}

export async function tambahAkunTvr(
  platform: string,
  username: string,
): Promise<AkunTvr> {
  const json = await fetchJson("/api/tvr/akun", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ platform, username }),
  });
  return json.data as AkunTvr;
}

export async function hapusAkunTvr(id: string): Promise<void> {
  await fetchJson("/api/tvr/akun", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ id }),
  });
}

export type LaporanVideo = {
  id: string;
  platform: string;
  url_video: string;
  keyword: string | null;
  tanggal_wib: string;
  dibuat_pada: string;
};

/** Rincian capaian satu platform (aturan KPI 5x6). */
export type RincianPlatformKpi = {
  platform: string;
  jumlah: number;
  target: number;
  banned: boolean;
};

export type BalasanLaporanVideo = {
  tanggal: string;
  hari_ini: string;
  data: LaporanVideo[];
  /** Target TOTAL (per-platform x platform aktif; bawaan 30). */
  kpi_target: number;
  /** Persen KETAT per platform (2 Sep 2026). */
  kpi_persen?: number;
  /** Tercapai KETAT: tiap platform aktif >= target per platform. */
  kpi_tercapai: boolean;
  per_platform: RincianPlatformKpi[];
  dibebaskan: string | null;
  /** Laporan manual (link) yang menunggu ACC HR / ditolak 7 hari terakhir. */
  menunggu?: LaporanPending[];
};

export type LaporanPending = {
  id: string;
  platform: string;
  url_video: string;
  keyword: string | null;
  tanggal_wib: string;
  dibuat_pada: string;
  status: "menunggu" | "disetujui" | "ditolak";
  catatan: string;
};

export async function getLaporanVideo(
  tanggal?: string,
): Promise<BalasanLaporanVideo> {
  const params = new URLSearchParams();
  if (tanggal) params.set("tanggal", tanggal);
  const json = await fetchJson(`/api/tvr/laporan?${params.toString()}`, {
    headers: headerToken(),
  });
  return json as BalasanLaporanVideo;
}

export type RekapVideoBaris = {
  user_id: string;
  nama: string;
  jumlah: number;
  tercapai: boolean;
  dibebaskan: string | null;
};

export async function getRekapVideoSemua(tanggal?: string): Promise<{
  tanggal: string;
  kpi_target: number;
  data: RekapVideoBaris[];
  /** Target khusus per akun yang disetel HR/QC (spek 3.1) */
  target_khusus: { user_id: string; kpi: number }[];
}> {
  const params = new URLSearchParams({ semua: "1" });
  if (tanggal) params.set("tanggal", tanggal);
  const json = await fetchJson(`/api/tvr/laporan?${params.toString()}`, {
    headers: headerToken(),
  });
  return {
    tanggal: json.tanggal as string,
    kpi_target: Number(json.kpi_target ?? 30),
    data: (json.data ?? []) as RekapVideoBaris[],
    target_khusus: (json.target_khusus ?? []) as {
      user_id: string;
      kpi: number;
    }[],
  };
}

// --- Lapor akun kena banned (aturan KPI 5x6) ---

export type BannedKu = {
  id: string;
  platform: string;
  bukti_url: string;
  keterangan: string | null;
  dibuat_pada: string;
  /** menunggu | disetujui | ditolak (permohonan, 2 Sep 2026) */
  status?: string;
  catatan_putusan?: string;
};

/** Laporan banned SAYA yang masih aktif. */
export async function getBannedKu(): Promise<BannedKu[]> {
  const json = await fetchJson("/api/tvr/banned", { headers: headerToken() });
  return (json.data ?? []) as BannedKu[];
}

/** Semua laporan banned aktif + bukti (HR/pengurus). */
export async function getBannedSemua(): Promise<
  (BannedKu & { user_id: string; nama: string })[]
> {
  const json = await fetchJson("/api/tvr/banned?semua=1", {
    headers: headerToken(),
  });
  return (json.data ?? []) as (BannedKu & { user_id: string; nama: string })[];
}

/** Lapor akun kena banned — target KPI platform itu langsung dikecualikan. */
export async function laporBanned(data: {
  platform: string;
  buktiDataUrl: string;
  keterangan?: string;
}): Promise<void> {
  await fetchJson("/api/tvr/banned", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify(data),
  });
}

/** Cabut laporan banned (pemilik saat akun pulih, atau HR). */
export async function cabutBanned(id: string): Promise<void> {
  await fetchJson("/api/tvr/banned", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ id }),
  });
}

export async function tambahLaporanVideo(
  platform: string,
  url: string,
  keyword?: string,
): Promise<LaporanVideo> {
  const json = await fetchJson("/api/tvr/laporan", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ platform, url, keyword }),
  });
  return json.data as LaporanVideo;
}

export async function hapusLaporanVideo(
  id: string,
  pending = false,
): Promise<void> {
  await fetchJson("/api/tvr/laporan", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ id, pending }),
  });
}

// ------------------------------------------------------------
// Struktur tim & penugasan
// ------------------------------------------------------------

export type AnggotaTimPantau = {
  user_id: string;
  nama: string;
  jabatan: string;
  avatar_url: string;
  /** 'menunggu' = pengajuan belum di-ACC super admin / HR */
  status_tim: "menunggu" | "disetujui";
  kehadiran: string;
  video_hari_ini: number;
  kpi_persen: number | null;
  rencana_total: number;
  rencana_selesai: number;
};

export type KandidatTim = {
  id: string;
  nama: string;
  jabatan: string;
  avatar_url: string;
};

export type BalasanTim = {
  boleh_punya_tim: boolean;
  atasan: { nama: string } | null;
  tanggal?: string;
  tim: AnggotaTimPantau[];
  kandidat: KandidatTim[];
};

export async function getTim(): Promise<BalasanTim> {
  const json = await fetchJson("/api/tim", { headers: headerToken() });
  return json as BalasanTim;
}

export async function tambahAnggotaTim(anggotaId: string): Promise<void> {
  await fetchJson("/api/tim", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "tambah", anggota_id: anggotaId }),
  });
}

export async function keluarkanAnggotaTim(anggotaId: string): Promise<void> {
  await fetchJson("/api/tim", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "keluarkan", anggota_id: anggotaId }),
  });
}

export async function kirimTugas(data: {
  anggotaId: string;
  deskripsi: string;
  kategori: "harian" | "besar";
  tenggat?: string;
}): Promise<void> {
  await fetchJson("/api/tim", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({
      aksi: "tugas",
      anggota_id: data.anggotaId,
      deskripsi: data.deskripsi,
      kategori: data.kategori,
      tenggat: data.tenggat,
    }),
  });
}

// ------------------------------------------------------------
// Perizinan (izin/sakit + surat)
// ------------------------------------------------------------

export type Perizinan = {
  id: string;
  user_id: string;
  nama: string;
  tanggal_wib: string;
  jenis: "izin" | "sakit";
  keterangan: string | null;
  status: "menunggu" | "disetujui" | "ditolak";
  catatan_keputusan: string | null;
  dibuat_pada: string;
  diputuskan_pada: string | null;
  surat_url: string;
};

export async function getPerizinan(semua = false): Promise<Perizinan[]> {
  const json = await fetchJson(`/api/perizinan${semua ? "?semua=1" : ""}`, {
    headers: headerToken(),
  });
  return json.data as Perizinan[];
}

export async function ajukanPerizinan(data: {
  jenis: "izin" | "sakit";
  keterangan?: string;
  suratDataUrl: string;
}): Promise<void> {
  await fetchJson("/api/perizinan", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify(data),
  });
}

export async function putuskanPerizinan(data: {
  id: string;
  keputusan: "disetujui" | "ditolak";
  catatan?: string;
}): Promise<void> {
  await fetchJson("/api/perizinan", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify(data),
  });
}

// ------------------------------------------------------------
// Rilis / update aplikasi
// ------------------------------------------------------------

export type RilisAplikasi = {
  versi: string;
  catatan: string[];
  wajib: boolean;
  url_unduhan: string | null;
  dibuat_pada: string;
};

export async function getVersiTerbaru(): Promise<RilisAplikasi | null> {
  try {
    const json = await fetchJson("/api/versi");
    return (json?.terbaru ?? null) as RilisAplikasi | null;
  } catch {
    return null;
  }
}

export async function umumkanRilis(data: {
  versi: string;
  catatan: string[];
  wajib?: boolean;
  url_unduhan?: string;
}): Promise<void> {
  await fetchJson("/api/versi", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify(data),
  });
}

/** Riwayat 7 hari jumlah laporan video sendiri (untuk grafik). */
export async function getRiwayatVideo7Hari(): Promise<{
  data: { tanggal: string; jumlah: number }[];
  kpi_target: number;
}> {
  const json = await fetchJson("/api/tvr/laporan?riwayat=1", {
    headers: headerToken(),
  });
  return json as {
    data: { tanggal: string; jumlah: number }[];
    kpi_target: number;
  };
}

/** Rencana besar SEMUA anggota (pantauan admin) — belum tuntas dulu. */
export type RencanaBesarBaris = KerjaItem & { nama: string };
export async function getRencanaBesarSemua(): Promise<RencanaBesarBaris[]> {
  const json = await fetchJson("/api/laporan-kerja?semua=1&kategori=besar", {
    headers: headerToken(),
  });
  return json.data as RencanaBesarBaris[];
}

// ------------------------------------------------------------
// TV Rakyat: persetujuan Pimred + video manual anggota
// ------------------------------------------------------------

/** Pimred menyetujui / menolak sebuah video sebelum tayang. */
export async function putuskanVideo(
  kode: string,
  keputusan: "disetujui" | "ditolak",
  catatan?: string,
): Promise<void> {
  await fetchJson("/api/tv/persetujuan", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ kode, keputusan, catatan }),
  });
}

export type KonfigUploadVideo = {
  cloudName: string;
  uploadPreset: string;
  retensi_jam: number;
  /** Batas ukuran berkas dari Pimred, MB (fitur 1.20/6) */
  maks_upload_mb: number;
  /** Video di atas ini dikompres otomatis Cloudinary sampai <= nilai ini (MB, 5 Sep 2026) */
  kompres_mb?: number;
  /** Batas berkas paket Cloudinary (MB) — di atas ini upload ditolak Cloudinary */
  berkas_maks_mb?: number;
};

export type HasilKompresVideo = {
  perlu: boolean;
  secure_url: string;
  bytes: number;
  transformasi: string;
  br_kbps: number;
  percobaan: number;
  kompres_mb: number;
};
/** Minta Cloudinary mengompres video yang baru diunggah sampai <= 50 MB (kualitas dijaga). */
export async function kompresVideoCloudinary(data: { public_id: string; bytes: number; duration: number }): Promise<HasilKompresVideo> {
  const json = await fetchJson("/api/media/kompres", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify(data),
  });
  return json as HasilKompresVideo;
}

export async function getKonfigUploadVideo(): Promise<KonfigUploadVideo> {
  const json = await fetchJson("/api/tv/manual?konfig=1", {
    headers: headerToken(),
  });
  return json as KonfigUploadVideo;
}

export type KirimanManual = {
  kode: string;
  judul: string;
  status: string;
  persetujuan: string;
  persetujuan_oleh: string | null;
  thumbnail_url: string | null;
  hasil_render_url: string | null;
  jam_tanggal: string;
  hapus_media_pada: string | null;
  media_masih_ada: boolean;
  platform_terunggah: string[] | null;
};

export async function getKirimanManual(): Promise<{
  data: KirimanManual[];
  retensi_jam: number;
}> {
  const json = await fetchJson("/api/tv/manual", { headers: headerToken() });
  return json as { data: KirimanManual[]; retensi_jam: number };
}

/** Catat hasil upload Cloudinary sebagai antrean menunggu ACC Pimred. */
export async function daftarkanVideoManual(data: {
  secure_url: string;
  public_id: string;
  judul?: string;
  caption?: string;
  tugas_id?: string;
  /** Ukuran berkas (byte) dari respons Cloudinary — diperiksa server */
  bytes?: number;
}): Promise<string> {
  const json = await fetchJson("/api/tv/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify(data),
  });
  return json.kode as string;
}

// ------------------------------------------------------------
// Jadwal Posting TV Rakyat Official (fitur 1.22.x/3)
// ------------------------------------------------------------

export type JadwalPosting = {
  id: string;
  caption: string;
  media_url: string;
  is_video: boolean;
  platforms: string[];
  judul_youtube: string;
  jadwal_pada: string;
  status: "terjadwal" | "terkirim" | "gagal" | "dibatalkan";
  error: string | null;
  oleh: string;
  dibuat_pada: string;
};

export async function getJadwalPosting(): Promise<JadwalPosting[]> {
  const json = await fetchJson("/api/tv/jadwal", { headers: headerToken() });
  return (json.data ?? []) as JadwalPosting[];
}

/** Jadwalkan satu posting ke Ayrshare (Ayrshare menerbitkan pada waktunya). */
export async function jadwalkanPosting(data: {
  caption: string;
  media_url: string;
  media_public_id?: string;
  is_video: boolean;
  platforms: string[];
  judul_youtube?: string;
  /** ISO string waktu tayang (mis. dari input datetime-local, dikonversi). */
  jadwal_pada: string;
  /** Sampul base64 jpg/png <2MB — YT/IG/TikTok/FB (opsional). */
  sampulDataUrl?: string;
}): Promise<{ id: string; status: string; ayrshare_id: string }> {
  const json = await fetchJson("/api/tv/jadwal", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify(data),
  });
  return json as { id: string; status: string; ayrshare_id: string };
}

/** Batalkan jadwal yang belum tayang (dihapus juga di Ayrshare). */
export async function batalkanJadwalPosting(id: string): Promise<void> {
  await fetchJson("/api/tv/jadwal", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ id }),
  });
}

// ------------------------------------------------------------
// Chat internal + pengumuman berjenjang
// ------------------------------------------------------------

export type ChatKontak = {
  id: string;
  lawan_id: string;
  lawan_nama: string;
  lawan_avatar: string;
  status: "menunggu" | "diterima";
  diminta_oleh: string;
  cuplikan: string;
  waktu_terakhir: string;
  belum_dibaca: number;
  /** Streak chat berpasangan (0 = belum ada / putus) */
  streak_hari?: number;
};

export type ChatPesan = {
  id: string;
  pengirim_id: string;
  isi: string;
  dibaca: boolean;
  dibuat_pada: string;
  /** URL gambar bila ini pesan gambar */
  gambar_url?: string;
  /** Hanya di jalur pantau pengawas: pesan sudah ditarik pengguna */
  dihapus?: boolean;
};

export async function getDaftarChat(): Promise<{
  chat_aktif: boolean;
  chat_mode: "terbuka" | "persetujuan";
  pengawas: boolean;
  data: ChatKontak[];
}> {
  const json = await fetchJson("/api/chat", { headers: headerToken() });
  return {
    chat_aktif: json.chat_aktif !== false,
    chat_mode: json.chat_mode === "persetujuan" ? "persetujuan" : "terbuka",
    pengawas: Boolean(json.pengawas),
    data: (json.data ?? []) as ChatKontak[],
  };
}

export type KandidatChat = {
  id: string;
  nama: string;
  jabatan: string;
  avatar_url: string;
  /** Hanya terisi untuk super admin; null bagi anggota biasa */
  nomor_wa: string | null;
};

export async function getKandidatChat(): Promise<KandidatChat[]> {
  const json = await fetchJson("/api/chat?kandidat=1", {
    headers: headerToken(),
  });
  return json.data as KandidatChat[];
}

export async function getPesanChat(
  kontakId: string,
  sejak?: string,
): Promise<{
  status: string;
  diminta_oleh: string;
  /** Pesan-ID milikku yang terakhir dibaca lawan (utk ceklis biru) */
  terbaca_sampai: string;
  data: ChatPesan[];
}> {
  const params = new URLSearchParams({ kontak: kontakId });
  if (sejak) params.set("sejak", sejak);
  const json = await fetchJson(`/api/chat?${params.toString()}`, {
    headers: headerToken(),
  });
  return {
    status: json.status as string,
    diminta_oleh: json.diminta_oleh as string,
    terbaca_sampai: (json.terbaca_sampai as string) ?? "0",
    data: (json.data ?? []) as ChatPesan[],
  };
}

export async function mulaiChat(
  targetId: string,
  isi?: string,
): Promise<string> {
  const json = await fetchJson("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "mulai", target_id: targetId, isi }),
  });
  return json.kontak_id as string;
}

/** Seperti mulaiChat, tapi ikut mengembalikan status kontaknya. */
export async function mulaiChatLengkap(
  targetId: string,
): Promise<{ kontak_id: string; status: string }> {
  const json = await fetchJson("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "mulai", target_id: targetId }),
  });
  return {
    kontak_id: json.kontak_id as string,
    status: (json.status as string) ?? "menunggu",
  };
}

export async function jawabChat(
  kontakId: string,
  terima: boolean,
): Promise<void> {
  await fetchJson("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({
      aksi: terima ? "terima" : "tolak",
      kontak_id: kontakId,
    }),
  });
}

export async function kirimPesanChat(
  kontakId: string,
  isi: string,
  gambar?: string,
): Promise<{ id: string; dibuat_pada: string; gambar_url: string }> {
  const json = await fetchJson("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "kirim", kontak_id: kontakId, isi, gambar }),
  });
  // id & dibuat_pada ASLI dari server — dipakai penampil supaya pesan
  // yang baru dikirim tidak ikut tertarik lagi oleh polling (bug
  // "pesan dobel" 1.15).
  return {
    id: (json.id as string) ?? "",
    dibuat_pada: (json.dibuat_pada as string) ?? new Date().toISOString(),
    gambar_url: (json.gambar_url as string) ?? "",
  };
}

/** Tarik satu pesan — hilang dari tampilan kedua pihak (spek 1.14). */
export async function hapusPesanChat(pesanId: string): Promise<void> {
  await fetchJson("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "hapus_pesan", pesan_id: pesanId }),
  });
}

/** Master mengubah mode chat: terbuka (bebas) vs persetujuan (lama). */
export async function setModeChat(
  mode: "terbuka" | "persetujuan",
): Promise<void> {
  await fetchJson("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "mode", mode }),
  });
}

export async function tandaiChatDibaca(kontakId: string): Promise<void> {
  await fetchJson("/api/chat", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ kontak_id: kontakId }),
  }).catch(() => undefined);
}

export type Pengumuman = {
  id: string;
  pengirim_nama: string;
  judul: string;
  isi: string;
  cakupan: "semua" | "jabatan" | "tim";
  jabatan_target: string | null;
  jumlah_penerima: number;
  dibuat_pada: string;
  dari_saya: boolean;
};

export type CakupanPengumuman = "semua" | "jabatan" | "tim" | "divisi";

export async function getPengumuman(): Promise<{
  cakupan_boleh: CakupanPengumuman[];
  jabatan_pilihan: readonly string[];
  data: Pengumuman[];
}> {
  const json = await fetchJson("/api/pengumuman", { headers: headerToken() });
  return json as {
    cakupan_boleh: CakupanPengumuman[];
    jabatan_pilihan: readonly string[];
    data: Pengumuman[];
  };
}

export async function kirimPengumuman(data: {
  judul: string;
  isi: string;
  cakupan: CakupanPengumuman;
  jabatan_target?: string;
  divisi_target?: string;
  /** id pengguna yang dikecualikan (fitur 1.22.x/1) */
  kecuali?: string[];
  /** true = kirim juga isi pengumuman ke WhatsApp semua penerima */
  kirim_wa?: boolean;
}): Promise<{
  jumlah_penerima: number;
  wa_diminta: boolean;
  wa_aktif: boolean;
}> {
  const json = await fetchJson("/api/pengumuman", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify(data),
  });
  return {
    jumlah_penerima: json.jumlah_penerima as number,
    // wa_diminta = toggle dinyalakan; wa_aktif = template Convia siap
    // (kalau diminta tapi tak aktif, UI memberi tahu admin apa adanya).
    wa_diminta: Boolean(json.wa_diminta),
    wa_aktif: Boolean(json.wa_aktif),
  };
}

// ------------------------------------------------------------
// ACC keanggotaan tim (super admin / admin HR)
// ------------------------------------------------------------

export type PengajuanTim = {
  id: string;
  atasan_nama: string;
  atasan_jabatan: string;
  anggota_nama: string;
  dibuat_pada: string;
};

export async function getPengajuanTim(): Promise<PengajuanTim[]> {
  const json = await fetchJson("/api/tim?acc=1", { headers: headerToken() });
  return json.data as PengajuanTim[];
}

export async function putuskanPengajuanTim(
  id: string,
  setuju: boolean,
): Promise<void> {
  await fetchJson("/api/tim", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({
      aksi: setuju ? "acc" : "tolak_acc",
      anggota_id: id,
    }),
  });
}

/** Perbaiki laporan video sendiri (hanya hari ini). */
export async function ubahLaporanVideo(
  id: string,
  platform: string,
  url: string,
  keyword?: string,
): Promise<LaporanVideo> {
  const json = await fetchJson("/api/tvr/laporan", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ id, platform, url, keyword }),
  });
  return json.data as LaporanVideo;
}

/** Perbaiki akun TV Rakyat sendiri (platform / username salah ketik). */
export async function ubahAkunTvr(
  id: string,
  platform: string,
  username: string,
): Promise<void> {
  await fetchJson("/api/tvr/akun", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ id, platform, username }),
  });
}

// ------------------------------------------------------------
// Masukan pengembang (bug / kritik / saran → super admin)
// ------------------------------------------------------------

export type Masukan = {
  id: string;
  nama: string;
  jenis: "bug" | "kritik" | "saran";
  isi: string;
  dibuat_pada: string;
};

export async function kirimMasukan(jenis: string, isi: string): Promise<void> {
  await fetchJson("/api/masukan", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ jenis, isi }),
  });
}

export async function getMasukan(): Promise<Masukan[]> {
  const json = await fetchJson("/api/masukan", { headers: headerToken() });
  return json.data as Masukan[];
}

// ------------------------------------------------------------
// Kewenangan pengawas chat (super admin / master)
// ------------------------------------------------------------

export type ChatPantau = {
  id: string;
  nama_a: string;
  nama_b: string;
  status: string;
  dibuat_pada: string;
};

/** Seluruh percakapan di sistem + status sakelar fitur chat. */
export async function getPantauChat(): Promise<{
  chat_aktif: boolean;
  chat_mode: "terbuka" | "persetujuan";
  data: ChatPantau[];
}> {
  const json = await fetchJson("/api/chat?pantau=1", {
    headers: headerToken(),
  });
  return {
    chat_aktif: json.chat_aktif !== false,
    chat_mode: json.chat_mode === "persetujuan" ? "persetujuan" : "terbuka",
    data: (json.data ?? []) as ChatPantau[],
  };
}

/** Isi satu percakapan milik orang lain (pemantauan). */
export async function getPesanPantau(kontakId: string): Promise<ChatPesan[]> {
  const json = await fetchJson(
    `/api/chat?pantau=1&kontak=${encodeURIComponent(kontakId)}`,
    {
      headers: headerToken(),
    },
  );
  return (json.data ?? []) as ChatPesan[];
}

/** Nyalakan / matikan fitur chat untuk semua orang. */
export async function setSakelarChat(nyala: boolean): Promise<void> {
  await fetchJson("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "sakelar", nyala }),
  });
}

/** Hapus percakapan (peserta sendiri, atau siapa pun bila super admin). */
export async function hapusChat(kontakId: string): Promise<void> {
  await fetchJson("/api/chat", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ kontak_id: kontakId }),
  });
}

// ------------------------------------------------------------
// Insight rinci per postingan (TV Rakyat)
// ------------------------------------------------------------

export type PostinganInsight = {
  id: string;
  teks: string;
  url: string;
  thumbnail: string;
  jenis: string;
  waktu: string | null;
  metrik: { label: string; nilai: number }[];
};

export async function getInsightDetail(
  platform: string,
  paksa = false,
): Promise<{
  siap: boolean;
  pesan?: string;
  dariCache?: boolean;
  data: PostinganInsight[];
}> {
  const params = new URLSearchParams({ platform });
  if (paksa) params.set("paksa", "1");
  const json = await fetchJson(`/api/tv/insight/detail?${params.toString()}`, {
    headers: headerToken(),
  });
  return json as {
    siap: boolean;
    pesan?: string;
    dariCache?: boolean;
    data: PostinganInsight[];
  };
}

/** Hapus video dari antrian TV Rakyat (belum tayang saja). */
export async function hapusVideoAntrian(
  kode: string,
  paksa = false,
): Promise<void> {
  // paksa=true (fitur 1.22/bug 3): hapus juga catatan video yang SUDAH
  // tayang di sosmed — dipakai gestur swipe-ke-kanan. Postingannya di
  // sosmed tidak ikut turun; yang dihapus hanya catatan di aplikasi.
  const kueri = paksa ? "?paksa=1" : "";
  await fetchJson(`/api/video-antrian/${encodeURIComponent(kode)}${kueri}`, {
    method: "DELETE",
    headers: headerToken(),
  });
}

// ------------------------------------------------------------
// Panel Master (khusus peran master)
// ------------------------------------------------------------

export type DataMaster = {
  ringkasan: {
    pengguna_aktif: number;
    percakapan: number;
    video: number;
    galat: number;
  };
  log: {
    id: string;
    waktu: string;
    jenis: string;
    pesan: string;
    versi: string;
    perangkat: string;
  }[];
  akun_wajib: {
    id: string;
    username: string;
    platform: string;
    nama_tampilan: string;
    aktif: boolean;
  }[];
  pengaturan: Record<string, string>;
};

export async function getDataMaster(): Promise<DataMaster> {
  const json = await fetchJson("/api/master", { headers: headerToken() });
  return json as DataMaster;
}

export async function aksiMaster(
  aksi: string,
  data: Record<string, string | boolean> = {},
): Promise<void> {
  await fetchJson("/api/master", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi, ...data }),
  });
}

/** Sama seperti aksiMaster, tetapi mengembalikan jawaban server (mis. hasil pantau server). */
export async function aksiMasterHasil(
  aksi: string,
  data: Record<string, string | boolean> = {},
): Promise<Record<string, unknown>> {
  const json = await fetchJson("/api/master", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi, ...data }),
  });
  return (json ?? {}) as Record<string, unknown>;
}

// ------------------------------------------------------------
// Izin fitur per peran (diatur super admin)
// ------------------------------------------------------------

import type { DefinisiFitur, PetaIzin } from "@/lib/fitur";

/** Izin fitur untuk peran saya. Kunci yang tidak ada = fitur nyala. */
export async function getIzinFitur(): Promise<PetaIzin> {
  try {
    const json = await fetchJson("/api/fitur", { headers: headerToken() });
    return (json?.izin ?? {}) as PetaIzin;
  } catch {
    // Gagal memuat matriks tidak boleh mengunci aplikasi.
    return {};
  }
}

export type MatriksFitur = {
  katalog: DefinisiFitur[];
  peran: { id: string; label: string }[];
  /** Daftar divisi — target "divisi:<nama>" (spek 1.16) */
  divisi: string[];
  /** target (peran / "divisi:<nama>") → fitur yang DIMATIKAN */
  mati: Record<string, string[]>;
};

export async function getMatriksFitur(): Promise<MatriksFitur> {
  const json = await fetchJson("/api/fitur?matriks=1", {
    headers: headerToken(),
  });
  return json as MatriksFitur;
}

export async function setIzinFitur(
  peran: string,
  fitur: string,
  aktif: boolean,
): Promise<void> {
  await fetchJson("/api/fitur", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ peran, fitur, aktif }),
  });
}

// ------------------------------------------------------------
// v1.19 — modul Dashboard per jabatan (fitur 3.3)
// ------------------------------------------------------------

/** Kunci sub-dashboard yang boleh dibuka jabatan saya. */
export async function getAksesDashboard(): Promise<string[]> {
  try {
    const json = await fetchJson("/api/dashboard/akses", {
      headers: headerToken(),
    });
    return (json?.boleh ?? []) as string[];
  } catch {
    // Gagal memuat akses tidak boleh merusak boot aplikasi.
    return [];
  }
}

export type MatriksDashboard = {
  katalog: { kunci: string; label: string }[];
  peran: { id: string; label: string }[];
  /** jabatan → kunci dashboard yang NYALA (baris tak ada = mati) */
  nyala: Record<string, string[]>;
};

export async function getMatriksDashboard(): Promise<MatriksDashboard> {
  const json = await fetchJson("/api/dashboard/akses?matriks=1", {
    headers: headerToken(),
  });
  return json as MatriksDashboard;
}

export async function setAksesDashboard(
  role: string,
  dashboardKey: string,
  aktif: boolean,
): Promise<void> {
  await fetchJson("/api/dashboard/akses", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ role, dashboard_key: dashboardKey, aktif }),
  });
}

export type KpiDashboardAnggota = {
  id: string;
  nama: string;
  avatar_url: string;
  divisi: string;
  jumlah: number;
  /** Target TOTAL (aturan 5x6; platform banned dikecualikan). */
  target: number;
  tercapai: boolean;
  /** Persen KETAT per platform (2 Sep 2026): 100 <=> tercapai. */
  persen?: number;
  /** "izin" | "sakit" bila hari itu dibebaskan; null bila tidak */
  dibebaskan: string | null;
  /** Platform yang sedang dilaporkan banned. */
  banned?: string[];
};

export type RencanaDashboard = {
  id: string;
  judul: string;
  deskripsi: string;
  divisi: string;
  tanggal_mulai: string;
  tenggat: string;
  prioritas: "rendah" | "sedang" | "tinggi" | "kritis";
  target_indikator: string;
  untuk_semua: boolean;
  status: "aktif" | "selesai" | "expired";
  progress: number;
  catatan_progress: string;
};

export type KpiDashboardData = {
  tanggal: string;
  target_bawaan: number;
  anggota: KpiDashboardAnggota[];
  tren: { tanggal: string; jumlah: number }[];
  rencana: RencanaDashboard[];
};

/** Data sub-dashboard KPI Anggota (fitur 3.3.b, baca-saja). */
export async function getDashboardKpi(
  tanggal?: string,
): Promise<KpiDashboardData> {
  const q = tanggal ? `?tanggal=${encodeURIComponent(tanggal)}` : "";
  const json = await fetchJson(`/api/dashboard/kpi${q}`, {
    headers: headerToken(),
  });
  return json as KpiDashboardData;
}

export type TvDashboardData = {
  hari: number;
  ringkasan: {
    produksi: number;
    terunggah: number;
    post_sukses: number;
    post_gagal: number;
    interaksi: number;
    produser: number;
  };
  tren: { tanggal: string; produksi: number; unggah: number }[];
  interaksi_harian: { tanggal: string; jumlah: number }[];
  per_platform: {
    platform: string;
    sukses: number;
    gagal: number;
    sparkline: { tanggal: string; jumlah: number }[];
  }[];
  status: { nama: string; jumlah: number }[];
  populer: {
    kode: string;
    judul: string;
    thumbnail_url: string;
    diunggah_pada: string;
    platform: number;
    komen: number;
    share: number;
    skor: number;
  }[];
  aktivitas: { waktu: string; teks: string; jenis: string }[];
};

/** Data sub-dashboard TV Rakyat (fitur 3.3.d, baca-saja). */
export async function getDashboardTv(hari = 7): Promise<TvDashboardData> {
  const json = await fetchJson(`/api/dashboard/tv?hari=${hari}`, {
    headers: headerToken(),
  });
  return json as TvDashboardData;
}

/** Umpan aktivitas TV terbaru saja — polling ringan 30 detik. */
export async function getDashboardTvAktivitas(): Promise<
  TvDashboardData["aktivitas"]
> {
  const json = await fetchJson("/api/dashboard/tv?aktivitas=1", {
    headers: headerToken(),
  });
  return (json?.aktivitas ?? []) as TvDashboardData["aktivitas"];
}

export type KelengkapanAnggota = {
  id: string;
  nama: string;
  /** Email asli ("" bila masih sintetis pendaftaran-WA lama) */
  email?: string;
  nomor_wa?: string | null;
  avatar_url: string;
  divisi: string;
  /** Tanggal akun dibuat (grafik pertumbuhan) */
  bergabung?: string | null;
  /** Fitur login yang aktif untuk akun ini (31 Agu 2026) */
  login_aktif?: {
    email: boolean;
    google: boolean;
    wajah: boolean;
    sidik_jari: boolean;
  };
  /** Akun TV Rakyat pribadi yang sudah login (upload-post) */
  tvr_akun?: { platform: string; username: string }[];
  /** Akun TV Rakyat tertaut via upload-post (target 6 platform) */
  tvr_tertaut?: number;
  /** Username sosmed yang dipakai berkomentar (QC) */
  qc_akun?: { platform: string; username: string }[];
  dimensi: {
    login: boolean;
    sosmed: boolean;
    google: boolean;
    email: boolean;
    wa: boolean;
  };
  terpenuhi: number;
  persen: number;
};

// ------------------------------------------------------------
// TV Rakyat Saya — unggah ke sosmed pribadi via upload-post (31 Agu 2026)
// ------------------------------------------------------------

export type TvrkuPost = {
  id: string;
  judul: string;
  caption: string;
  platforms: string[];
  video_url: string;
  jadwal: string | null;
  hasil: Record<string, unknown> | null;
  dibuat_pada: string;
  /** platform → URL postingan yang sudah terbit (untuk tombol Bagikan, 3 Sep 2026). */
  tautan: Record<string, string>;
};

/** Riwayat unggahan sosmed pribadi saya (30 terakhir). */
export async function getRiwayatTvrkuPost(): Promise<TvrkuPost[]> {
  const json = await fetchJson("/api/tvr/unggah", { headers: headerToken() });
  return (json.data ?? []) as TvrkuPost[];
}

/** Langkah 1: minta URL unggah tertandatangan (video naik langsung ke storage). */
export async function siapkanUnggahTvrku(
  nama: string,
  ukuran: number,
): Promise<{
  cara: "r2" | "supabase";
  url: string;
  r2_key?: string;
  path?: string;
}> {
  const json = await fetchJson("/api/tvr/unggah", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "siapkan", nama, ukuran }),
  });
  return json as {
    cara: "r2" | "supabase";
    url: string;
    r2_key?: string;
    path?: string;
  };
}

/**
 * Langkah 2: post video (yang sudah terunggah ke Cloudinary) ke sosmed
 * pribadi. Sejak 1 Sep 2026 media naik peramban→Cloudinary (pola sama
 * dengan kirim-video-manual) — kirim video_url + public_id, bukan path.
 */
export async function postTvrku(data: {
  /** Jalur R2 (utama) — kunci objek yang baru diunggah. */
  r2_key?: string;
  /** Jalur Cloudinary (cadangan). */
  video_url?: string;
  public_id?: string;
  /** Jalur bucket Supabase (cadangan lama). */
  path?: string;
  /** PALUGODAM: tautan video (tanpa unggah berkas). */
  video_link?: string;
  /** Ukuran berkas (byte) — dicatat untuk pantauan kuota. */
  ukuran?: number;
  judul: string;
  caption?: string;
  platforms: string[];
  jadwal?: string;
}): Promise<{
  sukses: boolean;
  terjadwal: boolean;
  hasil: Record<string, unknown>;
}> {
  const json = await fetchJson("/api/tvr/unggah", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "post", ...data }),
  });
  return json as {
    sukses: boolean;
    terjadwal: boolean;
    hasil: Record<string, unknown>;
  };
}

/** Insight akun sosmed pribadi saya (per platform, cache 15 menit). */
export async function getInsightSaya(paksa = false): Promise<{
  siap: boolean;
  profil: string | null;
  insight: Record<string, unknown> | null;
  diperbarui_pada?: string | null;
}> {
  const json = await fetchJson(
    `/api/tvr/insight-saya${paksa ? "?paksa=1" : ""}`,
    {
      headers: headerToken(),
    },
  );
  return json as {
    siap: boolean;
    profil: string | null;
    insight: Record<string, unknown> | null;
    diperbarui_pada?: string | null;
  };
}

export type ProfilTvAnggota = {
  user_id: string;
  nama: string;
  avatar_url: string;
  divisi: string;
  profil: string;
  akun: Record<string, string>;
  tertaut: number;
  pengikut: Record<string, number | null>;
  insight_pada: string | null;
};

/** Profil upload-post yang belum dikenal aplikasi (dibuat di dashboard upload-post). */
export type ProfilBelumTertaut = {
  profil: string;
  akun: Record<string, string>;
  tertaut: number;
};

/** Pengendali akun TV Rakyat anggota (dashboard TV, admin). */
export async function getTvAnggotaDashboard(): Promise<{
  siap: boolean;
  kuota: number;
  terpakai: number;
  profil: ProfilTvAnggota[];
  belum_tertaut: ProfilBelumTertaut[];
}> {
  const json = await fetchJson("/api/dashboard/tv-anggota", {
    headers: headerToken(),
  });
  return {
    ...(json as {
      siap: boolean;
      kuota: number;
      terpakai: number;
      profil: ProfilTvAnggota[];
    }),
    belum_tertaut: (json?.belum_tertaut ?? []) as ProfilBelumTertaut[],
  };
}

/**
 * Tautkan profil upload-post ke anggota (admin, 2 Sep 2026):
 * aksi "tautkan" = profil yang sudah ada; "buat" = profil bernama baru.
 * 409 bila anggota sudah punya profil — ulangi dengan ganti=true.
 */
export async function tautkanProfilTv(data: {
  aksi: "tautkan" | "buat";
  profil?: string;
  username?: string;
  user_id: string;
  ganti?: boolean;
}): Promise<{
  profil: string;
  tersinkron: number;
  konflik: string[];
  dibuat?: boolean;
}> {
  const json = await fetchJson("/api/dashboard/tv-anggota", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify(data),
  });
  return {
    profil: String(json?.profil ?? ""),
    tersinkron: Number(json?.tersinkron ?? 0),
    konflik: (json?.konflik ?? []) as string[],
    dibuat: json?.dibuat === true,
  };
}

/** Tautan login 48 jam untuk menyambungkan akun sosmed ke sebuah profil. */
export async function tautanProfilTv(profil: string): Promise<string> {
  const json = await fetchJson("/api/dashboard/tv-anggota", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "tautan", profil }),
  });
  return String(json?.url ?? "");
}

/** Insight lengkap satu profil anggota (admin; cache 15 menit). */
export async function getTvAnggotaProfil(
  profil: string,
  paksa = false,
): Promise<{
  insight: Record<string, unknown>;
  diperbarui_pada: string | null;
}> {
  const json = await fetchJson(
    `/api/dashboard/tv-anggota?profil=${encodeURIComponent(profil)}${paksa ? "&paksa=1" : ""}`,
    { headers: headerToken() },
  );
  return json as {
    insight: Record<string, unknown>;
    diperbarui_pada: string | null;
  };
}

// ------------------------------------------------------------
// v1.20 — Asisten AI (chatbot Gemini + mode suara)
// ------------------------------------------------------------

export type PesanAsisten = { peran: "pengguna" | "asisten"; teks: string };

/** Status asisten: boleh dipakai jabatan saya? kuncinya terpasang? */
export async function getStatusAsisten(): Promise<{
  boleh: boolean;
  siap: boolean;
}> {
  try {
    const json = await fetchJson("/api/asisten", { headers: headerToken() });
    return { boleh: json?.boleh === true, siap: json?.siap === true };
  } catch {
    return { boleh: false, siap: false };
  }
}

/** Satu giliran chat teks dengan Asisten AI. */
export async function tanyaAsisten(
  pesan: string,
  riwayat: PesanAsisten[],
): Promise<string> {
  const json = await fetchJson("/api/asisten", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ pesan, riwayat }),
  });
  return (json?.jawaban ?? "") as string;
}

/** Matriks akses chatbot per jabatan (master/super). */
export async function getAksesAsisten(): Promise<{
  peran: { id: string; label: string }[];
  nyala: string[];
}> {
  const json = await fetchJson("/api/asisten/akses", {
    headers: headerToken(),
  });
  return {
    peran: (json?.peran ?? []) as { id: string; label: string }[],
    nyala: (json?.nyala ?? []) as string[],
  };
}

export async function setAksesAsisten(
  role: string,
  aktif: boolean,
): Promise<void> {
  await fetchJson("/api/asisten/akses", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ role, aktif }),
  });
}

// ------------------------------------------------------------
// v1.21 — Login sidik jari (WebAuthn / passkey)
// ------------------------------------------------------------

/** Apakah perangkat ini punya biometrik (sidik jari/Face ID)? */
export async function perangkatDukungSidikJari(): Promise<boolean> {
  try {
    if (typeof window === "undefined" || !window.PublicKeyCredential)
      return false;
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// ------------------------------------------------------------
// v1.22 — Mode Developer (impersonasi sesi)
// ------------------------------------------------------------

/** Masuk Mode Developer dengan peran/jabatan/divisi pilihan. */
export async function masukDeveloper(data: {
  password: string;
  peran: string;
  jabatan: string;
  divisi: string;
  sub_divisi: string;
}): Promise<UserLengkap> {
  const json = await fetchJson("/api/dev/masuk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (json.token) simpanToken(json.token as string);
  return json.user as UserLengkap;
}

// ------------------------------------------------------------
// Verifikasi wajah (fitur 1.22/3) — absen & login berbasis wajah
// ------------------------------------------------------------

export type StatusWajah = {
  siap: boolean;
  provider: string;
  terdaftar: boolean;
  didaftarkan_pada: string | null;
  absen_wajib_wajah: boolean;
};

export async function getStatusWajah(): Promise<StatusWajah> {
  const json = await fetchJson("/api/wajah", { headers: headerToken() });
  return {
    siap: json?.siap === true,
    provider: String(json?.provider ?? ""),
    terdaftar: json?.terdaftar === true,
    didaftarkan_pada: (json?.didaftarkan_pada ?? null) as string | null,
    absen_wajib_wajah: json?.absen_wajib_wajah === true,
  };
}

/** Daftarkan/perbarui wajah saya (beberapa foto data URL, mis. 5 sudut). */
export async function daftarkanWajah(images: string[]): Promise<void> {
  await fetchJson("/api/wajah/daftar", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ images }),
  });
}

export async function hapusWajah(): Promise<void> {
  await fetchJson("/api/wajah", { method: "DELETE", headers: headerToken() });
}

/** Apakah login-wajah aktif (dipakai layar Masuk, pra-login). */
export async function wajahLoginTersedia(): Promise<boolean> {
  try {
    const res = await fetch("/api/wajah/tersedia");
    if (!res.ok) return false;
    const json = await res.json();
    return json?.siap === true;
  } catch {
    return false;
  }
}

/** Masuk dengan wajah TANPA username: foto → identifikasi 1:N → sesi. */
export async function masukWajah(image: string): Promise<UserLengkap> {
  const json = await fetchJson("/api/wajah/masuk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image }),
  });
  if (json.token) simpanToken(json.token as string);
  return json.user as UserLengkap;
}

/** Status sidik jari akun saya (untuk toggle di Profil). */
export async function getStatusSidikJari(): Promise<{
  aktif: boolean;
  jumlah_perangkat: number;
}> {
  try {
    const json = await fetchJson("/api/webauthn", { headers: headerToken() });
    return {
      aktif: json?.aktif === true,
      jumlah_perangkat: Number(json?.jumlah_perangkat ?? 0),
    };
  } catch {
    return { aktif: false, jumlah_perangkat: 0 };
  }
}

/** Daftarkan sidik jari perangkat ini (harus sudah login). */
export async function daftarkanSidikJari(): Promise<void> {
  const { startRegistration } = await import("@simplewebauthn/browser");
  const opsi = await fetchJson("/api/webauthn/daftar", {
    headers: headerToken(),
  });
  const respons = await startRegistration({ optionsJSON: opsi });
  await fetchJson("/api/webauthn/daftar", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify(respons),
  });
}

/** Nonaktifkan sidik jari (hapus semua kredensial akun ini). */
export async function matikanSidikJari(): Promise<void> {
  await fetchJson("/api/webauthn", {
    method: "DELETE",
    headers: headerToken(),
  });
}

/**
 * Ubah galat WebAuthn (yang dibungkus @simplewebauthn jadi WebAuthnError,
 * BUKAN DOMException) menjadi pesan Indonesia yang jelas + kode.
 * Mengembalikan { dibatalkan } supaya pemanggil bisa DIAM saat pengguna
 * sekadar membatalkan prompt.
 */
export function bacaGalatSidikJari(err: unknown): {
  pesan: string;
  dibatalkan: boolean;
} {
  const e = err as {
    name?: string;
    code?: string;
    cause?: { name?: string };
    message?: string;
  };
  const namaAsli = e?.cause?.name ?? e?.name ?? "";
  const kode = e?.code ?? "";
  // Pengguna menutup/menolak prompt, atau tak ada passkey yang cocok.
  if (
    namaAsli === "NotAllowedError" ||
    namaAsli === "AbortError" ||
    kode === "ERROR_CEREMONY_ABORTED"
  ) {
    return {
      dibatalkan: true,
      pesan:
        "Sidik jari dibatalkan atau belum diaktifkan di perangkat ini. Masuk dengan sandi lebih dulu, lalu aktifkan di Profil → Keamanan.",
    };
  }
  if (namaAsli === "InvalidStateError") {
    return {
      dibatalkan: false,
      pesan: "Perangkat ini sudah terdaftar untuk akun tersebut.",
    };
  }
  if (namaAsli === "SecurityError") {
    return {
      dibatalkan: false,
      pesan:
        "Sidik jari hanya bisa dipakai lewat koneksi aman (HTTPS) di aplikasi resmi.",
    };
  }
  return {
    dibatalkan: false,
    pesan: e?.message?.slice(0, 140) || "Gagal memakai sidik jari. Coba lagi.",
  };
}

/** Masuk dengan sidik jari (tanpa perlu login dulu) → user + token. */
export async function masukSidikJari(): Promise<UserLengkap> {
  const { startAuthentication } = await import("@simplewebauthn/browser");
  const opsi = await fetchJson("/api/webauthn/masuk");
  // Bila belum ada passkey untuk domain ini, startAuthentication langsung
  // melempar — ditangani pemanggil lewat bacaGalatSidikJari.
  const respons = await startAuthentication({ optionsJSON: opsi });
  const json = await fetchJson("/api/webauthn/masuk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(respons),
  });
  if (json.token) simpanToken(json.token as string);
  return json.user as UserLengkap;
}

export type BahanAjarAI = {
  id: string;
  nama: string;
  ukuran: number;
  dibuat_pada: string;
};

export type StatusBasisAI = {
  ada: boolean;
  diperbarui_pada: string | null;
  umur_menit: number | null;
  konten: Record<string, unknown>;
  catatan: string;
  maks_catatan: number;
  bahan_ajar: BahanAjarAI[];
  maks_bahan_per_berkas: number;
  maks_bahan_jumlah: number;
};

/** Status + isi Basis Pengetahuan AI (master). */
export async function getBasisAI(): Promise<StatusBasisAI> {
  const json = await fetchJson("/api/asisten/basis", {
    headers: headerToken(),
  });
  return json as StatusBasisAI;
}

/** Paksa refresh snapshot Basis Pengetahuan sekarang (master). */
export async function refreshBasisAI(): Promise<string> {
  const json = await fetchJson("/api/asisten/basis", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "refresh" }),
  });
  return (json?.disegarkan ?? "") as string;
}

/** Simpan catatan manual (fakta tambahan) ke Basis Pengetahuan (master). */
export async function simpanCatatanBasisAI(teks: string): Promise<void> {
  await fetchJson("/api/asisten/basis", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "catatan", teks }),
  });
}

/** Unggah bahan belajar TXT untuk dibaca AI (fitur 1.22/4, master). */
export async function tambahBahanAjarAI(
  nama: string,
  isi: string,
): Promise<{ dipotong: boolean }> {
  const json = await fetchJson("/api/asisten/basis", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "bahan_tambah", nama, isi }),
  });
  return { dipotong: Boolean(json?.dipotong) };
}

/** Hapus satu bahan belajar dari Basis Pengetahuan (master). */
export async function hapusBahanAjarAI(id: string): Promise<void> {
  await fetchJson("/api/asisten/basis", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "bahan_hapus", id }),
  });
}

/** Instruksi pelatihan Asisten AI saat ini (master). */
export async function getLatihAsisten(): Promise<{
  instruksi: string;
  maks: number;
}> {
  const json = await fetchJson("/api/asisten/latih", {
    headers: headerToken(),
  });
  return {
    instruksi: (json?.instruksi ?? "") as string,
    maks: Number(json?.maks ?? 6000),
  };
}

/** Simpan instruksi pelatihan Asisten AI (master) — berlaku seketika. */
export async function simpanLatihAsisten(instruksi: string): Promise<void> {
  await fetchJson("/api/asisten/latih", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ instruksi }),
  });
}

/** Token sementara untuk sesi suara Gemini Live. */
export async function mintaTokenSuara(): Promise<{
  token: string;
  model: string;
}> {
  const json = await fetchJson("/api/asisten/suara", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({}),
  });
  return { token: json.token as string, model: json.model as string };
}

/** Jembatan alat sesi suara: jalankan alat daftar-putih di server. */
export async function jalankanAlatSuara(
  nama: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const json = await fetchJson("/api/asisten/suara?alat=1", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ nama, args }),
  });
  return (json?.hasil ?? {}) as Record<string, unknown>;
}

// ------------------------------------------------------------
// v1.20 — preferensi tampilan (footer & tata letak modul)
// ------------------------------------------------------------

// Cache singkat: beberapa modul membaca preferensi saat mount hampir
// bersamaan — satu permintaan cukup untuk semuanya.
let cachePref: { pada: number; nilai: Record<string, unknown> } | null = null;

/** Semua preferensi tampilan saya: {"footer": ..., "layout:beranda": ...} */
export async function getPreferensi(): Promise<Record<string, unknown>> {
  if (cachePref && Date.now() - cachePref.pada < 60_000) return cachePref.nilai;
  try {
    const json = await fetchJson("/api/preferensi", { headers: headerToken() });
    const nilai = (json?.preferensi ?? {}) as Record<string, unknown>;
    cachePref = { pada: Date.now(), nilai };
    return nilai;
  } catch {
    // Preferensi gagal termuat = pakai tampilan bawaan, jangan rusak boot.
    return {};
  }
}

/** Simpan satu preferensi tampilan (footer / layout:<modul>). */
export async function simpanPreferensi(
  kunci: string,
  nilai: unknown,
): Promise<void> {
  await fetchJson("/api/preferensi", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ kunci, nilai }),
  });
  // Cache lokal ikut diperbarui supaya pembaca berikutnya melihat nilai baru.
  if (cachePref) cachePref.nilai[kunci] = nilai;
}

/** Kelengkapan data anggota (fitur 3.3.e, baca-saja). */
export async function getDashboardAnggota(): Promise<KelengkapanAnggota[]> {
  const json = await fetchJson("/api/dashboard/anggota", {
    headers: headerToken(),
  });
  return (json?.anggota ?? []) as KelengkapanAnggota[];
}

export type DetailKpiAnggota = {
  riwayat: { tanggal: string; jumlah: number }[];
  /** SEMUA link video jendela 7 hari (untuk daftar embed). */
  links: LaporanVideo[];
  per_platform: RincianPlatformKpi[];
  target_total: number;
  tercapai: boolean;
  persen?: number;
  banned: string[];
};

/** Detail satu anggota: riwayat 7 hari + link video + rincian platform. */
export async function getDashboardKpiAnggota(
  userId: string,
  tanggal?: string,
): Promise<DetailKpiAnggota> {
  const t = tanggal ? `&tanggal=${encodeURIComponent(tanggal)}` : "";
  const json = await fetchJson(
    `/api/dashboard/kpi?user=${encodeURIComponent(userId)}${t}`,
    {
      headers: headerToken(),
    },
  );
  return {
    riwayat: (json?.riwayat ?? []) as { tanggal: string; jumlah: number }[],
    links: (json?.links ?? []) as LaporanVideo[],
    per_platform: (json?.per_platform ?? []) as RincianPlatformKpi[],
    target_total: Number(json?.target_total ?? 30),
    persen: typeof json?.persen === "number" ? json.persen : undefined,
    tercapai: json?.tercapai === true,
    banned: (json?.banned ?? []) as string[],
  };
}

/** Periksa hidup/matinya link video satu anggota (deteksi link bodong). */
export async function cekLinkAnggota(
  userId: string,
  tanggal?: string,
): Promise<Record<string, "hidup" | "bodong" | "tak_terverifikasi">> {
  const t = tanggal ? `&tanggal=${encodeURIComponent(tanggal)}` : "";
  const json = await fetchJson(
    `/api/dashboard/kpi?cek=1&user=${encodeURIComponent(userId)}${t}`,
    { headers: headerToken() },
  );
  const peta: Record<string, "hidup" | "bodong" | "tak_terverifikasi"> = {};
  for (const b of (json?.data ?? []) as { id: string; status: string }[]) {
    peta[b.id] = b.status as "hidup" | "bodong" | "tak_terverifikasi";
  }
  return peta;
}

/** Tren KPI 30 hari (total, % tercapai, per platform per hari). */
export type TrenKpi30 = {
  tanggal: string;
  total: number;
  persen_tercapai: number;
  per_platform: Record<string, number>;
};
export async function getDashboardKpiTren(): Promise<TrenKpi30[]> {
  const json = await fetchJson("/api/dashboard/kpi?tren=30", {
    headers: headerToken(),
  });
  return (json?.tren ?? []) as TrenKpi30[];
}

// --- Tren dashboard (grafik absensi & kepatuhan) ---

export type TrenAbsensi = {
  tanggal: string;
  hadir: number;
  telat: number;
  izin: number;
};
export async function getTrenAbsensi(
  hari: 7 | 30,
): Promise<{ tren: TrenAbsensi[]; total_anggota: number }> {
  const json = await fetchJson(
    `/api/dashboard/tren?jenis=absensi&hari=${hari}`,
    {
      headers: headerToken(),
    },
  );
  return {
    tren: (json?.tren ?? []) as TrenAbsensi[],
    total_anggota: Number(json?.total_anggota ?? 0),
  };
}

export type TrenKepatuhan = {
  tanggal: string;
  persen: number;
  sudah: number;
  total: number;
};
export type KepatuhanPerAkun = {
  akun: string;
  platform: string;
  persen: number;
  sudah: number;
  total: number;
};
export async function getTrenKepatuhan(hari: 7 | 30): Promise<{
  tren: TrenKepatuhan[];
  hari_ini: { patuh_penuh: number; belum_penuh: number };
  per_akun_wajib: KepatuhanPerAkun[];
}> {
  const json = await fetchJson(
    `/api/dashboard/tren?jenis=kepatuhan&hari=${hari}`,
    {
      headers: headerToken(),
    },
  );
  return {
    tren: (json?.tren ?? []) as TrenKepatuhan[],
    hari_ini: (json?.hari_ini ?? { patuh_penuh: 0, belum_penuh: 0 }) as {
      patuh_penuh: number;
      belum_penuh: number;
    },
    per_akun_wajib: (json?.per_akun_wajib ?? []) as KepatuhanPerAkun[],
  };
}

// --- Papan peringkat (4 kategori) ---

export type BarisPeringkat = {
  id: string;
  nama: string;
  avatar_url: string;
  divisi: string;
  skor: number;
  detail: string;
};
export type PeringkatDashboard = {
  hari: number;
  komen: BarisPeringkat[];
  video: BarisPeringkat[];
  absensi: BarisPeringkat[];
  kpi: BarisPeringkat[];
};
export async function getPeringkatDashboard(
  hari: 7 | 30,
): Promise<PeringkatDashboard> {
  const json = await fetchJson(`/api/dashboard/peringkat?hari=${hari}`, {
    headers: headerToken(),
  });
  return json as PeringkatDashboard;
}

// ------------------------------------------------------------
// v1.12 — lupa sandi, ulang tahun, tugas link Pimred, interaksi,
// profil lanjutan, mode perbaikan
// ------------------------------------------------------------

/** Minta kode OTP lupa sandi (tanpa sesi). */
export async function lupaSandiKirim(identitas: string): Promise<string> {
  const json = await fetchJson("/api/sandi/lupa", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identitas }),
  });
  return (json.pesan as string) ?? "Kode dikirim.";
}

export async function lupaSandiSetel(data: {
  identitas: string;
  kode: string;
  sandi_baru: string;
}): Promise<void> {
  await fetchJson("/api/sandi/lupa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export type OrangUltah = {
  id: string;
  nama: string;
  nama_panggilan: string;
  avatar_url: string;
};

export async function getUltahHariIni(): Promise<OrangUltah[]> {
  const json = await fetchJson("/api/ultah", { headers: headerToken() });
  return (json.data ?? []) as OrangUltah[];
}

/** Perbarui data profil sendiri (nama/panggilan/tgl lahir/foto). */
export async function ubahProfilSaya(data: {
  foto?: string;
  nama?: string;
  nama_panggilan?: string;
  tanggal_lahir?: string;
  divisi?: string;
  sub_divisi?: string;
}): Promise<UserLengkap> {
  const json = await fetchJson("/api/profil", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify(data),
  });
  return json.user as UserLengkap;
}

export type TugasLink = {
  id: string;
  judul: string;
  url: string;
  catatan: string;
  untuk_user_id: string;
  nama_penerima: string;
  nama_pemberi: string;
  status: "baru" | "dikerjakan" | "selesai" | "batal";
  video_kode: string | null;
  dibuat_pada: string;
  selesai_pada: string | null;
};

export async function getTugasLink(): Promise<TugasLink[]> {
  const json = await fetchJson("/api/tv/tugas", { headers: headerToken() });
  return (json.data ?? []) as TugasLink[];
}

export async function beriTugasLink(data: {
  url: string;
  judul?: string;
  catatan?: string;
  untuk_user_id: string;
}): Promise<void> {
  await fetchJson("/api/tv/tugas", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify(data),
  });
}

export type KandidatTugasTv = { id: string; nama: string; jabatan: string };

/**
 * Kandidat penerima tugas TV Rakyat (fitur 1.22/bug 7): HANYA anggota
 * aktif berdivisi "Divisi TV Rakyat". Dipakai dropdown Bagi Tugas —
 * server juga menolak target di luar divisi ini.
 */
export async function getKandidatTugasTv(): Promise<KandidatTugasTv[]> {
  const json = await fetchJson("/api/tv/tugas?kandidat=1", {
    headers: headerToken(),
  });
  return (json.data ?? []) as KandidatTugasTv[];
}

export async function batalkanTugasLink(id: string): Promise<void> {
  await fetchJson("/api/tv/tugas", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ id, aksi: "batal" }),
  });
}

export type VideoInteraksi = {
  kode: string;
  judul: string;
  link: string;
  /** Semua platform tempat video ini tayang, untuk tombol bagikan */
  tautan: { platform: string; url: string }[];
  thumbnail_url: string;
  diunggah_pada: string;
  sudah_komen: boolean;
  sudah_share: boolean;
};

export async function getInteraksiVideo(): Promise<VideoInteraksi[]> {
  const json = await fetchJson("/api/tv/interaksi", { headers: headerToken() });
  return (json.data ?? []) as VideoInteraksi[];
}

export async function tandaiInteraksiVideo(
  kode: string,
  jenis: "komen" | "share",
): Promise<void> {
  await fetchJson("/api/tv/interaksi", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ kode, jenis }),
  });
}

// --- Postingan wajib dikomentari kader (QC, status TERVERIFIKASI) ---

export type WajibKomenItem = {
  id_postingan: string;
  platform: string;
  akun: string;
  url: string;
  caption: string;
  thumbnail: string;
  waktu_posting: string | null;
  /** true = komentar kader ini SUDAH ketemu di postingan (dari rekap QC) */
  sudah_komentar: boolean;
};

export type WajibKomen = {
  periode: string;
  belum: number;
  data: WajibKomenItem[];
};

/** Daftar postingan wajib komen hari ini + status komentar saya (verified). */
export async function getWajibKomen(): Promise<WajibKomen> {
  const json = await fetchJson("/api/tv/wajib-komen", {
    headers: headerToken(),
  });
  return json as WajibKomen;
}

/** Sakelar mode perbaikan — khusus master (lihat /api/master). */
/** Analisis ulang QC berbasis data Ayrshare (tanpa n8n/TikHub). */
export type HasilAnalisisAyrshare = {
  periode: string;
  akun_tercakup: string[];
  akun_terlewat: string[];
  postingan: number;
  komentar: number;
  comply: number;
  /** Catatan jujur bila ada postingan yang tidak terbaca sekali jalan */
  peringatan?: string[];
  /** Postingan yang belum sempat diperiksa pada panggilan ini */
  sisa?: number;
  /** false = perlu dipanggil lagi untuk menuntaskan sisanya */
  selesai?: boolean;
  /** Komentar terbaca hingga jam ini (spek 1.16) */
  data_sampai?: string;
};

export async function analisisUlangAyrshare(): Promise<HasilAnalisisAyrshare> {
  const json = await fetchJson("/api/analisis/ayrshare", {
    method: "POST",
    headers: headerToken(),
  });
  return json as HasilAnalisisAyrshare;
}

// ------------------------------------------------------------
// Database anggota (detail aktivitas per pengguna)
// ------------------------------------------------------------

export type DbRingkasPengguna = {
  id: string;
  nama: string;
  avatar_url: string;
  struktur: string;
  masuk: boolean;
  video: number;
  komentar_sudah: number;
  komentar_total: number;
};

export type DbDetailPengguna = {
  pengguna: {
    id: string;
    nama: string;
    avatar_url: string;
    struktur: string;
    nomor_wa: string;
  };
  hari_ini: string;
  komentar: {
    periode: string;
    total: number;
    sudah: number;
    per_akun: { akun: string; total: number; sudah: number }[];
  };
  kerja: { tanggal: string; total: number; selesai: number; persen: number }[];
  absensi: {
    tanggal_wib: string;
    jenis: string;
    waktu: string;
    alamat: string | null;
  }[];
  video: {
    total: number;
    hari_ini: number;
    daftar: { tanggal_wib: string; platform: string; url_video: string }[];
  };
};

export async function getDatabasePengguna(): Promise<DbRingkasPengguna[]> {
  const json = await fetchJson("/api/database", { headers: headerToken() });
  return (json.data ?? []) as DbRingkasPengguna[];
}

export async function getDatabaseDetail(id: string): Promise<DbDetailPengguna> {
  const json = await fetchJson(`/api/database?user=${encodeURIComponent(id)}`, {
    headers: headerToken(),
  });
  return json as DbDetailPengguna;
}

// ------------------------------------------------------------
// Verifikasi WhatsApp untuk akun yang sudah masuk
// ------------------------------------------------------------

export async function kirimKodeVerifikasiWa(): Promise<void> {
  await fetchJson("/api/otp/ulang", { method: "PUT", headers: headerToken() });
}

export async function verifikasiWaSaya(kode: string): Promise<UserLengkap> {
  const json = await fetchJson("/api/otp/ulang", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ kode }),
  });
  return json.user as UserLengkap;
}

// Set + verifikasi nomor WA BARU untuk akun yang belum punya nomor
// (fitur 1.22.x/1).
export async function kirimKodeWaBaru(nomor: string): Promise<void> {
  await fetchJson("/api/verifikasi/wa-nomor", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ nomor }),
  });
}

export async function verifikasiWaBaru(
  nomor: string,
  kode: string,
): Promise<UserLengkap> {
  const json = await fetchJson("/api/verifikasi/wa-nomor", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ nomor, kode }),
  });
  return json.user as UserLengkap;
}

/**
 * Rekap kepatuhan komentar satu periode. Dipakai kartu KPI beranda.
 * Lewat fetchJson supaya token perangkat ikut terkirim — endpoint
 * /api/rekap kini menolak permintaan tanpa login.
 */
export async function getRekapPeriode(
  periode: string,
): Promise<{ nama_kader: string; sudah_komentar: boolean }[]> {
  try {
    const json = await fetchJson(
      `/api/rekap?periode=${encodeURIComponent(periode)}`,
    );
    return (json.data ?? []) as {
      nama_kader: string;
      sudah_komentar: boolean;
    }[];
  } catch {
    // Kartu KPI bersifat pelengkap — kegagalannya tidak boleh
    // menggagalkan seluruh beranda.
    return [];
  }
}

/**
 * Kewajiban komentar SAYA hari itu — dihitung server per pengguna
 * (perbaikan bug 0/0: presisi, beserta header login, tanpa cap 1000).
 * null = gagal dimuat (biar UI menampilkan "…", bukan 0/0 palsu).
 */
export async function getKomentarSaya(
  /** Kosong = jendela QC yang sedang berjalan (server yang menghitung). */
  periode?: string,
): Promise<{
  total: number;
  sudah: number;
  diperbarui?: string | null;
} | null> {
  try {
    const p = periode ? `&periode=${encodeURIComponent(periode)}` : "";
    const json = await fetchJson(`/api/rekap?saya=1${p}`, {
      headers: headerToken(),
    });
    return { total: Number(json.total ?? 0), sudah: Number(json.sudah ?? 0) };
  } catch {
    return null;
  }
}

/** Cakupan analisis Ayrshare: akun wajib mana yang sudah bisa dibaca. */
export type CakupanAyrshare = {
  siap: boolean;
  tercakup: { username: string; platform: string }[];
  terlewat: { username: string; platform: string }[];
};

export async function getCakupanAyrshare(): Promise<CakupanAyrshare> {
  try {
    const json = await fetchJson("/api/analisis/ayrshare", {
      headers: headerToken(),
    });
    return json as CakupanAyrshare;
  } catch {
    // Cakupan hanya penjelas di layar — kegagalannya tidak boleh
    // menggagalkan seluruh layar QC.
    return { siap: false, tercakup: [], terlewat: [] };
  }
}

// Riwayat "kapan Ayrshare memperbarui komentar" (fitur 1.22.x/3-perbaikan)
export type RiwayatUpdateKomentar = {
  id: string;
  dijalankan_pada: string;
  periode: string | null;
  sumber: string;
  postingan: number;
  komentar: number;
  comply: number;
  gagal_cek: number;
  selesai: boolean;
};

export async function getRiwayatUpdateKomentar(): Promise<
  RiwayatUpdateKomentar[]
> {
  try {
    const json = await fetchJson("/api/analisis/ayrshare?riwayat=1", {
      headers: headerToken(),
    });
    return (json.riwayat ?? []) as RiwayatUpdateKomentar[];
  } catch {
    return [];
  }
}

// ------------------------------------------------------------
// Tim TV Rakyat (wewenang yang ditunjuk Pimpinan Redaksi)
// ------------------------------------------------------------

export type WewenangTv = {
  anggota: boolean;
  acc: boolean;
  upload: boolean;
  proses: boolean;
};

export type AnggotaTv = {
  user_id: string;
  nama: string;
  avatar_url: string;
  jabatan: string;
  boleh_acc: boolean;
  boleh_upload: boolean;
};

export type KandidatTv = {
  id: string;
  nama: string;
  avatar_url: string;
  jabatan: string;
  divisi: string;
};

/** Wewenang TV Rakyat saya (dipakai untuk tab & tombol). */
export async function getWewenangTv(): Promise<WewenangTv> {
  try {
    const json = await fetchJson("/api/tv/tim", { headers: headerToken() });
    return (json.wewenang ?? {
      anggota: false,
      acc: false,
      upload: false,
      proses: false,
    }) as WewenangTv;
  } catch {
    return { anggota: false, acc: false, upload: false, proses: false };
  }
}

/** Daftar tim + kandidat, untuk layar kelola Pimred. */
export async function getKelolaTimTv(): Promise<{
  tim: AnggotaTv[];
  kandidat: KandidatTv[];
  auto_broadcast: boolean;
  maks_upload_mb: number;
  retensi_jam: number;
  video_baru_tampil: boolean;
}> {
  const json = await fetchJson("/api/tv/tim?kelola=1", {
    headers: headerToken(),
  });
  return {
    tim: (json.tim ?? []) as AnggotaTv[],
    kandidat: (json.kandidat ?? []) as KandidatTv[],
    auto_broadcast: json.auto_broadcast !== false,
    maks_upload_mb: Number(json.maks_upload_mb ?? 100),
    retensi_jam: Number(json.retensi_jam ?? 24),
    video_baru_tampil: json.video_baru_tampil === true,
  };
}

/**
 * Pimred: simpan pengaturan angka TV (fitur 1.20/6 & 8).
 * aksi "maks_upload" (1-200 MB) atau "retensi" (1-24 jam).
 */
export async function setPengaturanTv(
  aksi: "maks_upload" | "retensi",
  nilai: number,
): Promise<void> {
  await fetchJson("/api/tv/tim", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi, nilai }),
  });
}

/** Pimred: nyalakan/matikan siaran otomatis upload -> ruang chat. */
export async function setAutoBroadcastTv(nyala: boolean): Promise<void> {
  await fetchJson("/api/tv/tim", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "auto_broadcast", nyala }),
  });
}

/** Pimred: tampilkan/sembunyikan kartu "Video Baru TV Rakyat" di Konten. */
export async function setVideoBaruTampilTv(nyala: boolean): Promise<void> {
  await fetchJson("/api/tv/tim", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "video_baru", nyala }),
  });
}

export async function tambahAnggotaTv(userId: string): Promise<void> {
  await fetchJson("/api/tv/tim", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ user_id: userId, aksi: "tambah" }),
  });
}

export async function keluarkanAnggotaTv(userId: string): Promise<void> {
  await fetchJson("/api/tv/tim", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ user_id: userId, aksi: "hapus" }),
  });
}

export async function aturWewenangTv(
  userId: string,
  wewenang: { boleh_acc?: boolean; boleh_upload?: boolean },
): Promise<void> {
  await fetchJson("/api/tv/tim", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ user_id: userId, ...wewenang }),
  });
}

// ------------------------------------------------------------
// Mode perbaikan
// ------------------------------------------------------------

export type StatusPerbaikan = {
  aktif: boolean;
  sampai: string | null;
  pesan: string;
};

/** Status perbaikan (publik) — dipakai layar terkunci untuk auto-berakhir. */
export async function getStatusPerbaikan(): Promise<StatusPerbaikan> {
  try {
    const json = await fetchJson("/api/perbaikan");
    return {
      aktif: json?.aktif === true,
      sampai: json?.sampai ?? null,
      pesan: json?.pesan ?? "",
    };
  } catch {
    // Gagal memeriksa = anggap masih perbaikan (jangan buka aplikasi
    // yang mungkin belum siap). Layar tetap menampilkan tombol Coba Lagi.
    return { aktif: true, sampai: null, pesan: "" };
  }
}

/** Master menyalakan/mematikan mode perbaikan. */
export async function setModePerbaikan(opsi: {
  aktif: boolean;
  sampai?: string;
  pesan?: string;
}): Promise<void> {
  await fetchJson("/api/perbaikan", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify(opsi),
  });
}

/** Setujui SEMUA pendaftar yang menunggu sekaligus (sebagai anggota). */
export async function setujuiSemuaPendaftar(): Promise<number> {
  const json = await fetchJson("/api/pengguna", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
  });
  return Number(json?.jumlah ?? 0);
}

/** Task streak (ala Duolingo) milikku — utk Beranda & Profil. */
export async function getStreakSaya(): Promise<{
  hari: number;
  restore_tersedia: boolean;
}> {
  try {
    const json = await fetchJson("/api/streak", { headers: headerToken() });
    return {
      hari: Number(json?.hari ?? 0),
      restore_tersedia: json?.restore_tersedia === true,
    };
  } catch {
    return { hari: 0, restore_tersedia: false };
  }
}

// ------------------------------------------------------------
// Grup chat divisi (spek 4.2)
// ------------------------------------------------------------

export type InfoGrupDivisi = {
  divisi: string;
  /** Nama tampilan grup (kustom bila disetel; selain itu nama divisi) */
  nama_grup: string;
  foto_grup: string;
  anggota: number;
  cuplikan: string;
  waktu_terakhir: string;
  belum_dibaca: number;
};

export type AnggotaGrup = {
  id: string;
  nama: string;
  avatar_url: string;
  kepala: boolean;
  jabatan: string;
};

export type PesanGrup = {
  id: string;
  pengirim_id: string;
  pengirim_nama: string;
  pengirim_avatar: string;
  isi: string;
  gambar_url: string;
  dibuat_pada: string;
  dihapus?: boolean;
};

/** Info grup divisiku untuk daftar chat (null bila belum berdivisi). */
export async function getGrupDivisiku(): Promise<InfoGrupDivisi | null> {
  try {
    const json = await fetchJson("/api/chat/grup", { headers: headerToken() });
    if (!json?.divisi) return null;
    return {
      divisi: json.divisi as string,
      nama_grup: (json.nama_grup as string) || (json.divisi as string),
      foto_grup: (json.foto_grup as string) ?? "",
      anggota: Number(json.anggota ?? 0),
      cuplikan: (json.cuplikan as string) ?? "",
      waktu_terakhir: (json.waktu_terakhir as string) ?? "",
      belum_dibaca: Number(json.belum_dibaca ?? 0),
    };
  } catch {
    return null;
  }
}

/** Daftar anggota grup divisiku (kepala duluan). */
export async function getAnggotaGrup(): Promise<AnggotaGrup[]> {
  const json = await fetchJson("/api/chat/grup?anggota=1", {
    headers: headerToken(),
  });
  return (json.data ?? []) as AnggotaGrup[];
}

/** Kepala divisi/pengurus mengubah nama & foto grup (spek 1.15). */
export async function ubahInfoGrup(opsi: {
  nama?: string;
  foto?: string;
}): Promise<{ nama_grup: string; foto_grup: string }> {
  const json = await fetchJson("/api/chat/grup", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "info", ...opsi }),
  });
  return {
    nama_grup: (json.nama_grup as string) ?? "",
    foto_grup: (json.foto_grup as string) ?? "",
  };
}

/** Pesan grup divisiku (sejak = polling tambahan saja). */
export async function getPesanGrup(sejak?: string): Promise<PesanGrup[]> {
  const params = new URLSearchParams({ pesan: "1" });
  if (sejak) params.set("sejak", sejak);
  const json = await fetchJson(`/api/chat/grup?${params.toString()}`, {
    headers: headerToken(),
  });
  return (json.data ?? []) as PesanGrup[];
}

export async function kirimPesanGrup(
  isi: string,
  gambar?: string,
): Promise<{ id: string; dibuat_pada: string; gambar_url: string }> {
  const json = await fetchJson("/api/chat/grup", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "kirim", isi, gambar }),
  });
  return {
    id: (json.id as string) ?? "",
    dibuat_pada: (json.dibuat_pada as string) ?? new Date().toISOString(),
    gambar_url: (json.gambar_url as string) ?? "",
  };
}

export async function hapusPesanGrup(pesanId: string): Promise<void> {
  await fetchJson("/api/chat/grup", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "hapus_pesan", pesan_id: pesanId }),
  });
}

export async function tandaiGrupDibaca(): Promise<void> {
  await fetchJson("/api/chat/grup", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headerToken() },
  }).catch(() => undefined);
}

/**
 * Simpan BANYAK link laporan video sekali klik (spek 3.3).
 * Platform tiap link ditebak server dari alamatnya.
 */
export async function kirimLaporanBatch(
  items: { keyword?: string; url: string }[],
): Promise<{ tersimpan: number; gagal: { url: string; alasan: string }[] }> {
  const json = await fetchJson("/api/tvr/laporan", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({
      banyak: items.map((it) => ({ url: it.url, keyword: it.keyword })),
    }),
  });
  return {
    tersimpan: Array.isArray(json.tersimpan) ? json.tersimpan.length : 0,
    gagal: (json.gagal ?? []) as { url: string; alasan: string }[],
  };
}

/** HR/QC/Pengawas menyetel target KPI video per akun (null = bawaan 5). */
export async function setKpiVideo(
  userId: string,
  kpi: number | null,
): Promise<number> {
  const json = await fetchJson("/api/tvr/laporan", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ user_id: userId, kpi }),
  });
  return Number(json.kpi_target ?? 5);
}

// ------------------------------------------------------------
// Modul Acara (spek 1.5)
// ------------------------------------------------------------

export type AcaraPenting = {
  id: string;
  judul: string;
  keterangan: string;
  tanggal: string;
  dibuat_oleh: string;
  pembuat_nama: string;
};

export async function getAcara(): Promise<{
  boleh_kelola: boolean;
  data: AcaraPenting[];
}> {
  const json = await fetchJson("/api/acara", { headers: headerToken() });
  return {
    boleh_kelola: json.boleh_kelola === true,
    data: (json.data ?? []) as AcaraPenting[],
  };
}

export async function tambahAcara(
  judul: string,
  tanggal: string,
  keterangan: string,
): Promise<void> {
  await fetchJson("/api/acara", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ judul, tanggal, keterangan }),
  });
}

export async function hapusAcara(id: string): Promise<void> {
  await fetchJson("/api/acara", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ id }),
  });
}

// ------------------------------------------------------------
// Profil ala ML: Momen Terbaik + like (spek 4.3)
// ------------------------------------------------------------

export type FotoMomen = {
  id: string;
  url: string;
  suka: number;
  ku_suka: boolean;
};

export type ProfilMomen = {
  milik_sendiri: boolean;
  pemilik: {
    id: string;
    nama: string;
    nama_panggilan: string;
    jabatan: string;
    divisi: string;
    avatar_url: string;
  } | null;
  suka_profil: number;
  ku_suka_profil: boolean;
  foto: FotoMomen[];
  /** Saldo koin gamifikasi (spek 1.16) */
  koin: number;
  /** Akun TV Rakyat yang dipegang orang ini (spek 1.15) */
  akun_tvr: { platform: string; username: string }[];
  /** Video laporan yang diupload HARI INI (utk popup profil) */
  video_hari_ini: { id: string; platform: string; url: string }[];
  /** Maks 6 video terbaru (utk seksi embed di profil) */
  video_terbaru: { id: string; platform: string; url: string }[];
};

/** Profil momen + like — tanpa userId = milik sendiri. */
export async function getProfilMomen(userId?: string): Promise<ProfilMomen> {
  const params = userId ? `?user=${encodeURIComponent(userId)}` : "";
  const json = await fetchJson(`/api/profil/momen${params}`, {
    headers: headerToken(),
  });
  return json as ProfilMomen;
}

/** Unggah foto momen (data URL <=300KB); gantiId wajib saat galeri penuh. */
export async function unggahFotoMomen(
  foto: string,
  gantiId?: string,
): Promise<{ id: string; url: string }> {
  const json = await fetchJson("/api/profil/momen", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "unggah", foto, ganti_id: gantiId }),
  });
  return { id: json.id as string, url: json.url as string };
}

export async function hapusFotoMomen(fotoId: string): Promise<void> {
  await fetchJson("/api/profil/momen", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ foto_id: fotoId }),
  });
}

/** Toggle like satu foto; mengembalikan keadaan baru. */
export async function sukaFoto(fotoId: string): Promise<boolean> {
  const json = await fetchJson("/api/profil/momen", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "suka_foto", foto_id: fotoId }),
  });
  return json.suka === true;
}

/** Toggle like profil seseorang; mengembalikan keadaan baru. */
export async function sukaProfil(userId: string): Promise<boolean> {
  const json = await fetchJson("/api/profil/momen", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "suka_profil", user_id: userId }),
  });
  return json.suka === true;
}

/**
 * Rekap absensi rentang tanggal → PDF; bila nomorWa diisi, PDF ikut
 * dikirim ke WhatsApp itu via Fonnte (spek 1.15).
 */
export async function buatRekapAbsensiPdf(opsi: {
  dari: string;
  sampai: string;
  nomorWa?: string;
}): Promise<{
  url: string;
  baris: number;
  terkirim_wa: boolean;
  pesan_wa: string;
}> {
  const json = await fetchJson("/api/absensi/rekap", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({
      dari: opsi.dari,
      sampai: opsi.sampai,
      nomor_wa: opsi.nomorWa,
    }),
  });
  return {
    url: (json.url as string) ?? "",
    baris: Number(json.baris ?? 0),
    terkirim_wa: json.terkirim_wa === true,
    pesan_wa: (json.pesan_wa as string) ?? "",
  };
}

export type BarisKepatuhan = {
  id_unik: string;
  periode: string;
  nama_kader: string;
  platform: string;
  akun_wajib: string;
  id_postingan: string;
  sudah_komentar: boolean;
  jumlah_komentar: number;
  /** Hanya terisi untuk pengurus (fitur ingatkan) */
  nomor_wa: string | null;
};

/** Rekap kepatuhan LENGKAP per baris (kader x postingan) satu periode. */
export async function getRekapKepatuhan(
  periode: string,
): Promise<BarisKepatuhan[]> {
  const json = await fetchJson(
    `/api/rekap?periode=${encodeURIComponent(periode)}`,
    {
      headers: headerToken(),
    },
  );
  return (json.data ?? []) as BarisKepatuhan[];
}

export type RingkasKepatuhanKader = {
  nama_kader: string;
  total: number;
  sudah: number;
  nomor_wa: string | null;
};

/** Ringkas kepatuhan PER KADER (agregat database — bebas cap 1000). */
export async function getRingkasKepatuhan(
  periode: string,
  platform?: string,
  /** Saringan kelompok akun wajib (mis. "tv rakyat") — 31 Agu 2026. */
  akun?: string,
): Promise<RingkasKepatuhanKader[]> {
  const p = platform ? `&platform=${encodeURIComponent(platform)}` : "";
  const a = akun ? `&akun=${encodeURIComponent(akun)}` : "";
  const json = await fetchJson(
    `/api/rekap?ringkas_kader=1&periode=${encodeURIComponent(periode)}${p}${a}`,
    { headers: headerToken() },
  );
  return (json.data ?? []) as RingkasKepatuhanKader[];
}

// --- Ringkasan per platform + tindak lanjut (rombakan 31 Agu 2026) ---

export type RingkasPlatformQc = {
  platform: string;
  postingan: number;
  patuh_penuh: number;
  total_kader: number;
};
export type KaderTindakLanjut = {
  nama_kader: string;
  total: number;
  sudah: number;
  persen: number;
  nomor_wa: string | null;
};

/** Ringkasan per sosmed + daftar kader < ambang (periode kosong = berjalan). */
export async function getRingkasPlatformQc(periode?: string): Promise<{
  periode: string;
  ambang: number;
  per_platform: RingkasPlatformQc[];
  tindak_lanjut: KaderTindakLanjut[];
}> {
  const p = periode ? `&periode=${encodeURIComponent(periode)}` : "";
  const json = await fetchJson(`/api/rekap?ringkas_platform=1${p}`, {
    headers: headerToken(),
  });
  return json as {
    periode: string;
    ambang: number;
    per_platform: RingkasPlatformQc[];
    tindak_lanjut: KaderTindakLanjut[];
  };
}

/** Setel ambang "perlu ditindaklanjuti" (pengurus/HR, 10-100%). */
export async function setAmbangTindak(ambang: number): Promise<void> {
  await fetchJson("/api/rekap", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ ambang }),
  });
}

export type AnggotaTanpaAkun = { id: string; nama: string; divisi: string };

/** Anggota yang BELUM menautkan akun sosmed (pengurus, spek 1.18). */
export async function getAnggotaTanpaAkun(): Promise<AnggotaTanpaAkun[]> {
  const json = await fetchJson("/api/akun-sosmed?tanpa=1", {
    headers: headerToken(),
  });
  return (json.data ?? []) as AnggotaTanpaAkun[];
}

/** Rincian kepatuhan SATU kader (baris per postingan) satu periode. */
export async function getDetailKepatuhanKader(
  periode: string,
  namaKader: string,
): Promise<BarisKepatuhan[]> {
  const json = await fetchJson(
    `/api/rekap?periode=${encodeURIComponent(periode)}&nama_kader=${encodeURIComponent(namaKader)}`,
    { headers: headerToken() },
  );
  return (json.data ?? []) as BarisKepatuhan[];
}

export type FotoMaster = { path: string; dibuat: string; url: string };

/** Master menjelajah database foto unggahan per bucket (spek 1.15). */
export async function getFotoMaster(
  bucket: string,
  halaman: number,
): Promise<{
  total: number;
  halaman: number;
  per_halaman: number;
  data: FotoMaster[];
}> {
  const json = await fetchJson(
    `/api/master?foto=${encodeURIComponent(bucket)}&halaman=${halaman}`,
    { headers: headerToken() },
  );
  return {
    total: Number(json.total ?? 0),
    halaman: Number(json.halaman ?? 1),
    per_halaman: Number(json.per_halaman ?? 24),
    data: (json.data ?? []) as FotoMaster[],
  };
}

export type PostinganEmbed = {
  id: string;
  platform: string;
  teks: string;
  url: string;
  thumbnail: string;
  waktu: string | null;
  metrik: { label: string; nilai: number }[];
};

/** 30 postingan terbaru seluruh sosmed TV Rakyat + metriknya (spek 1.15). */
export async function getEmbedTerbaru(): Promise<PostinganEmbed[]> {
  const json = await fetchJson("/api/tv/insight/detail?semua=1", {
    headers: headerToken(),
  });
  return (json.data ?? []) as PostinganEmbed[];
}

/** Besaran bonus koin per aktivitas (utk Pengaturan Fitur master). */
export async function getBonusKoin(): Promise<Record<string, number>> {
  const json = await fetchJson("/api/koin", { headers: headerToken() });
  return (json.bonus ?? {}) as Record<string, number>;
}

/** Master mengubah bonus koin satu aktivitas. */
export async function setBonusKoin(
  aktivitas: string,
  nilai: number,
): Promise<void> {
  await fetchJson("/api/master", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({
      aksi: "koin_bonus",
      username: aktivitas,
      nilai: String(nilai),
    }),
  });
}

// ------------------------------------------------------------
// Profil sosmed penyedia (spek 1.17)
// ------------------------------------------------------------

export type ProfilAnalisis = {
  id: string;
  judul: string;
  akun: { platform: string; username: string }[];
  gagal: boolean;
};

/** Daftar profil QC + akun tertautnya (pengurus). */
export async function getProfilAnalisis(): Promise<{
  penyedia: string;
  penautan_siap: boolean;
  data: ProfilAnalisis[];
}> {
  const json = await fetchJson("/api/analisis/profil", {
    headers: headerToken(),
  });
  return {
    penyedia: (json.penyedia as string) ?? "ayrshare",
    penautan_siap: json.penautan_siap === true,
    data: (json.data ?? []) as ProfilAnalisis[],
  };
}

export async function tambahProfilAnalisis(judul: string): Promise<void> {
  await fetchJson("/api/analisis/profil", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ judul }),
  });
}

export async function tautanProfilAnalisis(id: string): Promise<string> {
  const json = await fetchJson("/api/analisis/profil", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "tautan", id }),
  });
  return json.url as string;
}

export async function hapusProfilAnalisis(id: string): Promise<void> {
  await fetchJson("/api/analisis/profil", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ id }),
  });
}

/** TVR Saya: siapkan profilku + URL halaman penautan sosmed. */
export async function hubungkanSosmedTvr(): Promise<string> {
  const json = await fetchJson("/api/tvr/hubungkan", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
  });
  return json.url as string;
}

/** TVR Saya: baca akun tertaut + sinkron ke daftar akunku. */
export async function sinkronSosmedTvr(): Promise<{
  terhubung: { platform: string; username: string }[];
  tersinkron: number;
  konflik: string[];
}> {
  const json = await fetchJson("/api/tvr/hubungkan", {
    headers: headerToken(),
  });
  return {
    terhubung: (json.terhubung ?? []) as {
      platform: string;
      username: string;
    }[],
    tersinkron: Number(json.tersinkron ?? 0),
    konflik: (json.konflik ?? []) as string[],
  };
}

// ------------------------------------------------------------
// Zona (spek 1.18/2.6) & Setel KPI (spek 1.18/2.5)
// ------------------------------------------------------------

export type Zona = { id: string; nama: string; parent_id: string | null };

export async function getZona(): Promise<Zona[]> {
  const json = await fetchJson("/api/zona", { headers: headerToken() });
  return (json.data ?? []) as Zona[];
}

export async function tambahZona(
  nama: string,
  parentId?: string,
): Promise<void> {
  await fetchJson("/api/zona", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ nama, parent_id: parentId ?? null }),
  });
}

export async function tetapkanZonaAnggota(
  userId: string,
  zonaId: string | null,
): Promise<void> {
  await fetchJson("/api/zona", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ user_id: userId, zona_id: zonaId }),
  });
}

export type KpiTugas = {
  id: string;
  judul: string;
  deskripsi: string;
  divisi: string;
  tanggal_mulai: string;
  tenggat: string;
  prioritas: "rendah" | "sedang" | "tinggi" | "kritis";
  target_indikator: string;
  untuk_semua: boolean;
  status: "aktif" | "selesai" | "expired";
  progress: number;
  catatan_progress: string;
  target_ids: string[];
};

export async function getKpiTugas(status = "semua"): Promise<{
  boleh_kelola: boolean;
  kelola_semua: boolean;
  data: KpiTugas[];
}> {
  const json = await fetchJson(
    `/api/kpi?status=${encodeURIComponent(status)}`,
    {
      headers: headerToken(),
    },
  );
  return {
    boleh_kelola: json.boleh_kelola === true,
    kelola_semua: json.kelola_semua === true,
    data: (json.data ?? []) as KpiTugas[],
  };
}

export async function tambahKpiTugas(isi: {
  judul: string;
  deskripsi: string;
  divisi?: string;
  tanggal_mulai?: string;
  tenggat: string;
  prioritas: string;
  target_indikator?: string;
  untuk_semua: boolean;
  target_ids?: string[];
}): Promise<void> {
  await fetchJson("/api/kpi", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify(isi),
  });
}

export async function ubahKpiTugas(
  id: string,
  perubahan: Partial<{
    judul: string;
    deskripsi: string;
    tenggat: string;
    prioritas: string;
    progress: number;
    catatan: string;
    status: string;
  }>,
): Promise<void> {
  await fetchJson("/api/kpi", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ id, ...perubahan }),
  });
}

export async function hapusKpiTugas(id: string): Promise<void> {
  await fetchJson("/api/kpi", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ id }),
  });
}

// ---- Kuota & penyimpanan (Panel Master, 2 Sep 2026) ----
export type KuotaSistem = {
  penyimpanan: {
    total_byte: number;
    bucket: { nama: string; objek: number; byte: number }[];
  };
  video_bulan_ini: {
    jumlah: number;
    byte: number;
    bandwidth_byte: number;
    tanpa_ukuran: number;
  };
  cloudinary:
    | { siap: false }
    | {
        siap: true;
        paket: string;
        kredit_pakai: number;
        kredit_limit: number;
        persen: number;
        bandwidth_gb: number;
        simpan_gb: number;
      };
  uploadpost:
    | { siap: false }
    | { siap: true; paket: string; profil: number; limit: number };
  r2_aktif: boolean;
};

export async function getKuotaSistem(): Promise<KuotaSistem> {
  const json = await fetchJson("/api/master/kuota", { headers: headerToken() });
  return json as KuotaSistem;
}

// ---- Antrean posting terjadwal TVR Saya (2 Sep 2026) ----
export type JadwalTvrku = {
  job_id: string;
  scheduled_date: string;
  profil: string;
  judul: string;
  jenis: string;
  /** false untuk kiriman TAUTAN — berkasnya bukan milik aplikasi. */
  bisa_batal: boolean;
};

export async function getJadwalTvrku(): Promise<JadwalTvrku[]> {
  const json = await fetchJson("/api/tvr/jadwal-saya", {
    headers: headerToken(),
  });
  return (json.data ?? []) as JadwalTvrku[];
}

export async function batalkanJadwalTvrku(
  job_id: string,
): Promise<{ pesan: string }> {
  const json = await fetchJson("/api/tvr/jadwal-saya", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ job_id }),
  });
  return { pesan: String(json.pesan ?? "Jadwal dibatalkan.") };
}

// ---- PALUGODAM: edit otomatis + upload otomatis (2 Sep 2026) ----
export type PesananPalugodam = {
  id: string;
  kode_antrian: string;
  platforms: string[];
  caption_umum: string;
  jadwal: string | null;
  status: string;
  pesan: string;
  dibuat_pada: string;
  render_tahap: string;
  render_persen: number;
  render_selesai: boolean;
};

export async function getPesananPalugodam(): Promise<PesananPalugodam[]> {
  const json = await fetchJson("/api/tvr/edit-otomatis", {
    headers: headerToken(),
  });
  return (json.data ?? []) as PesananPalugodam[];
}

export async function kirimEditOtomatis(data: {
  link: string;
  highlight: string;
  judul_overlay: string;
  sumber_akun?: string;
  caption_umum?: string;
  caption_platform?: Record<string, string>;
  platforms: string[];
  jadwal?: string;
}): Promise<{ kode: string; pesan: string }> {
  const json = await fetchJson("/api/tvr/edit-otomatis", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify(data),
  });
  return { kode: String(json.kode ?? ""), pesan: String(json.pesan ?? "") };
}

// ---- Meja ACC HR: laporan video manual & permohonan blokir (2 Sep 2026) ----
export type PersetujuanKpi = {
  laporan: {
    id: string;
    user_id: string;
    nama: string;
    avatar_url: string;
    platform: string;
    url_video: string;
    keyword: string | null;
    tanggal_wib: string;
    dibuat_pada: string;
  }[];
  banned: {
    id: string;
    user_id: string;
    nama: string;
    avatar_url: string;
    platform: string;
    bukti_url: string;
    keterangan: string | null;
    dibuat_pada: string;
  }[];
};

export async function getPersetujuanKpi(): Promise<PersetujuanKpi> {
  const json = await fetchJson("/api/tvr/persetujuan", {
    headers: headerToken(),
  });
  return {
    laporan: (json.laporan ?? []) as PersetujuanKpi["laporan"],
    banned: (json.banned ?? []) as PersetujuanKpi["banned"],
  };
}

export async function putusPersetujuanKpi(data: {
  jenis: "laporan" | "banned";
  id?: string;
  /** ACC sekaligus: kirim banyak id laporan link (aksi harus "setuju"). */
  ids?: string[];
  aksi: "setuju" | "tolak";
  catatan?: string;
}): Promise<{ disetujui?: number }> {
  const json = await fetchJson("/api/tvr/persetujuan", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify(data),
  });
  return {
    disetujui: typeof json?.disetujui === "number" ? json.disetujui : undefined,
  };
}

// ---- Leaderboard kepatuhan komen (semua pengguna, 2 Sep 2026) ----
export type KepatuhanKomenLeaderboard = {
  periode: string;
  jendela: string;
  /** ISO kapan komentar terakhir diambil dari sosmed (null = belum pernah). */
  diperbarui?: string | null;
  /** "" = semua sosmed; terisi = hanya sosmed itu. */
  platform?: string;
  daftar: {
    nama: string;
    avatar_url: string;
    total: number;
    sudah: number;
    persen: number;
  }[];
};

export async function getKepatuhanKomenLeaderboard(
  platform = "",
): Promise<KepatuhanKomenLeaderboard> {
  const json = await fetchJson(
    `/api/peringkat-tvr?komen=1${platform ? `&platform=${encodeURIComponent(platform)}` : ""}`,
  );
  return json as KepatuhanKomenLeaderboard;
}

// ---- Galeri video akun TV Rakyat (modul Konten, 2 Sep 2026) ----
export type LingkaranGaleri = {
  /** "official" atau user_id anggota */
  kunci: string;
  nama: string;
  avatar_url: string;
  /** platform → username yang tertaut */
  akun: Record<string, string>;
};

export type VideoGaleri = {
  id: string;
  platform: string;
  url: string;
  thumbnail: string;
  caption: string;
  waktu: string | null;
  like: number | null;
  komentar: number | null;
};

export async function getGaleriKonten(): Promise<{
  official: LingkaranGaleri | null;
  pengguna: LingkaranGaleri[];
}> {
  const json = await fetchJson("/api/konten/galeri");
  return {
    official: (json?.official ?? null) as LingkaranGaleri | null,
    pengguna: (json?.pengguna ?? []) as LingkaranGaleri[],
  };
}

export async function getVideoGaleri(siapa: string): Promise<VideoGaleri[]> {
  const json = await fetchJson(
    `/api/konten/galeri?siapa=${encodeURIComponent(siapa)}`,
  );
  return (json?.data ?? []) as VideoGaleri[];
}

// ---- Ekspor seluruh data aplikasi sebagai TXT (basis data AI, 2 Sep 2026) ----
export async function unduhEksporData(): Promise<void> {
  const res = await fetch("/api/master/ekspor", { headers: headerToken() });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error ?? "Gagal mengekspor data.");
  }
  const blob = await res.blob();
  const nama = res.headers.get("x-nama-berkas") ?? "pri-superapp-data.txt";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---- Leaderboard VIDEO TERBAIK per sosmed (2 Sep 2026) ----
export type VideoTerbaik = {
  kode: string;
  platform: string;
  judul: string;
  url: string;
  thumbnail_url: string;
  nama_akun: string;
  akun_username: string;
  /** null = akun resmi TV Rakyat / akun wajib */
  user_id: string | null;
  avatar_url: string;
  waktu_posting: string | null;
  tayangan: number;
  suka: number;
  komentar: number;
  bagikan: number;
};

export type VideoTerbaikBalasan = {
  platform: "tiktok" | "instagram";
  metrik: "tayangan" | "suka" | "komentar";
  hari: number;
  daftar: VideoTerbaik[];
  cakupan: {
    akun_total: number;
    akun_tersapu: number;
    terakhir: string | null;
  };
};

export async function getVideoTerbaik(opsi: {
  platform: "tiktok" | "instagram";
  metrik: "tayangan" | "suka" | "komentar";
  hari: number;
}): Promise<VideoTerbaikBalasan> {
  const json = await fetchJson(
    `/api/peringkat-tvr?video=1&platform=${opsi.platform}&metrik=${opsi.metrik}&hari=${opsi.hari}`,
  );
  return json as VideoTerbaikBalasan;
}

// ---- SIARAN SERENTAK (3 Sep 2026): satu video → banyak profil upload-post ----
export type SiaranItem = {
  id: string;
  profil: string;
  user_id: string | null;
  nama: string;
  platforms: string[];
  status:
    "menunggu" | "diproses" | "terkirim" | "gagal" | "dibatalkan" | string;
  pesan: string;
  request_id: string | null;
  selesai_pada: string | null;
};

export type Siaran = {
  id: string;
  judul: string;
  caption: string;
  platforms: string[];
  jadwal: string | null;
  status: string;
  dibuat_pada: string;
  berkas_ada: boolean;
  item: SiaranItem[];
  ringkas: {
    total: number;
    terkirim: number;
    gagal: number;
    menunggu: number;
    dibatalkan: number;
  };
};

export async function getSiaran(): Promise<Siaran[]> {
  const json = await fetchJson("/api/tvr/siaran");
  return (json?.data ?? []) as Siaran[];
}

export async function buatSiaran(data: {
  r2_key?: string;
  path?: string;
  ukuran?: number;
  judul: string;
  caption?: string;
  platforms: string[];
  profil: string[];
  jadwal?: string;
}): Promise<{
  id: string;
  jumlah: number;
  langsung_gagal: number;
  terjadwal: boolean;
}> {
  const json = await fetchJson("/api/tvr/siaran", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return {
    id: String(json?.id ?? ""),
    jumlah: Number(json?.jumlah ?? 0),
    langsung_gagal: Number(json?.langsung_gagal ?? 0),
    terjadwal: json?.terjadwal === true,
  };
}

export async function batalSiaran(id: string): Promise<{ dibatalkan: number }> {
  const json = await fetchJson("/api/tvr/siaran", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  return { dibatalkan: Number(json?.dibatalkan ?? 0) };
}

// ---- STUDIO PALUGODAM (3 Sep 2026) ----
export type StudioSiap = {
  deepseek: boolean;
  creatomate: boolean;
  uploadpost: boolean;
  r2: boolean;
};
export type StudioTemplate = {
  template_id: string;
  label: string;
  elemen_video: string;
  elemen_judul: string;
  elemen_highlight: string;
  elemen_sumber: string;
  aktif: boolean;
};
export type StudioProfil = {
  profil: string;
  user_id: string | null;
  nama: string;
  akun: Record<string, string>;
  tertaut: number;
  template: StudioTemplate | null;
};
export type StudioProyekRingkas = {
  id: string;
  ringkas: string;
  sumber_platform: string;
  status: string;
  siaran_id: string | null;
  jumlah_item: number;
  dibuat_pada: string;
};
export type StudioItem = {
  id: string;
  profil: string;
  user_id: string | null;
  nama: string;
  template_id: string;
  judul: string;
  highlight: string;
  caption: string;
  render_status: "belum" | "rendering" | "sukses" | "gagal" | string;
  render_url: string;
  pesan: string;
  /** Mode per akun (4 Sep 2026): sumber & kesiapan milik akun ini sendiri. */
  sumber_link: string;
  sumber_platform: string;
  sumber_url: string;
  sumber_caption: string;
  sumber_akun: string;
  /** Yang masih kurang: link | judul | caption | highlight | template (kosong = siap). */
  kurang: string[];
};
export type StudioProyek = {
  proyek: {
    id: string;
    /** "bersama" = satu video untuk semua profil; "per_akun" = tiap akun punya videonya sendiri. */
    mode: "bersama" | "per_akun" | string;
    sumber_link: string;
    sumber_platform: string;
    sumber_url: string;
    sumber_caption: string;
    penjelasan: string;
    caption_inti: string;
    sumber_akun: string;
    status: string;
    siaran_id: string | null;
    dibuat_pada: string;
  };
  item: StudioItem[];
  siaran: {
    id: string;
    item: {
      id: string;
      profil: string;
      platforms: string[];
      status: string;
      pesan: string;
      /** Pemilik profil (4 Sep 2026) — untuk "salin semua link per pengguna". */
      user_id: string | null;
      nama: string;
      /** platform → URL postingan yang sudah terbit (dari laporan_video). */
      tautan: Record<string, string>;
    }[];
    ringkas: {
      total: number;
      terkirim: number;
      gagal: number;
      menunggu: number;
      dibatalkan: number;
    };
  } | null;
};

/** Satu anggota Divisi PALUGODAM + profil upload-post + template Creatomate-nya (aturan 1:1:1, 3 Sep 2026). */
export type StudioAnggota = {
  user_id: string;
  nama: string;
  username: string;
  posisi: string;
  avatar_url: string;
  /** Profil upload-post yang tertaut; "" = belum ada. */
  profil: string;
  /** Tercatat di aplikasi tapi sudah tidak ada di upload-post. */
  profil_hilang: boolean;
  akun: Record<string, string>;
  tertaut: number;
  template: StudioTemplate | null;
  /** Usulan nama profil bila admin memilih "Buat profil". */
  usulan_profil: string;
};
export type StudioPengaturan = {
  siap: StudioSiap;
  profil: StudioProfil[];
  anggota: StudioAnggota[];
  /** Profil upload-post yang belum tertaut ke siapa pun. */
  profil_bebas: { profil: string; tertaut: number }[];
  /** Template yang profilnya tidak tertaut ke anggota mana pun. */
  template_yatim: { profil: string; template_id: string; label: string }[];
  kuota: number;
  paket: string;
};

export async function getStudioPengaturan(): Promise<StudioPengaturan> {
  const json = await fetchJson("/api/studio?bagian=template");
  return {
    siap: json.siap as StudioSiap,
    profil: (json.profil ?? []) as StudioProfil[],
    anggota: (json.anggota ?? []) as StudioAnggota[],
    profil_bebas: (json.profil_bebas ?? []) as StudioPengaturan["profil_bebas"],
    template_yatim: (json.template_yatim ??
      []) as StudioPengaturan["template_yatim"],
    kuota: Number(json.kuota ?? 0),
    paket: String(json.paket ?? ""),
  };
}

export async function getStudioProyekList(): Promise<{
  siap: StudioSiap;
  data: StudioProyekRingkas[];
}> {
  const json = await fetchJson("/api/studio?bagian=proyek");
  return {
    siap: json.siap as StudioSiap,
    data: (json.data ?? []) as StudioProyekRingkas[],
  };
}

export async function getStudioProyek(id: string): Promise<StudioProyek> {
  const json = await fetchJson(`/api/studio?id=${encodeURIComponent(id)}`);
  return json as StudioProyek;
}

/** Aksi Studio (template_simpan/hapus, sumber_link/berkas, teks_simpan, generate, item_simpan, render, siaran, hapus). */
export async function studioPost(
  aksi: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const json = await fetchJson("/api/studio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ aksi, ...data }),
  });
  return (json ?? {}) as Record<string, unknown>;
}

// ---- Rincian kepatuhan komen per orang + AJUAN komentar (3 Sep 2026) ----
export type KepatuhanDetailPost = {
  id_postingan: string;
  platform: string;
  akun_wajib: string;
  url_postingan: string;
  waktu_posting: string | null;
  caption: string;
  thumbnail_url: string;
  sudah: boolean;
  jumlah: number;
  keterangan: string;
  ajuan: {
    id: string;
    status: string;
    username_komentar: string;
    catatan_putusan: string;
  } | null;
};
export type KepatuhanDetail = {
  periode: string;
  nama: string;
  milik_sendiri: boolean;
  /** false bila nama itu tidak cocok dengan pengguna aktif mana pun. */
  terdaftar: boolean;
  /** Username terdaftar ORANG ITU — ditampilkan di atas pop-up & pilihan saat Ajukan. */
  akun: { platform: string; username: string }[];
  total: number;
  sudah: number;
  daftar: KepatuhanDetailPost[];
};

export async function getKepatuhanDetail(
  nama: string,
  periode?: string,
): Promise<KepatuhanDetail> {
  const p = periode ? `&periode=${encodeURIComponent(periode)}` : "";
  const json = await fetchJson(
    `/api/kepatuhan?nama=${encodeURIComponent(nama)}${p}`,
  );
  return json as KepatuhanDetail;
}

export async function ajukanKomentar(data: {
  id_postingan: string;
  periode?: string;
  username_komentar: string;
  catatan?: string;
  /** Atas nama orang lain (3 Sep 2026); kosong = diri sendiri. */
  nama?: string;
}): Promise<void> {
  await fetchJson("/api/kepatuhan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export type AjuanKomentar = {
  id: string;
  periode: string;
  nama_kader: string;
  user_id: string;
  avatar_url: string;
  id_postingan: string;
  platform: string;
  akun_wajib: string;
  url_postingan: string;
  username_komentar: string;
  catatan: string;
  status: string;
  catatan_putusan: string;
  diputus_oleh: string | null;
  /** Terisi bila diajukan pengguna lain atas nama nama_kader. */
  diajukan_oleh: string;
  dibuat_pada: string;
  waktu_posting: string | null;
  caption: string;
};

export async function getAjuanKomentar(): Promise<{
  menunggu: AjuanKomentar[];
  terakhir: AjuanKomentar[];
}> {
  const json = await fetchJson("/api/kepatuhan?ajuan=1");
  return {
    menunggu: (json?.menunggu ?? []) as AjuanKomentar[],
    terakhir: (json?.terakhir ?? []) as AjuanKomentar[],
  };
}

export async function putusAjuanKomentar(data: {
  id: string;
  aksi: "setuju" | "tolak";
  catatan?: string;
}): Promise<void> {
  await fetchJson("/api/kepatuhan", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// ---- Panel Master: pemakaian server Supabase + token AI (3 Sep 2026) ----
export type RingkasAiKlien = {
  penyedia: string;
  panggilan: number;
  token_masuk: number;
  token_keluar: number;
  token_total: number;
};
export type ServerMaster = {
  server: {
    cpu_persen: number | null;
    /** "laju" = selisih counter CPU sejak pembacaan sebelumnya; "beban" = perkiraan beban 1 menit ÷ inti. */
    cpu_sumber: "laju" | "beban";
    cpu_inti: number;
    beban_1m: number | null;
    beban_5m: number | null;
    beban_15m: number | null;
    ram_total: number | null;
    ram_terpakai: number | null;
    ram_persen: number | null;
    disk_total: number | null;
    disk_terpakai: number | null;
    disk_persen: number | null;
    db_ukuran: number | null;
    diambil_pada: string;
  } | null;
  galat_server: string | null;
  ai: {
    hari_ini: RingkasAiKlien[];
    tujuh_hari: RingkasAiKlien[];
    tiga_puluh_hari: RingkasAiKlien[];
  };
  deepseek: { siap: boolean; tersedia?: boolean; saldo?: string };
};

export async function getServerMaster(): Promise<ServerMaster> {
  const json = await fetchJson("/api/master/server");
  return json as ServerMaster;
}

// ---- Panel Master: BEBAS KEWAJIBAN (3 Sep 2026) ----
export type PenggunaKewajiban = {
  id: string;
  nama: string;
  username: string;
  jabatan: string;
  divisi: string;
  avatar_url: string;
  sembunyi: boolean;
};

export async function cariKewajiban(
  cari: string,
): Promise<{ hasil: PenggunaKewajiban[]; dibebaskan: PenggunaKewajiban[] }> {
  const json = await fetchJson(
    `/api/master/kewajiban?cari=${encodeURIComponent(cari)}`,
  );
  return {
    hasil: (json.hasil ?? []) as PenggunaKewajiban[],
    dibebaskan: (json.dibebaskan ?? []) as PenggunaKewajiban[],
  };
}

export async function setSembunyiKewajiban(
  userId: string,
  sembunyi: boolean,
): Promise<PenggunaKewajiban> {
  const json = await fetchJson("/api/master/kewajiban", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, sembunyi }),
  });
  return json.pengguna as PenggunaKewajiban;
}

// ---- Juara komentar periode selesai terakhir (3 Sep 2026) ----
export type JuaraKomen = {
  peringkat: number;
  nama: string;
  avatar_url: string;
  total_komentar: number;
  /** Dasar urutan juara = leaderboard Kepatuhan Komen (4 Sep 2026). */
  persen: number;
  total_wajib: number;
  postingan: number;
};
export type HasilJuaraKomen = {
  periode: string | null;
  tanggal: string | null;
  periode_kini: string;
  juara: JuaraKomen[];
};

export async function getJuaraKomen(): Promise<HasilJuaraKomen> {
  const json = await fetchJson("/api/juara-komen");
  return {
    periode: (json.periode as string | null) ?? null,
    tanggal: (json.tanggal as string | null) ?? null,
    periode_kini: String(json.periode_kini ?? ""),
    juara: (json.juara ?? []) as JuaraKomen[],
  };
}

// ---- PET ROBOT (percobaan master, 3 Sep 2026) ----
export type { PetState } from "@/lib/pet";

export async function getPet(): Promise<import("@/lib/pet").PetState> {
  const json = await fetchJson("/api/pet");
  return json as import("@/lib/pet").PetState;
}

export async function petAksi(
  aksi: string,
  data: Record<string, unknown> = {},
): Promise<import("@/lib/pet").PetState & { pesan?: string }> {
  const json = await fetchJson("/api/pet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ aksi, ...data }),
  });
  return json as import("@/lib/pet").PetState & { pesan?: string };
}

// ---- PET v5 (5 Sep 2026): hadiah login harian, pasar trading, lobi ----
export type KeadaanHarian = {
  hari_ke: number;
  sudah_klaim: boolean;
  streak: number;
  koin_hari_ini: number;
  kalender: { hari: number; koin: number; diklaim: boolean; hari_ini: boolean }[];
  saldo: number;
  pesan?: string;
};
export async function getPetHarian(): Promise<KeadaanHarian> {
  return (await fetchJson("/api/pet/harian")) as KeadaanHarian;
}
export async function klaimPetHarian(): Promise<KeadaanHarian> {
  return (await fetchJson("/api/pet/harian", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })) as KeadaanHarian;
}

export type TawaranPasar = {
  id: string;
  kode_item: string;
  jenis_item: "aksesoris" | "sparepart" | "skin";
  nama_item: string;
  harga_katalog: number;
  minta_koin: number | null;
  minta_item: string | null;
  nama_minta_item: string | null;
  pemilik_id: string;
  pemilik_nama: string;
  pemilik_avatar: string;
  pihak_id: string | null;
  pihak_nama: string;
  arah: "jual" | "minta";
  saya_pemilik: boolean;
  saya_pembuat: boolean;
  bisa_terima: boolean;
  pesan: string;
  status: string;
  dibuat_pada: string;
  selesai_pada: string | null;
};
export type ItemTradable = { kode: string; jenis: "aksesoris" | "sparepart" | "skin"; nama: string; harga: number; terpasang: boolean };
export type DataPasar = {
  tawaran: TawaranPasar[];
  saya: TawaranPasar[];
  riwayat: TawaranPasar[];
  inventori: ItemTradable[];
  saldo: number;
  punya_robot: boolean;
};
export type RobotLobi = {
  user_id: string;
  nama_pemilik: string;
  nama_robot: string;
  jenis: "pria" | "wanita";
  level: number;
  skin: string | null;
  warna: string | null;
  terpasang: Record<string, string>;
  sparepart: Record<string, string>;
  tradable: ItemTradable[];
  x: number;
  y: number;
  arah: "kiri" | "kanan";
  pesan: string;
  saya: boolean;
};
export type DataLobi = { robot: RobotLobi[]; saya_hadir: boolean };

export async function getPasar(): Promise<DataPasar> {
  return (await fetchJson("/api/pet/pasar?bagian=pasar")) as DataPasar;
}
export async function getLobi(): Promise<DataLobi> {
  return (await fetchJson("/api/pet/pasar?bagian=lobi")) as DataLobi;
}
/** Aksi pasar (tawar/minta/batal/tolak/terima) — mengembalikan data pasar terbaru. */
export async function pasarAksi(aksi: string, data: Record<string, unknown> = {}): Promise<DataPasar & { id?: string }> {
  return (await fetchJson("/api/pet/pasar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi, ...data }) })) as DataPasar & { id?: string };
}
/** Kirim posisi robot di lobi; balasan = daftar robot lain (satu permintaan per detak). */
export async function kirimPosisiLobi(x: number, y: number, arah: "kiri" | "kanan", pesan: string): Promise<DataLobi> {
  return (await fetchJson("/api/pet/pasar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "lobi_posisi", x, y, arah, pesan }) })) as DataLobi;
}
/** Konfigurasi lobi realtime (5 Sep 2026): kunci publishable + rupa robot saya. */
export type KonfigLobi = {
  realtime: boolean;
  url: string;
  key: string;
  kanal: string;
  dunia: { lebar: number; tinggi: number };
  saya: Omit<RobotLobi, "x" | "y" | "arah" | "pesan" | "saya">;
};
export async function getLobiKonfig(): Promise<KonfigLobi> {
  return (await fetchJson("/api/pet/lobi")) as KonfigLobi;
}
export async function keluarLobi(): Promise<void> {
  await fetchJson("/api/pet/pasar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "lobi_keluar" }) }).catch(() => undefined);
}

// ---- REQUEST VIDEO TV Rakyat, KIRIM LAPORAN WA, KELOLA LAPORAN KPI, REALTIME (5 Sep 2026) ----
export type RequestVideo = {
  id: string;
  judul: string;
  keterangan: string;
  video_url: string;
  pembuat: string;
  aktif: boolean;
  dibuat_pada: string;
  jumlah_dikerjakan: number;
  jumlah_selesai: number;
  status_saya: "dikerjakan" | "selesai" | null;
  kerja: { user_id: string; nama: string; status: string; pada: string }[];
};
export type DataRequestVideo = {
  pimred: boolean;
  aktif_saya: { id: string; kerja_id: string; judul: string } | null;
  request: RequestVideo[];
  pesan?: string;
  id?: string;
};
export async function getRequestVideo(): Promise<DataRequestVideo> {
  return (await fetchJson("/api/tvr/request")) as DataRequestVideo;
}
export async function requestVideoAksi(aksi: string, data: Record<string, unknown> = {}): Promise<DataRequestVideo> {
  return (await fetchJson("/api/tvr/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi, ...data }) })) as DataRequestVideo;
}
export async function siapkanRequestVideo(nama: string, ukuran: number): Promise<{ r2_key: string; url: string }> {
  return (await fetchJson("/api/tvr/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "siapkan", nama, ukuran }) })) as { r2_key: string; url: string };
}

export type KeadaanKirimLaporan = {
  boleh: boolean;
  alasan: string;
  terkirim_hari_ini: number;
  batas_per_hari: number;
  jeda_menit: number;
  berikutnya_pada: string | null;
  kanal: "fonnte_grup" | "convia_nomor" | "belum";
  riwayat: { dikirim_pada: string; kanal: string; jumlah_video: number; status: string }[];
  tanggal?: string;
  pratinjau?: string;
  jumlah?: number;
  menunggu?: number;
  per_platform?: Record<string, string[]>;
  sukses?: boolean;
};
export async function getKirimLaporan(): Promise<KeadaanKirimLaporan> {
  return (await fetchJson("/api/tvr/kirim-laporan")) as KeadaanKirimLaporan;
}
export async function kirimLaporanWa(): Promise<KeadaanKirimLaporan> {
  return (await fetchJson("/api/tvr/kirim-laporan", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })) as KeadaanKirimLaporan;
}

export type LaporanAnggotaBaris = { id: string; user_id: string; platform: string; url_video: string; keyword: string | null; sumber: string | null; dibuat_pada: string; tanggal_wib: string };
export type AnggotaLaporan = { id: string; nama: string; avatar_url: string; divisi: string; jumlah: number };
export async function getLaporanAnggota(tanggal: string): Promise<{ tanggal: string; daftar: AnggotaLaporan[]; total: number }> {
  return (await fetchJson(`/api/tvr/laporan-anggota?tanggal=${encodeURIComponent(tanggal)}`)) as { tanggal: string; daftar: AnggotaLaporan[]; total: number };
}
export async function getLaporanAnggotaDetail(tanggal: string, userId: string): Promise<{ tanggal: string; anggota: Omit<AnggotaLaporan, "jumlah"> | null; laporan: LaporanAnggotaBaris[] }> {
  return (await fetchJson(`/api/tvr/laporan-anggota?tanggal=${encodeURIComponent(tanggal)}&user_id=${encodeURIComponent(userId)}`)) as { tanggal: string; anggota: Omit<AnggotaLaporan, "jumlah"> | null; laporan: LaporanAnggotaBaris[] };
}
export async function ubahLaporanAnggota(id: string, url_video: string, platform?: string): Promise<LaporanAnggotaBaris> {
  const json = await fetchJson("/api/tvr/laporan-anggota", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, url_video, platform }) });
  return json.laporan as LaporanAnggotaBaris;
}
export async function hapusLaporanAnggota(id: string, alasan = ""): Promise<void> {
  await fetchJson("/api/tvr/laporan-anggota", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, alasan }) });
}
export async function getRealtimeKonfig(): Promise<{ realtime: boolean; url: string; key: string }> {
  return (await fetchJson("/api/realtime/konfig")) as { realtime: boolean; url: string; key: string };
}

/** Robot peliharaan orang lain — tampilan saja (profil publik di chat, 3 Sep 2026). */
export async function getPetPublik(
  userId: string,
): Promise<import("@/lib/pet").PetState> {
  const json = await fetchJson(
    `/api/pet?user_id=${encodeURIComponent(userId)}`,
  );
  return json as import("@/lib/pet").PetState;
}

// ---- Rangkuman link harian TVR Saya (3 Sep 2026) ----
export type RangkumanLink = {
  nama: string;
  tanggal: string;
  per_platform: Record<string, string[]>;
  jumlah: number;
  menunggu: { platform: string; url: string }[];
};

export async function getRangkumanLink(
  tanggal?: string,
): Promise<RangkumanLink> {
  const q = tanggal ? `?tanggal=${encodeURIComponent(tanggal)}` : "";
  const json = await fetchJson(`/api/tvr/rangkuman${q}`);
  return json as RangkumanLink;
}

// ---- KENDALI AKUN PALUGODAM + LAPORAN HARIAN (4 Sep 2026) ----
export type AnggotaKendali = {
  id: string;
  nama: string;
  username: string;
  avatar_url: string;
  posisi: string;
  profil: string;
  tertaut: number;
};
export async function getKendaliAkun(): Promise<AnggotaKendali[]> {
  const json = await fetchJson("/api/tvr/kendali");
  return (json.anggota ?? []) as AnggotaKendali[];
}

export type LaporanHarian = {
  tanggal: string;
  tanggal_panjang: string;
  jam: string;
  dibuat_oleh: string;
  jumlah_orang: number;
  jumlah_link: number;
  orang: {
    nama: string;
    username: string;
    divisi: string;
    jumlah: number;
    platform: { platform: string; PLATFORM: string; jumlah: number; link: { url: string }[] }[];
  }[];
  teks: string;
  template_bawaan: boolean;
};
export async function getLaporanHarian(tanggal: string): Promise<LaporanHarian> {
  const json = await fetchJson(`/api/tvr/laporan-harian?tanggal=${encodeURIComponent(tanggal)}`);
  return {
    tanggal: String(json.tanggal ?? tanggal),
    tanggal_panjang: String(json.tanggal_panjang ?? ""),
    jam: String(json.jam ?? ""),
    dibuat_oleh: String(json.dibuat_oleh ?? ""),
    jumlah_orang: Number(json.jumlah_orang ?? 0),
    jumlah_link: Number(json.jumlah_link ?? 0),
    orang: (json.orang ?? []) as LaporanHarian["orang"],
    teks: String(json.teks ?? ""),
    template_bawaan: json.template_bawaan !== false,
  };
}
export async function unduhLaporanHarian(
  tanggal: string,
  format: "csv" | "pdf",
): Promise<{ url: string; nama_file: string; jumlah_orang: number; jumlah_link: number }> {
  const json = await fetchJson(`/api/tvr/laporan-harian?tanggal=${encodeURIComponent(tanggal)}&format=${format}`);
  return {
    url: String(json.url ?? ""),
    nama_file: String(json.nama_file ?? ""),
    jumlah_orang: Number(json.jumlah_orang ?? 0),
    jumlah_link: Number(json.jumlah_link ?? 0),
  };
}

// ---- LUDO ROBOT multipemain (percobaan, 3 Sep 2026) ----
export type { RuangLudo } from "@/lib/ludo";

export async function getLudoDaftar(): Promise<{
  boleh_buat: boolean;
  daftar: import("@/lib/ludo").RuangLudo[];
}> {
  const json = await fetchJson("/api/ludo?daftar=1");
  return {
    boleh_buat: json.boleh_buat === true,
    daftar: (json.daftar ?? []) as import("@/lib/ludo").RuangLudo[],
  };
}

export type CalonPemainLudo = {
  id: string;
  nama: string;
  username: string;
  jabatan: string;
  divisi: string;
  avatar_url: string;
};

/** Cari calon pemain untuk diundang ke ruang Ludo (terbuka untuk semua pengguna). */
export async function cariPemainLudo(cari: string): Promise<CalonPemainLudo[]> {
  const json = await fetchJson(`/api/ludo?cari=${encodeURIComponent(cari)}`);
  return (json.hasil ?? []) as CalonPemainLudo[];
}

export async function getLudoRuang(
  id: string,
): Promise<import("@/lib/ludo").RuangLudo> {
  const json = await fetchJson(`/api/ludo?id=${encodeURIComponent(id)}`);
  return json as import("@/lib/ludo").RuangLudo;
}

export async function ludoAksi(
  aksi: string,
  data: Record<string, unknown> = {},
): Promise<
  import("@/lib/ludo").RuangLudo & { sukses?: boolean; dihapus?: boolean }
> {
  const json = await fetchJson("/api/ludo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ aksi, ...data }),
  });
  return json as import("@/lib/ludo").RuangLudo & {
    sukses?: boolean;
    dihapus?: boolean;
  };
}

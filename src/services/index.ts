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
    headers: { ...headerToken(), ...((init?.headers ?? {}) as Record<string, string>) },
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

/** Header Authorization bila ada token; kosong bila belum masuk. */
function headerToken(): Record<string, string> {
  const t = ambilToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
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
export async function masukOtomatis(): Promise<UserLengkap | null | "perbaikan"> {
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

/** Langkah 1 — kirim data diri, kode OTP dikirim ke WhatsApp */
export async function daftar(data: {
  username: string;
  password: string;
  nomor_wa: string;
  nama?: string;
}): Promise<{ nomor_wa: string; otp_terkirim: boolean }> {
  const json = await fetchJson("/api/daftar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return {
    nomor_wa: json.nomor_wa as string,
    // false = OTP gagal terkirim; pengguna lanjut ke layar menunggu
    // persetujuan tanpa verifikasi WA (lihat /api/daftar).
    otp_terkirim: json.otp_terkirim !== false,
  };
}

/** Langkah 2 — verifikasi kode; berhasil = token tersimpan */
export async function verifikasiOtp(
  nomor_wa: string,
  kode: string,
): Promise<UserLengkap> {
  const json = await fetchJson("/api/otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nomor_wa, kode, nama_perangkat: namaPerangkat() }),
  });
  if (json.token) simpanToken(json.token as string);
  return json.user as UserLengkap;
}

/** Minta kode baru dikirim ulang */
export async function kirimUlangOtp(nomor_wa: string): Promise<void> {
  await fetchJson("/api/otp", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nomor_wa }),
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

// ------------------------------------------------------------
// Akun media sosial milik pengguna (acuan QC)
// ------------------------------------------------------------

export type AkunSosmed = {
  id: string;
  platform: "instagram" | "tiktok";
  username: string;
  catatan: string | null;
  aktif: boolean;
};

/** Semua akun sosmed milik pengguna (boleh lebih dari satu per platform) */
export async function getAkunSosmed(): Promise<AkunSosmed[]> {
  const res = await fetch("/api/akun-sosmed", { headers: headerToken() });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? "Gagal memuat akun sosmed");
  return json.data as AkunSosmed[];
}

export async function tambahAkunSosmed(data: {
  platform: "instagram" | "tiktok";
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
  platform: "instagram" | "tiktok";
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
// Ganti kata sandi (lewat OTP WhatsApp, maksimal 1x per minggu)
// ------------------------------------------------------------

/** Langkah 1: minta kode ke nomor WhatsApp terdaftar */
export async function mintaOtpGantiSandi(nomor_wa: string): Promise<void> {
  await fetchJson("/api/sandi", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ nomor_wa }),
  });
}

/** Langkah 2: kirim kode + sandi baru */
export async function gantiSandi(data: {
  nomor_wa: string;
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
    body: JSON.stringify({ id, tindakan, role, jabatan, bidang, ...(divisiInfo ?? {}) }),
  });
}

// ------------------------------------------------------------
// QC Konten — akun wajib, kader, postingan, komentar, rekap
// ------------------------------------------------------------

/** Daftar akun wajib beserta statistik kepatuhannya */
export async function getAkunWajib(): Promise<AkunWajibWithStats[]> {
  return ambilData<AkunWajibWithStats[]>("/api/akun-wajib");
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
  return ambilData<PostinganWithKepatuhan[]>(`/api/postingan?${params.toString()}`);
}

/** Komentar tertangkap sebuah postingan (nama_kader null = warga) */
export async function getKomentarByPostingan(id_postingan: string): Promise<Komentar[]> {
  return ambilData<Komentar[]>(
    `/api/komentar?id_postingan=${encodeURIComponent(id_postingan)}`,
  );
}

/** Rekap kepatuhan sebuah postingan + ringkasan sudah/belum/persen */
export async function getRekapPostingan(
  id_postingan: string,
): Promise<{ rekap: Rekap[]; ringkasan: RingkasanPostingan }> {
  const json = await fetchJson(
    `/api/rekap?id_postingan=${encodeURIComponent(id_postingan)}`,
  );
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
): Promise<{ tanggal: string; hari_ini: string; data: KerjaItem[]; kpi: KerjaKpi }> {
  const params = new URLSearchParams({ kategori });
  if (tanggal) params.set("tanggal", tanggal);
  if (userId) params.set("user", userId);
  const json = await fetchJson(`/api/laporan-kerja?${params.toString()}`, {
    headers: headerToken(),
  });
  return json as { tanggal: string; hari_ini: string; data: KerjaItem[]; kpi: KerjaKpi };
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

export async function tambahAktivitasKerja(deskripsi: string): Promise<KerjaItem> {
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
  akun: { platformAktif: string[]; akun: AkunTertaut[]; postBulanIni: number } | null;
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
): Promise<BalasanUnggah> {
  const json = await fetchJson("/api/tv/unggah", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ kode, platforms }),
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

export async function tambahAkunTvr(platform: string, username: string): Promise<AkunTvr> {
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
  tanggal_wib: string;
  dibuat_pada: string;
};

export type BalasanLaporanVideo = {
  tanggal: string;
  hari_ini: string;
  data: LaporanVideo[];
  kpi_target: number;
  kpi_tercapai: boolean;
  dibebaskan: string | null;
};

export async function getLaporanVideo(tanggal?: string): Promise<BalasanLaporanVideo> {
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
    kpi_target: Number(json.kpi_target ?? 5),
    data: (json.data ?? []) as RekapVideoBaris[],
    target_khusus: (json.target_khusus ?? []) as { user_id: string; kpi: number }[],
  };
}

export async function tambahLaporanVideo(platform: string, url: string): Promise<LaporanVideo> {
  const json = await fetchJson("/api/tvr/laporan", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ platform, url }),
  });
  return json.data as LaporanVideo;
}

export async function hapusLaporanVideo(id: string): Promise<void> {
  await fetchJson("/api/tvr/laporan", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ id }),
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
  const json = await fetchJson("/api/tvr/laporan?riwayat=1", { headers: headerToken() });
  return json as { data: { tanggal: string; jumlah: number }[]; kpi_target: number };
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
};

export async function getKonfigUploadVideo(): Promise<KonfigUploadVideo> {
  const json = await fetchJson("/api/tv/manual?konfig=1", { headers: headerToken() });
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

export async function getKirimanManual(): Promise<{ data: KirimanManual[]; retensi_jam: number }> {
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
}): Promise<string> {
  const json = await fetchJson("/api/tv/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify(data),
  });
  return json.kode as string;
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
  const json = await fetchJson("/api/chat?kandidat=1", { headers: headerToken() });
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
  const json = await fetchJson(`/api/chat?${params.toString()}`, { headers: headerToken() });
  return {
    status: json.status as string,
    diminta_oleh: json.diminta_oleh as string,
    terbaca_sampai: (json.terbaca_sampai as string) ?? "0",
    data: (json.data ?? []) as ChatPesan[],
  };
}

export async function mulaiChat(targetId: string, isi?: string): Promise<string> {
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

export async function jawabChat(kontakId: string, terima: boolean): Promise<void> {
  await fetchJson("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: terima ? "terima" : "tolak", kontak_id: kontakId }),
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
export async function setModeChat(mode: "terbuka" | "persetujuan"): Promise<void> {
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

export async function getPengumuman(): Promise<{
  cakupan_boleh: ("semua" | "jabatan" | "tim")[];
  jabatan_pilihan: readonly string[];
  data: Pengumuman[];
}> {
  const json = await fetchJson("/api/pengumuman", { headers: headerToken() });
  return json as {
    cakupan_boleh: ("semua" | "jabatan" | "tim")[];
    jabatan_pilihan: readonly string[];
    data: Pengumuman[];
  };
}

export async function kirimPengumuman(data: {
  judul: string;
  isi: string;
  cakupan: "semua" | "jabatan" | "tim";
  jabatan_target?: string;
}): Promise<number> {
  const json = await fetchJson("/api/pengumuman", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify(data),
  });
  return json.jumlah_penerima as number;
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

export async function putuskanPengajuanTim(id: string, setuju: boolean): Promise<void> {
  await fetchJson("/api/tim", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: setuju ? "acc" : "tolak_acc", anggota_id: id }),
  });
}

/** Perbaiki laporan video sendiri (hanya hari ini). */
export async function ubahLaporanVideo(
  id: string,
  platform: string,
  url: string,
): Promise<LaporanVideo> {
  const json = await fetchJson("/api/tvr/laporan", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ id, platform, url }),
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
  const json = await fetchJson("/api/chat?pantau=1", { headers: headerToken() });
  return {
    chat_aktif: json.chat_aktif !== false,
    chat_mode: json.chat_mode === "persetujuan" ? "persetujuan" : "terbuka",
    data: (json.data ?? []) as ChatPantau[],
  };
}

/** Isi satu percakapan milik orang lain (pemantauan). */
export async function getPesanPantau(kontakId: string): Promise<ChatPesan[]> {
  const json = await fetchJson(`/api/chat?pantau=1&kontak=${encodeURIComponent(kontakId)}`, {
    headers: headerToken(),
  });
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
): Promise<{ siap: boolean; pesan?: string; dariCache?: boolean; data: PostinganInsight[] }> {
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
export async function hapusVideoAntrian(kode: string): Promise<void> {
  await fetchJson(`/api/video-antrian/${encodeURIComponent(kode)}`, {
    method: "DELETE",
    headers: headerToken(),
  });
}

// ------------------------------------------------------------
// Panel Master (khusus peran master)
// ------------------------------------------------------------

export type DataMaster = {
  ringkasan: { pengguna_aktif: number; percakapan: number; video: number; galat: number };
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
  const json = await fetchJson("/api/fitur?matriks=1", { headers: headerToken() });
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
    const json = await fetchJson("/api/dashboard/akses", { headers: headerToken() });
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
  target: number;
  tercapai: boolean;
  /** "izin" | "sakit" bila hari itu dibebaskan; null bila tidak */
  dibebaskan: string | null;
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
export async function getDashboardKpi(tanggal?: string): Promise<KpiDashboardData> {
  const q = tanggal ? `?tanggal=${encodeURIComponent(tanggal)}` : "";
  const json = await fetchJson(`/api/dashboard/kpi${q}`, { headers: headerToken() });
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
export async function getDashboardTvAktivitas(): Promise<TvDashboardData["aktivitas"]> {
  const json = await fetchJson("/api/dashboard/tv?aktivitas=1", {
    headers: headerToken(),
  });
  return (json?.aktivitas ?? []) as TvDashboardData["aktivitas"];
}

/** Riwayat video 7 hari satu anggota (modal detail dashboard KPI). */
export async function getDashboardKpiAnggota(
  userId: string,
  tanggal?: string,
): Promise<{ tanggal: string; jumlah: number }[]> {
  const t = tanggal ? `&tanggal=${encodeURIComponent(tanggal)}` : "";
  const json = await fetchJson(`/api/dashboard/kpi?user=${encodeURIComponent(userId)}${t}`, {
    headers: headerToken(),
  });
  return (json?.riwayat ?? []) as { tanggal: string; jumlah: number }[];
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
  pengguna: { id: string; nama: string; avatar_url: string; struktur: string; nomor_wa: string };
  hari_ini: string;
  komentar: {
    periode: string;
    total: number;
    sudah: number;
    per_akun: { akun: string; total: number; sudah: number }[];
  };
  kerja: { tanggal: string; total: number; selesai: number; persen: number }[];
  absensi: { tanggal_wib: string; jenis: string; waktu: string; alamat: string | null }[];
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

/**
 * Rekap kepatuhan komentar satu periode. Dipakai kartu KPI beranda.
 * Lewat fetchJson supaya token perangkat ikut terkirim — endpoint
 * /api/rekap kini menolak permintaan tanpa login.
 */
export async function getRekapPeriode(
  periode: string,
): Promise<{ nama_kader: string; sudah_komentar: boolean }[]> {
  try {
    const json = await fetchJson(`/api/rekap?periode=${encodeURIComponent(periode)}`);
    return (json.data ?? []) as { nama_kader: string; sudah_komentar: boolean }[];
  } catch {
    // Kartu KPI bersifat pelengkap — kegagalannya tidak boleh
    // menggagalkan seluruh beranda.
    return [];
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
    const json = await fetchJson("/api/analisis/ayrshare", { headers: headerToken() });
    return json as CakupanAyrshare;
  } catch {
    // Cakupan hanya penjelas di layar — kegagalannya tidak boleh
    // menggagalkan seluruh layar QC.
    return { siap: false, tercakup: [], terlewat: [] };
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
    return (json.wewenang ?? { anggota: false, acc: false, upload: false, proses: false }) as WewenangTv;
  } catch {
    return { anggota: false, acc: false, upload: false, proses: false };
  }
}

/** Daftar tim + kandidat, untuk layar kelola Pimred. */
export async function getKelolaTimTv(): Promise<{
  tim: AnggotaTv[];
  kandidat: KandidatTv[];
  auto_broadcast: boolean;
}> {
  const json = await fetchJson("/api/tv/tim?kelola=1", { headers: headerToken() });
  return {
    tim: (json.tim ?? []) as AnggotaTv[],
    kandidat: (json.kandidat ?? []) as KandidatTv[],
    auto_broadcast: json.auto_broadcast !== false,
  };
}

/** Pimred: nyalakan/matikan siaran otomatis upload -> ruang chat. */
export async function setAutoBroadcastTv(nyala: boolean): Promise<void> {
  await fetchJson("/api/tv/tim", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "auto_broadcast", nyala }),
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
export async function getStreakSaya(): Promise<{ hari: number; restore_tersedia: boolean }> {
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
  const json = await fetchJson("/api/chat/grup?anggota=1", { headers: headerToken() });
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
  links: string[],
): Promise<{ tersimpan: number; gagal: { url: string; alasan: string }[] }> {
  const json = await fetchJson("/api/tvr/laporan", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ banyak: links.map((url) => ({ url })) }),
  });
  return {
    tersimpan: Array.isArray(json.tersimpan) ? json.tersimpan.length : 0,
    gagal: (json.gagal ?? []) as { url: string; alasan: string }[],
  };
}

/** HR/QC/Pengawas menyetel target KPI video per akun (null = bawaan 5). */
export async function setKpiVideo(userId: string, kpi: number | null): Promise<number> {
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

export async function getAcara(): Promise<{ boleh_kelola: boolean; data: AcaraPenting[] }> {
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
  const json = await fetchJson(`/api/profil/momen${params}`, { headers: headerToken() });
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
}): Promise<{ url: string; baris: number; terkirim_wa: boolean; pesan_wa: string }> {
  const json = await fetchJson("/api/absensi/rekap", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ dari: opsi.dari, sampai: opsi.sampai, nomor_wa: opsi.nomorWa }),
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
export async function getRekapKepatuhan(periode: string): Promise<BarisKepatuhan[]> {
  const json = await fetchJson(`/api/rekap?periode=${encodeURIComponent(periode)}`, {
    headers: headerToken(),
  });
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
): Promise<RingkasKepatuhanKader[]> {
  const p = platform ? `&platform=${encodeURIComponent(platform)}` : "";
  const json = await fetchJson(
    `/api/rekap?ringkas_kader=1&periode=${encodeURIComponent(periode)}${p}`,
    { headers: headerToken() },
  );
  return (json.data ?? []) as RingkasKepatuhanKader[];
}

export type AnggotaTanpaAkun = { id: string; nama: string; divisi: string };

/** Anggota yang BELUM menautkan akun sosmed (pengurus, spek 1.18). */
export async function getAnggotaTanpaAkun(): Promise<AnggotaTanpaAkun[]> {
  const json = await fetchJson("/api/akun-sosmed?tanpa=1", { headers: headerToken() });
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
): Promise<{ total: number; halaman: number; per_halaman: number; data: FotoMaster[] }> {
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
export async function setBonusKoin(aktivitas: string, nilai: number): Promise<void> {
  await fetchJson("/api/master", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ aksi: "koin_bonus", username: aktivitas, nilai: String(nilai) }),
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
  const json = await fetchJson("/api/analisis/profil", { headers: headerToken() });
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
  const json = await fetchJson("/api/tvr/hubungkan", { headers: headerToken() });
  return {
    terhubung: (json.terhubung ?? []) as { platform: string; username: string }[],
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

export async function tambahZona(nama: string, parentId?: string): Promise<void> {
  await fetchJson("/api/zona", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerToken() },
    body: JSON.stringify({ nama, parent_id: parentId ?? null }),
  });
}

export async function tetapkanZonaAnggota(userId: string, zonaId: string | null): Promise<void> {
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
  const json = await fetchJson(`/api/kpi?status=${encodeURIComponent(status)}`, {
    headers: headerToken(),
  });
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

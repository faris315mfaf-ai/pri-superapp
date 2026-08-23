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

/** Jeda simulasi jaringan 300–800 ms */
async function delay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 500));
}

/**
 * Fetch JSON dari API route (path relatif) dengan penanganan error
 * berbahasa Indonesia. Mengembalikan objek respons apa adanya.
 */
async function fetchJson(path: string, init?: RequestInit): Promise<any> {
  await delay();
  const res = await fetch(path, init);

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
export async function login(email: string, password: string): Promise<User> {
  const json = await fetchJson("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return json.user as User;
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
 * Proses link video (TikTok/Instagram) → judul overlay, highlight,
 * dan caption. Field yang tidak diisi pengguna dilengkapi oleh LLM
 * (server), dengan fallback template bila LLM gagal.
 */
export async function prosesVideo(payload: {
  link: string;
  judul_overlay?: string;
  highlight?: string;
}): Promise<HasilProsesVideo> {
  const json = await fetchJson("/api/proses-video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return json as HasilProsesVideo;
}

/** Berita terbaru dari Nusantara TV */
export async function getBeritaTerbaru(): Promise<Berita[]> {
  return ambilData<Berita[]>("/api/berita");
}

// ------------------------------------------------------------
// Notifikasi & Dashboard
// ------------------------------------------------------------

/** Daftar notifikasi dalam aplikasi */
export async function getNotifikasi(): Promise<NotifikasiItem[]> {
  return ambilData<NotifikasiItem[]>("/api/notifikasi");
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
 * 7 periode terakhir untuk dropdown pemilih periode.
 * Elemen pertama adalah periode aktif (PERIODE_AKTIF), disusul
 * 6 periode harian sebelumnya. Format: "2026-08-22 17:00-15:59".
 */
export async function getPeriodeList(): Promise<string[]> {
  await delay();
  const tanggalAktif = PERIODE_AKTIF.slice(0, 10); // "2026-08-23"
  const dasar = new Date(`${tanggalAktif}T00:00:00Z`);
  const daftar: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(dasar.getTime() - i * 24 * 60 * 60 * 1000);
    daftar.push(`${d.toISOString().slice(0, 10)} 17:00-15:59`);
  }
  return daftar;
}

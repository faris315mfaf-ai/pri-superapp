// ============================================================
// SADAR (sadar-pri.id) — aplikasi absensi resmi (14 Sep 2026).
//
// Kontrak API (diverifikasi langsung 14 Sep 2026):
//   GET {SADAR_API_URL}/api/attendance/today            → hari ini
//   GET {SADAR_API_URL}/api/attendance?date=YYYY-MM-DD  → tanggal tertentu
//   Header: Authorization: Bearer <SADAR_API_TOKEN>
//   Balasan: { success, date, count, data:[{ employee_code, name, email,
//              date, present, status, type, clock_in "HH:MM:SS"|null,
//              clock_out, verification_status }] }
// Catatan: /attendance/today MENGABAIKAN ?date — pakai /attendance?date=.
//
// Bagian yang murni (uraiSadar, waktuWibKeIso, jenisKehadiran) dipisah
// dari pengambilan jaringan supaya bisa diuji tanpa token.
// ============================================================

export const SADAR_URL_BAWAAN = "https://sadar-pri.id";

export type BarisSadarMentah = {
  employee_code?: unknown;
  name?: unknown;
  email?: unknown;
  date?: unknown;
  present?: unknown;
  status?: unknown;
  type?: unknown;
  clock_in?: unknown;
  clock_out?: unknown;
  verification_status?: unknown;
};

export type BarisSadar = {
  kode: string;
  nama: string;
  /** huruf kecil, sudah di-trim — kunci pencocokan ke app_user.email */
  email: string;
  tanggal: string;
  hadir: boolean;
  status: string;
  tipe: string;
  /** "HH:MM:SS" atau "" */
  jamMasuk: string;
  jamPulang: string;
  verifikasi: string;
  mentah: Record<string, unknown>;
};

export type JenisKehadiran = "hadir" | "sakit" | "izin" | "alfa";

/** Jenis kehadiran untuk layar, dari status/tipe SADAR. */
export function jenisKehadiran(b: Pick<BarisSadar, "hadir" | "status" | "tipe" | "jamMasuk">): JenisKehadiran {
  const t = `${b.tipe} ${b.status}`.toLowerCase();
  if (/sick|sakit/.test(t)) return "sakit";
  if (/permission|permit|leave|izin|cuti|dinas|wfh|remote/.test(t)) return "izin";
  if (b.jamMasuk || (b.hadir && /regular|on_time|late|present|hadir/.test(t))) return "hadir";
  return "alfa";
}

/** Label Indonesia untuk status/tipe SADAR yang belum kita kenal pun tetap terbaca. */
export function labelSadar(status: string, tipe: string): string {
  const peta: Record<string, string> = {
    on_time: "Tepat waktu",
    late: "Terlambat",
    sick: "Sakit",
    permission: "Izin",
    leave: "Cuti",
    absent: "Tidak hadir",
    holiday: "Libur",
    regular: "Reguler",
    present: "Hadir",
    pending: "Menunggu verifikasi",
    done: "Sudah diverifikasi",
    verified: "Terverifikasi",
    approved: "Disetujui",
    rejected: "Ditolak",
  };
  const s = peta[status] ?? status.replace(/_/g, " ");
  const t = peta[tipe] ?? tipe.replace(/_/g, " ");
  if (!s && !t) return "";
  if (!t || t === s || tipe === "regular") return s;
  if (!s) return t;
  return `${s} · ${t}`;
}

const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;
const POLA_JAM = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

function teks(v: unknown, maks = 200): string {
  return typeof v === "string" ? v.trim().slice(0, maks) : v == null ? "" : String(v).slice(0, maks);
}

function jam(v: unknown): string {
  const s = teks(v, 8);
  const m = POLA_JAM.exec(s);
  if (!m) return "";
  return `${m[1]}:${m[2]}:${m[3] ?? "00"}`;
}

/**
 * Jam SADAR ("HH:MM:SS", waktu Indonesia bagian barat) + tanggal → ISO UTC,
 * bentuk yang sama dengan kolom absensi.waktu. Tanpa ini "07:02:00" akan
 * dibaca sebagai 07:02 UTC = 14:02 WIB dan semua orang tampak telat.
 */
export function waktuWibKeIso(tanggal: string, jamWib: string): string | null {
  if (!POLA_TANGGAL.test(tanggal) || !POLA_JAM.test(jamWib)) return null;
  const t = Date.parse(`${tanggal}T${jam(jamWib)}+07:00`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * Bersihkan balasan SADAR. Baris tanpa kode pegawai atau tanggal tidak sah
 * dibuang — tidak bisa dikunci upsert. Email dinormalkan huruf kecil.
 */
export function uraiSadar(json: unknown, tanggalDiminta?: string): { tanggal: string; baris: BarisSadar[] } {
  const j = (json && typeof json === "object" ? json : {}) as { date?: unknown; data?: unknown };
  const tanggal = POLA_TANGGAL.test(teks(j.date)) ? teks(j.date) : (tanggalDiminta ?? "");
  const daftar = Array.isArray(j.data) ? (j.data as BarisSadarMentah[]) : [];
  const baris: BarisSadar[] = [];
  for (const d of daftar) {
    if (!d || typeof d !== "object") continue;
    const kode = teks(d.employee_code, 60);
    const tgl = POLA_TANGGAL.test(teks(d.date)) ? teks(d.date) : tanggal;
    if (!kode || !POLA_TANGGAL.test(tgl)) continue;
    baris.push({
      kode,
      nama: teks(d.name, 160),
      email: teks(d.email, 200).toLowerCase(),
      tanggal: tgl,
      hadir: d.present === true || d.present === 1 || d.present === "1" || d.present === "true",
      status: teks(d.status, 60).toLowerCase(),
      tipe: teks(d.type, 60).toLowerCase(),
      jamMasuk: jam(d.clock_in),
      jamPulang: jam(d.clock_out),
      verifikasi: teks(d.verification_status, 60).toLowerCase(),
      mentah: d as Record<string, unknown>,
    });
  }
  return { tanggal, baris };
}

// ---------------- sisi jaringan (server saja) ----------------

export function sadarSiap(): boolean {
  return Boolean(process.env.SADAR_API_TOKEN);
}

function asalSadar(): string {
  return (process.env.SADAR_API_URL || SADAR_URL_BAWAAN).replace(/\/$/, "");
}

/**
 * Tarik absensi SADAR satu tanggal (kosong = hari ini). Melempar bila
 * token belum diatur atau SADAR menolak — pemanggil yang memutuskan
 * apakah itu fatal.
 */
export async function ambilAbsensiSadar(tanggal?: string): Promise<{ tanggal: string; baris: BarisSadar[] }> {
  const token = process.env.SADAR_API_TOKEN ?? "";
  if (!token) throw new Error("SADAR_API_TOKEN belum diatur.");
  const url = tanggal
    ? `${asalSadar()}/api/attendance?date=${encodeURIComponent(tanggal)}`
    : `${asalSadar()}/api/attendance/today`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`SADAR menjawab ${res.status}.`);
  const json = (await res.json().catch(() => null)) as { success?: unknown } | null;
  if (!json || json.success === false) throw new Error("Balasan SADAR tidak dikenali.");
  return uraiSadar(json, tanggal);
}

// ============================================================
// METRIK SERVER — KHUSUS SERVER.
// CPU, RAM, disk, beban, dan ukuran database untuk Panel Master → Server,
// serta untuk PEMANTAU SERVER (lib/pantau-server) yang memberi tahu master
// saat ada anomali.
//
// DUA SUMBER (12 Sep 2026):
//   1. SERVER SENDIRI — dibaca langsung dari /proc. Dipakai saat aplikasi
//      berjalan di VPS. Ini sumber yang benar sejak pindah dari Vercel:
//      alamat metrik Supabase Cloud TIDAK ADA di Supabase yang dipasang
//      sendiri, jadi kalau tetap dipakai, halaman Server hanya menampilkan
//      galat dan pemantau kehilangan angka CPU/RAM tanpa suara.
//   2. SUPABASE CLOUD — alamat metrik Prometheus miliknya. Dipakai saat
//      aplikasi masih di Vercel (tidak punya /proc yang berarti).
//
// Yang dipilih ditentukan dari keadaan, bukan dari sakelar: kalau /proc
// bisa dibaca, itu yang dipakai.
// ============================================================
import { readFileSync, statfsSync } from "node:fs";
import os from "node:os";

type Sampel = { idle: number; total: number; waktu: number };

export type RingkasServer = {
  cpu_persen: number | null;
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
};

// CPU% sejati butuh DUA cuplikan counter; cuplikan pertama disimpan per
// instans server, jadi pembacaan kedua (≥ beberapa detik kemudian) memberi
// laju nyata. Sebelum itu dipakai perkiraan dari beban 1 menit ÷ jumlah inti.
let sampelTerakhir: Sampel | null = null;

/** Ambil teks metrik Prometheus dari Supabase. */
export async function ambilMetrik(): Promise<string> {
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "") + "/customer/v1/privileged/metrics";
  const key = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!url.startsWith("http") || !key) throw new Error("SUPABASE_URL / SUPABASE_SECRET_KEY kosong.");
  const res = await fetch(url, {
    headers: { Authorization: "Basic " + Buffer.from(`service_role:${key}`).toString("base64") },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Metrik Supabase menolak (${res.status}).`);
  return res.text();
}

/** Nilai metrik pertama yang cocok (nama + potongan label opsional). */
function nilai(teks: string, nama: string, label = ""): number | null {
  const re = new RegExp(`^${nama}\\{[^}]*${label}[^}]*\\}\\s+([-+0-9.eE]+)`, "m");
  const m = re.exec(teks) ?? new RegExp(`^${nama}\\s+([-+0-9.eE]+)`, "m").exec(teks);
  return m ? Number(m[1]) : null;
}

/** Jumlah semua nilai metrik bernama (lintas label). */
function jumlah(teks: string, nama: string, label = ""): number {
  const re = new RegExp(`^${nama}\\{[^}]*${label}[^}]*\\}\\s+([-+0-9.eE]+)`, "gm");
  let total = 0;
  for (const m of teks.matchAll(re)) total += Number(m[1]);
  return total;
}

function cuplikanCpu(teks: string): Sampel {
  return {
    idle: jumlah(teks, "node_cpu_seconds_total", 'mode="idle"'),
    total: jumlah(teks, "node_cpu_seconds_total"),
    waktu: Date.now(),
  };
}

function persen(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Ringkasan server dari teks metrik; null bila teksnya bukan metrik node. */
export function ringkasDariMetrik(teks: string): RingkasServer | null {
  if (!teks.includes("node_memory_MemTotal_bytes")) return null;
  const inti = new Set([...teks.matchAll(/^node_cpu_seconds_total\{[^}]*cpu="(\d+)"/gm)].map((m) => m[1])).size;
  const beban1 = nilai(teks, "node_load1");
  const c = cuplikanCpu(teks);
  let cpuPersen: number | null = null;
  let cpuSumber: "laju" | "beban" = "beban";
  if (sampelTerakhir && c.total > sampelTerakhir.total) {
    cpuPersen = persen((1 - (c.idle - sampelTerakhir.idle) / (c.total - sampelTerakhir.total)) * 100);
    cpuSumber = "laju";
  }
  if (c.total > 0 && (!sampelTerakhir || c.total > sampelTerakhir.total)) sampelTerakhir = c;
  if (cpuPersen == null && beban1 != null && inti > 0) cpuPersen = persen((beban1 / inti) * 100);

  const memTotal = nilai(teks, "node_memory_MemTotal_bytes");
  const memAvail = nilai(teks, "node_memory_MemAvailable_bytes");
  const diskSize = nilai(teks, "node_filesystem_size_bytes", 'mountpoint="/data"');
  const diskAvail = nilai(teks, "node_filesystem_avail_bytes", 'mountpoint="/data"');
  const dbSize = jumlah(teks, "pg_database_size_bytes");
  return {
    cpu_persen: cpuPersen,
    cpu_sumber: cpuSumber,
    cpu_inti: inti,
    beban_1m: beban1,
    beban_5m: nilai(teks, "node_load5"),
    beban_15m: nilai(teks, "node_load15"),
    ram_total: memTotal,
    ram_terpakai: memTotal != null && memAvail != null ? memTotal - memAvail : null,
    ram_persen: memTotal && memAvail != null ? Math.round(((memTotal - memAvail) / memTotal) * 100) : null,
    disk_total: diskSize,
    disk_terpakai: diskSize != null && diskAvail != null ? diskSize - diskAvail : null,
    disk_persen: diskSize && diskAvail != null ? Math.round(((diskSize - diskAvail) / diskSize) * 100) : null,
    db_ukuran: dbSize || null,
    diambil_pada: new Date().toISOString(),
  };
}

// ------------------------------------------------------------
// SUMBER 1: server sendiri (/proc)
// ------------------------------------------------------------

/** true bila proses ini bisa membaca keadaan mesinnya sendiri. */
export function bisaBacaProc(): boolean {
  try {
    readFileSync("/proc/meminfo", "utf8");
    return true;
  } catch {
    return false;
  }
}

function angkaMeminfo(teks: string, kunci: string): number | null {
  // Bentuk barisnya: "MemTotal:       32897040 kB"
  const m = new RegExp(`^${kunci}:\\s+(\\d+) kB`, "m").exec(teks);
  return m ? Number(m[1]) * 1024 : null;
}

/**
 * Ringkasan dari /proc. Di dalam container Docker, /proc menampilkan
 * keadaan MESIN INDUK — jadi angkanya memang angka server, bukan angka
 * container. Itu yang diinginkan di sini.
 */
export function ringkasDariProc(
  // Isi /proc bisa dioper langsung supaya logikanya bisa diuji tanpa Linux.
  sumber?: { meminfo: string; stat: string; loadavg: string; inti?: number },
): RingkasServer | null {
  let meminfo: string, stat: string, loadavg: string;
  if (sumber) {
    ({ meminfo, stat, loadavg } = sumber);
  } else {
    try {
      meminfo = readFileSync("/proc/meminfo", "utf8");
      stat = readFileSync("/proc/stat", "utf8");
      loadavg = readFileSync("/proc/loadavg", "utf8");
    } catch {
      return null;
    }
  }

  // Baris pertama /proc/stat: cpu user nice system idle iowait irq softirq steal ...
  const kolom = (/^cpu\s+(.*)$/m.exec(stat)?.[1] ?? "").trim().split(/\s+/).map(Number);
  const total = kolom.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  // idle + iowait: dua-duanya berarti prosesornya tidak mengerjakan apa pun.
  const idle = (kolom[3] ?? 0) + (kolom[4] ?? 0);
  const c: Sampel = { idle, total, waktu: Date.now() };

  const inti = sumber?.inti ?? (os.cpus().length || 1);
  const beban = loadavg.trim().split(/\s+/).map(Number);
  const beban1 = Number.isFinite(beban[0]) ? beban[0] : null;

  let cpuPersen: number | null = null;
  let cpuSumber: "laju" | "beban" = "beban";
  if (sampelTerakhir && c.total > sampelTerakhir.total) {
    cpuPersen = persen((1 - (c.idle - sampelTerakhir.idle) / (c.total - sampelTerakhir.total)) * 100);
    cpuSumber = "laju";
  }
  if (c.total > 0 && (!sampelTerakhir || c.total > sampelTerakhir.total)) sampelTerakhir = c;
  // Sebelum ada dua cuplikan, beban 1 menit dipakai sebagai perkiraan.
  if (cpuPersen == null && beban1 != null) cpuPersen = persen((beban1 / inti) * 100);

  const ramTotal = angkaMeminfo(meminfo, "MemTotal");
  const ramTersedia = angkaMeminfo(meminfo, "MemAvailable");

  let diskTotal: number | null = null;
  let diskTersedia: number | null = null;
  try {
    if (sumber) throw new Error("mode uji");
    const fs = statfsSync("/");
    diskTotal = Number(fs.blocks) * Number(fs.bsize);
    diskTersedia = Number(fs.bavail) * Number(fs.bsize);
  } catch {
    // Sebagian sistem tidak menyediakannya — bagian disk dibiarkan kosong.
  }

  return {
    cpu_persen: cpuPersen,
    cpu_sumber: cpuSumber,
    cpu_inti: inti,
    beban_1m: beban1,
    beban_5m: Number.isFinite(beban[1]) ? beban[1] : null,
    beban_15m: Number.isFinite(beban[2]) ? beban[2] : null,
    ram_total: ramTotal,
    ram_terpakai: ramTotal != null && ramTersedia != null ? ramTotal - ramTersedia : null,
    ram_persen:
      ramTotal && ramTersedia != null ? Math.round(((ramTotal - ramTersedia) / ramTotal) * 100) : null,
    disk_total: diskTotal,
    disk_terpakai: diskTotal != null && diskTersedia != null ? diskTotal - diskTersedia : null,
    disk_persen:
      diskTotal && diskTersedia != null ? Math.round(((diskTotal - diskTersedia) / diskTotal) * 100) : null,
    db_ukuran: null, // diisi terpisah lewat database (lihat bacaMetrikServer)
    diambil_pada: new Date().toISOString(),
  };
}

/**
 * Ukuran database, ditanyakan ke databasenya sendiri. Dipakai saat metrik
 * datang dari /proc (yang tidak tahu apa-apa soal PostgreSQL).
 * Butuh fungsi `ukuran_database()` di database (sql/44); tanpa itu hasilnya
 * null dan halaman Server tetap tampil, hanya tanpa angka ukuran.
 */
async function ukuranDatabase(): Promise<number | null> {
  try {
    const { supabase } = await import("@/lib/supabase");
    const { data, error } = await supabase().rpc("ukuran_database");
    if (error) return null;
    const n = Number(data);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Baca metrik lalu ringkas; galat dikembalikan sebagai teks (tidak melempar). */
export async function bacaMetrikServer(): Promise<{ server: RingkasServer | null; galat: string }> {
  // Server sendiri lebih dulu: kalau /proc ada, itu mesin yang benar-benar
  // menjalankan aplikasi ini.
  const lokal = ringkasDariProc();
  if (lokal) {
    lokal.db_ukuran = await ukuranDatabase();
    return { server: lokal, galat: "" };
  }
  try {
    const teks = await ambilMetrik();
    const server = ringkasDariMetrik(teks);
    return { server, galat: server ? "" : teks.slice(0, 200) };
  } catch (e) {
    return { server: null, galat: e instanceof Error ? e.message : String(e) };
  }
}

// ============================================================
// METRIK SERVER (dipindah dari /api/master/server, 4 Sep 2026) — KHUSUS SERVER.
// Membaca metrik Prometheus Supabase (CPU, RAM, disk, beban, ukuran DB) untuk
// Panel Master → Server, dan untuk PEMANTAU SERVER (lib/pantau-server) yang
// memberi tahu master saat ada anomali.
// ============================================================

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

/** Baca metrik lalu ringkas; galat dikembalikan sebagai teks (tidak melempar). */
export async function bacaMetrikServer(): Promise<{ server: RingkasServer | null; galat: string }> {
  try {
    const teks = await ambilMetrik();
    const server = ringkasDariMetrik(teks);
    return { server, galat: server ? "" : teks.slice(0, 200) };
  } catch (e) {
    return { server: null, galat: e instanceof Error ? e.message : String(e) };
  }
}

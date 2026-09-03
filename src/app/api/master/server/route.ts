// GET /api/master/server — pemakaian SERVER Supabase (CPU, RAM, disk, ukuran
// database, beban) + token AI (DeepSeek/Gemini) + saldo DeepSeek. Khusus
// master & super_admin (Panel Master, 3 Sep 2026).
//
// Sumber metrik: endpoint Prometheus resmi Supabase
//   GET https://<ref>.supabase.co/customer/v1/privileged/metrics
//   (Basic auth service_role:<secret key>) — diverifikasi 3 Sep 2026: 200 OK,
//   memuat node_cpu_seconds_total, node_memory_*, node_filesystem_* (/data),
//   pg_database_size_bytes, node_load1/5/15. CPU% dihitung dari dua cuplikan
//   berjarak 3 detik (rate idle vs total).
import { userDariToken } from "@/lib/sesi";
import { deepseekSiap } from "@/lib/deepseek";
import { ringkasPemakaianAi } from "@/lib/ai-pemakaian";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PENGELOLA = new Set(["master", "super_admin"]);

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

type Sampel = { idle: number; total: number };

/** Ambil teks metrik Prometheus dari Supabase. */
async function ambilMetrik(): Promise<string> {
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
  };
}

async function saldoDeepseek(): Promise<{ tersedia: boolean; saldo: string } | null> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.deepseek.com/user/balance", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const j = (await res.json()) as {
      is_available?: boolean;
      balance_infos?: { currency?: string; total_balance?: string }[];
    };
    const b = j.balance_infos?.[0];
    return { tersedia: j.is_available !== false, saldo: b ? `${b.total_balance ?? "?"} ${b.currency ?? ""}`.trim() : "-" };
  } catch {
    return { tersedia: false, saldo: "tidak terbaca" };
  }
}

export async function GET(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) return Response.json({ error: "Sesi tidak berlaku" }, { status: 401 });
  if (!PENGELOLA.has(user.role)) return Response.json({ error: "Khusus master / Ketua Umum." }, { status: 403 });

  const [teks1, ai1, ai7, ai30, deepseek] = await Promise.all([
    ambilMetrik().catch((e: unknown) => (e instanceof Error ? e.message : String(e))),
    ringkasPemakaianAi(1),
    ringkasPemakaianAi(7),
    ringkasPemakaianAi(30),
    saldoDeepseek(),
  ]);

  let server: Record<string, unknown> | null = null;
  let galat = "";
  if (teks1.includes("node_memory_MemTotal_bytes")) {
    // Cuplikan kedua untuk laju CPU.
    await new Promise((r) => setTimeout(r, 3000));
    const teks2 = await ambilMetrik().catch(() => "");
    const c1 = cuplikanCpu(teks1);
    const c2 = teks2 ? cuplikanCpu(teks2) : c1;
    const dTotal = c2.total - c1.total;
    const dIdle = c2.idle - c1.idle;
    const cpuPersen = dTotal > 0 ? Math.max(0, Math.min(100, Math.round((1 - dIdle / dTotal) * 100))) : null;

    const memTotal = nilai(teks1, "node_memory_MemTotal_bytes");
    const memAvail = nilai(teks1, "node_memory_MemAvailable_bytes");
    const diskSize = nilai(teks1, "node_filesystem_size_bytes", 'mountpoint="/data"');
    const diskAvail = nilai(teks1, "node_filesystem_avail_bytes", 'mountpoint="/data"');
    const dbSize = jumlah(teks1, "pg_database_size_bytes");
    server = {
      cpu_persen: cpuPersen,
      cpu_inti: new Set([...teks1.matchAll(/^node_cpu_seconds_total\{[^}]*cpu="(\d+)"/gm)].map((m) => m[1])).size,
      beban_1m: nilai(teks1, "node_load1"),
      beban_5m: nilai(teks1, "node_load5"),
      beban_15m: nilai(teks1, "node_load15"),
      ram_total: memTotal,
      ram_terpakai: memTotal != null && memAvail != null ? memTotal - memAvail : null,
      ram_persen: memTotal && memAvail != null ? Math.round(((memTotal - memAvail) / memTotal) * 100) : null,
      disk_total: diskSize,
      disk_terpakai: diskSize != null && diskAvail != null ? diskSize - diskAvail : null,
      disk_persen: diskSize && diskAvail != null ? Math.round(((diskSize - diskAvail) / diskSize) * 100) : null,
      db_ukuran: dbSize || null,
      diambil_pada: new Date().toISOString(),
    };
  } else {
    galat = teks1.slice(0, 200);
  }

  return Response.json(
    {
      server,
      galat_server: galat || null,
      ai: { hari_ini: ai1, tujuh_hari: ai7, tiga_puluh_hari: ai30 },
      deepseek: { siap: deepseekSiap(), ...(deepseek ?? {}) },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

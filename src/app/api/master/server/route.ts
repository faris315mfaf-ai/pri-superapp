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
import { bacaMetrikServer } from "@/lib/metrik-server";
import { deepseekSiap } from "@/lib/deepseek";
import { ringkasPemakaianAi } from "@/lib/ai-pemakaian";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const PENGELOLA = new Set(["master", "super_admin"]);

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
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

  const [metrik, ai1, ai7, ai30, deepseek] = await Promise.all([
    bacaMetrikServer(),
    ringkasPemakaianAi(1),
    ringkasPemakaianAi(7),
    ringkasPemakaianAi(30),
    saldoDeepseek(),
  ]);
  const server = metrik.server;
  const galat = metrik.galat;

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

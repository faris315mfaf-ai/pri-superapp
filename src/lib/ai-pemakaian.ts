// ============================================================
// Pemakaian token AI (3 Sep 2026) — KHUSUS SISI SERVER.
// Tiap panggilan DeepSeek / Gemini mencatat token masuk/keluar ke tabel
// `ai_pemakaian`, supaya Panel Master bisa menampilkan pemakaian hari ini,
// 7 hari, dan 30 hari per penyedia. Pencatatan TIDAK boleh menggagalkan
// panggilan AI-nya (dibungkus try/catch, tanpa await di jalur panas).
// ============================================================
import { supabase } from "@/lib/supabase";

export type CatatanAi = {
  penyedia: "deepseek" | "gemini";
  model: string;
  fitur: string;
  userId?: number | null;
  tokenMasuk: number;
  tokenKeluar: number;
};

/** Catat satu panggilan (fire-and-forget; kegagalan hanya ke log). */
export function catatPemakaianAi(c: CatatanAi): void {
  try {
    void supabase()
      .from("ai_pemakaian")
      .insert({
        penyedia: c.penyedia,
        model: c.model.slice(0, 80),
        fitur: c.fitur.slice(0, 80),
        user_id: c.userId ?? null,
        token_masuk: Math.max(0, Math.floor(c.tokenMasuk || 0)),
        token_keluar: Math.max(0, Math.floor(c.tokenKeluar || 0)),
        token_total: Math.max(0, Math.floor((c.tokenMasuk || 0) + (c.tokenKeluar || 0))),
      })
      .then(({ error }) => {
        if (error) console.error("[ai-pemakaian] catat:", error.message);
      });
  } catch (e) {
    console.error("[ai-pemakaian]", e);
  }
}

export type RingkasAi = {
  penyedia: string;
  panggilan: number;
  token_masuk: number;
  token_keluar: number;
  token_total: number;
};

/** Ringkasan per penyedia untuk rentang hari ke belakang (1 = hari ini WIB). */
export async function ringkasPemakaianAi(hari: number): Promise<RingkasAi[]> {
  const db = supabase();
  // Awal rentang = 00:00 WIB (hari-1) hari lalu.
  const kiniWib = new Date(Date.now() + 7 * 3600_000);
  const awalWib = new Date(Date.UTC(kiniWib.getUTCFullYear(), kiniWib.getUTCMonth(), kiniWib.getUTCDate() - (hari - 1)));
  const awalIso = new Date(awalWib.getTime() - 7 * 3600_000).toISOString();
  const { data } = await db
    .from("ai_pemakaian")
    .select("penyedia, token_masuk, token_keluar, token_total")
    .gte("dibuat_pada", awalIso)
    .range(0, 9999);
  const per = new Map<string, RingkasAi>();
  for (const b of data ?? []) {
    const k = String(b.penyedia);
    const r = per.get(k) ?? { penyedia: k, panggilan: 0, token_masuk: 0, token_keluar: 0, token_total: 0 };
    r.panggilan += 1;
    r.token_masuk += Number(b.token_masuk ?? 0);
    r.token_keluar += Number(b.token_keluar ?? 0);
    r.token_total += Number(b.token_total ?? 0);
    per.set(k, r);
  }
  return [...per.values()].sort((a, b) => a.penyedia.localeCompare(b.penyedia));
}

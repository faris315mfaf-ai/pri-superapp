// ============================================================
// Siaran Supabase Realtime dari SISI SERVER (5 Sep 2026).
// Dipakai pemicu "ada yang berubah" (mis. komentar anggota baru terverifikasi
// oleh cron) supaya klien yang sedang membuka layar terkait memuat ulang
// seketika — tanpa polling rapat. Memakai REST broadcast dengan kunci
// secret (server), tidak pernah melempar: siaran hanyalah percepatan.
// ============================================================

export async function siarkanRealtime(topic: string, event: string, payload: Record<string, unknown>): Promise<boolean> {
  const url = (process.env.SUPABASE_URL ?? "").trim();
  const key = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ messages: [{ topic, event, payload, private: false }] }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) console.error("[realtime] siaran ditolak:", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (e) {
    console.error("[realtime] siaran gagal:", e instanceof Error ? e.message : e);
    return false;
  }
}

// ============================================================
// Creatomate (3 Sep 2026) — render video per TEMPLATE untuk Studio
// PALUGODAM. KHUSUS SISI SERVER. Kunci di env CREATOMATE_API_KEY.
//
// Kontrak API (docs Creatomate v1):
//   POST https://api.creatomate.com/v2/renders
//        Authorization: Bearer <key>
//        { template_id, modifications: { "<Elemen>.source": url,
//                                         "<Elemen>.text": "..." } }
//        → 202 [ { id, status: "planned", url, ... } ]
//   GET  https://api.creatomate.com/v2/renders/<id>
//        → { id, status: planned|waiting|transcribing|rendering|succeeded|failed,
//            url, error_message }
// Nama elemen mengikuti template yang dibuat user (bawaan: video-1, judul,
// highlight, sumber) — bisa diubah per profil di pengaturan Studio.
// ============================================================

// v2 = versi yang dipakai snippet dashboard Creatomate user (3 Sep 2026).
const BASE = "https://api.creatomate.com/v2";

export function creatomateSiap(): boolean {
  return Boolean(process.env.CREATOMATE_API_KEY);
}

export type StatusRender = "planned" | "waiting" | "transcribing" | "rendering" | "succeeded" | "failed";

async function panggil<T>(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<T> {
  const key = process.env.CREATOMATE_API_KEY;
  if (!key) throw new Error("Creatomate belum diatur (CREATOMATE_API_KEY kosong).");
  const kendali = new AbortController();
  const timer = setTimeout(() => kendali.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: kendali.signal,
      cache: "no-store",
    });
    const teks = await res.text();
    let json: unknown = null;
    try {
      json = teks ? JSON.parse(teks) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const pesan =
        (json as { message?: string; error?: string })?.message ??
        (json as { error?: string })?.error ??
        `Creatomate menolak (${res.status})`;
      throw Object.assign(new Error(`Creatomate: ${String(pesan).slice(0, 200)}`), { status: 502 });
    }
    return json as T;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Creatomate tidak menjawab tepat waktu.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export type HasilRender = { id: string; status: StatusRender; url: string; galat: string };

type BarisRender = { id?: string; status?: string; url?: string; error_message?: string };

function rapikan(r: BarisRender): HasilRender {
  return {
    id: String(r.id ?? ""),
    status: (String(r.status ?? "planned") as StatusRender) || "planned",
    url: String(r.url ?? ""),
    galat: String(r.error_message ?? ""),
  };
}

/** Mulai satu render dari template + modifikasi elemen. */
export async function mulaiRender(opsi: {
  templateId: string;
  modifications: Record<string, string>;
}): Promise<HasilRender> {
  const d = await panggil<BarisRender[] | BarisRender>("/renders", {
    method: "POST",
    body: JSON.stringify({ template_id: opsi.templateId, modifications: opsi.modifications }),
  });
  const baris = Array.isArray(d) ? d[0] : d;
  if (!baris?.id) throw new Error("Creatomate tidak mengembalikan ID render.");
  return rapikan(baris);
}

/** Status satu render. */
export async function statusRender(id: string): Promise<HasilRender> {
  const d = await panggil<BarisRender>(`/renders/${encodeURIComponent(id)}`, { method: "GET" }, 20_000);
  return rapikan(d);
}

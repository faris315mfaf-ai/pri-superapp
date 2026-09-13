// ============================================================
// CHOCODATA — pemanggil jaringan (13 Sep 2026)
//
// Satu tugas: mengambil angka SATU video dari Chocodata, untuk platform
// yang tidak disapu TikHub (YouTube, Facebook, X) maupun yang disapu
// (TikTok, Instagram) bila diminta menarik ulang.
//
// Kunci di env CHOCODATA_API_KEY — hanya di server. Tanpa kunci, fungsi
// ini bilang "tidak siap", bukan diam-diam gagal.
//
// Kontrak: chocodata.com/docs (endpoint reference). "Only 2xx costs
// credits" — permintaan yang ditolak tidak dihitung.
// ============================================================
import {
  permintaanChocodata,
  uraiChocodata,
  type MetrikChocodata,
} from "@/lib/chocodata-urai";

const DASAR = "https://api.chocodata.com/api/v1";

export function chocodataSiap(): boolean {
  return Boolean(process.env.CHOCODATA_API_KEY);
}

function kunci(): string {
  const k = process.env.CHOCODATA_API_KEY;
  if (!k) throw new Error("CHOCODATA_API_KEY belum diatur.");
  return k;
}

export type HasilChocodata = {
  metrik: MetrikChocodata;
  mentah: unknown;
};

/**
 * Ambil angka satu video. Melempar bila platformnya tidak didukung atau
 * Chocodata menolak — pemanggil yang memutuskan apakah itu fatal.
 */
export async function ambilPostChocodata(
  platform: string,
  url: string,
  timeoutMs = 20_000,
): Promise<HasilChocodata> {
  const req = permintaanChocodata(platform, url);
  if (!req) throw new Error(`Platform ${platform} tidak didukung Chocodata (atau URL tidak dikenali).`);
  const q = new URLSearchParams({ api_key: kunci(), ...req.params });
  const res = await fetch(`${DASAR}${req.jalur}?${q.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
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
      `Chocodata menolak permintaan (${res.status})`;
    throw Object.assign(new Error(pesan), { status: res.status });
  }
  return { metrik: uraiChocodata(platform, json), mentah: json };
}

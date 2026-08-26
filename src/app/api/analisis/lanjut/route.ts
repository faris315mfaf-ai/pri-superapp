// POST /api/analisis/lanjut — melanjutkan pemeriksaan komentar yang masih
// berstatus "menunggu", TANPA mendata ulang postingan.
//
// Kenapa terpisah dari /api/analisis: mendata ulang memanggil TikHub untuk
// setiap akun wajib (biaya tetap ~6 request) padahal daftar postingannya
// sudah ada. Tombol "Lanjutkan" hanya membangunkan pekerja antrian.
import { bungkus } from "@/lib/api-helper";
import { panggilWebhookN8n, N8nBelumDiaturError } from "@/lib/n8n";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return bungkus(async () => {
    let periode = "";
    try {
      const body = await request.json();
      periode = String(body?.periode ?? "").trim();
    } catch {
      // body tidak wajib JSON valid; divalidasi di bawah
    }

    // Divalidasi SEBELUM menyentuh n8n: permintaan tak sah tidak boleh
    // membangunkan pekerja yang memakai kuota scraping.
    if (!/^\d{4}-\d{2}-\d{2} /.test(periode)) {
      throw Object.assign(
        new Error("Periode tidak dikenali. Contoh: 2026-08-24 00:00-23:59"),
        { status: 400 },
      );
    }

    try {
      await panggilWebhookN8n("N8N_WEBHOOK_QC_LANJUT", { periode });
    } catch (e) {
      if (e instanceof N8nBelumDiaturError) {
        throw Object.assign(new Error(e.message), { status: 503 });
      }
      throw e;
    }

    return { dimulai: true, periode };
  });
}

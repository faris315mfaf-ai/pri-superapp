// ============================================================
// PRI SuperApp — Penghubung ke n8n (KHUSUS SISI SERVER)
//
// Aplikasi tidak mengerjakan sendiri hal-hal berat seperti
// mengunduh video, merender, atau mengirim WhatsApp. Semua itu
// sudah ditangani workflow n8n yang berjalan. Aplikasi hanya
// "menekan tombol"-nya lewat webhook, lalu membaca hasilnya
// dari Supabase.
//
// URL webhook disimpan di .env.local, TIDAK ditulis di kode,
// supaya bisa berbeda antara komputer sendiri dan server.
// ============================================================

/** Batas waktu menunggu n8n sebelum menyerah (webhook harus cepat) */
const BATAS_TUNGGU_MS = 25_000;

export class N8nBelumDiaturError extends Error {}

/**
 * Kirim data ke sebuah webhook n8n.
 *
 * @param namaEnv  nama variabel .env yang berisi URL webhook
 * @param payload  data yang dikirim (akan jadi $json di node Webhook)
 */
export async function panggilWebhookN8n(
  namaEnv: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const url = process.env[namaEnv];
  if (!url) {
    throw new N8nBelumDiaturError(
      `Otomatisasi belum tersambung. Isi ${namaEnv} di file .env.local dengan URL webhook n8n.`,
    );
  }

  // Kunci rahasia opsional: n8n memeriksa header ini supaya webhook
  // tidak bisa dipicu sembarang orang yang menebak URL-nya.
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.N8N_WEBHOOK_SECRET) {
    headers["X-PRI-Secret"] = process.env.N8N_WEBHOOK_SECRET;
  }

  const pembatal = AbortSignal.timeout(BATAS_TUNGGU_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: pembatal,
    });
  } catch (e) {
    // Bedakan "kelamaan" dari "tidak bisa dihubungi" — dua masalah
    // yang penanganannya berbeda bagi admin.
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new Error("Otomatisasi n8n tidak merespons tepat waktu. Coba lagi.");
    }
    throw new Error("Tidak bisa menghubungi otomatisasi n8n. Periksa koneksi.");
  }

  if (!res.ok) {
    const teks = await res.text().catch(() => "");
    console.error(`[n8n] ${namaEnv} balas ${res.status}:`, teks.slice(0, 500));

    // n8n membalas 500 dengan pesan generik "Error in workflow" untuk
    // SEMUA kegagalan — termasuk saat kuota eksekusi n8n Cloud habis,
    // yang sebenarnya bukan kesalahan workflow sama sekali. Pesan di
    // bawah menyebut dua kemungkinan itu supaya admin tahu harus
    // memeriksa apa, bukan cuma melihat "kode 500".
    if (res.status === 500) {
      throw new Error(
        "Otomatisasi n8n gagal menjalankan tugas ini. Dua penyebab paling sering: " +
          "(1) kuota eksekusi n8n Cloud habis — cek n8n → Settings → Usage, atau " +
          "(2) ada node yang error — buka tab Executions di n8n untuk melihat detailnya.",
      );
    }

    if (res.status === 404) {
      throw new Error(
        "Webhook n8n tidak ditemukan. Pastikan workflow-nya sudah di-publish (Active), " +
          "bukan hanya tersimpan.",
      );
    }

    throw new Error(`Otomatisasi n8n menolak permintaan (kode ${res.status})`);
  }

  return res.json().catch(() => ({}));
}

/** true bila webhook tersebut sudah diatur di .env */
export function webhookSiap(namaEnv: string): boolean {
  return Boolean(process.env[namaEnv]);
}

// ============================================================
// Klasifikasi status unggahan Ayrshare (bug 1.22/2).
//
// Instagram Reels & YouTube memposting secara ASYNC: balasan awal
// Ayrshare berstatus pending/scheduled TANPA id/postUrl, lalu selesai
// beberapa menit kemudian. Sebelum perbaikan ini, entri seperti itu
// tak masuk hitungan "berhasil" (yang dulu mensyaratkan id), sehingga
// videonya tampil GAGAL padahal sebenarnya sudah/akan tayang — termasuk
// unggahan Pimred. Logikanya dipisah ke sini agar bisa diuji tanpa
// memanggil Ayrshare sungguhan.
// ============================================================

/** Status Ayrshare untuk unggahan yang DITERIMA tapi masih diproses. */
export const STATUS_DIPROSES = new Set([
  "pending",
  "scheduled",
  "processing",
  "queued",
  "awaiting",
]);

/**
 * Sebuah platform dianggap TAYANG-atau-sedang-diproses (bukan gagal) bila
 * Ayrshare tidak menandainya "error" DAN salah satu benar:
 * - sudah ada id/postUrl (tayang pasti), atau
 * - statusnya termasuk STATUS_DIPROSES (async, akan tayang).
 *
 * Ini TIDAK pernah menutupi kegagalan nyata: Ayrshare menaruh penolakan
 * platform di errors[] yang selalu dipetakan berstatus "error".
 */
export function tayangAtauDiproses(
  status?: string,
  id?: string,
  postUrl?: string,
): boolean {
  const s = String(status ?? "").toLowerCase();
  if (s === "error") return false;
  if (id || postUrl) return true;
  return STATUS_DIPROSES.has(s);
}

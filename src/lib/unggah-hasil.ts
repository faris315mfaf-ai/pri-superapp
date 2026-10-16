// ============================================================
// HASIL UNGGAH PER PLATFORM (16 Okt 2026) — kontrak bersama kolom
// video_antrian.unggah_hasil (pengganti ayrshare_hasil; Ayrshare dihapus,
// akun TV Rakyat Official kini lewat upload-post).
//
// Bentuknya sama dengan kolom lama supaya pembaca cukup ganti nama kolom:
//   [{"platform":"instagram","status":"success","id":"...","postUrl":"https://...","pesan":""}]
// status: "success" (tayang), salah satu STATUS_DIPROSES (diterima, masih
// diproses/terjadwal), atau "error" (ditolak; alasannya di `pesan`).
// Murni: dipakai server & klien, diuji tanpa memanggil upload-post.
// ============================================================

export type HasilUnggahPlatform = {
  platform: string;
  status: string;
  id: string;
  postUrl: string;
  pesan: string;
};

/** Status unggahan yang DITERIMA tapi belum tayang (async / terjadwal). */
export const STATUS_DIPROSES = new Set(["pending", "scheduled", "processing", "queued", "awaiting", "in_progress"]);

/**
 * Platform dianggap TAYANG-atau-sedang-diproses (bukan gagal) bila tidak
 * berstatus "error" DAN sudah ada id/postUrl, atau statusnya termasuk
 * STATUS_DIPROSES. Tidak pernah menutupi kegagalan nyata: penolakan selalu "error".
 */
export function tayangAtauDiproses(status?: string, id?: string, postUrl?: string): boolean {
  const s = String(status ?? "").toLowerCase();
  if (s === "error") return false;
  if (id || postUrl) return true;
  return STATUS_DIPROSES.has(s);
}

/** Baca kolom unggah_hasil dengan aman (null / bentuk asing -> []). */
export function bacaHasilUnggah(nilai: unknown): HasilUnggahPlatform[] {
  if (!Array.isArray(nilai)) return [];
  return nilai
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
    .map((x) => ({
      platform: String(x.platform ?? ""),
      status: String(x.status ?? ""),
      id: String(x.id ?? ""),
      postUrl: String(x.postUrl ?? ""),
      pesan: String(x.pesan ?? ""),
    }))
    .filter((x) => x.platform);
}

// ============================================================
// PUTARAN PENYEGARAN angka video (29 Sep 2026) — MURNI, tanpa database.
//
// Alur permintaan user:
//   "Sistem mengelompokkan seluruh video berdasarkan kapan diupload, lalu
//    direload dari yang terlama ke yang terbaru sampai seluruh video
//    habis, baru looping ulang. Namun video yang caption/hashtag/kategori-
//    nya mengandung kata kunci jadi prioritas nomor 1; setelah itu baru
//    video di luar itu."
//
// Maka satu PUTARAN = [video kata kunci, terlama → terbaru] lalu
// [video lain, terlama → terbaru]. Video tanpa tanggal dianggap paling
// lama. Rencana (urutan kode) disusun sekali di awal putaran; video yang
// baru dikenali sesudahnya ikut putaran berikutnya — kecuali video hari
// ini, yang punya jalur cepat sendiri (disetujui user).
//
// Posisi putaran SELALU maju per potongan. Video yang tidak sempat
// dikerjakan (waktu putaran robot habis, jatah per akun penuh, kuota
// ditahan) tidak hilang: masuk daftar TERTUNDA yang dikerjakan lebih dulu
// di putaran robot berikutnya. Video yang sudah disegarkan sejak putaran
// dimulai dilewati (tersaring di pemanggil) — jadi menyusun ulang rencana
// di tengah jalan pun tidak menyegarkan dua kali.
// ============================================================

export type CalonRencana = { kode: string; waktuMs: number | null; prioritas: boolean };

/** Urutan putaran: prioritas dulu; di dalamnya terlama → terbaru; lalu kode. */
export function susunUrutan(calon: readonly CalonRencana[]): { kode: string[]; prioritas: number } {
  const w = (c: CalonRencana) => (c.waktuMs == null || !Number.isFinite(c.waktuMs) ? Number.NEGATIVE_INFINITY : c.waktuMs);
  const unik = new Map<string, CalonRencana>();
  for (const c of calon) {
    const ada = unik.get(c.kode);
    // Kode kembar: prioritas menang (satu sumber saja cukup).
    if (!ada) unik.set(c.kode, c);
    else if (c.prioritas && !ada.prioritas) unik.set(c.kode, { ...ada, prioritas: true });
  }
  const urut = [...unik.values()].sort((a, b) => {
    if (a.prioritas !== b.prioritas) return a.prioritas ? -1 : 1;
    const wa = w(a);
    const wb = w(b);
    if (wa !== wb) return wa < wb ? -1 : 1;
    return a.kode < b.kode ? -1 : a.kode > b.kode ? 1 : 0;
  });
  return { kode: urut.map((c) => c.kode), prioritas: urut.filter((c) => c.prioritas).length };
}

/** Batas daftar tertunda (sisanya ditunggu putaran berikutnya). */
export const MAKS_TERTUNDA = 20_000;

/**
 * Jalankan rencana dari posisi `i` per potongan sampai waktu habis atau
 * rencana selesai. `kerjakan` menerima baris satu potongan (urut rencana)
 * dan mengembalikan kode yang BELUM tertangani (→ tertunda).
 */
export async function jalankanSiklus<R extends { kode: string }>(o: {
  kode: readonly string[];
  i: number;
  potongan: number;
  boleh: () => boolean;
  ambil: (kode: string[]) => Promise<R[]>;
  kerjakan: (baris: R[]) => Promise<string[]>;
}): Promise<{ i: number; selesai: boolean; tunda: string[] }> {
  let i = Math.max(0, Math.min(o.i, o.kode.length));
  const tunda: string[] = [];
  while (i < o.kode.length) {
    if (!o.boleh()) return { i, selesai: false, tunda };
    const bagian = o.kode.slice(i, i + o.potongan);
    const peta = new Map((await o.ambil(bagian)).map((r) => [r.kode, r]));
    const urut: R[] = [];
    for (const k of bagian) {
      const r = peta.get(k);
      if (r) urut.push(r);
    }
    tunda.push(...(await o.kerjakan(urut)));
    i += bagian.length;
  }
  return { i, selesai: true, tunda };
}

/** Gabung daftar tertunda: yang lama dulu, tanpa kembar, dibatasi. */
export function gabungTertunda(lama: readonly string[], baru: readonly string[], maks = MAKS_TERTUNDA): string[] {
  const hasil: string[] = [];
  const ada = new Set<string>();
  for (const k of [...lama, ...baru]) {
    if (ada.has(k)) continue;
    ada.add(k);
    hasil.push(k);
    if (hasil.length >= maks) break;
  }
  return hasil;
}

/** Perkiraan persen kemajuan putaran (0–100, satu desimal). */
export function persenSiklus(i: number, total: number): number {
  if (total <= 0) return 100;
  return Math.round((Math.min(i, total) / total) * 1000) / 10;
}

// ============================================================
// PENGGABUNG GET KEMBAR (28 Sep 2026) — MURNI, dipakai klien.
// Rencana "200 orang tanpa lag", langkah #4.
//
// Saat "ada yang baru", beberapa komponen yang terpasang bersamaan
// meminta alamat yang SAMA pada saat yang sama (terukur: laporan-kerja
// 4x, pengumuman 3x, tvr/laporan & tvr/akun 2x per kejadian). Permintaan
// GET yang identik (alamat + kepala permintaan) selagi yang pertama belum
// selesai kini menumpang hasil yang pertama — satu permintaan ke server.
//
// Aman terhadap data basi: tiap permintaan yang MENGUBAH data (POST,
// PATCH, DELETE, …) mengosongkan daftar tumpangan, sehingga GET sesudah
// perubahan selalu berangkat baru. Tiap penumpang mendapat SALINAN
// hasil, jadi mengubah objek hasil di satu komponen tidak menular.
// ============================================================

export type PenggabungGet = {
  /** Jalankan `kerja` atau menumpang yang sedang berjalan dengan kunci sama. */
  jalankan<T>(kunci: string, kerja: () => Promise<T>): Promise<T>;
  /** Lupakan semua yang sedang berjalan (dipanggil sebelum permintaan pengubah data). */
  lupakan(): void;
  /** Jumlah yang sedang berjalan (untuk uji). */
  readonly ukuran: number;
};

function salin<T>(nilai: T): T {
  if (nilai === null || typeof nilai !== "object") return nilai;
  try {
    return structuredClone(nilai);
  } catch {
    return nilai;
  }
}

export function buatPenggabungGet(): PenggabungGet {
  const berjalan = new Map<string, Promise<unknown>>();
  return {
    jalankan<T>(kunci: string, kerja: () => Promise<T>): Promise<T> {
      const ada = berjalan.get(kunci) as Promise<T> | undefined;
      if (ada) return ada.then(salin);
      const janji = kerja().finally(() => {
        // Hanya hapus bila masih entri yang sama (bisa sudah dilupakan
        // lalu diganti permintaan baru).
        if (berjalan.get(kunci) === janji) berjalan.delete(kunci);
      });
      berjalan.set(kunci, janji);
      return janji.then(salin);
    },
    lupakan() {
      berjalan.clear();
    },
    get ukuran() {
      return berjalan.size;
    },
  };
}

// ============================================================
// Saringan antrean "Menunggu Tayang" TV Rakyat Saya (24 Sep 2026) — murni.
//
// GET /uploadposts/schedule milik upload-post ternyata TIDAK hanya berisi
// posting terjadwal: posting "Post Sekarang" yang masih diproses (mis.
// Facebook belum selesai) ikut muncul dengan scheduled_date = saat kirim.
// Akibatnya layar menampilkannya sebagai "Menunggu Tayang" padahal sudah
// tayang di sebagian sosmed — dan tombol Batalkan akan MENGHAPUS berkas
// video yang masih dipakai platform yang belum selesai.
//
// Aturan: sebuah job hanya "menunggu tayang" bila
//   1. waktunya MASIH di depan (lewat = sedang diproses, bukan menunggu), dan
//   2. bila cocok dengan baris tvrku_post kita, baris itu memang TERJADWAL
//      (kolom jadwal terisi). Baris tanpa jadwal = "Post Sekarang".
// Batalkan hanya untuk job yang lolos saringan DAN berkasnya milik kita.
// ============================================================

export type JobJadwal = { job_id: string; scheduled_date: string };
export type BarisPost = { jadwal: string | null; video_path: string | null };

/** Batas toleransi jam antar-server: job yang lewat < 1 menit masih dianggap menunggu. */
const TOLERANSI_MS = 60_000;

/** scheduled_date upload-post kadang tanpa zona — anggap UTC. */
export function waktuJadwal(tanggal: string): number {
  const t = (tanggal ?? "").trim();
  if (!t) return NaN;
  return Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(t) ? t : `${t}Z`);
}

export function saringJadwalMenunggu<T extends JobJadwal>(
  jobs: T[],
  barisPerJob: Map<string, BarisPost>,
  kini = Date.now(),
): (T & { bisa_batal: boolean })[] {
  const keluar: (T & { bisa_batal: boolean })[] = [];
  for (const j of jobs) {
    const waktu = waktuJadwal(j.scheduled_date);
    if (!Number.isFinite(waktu) || waktu < kini - TOLERANSI_MS) continue;
    const milik = barisPerJob.get(j.job_id);
    if (milik && !milik.jadwal) continue;
    keluar.push({ ...j, bisa_batal: Boolean(milik?.video_path) });
  }
  return keluar;
}

// Penjaga disk media (cermin ruang_media/bersihkan_volume/sediakan_ruang di
// video_edit.py dan bersihkan_job_lama di video_tasks.py). Tanpa penyapu ini
// unggahan menumpuk sampai "No space left on device" dan sejak itu tiap
// unggahan gagal.
import fs from "node:fs";
import path from "node:path";
import { MEDIA_DIR, RUANG_CADANGAN_MB, SELANG_SAPUAN_MENIT, UMUR_SIMPAN_JAM } from "./konfig";
import { jobsDir } from "./jalur";
import { buangJob, JOB_RETENTION_HOURS, KUNCI_JOB, KUNCI_URUT, redis } from "./job";
import { bersihkanCacheUnduhan, bersihkanUnggahanLama } from "./unduh";
import { bersihkanLama as bersihkanOutroLama } from "./outro";

const bulat1 = (n: number) => Math.round(n * 10) / 10;

export type Ruang = { total_mb: number; dipakai_mb: number; sisa_mb: number };

/** Ruang disk tempat MEDIA_DIR berada, dalam MB (sama dengan shutil.disk_usage). */
export function ruangMedia(): Ruang {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const st = fs.statfsSync(MEDIA_DIR);
  const total = st.blocks * st.bsize;
  const dipakai = (st.blocks - st.bfree) * st.bsize;
  const sisa = st.bavail * st.bsize;
  return { total_mb: bulat1(total / 1_048_576), dipakai_mb: bulat1(dipakai / 1_048_576), sisa_mb: bulat1(sisa / 1_048_576) };
}

function ukuranPohon(folder: string): number {
  let total = 0;
  let isi: fs.Dirent[];
  try {
    isi = fs.readdirSync(folder, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const d of isi) {
    const p = path.join(folder, d.name);
    try {
      if (d.isDirectory()) total += ukuranPohon(p);
      else if (d.isFile()) total += fs.statSync(p).size;
    } catch {
      // berkas hilang di tengah hitungan
    }
  }
  return total;
}

/** Pemakaian tiap folder di bawah MEDIA_DIR, dalam MB, untuk diagnosa. */
export function isiMedia(): Record<string, number> {
  const hasil: Record<string, number> = {};
  if (!fs.existsSync(MEDIA_DIR)) return hasil;
  const anak = fs.readdirSync(MEDIA_DIR, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const d of anak) {
    // lost+found milik root ada di akar disk media khusus (ext4).
    if (!d.isDirectory() || d.name === "lost+found") continue;
    hasil[d.name] = bulat1(ukuranPohon(path.join(MEDIA_DIR, d.name)) / 1_048_576);
  }
  return hasil;
}

function mtime(p: string): number | null {
  try {
    return fs.statSync(p).mtimeMs / 1000;
  } catch {
    return null;
  }
}

/** Buang berkas kedaluwarsa di volume media, lalu laporkan. */
export async function bersihkanVolume(umurJam: number | null = null): Promise<Record<string, unknown>> {
  const umur = umurJam ?? UMUR_SIMPAN_JAM;
  const sebelum = ruangMedia();
  const laporan: Record<string, unknown> = { sebelum, umur_jam: umur };
  try {
    laporan.unggahan = bersihkanUnggahanLama(umur * 3600);
  } catch (e) {
    console.warn("Pembersihan unggahan gagal:", e instanceof Error ? e.message : e);
    laporan.unggahan = 0;
  }
  try {
    laporan.cache = bersihkanCacheUnduhan();
  } catch (e) {
    console.warn("Pembersihan cache unduhan gagal:", e instanceof Error ? e.message : e);
    laporan.cache = 0;
  }
  // Folder job yang catatannya sudah lama hangus (worker mati di tengah
  // jalan) tidak punya pemilik lagi.
  let dibuangJob = 0;
  try {
    const batas = Date.now() / 1000 - umur * 3600;
    for (const d of fs.readdirSync(jobsDir(), { withFileTypes: true })) {
      const folder = path.join(jobsDir(), d.name);
      const t = d.isDirectory() ? mtime(folder) : null;
      if (t !== null && t < batas) {
        fs.rmSync(folder, { recursive: true, force: true });
        dibuangJob += 1;
      }
    }
  } catch (e) {
    console.warn("Pembersihan folder job gagal:", e instanceof Error ? e.message : e);
  }
  laporan.job = dibuangJob;
  // Outro dirender proses API ini juga, jadi hasilnya mendarat di volume
  // yang sama dan wajib ikut disapu.
  try {
    laporan.outro = await bersihkanOutroLama(umur);
  } catch (e) {
    console.warn("Pembersihan outro gagal:", e instanceof Error ? e.message : e);
    laporan.outro = 0;
  }
  const sesudah = ruangMedia();
  laporan.sesudah = sesudah;
  laporan.dibebaskan_mb = bulat1(sesudah.sisa_mb - sebelum.sisa_mb);
  if ((laporan.dibebaskan_mb as number) >= 1) {
    console.info(`Volume dibersihkan: ${laporan.dibebaskan_mb} MB dibebaskan, sisa ${sesudah.sisa_mb} MB`);
  }
  return laporan;
}

/**
 * Usahakan ada ruang untuk berkas sebesar ini; kembalikan sisa ruang MB.
 * Bertahap: cukup → tidak ada yang dihapus; kurang → berkas kedaluwarsa
 * dibuang; masih kurang → umur simpan diperpendek sampai satu jam.
 */
export async function sediakanRuang(butuhMb: number): Promise<number> {
  const perlu = butuhMb + RUANG_CADANGAN_MB;
  let sisa = ruangMedia().sisa_mb;
  if (sisa >= perlu) return sisa;
  sisa = ((await bersihkanVolume()).sesudah as Ruang).sisa_mb;
  if (sisa >= perlu) return sisa;
  for (const umur of [6, 1]) {
    if (umur >= UMUR_SIMPAN_JAM) continue;
    sisa = ((await bersihkanVolume(umur)).sesudah as Ruang).sisa_mb;
    if (sisa >= perlu) break;
  }
  return sisa;
}

/** Buang job yang lebih tua dari batas simpan, beserta berkasnya (worker). */
export async function bersihkanJobLama(): Promise<number> {
  const batas = Date.now() / 1000 - JOB_RETENTION_HOURS * 3600;
  let dihapus = 0;
  try {
    bersihkanUnggahanLama(JOB_RETENTION_HOURS * 3600);
  } catch (e) {
    console.warn("Gagal membersihkan unggahan lama:", e instanceof Error ? e.message : e);
  }
  try {
    bersihkanCacheUnduhan();
  } catch (e) {
    console.warn("Gagal membersihkan cache unduhan:", e instanceof Error ? e.message : e);
  }
  const r = redis();
  for (const id of await r.zrangebyscore(KUNCI_URUT, "-inf", batas)) {
    await buangJob(id);
    dihapus += 1;
  }
  // Folder kerja yang statusnya sudah hangus di Redis tidak punya pemilik lagi.
  if (fs.existsSync(jobsDir())) {
    for (const d of fs.readdirSync(jobsDir(), { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const folder = path.join(jobsDir(), d.name);
      const t = mtime(folder);
      if (t === null || t >= batas) continue;
      if (await r.exists(KUNCI_JOB + d.name)) continue;
      fs.rmSync(folder, { recursive: true, force: true });
      dihapus += 1;
    }
  }
  if (dihapus) console.info(`${dihapus} job kedaluwarsa dibuang`);
  return dihapus;
}

/** Sapu volume saat start, lalu ulangi berkala. Cukup SATU proses (API). */
export function jagaVolume(): () => void {
  let berjalan = false;
  const putaran = async () => {
    if (berjalan) return;
    berjalan = true;
    try {
      await bersihkanVolume();
    } catch (e) {
      console.error("Sapuan volume gagal", e);
    } finally {
      berjalan = false;
    }
  };
  void putaran();
  const t = setInterval(putaran, Math.max(60, SELANG_SAPUAN_MENIT * 60) * 1000);
  t.unref();
  return () => clearInterval(t);
}

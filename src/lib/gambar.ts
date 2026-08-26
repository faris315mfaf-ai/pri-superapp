// Pemotongan & pengecilan foto profil di sisi peramban.
//
// Kenapa dikerjakan di ponsel, bukan di server: foto kamera modern
// berukuran 3–8 MB. Mengirimkannya utuh lewat jaringan seluler lambat,
// boros kuota pengguna, dan sering gagal di tengah jalan. Setelah
// diproses di sini, yang terkirim tinggal sekitar 100 KB.

/** Target ukuran akhir (byte). Server juga tetap memeriksa batasnya. */
export const TARGET_BYTE = 100 * 1024;

/** Sisi foto profil yang disimpan — cukup untuk layar retina */
const SISI_PIKSEL = 512;

/** Perkiraan ukuran byte dari sebuah data URL base64 */
export function ukuranDataUrl(dataUrl: string): number {
  const koma = dataUrl.indexOf(",");
  if (koma < 0) return 0;
  const base64 = dataUrl.slice(koma + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export type AreaPotong = { x: number; y: number; sisi: number };

/**
 * Potong gambar menjadi bujur sangkar lalu kecilkan sampai di bawah
 * TARGET_BYTE.
 *
 * Mutu JPEG diturunkan bertahap, bukan sekali tebak: foto pemandangan
 * dan foto wajah polos berkompresi sangat berbeda, jadi satu nilai
 * mutu tetap akan meleset untuk salah satunya.
 */
export async function potongDanKecilkan(
  sumber: string,
  area: AreaPotong,
): Promise<string> {
  const img = await muatGambar(sumber);

  const kanvas = document.createElement("canvas");
  kanvas.width = SISI_PIKSEL;
  kanvas.height = SISI_PIKSEL;
  const ctx = kanvas.getContext("2d");
  if (!ctx) throw new Error("Peramban ini tidak mendukung pemotongan gambar.");

  // Latar putih supaya PNG transparan tidak jadi hitam setelah ke JPEG.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, SISI_PIKSEL, SISI_PIKSEL);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    img,
    area.x,
    area.y,
    area.sisi,
    area.sisi,
    0,
    0,
    SISI_PIKSEL,
    SISI_PIKSEL,
  );

  for (const mutu of [0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.25]) {
    const hasil = kanvas.toDataURL("image/jpeg", mutu);
    if (ukuranDataUrl(hasil) <= TARGET_BYTE) return hasil;
  }

  // Masih terlalu besar pada mutu terendah: perkecil dimensinya.
  const kecil = document.createElement("canvas");
  kecil.width = 320;
  kecil.height = 320;
  const ctx2 = kecil.getContext("2d");
  if (ctx2) {
    ctx2.fillStyle = "#FFFFFF";
    ctx2.fillRect(0, 0, 320, 320);
    ctx2.imageSmoothingQuality = "high";
    ctx2.drawImage(kanvas, 0, 0, 320, 320);
    return kecil.toDataURL("image/jpeg", 0.6);
  }

  return kanvas.toDataURL("image/jpeg", 0.25);
}

/** Muat data URL menjadi elemen gambar yang siap digambar ke kanvas */
export function muatGambar(sumber: string): Promise<HTMLImageElement> {
  return new Promise((selesai, gagal) => {
    const img = new Image();
    img.onload = () => selesai(img);
    img.onerror = () => gagal(new Error("Foto tidak bisa dibaca."));
    img.src = sumber;
  });
}

/** Baca berkas dari input menjadi data URL */
export function bacaBerkas(berkas: File): Promise<string> {
  return new Promise((selesai, gagal) => {
    const pembaca = new FileReader();
    pembaca.onload = () => selesai(String(pembaca.result ?? ""));
    pembaca.onerror = () => gagal(new Error("Gagal membaca berkas."));
    pembaca.readAsDataURL(berkas);
  });
}

// ============================================================
// Kompresi gambar DI PERAMBAN sebelum diunggah (spek 1.14).
//
// Chat: maksimal 100KB. Foto profil "Momen Terbaik": 300KB.
// Kompresi di sisi klien supaya hemat bandwidth & storage — server
// tetap memeriksa ulang batasnya (batas klien bisa dilewati orang
// yang memanggil API langsung).
//
// Cara kerja: gambar digambar ulang ke <canvas> dengan sisi terpanjang
// dibatasi, lalu diekspor JPEG dengan kualitas yang diturunkan bertahap
// sampai muat. Bila kualitas terendah masih terlalu besar, ukurannya
// diperkecil lagi dan diulang. JPEG dipilih karena rasio kompresinya
// paling bisa diandalkan untuk foto (PNG bisa 10x lebih besar).
// ============================================================

/** Perkiraan byte hasil dari sebuah data URL base64. */
function ukuranByte(dataUrl: string): number {
  const koma = dataUrl.indexOf(",");
  return Math.floor(((dataUrl.length - koma - 1) * 3) / 4);
}

function muatGambar(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Berkas bukan gambar yang bisa dibaca."));
    };
    img.src = url;
  });
}

/**
 * Kompres berkas gambar menjadi data URL JPEG berukuran <= maksKb.
 * Melempar Error berpesan Indonesia bila berkasnya bukan gambar.
 */
export async function kompresGambar(file: File, maksKb: number): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Pilih berkas gambar (JPG, PNG, atau WebP).");
  }
  const img = await muatGambar(file);
  const maksByte = maksKb * 1024;

  // Mulai dari sisi terpanjang 1280px (cukup tajam untuk chat),
  // turun bertahap bila belum muat.
  let sisiMaks = 1280;
  for (let putaran = 0; putaran < 5; putaran++) {
    const skala = Math.min(1, sisiMaks / Math.max(img.width, img.height));
    const lebar = Math.max(1, Math.round(img.width * skala));
    const tinggi = Math.max(1, Math.round(img.height * skala));

    const kanvas = document.createElement("canvas");
    kanvas.width = lebar;
    kanvas.height = tinggi;
    const ctx = kanvas.getContext("2d");
    if (!ctx) throw new Error("Peramban tidak mendukung kompresi gambar.");
    // Latar putih: JPEG tidak punya transparansi — tanpa ini, PNG
    // transparan berubah jadi latar hitam.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, lebar, tinggi);
    ctx.drawImage(img, 0, 0, lebar, tinggi);

    // Kualitas menurun bertahap; berhenti begitu muat.
    for (const kualitas of [0.82, 0.7, 0.58, 0.46, 0.34]) {
      const hasil = kanvas.toDataURL("image/jpeg", kualitas);
      if (ukuranByte(hasil) <= maksByte) return hasil;
    }
    sisiMaks = Math.round(sisiMaks * 0.7);
  }
  throw new Error("Gambar tidak bisa dikompres sampai batas ukuran. Coba gambar lain.");
}

// ============================================================
// Rate limiter in-memory (KHUSUS SISI SERVER).
//
// Jendela geser sederhana berbasis Map: tiap kunci menyimpan daftar
// stempel waktu percobaan; percobaan yang lebih tua dari jendela
// dibuang, sisanya dihitung. Kunci gabungan `endpoint + IP` (boleh
// ditambah pembeda lain, mis. nomor WA).
//
// BATASAN YANG DISENGAJA — baca sebelum mengandalkannya:
// - Hanya berlaku untuk SATU instance proses. Penghitungnya hidup di
//   memori proses Node; bila aplikasi berjalan lebih dari satu
//   instance (serverless multi-region, PM2 cluster, dsb.), tiap
//   instance menghitung sendiri-sendiri sehingga batas efektifnya
//   berlipat. Untuk deployment satu VPS di balik Caddy (kondisi
//   sekarang) ini memadai.
// - Hilang saat proses restart — dianggap wajar untuk pembatasan
//   percobaan login/OTP.
// TODO: migrasi ke Upstash Redis (@upstash/ratelimit) begitu aplikasi
//       berjalan multi-instance, supaya penghitungnya terpusat.
// ============================================================

type CatatanJendela = number[];

const gudang = new Map<string, CatatanJendela>();

/** Jaga Map tidak membengkak: bersihkan kunci basi tiap ~5 menit. */
let pembersihanTerakhir = 0;
function bersihkanBasi(sekarang: number): void {
  if (sekarang - pembersihanTerakhir < 5 * 60_000) return;
  pembersihanTerakhir = sekarang;
  for (const [kunci, daftar] of gudang) {
    // 1 jam adalah jendela terpanjang yang dipakai aplikasi.
    const hidup = daftar.filter((t) => sekarang - t < 60 * 60_000);
    if (hidup.length === 0) gudang.delete(kunci);
    else gudang.set(kunci, hidup);
  }
}

/**
 * Ambil IP klien dari header proxy, urutan kepercayaan:
 * CF-Connecting-IP (Cloudflare) → X-Real-IP (Caddy) → X-Forwarded-For
 * (ambil yang PERTAMA — sisanya bisa dipalsukan klien) → "tidak-dikenal".
 */
export function ipDari(request: Request): string {
  const h = request.headers;
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const nyata = h.get("x-real-ip");
  if (nyata) return nyata.trim();
  const diteruskan = h.get("x-forwarded-for");
  if (diteruskan) return diteruskan.split(",")[0].trim();
  return "tidak-dikenal";
}

export type HasilBatas = {
  boleh: boolean;
  /** Detik sampai boleh mencoba lagi (untuk header Retry-After) */
  cobaLagiDetik: number;
};

/**
 * Catat satu percobaan dan putuskan boleh/tidaknya.
 *
 * @param kunci  gabungan endpoint + IP (+ pembeda lain bila perlu)
 * @param maks   jumlah percobaan maksimal dalam jendela
 * @param jendelaDetik panjang jendela geser, dalam detik
 */
export function cekBatas(kunci: string, maks: number, jendelaDetik: number): HasilBatas {
  const sekarang = Date.now();
  bersihkanBasi(sekarang);

  const jendelaMs = jendelaDetik * 1000;
  const daftar = (gudang.get(kunci) ?? []).filter((t) => sekarang - t < jendelaMs);

  if (daftar.length >= maks) {
    gudang.set(kunci, daftar);
    const tertua = daftar[0];
    return {
      boleh: false,
      cobaLagiDetik: Math.max(1, Math.ceil((tertua + jendelaMs - sekarang) / 1000)),
    };
  }

  daftar.push(sekarang);
  gudang.set(kunci, daftar);
  return { boleh: true, cobaLagiDetik: 0 };
}

/**
 * Penjaga siap pakai untuk route API: lempar Response 429 (dengan
 * Retry-After) bila lewat batas. Panggil SEBELUM query database.
 */
export function pastikanTidakMelebihiBatas(
  request: Request,
  endpoint: string,
  maks: number,
  jendelaDetik: number,
  pembeda = "",
): Response | null {
  const kunci = `${endpoint}|${ipDari(request)}${pembeda ? `|${pembeda}` : ""}`;
  const hasil = cekBatas(kunci, maks, jendelaDetik);
  if (hasil.boleh) return null;

  const menit = Math.ceil(hasil.cobaLagiDetik / 60);
  return Response.json(
    {
      error: `Terlalu banyak percobaan. Coba lagi dalam ${menit} menit.`,
    },
    { status: 429, headers: { "Retry-After": String(hasil.cobaLagiDetik) } },
  );
}

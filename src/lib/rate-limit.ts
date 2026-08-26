// ============================================================
// Pembatas laju permintaan (KHUSUS SISI SERVER).
//
// DUA LAPIS, dipilih otomatis:
//
// 1. UPSTASH REDIS — dipakai bila UPSTASH_REDIS_REST_URL dan
//    UPSTASH_REDIS_REST_TOKEN terpasang. Hitungannya TERPUSAT, jadi
//    tetap benar walau Vercel menjalankan aplikasi di banyak instance
//    sekaligus. Inilah lapisan yang sebenarnya melindungi.
//
// 2. MEMORI PROSES — cadangan bila Redis belum diatur (mis. saat
//    pengembangan di laptop). JUJUR SOAL BATASNYA: di Vercel lapisan
//    ini nyaris tidak berguna — sudah dibuktikan dengan 10 percobaan
//    login salah berturut-turut yang semuanya lolos, karena tiap
//    permintaan bisa mendarat di instance berbeda dengan penghitung
//    yang kosong. Di satu VPS satu proses, lapisan ini memadai.
//
// Kunci hitungan: `endpoint + IP` (+ pembeda lain bila perlu).
// ============================================================

import { Ratelimit } from "@upstash/ratelimit";
import { klienRedis, redisAktif } from "@/lib/redis";

// ------------------------------------------------------------
// Lapisan 1 — Upstash Redis
// ------------------------------------------------------------

function redisSiap(): boolean {
  return redisAktif();
}

// Satu Ratelimit per kombinasi batas+jendela, dibuat sekali lalu
// dipakai ulang. Membuatnya berulang kali di tiap permintaan akan
// memboroskan koneksi tanpa manfaat.
const gudangRedis = new Map<string, Ratelimit>();

function pembatasRedis(maks: number, jendelaDetik: number): Ratelimit | null {
  const redis = klienRedis();
  if (!redis) return null;
  const kunci = `${maks}|${jendelaDetik}`;
  let ada = gudangRedis.get(kunci);
  if (!ada) {
    ada = new Ratelimit({
      redis,
      // Jendela geser: lebih adil daripada jendela tetap, karena
      // tidak bisa diakali dengan menembak tepat di pergantian menit.
      limiter: Ratelimit.slidingWindow(maks, `${jendelaDetik} s`),
      analytics: true,
      prefix: "pri-batas",
    });
    gudangRedis.set(kunci, ada);
  }
  return ada;
}

// ------------------------------------------------------------
// Lapisan 2 — memori proses (cadangan)
// ------------------------------------------------------------

const gudangMemori = new Map<string, number[]>();
let pembersihanTerakhir = 0;

function bersihkanBasi(sekarang: number): void {
  if (sekarang - pembersihanTerakhir < 5 * 60_000) return;
  pembersihanTerakhir = sekarang;
  for (const [kunci, daftar] of gudangMemori) {
    const hidup = daftar.filter((t) => sekarang - t < 60 * 60_000);
    if (hidup.length === 0) gudangMemori.delete(kunci);
    else gudangMemori.set(kunci, hidup);
  }
}

function cekMemori(kunci: string, maks: number, jendelaDetik: number): HasilBatas {
  const sekarang = Date.now();
  bersihkanBasi(sekarang);

  const jendelaMs = jendelaDetik * 1000;
  const daftar = (gudangMemori.get(kunci) ?? []).filter(
    (t) => sekarang - t < jendelaMs,
  );

  if (daftar.length >= maks) {
    gudangMemori.set(kunci, daftar);
    return {
      boleh: false,
      cobaLagiDetik: Math.max(1, Math.ceil((daftar[0] + jendelaMs - sekarang) / 1000)),
    };
  }

  daftar.push(sekarang);
  gudangMemori.set(kunci, daftar);
  return { boleh: true, cobaLagiDetik: 0 };
}

// ------------------------------------------------------------
// Antarmuka umum
// ------------------------------------------------------------

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
 * Memakai Redis bila tersedia; kalau tidak, jatuh ke memori proses.
 */
export async function cekBatas(
  kunci: string,
  maks: number,
  jendelaDetik: number,
): Promise<HasilBatas> {
  const redis = pembatasRedis(maks, jendelaDetik);
  if (redis) {
    try {
      const hasil = await redis.limit(kunci);
      return {
        boleh: hasil.success,
        cobaLagiDetik: Math.max(1, Math.ceil((hasil.reset - Date.now()) / 1000)),
      };
    } catch (e) {
      // Redis tumbang tidak boleh mengunci seluruh aplikasi; turun ke
      // lapisan memori supaya masih ada perlindungan seadanya.
      console.error("[batas] Redis gagal, memakai memori proses:", e);
    }
  }
  return cekMemori(kunci, maks, jendelaDetik);
}

/**
 * Penjaga siap pakai untuk route API: kembalikan Response 429 (dengan
 * Retry-After) bila lewat batas, atau null bila boleh lanjut.
 * Panggil SEBELUM query database.
 */
export async function pastikanTidakMelebihiBatas(
  request: Request,
  endpoint: string,
  maks: number,
  jendelaDetik: number,
  pembeda = "",
): Promise<Response | null> {
  const kunci = `${endpoint}|${ipDari(request)}${pembeda ? `|${pembeda}` : ""}`;
  const hasil = await cekBatas(kunci, maks, jendelaDetik);
  if (hasil.boleh) return null;

  const menit = Math.ceil(hasil.cobaLagiDetik / 60);
  return Response.json(
    { error: `Terlalu banyak percobaan. Coba lagi dalam ${menit} menit.` },
    { status: 429, headers: { "Retry-After": String(hasil.cobaLagiDetik) } },
  );
}

/** true bila pembatas terpusat (Redis) sedang aktif — dipakai /api/sehat. */
export function batasTerpusatAktif(): boolean {
  return redisSiap();
}

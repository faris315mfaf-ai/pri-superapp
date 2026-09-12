// ============================================================
// TOP MINGGUAN — hitungan kenaikan pekan ini vs pekan lalu (12 Sep 2026)
//
// Pekan dihitung Senin–Minggu waktu Indonesia (WIB). "Berjalan" berarti
// pekan ini masih berlangsung, jadi pembandingnya dibuat ADIL: rentang
// yang sama panjang di pekan lalu. Hari Rabu pekan ini dibandingkan
// dengan Senin–Rabu pekan lalu, bukan dengan pekan lalu yang sudah utuh
// tujuh hari — kalau tidak, semua orang selalu terlihat "turun" di awal
// pekan.
//
// Dua sumber angka:
//   • LAPORAN VIDEO — jumlah laporan per orang (laporan_video). Sejarahnya
//     sudah ada sejak lama, jadi langsung bisa dihitung.
//   • PENGIKUT — dari rekaman harian per anggota (sql/48). Baru bermakna
//     setelah rekamannya terkumpul; sebelum itu dinyatakan apa adanya.
//
// Berkas ini murni: tanpa database, tanpa jaringan — supaya bisa diuji.
// ============================================================

const SEHARI_MS = 24 * 60 * 60_000;
const GESER_WIB_MS = 7 * 60 * 60_000;

/** 'YYYY-MM-DD' WIB dari waktu epoch. */
export function tanggalWibDari(ms: number): string {
  return new Date(ms + GESER_WIB_MS).toISOString().slice(0, 10);
}

/** Epoch (ms) tengah malam WIB untuk tanggal 'YYYY-MM-DD'. */
function awalHariWibMs(tanggal: string): number {
  return Date.parse(`${tanggal}T00:00:00+07:00`);
}

function geserTanggal(tanggal: string, hari: number): string {
  return tanggalWibDari(awalHariWibMs(tanggal) + hari * SEHARI_MS + 1);
}

export type JendelaMingguan = {
  /** Pekan ini: Senin s.d. hari ini (WIB), inklusif. */
  ini: { dari: string; sampai: string };
  /** Pekan lalu, rentang yang SAMA PANJANG: Senin lalu s.d. hari yang sama. */
  lalu: { dari: string; sampai: string };
  /** Minggu terakhir sebelum pekan ini (akhir pekan lalu) — untuk rekaman. */
  akhir_pekan_lalu: string;
  /** Minggu sebelumnya lagi — pembanding kenaikan pekan lalu. */
  akhir_dua_pekan_lalu: string;
  hari_ke: number; // 1 = Senin … 7 = Minggu
};

/** Jendela pekan berjalan untuk saat `ms` (WIB, Senin–Minggu). */
export function jendelaMingguan(ms = Date.now()): JendelaMingguan {
  const hariIni = tanggalWibDari(ms);
  // getUTCDay pada waktu yang sudah digeser +7 jam = hari WIB.
  const hariMingguan = new Date(ms + GESER_WIB_MS).getUTCDay(); // 0 = Minggu
  const hariKe = hariMingguan === 0 ? 7 : hariMingguan; // 1..7, Senin = 1
  const seninIni = geserTanggal(hariIni, -(hariKe - 1));
  const seninLalu = geserTanggal(seninIni, -7);
  const sampaiLalu = geserTanggal(hariIni, -7);
  return {
    ini: { dari: seninIni, sampai: hariIni },
    lalu: { dari: seninLalu, sampai: sampaiLalu },
    akhir_pekan_lalu: geserTanggal(seninIni, -1),
    akhir_dua_pekan_lalu: geserTanggal(seninIni, -8),
    hari_ke: hariKe,
  };
}

export type BarisKenaikan = {
  user_id: string;
  ini: number;
  lalu: number;
  naik: number;
};

/**
 * Kenaikan JUMLAH per orang dari daftar kejadian bertanggal (mis. laporan
 * video). Orang yang tidak punya kejadian di kedua rentang tidak muncul.
 */
export function kenaikanDariKejadian(
  kejadian: { user_id: string; tanggal_wib: string }[],
  j: JendelaMingguan,
): BarisKenaikan[] {
  const ini = new Map<string, number>();
  const lalu = new Map<string, number>();
  for (const k of kejadian) {
    const t = k.tanggal_wib.slice(0, 10);
    if (t >= j.ini.dari && t <= j.ini.sampai) ini.set(k.user_id, (ini.get(k.user_id) ?? 0) + 1);
    else if (t >= j.lalu.dari && t <= j.lalu.sampai) lalu.set(k.user_id, (lalu.get(k.user_id) ?? 0) + 1);
  }
  const semua = new Set([...ini.keys(), ...lalu.keys()]);
  return [...semua]
    .map((u) => {
      const a = ini.get(u) ?? 0;
      const b = lalu.get(u) ?? 0;
      return { user_id: u, ini: a, lalu: b, naik: a - b };
    })
    .sort((x, y) => y.naik - x.naik || y.ini - x.ini || x.user_id.localeCompare(y.user_id));
}

/**
 * Kenaikan NILAI (mis. pengikut) per orang dari rekaman harian.
 *
 * nilai pekan ini = rekaman terakhir yang ada (≤ hari ini)
 * nilai awal      = rekaman terakhir ≤ akhir pekan lalu
 * naik            = selisih keduanya
 *
 * Orang yang belum punya rekaman di awal pekan tidak diberi angka
 * (bukan dianggap nol, yang akan membuat kenaikannya tampak raksasa).
 */
export function kenaikanDariRekaman(
  rekaman: { user_id: string; tanggal_wib: string; nilai: number }[],
  j: JendelaMingguan,
): { baris: BarisKenaikan[]; ada_rekaman: boolean } {
  const terbaru = new Map<string, { t: string; v: number }>();
  const awal = new Map<string, { t: string; v: number }>();
  for (const r of rekaman) {
    const t = r.tanggal_wib.slice(0, 10);
    if (t > j.ini.sampai) continue;
    const kini = terbaru.get(r.user_id);
    if (!kini || t > kini.t) terbaru.set(r.user_id, { t, v: r.nilai });
    if (t <= j.akhir_pekan_lalu) {
      const a = awal.get(r.user_id);
      if (!a || t > a.t) awal.set(r.user_id, { t, v: r.nilai });
    }
  }
  const baris: BarisKenaikan[] = [];
  for (const [u, kini] of terbaru) {
    const a = awal.get(u);
    if (!a) continue; // belum ada pembanding
    baris.push({ user_id: u, ini: kini.v, lalu: a.v, naik: kini.v - a.v });
  }
  baris.sort((x, y) => y.naik - x.naik || y.ini - x.ini || x.user_id.localeCompare(y.user_id));
  return { baris, ada_rekaman: rekaman.length > 0 };
}

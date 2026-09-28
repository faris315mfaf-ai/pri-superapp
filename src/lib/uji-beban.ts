// ============================================================
// MESIN UJI BEBAN (29 Sep 2026). SERVER.
//
// Menirukan N orang membuka aplikasi BERSAMAAN lalu memakai fitur
// terberat, bertahap 25% → 50% → 75% → 100%. Tiap tahap diawali serbuan
// "login" (semua yang dimuat Beranda saat aplikasi dibuka), lalu tiap
// orang virtual:
//   - berdetak tiap ±10 dtk (/api/detak), seperti HP sungguhan;
//   - skenario "berat": berpindah ke layar berat tiap 4-9 dtk;
//   - skenario "normal": membuka satu layar tiap 45-90 dtk.
// Diukur per tahap: permintaan/dtk, waktu jawab p50/p95, galat, CPU
// Supabase, CPU proses aplikasi, dan kondisi penjaga Supabase.
//
// Pengaman (lihat juga lib/uji-beban-skenario & lib/uji-beban-token):
//   - hanya MEMBACA: proxy menolak token uji selain GET ke rute uji;
//   - berhenti OTOMATIS bila p95 > 5 dtk, galat > 10%, database macet,
//     atau CPU Supabase ≥ 97% dua kali berturut-turut;
//   - tidak bisa dimulai saat database sedang tidak normal;
//   - token uji mati seketika saat uji selesai / dihentikan.
//
// Mesin berjalan di proses aplikasi yang sama dan menembak 127.0.0.1,
// jadi ikut membebani CPU aplikasi — itu justru dilaporkan (cpu_aplikasi).
// ============================================================
import {
  AMBANG_UJI,
  IRAMA,
  alasanHenti,
  kesimpulanAman,
  langkahBerat,
  langkahBuka,
  langkahNormal,
  persentil,
  pilihBerbobot,
  tahapBertahap,
  type KonteksSkenario,
  type RingkasTahap,
  type SkenarioUji,
} from "@/lib/uji-beban-skenario";
import { akhiriPutaranUji, buatTokenUji, daftarkanPutaranUji, rahasiaUji } from "@/lib/uji-beban-token";

export type OpsiUji = {
  jumlah: number;
  skenario: SkenarioUji;
  /** Lama tiap tahap (detik). */
  durasiTahapDetik: number;
};

export type StatusUji = {
  id: string;
  skenario: SkenarioUji;
  target: number;
  tahap: number[];
  tahap_ke: number;
  durasi_tahap_detik: number;
  mulai: string;
  selesai: string | null;
  berjalan: boolean;
  alasan_berhenti: string | null;
  oleh: string;
  orang_aktif: number;
  langsung: { per_dtk: number; p50: number; p95: number; galat: number; cpu_supabase: number | null; cpu_aplikasi: number | null; tingkat_db: string } | null;
  hasil: RingkasTahap[];
  /** Jumlah orang terbesar yang masih AMAN (null selagi berjalan). */
  aman_sampai: number | null;
};

/** Ketergantungan mesin — produksi memakai yang asli, uji memakai tiruan. */
export type Ketergantungan = {
  asal: string;
  ambilAkun: (maks: number) => Promise<number[]>;
  ambilKonteks: () => Promise<KonteksSkenario>;
  /** Pembacaan counter CPU Supabase (detik idle & total); null = tak terbaca. */
  cuplikanCpu: () => Promise<{ idle: number; total: number } | null>;
  tingkatDb: () => string;
  simpanHasil: (s: StatusUji) => Promise<void>;
  catat: (pesan: string) => void;
  /** Kelipatan waktu (uji otomatis mempercepat irama); 1 = waktu nyata. */
  skalaWaktu?: number;
};

type Sampel = { t: number; ms: number; jenis: "ok" | "ditolak" | "galat"; path: string };

const gudang = globalThis as unknown as { __priUjiBeban?: { status: StatusUji | null; henti: ((alasan: string) => void) | null } };
const mesin = (gudang.__priUjiBeban ??= { status: null, henti: null });

export function statusUjiBeban(): StatusUji | null {
  return mesin.status;
}

export function hentikanUjiBeban(alasan = "Dihentikan master."): boolean {
  if (!mesin.status?.berjalan || !mesin.henti) return false;
  mesin.henti(alasan);
  return true;
}

function tidur(ms: number, sinyal: AbortSignal): Promise<void> {
  return new Promise((selesai) => {
    if (sinyal.aborted) return selesai();
    const t = setTimeout(selesai, ms);
    sinyal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        selesai();
      },
      { once: true },
    );
  });
}

function acakAntara(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function jenisDari(status: number): Sampel["jenis"] {
  if (status >= 200 && status < 400) return "ok";
  // Rute khusus pengurus bagi akun biasa (403), fitur mati (423), dll: murah
  // dan memang begitu seharusnya — bukan galat server. 401 = sesi uji rusak.
  if (status === 400 || status === 403 || status === 404 || status === 423) return "ditolak";
  return "galat";
}

function ringkasJendela(sampel: Sampel[]): { per: number; p50: number; p95: number; galat: number; n: number } {
  const ms = sampel.map((s) => s.ms);
  const galat = sampel.filter((s) => s.jenis === "galat").length;
  return { per: sampel.length, p50: persentil(ms, 0.5), p95: persentil(ms, 0.95), galat: sampel.length ? galat / sampel.length : 0, n: sampel.length };
}

/**
 * Jalankan satu uji sampai selesai (atau berhenti). Mengembalikan status akhir.
 * `saatStatus` dipanggil setiap kali status berubah (dipakai layar langsung).
 */
export async function jalankanUji(opsi: OpsiUji, oleh: string, dep: Ketergantungan): Promise<StatusUji> {
  const skala = dep.skalaWaktu ?? 1;
  const rahasia = rahasiaUji();
  if (!rahasia) throw new Error("CRON_SECRET belum diatur di server — uji beban tidak bisa dijalankan.");
  const jumlah = Math.max(1, Math.min(500, Math.floor(opsi.jumlah)));
  const durasiMs = Math.max(5, Math.min(300, Math.floor(opsi.durasiTahapDetik))) * 1000 * skala;
  const tahap = tahapBertahap(jumlah);
  const akun = await dep.ambilAkun(jumlah);
  if (akun.length === 0) throw new Error("Tidak ada akun aktif untuk ditirukan.");
  const konteks = await dep.ambilKonteks();

  const id = Array.from({ length: 12 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
  const sampaiMs = Date.now() + tahap.length * durasiMs + 120_000;
  daftarkanPutaranUji(id, sampaiMs);

  const status: StatusUji = {
    id,
    skenario: opsi.skenario,
    target: jumlah,
    tahap,
    tahap_ke: 0,
    durasi_tahap_detik: Math.round(durasiMs / 1000 / skala),
    mulai: new Date().toISOString(),
    selesai: null,
    berjalan: true,
    alasan_berhenti: null,
    oleh,
    orang_aktif: 0,
    langsung: null,
    hasil: [],
    aman_sampai: null,
  };
  mesin.status = status;

  const henti = new AbortController();
  let alasan: string | null = null;
  mesin.henti = (a: string) => {
    if (!alasan) alasan = a;
    henti.abort();
  };

  const semuaSampel: Sampel[] = [];
  const langkah = opsi.skenario === "berat" ? langkahBerat(konteks) : langkahNormal(konteks);
  const tugasVu: Promise<void>[] = [];

  const minta = async (token: string, path: string) => {
    if (henti.signal.aborted) return;
    const mulai = Date.now();
    let jenis: Sampel["jenis"] = "galat";
    try {
      const r = await fetch(dep.asal + path, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.any([henti.signal, AbortSignal.timeout(30_000)]),
      });
      await r.arrayBuffer();
      jenis = jenisDari(r.status);
    } catch {
      if (henti.signal.aborted) return; // dibatalkan karena uji berhenti: bukan galat
      jenis = "galat";
    }
    semuaSampel.push({ t: Date.now(), ms: Date.now() - mulai, jenis, path: path.split("?")[0] });
  };

  const jalankanVu = async (token: string) => {
    // Serbuan "login": semua yang dimuat Beranda saat aplikasi dibuka.
    await Promise.all(langkahBuka(konteks).map((p) => minta(token, p)));
    const detak = (async () => {
      while (!henti.signal.aborted) {
        await tidur(acakAntara(IRAMA.detakMs - 1_000, IRAMA.detakMs + 1_000) * skala, henti.signal);
        await minta(token, "/api/detak");
      }
    })();
    const aksi = (async () => {
      const [a, b] = opsi.skenario === "berat" ? IRAMA.beratMs : IRAMA.normalMs;
      while (!henti.signal.aborted) {
        await tidur(acakAntara(a, b) * skala, henti.signal);
        await minta(token, pilihBerbobot(langkah).path);
      }
    })();
    const notif = (async () => {
      if (opsi.skenario === "berat") return; // skenario berat sudah memuatnya di daftar aksi
      while (!henti.signal.aborted) {
        await tidur(IRAMA.notifikasiMs * skala, henti.signal);
        await minta(token, "/api/notifikasi");
      }
    })();
    await Promise.all([detak, aksi, notif]);
  };

  // Pemantau: CPU Supabase & proses aplikasi, kondisi database, penghenti otomatis.
  let cpuSupabase: number | null = null;
  let cpuTinggiBeruntun = 0;
  let cuplikanLalu: { idle: number; total: number } | null = null;
  let cpuProsesLalu = process.cpuUsage();
  let waktuProsesLalu = Date.now();
  let cpuAplikasi: number | null = null;
  let putaranPantau = 0;

  const pantau = async () => {
    putaranPantau += 1;
    // Metrik Supabase diperbarui ±per menit: baca tiap ±15 dtk, hitung saat berubah.
    if (putaranPantau % 3 === 1) {
      const c = await dep.cuplikanCpu().catch(() => null);
      if (c && cuplikanLalu && c.total > cuplikanLalu.total) {
        cpuSupabase = Math.max(0, Math.min(100, Math.round((1 - (c.idle - cuplikanLalu.idle) / (c.total - cuplikanLalu.total)) * 100)));
        cpuTinggiBeruntun = cpuSupabase >= AMBANG_UJI.cpuHenti ? cpuTinggiBeruntun + 1 : 0;
      }
      if (c && (!cuplikanLalu || c.total > cuplikanLalu.total)) cuplikanLalu = c;
    }
    const pakai = process.cpuUsage(cpuProsesLalu);
    const kini = Date.now();
    cpuAplikasi = Math.round(((pakai.user + pakai.system) / 1000 / Math.max(1, kini - waktuProsesLalu)) * 100);
    cpuProsesLalu = process.cpuUsage();
    waktuProsesLalu = kini;

    const jendela = semuaSampel.filter((s) => s.t >= kini - 30_000 * skala);
    const r = ringkasJendela(jendela);
    const tingkat = dep.tingkatDb();
    status.langsung = {
      per_dtk: Math.round((r.n / (30 * skala)) * 10) / 10,
      p50: r.p50,
      p95: r.p95,
      galat: Math.round(r.galat * 1000) / 10,
      cpu_supabase: cpuSupabase,
      cpu_aplikasi: cpuAplikasi,
      tingkat_db: tingkat,
    };
    const sebab = alasanHenti({ p95: r.p95, galat: r.galat, sampel: r.n, cpuTinggiBeruntun, tingkatDb: tingkat });
    if (sebab) mesin.henti?.(`Berhenti otomatis: ${sebab}`);
  };

  dep.catat(`[uji-beban] mulai ${id}: ${jumlah} orang, skenario ${opsi.skenario}, tahap ${tahap.join("/")}, oleh ${oleh}`);
  try {
    let vuDibuat = 0;
    for (let i = 0; i < tahap.length && !henti.signal.aborted; i++) {
      status.tahap_ke = i + 1;
      const awalTahap = Date.now();
      // Tambah orang virtual sampai jumlah tahap ini — serentak ("login bersamaan").
      while (vuDibuat < tahap[i]) {
        const userId = akun[vuDibuat % akun.length];
        tugasVu.push(jalankanVu(buatTokenUji(id, userId, sampaiMs, rahasia)));
        vuDibuat += 1;
      }
      status.orang_aktif = vuDibuat;
      // Jalani tahap sambil memantau tiap 5 dtk.
      while (!henti.signal.aborted && Date.now() - awalTahap < durasiMs) {
        await tidur(5_000 * skala, henti.signal);
        if (!henti.signal.aborted) await pantau();
      }
      // Ringkasan tahap (termasuk bila berhenti di tengah tahap).
      const sampelTahap = semuaSampel.filter((s) => s.t >= awalTahap);
      const r = ringkasJendela(sampelTahap);
      const detik = Math.max(1, (Date.now() - awalTahap) / 1000 / skala);
      const perPath = new Map<string, number[]>();
      for (const s of sampelTahap) perPath.set(s.path, [...(perPath.get(s.path) ?? []), s.ms]);
      const lambat = [...perPath.entries()]
        .map(([p, ms]) => [p, persentil(ms, 0.95), ms.length] as [string, number, number])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      const ringkas: RingkasTahap = {
        orang: tahap[i],
        permintaan: r.n,
        per_dtk: Math.round((r.n / detik) * 10) / 10,
        p50: r.p50,
        p95: r.p95,
        galat: Math.round(r.galat * 1000) / 10,
        ditolak: sampelTahap.filter((s) => s.jenis === "ditolak").length,
        cpu_supabase: cpuSupabase,
        cpu_aplikasi: cpuAplikasi,
        tingkat_db: dep.tingkatDb(),
        aman: !henti.signal.aborted && r.n > 0 && r.p95 < AMBANG_UJI.p95AmanMs && r.galat < AMBANG_UJI.galatAman,
        lambat_teratas: lambat,
      };
      status.hasil = [...status.hasil, ringkas];
    }
  } finally {
    if (!henti.signal.aborted) henti.abort();
    // Tunggu orang virtual berhenti (permintaan yang sedang jalan dibatalkan).
    await Promise.race([Promise.allSettled(tugasVu), new Promise((r) => setTimeout(r, 10_000))]);
    akhiriPutaranUji(id);
    status.berjalan = false;
    status.selesai = new Date().toISOString();
    status.orang_aktif = 0;
    status.alasan_berhenti = alasan;
    status.aman_sampai = kesimpulanAman(status.hasil);
    mesin.henti = null;
    dep.catat(`[uji-beban] selesai ${id}: aman sampai ${status.aman_sampai} orang${alasan ? ` — ${alasan}` : ""}`);
    await dep.simpanHasil(status).catch(() => {});
  }
  return status;
}

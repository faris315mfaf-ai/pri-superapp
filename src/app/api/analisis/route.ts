// POST /api/analisis — picu workflow n8n "QC Konten v5 (TikHub)".
// GET  /api/analisis — penanda laporan QC terakhir (dipakai memantau selesai).
//
// Aplikasi tidak melakukan scraping/pencocokan sendiri: TikHub, matching
// kader, dan penulisan rekap semuanya dikerjakan n8n. Aplikasi hanya
// "menekan tombolnya" lalu menunggu n8n menuliskan tanda selesai.
//
// TANDA SELESAI-nya adalah satu baris di tabel `notifikasi` dengan
// jenis_peristiwa = 'laporan_qc'. Itu ditulis n8n di ujung workflow,
// jadi kemunculannya benar-benar berarti "pekerjaan sudah rampung" —
// berbeda dari balasan webhook yang datang seketika (node "Balas Segera")
// padahal pekerjaannya baru dimulai.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { pastikanFiturAktif } from "@/lib/fitur-server";

import { panggilWebhookN8n, N8nBelumDiaturError, webhookSiap } from "@/lib/n8n";

/** Peran yang boleh memicu analisis QC. */
const BOLEH_ANALISIS = new Set(["master", "super_admin", "admin_hr"]);

export const dynamic = "force-dynamic";

/**
 * Penanda "laporan QC terakhir yang sudah ada".
 *
 * `id` berupa teks karena kolomnya bigint — dibandingkan sebagai angka
 * oleh pemanggil untuk menentukan mana yang lebih baru.
 */
export type PenandaLaporanQc = {
  id: string | null;
  waktu: string | null;
  judul: string | null;
  isi: string | null;
};

/** Ambil laporan QC PALING BARU yang saat ini ada di database. */
async function penandaLaporanTerakhir(): Promise<PenandaLaporanQc> {
  // Diurutkan berdasarkan id (bigint identity), bukan waktu: id selalu
  // naik dan tidak bisa bertabrakan walau dua baris lahir pada detik
  // yang sama atau jam servernya bergeser.
  const { data, error } = await supabase()
    .from("notifikasi")
    .select("id, judul, isi, dibuat_pada")
    .eq("jenis_peristiwa", "laporan_qc")
    .order("id", { ascending: false })
    .limit(1);

  if (error) {
    console.error("[Supabase] penanda laporan QC:", error.message);
    throw new Error("Gagal membaca status analisis dari database");
  }

  const baris = data?.[0] as
    | { id: number | string; judul?: string; isi?: string; dibuat_pada?: string }
    | undefined;

  if (!baris) return { id: null, waktu: null, judul: null, isi: null };

  return {
    id: String(baris.id),
    waktu: baris.dibuat_pada ?? null,
    judul: baris.judul ?? null,
    isi: baris.isi ?? null,
  };
}

/**
 * Penanda laporan QC terakhir SAAT INI.
 *
 * Dipanggil berulang (polling) oleh layar QC, jadi sengaja ringan:
 * satu baris saja, bukan seluruh daftar notifikasi.
 *
 * `siap` memberi tahu apakah URL webhook sudah terpasang di .env TANPA
 * memicu apa pun — memicu workflow asli memakan kuota TikHub berbayar,
 * jadi pemeriksaan kesiapan harus gratis.
 */
/**
 * Progres analisis yang SEDANG berjalan, ditulis n8n di tiap titik alurnya
 * (tabel qc_progres, satu baris). Inilah yang membuat loading di layar QC
 * mengikuti proses nyata, bukan hitungan waktu.
 *
 * Toleran: bila tabelnya belum ada / gagal dibaca, kembalikan null saja -
 * progres hanyalah hiasan tahap; penentu SELESAI tetap notifikasi laporan.
 */
export type ProgresAnalisis = {
  tahap: string;
  keterangan: string;
  selesai: boolean;
  mulai_pada: string | null;
  diperbarui_pada: string | null;
};

async function bacaProgres(): Promise<ProgresAnalisis | null> {
  try {
    const { data, error } = await supabase()
      .from("qc_progres")
      .select("tahap, keterangan, selesai, mulai_pada, diperbarui_pada")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return null;
    return data as ProgresAnalisis;
  } catch {
    return null;
  }
}

/**
 * Kemajuan pemeriksaan komentar untuk SATU periode, dihitung dari status
 * per postingan di database (view v_app_qc_antrian).
 *
 * Inilah yang membuat layar QC tetap tahu kondisi sebenarnya walau aplikasi
 * ditutup dan dibuka lagi. Sebelumnya status analisis hanya hidup di memori
 * peramban, sehingga layar selalu menulis "Belum Ada Analisis Hari Ini"
 * padahal datanya sudah ada di database.
 */
export type AntrianQc = {
  periode: string;
  total: number;
  selesai: number;
  menunggu: number;
  gagal: number;
  perlu_cek_manual: number;
  terakhir_diperiksa: string | null;
};

async function bacaAntrian(periode: string | null): Promise<AntrianQc | null> {
  if (!periode) return null;
  try {
    const { data, error } = await supabase()
      .from("v_app_qc_antrian")
      .select("periode, total, selesai, menunggu, gagal, perlu_cek_manual, terakhir_diperiksa")
      .eq("periode", periode)
      .maybeSingle();
    if (error || !data) return null;
    return data as AntrianQc;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  return bungkus(async () => {
    // Data internal partai — wajib login (dulu endpoint ini terbuka).
    await pastikanMasuk(request);
    const url = new URL(request.url);

    // ?riwayat=1 → daftar seluruh analisis yang pernah dijalankan
    // (satu baris per periode), untuk tombol Riwayat di layar QC.
    if (url.searchParams.get("riwayat") === "1") {
      const { data, error } = await supabase()
        .from("v_app_qc_antrian")
        .select("periode, total, selesai, menunggu, gagal, perlu_cek_manual, terakhir_diperiksa")
        .order("periode", { ascending: false })
        .limit(30);
      if (error) {
        console.error("[analisis] riwayat:", error.message);
        throw new Error("Gagal memuat riwayat analisis.");
      }
      return { data: (data ?? []) as AntrianQc[] };
    }

    const periode = url.searchParams.get("periode");
    // Ketiganya tidak saling bergantung, jadi dijalankan bersamaan.
    const [penanda, progres, antrian] = await Promise.all([
      penandaLaporanTerakhir(),
      bacaProgres(),
      bacaAntrian(periode),
    ]);
    return {
      siap: webhookSiap("N8N_WEBHOOK_QC_MULAI"),
      penanda,
      progres,
      antrian,
    };
  });
}

/**
 * MULAI analisis QC baru — TIDAK menunggu sampai selesai.
 *
 * Workflow n8n membalas segera lalu bekerja 1–3 menit di latar belakang,
 * jauh lebih lama dari umur satu permintaan web. Karena itu respons ini
 * hanya mengabarkan "sudah dipicu" plus penanda laporan LAMA.
 *
 * Penanda diambil SEBELUM webhook dipicu — kalau diambil sesudahnya, ada
 * celah waktu di mana laporan run ini keburu masuk lalu ikut tercatat
 * sebagai "yang lama", sehingga selamanya dianggap belum selesai.
 * Penanda lama itulah pembanding yang membuat layar tahu laporan mana
 * yang benar-benar milik run sekarang, bukan sisa run kemarin.
 */
export async function POST(request: Request) {
  return bungkus(async () => {
    // WAJIB LOGIN + peran pengurus QC. Sebelumnya endpoint ini terbuka
    // sepenuhnya: siapa pun yang tahu alamatnya bisa memicu scraping dan
    // membakar kuota TikHub/Ayrshare tanpa jejak siapa pemicunya.
    const user = await pastikanMasuk(request);
    if (!BOLEH_ANALISIS.has(user.role)) {
      throw Object.assign(
        new Error("Hanya pengurus QC yang boleh menjalankan analisis."),
        { status: 403 },
      );
    }
    await pastikanFiturAktif(user, "qc.analisis", "Fitur analisis sedang dimatikan untuk peran Anda.");

    // Tanggal yang mau dianalisis (aturan baru: scraping PER HARI).
    // Divalidasi SEBELUM menyentuh apa pun - permintaan tak sah tidak boleh
    // membakar kuota scraping.
    let tanggal: string | null = null;
    try {
      const body = await request.json();
      const t = String(body?.tanggal ?? "").trim();
      if (t) tanggal = t;
    } catch {
      // tanpa body = analisis hari ini; itu sah
    }

    if (tanggal) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
        throw Object.assign(
          new Error("Format tanggal tidak dikenali. Gunakan YYYY-MM-DD."),
          { status: 400 },
        );
      }
      // Hari ini menurut kalender WIB, bukan kalender server (UTC).
      const hariIniWib = new Date(Date.now() + 7 * 3600 * 1000)
        .toISOString()
        .slice(0, 10);
      if (tanggal > hariIniWib) {
        throw Object.assign(
          new Error("Tanggal itu belum dimulai. Pilih hari ini atau sebelumnya."),
          { status: 400 },
        );
      }
    }

    // Kedua penanda diambil SEBELUM webhook dipicu; itulah pembanding yang
    // membuat layar tahu laporan/progres mana yang milik run SEKARANG.
    const [sebelum, progresSebelum] = await Promise.all([
      penandaLaporanTerakhir(),
      bacaProgres(),
    ]);

    try {
      await panggilWebhookN8n(
        "N8N_WEBHOOK_QC_MULAI",
        tanggal ? { tanggal } : {},
      );
    } catch (e) {
      if (e instanceof N8nBelumDiaturError) {
        throw Object.assign(new Error(e.message), { status: 503 });
      }
      throw e;
    }

    return {
      dimulai: true,
      tanggal: tanggal,
      penanda_sebelum: sebelum,
      progres_sebelum: progresSebelum,
    };
  });
}

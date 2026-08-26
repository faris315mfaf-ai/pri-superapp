// GET /api/dashboard — data lengkap dashboard super admin
// { kpi, tren, kepatuhanAkun, aktivitas, peringkat, ringkasanVideo, ringkasan }
//
// Seluruh angka dihitung dari data Supabase yang nyata (bukan lagi dummy).
// KPI membandingkan periode aktif dengan periode sebelumnya untuk
// mendapatkan nilai `delta` (panah naik/turun di kartu).
import { supabase } from "@/lib/supabase";
import { bungkus, pastikanSukses } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";

export const dynamic = "force-dynamic";

type BarisRekap = {
  periode: string;
  nama_kader: string;
  akun_wajib: string;
  id_postingan: string;
  sudah_komentar: boolean;
  jumlah_komentar: number;
};

type Notif = { judul: string; kategori: string; waktu_relatif: string };
type Video = { status: string; jam_tanggal: string };

/** Nama hari Bahasa Indonesia untuk sumbu grafik tren */
const NAMA_HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

/** Persentase kepatuhan dari sekumpulan baris rekap */
function persen(baris: BarisRekap[]): number {
  if (baris.length === 0) return 0;
  return Math.round(
    (baris.filter((r) => r.sudah_komentar).length / baris.length) * 100,
  );
}

/** Selisih dua angka, dibulatkan, selalu positif (arah dipisah) */
function delta(sekarang: number, sebelum: number) {
  const beda = sekarang - sebelum;
  return {
    delta: Math.abs(Math.round(beda)),
    arah: (beda >= 0 ? "naik" : "turun") as "naik" | "turun",
  };
}

export async function GET(request: Request) {
  return bungkus(async () => {
    // Data internal partai — wajib login (dulu endpoint ini terbuka).
    await pastikanMasuk(request);
    const db = supabase();

    // Empat query di bawah TIDAK saling bergantung, jadi dijalankan bersamaan
    // dalam satu Promise.all. Sebelumnya keempatnya di-await berurutan,
    // sehingga satu permintaan dashboard menunggu empat round-trip Supabase
    // yang antre satu per satu — padahal hanya `rekap` (di bawah) yang benar-
    // benar butuh hasil query pertama.
    //
    // CATATAN soal supabase-js: query builder-nya "thenable MALAS" —
    // permintaan HTTP baru dikirim ketika .then() dipanggil. Menyimpannya ke
    // variabel saja TIDAK memulai apa pun. Masuk ke Promise.all (yang memanggil
    // .then pada tiap anggota) itulah yang membuat keempatnya jalan berbarengan.
    const [hasilPeriode, hasilVideo, hasilAkun, hasilNotif] = await Promise.all([
      db.from("v_app_periode").select("periode").limit(7),
      db.from("v_app_video_antrian").select("status, jam_tanggal"),
      db
        .from("v_app_akun_wajib")
        .select("akun_wajib")
        .eq("aktif", true)
        .order("akun_wajib"),
      db
        .from("v_app_notifikasi")
        .select("judul, kategori, waktu_relatif")
        .order("dibuat_pada", { ascending: false })
        // 60 baris: cukup untuk 50+ riwayat berhalaman di kartu Aktivitas.
        .limit(60),
    ]);

    // --- Daftar periode (terbaru dulu) ---
    const periodeRows = pastikanSukses(hasilPeriode, "daftar periode") as {
      periode: string;
    }[];
    const daftarPeriode = periodeRows.map((p) => p.periode);
    const periodeAktif = daftarPeriode[0] ?? "";
    const periodeSebelum = daftarPeriode[1] ?? "";

    // --- Rekap 7 periode terakhir sekaligus (1 query, bukan 7) ---
    const rekap =
      daftarPeriode.length > 0
        ? (pastikanSukses(
            await db
              .from("v_app_rekap")
              .select(
                "periode, nama_kader, akun_wajib, id_postingan, sudah_komentar, jumlah_komentar",
              )
              .in("periode", daftarPeriode),
            "rekap kepatuhan",
          ) as BarisRekap[])
        : [];

    const rekapAktif = rekap.filter((r) => r.periode === periodeAktif);
    const rekapSebelum = rekap.filter((r) => r.periode === periodeSebelum);

    // --- Video (untuk KPI & kartu pipeline) — diambil di Promise.all atas ---
    const video = pastikanSukses(hasilVideo, "antrian video") as Video[];

    const ringkasanVideo: Record<string, number> = {};
    for (const v of video) {
      ringkasanVideo[v.status] = (ringkasanVideo[v.status] ?? 0) + 1;
    }

    // Video "hari ini" menurut kalender WIB
    const hariIniWib = new Date(Date.now() + 7 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    const videoHariIni = video.filter(
      (v) =>
        v.jam_tanggal &&
        new Date(new Date(v.jam_tanggal).getTime() + 7 * 3600 * 1000)
          .toISOString()
          .slice(0, 10) === hariIniWib,
    ).length;

    // --- KPI ---
    const persenAktif = persen(rekapAktif);
    const persenSebelum = persen(rekapSebelum);
    const postAktif = new Set(rekapAktif.map((r) => r.id_postingan)).size;
    const postSebelum = new Set(rekapSebelum.map((r) => r.id_postingan)).size;
    const belumAktif = rekapAktif.filter((r) => !r.sudah_komentar).length;
    const belumSebelum = rekapSebelum.filter((r) => !r.sudah_komentar).length;

    const kpi = [
      {
        id: "kpi-1",
        label: "Tingkat Kepatuhan Hari Ini",
        nilai: `${persenAktif}%`,
        satuan_delta: "%" as const,
        ...delta(persenAktif, persenSebelum),
      },
      {
        id: "kpi-2",
        label: "Postingan Dipantau",
        nilai: String(postAktif),
        satuan_delta: "" as const,
        ...delta(postAktif, postSebelum),
      },
      {
        id: "kpi-3",
        label: "Kader Belum Komentar",
        nilai: String(belumAktif),
        satuan_delta: "" as const,
        // Turunnya angka "belum komentar" itu KABAR BAIK, tapi arah panah
        // tetap mengikuti pergerakan angka apa adanya (UI yang memberi warna).
        ...delta(belumAktif, belumSebelum),
      },
      {
        id: "kpi-4",
        label: "Video Diproses Hari Ini",
        nilai: String(videoHariIni),
        satuan_delta: "" as const,
        delta: 0,
        arah: "naik" as const,
      },
    ];

    // --- Tren 7 periode (urut lama → baru, seperti grafik garis) ---
    const tren = [...daftarPeriode]
      .reverse()
      .map((p) => {
        const tanggal = new Date(`${p.slice(0, 10)}T00:00:00Z`);
        return {
          hari: NAMA_HARI[tanggal.getUTCDay()] ?? p.slice(5, 10),
          nilai: persen(rekap.filter((r) => r.periode === p)),
        };
      });

    // --- Kepatuhan per akun wajib (periode aktif) — akun dari Promise.all ---
    const akun = pastikanSukses(hasilAkun, "daftar akun wajib") as {
      akun_wajib: string;
    }[];

    const kepatuhanAkun = akun.map((a) => ({
      akun_wajib: a.akun_wajib,
      persen: persen(rekapAktif.filter((r) => r.akun_wajib === a.akun_wajib)),
    }));

    // --- Peringkat kader (5 teratas berdasarkan jumlah komentar) ---
    const perKader = new Map<string, number>();
    for (const r of rekapAktif) {
      perKader.set(r.nama_kader, (perKader.get(r.nama_kader) ?? 0) + r.jumlah_komentar);
    }
    const peringkat = [...perKader.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([nama_kader, jumlah_komentar], i) => ({
        id: `k-${String(i + 1).padStart(2, "0")}`,
        nama_kader,
        jumlah_komentar,
      }));

    // --- Aktivitas terbaru: notifikasi, diambil di Promise.all atas ---
    const notif = pastikanSukses(hasilNotif, "aktivitas terbaru") as Notif[];

    const aktivitas = notif.map((n, i) => ({
      id: `act-${i + 1}`,
      jenis: (["QC", "VIDEO", "SISTEM"].includes(n.kategori)
        ? n.kategori
        : "SISTEM") as "QC" | "VIDEO" | "ROSTER" | "SISTEM",
      teks: n.judul,
      waktu_relatif: n.waktu_relatif,
    }));

    // --- Ringkasan global ---
    // "Patuh penuh" = kader yang komentar di SEMUA postingan sebuah akun.
    // Satu pasangan = 1 kader x 1 akun wajib.
    const pasangan = new Map<string, { total: number; sudah: number }>();
    for (const r of rekapAktif) {
      const kunci = `${r.nama_kader}|||${r.akun_wajib}`;
      const p = pasangan.get(kunci) ?? { total: 0, sudah: 0 };
      p.total += 1;
      if (r.sudah_komentar) p.sudah += 1;
      pasangan.set(kunci, p);
    }
    const totalPasangan = pasangan.size;
    const patuhPenuh = [...pasangan.values()].filter(
      (p) => p.total > 0 && p.sudah === p.total,
    ).length;

    return {
      kpi,
      tren,
      kepatuhanAkun,
      aktivitas,
      peringkat,
      ringkasanVideo,
      ringkasan: {
        total_postingan: postAktif,
        kader_patuh: `${patuhPenuh} / ${totalPasangan}`,
        perlu_ditindak: totalPasangan - patuhPenuh,
        persen_kepatuhan: persenAktif,
      },
    };
  });
}

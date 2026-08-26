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

/** Satu baris view v_app_ringkasan_periode */
type BarisRingkasan = {
  periode: string;
  total_unit: number;
  sudah_komentar: number;
  belum_komentar: number;
  jumlah_postingan: number;
  jumlah_kader: number;
  persen_patuh: number;
};

/** Satu baris view v_app_ringkasan_akun_periode */
type BarisRingkasanAkun = {
  periode: string;
  platform: string;
  akun_wajib: string;
  persen_patuh: number;
};

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

    // --- Ringkasan 7 periode terakhir, DIHITUNG DI DATABASE ---
    //
    // Dulu seluruh baris v_app_rekap ditarik lalu dihitung di sini.
    // Dengan 104 anggota x ~113 postingan, satu hari saja sudah 11.901
    // baris — sementara PostgREST diam-diam memotong di 1.000. Seluruh
    // angka kepatuhan jadi dihitung dari 8% data: tingkat kepatuhan
    // tampil 0% padahal ada 52 kepatuhan, dan "postingan dipantau"
    // tampil 22 padahal 113. View agregat mengembalikan HITUNGAN, jadi
    // banyaknya data tidak lagi memengaruhi kebenaran angkanya.
    const ringkasanPeriode =
      daftarPeriode.length > 0
        ? (pastikanSukses(
            await db
              .from("v_app_ringkasan_periode")
              .select(
                "periode, total_unit, sudah_komentar, belum_komentar, jumlah_postingan, jumlah_kader, persen_patuh",
              )
              .in("periode", daftarPeriode),
            "ringkasan kepatuhan",
          ) as BarisRingkasan[])
        : [];

    const perPeriode = new Map(ringkasanPeriode.map((r) => [r.periode, r]));
    const kosong: BarisRingkasan = {
      periode: "",
      total_unit: 0,
      sudah_komentar: 0,
      belum_komentar: 0,
      jumlah_postingan: 0,
      jumlah_kader: 0,
      persen_patuh: 0,
    };
    const aktif = perPeriode.get(periodeAktif) ?? kosong;
    const sebelum = perPeriode.get(periodeSebelum) ?? kosong;

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

    // --- KPI (seluruhnya dari agregat database) ---
    const persenAktif = Number(aktif.persen_patuh) || 0;
    const persenSebelum = Number(sebelum.persen_patuh) || 0;
    const postAktif = Number(aktif.jumlah_postingan) || 0;
    const postSebelum = Number(sebelum.jumlah_postingan) || 0;
    const belumAktif = Number(aktif.belum_komentar) || 0;
    const belumSebelum = Number(sebelum.belum_komentar) || 0;

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
        // Satuannya UNIT KEWAJIBAN (orang x postingan), bukan jumlah
        // orang. Label lama "Kader Belum Komentar" terbaca seolah
        // 11.849 ORANG belum berkomentar padahal anggotanya 107.
        label: "Kewajiban Belum Dipenuhi",
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
          nilai: Number(perPeriode.get(p)?.persen_patuh ?? 0),
        };
      });

    // --- Kepatuhan per akun wajib (periode aktif) — akun dari Promise.all ---
    const akun = pastikanSukses(hasilAkun, "daftar akun wajib") as {
      akun_wajib: string;
    }[];

    // Kepatuhan per akun juga dari agregat database, sebab menyaring
    // baris mentah di sini terkena batas 1.000 baris yang sama.
    const ringkasanAkun = (pastikanSukses(
      await db
        .from("v_app_ringkasan_akun_periode")
        .select("periode, platform, akun_wajib, persen_patuh")
        .eq("periode", periodeAktif),
      "ringkasan per akun",
    ) as BarisRingkasanAkun[]) ?? [];
    const persenPerAkun = new Map(
      ringkasanAkun.map((r) => [r.akun_wajib, Number(r.persen_patuh) || 0]),
    );

    const kepatuhanAkun = akun.map((a) => ({
      akun_wajib: a.akun_wajib,
      persen: persenPerAkun.get(a.akun_wajib) ?? 0,
    }));

    // Peringkat kader sudah tidak ditampilkan sejak 1.13 (kartunya
    // dihapus dari beranda). Field-nya dipertahankan sebagai daftar
    // kosong demi pemanggil lama, TANPA menarik belasan ribu baris
    // hanya untuk lima nama yang tidak dipakai siapa pun.
    const peringkat: { id: string; nama_kader: string; jumlah_komentar: number }[] = [];

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
    // "Patuh penuh" dulu dihitung per pasangan kader x akun dari baris
    // mentah — mustahil benar di bawah batas 1.000 baris. Kini memakai
    // angka agregat: berapa unit kewajiban yang terpenuhi dari total.
    const totalPasangan = Number(aktif.total_unit) || 0;
    const patuhPenuh = Number(aktif.sudah_komentar) || 0;

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

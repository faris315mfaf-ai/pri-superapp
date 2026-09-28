// GET  /api/absensi — riwayat absensi (sendiri; ?semua=1 untuk HR)
// POST /api/absensi — DITUTUP (410): absen dilakukan di aplikasi SADAR.
//
// 14 Sep 2026: SuperApp bukan lagi alat absen. Absen (jam masuk/pulang,
// sakit, izin) dilakukan di SADAR (sadar-pri.id); SuperApp hanya
// MENAMPILKAN datanya. Setiap kali riwayat dibaca, data hari ini ditarik
// dulu dari SADAR (paling cepat tiap 60 dtk — lib/absensi-sadar), lalu
// dibaca dari tabel `absensi` yang sudah dicerminkan. Jadi layar ini
// tidak pernah lebih basi dari satu menit terhadap SADAR.
//
// Bentuk balasan dipertahankan (id, user_id, jenis, waktu, tanggal_wib…)
// supaya beranda, dashboard, HR Center, dan rekap tidak berubah; kolom
// foto/GPS masih ada untuk baris lama (swafoto era sebelumnya) dan kosong
// untuk baris dari SADAR. Ditambah: sumber, status_sadar, tipe_sadar,
// verifikasi_sadar.
//
// Retensi: baris LAMA berfoto tetap dihapus setelah 7 hari (foto tidak
// perlu disimpan lebih lama). Baris dari SADAR disimpan 400 hari — tanpa
// foto, murah, dan rekap bulanan membutuhkannya.
import { after } from "next/server";
import { supabase } from "@/lib/supabase";
import { bolehSekarang } from "@/lib/jeda-instans";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { bolehDashboard } from "@/lib/dashboard-akses";
import { adalahHR } from "@/lib/hr";
import {
  jumlahTidakCocok,
  petaKodeKeUser,
  sadarLangsung,
  sinkronAbsensiHariIni,
  tabelSadarAda,
} from "@/lib/absensi-sadar";
import { jenisKehadiran, sadarSiap, SADAR_URL_BAWAAN, waktuWibKeIso } from "@/lib/sadar";
import { tanggalWibHariIni } from "@/lib/format";

export const dynamic = "force-dynamic";

const RETENSI_FOTO_HARI = 7;
const RETENSI_SADAR_HARI = 400;
const BOLEH_LIHAT_SEMUA = new Set(["admin_hr", "super_admin", "master", "superadmin"]);

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasuk(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  return user;
}

/**
 * Bersih-bersih: foto era swafoto (>7 hari) dibuang beserta barisnya;
 * baris SADAR yang sangat lama (>400 hari) ikut dibuang. Foto dulu, baru
 * baris — kalau penghapusan foto gagal, barisnya tetap jadi penunjuk.
 */
async function bersihkanUsang() {
  // Menumpang GET absensi: cukup sekali per 10 menit per proses (28 Sep 2026).
  if (!bolehSekarang("absensi:bersihkan-usang", 10 * 60_000)) return;
  try {
    const db = supabase();
    const batasFoto = new Date(Date.now() - RETENSI_FOTO_HARI * 86_400_000).toISOString();
    const { data: usang } = await db
      .from("absensi")
      .select("id, foto_path")
      .not("foto_path", "is", null)
      .neq("foto_path", "")
      .lt("waktu", batasFoto)
      .limit(200);
    if (usang && usang.length > 0) {
      await db.storage.from("absensi").remove(usang.map((u) => String(u.foto_path)));
      await db.from("absensi").delete().in("id", usang.map((u) => u.id));
    }
    const batasSadar = new Date(Date.now() - RETENSI_SADAR_HARI * 86_400_000).toISOString().slice(0, 10);
    await db.from("absensi").delete().eq("sumber", "sadar").lt("tanggal_wib", batasSadar);
    await db.from("absensi_sadar").delete().lt("tanggal", batasSadar);
  } catch (e) {
    console.error("[absensi] bersihkan:", e);
  }
}

type BarisAbsensi = {
  id: number;
  user_id: number;
  jenis: string;
  waktu: string;
  tanggal_wib: string;
  lat: number | null;
  lng: number | null;
  akurasi_m: number | null;
  alamat: string | null;
  foto_path: string | null;
  sumber?: string | null;
  kode_pegawai?: string | null;
  status_sadar?: string | null;
  tipe_sadar?: string | null;
  verifikasi_sadar?: string | null;
  app_user?: { nama: string; jabatan: string | null } | null;
};

const KOLOM =
  "id, user_id, jenis, waktu, tanggal_wib, lat, lng, akurasi_m, alamat, foto_path, sumber, kode_pegawai, status_sadar, tipe_sadar, verifikasi_sadar, app_user(nama, jabatan)";
const KOLOM_LAMA =
  "id, user_id, jenis, waktu, tanggal_wib, lat, lng, akurasi_m, alamat, foto_path, app_user(nama, jabatan)";

/** Rapikan baris + signed URL foto (1 jam) untuk baris lama yang masih berfoto. */
async function rapikan(baris: BarisAbsensi[]) {
  if (baris.length === 0) return [];
  const db = supabase();
  const petaUrl = new Map<string, string>();
  const berfoto = baris.map((b) => b.foto_path).filter((p): p is string => Boolean(p));
  if (berfoto.length > 0) {
    const { data: tanda } = await db.storage.from("absensi").createSignedUrls(berfoto, 3600);
    for (const t of tanda ?? []) if (t.signedUrl && t.path) petaUrl.set(t.path, t.signedUrl);
  }
  return baris.map((b) => ({
    id: String(b.id),
    user_id: String(b.user_id),
    nama: b.app_user?.nama ?? "",
    jabatan: b.app_user?.jabatan ?? "",
    jenis: b.jenis,
    waktu: b.waktu,
    tanggal_wib: b.tanggal_wib,
    lat: b.lat,
    lng: b.lng,
    akurasi_m: b.akurasi_m,
    alamat: b.alamat,
    foto_url: b.foto_path ? (petaUrl.get(b.foto_path) ?? "") : "",
    sumber: b.sumber ?? "superapp",
    kode_pegawai: b.kode_pegawai ?? "",
    status_sadar: b.status_sadar ?? "",
    tipe_sadar: b.tipe_sadar ?? "",
    verifikasi_sadar: b.verifikasi_sadar ?? "",
  }));
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!user.ujiBeban) after(bersihkanUsang);

    const url = new URL(request.url);
    const mauSemua = url.searchParams.get("semua") === "1";
    if (
      mauSemua &&
      !BOLEH_LIHAT_SEMUA.has(user.role) &&
      // Orang HR (peran admin_hr / Divisi HR — fitur 1.22.x/1) boleh baca.
      !adalahHR(user) &&
      // Fitur 1.19/3.3.a: akses dashboard "absensi" = boleh MEMBACA
      // absensi semua anggota.
      !(await bolehDashboard(user, "absensi"))
    ) {
      throw Object.assign(new Error("Hanya HR yang boleh melihat absensi semua anggota."), {
        status: 403,
      });
    }

    // Segarkan hari ini dari SADAR (dikekang 60 dtk; gagal = pakai cermin
    // terakhir — layar tidak boleh kosong hanya karena SADAR lambat).
    // Tanpa tabel cermin (sql/53 belum dijalankan) → jalur langsung di bawah.
    const adaTabel = await tabelSadarAda();
    const sinkron = sadarSiap() && adaTabel ? await sinkronAbsensiHariIni() : null;

    const db = supabase();
    const hariIni = tanggalWibHariIni();
    // Riwayat: sendiri 60 hari terakhir; HR = semua orang 7 hari terakhir
    // (dashboard harian hanya butuh hari ini; rekap panjang lewat PDF).
    const awal = new Date(Date.now() - (mauSemua ? 7 : 60) * 86_400_000).toISOString().slice(0, 10);
    const susun = (kolom: string) => {
      let q = db.from("absensi").select(kolom).gte("tanggal_wib", awal).order("waktu", { ascending: false }).limit(mauSemua ? 3000 : 200);
      if (!mauSemua) q = q.eq("user_id", Number(user.id));
      return q;
    };
    let { data, error } = await susun(KOLOM);
    // sql/53 belum dijalankan → bentuk lama, supaya layar tetap hidup.
    if (error?.code === "42703") ({ data, error } = await susun(KOLOM_LAMA));
    if (error) {
      console.error("[absensi] baca:", error.message);
      throw new Error("Gagal memuat riwayat absensi.");
    }

    const daftar = await rapikan((data ?? []) as unknown as BarisAbsensi[]);

    // Kehadiran hari ini menurut SADAR — juga yang SAKIT/IZIN tanpa jam
    // masuk (tidak punya baris di `absensi`, tapi bukan alfa).
    if (!adaTabel) return jalurLangsung(user.id, mauSemua, hariIni, daftar);
    let qSadar = db
      .from("absensi_sadar")
      .select("user_id, hadir, status, tipe, verifikasi, jam_masuk, jam_pulang")
      .eq("tanggal", hariIni)
      .not("user_id", "is", null)
      .limit(3000);
    if (!mauSemua) qSadar = qSadar.eq("user_id", Number(user.id));
    const { data: hariIniSadar } = await qSadar;
    const kehadiran = (hariIniSadar ?? []).map((r) => ({
      user_id: String(r.user_id),
      jenis: jenisKehadiran({
        hadir: r.hadir === true,
        status: String(r.status ?? ""),
        tipe: String(r.tipe ?? ""),
        jamMasuk: String(r.jam_masuk ?? ""),
      }),
      status: String(r.status ?? ""),
      tipe: String(r.tipe ?? ""),
      verifikasi: String(r.verifikasi ?? ""),
      jam_masuk: r.jam_masuk ? String(r.jam_masuk) : null,
      jam_pulang: r.jam_pulang ? String(r.jam_pulang) : null,
    }));

    return {
      data: daftar,
      tanggal_hari_ini: hariIni,
      kehadiran_hari_ini: kehadiran,
      sadar: {
        siap: sadarSiap(),
        url: process.env.SADAR_APP_URL || process.env.SADAR_API_URL || SADAR_URL_BAWAAN,
        disinkron: sinkron?.jalan === true,
        galat: sinkron?.galat ?? "",
        tidak_cocok: mauSemua && sinkron?.jalan ? await jumlahTidakCocok(hariIni) : 0,
      },
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    await pastikanMasuk(request);
    throw Object.assign(
      new Error("Absen kini dilakukan di aplikasi SADAR (sadar-pri.id). SuperApp hanya menampilkan datanya."),
      { status: 410 },
    );
  });
}

type BarisRapi = Awaited<ReturnType<typeof rapikan>>[number];

/**
 * JALUR LANGSUNG (24 Sep 2026) — database belum punya tabel cermin SADAR
 * (sql/53). Absensi HARI INI disusun dari API SADAR (cache 60 dtk) dalam
 * bentuk yang sama dengan jalur normal: baris masuk/pulang untuk akun yang
 * cocok (email / pemetaan) + kehadiran_hari_ini (termasuk sakit/izin).
 * Tidak ada yang ditulis ke database.
 */
async function jalurLangsung(userId: string, mauSemua: boolean, hariIni: string, dariTabel: BarisRapi[]) {
  const siap = sadarSiap();
  const langsung = siap ? await sadarLangsung(hariIni) : { baris: [], galat: "SADAR_API_TOKEN belum diatur." };
  const peta = await petaKodeKeUser(langsung.baris);
  const semua = langsung.baris.filter((b) => peta.has(b.kode));
  const milik = mauSemua ? semua : semua.filter((b) => String(peta.get(b.kode)) === String(userId));

  // Nama/jabatan untuk baris yang ditampilkan.
  const ids = Array.from(new Set(milik.map((b) => peta.get(b.kode)!)));
  const orang = new Map<number, { nama: string; jabatan: string }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase().from("app_user").select("id, nama, jabatan").in("id", ids.slice(i, i + 200));
    for (const u of data ?? []) orang.set(Number(u.id), { nama: String(u.nama ?? ""), jabatan: String(u.jabatan ?? "") });
  }

  const baris: BarisRapi[] = [];
  for (const b of milik) {
    const uid = peta.get(b.kode)!;
    const o = orang.get(uid);
    const dasar = {
      user_id: String(uid),
      nama: o?.nama ?? b.nama,
      jabatan: o?.jabatan ?? "",
      tanggal_wib: b.tanggal,
      lat: null,
      lng: null,
      akurasi_m: null,
      alamat: null,
      foto_url: "",
      sumber: "sadar",
      kode_pegawai: b.kode,
      status_sadar: b.status,
      tipe_sadar: b.tipe,
      verifikasi_sadar: b.verifikasi,
    };
    const masuk = b.jamMasuk ? waktuWibKeIso(b.tanggal, b.jamMasuk) : null;
    const pulang = b.jamPulang ? waktuWibKeIso(b.tanggal, b.jamPulang) : null;
    if (masuk) baris.push({ ...dasar, id: `sadar-${b.kode}-masuk`, jenis: "masuk", waktu: masuk });
    if (pulang) baris.push({ ...dasar, id: `sadar-${b.kode}-pulang`, jenis: "pulang", waktu: pulang });
  }
  // Baris lama dari tabel tetap ikut (riwayat sebelum SADAR), kecuali hari
  // ini milik orang yang sudah terbaca dari SADAR — satu sumber per hari.
  const dariSadar = new Set(baris.map((b) => `${b.user_id}|${b.jenis}`));
  const lama = dariTabel.filter((b) => !(b.tanggal_wib === hariIni && dariSadar.has(`${b.user_id}|${b.jenis}`)));
  const daftar = [...baris, ...lama].sort((a, b) => (a.waktu < b.waktu ? 1 : a.waktu > b.waktu ? -1 : 0));

  const kehadiran = milik.map((b) => ({
    user_id: String(peta.get(b.kode)),
    jenis: jenisKehadiran({ hadir: b.hadir, status: b.status, tipe: b.tipe, jamMasuk: b.jamMasuk }),
    status: b.status,
    tipe: b.tipe,
    verifikasi: b.verifikasi,
    jam_masuk: b.jamMasuk || null,
    jam_pulang: b.jamPulang || null,
  }));

  return {
    data: daftar,
    tanggal_hari_ini: hariIni,
    kehadiran_hari_ini: kehadiran,
    sadar: {
      siap,
      url: process.env.SADAR_APP_URL || process.env.SADAR_API_URL || SADAR_URL_BAWAAN,
      disinkron: siap && !langsung.galat,
      galat: langsung.galat,
      tidak_cocok: mauSemua ? langsung.baris.length - semua.length : 0,
    },
  };
}

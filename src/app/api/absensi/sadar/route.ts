// GET /api/absensi/sadar?tanggal=YYYY-MM-DD&semua=1 — data SADAR apa adanya.
//
// Tampilan "Absensi SADAR" (14 Sep 2026): seluruh isinya dari SADAR —
// kode pegawai, nama, jam masuk/pulang, status, tipe, verifikasi —
// termasuk orang SADAR yang belum cocok dengan akun SuperApp mana pun
// (HR perlu melihatnya untuk memasangkan). Anggota biasa hanya melihat
// baris miliknya sendiri.
//
// Tanggal yang diminta dipastikan sudah ditarik: hari ini dikekang
// 60 dtk, lampau dianggap segar 6 jam (lib/absensi-sadar).
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { bolehDashboard } from "@/lib/dashboard-akses";
import { adalahHR } from "@/lib/hr";
import { sinkronAbsensiHariIni, sinkronAbsensiRentang } from "@/lib/absensi-sadar";
import { jenisKehadiran, labelSadar, sadarSiap } from "@/lib/sadar";
import { tanggalWibHariIni } from "@/lib/format";

export const dynamic = "force-dynamic";

const BOLEH_LIHAT_SEMUA = new Set(["admin_hr", "super_admin", "master", "superadmin"]);
/** Riwayat SADAR yang bisa diminta ke belakang — cukup untuk rekap bulanan. */
const MAKS_HARI_MUNDUR = 62;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });

    const url = new URL(request.url);
    const mauSemua = url.searchParams.get("semua") === "1";
    if (
      mauSemua &&
      !BOLEH_LIHAT_SEMUA.has(user.role) &&
      !adalahHR(user) &&
      !(await bolehDashboard(user, "absensi"))
    ) {
      throw Object.assign(new Error("Hanya HR yang boleh melihat absensi semua anggota."), { status: 403 });
    }

    const hariIni = tanggalWibHariIni();
    const diminta = (url.searchParams.get("tanggal") ?? "").trim();
    const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(diminta) ? diminta : hariIni;
    if (tanggal > hariIni) throw Object.assign(new Error("Tanggal belum tiba."), { status: 400 });
    const batasMundur = new Date(Date.parse(`${hariIni}T00:00:00Z`) - MAKS_HARI_MUNDUR * 86_400_000)
      .toISOString()
      .slice(0, 10);
    if (tanggal < batasMundur) {
      throw Object.assign(new Error(`Riwayat SADAR di sini maksimal ${MAKS_HARI_MUNDUR} hari ke belakang.`), { status: 400 });
    }

    let galat = "";
    if (sadarSiap()) {
      const hasil = tanggal === hariIni ? [await sinkronAbsensiHariIni()] : await sinkronAbsensiRentang(tanggal, tanggal, 1);
      galat = hasil.find((h) => h.galat)?.galat ?? "";
    } else {
      galat = "SADAR_API_TOKEN belum diatur.";
    }

    const db = supabase();
    let q = db
      .from("absensi_sadar")
      .select("kode_pegawai, tanggal, email, nama, user_id, hadir, status, tipe, jam_masuk, jam_pulang, verifikasi, disinkron_pada, app_user(nama, avatar_url)")
      .eq("tanggal", tanggal)
      .order("jam_masuk", { ascending: true, nullsFirst: false })
      .limit(3000);
    if (!mauSemua) q = q.eq("user_id", Number(user.id));
    const { data, error } = await q;
    if (error) {
      if (error.code === "42P01") {
        throw Object.assign(new Error("Tabel SADAR belum ada: jalankan pri-sql 53_absensi_sadar.sql dulu."), { status: 503 });
      }
      throw new Error("Gagal membaca data SADAR.");
    }

    type Baris = {
      kode_pegawai: string;
      tanggal: string;
      email: string;
      nama: string;
      user_id: number | null;
      hadir: boolean;
      status: string;
      tipe: string;
      jam_masuk: string | null;
      jam_pulang: string | null;
      verifikasi: string;
      disinkron_pada: string;
      app_user?: { nama?: string; avatar_url?: string } | { nama?: string; avatar_url?: string }[] | null;
    };
    const ringkasan = { jumlah: 0, cocok: 0, tidak_cocok: 0, hadir: 0, sakit: 0, izin: 0, alfa: 0 };
    let disinkron = "";
    const daftar = ((data ?? []) as unknown as Baris[]).map((b) => {
      const akun = Array.isArray(b.app_user) ? b.app_user[0] : b.app_user;
      const jenis = jenisKehadiran({
        hadir: b.hadir === true,
        status: String(b.status ?? ""),
        tipe: String(b.tipe ?? ""),
        jamMasuk: String(b.jam_masuk ?? ""),
      });
      ringkasan.jumlah += 1;
      if (b.user_id != null) ringkasan.cocok += 1;
      else ringkasan.tidak_cocok += 1;
      ringkasan[jenis] += 1;
      if (b.disinkron_pada > disinkron) disinkron = b.disinkron_pada;
      return {
        kode: b.kode_pegawai,
        tanggal: b.tanggal,
        nama: b.nama,
        // Email pegawai lain hanya untuk HR (bahan pencocokan).
        email: mauSemua ? b.email : "",
        user_id: b.user_id != null ? String(b.user_id) : null,
        nama_akun: akun?.nama ?? "",
        avatar_url: akun?.avatar_url ?? "",
        jenis,
        status: String(b.status ?? ""),
        tipe: String(b.tipe ?? ""),
        label: labelSadar(String(b.status ?? ""), String(b.tipe ?? "")),
        verifikasi: String(b.verifikasi ?? ""),
        label_verifikasi: labelSadar(String(b.verifikasi ?? ""), ""),
        jam_masuk: b.jam_masuk ? String(b.jam_masuk).slice(0, 5) : "",
        jam_pulang: b.jam_pulang ? String(b.jam_pulang).slice(0, 5) : "",
      };
    });
    return { tanggal, hari_ini: hariIni, data: daftar, ringkasan, disinkron_pada: disinkron, galat };
  });
}

// DATABASE ANGGOTA — detail aktivitas per pengguna, untuk pengurus.
//
// GET            → daftar pengguna aktif + ringkasan hari ini
// GET ?user=ID   → detail satu pengguna (7 hari terakhir):
//                  kewajiban komentar, KPI kerja, absensi, laporan video
//
// Akses: peran pengurus + sakelar fitur "database.detail" di matriks
// izin — jadi super admin bisa memilih peran mana saja yang boleh.
// Bawaan: super admin & admin HR nyala; ketua/admin TV/anggota mati
// (baris pengecualiannya di-seed lewat migrasi).
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { pastikanFiturAktif } from "@/lib/fitur-server";
import { deskripsiStruktur } from "@/lib/struktur";

export const dynamic = "force-dynamic";

const HARI_RIWAYAT = 7;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

function tanggalWib(geserHari = 0): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000 - geserHari * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function periodeHariIni(): string {
  return `${tanggalWib()} 00:00-23:59`;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    // Peran anggota tidak pernah boleh membuka data orang lain dari sini,
    // apa pun isi matriksnya — privasi absen/KPI bukan urusan sesama anggota.
    if (user.role === "anggota") {
      throw Object.assign(new Error("Anda tidak berhak membuka database anggota."), {
        status: 403,
      });
    }
    await pastikanFiturAktif(
      user,
      "database.detail",
      "Fitur database anggota sedang dimatikan untuk peran Anda.",
    );

    const db = supabase();
    const url = new URL(request.url);
    const idDiminta = Number(url.searchParams.get("user") ?? 0);
    const periode = periodeHariIni();
    const hariIni = tanggalWib();
    const batasTanggal = tanggalWib(HARI_RIWAYAT - 1);

    // ---------- Detail satu pengguna ----------
    if (idDiminta) {
      const { data: orang } = await db
        .from("app_user")
        .select("id, nama, avatar_url, jabatan, bidang_jabatan, divisi, sub_divisi, posisi_divisi, role, nomor_wa")
        .eq("id", idDiminta)
        .maybeSingle();
      if (!orang || orang.role === "master") {
        throw Object.assign(new Error("Pengguna tidak ditemukan."), { status: 404 });
      }

      const [rekap, kerja, absen, video] = await Promise.all([
        db
          .from("rekap")
          .select("akun_wajib, platform, id_postingan, jumlah_komentar, status")
          .eq("periode", periode)
          .eq("nama_kader", orang.nama),
        db
          .from("kerja_item")
          .select("tanggal_wib, deskripsi, jenis, status, kategori, tenggat")
          .eq("user_id", idDiminta)
          .gte("tanggal_wib", batasTanggal)
          .order("tanggal_wib", { ascending: false })
          .limit(100),
        db
          .from("absensi")
          .select("tanggal_wib, jenis, waktu, alamat")
          .eq("user_id", idDiminta)
          .gte("tanggal_wib", batasTanggal)
          .order("waktu", { ascending: false }),
        db
          .from("laporan_video")
          .select("tanggal_wib, platform, url_video, dibuat_pada")
          .eq("user_id", idDiminta)
          .gte("tanggal_wib", batasTanggal)
          .order("dibuat_pada", { ascending: false })
          .limit(60),
      ]);

      // Kewajiban komentar hari ini, dirangkum per akun wajib
      const perAkun = new Map<string, { total: number; sudah: number }>();
      for (const r of rekap.data ?? []) {
        const kunci = `${r.akun_wajib} (${r.platform})`;
        const p = perAkun.get(kunci) ?? { total: 0, sudah: 0 };
        p.total += 1;
        if ((r.jumlah_komentar ?? 0) > 0) p.sudah += 1;
        perAkun.set(kunci, p);
      }

      // KPI kerja per tanggal (harian saja — rencana besar lintas hari)
      const kerjaPerHari = new Map<string, { total: number; selesai: number }>();
      for (const k of kerja.data ?? []) {
        if (k.kategori !== "harian" || k.jenis !== "rencana") continue;
        const p = kerjaPerHari.get(k.tanggal_wib) ?? { total: 0, selesai: 0 };
        p.total += 1;
        if (k.status === "selesai") p.selesai += 1;
        kerjaPerHari.set(k.tanggal_wib, p);
      }

      return {
        pengguna: {
          id: String(orang.id),
          nama: orang.nama,
          avatar_url: orang.avatar_url ?? "",
          struktur: deskripsiStruktur(orang),
          nomor_wa: orang.nomor_wa ?? "",
        },
        hari_ini: hariIni,
        komentar: {
          periode,
          total: (rekap.data ?? []).length,
          sudah: (rekap.data ?? []).filter((r) => (r.jumlah_komentar ?? 0) > 0).length,
          per_akun: [...perAkun.entries()].map(([akun, p]) => ({ akun, ...p })),
        },
        kerja: [...kerjaPerHari.entries()]
          .map(([tanggal, p]) => ({
            tanggal,
            ...p,
            persen: p.total ? Math.round((100 * p.selesai) / p.total) : 0,
          }))
          .sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1)),
        kerja_item: (kerja.data ?? []).slice(0, 40),
        absensi: absen.data ?? [],
        video: {
          total: (video.data ?? []).length,
          hari_ini: (video.data ?? []).filter((v) => v.tanggal_wib === hariIni).length,
          daftar: video.data ?? [],
        },
      };
    }

    // ---------- Daftar pengguna + ringkasan hari ini ----------
    const [{ data: daftar }, rekapHariIni, absenHariIni, videoHariIni] = await Promise.all([
      db
        .from("app_user")
        .select("id, nama, avatar_url, jabatan, bidang_jabatan, divisi, sub_divisi, posisi_divisi")
        .eq("aktif", true)
        .eq("status", "aktif")
        .neq("role", "master")
        .order("nama"),
      db.from("rekap").select("nama_kader, jumlah_komentar").eq("periode", periode),
      db
        .from("absensi")
        .select("user_id")
        .eq("tanggal_wib", hariIni)
        .eq("jenis", "masuk"),
      db.from("laporan_video").select("user_id").eq("tanggal_wib", hariIni),
    ]);

    const komentarPer = new Map<string, { total: number; sudah: number }>();
    for (const r of rekapHariIni.data ?? []) {
      const p = komentarPer.get(r.nama_kader) ?? { total: 0, sudah: 0 };
      p.total += 1;
      if ((r.jumlah_komentar ?? 0) > 0) p.sudah += 1;
      komentarPer.set(r.nama_kader, p);
    }
    const sudahMasuk = new Set((absenHariIni.data ?? []).map((a) => String(a.user_id)));
    const videoPer = new Map<string, number>();
    for (const v of videoHariIni.data ?? []) {
      const id = String(v.user_id);
      videoPer.set(id, (videoPer.get(id) ?? 0) + 1);
    }

    return {
      hari_ini: hariIni,
      data: (daftar ?? []).map((u) => {
        const kom = komentarPer.get(u.nama) ?? { total: 0, sudah: 0 };
        return {
          id: String(u.id),
          nama: u.nama,
          avatar_url: u.avatar_url ?? "",
          struktur: deskripsiStruktur(u),
          masuk: sudahMasuk.has(String(u.id)),
          video: videoPer.get(String(u.id)) ?? 0,
          komentar_sudah: kom.sudah,
          komentar_total: kom.total,
        };
      }),
    };
  });
}

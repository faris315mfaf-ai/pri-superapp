// GET /api/dashboard/tren — deret waktu untuk grafik dashboard (baca-saja).
//
// ?jenis=absensi&hari=7|30    → per hari: hadir, telat, izin (+ total anggota)
// ?jenis=kepatuhan&hari=7|30  → per hari: % komentar terpenuhi (+ donat hari
//                               ini + rincian per akun wajib hari ini)
//
// Dibuat terpisah dari endpoint operasional (absensi/rekap) supaya layar
// dashboard tidak memaksa endpoint harian menyeret riwayat berhari-hari.
// Akses: HR / master / super_admin ATAU jabatan yang punya dashboard terkait.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { bolehDashboard } from "@/lib/dashboard-akses";
import { adalahHR } from "@/lib/hr";
import { tepatWaktu } from "@/lib/absensi-status";
import { labelPeriodeUntukTanggal, periodeSaatIni } from "@/lib/periode-qc";

export const dynamic = "force-dynamic";

const HR = new Set(["master", "super_admin", "admin_hr"]);

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

function tanggalWibSekarang(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

function tanggalMundur(tanggal: string, mundur: number): string {
  const t = new Date(`${tanggal}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - mundur);
  return t.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });

    const url = new URL(request.url);
    const jenis = url.searchParams.get("jenis") ?? "";
    const hari = url.searchParams.get("hari") === "30" ? 30 : 7;
    const hariIni = tanggalWibSekarang();
    const awal = tanggalMundur(hariIni, hari - 1);
    const db = supabase();

    // Gerbang mengikuti sub-dashboard terkait.
    const kunciDash = jenis === "absensi" ? "absensi" : "kepatuhan";
    if (!HR.has(user.role) && !adalahHR(user) && !(await bolehDashboard(user, kunciDash))) {
      throw Object.assign(new Error("Jabatan Anda tidak punya akses dashboard ini."), {
        status: 403,
      });
    }

    // ---------- Tren ABSENSI ----------
    if (jenis === "absensi") {
      const [{ data: baris }, { data: izin }, { count: totalAnggota }] = await Promise.all([
        db
          .from("absensi")
          .select("user_id, jenis, waktu, tanggal_wib")
          .eq("jenis", "masuk")
          .gte("tanggal_wib", awal)
          .lte("tanggal_wib", hariIni)
          .range(0, 9999),
        db
          .from("perizinan")
          .select("tanggal_wib")
          .eq("status", "disetujui")
          .gte("tanggal_wib", awal)
          .lte("tanggal_wib", hariIni),
        db
          .from("app_user")
          .select("id", { count: "exact", head: true })
          .eq("aktif", true)
          .eq("status", "aktif")
          .neq("role", "master"),
      ]);

      const perHari = new Map<string, { hadir: number; telat: number }>();
      for (const b of baris ?? []) {
        const t = String(b.tanggal_wib);
        const ada = perHari.get(t) ?? { hadir: 0, telat: 0 };
        ada.hadir += 1;
        if (b.waktu && !tepatWaktu(String(b.waktu))) ada.telat += 1;
        perHari.set(t, ada);
      }
      const izinPerHari = new Map<string, number>();
      for (const b of izin ?? []) {
        const t = String(b.tanggal_wib);
        izinPerHari.set(t, (izinPerHari.get(t) ?? 0) + 1);
      }

      const tren: { tanggal: string; hadir: number; telat: number; izin: number }[] = [];
      for (let i = hari - 1; i >= 0; i--) {
        const t = tanggalMundur(hariIni, i);
        const d = perHari.get(t) ?? { hadir: 0, telat: 0 };
        tren.push({ tanggal: t, hadir: d.hadir, telat: d.telat, izin: izinPerHari.get(t) ?? 0 });
      }
      return { tren, total_anggota: totalAnggota ?? 0 };
    }

    // ---------- Tren KEPATUHAN KOMEN ----------
    if (jenis === "kepatuhan") {
      // Jendela QC kini 17:00-16:59 (31 Agu 2026). Riwayat bisa berlabel
      // format LAMA (00:00-23:59) — keduanya diikutkan lalu digabung per
      // TANGGAL supaya grafik mulus melewati hari pergantian aturan.
      const daftarTanggal: string[] = [];
      for (let i = hari - 1; i >= 0; i--) daftarTanggal.push(tanggalMundur(hariIni, i));
      const daftarPeriode = daftarTanggal.flatMap((t) => labelPeriodeUntukTanggal(t));
      const periodeHariIni = periodeSaatIni();

      const [{ data: perKader }, { data: rekapHariIni }] = await Promise.all([
        // Agregat per kader per periode (view DB) — ratusan baris, ringan.
        db
          .from("v_app_kepatuhan_kader")
          .select("periode, total, sudah")
          .in("periode", daftarPeriode)
          .range(0, 9999),
        // Rincian HARI INI per akun wajib (untuk grafik bar per akun).
        db
          .from("rekap")
          .select("akun_wajib, platform, status")
          .eq("periode", periodeHariIni)
          .range(0, 9999),
      ]);

      const perPeriode = new Map<string, { total: number; sudah: number }>();
      let patuhPenuh = 0;
      let belumPenuh = 0;
      for (const b of perKader ?? []) {
        const p = String(b.periode);
        const ada = perPeriode.get(p) ?? { total: 0, sudah: 0 };
        ada.total += Number(b.total) || 0;
        ada.sudah += Number(b.sudah) || 0;
        perPeriode.set(p, ada);
        if (p === periodeHariIni && Number(b.total) > 0) {
          if (Number(b.sudah) >= Number(b.total)) patuhPenuh += 1;
          else belumPenuh += 1;
        }
      }
      const tren = daftarTanggal.map((t) => {
        // Gabungkan kedua label (baru + lama) milik tanggal yang sama.
        const d = { total: 0, sudah: 0 };
        for (const label of labelPeriodeUntukTanggal(t)) {
          const x = perPeriode.get(label);
          if (x) {
            d.total += x.total;
            d.sudah += x.sudah;
          }
        }
        return {
          tanggal: t,
          persen: d.total > 0 ? Math.round((d.sudah / d.total) * 100) : 0,
          sudah: d.sudah,
          total: d.total,
        };
      });

      // Bar per akun wajib hari ini: % komentar terpenuhi per akun.
      const perAkun = new Map<string, { total: number; sudah: number; platform: string }>();
      for (const b of rekapHariIni ?? []) {
        const kunci = `${b.akun_wajib}|${b.platform}`;
        const ada = perAkun.get(kunci) ?? {
          total: 0,
          sudah: 0,
          platform: String(b.platform),
        };
        ada.total += 1;
        if (b.status === "Comply") ada.sudah += 1;
        perAkun.set(kunci, ada);
      }
      const perAkunWajib = Array.from(perAkun.entries()).map(([kunci, d]) => ({
        akun: kunci.split("|")[0],
        platform: d.platform,
        persen: d.total > 0 ? Math.round((d.sudah / d.total) * 100) : 0,
        sudah: d.sudah,
        total: d.total,
      }));

      return {
        tren,
        hari_ini: { patuh_penuh: patuhPenuh, belum_penuh: belumPenuh },
        per_akun_wajib: perAkunWajib.sort((a, b) => a.akun.localeCompare(b.akun)),
      };
    }

    throw Object.assign(new Error("jenis harus absensi atau kepatuhan."), { status: 400 });
  });
}

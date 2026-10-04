// /api/tvr/rangkuman — RANGKUMAN LINK HARIAN (TVR Saya, 3 Sep 2026).
// Semua tautan video yang tercatat atas nama pengguna pada satu tanggal WIB
// (laporan_video: otomatis dari unggahan aplikasi + laporan manual yang
// langsung tercatat), dikelompokkan per sosmed — bahan laporan WhatsApp.
// GET ?tanggal=YYYY-MM-DD (bawaan: hari ini WIB)
//
// PERBAIKAN 4 Sep 2026 (bug: "video sudah diupload tapi laporan kosong"):
// tautan hasil unggahan baru masuk laporan_video lewat rekonsiliasi KPI, yang
// dulu HANYA terpicu saat layar Riwayat dibuka. Anggota yang videonya
// diunggahkan admin (Studio/Siaran Serentak) sering tidak pernah membuka layar
// itu, jadi rangkumannya selalu kosong. Sekarang rekonsiliasi DITUNGGU di sini
// dulu (dengan anggaran waktu) sebelum laporan disusun.
import { after } from "next/server";
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { targetKendali, userEfektifTvr } from "@/lib/sebagai";
import { pastikanMasuk } from "@/lib/sesi";
import { rekonsiliasiKpiOtomatis } from "@/lib/kpi-otomatis";
import { jalankanLatar } from "@/lib/penjaga-supabase";
import { luluskanLaporanTertahan } from "@/lib/laporan-tertahan";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
/** Batas waktu rekonsiliasi supaya tombol Generate tidak terasa menggantung. */
const ANGGARAN_REKONSILIASI_MS = 30_000;

const URUTAN_PLATFORM = [
  "instagram",
  "tiktok",
  "twitter",
  "facebook",
  "youtube",
  "threads",
] as const;

function tanggalWib(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  return bungkus(async () => {
    // 4 Sep 2026: admin PALUGODAM bisa mengendalikan akun anggota (header X-Sebagai).
    // 6 Sep 2026: atau lewat ?user_id= (rekap per anggota di panel admin PALUGODAM).
    const paramUser = Number(new URL(request.url).searchParams.get("user_id") ?? 0);
    const user = paramUser > 0 ? await targetKendali(await pastikanMasuk(request), paramUser) : await userEfektifTvr(request);
    const db = supabase();
    const uid = Number(user.id);
    const mentah = (
      new URL(request.url).searchParams.get("tanggal") ?? ""
    ).trim();
    const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(mentah) ? mentah : tanggalWib();

    // Baca tautan yang SUDAH tercatat dulu. Dulu GET ini menunggu
    // rekonsiliasi sampai 30 dtk — proxy/Caddy sering memutus, jadi
    // rangkuman hari ini tampil kosong padahal barisnya sudah ada.
    // Rekonsiliasi tetap jalan setelah respons; klien menyegarkan.
    // (Rekonsiliasi memanggil upload-post — tidak untuk pengguna virtual uji beban.)
    if (tanggal === tanggalWib() && !user.ujiBeban) {
      after(() =>
        jalankanLatar("rekonsiliasi-kpi-layar", () => rekonsiliasiKpiOtomatis(uid, { anggaranMs: ANGGARAN_REKONSILIASI_MS })),
      );
    }

    // ACC HR ditiadakan (23 Sep 2026): antrean lama orang ini diluluskan
    // dulu supaya link manualnya ikut masuk rangkuman.
    // Uji beban harus murni membaca: antrean lama tidak diproses pengguna virtual.
    if (!user.ujiBeban) await luluskanLaporanTertahan(uid, 50);
    const { data: tercatat } = await db
      .from("laporan_video")
      .select("platform, url_video, dibuat_pada")
      .eq("user_id", uid)
      .eq("tanggal_wib", tanggal)
      .order("dibuat_pada", { ascending: true })
      .limit(500);

    const perPlatform: Record<string, string[]> = {};
    for (const p of URUTAN_PLATFORM) perPlatform[p] = [];
    let jumlah = 0;
    for (const b of tercatat ?? []) {
      const pf = String(b.platform ?? "").toLowerCase();
      const url = String(b.url_video ?? "").trim();
      if (!url) continue;
      if (!perPlatform[pf]) perPlatform[pf] = [];
      if (perPlatform[pf].includes(url)) continue;
      perPlatform[pf].push(url);
      jumlah += 1;
    }
    return {
      nama: user.nama,
      tanggal,
      per_platform: perPlatform,
      jumlah,
      // Tetap dikirim (kosong) supaya klien lama tidak rusak.
      menunggu: [] as { platform: string; url: string }[],
    };
  });
}

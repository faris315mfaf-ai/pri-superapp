// GET /api/dashboard/tv — data sub-dashboard "TV Rakyat"
// (fitur 1.19/3.3.d). BACA-SAJA.
//
// ?hari=7|30|90     → jendela waktu (bawaan 7 hari terakhir)
// ?aktivitas=1      → HANYA umpan aktivitas terbaru (polling 30 detik
//                     dari klien — dibuat ringan, satu kueri kecil)
//
// Akses: HR (admin_hr/super_admin/master), admin_tv, atau jabatan
// yang diberi master akses dashboard "tv".
//
// Semua angka dihitung dari data yang BENAR-BENAR ada: pipeline
// video_antrian (+ ayrshare_hasil per platform) dan interaksi_video
// (komen/share di dalam aplikasi). Tidak ada metrik tebak-tebakan.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { bolehDashboard } from "@/lib/dashboard-akses";

export const dynamic = "force-dynamic";

const LANGSUNG_BOLEH = new Set(["master", "super_admin", "admin_hr", "admin_tv"]);

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

/** Tanggal WIB (YYYY-MM-DD) dari sebuah ISO timestamp. */
function tanggalWib(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t + 7 * 3600_000).toISOString().slice(0, 10);
}

function tanggalWibSekarang(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

function tanggalMundur(tanggal: string, mundur: number): string {
  const t = new Date(`${tanggal}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - mundur);
  return t.toISOString().slice(0, 10);
}

type HasilAyr = { status?: string; platform?: string; postUrl?: string };

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (!LANGSUNG_BOLEH.has(user.role) && !(await bolehDashboard(user, "tv"))) {
      throw Object.assign(
        new Error("Jabatan Anda tidak punya akses dashboard TV Rakyat."),
        { status: 403 },
      );
    }

    const url = new URL(request.url);
    const hari = [7, 30, 90].includes(Number(url.searchParams.get("hari")))
      ? Number(url.searchParams.get("hari"))
      : 7;
    const hariIni = tanggalWibSekarang();
    const awal = tanggalMundur(hariIni, hari - 1);
    // Batas bawah kueri dalam UTC: awal hari `awal` WIB.
    const batasIso = new Date(
      Date.parse(`${awal}T00:00:00Z`) - 7 * 3600_000,
    ).toISOString();
    const db = supabase();

    // --- Umpan aktivitas ringan (polling 30 detik) ---
    if (url.searchParams.get("aktivitas") === "1") {
      return { aktivitas: await ambilAktivitas(db) };
    }

    const [{ data: video }, { data: interaksi }] = await Promise.all([
      db
        .from("video_antrian")
        .select(
          "id, kode, judul, status, thumbnail_url, jam_tanggal, diunggah_pada, digenerate_oleh, digenerate_user_id, diupload_oleh, diupload_oleh_id, platform_terunggah, ayrshare_hasil, pesan_error",
        )
        .gte("jam_tanggal", batasIso)
        .order("id", { ascending: false })
        .limit(500),
      db
        .from("interaksi_video")
        .select("video_kode, jenis, pada")
        .gte("pada", batasIso)
        .limit(1000),
    ]);

    // --- Ringkasan ---
    const semua = video ?? [];
    const terunggah = semua.filter((v) => v.diunggah_pada);
    let postSukses = 0;
    let postGagal = 0;
    // Per platform: total sukses/gagal + sparkline unggahan per hari.
    const perPlatform = new Map<
      string,
      { platform: string; sukses: number; gagal: number; perHari: Map<string, number> }
    >();
    for (const v of semua) {
      const hasil = (Array.isArray(v.ayrshare_hasil) ? v.ayrshare_hasil : []) as HasilAyr[];
      const t = tanggalWib(v.diunggah_pada as string | null);
      for (const h of hasil) {
        const p = String(h.platform ?? "").toLowerCase();
        if (!p) continue;
        const ada =
          perPlatform.get(p) ?? { platform: p, sukses: 0, gagal: 0, perHari: new Map() };
        if (h.status === "success") {
          ada.sukses += 1;
          postSukses += 1;
          if (t) ada.perHari.set(t, (ada.perHari.get(t) ?? 0) + 1);
        } else {
          ada.gagal += 1;
          postGagal += 1;
        }
        perPlatform.set(p, ada);
      }
    }

    // --- Tren produksi & unggahan per hari ---
    const trenPer = new Map<string, { produksi: number; unggah: number }>();
    for (let i = hari - 1; i >= 0; i--) {
      trenPer.set(tanggalMundur(hariIni, i), { produksi: 0, unggah: 0 });
    }
    for (const v of semua) {
      const tp = tanggalWib(v.jam_tanggal as string | null);
      if (tp && trenPer.has(tp)) trenPer.get(tp)!.produksi += 1;
      const tu = tanggalWib(v.diunggah_pada as string | null);
      if (tu && trenPer.has(tu)) trenPer.get(tu)!.unggah += 1;
    }

    // --- Interaksi per hari + per video ---
    const interaksiPerHari = new Map<string, number>();
    const interaksiPerVideo = new Map<string, { komen: number; share: number }>();
    for (const i of interaksi ?? []) {
      const t = tanggalWib(i.pada as string);
      if (t) interaksiPerHari.set(t, (interaksiPerHari.get(t) ?? 0) + 1);
      const kode = String(i.video_kode ?? "");
      if (!kode) continue;
      const ada = interaksiPerVideo.get(kode) ?? { komen: 0, share: 0 };
      if (i.jenis === "komen") ada.komen += 1;
      else ada.share += 1;
      interaksiPerVideo.set(kode, ada);
    }

    // --- Video populer: diurutkan interaksi dalam aplikasi ---
    const populer = terunggah
      .map((v) => {
        const it = interaksiPerVideo.get(String(v.kode)) ?? { komen: 0, share: 0 };
        return {
          kode: String(v.kode ?? v.id),
          judul: (v.judul as string) || "(tanpa judul)",
          thumbnail_url: (v.thumbnail_url as string) ?? "",
          diunggah_pada: v.diunggah_pada as string,
          platform: ((v.platform_terunggah as string[]) ?? []).length,
          komen: it.komen,
          share: it.share,
          skor: it.komen + it.share,
        };
      })
      .sort((a, b) => b.skor - a.skor || Date.parse(b.diunggah_pada) - Date.parse(a.diunggah_pada))
      .slice(0, 8);

    // --- Distribusi status pipeline ---
    const statusPer = new Map<string, number>();
    for (const v of semua) {
      const s = String(v.status ?? "?");
      statusPer.set(s, (statusPer.get(s) ?? 0) + 1);
    }

    const sparkHari: string[] = [];
    for (let i = hari - 1; i >= 0; i--) sparkHari.push(tanggalMundur(hariIni, i));

    return {
      hari,
      ringkasan: {
        produksi: semua.length,
        terunggah: terunggah.length,
        post_sukses: postSukses,
        post_gagal: postGagal,
        interaksi: (interaksi ?? []).length,
        // Identitas "produser" tersebar di 4 kolom tergantung jalur
        // (generate otomatis vs upload manual) — ambil yang mana pun
        // yang terisi. Data nyata: diupload_oleh(_id) yang terisi.
        produser: new Set(
          semua
            .map((v) =>
              String(
                v.diupload_oleh_id ??
                  v.diupload_oleh ??
                  v.digenerate_user_id ??
                  v.digenerate_oleh ??
                  "",
              ),
            )
            .filter(Boolean),
        ).size,
      },
      tren: Array.from(trenPer.entries()).map(([tanggal, n]) => ({ tanggal, ...n })),
      interaksi_harian: sparkHari.map((t) => ({
        tanggal: t,
        jumlah: interaksiPerHari.get(t) ?? 0,
      })),
      per_platform: Array.from(perPlatform.values())
        .sort((a, b) => b.sukses - a.sukses)
        .map((p) => ({
          platform: p.platform,
          sukses: p.sukses,
          gagal: p.gagal,
          sparkline: sparkHari.map((t) => ({ tanggal: t, jumlah: p.perHari.get(t) ?? 0 })),
        })),
      status: Array.from(statusPer.entries()).map(([nama, jumlah]) => ({ nama, jumlah })),
      populer,
      aktivitas: await ambilAktivitas(db),
    };
  });
}

/**
 * 15 kejadian terbaru pipeline & interaksi — dipakai umpan "Aktivitas
 * Terkini" yang disegarkan klien tiap 30 detik.
 */
async function ambilAktivitas(db: ReturnType<typeof supabase>) {
  const [{ data: videoBaru }, { data: interaksiBaru }] = await Promise.all([
    db
      .from("video_antrian")
      .select("kode, judul, status, diunggah_pada, updated_at, digenerate_oleh")
      .order("updated_at", { ascending: false })
      .limit(10),
    db
      .from("interaksi_video")
      .select("jenis, pada, video_kode, app_user(nama)")
      .order("pada", { ascending: false })
      .limit(10),
  ]);

  type Kejadian = { waktu: string; teks: string; jenis: string };
  const kejadian: Kejadian[] = [];
  for (const v of videoBaru ?? []) {
    const waktu = String(v.diunggah_pada ?? v.updated_at ?? "");
    if (!waktu) continue;
    kejadian.push({
      waktu,
      jenis: v.diunggah_pada ? "unggah" : "pipeline",
      teks: v.diunggah_pada
        ? `Video "${String(v.judul ?? "").slice(0, 60)}" terunggah ke sosmed`
        : `Video "${String(v.judul ?? "").slice(0, 60)}" — ${String(v.status ?? "")}`,
    });
  }
  for (const i of interaksiBaru ?? []) {
    const embedded = i.app_user as { nama?: string } | { nama?: string }[] | null;
    const nama = (Array.isArray(embedded) ? embedded[0]?.nama : embedded?.nama) ?? "Anggota";
    kejadian.push({
      waktu: String(i.pada),
      jenis: String(i.jenis),
      teks: `${nama} ${i.jenis === "komen" ? "mengomentari" : "membagikan"} video ${String(i.video_kode ?? "")}`,
    });
  }
  return kejadian
    .sort((a, b) => Date.parse(b.waktu) - Date.parse(a.waktu))
    .slice(0, 15);
}

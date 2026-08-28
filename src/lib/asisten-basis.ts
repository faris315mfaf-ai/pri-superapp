// ============================================================
// Basis Pengetahuan Asisten AI (fitur 1.20.4) — SISI SERVER.
//
// SATU snapshot terstruktur berisi ringkasan SELURUH data penting
// aplikasi. Inilah "database besar khusus" yang dilihat AI secara
// utuh (lewat alat baca_basis_pengetahuan), melengkapi alat detail
// yang sudah ada.
//
// Kesegaran: di-refresh OTOMATIS saat dibaca bila umurnya sudah > 60
// menit (pola tanpa-cron rumah) — jadi setiap kali AI membacanya,
// datanya dijamin ≤ 1 jam. Master juga bisa memaksa refresh & menulis
// CATATAN MANUAL (fakta tambahan) yang selalu digabung segar.
//
// Aman untuk semua pemegang akses chatbot: hanya AGREGAT & nama —
// TANPA nomor WA / email / kontak pribadi (itu tetap lewat alat
// khusus master detail_anggota).
// ============================================================
import { supabase } from "@/lib/supabase";
import { DIVISI } from "@/lib/struktur";

export const UMUR_SEGAR_MENIT = 60;
const TARGET_VIDEO_BAWAAN = 5;

function tanggalWibSekarang(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

/** Catatan manual master (fakta tambahan) dari pengaturan_sistem. */
export async function catatanBasis(): Promise<string> {
  try {
    const { data } = await supabase()
      .from("pengaturan_sistem")
      .select("nilai")
      .eq("kunci", "asisten_catatan")
      .maybeSingle();
    return String(data?.nilai ?? "");
  } catch {
    return "";
  }
}

/**
 * Susun snapshot menyeluruh. Tiap bagian dibungkus try/catch supaya
 * satu kegagalan tidak menggagalkan seluruh snapshot (tahan-banting).
 */
export async function bangunSnapshot(): Promise<Record<string, unknown>> {
  const db = supabase();
  const hariIni = tanggalWibSekarang();
  const snap: Record<string, unknown> = { dibuat_pada: new Date().toISOString(), tanggal: hariIni };

  // --- Roster & agregasi keanggotaan ---
  try {
    const { data: roster } = await db
      .from("app_user")
      .select("id, role, divisi, jabatan, status, aktif, kpi_video, last_login_at, google_linked, wa_terverifikasi")
      .neq("role", "master")
      .limit(2000);
    const aktif = (roster ?? []).filter((u) => u.aktif && u.status === "aktif");
    const perPeran: Record<string, number> = {};
    const perDivisi: Record<string, number> = {};
    for (const u of aktif) {
      perPeran[String(u.role)] = (perPeran[String(u.role)] ?? 0) + 1;
      const d = (u.divisi as string) || "(tanpa divisi)";
      perDivisi[d] = (perDivisi[d] ?? 0) + 1;
    }
    snap.keanggotaan = {
      total_aktif: aktif.length,
      menunggu_persetujuan: (roster ?? []).filter((u) => u.status === "menunggu").length,
      nonaktif: (roster ?? []).filter((u) => !u.aktif || u.status === "ditolak").length,
      per_peran: perPeran,
      per_divisi: perDivisi,
      sudah_login_aplikasi: aktif.filter((u) => u.last_login_at != null).length,
      google_tertaut: aktif.filter((u) => u.google_linked === true).length,
      wa_terverifikasi: aktif.filter((u) => u.wa_terverifikasi === true).length,
    };
    // Simpan roster ringan untuk bagian KPI di bawah.
    snap.__roster = aktif;
  } catch (e) {
    snap.keanggotaan = { galat: String(e).slice(0, 120) };
  }

  const roster = (snap.__roster as { id: number; divisi: string; kpi_video: number | null }[]) ?? [];
  delete snap.__roster;

  // --- Absensi hari ini ---
  try {
    const [{ data: absen }, { data: izin }] = await Promise.all([
      db.from("absensi").select("user_id, jenis").eq("tanggal_wib", hariIni).limit(2000),
      db
        .from("perizinan")
        .select("user_id, jenis")
        .eq("tanggal_wib", hariIni)
        .eq("status", "disetujui")
        .limit(1000),
    ]);
    const hadir = new Set((absen ?? []).filter((a) => a.jenis === "masuk").map((a) => Number(a.user_id)));
    const bebas = izin ?? [];
    const total = roster.length;
    snap.absensi_hari_ini = {
      hadir: hadir.size,
      izin: bebas.filter((b) => b.jenis === "izin").length,
      sakit: bebas.filter((b) => b.jenis === "sakit").length,
      belum_absen: Math.max(0, total - hadir.size - bebas.length),
      total_anggota: total,
    };
  } catch (e) {
    snap.absensi_hari_ini = { galat: String(e).slice(0, 120) };
  }

  // --- KPI video hari ini ---
  try {
    const { data: video } = await db
      .from("v_app_video_harian_user")
      .select("user_id, jumlah")
      .eq("tanggal_wib", hariIni);
    const per = new Map((video ?? []).map((v) => [Number(v.user_id), Number(v.jumlah)]));
    let tercapai = 0;
    let totalVideo = 0;
    const perDivisi: Record<string, { video: number; orang: number }> = {};
    for (const u of roster) {
      const target = u.kpi_video != null ? Number(u.kpi_video) : TARGET_VIDEO_BAWAAN;
      const jml = per.get(Number(u.id)) ?? 0;
      totalVideo += jml;
      if (jml >= target) tercapai += 1;
      const d = u.divisi || "(tanpa divisi)";
      const b = (perDivisi[d] ??= { video: 0, orang: 0 });
      b.video += jml;
      b.orang += 1;
    }
    snap.kpi_video_hari_ini = {
      target_default: TARGET_VIDEO_BAWAAN,
      total_video: totalVideo,
      anggota_tercapai: tercapai,
      anggota_belum: roster.length - tercapai,
      per_divisi: Object.entries(perDivisi).map(([divisi, v]) => ({ divisi, ...v })),
    };
  } catch (e) {
    snap.kpi_video_hari_ini = { galat: String(e).slice(0, 120) };
  }

  // --- Kepatuhan komentar hari ini ---
  try {
    const periode = `${hariIni} 00:00-23:59`;
    const { data } = await db
      .from("v_app_kepatuhan_kader")
      .select("nama_kader, sudah, total")
      .eq("periode", periode);
    const baris = data ?? [];
    const penuh = baris.filter((b) => Number(b.sudah) >= Number(b.total) && Number(b.total) > 0);
    snap.kepatuhan_hari_ini = {
      periode,
      total_kader: baris.length,
      sudah_penuh: penuh.length,
      belum_penuh: baris.length - penuh.length,
      catatan: baris.length === 0 ? "Analisis komentar hari ini belum dijalankan." : undefined,
    };
  } catch (e) {
    snap.kepatuhan_hari_ini = { galat: String(e).slice(0, 120) };
  }

  // --- TV Rakyat 7 hari ---
  try {
    const batas = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const [{ data: vids }, { data: interaksi }] = await Promise.all([
      db.from("video_antrian").select("diunggah_pada, ayrshare_hasil").gte("jam_tanggal", batas).limit(500),
      db.from("interaksi_video").select("jenis").gte("pada", batas).limit(2000),
    ]);
    let sukses = 0;
    let gagal = 0;
    const perPlatform: Record<string, { sukses: number; gagal: number }> = {};
    for (const v of vids ?? []) {
      for (const h of (Array.isArray(v.ayrshare_hasil) ? v.ayrshare_hasil : []) as {
        status?: string;
        platform?: string;
      }[]) {
        const p = String(h.platform ?? "?").toLowerCase();
        const b = (perPlatform[p] ??= { sukses: 0, gagal: 0 });
        if (h.status === "success") {
          sukses += 1;
          b.sukses += 1;
        } else {
          gagal += 1;
          b.gagal += 1;
        }
      }
    }
    snap.tv_rakyat_7hari = {
      video_dibuat: (vids ?? []).length,
      video_terunggah: (vids ?? []).filter((v) => v.diunggah_pada).length,
      post_sukses: sukses,
      post_gagal: gagal,
      interaksi_anggota: (interaksi ?? []).length,
      per_platform: Object.entries(perPlatform).map(([platform, v]) => ({ platform, ...v })),
    };
  } catch (e) {
    snap.tv_rakyat_7hari = { galat: String(e).slice(0, 120) };
  }

  // --- Koin (total beredar + 5 saldo teratas) ---
  try {
    const { data: saldo } = await db
      .from("v_app_koin_saldo")
      .select("user_id, saldo")
      .order("saldo", { ascending: false })
      .limit(200);
    const total = (saldo ?? []).reduce((s, r) => s + Number(r.saldo), 0);
    const top = (saldo ?? []).slice(0, 5);
    const ids = top.map((t) => Number(t.user_id));
    const { data: nama } = ids.length
      ? await db.from("app_user").select("id, nama").in("id", ids)
      : { data: [] };
    const petaNama = new Map((nama ?? []).map((n) => [Number(n.id), n.nama as string]));
    snap.koin = {
      total_beredar: total,
      top5: top.map((t) => ({ nama: petaNama.get(Number(t.user_id)) ?? "?", saldo: Number(t.saldo) })),
    };
  } catch (e) {
    snap.koin = { galat: String(e).slice(0, 120) };
  }

  // --- Rencana KPI aktif (kpi_tugas) ---
  try {
    const { data } = await db
      .from("kpi_tugas")
      .select("judul, divisi, tenggat, prioritas, progress")
      .eq("status", "aktif")
      .order("tenggat", { ascending: true })
      .limit(30);
    snap.rencana_kpi_aktif = data ?? [];
  } catch (e) {
    snap.rencana_kpi_aktif = { galat: String(e).slice(0, 120) };
  }

  // --- Acara mendatang ---
  try {
    const { data } = await db
      .from("acara_penting")
      .select("judul, tanggal, keterangan")
      .gte("tanggal", hariIni)
      .order("tanggal", { ascending: true })
      .limit(20);
    snap.acara_mendatang = data ?? [];
  } catch (e) {
    snap.acara_mendatang = { galat: String(e).slice(0, 120) };
  }

  // --- Akun wajib QC ---
  try {
    const { data } = await db
      .from("akun_wajib")
      .select("username, nama_akun, platform, aktif")
      .eq("aktif", true)
      .limit(50);
    snap.akun_wajib_qc = (data ?? []).map((a) => ({
      akun: a.username,
      nama: a.nama_akun,
      platform: a.platform,
    }));
  } catch (e) {
    snap.akun_wajib_qc = { galat: String(e).slice(0, 120) };
  }

  // --- Struktur & rilis (statis-ish) ---
  snap.divisi_partai = [...DIVISI];
  try {
    const { data } = await db
      .from("rilis_aplikasi")
      .select("versi, dibuat_pada")
      .order("dibuat_pada", { ascending: false })
      .limit(1)
      .maybeSingle();
    snap.rilis_terbaru = data ?? null;
  } catch {
    snap.rilis_terbaru = null;
  }

  return snap;
}

/** Tulis snapshot baru ke tabel singleton. */
async function simpanSnapshot(konten: Record<string, unknown>): Promise<void> {
  await supabase()
    .from("asisten_basis")
    .upsert({ id: 1, konten, diperbarui_pada: new Date().toISOString() }, { onConflict: "id" });
}

/**
 * Baca basis pengetahuan. Bila belum ada / umur > 60 menit / paksa →
 * bangun ulang & simpan (inilah "refresh tiap 1 jam"). Catatan manual
 * master selalu digabung SEGAR (tak menunggu refresh snapshot).
 */
export async function bacaBasis(
  paksa = false,
): Promise<{ konten: Record<string, unknown>; diperbarui_pada: string; umur_menit: number; catatan: string }> {
  const db = supabase();
  const { data } = await db
    .from("asisten_basis")
    .select("konten, diperbarui_pada")
    .eq("id", 1)
    .maybeSingle();

  const umurMenit = data?.diperbarui_pada
    ? Math.floor((Date.now() - Date.parse(String(data.diperbarui_pada))) / 60_000)
    : Infinity;

  let konten = (data?.konten as Record<string, unknown>) ?? {};
  let diperbarui = String(data?.diperbarui_pada ?? "");
  let umur = umurMenit;

  if (paksa || !data || umurMenit >= UMUR_SEGAR_MENIT) {
    konten = await bangunSnapshot();
    await simpanSnapshot(konten);
    diperbarui = String(konten.dibuat_pada);
    umur = 0;
  }

  return { konten, diperbarui_pada: diperbarui, umur_menit: umur, catatan: await catatanBasis() };
}

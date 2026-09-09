// /api/tvr/laporan-anggota — KELOLA LAPORAN KPI VIDEO ANGGOTA (5 Sep 2026).
// Untuk admin HR (Divisi HR / admin_hr), Pimpinan Redaksi TV Rakyat, master,
// super admin: melihat laporan video tiap anggota per tanggal, MENGEDIT link,
// atau MENGHAPUS. Setiap perubahan mengirim notifikasi ke anggota bersangkutan.
// GET  ?tanggal=YYYY-MM-DD             → daftar anggota + jumlah laporan
// GET  ?tanggal=&user_id=              → laporan anggota itu
// PATCH {id, url_video, platform?}     → ubah link
// DELETE {id}                          → hapus
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { adalahHR } from "@/lib/hr";
import { adalahPimred } from "@/lib/jabatan";
import { adalahAdminStudio, DIVISI_PALUGODAM } from "@/lib/struktur";
import { kirimKabar } from "@/lib/notifikasi";
import { semuaBaris } from "@/lib/semua-baris";

export const dynamic = "force-dynamic";

const PLATFORM = new Set(["instagram", "tiktok", "youtube", "facebook", "threads", "twitter", "bilibili", "website"]);

type PenggunaGerbang = { role?: string; jabatan?: string | null; divisi?: string | null; posisi_divisi?: string | null };
function bolehKelola(u: PenggunaGerbang): boolean {
  return u.role === "master" || u.role === "super_admin" || u.role === "superadmin" || adalahHR(u) || adalahPimred(u);
}
/** 6 Sep 2026: Admin PALUGODAM (kepala divisi) boleh mengelola — hanya anggota divisinya. */
function bolehAkses(u: PenggunaGerbang): boolean {
  return bolehKelola(u) || adalahAdminStudio(u);
}
function hanyaPalugodam(u: PenggunaGerbang): boolean {
  return !bolehKelola(u) && adalahAdminStudio(u);
}
async function pastikanTarget(u: PenggunaGerbang, userId: number): Promise<{ nama: string; divisi: string }> {
  const { data } = await supabase().from("app_user").select("nama, divisi").eq("id", userId).maybeSingle();
  const divisi = String(data?.divisi ?? "");
  if (hanyaPalugodam(u) && divisi.trim() !== DIVISI_PALUGODAM) galat("Admin PALUGODAM hanya bisa mengelola anggota Divisi PALUGODAM.", 403);
  return { nama: String(data?.nama ?? ""), divisi };
}
/** Validasi link video (https + platform video yang dikenal, termasuk Bilibili). */
function sahkanLink(url: string): string {
  let host = "";
  let bersih = url.trim();
  try {
    const u = new URL(/^https?:\/\//i.test(bersih) ? bersih : `https://${bersih}`);
    if (u.protocol !== "https:") galat("Link harus alamat https yang lengkap.");
    host = u.hostname;
    bersih = u.toString();
  } catch {
    galat("Link video tidak valid.");
  }
  const sah = /(instagram|tiktok|youtube|youtu\.be|facebook|fb\.watch|threads|twitter|x|bilibili)\.(com|net|be|tv)$/i.test(host) || /^(youtu\.be|fb\.watch|x\.com|b23\.tv)$/i.test(host);
  if (!sah) galat("Link harus menuju Instagram, TikTok, YouTube, Facebook, Threads, X, atau Bilibili.");
  return bersih.slice(0, 500);
}
function galat(pesan: string, status = 400): never {
  throw Object.assign(new Error(pesan), { status });
}
function tanggalWib(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}
function tanggalDari(request: Request): string {
  const m = (new URL(request.url).searchParams.get("tanggal") ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(m) ? m : tanggalWib();
}

type Baris = { id: number; user_id: number; platform: string; url_video: string; keyword: string | null; sumber: string | null; dibuat_pada: string; tanggal_wib: string };

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!bolehAkses(user)) galat("Hanya HR, Pimpinan Redaksi, Admin PALUGODAM, atau pengurus.", 403);
    const db = supabase();
    const tanggal = tanggalDari(request);
    const userId = Number(new URL(request.url).searchParams.get("user_id") ?? 0);
    if (userId > 0) {
      await pastikanTarget(user, userId);
      const [{ data: rows }, { data: orang }] = await Promise.all([
        db.from("laporan_video").select("id, user_id, platform, url_video, keyword, sumber, dibuat_pada, tanggal_wib").eq("user_id", userId).eq("tanggal_wib", tanggal).order("dibuat_pada", { ascending: true }).limit(500),
        db.from("app_user").select("id, nama, avatar_url, divisi").eq("id", userId).maybeSingle(),
      ]);
      return {
        tanggal,
        anggota: orang ? { id: String(orang.id), nama: String(orang.nama ?? ""), avatar_url: String(orang.avatar_url ?? ""), divisi: String(orang.divisi ?? "") } : null,
        laporan: ((rows ?? []) as Baris[]).map((b) => ({ ...b, id: String(b.id), user_id: String(b.user_id) })),
      };
    }
    const rows = await semuaBaris<{ user_id: number }>((dari, sampai) => db.from("laporan_video").select("user_id").eq("tanggal_wib", tanggal).range(dari, sampai));
    const jumlahPer = new Map<number, number>();
    for (const r of rows) jumlahPer.set(Number(r.user_id), (jumlahPer.get(Number(r.user_id)) ?? 0) + 1);
    const { data: orang } = await db.from("app_user").select("id, nama, avatar_url, divisi").eq("aktif", true).eq("status", "aktif").order("nama", { ascending: true }).limit(1000);
    return {
      tanggal,
      daftar: (orang ?? [])
        .filter((o) => !hanyaPalugodam(user) || String(o.divisi ?? "").trim() === DIVISI_PALUGODAM)
        .map((o) => ({ id: String(o.id), nama: String(o.nama ?? ""), avatar_url: String(o.avatar_url ?? ""), divisi: String(o.divisi ?? ""), jumlah: jumlahPer.get(Number(o.id)) ?? 0 })),
      total: rows.length,
    };
  });
}

async function ambil(id: number): Promise<Baris> {
  const { data } = await supabase().from("laporan_video").select("id, user_id, platform, url_video, keyword, sumber, dibuat_pada, tanggal_wib").eq("id", id).maybeSingle();
  if (!data) galat("Laporan tidak ditemukan.", 404);
  return data as Baris;
}

export async function PATCH(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!bolehAkses(user)) galat("Hanya HR, Pimpinan Redaksi, Admin PALUGODAM, atau pengurus.", 403);
    const body = (await request.json().catch(() => ({}))) as { id?: string; url_video?: string; platform?: string };
    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) galat("Id laporan tidak sah.");
    const lama = await ambil(id);
    await pastikanTarget(user, Number(lama.user_id));
    const url = String(body.url_video ?? "").trim();
    let sah = false;
    try {
      sah = new URL(url).protocol === "https:";
    } catch {
      sah = false;
    }
    if (!sah) galat("Link harus alamat https yang lengkap.");
    const platform = String(body.platform ?? lama.platform).toLowerCase();
    if (!PLATFORM.has(platform)) galat("Platform tidak dikenal.");
    const db = supabase();
    const { data: dobel } = await db.from("laporan_video").select("id").eq("user_id", lama.user_id).eq("url_video", url).neq("id", id).maybeSingle();
    if (dobel) galat("Link itu sudah ada di laporan anggota ini.", 409);
    const { error } = await db.from("laporan_video").update({ url_video: url, platform }).eq("id", id);
    if (error) throw new Error("Gagal mengubah laporan.");
    await kirimKabar({
      judul: "✏️ Laporan KPI video Anda diubah",
      isi: `${user.nama} mengubah link laporan ${lama.tanggal_wib} (${platform}): ${url}`,
      kategori: "peringatan",
      jenis_peristiwa: "laporan_kpi_kelola",
      target: "tvrku",
      untukUserIds: [Number(lama.user_id)],
    });
    return { sukses: true, laporan: { ...lama, id: String(lama.id), user_id: String(lama.user_id), url_video: url, platform } };
  });
}

export async function DELETE(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!bolehAkses(user)) galat("Hanya HR, Pimpinan Redaksi, Admin PALUGODAM, atau pengurus.", 403);
    const body = (await request.json().catch(() => ({}))) as { id?: string; alasan?: string };
    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) galat("Id laporan tidak sah.");
    const lama = await ambil(id);
    await pastikanTarget(user, Number(lama.user_id));
    const { error } = await supabase().from("laporan_video").delete().eq("id", id);
    if (error) throw new Error("Gagal menghapus laporan.");
    const alasan = String(body.alasan ?? "").trim().slice(0, 200);
    await kirimKabar({
      judul: "🗑️ Laporan KPI video Anda dihapus",
      isi: `${user.nama} menghapus laporan ${lama.tanggal_wib} (${lama.platform}): ${lama.url_video}${alasan ? ` — alasan: ${alasan}` : ""}`,
      kategori: "peringatan",
      jenis_peristiwa: "laporan_kpi_kelola",
      target: "tvrku",
      untukUserIds: [Number(lama.user_id)],
    });
    return { sukses: true, id: String(id) };
  });
}

// POST {user_id, platform, url_video, tanggal?} — TAMBAH link atas nama anggota
// (6 Sep 2026): admin/HR/pimred menambahkan link yang sudah diverifikasi sendiri,
// langsung masuk laporan_video (sumber "admin", tanpa antre ACC HR).
export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!bolehAkses(user)) galat("Hanya HR, Pimpinan Redaksi, Admin PALUGODAM, atau pengurus.", 403);
    const body = (await request.json().catch(() => ({}))) as { user_id?: string | number; platform?: string; url_video?: string; tanggal?: string };
    const userId = Number(body.user_id ?? 0);
    if (!Number.isFinite(userId) || userId <= 0) galat("Anggota tidak disebutkan.");
    const target = await pastikanTarget(user, userId);
    const platform = String(body.platform ?? "").toLowerCase();
    if (!PLATFORM.has(platform)) galat("Platform tidak dikenal.");
    const url = sahkanLink(String(body.url_video ?? ""));
    const tanggalMentah = String(body.tanggal ?? "").trim();
    const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(tanggalMentah) ? tanggalMentah : tanggalWib();
    const db = supabase();
    const { data: dobel } = await db.from("laporan_video").select("id").eq("user_id", userId).eq("url_video", url).maybeSingle();
    if (dobel) galat("Link itu sudah ada di laporan anggota ini.", 409);
    const { data, error } = await db
      .from("laporan_video")
      .insert({ user_id: userId, platform, url_video: url, keyword: null, tanggal_wib: tanggal, sumber: "admin" })
      .select("id, user_id, platform, url_video, keyword, sumber, dibuat_pada, tanggal_wib")
      .single();
    if (error || !data) throw new Error("Gagal menambahkan laporan.");
    await kirimKabar({
      judul: "➕ Link laporan KPI video ditambahkan",
      isi: `${user.nama} menambahkan link laporan ${tanggal} (${platform}) atas nama Anda: ${url}`,
      kategori: "info",
      jenis_peristiwa: "laporan_kpi_kelola",
      target: "tvrku",
      untukUserIds: [userId],
    });
    return { sukses: true, anggota: target.nama, laporan: { ...(data as Baris), id: String(data.id), user_id: String(data.user_id) } };
  });
}

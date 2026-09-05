// /api/tvr/request — REQUEST VIDEO dari TV Rakyat Official ke anggota (5 Sep 2026).
//
// GET  → daftar request (anggota: yang aktif; pimred: 30 terakhir + rincian
//        siapa mengerjakan), status saya, dan request yang sedang saya kerjakan.
// POST aksi:
//   siapkan   {nama, ukuran}                 (pimred) URL unggah R2 untuk video bahan
//   buat      {judul, keterangan, video_url?, r2_key?} (pimred) → notifikasi ke SEMUA anggota
//   tutup     {id}                           (pimred)
//   kerjakan  {id}                           (anggota) — satu request aktif per orang
//   batal_kerja {id}                         (anggota)
// Pekerjaan ditutup otomatis oleh lib/tvr-request.selesaikanRequest saat
// anggota mengunggah video / melaporkan link.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { adalahPimred } from "@/lib/jabatan";
import { kirimKabar } from "@/lib/notifikasi";
import { presignR2, r2Siap } from "@/lib/r2";
import { requestAktifSaya } from "@/lib/tvr-request";

export const dynamic = "force-dynamic";

function galat(pesan: string, status = 400): never {
  throw Object.assign(new Error(pesan), { status });
}

function bolehKelola(u: { role?: string; jabatan?: string | null }): boolean {
  return u.role === "super_admin" || adalahPimred(u);
}

function urlSah(u: string): boolean {
  try {
    const x = new URL(u);
    return x.protocol === "https:";
  } catch {
    return false;
  }
}

type BarisRequest = { id: number; judul: string; keterangan: string; video_url: string; r2_key: string; dibuat_oleh: number; aktif: boolean; dibuat_pada: string; ditutup_pada: string | null };
type BarisKerja = { id: number; request_id: number; user_id: number; status: string; diambil_pada: string; selesai_pada: string | null };

async function muat(uid: number, pimred: boolean) {
  const db = supabase();
  let q = db.from("tvr_request").select("*").order("dibuat_pada", { ascending: false }).limit(pimred ? 30 : 20);
  if (!pimred) q = q.eq("aktif", true);
  const { data: reqs } = await q;
  const daftar = (reqs ?? []) as BarisRequest[];
  const ids = daftar.map((r) => Number(r.id));
  const [{ data: kerjaRows }, { data: pembuat }] = await Promise.all([
    ids.length ? db.from("tvr_request_kerja").select("id, request_id, user_id, status, diambil_pada, selesai_pada").in("request_id", ids).neq("status", "batal") : Promise.resolve({ data: [] as BarisKerja[] }),
    db.from("app_user").select("id, nama").in("id", [...new Set(daftar.map((r) => Number(r.dibuat_oleh)))].concat([0])),
  ]);
  const kerja = (kerjaRows ?? []) as BarisKerja[];
  const namaPer = new Map<number, string>();
  for (const o of pembuat ?? []) namaPer.set(Number(o.id), String(o.nama ?? ""));
  // Nama pengerja (pimred saja) — satu kueri.
  let namaKerja = new Map<number, string>();
  if (pimred && kerja.length > 0) {
    const { data } = await db.from("app_user").select("id, nama").in("id", [...new Set(kerja.map((k) => Number(k.user_id)))]);
    namaKerja = new Map((data ?? []).map((o) => [Number(o.id), String(o.nama ?? "")]));
  }
  const aktifSaya = await requestAktifSaya(uid);
  return {
    pimred,
    aktif_saya: aktifSaya,
    request: daftar.map((r) => {
      const k = kerja.filter((x) => Number(x.request_id) === Number(r.id));
      const saya = k.find((x) => Number(x.user_id) === uid);
      return {
        id: String(r.id),
        judul: r.judul,
        keterangan: r.keterangan,
        video_url: r.video_url || (r.r2_key && r2Siap() ? presignR2("GET", r.r2_key, 3600) : ""),
        pembuat: namaPer.get(Number(r.dibuat_oleh)) ?? "",
        aktif: r.aktif,
        dibuat_pada: r.dibuat_pada,
        jumlah_dikerjakan: k.filter((x) => x.status === "dikerjakan").length,
        jumlah_selesai: k.filter((x) => x.status === "selesai").length,
        status_saya: saya ? saya.status : null,
        kerja: pimred
          ? k
              .sort((a, b) => Date.parse(b.selesai_pada ?? b.diambil_pada) - Date.parse(a.selesai_pada ?? a.diambil_pada))
              .map((x) => ({ user_id: String(x.user_id), nama: namaKerja.get(Number(x.user_id)) ?? "", status: x.status, pada: x.selesai_pada ?? x.diambil_pada }))
          : [],
      };
    }),
  };
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    return muat(Number(user.id), bolehKelola(user));
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const uid = Number(user.id);
    const pimred = bolehKelola(user);
    const db = supabase();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const aksi = String(body.aksi ?? "");
    const kini = new Date().toISOString();

    if (aksi === "siapkan") {
      if (!pimred) galat("Hanya Pimpinan Redaksi yang bisa mengunggah bahan request.", 403);
      if (!r2Siap()) galat("Penyimpanan video (R2) belum diatur — pakai tautan video saja.", 503);
      const ukuran = Number(body.ukuran ?? 0);
      if (!Number.isFinite(ukuran) || ukuran <= 0 || ukuran > 200 * 1024 * 1024) galat("Ukuran berkas tidak sah (maks 200 MB).");
      const ext = /\.(mp4|mov|m4v|webm)$/i.exec(String(body.nama ?? ""))?.[1]?.toLowerCase() ?? "mp4";
      const key = `request/${uid}/${Date.now()}.${ext}`;
      return { sukses: true, r2_key: key, url: presignR2("PUT", key, 15 * 60) };
    }

    if (aksi === "buat") {
      if (!pimred) galat("Hanya Pimpinan Redaksi yang bisa membuat request.", 403);
      const judul = String(body.judul ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
      const keterangan = String(body.keterangan ?? "").trim().slice(0, 1500);
      const videoUrl = String(body.video_url ?? "").trim();
      const r2Key = String(body.r2_key ?? "").trim();
      if (judul.length < 3) galat("Judul request minimal 3 huruf.");
      if (videoUrl && !urlSah(videoUrl)) galat("Tautan video harus alamat https.");
      if (r2Key && !r2Key.startsWith(`request/${uid}/`)) galat("Berkas video tidak dikenal.");
      if (!videoUrl && !r2Key) galat("Sertakan tautan video atau unggah berkasnya.");
      const { data, error } = await db
        .from("tvr_request")
        .insert({ judul, keterangan, video_url: videoUrl, r2_key: r2Key, dibuat_oleh: uid })
        .select("id")
        .single();
      if (error || !data) throw new Error("Gagal menyimpan request.");
      // Kabar ke SEMUA anggota (satu baris per orang) + push.
      await kirimKabar({
        judul: "🎬 Request video baru dari TV Rakyat",
        isi: `${user.nama}: "${judul}". Buka TV Rakyat Saya → Request Video, tekan Kerjakan, lalu unggah videomu.`,
        kategori: "info",
        jenis_peristiwa: "tvr_request",
        target: "tvrku",
      });
      return { sukses: true, id: String(data.id), ...(await muat(uid, pimred)) };
    }

    if (aksi === "tutup") {
      if (!pimred) galat("Hanya Pimpinan Redaksi yang bisa menutup request.", 403);
      const id = Number(body.id);
      await db.from("tvr_request").update({ aktif: false, ditutup_pada: kini }).eq("id", id);
      await db.from("tvr_request_kerja").update({ status: "batal" }).eq("request_id", id).eq("status", "dikerjakan");
      return { sukses: true, ...(await muat(uid, pimred)) };
    }

    if (aksi === "kerjakan") {
      const id = Number(body.id);
      const { data: req } = await db.from("tvr_request").select("id, judul, aktif").eq("id", id).maybeSingle();
      if (!req || !req.aktif) galat("Request ini sudah ditutup.", 409);
      const { data: ada } = await db.from("tvr_request_kerja").select("id, status").eq("request_id", id).eq("user_id", uid).maybeSingle();
      if (ada?.status === "selesai") galat("Request ini sudah Anda selesaikan.", 409);
      // Hanya satu request aktif per orang: yang lama dibatalkan.
      await db.from("tvr_request_kerja").update({ status: "batal" }).eq("user_id", uid).eq("status", "dikerjakan");
      const { error } = await db
        .from("tvr_request_kerja")
        .upsert({ request_id: id, user_id: uid, status: "dikerjakan", diambil_pada: kini, selesai_pada: null }, { onConflict: "request_id,user_id" });
      if (error) throw new Error("Gagal mencatat pekerjaan.");
      return { sukses: true, pesan: `Anda mengerjakan "${req.judul}". Unggahan atau laporan video berikutnya otomatis tercatat untuk request ini.`, ...(await muat(uid, pimred)) };
    }

    if (aksi === "batal_kerja") {
      const id = Number(body.id);
      await db.from("tvr_request_kerja").update({ status: "batal" }).eq("request_id", id).eq("user_id", uid).eq("status", "dikerjakan");
      return { sukses: true, ...(await muat(uid, pimred)) };
    }

    galat("aksi tidak dikenal.");
  });
}

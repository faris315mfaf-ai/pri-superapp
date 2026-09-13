// Video wajib — perintah video untuk seluruh anggota (12 Sep 2026).
//
// Pihak berwenang menaruh satu perintah beserta bahannya; perintah itu
// muncul PALING ATAS di modul TV Rakyat setiap anggota dan jadi acuan
// saat mereka melaporkan videonya.
//
// 13 Sep 2026: fitur "Request Video ke Anggota" dihapus, gantinya bahan
// video DIUNGGAH DI SINI (berkas ke R2 / bucket "tvrku") dan ada kolom
// "sumber video". Kreator memakai bahan yang diunggah tim TV Rakyat
// Official di SuperApp — satu tempat untuk perintah dan bahannya.
//
// GET    → perintah AKTIF (semua anggota). Yang berwenang melihat
//          semuanya termasuk yang sudah dimatikan, plus flag boleh:true.
//          berkas_url dibuat bertanda tangan SAAT DIBACA (tidak disimpan).
// POST   { aksi:"siapkan", nama, ukuran } → URL unggah bertanda tangan
// POST   { judul, keterangan, link_doksli, sumber_video, kategori,
//          batas_waktu, berkas?{cara,key,nama,ukuran} }
// PATCH  { id, aktif }
// DELETE { id }  — berkasnya ikut dihapus dari penyimpanan
//
// Siapa yang berwenang: seluruh anggota TV Rakyat (wewenangTv), Direktur
// Eksekutif, Pimpinan Redaksi, dan jabatan TV Rakyat Nasional.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { bolehKelolaTvr } from "@/lib/tv-tim";
import { maksUploadMb } from "@/lib/pengaturan-tv";
import { hapusVideoR2, presignR2, r2Siap } from "@/lib/r2";

export const dynamic = "force-dynamic";

const BUCKET = "tvrku";
/** URL unduh berlaku sehari — panel memuat ulang tiap dibuka, jadi cukup. */
const UMUR_URL_DETIK = 24 * 3600;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasuk(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku."), { status: 401 });
  return user;
}

/** Berwenang memerintahkan video = berwenang mengatur TV Rakyat (satu aturan). */
const bolehPerintah = bolehKelolaTvr;

async function pastikanBerwenang(request: Request) {
  const user = await pastikanMasuk(request);
  if (!(await bolehPerintah(user))) {
    throw Object.assign(
      new Error("Hanya tim TV Rakyat & pimpinan yang boleh menetapkan video wajib."),
      { status: 403 },
    );
  }
  return user;
}

function teks(v: unknown, maks: number): string {
  return String(v ?? "").trim().slice(0, maks);
}

/** Link bahan mentah: harus alamat web yang sah, atau kosong. */
function bersihkanLink(v: unknown): string {
  const s = teks(v, 600);
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw Object.assign(new Error("Link bahan harus diawali http:// atau https://"), { status: 400 });
    }
    return u.toString();
  } catch (e) {
    if (e instanceof Error && "status" in e) throw e;
    throw Object.assign(new Error("Link bahan tidak dikenali sebagai alamat web."), { status: 400 });
  }
}

/** Tanggal 'YYYY-MM-DD' atau null. */
function bersihkanTanggal(v: unknown): string | null {
  const s = teks(v, 10);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw Object.assign(new Error("Batas waktu harus berbentuk tanggal."), { status: 400 });
  }
  return s;
}

type CaraBerkas = "r2" | "supabase" | "";

/**
 * Berkas yang dilaporkan klien setelah unggah. Kuncinya HARUS berada di
 * awalan video-wajib/ — klien tidak boleh menunjuk berkas orang lain
 * (mis. video TVR Saya anggota) lalu menghapusnya lewat DELETE perintah.
 */
function bersihkanBerkas(v: unknown): { cara: CaraBerkas; key: string; nama: string; ukuran: number } {
  const kosong = { cara: "" as CaraBerkas, key: "", nama: "", ukuran: 0 };
  if (!v || typeof v !== "object") return kosong;
  const b = v as Record<string, unknown>;
  const cara = b.cara === "r2" || b.cara === "supabase" ? b.cara : "";
  const key = teks(b.key, 300);
  if (!cara || !key) return kosong;
  if (!key.startsWith("video-wajib/") || key.includes("..")) {
    throw Object.assign(new Error("Kunci berkas tidak sah."), { status: 400 });
  }
  const ukuran = Number(b.ukuran ?? 0);
  return {
    cara,
    key,
    nama: teks(b.nama, 160),
    ukuran: Number.isFinite(ukuran) && ukuran > 0 ? Math.floor(ukuran) : 0,
  };
}

const KOLOM =
  "id, judul, keterangan, link_doksli, sumber_video, kategori, batas_waktu, aktif, dibuat_pada, dibuat_oleh_id, berkas_cara, berkas_key, berkas_nama, berkas_ukuran";
/** Bentuk lama, dipakai bila sql/52 belum dijalankan. */
const KOLOM_LAMA = "id, judul, keterangan, link_doksli, kategori, batas_waktu, aktif, dibuat_pada, dibuat_oleh_id";

type Baris = {
  id: number | string;
  judul: string;
  keterangan: string | null;
  link_doksli: string | null;
  sumber_video?: string | null;
  kategori: string | null;
  batas_waktu: string | null;
  aktif: boolean;
  dibuat_pada: string;
  dibuat_oleh_id: number | string | null;
  berkas_cara?: string | null;
  berkas_key?: string | null;
  berkas_nama?: string | null;
  berkas_ukuran?: number | string | null;
};

function bentuk(b: Baris, berkasUrl = "") {
  return {
    id: String(b.id),
    judul: b.judul,
    keterangan: b.keterangan ?? "",
    link_doksli: b.link_doksli ?? "",
    sumber_video: b.sumber_video ?? "",
    kategori: b.kategori ?? "",
    batas_waktu: b.batas_waktu ?? "",
    aktif: b.aktif === true,
    dibuat_pada: b.dibuat_pada,
    berkas_url: berkasUrl,
    berkas_nama: b.berkas_nama ?? "",
    berkas_ukuran: Number(b.berkas_ukuran ?? 0) || 0,
  };
}

/**
 * URL unduh untuk setiap baris yang punya berkas. R2 ditandatangani
 * satu per satu (murni perhitungan, tanpa panggilan jaringan); bucket
 * Supabase sekaligus dalam satu permintaan.
 */
async function urlBerkas(baris: Baris[]): Promise<Map<string, string>> {
  const hasil = new Map<string, string>();
  const dariBucket: Baris[] = [];
  for (const b of baris) {
    const key = String(b.berkas_key ?? "");
    if (!key) continue;
    if (b.berkas_cara === "r2") {
      if (r2Siap()) hasil.set(String(b.id), presignR2("GET", key, UMUR_URL_DETIK));
    } else if (b.berkas_cara === "supabase") {
      dariBucket.push(b);
    }
  }
  if (dariBucket.length > 0) {
    const { data } = await supabase()
      .storage.from(BUCKET)
      .createSignedUrls(
        dariBucket.map((b) => String(b.berkas_key)),
        UMUR_URL_DETIK,
      );
    for (const [i, b] of dariBucket.entries()) {
      const u = data?.[i]?.signedUrl;
      if (u) hasil.set(String(b.id), u);
    }
  }
  return hasil;
}

async function ambilBaris(hanyaAktif: boolean): Promise<Baris[]> {
  const db = supabase();
  let q = db.from("tvr_video_wajib").select(KOLOM).order("dibuat_pada", { ascending: false }).limit(50);
  if (hanyaAktif) q = q.eq("aktif", true);
  const { data, error } = await q;
  if (!error) return (data ?? []) as Baris[];
  // Kolom baru belum ada (sql/52 belum dijalankan): tampilkan bentuk
  // lama daripada panel kosong dengan galat.
  if (error.code !== "42703") throw new Error("Gagal memuat video wajib.");
  let lama = db.from("tvr_video_wajib").select(KOLOM_LAMA).order("dibuat_pada", { ascending: false }).limit(50);
  if (hanyaAktif) lama = lama.eq("aktif", true);
  const ulang = await lama;
  if (ulang.error) throw new Error("Gagal memuat video wajib.");
  return (ulang.data ?? []) as Baris[];
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const boleh = await bolehPerintah(user);
    // Anggota biasa hanya melihat yang aktif — perintah yang sudah
    // dimatikan bukan lagi kewajibannya.
    const baris = await ambilBaris(!boleh);
    const url = await urlBerkas(baris);
    return { data: baris.map((b) => bentuk(b, url.get(String(b.id)) ?? "")), boleh };
  });
}

/** Langkah 1 unggah bahan: URL PUT bertanda tangan (R2 utama, bucket cadangan). */
async function siapkanUnggah(uid: number, body: Record<string, unknown>) {
  const maksMb = await maksUploadMb();
  const ukuran = Number(body.ukuran ?? 0);
  if (!Number.isFinite(ukuran) || ukuran <= 0) {
    throw Object.assign(new Error("Ukuran berkas tidak dikenal."), { status: 400 });
  }
  if (ukuran > maksMb * 1024 * 1024) {
    throw Object.assign(
      new Error(`Video ${Math.round(ukuran / 1048576)} MB terlalu besar. Maksimal ${maksMb} MB — kecilkan dulu.`),
      { status: 400 },
    );
  }
  const ext = /\.(mp4|mov|m4v|webm)$/i.exec(String(body.nama ?? ""))?.[1]?.toLowerCase() ?? "mp4";
  // Awalan sendiri: penyapu media TVR Saya bekerja per baris tvrku_post,
  // tidak menyentuh awalan ini — bahan video wajib harus tetap ada
  // selama perintahnya ada.
  const key = `video-wajib/${uid}/${Date.now()}.${ext}`;
  if (r2Siap()) {
    return { sukses: true, cara: "r2" as const, key, url: presignR2("PUT", key, 15 * 60) };
  }
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUploadUrl(key);
  if (error || !data) {
    console.error("[video-wajib] siapkan:", error?.message);
    throw new Error("Gagal menyiapkan unggahan. Coba lagi.");
  }
  return { sukses: true, cara: "supabase" as const, key, url: data.signedUrl };
}

async function hapusBerkas(b: Pick<Baris, "berkas_cara" | "berkas_key">) {
  const key = String(b.berkas_key ?? "");
  if (!key) return;
  try {
    if (b.berkas_cara === "r2") await hapusVideoR2(key);
    else if (b.berkas_cara === "supabase") await supabase().storage.from(BUCKET).remove([key]);
  } catch (e) {
    // Berkas yatim lebih murah daripada perintah yang gagal dihapus.
    console.error("[video-wajib] hapus berkas:", e);
  }
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanBerwenang(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.aksi === "siapkan") return siapkanUnggah(Number(user.id), body);

    const judul = teks(body.judul, 200);
    if (judul.length < 3) {
      throw Object.assign(new Error("Judul perintah minimal 3 huruf."), { status: 400 });
    }
    const berkas = bersihkanBerkas(body.berkas);
    const isi = {
      judul,
      keterangan: teks(body.keterangan, 2000),
      link_doksli: bersihkanLink(body.link_doksli),
      sumber_video: teks(body.sumber_video, 200),
      kategori: teks(body.kategori, 120),
      batas_waktu: bersihkanTanggal(body.batas_waktu),
      dibuat_oleh_id: Number(user.id),
      berkas_cara: berkas.cara,
      berkas_key: berkas.key,
      berkas_nama: berkas.nama,
      berkas_ukuran: berkas.ukuran,
    };
    const { data, error } = await supabase().from("tvr_video_wajib").insert(isi).select(KOLOM).single();
    if (error?.code === "42703") {
      // Berkas sudah telanjur di penyimpanan; jangan tinggalkan yatim.
      await hapusBerkas({ berkas_cara: berkas.cara, berkas_key: berkas.key });
      throw Object.assign(
        new Error("Kolom bahan video belum ada di database: jalankan pri-sql 52_video_wajib_berkas.sql dulu."),
        { status: 503 },
      );
    }
    if (error || !data) throw new Error("Gagal menyimpan video wajib.");
    const url = await urlBerkas([data as Baris]);
    return bentuk(data as Baris, url.get(String((data as Baris).id)) ?? "");
  });
}

export async function PATCH(request: Request) {
  return bungkus(async () => {
    await pastikanBerwenang(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isFinite(id)) throw Object.assign(new Error("id tidak sah."), { status: 400 });
    const { error } = await supabase()
      .from("tvr_video_wajib")
      .update({ aktif: body.aktif === true })
      .eq("id", id);
    if (error) throw new Error("Gagal mengubah status.");
    return { ok: true };
  });
}

export async function DELETE(request: Request) {
  return bungkus(async () => {
    await pastikanBerwenang(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isFinite(id)) throw Object.assign(new Error("id tidak sah."), { status: 400 });
    const db = supabase();
    const { data: lama } = await db
      .from("tvr_video_wajib")
      .select("berkas_cara, berkas_key")
      .eq("id", id)
      .maybeSingle();
    const { error } = await db.from("tvr_video_wajib").delete().eq("id", id);
    if (error) throw new Error("Gagal menghapus.");
    if (lama) await hapusBerkas(lama as Pick<Baris, "berkas_cara" | "berkas_key">);
    return { ok: true };
  });
}

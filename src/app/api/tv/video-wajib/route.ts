// Video wajib — perintah video untuk seluruh anggota (12 Sep 2026).
//
// Pihak berwenang menaruh satu perintah beserta link bahan mentah
// (doksli) untuk diunduh; perintah itu muncul PALING ATAS di modul TV
// Rakyat setiap anggota dan jadi acuan saat mereka melaporkan videonya.
//
// GET    → perintah AKTIF (semua anggota). Yang berwenang melihat
//          semuanya termasuk yang sudah dimatikan, plus flag boleh:true.
// POST   { judul, keterangan, link_doksli, kategori, batas_waktu }
// PATCH  { id, aktif }
// DELETE { id }
//
// Siapa yang berwenang: seluruh anggota TV Rakyat (wewenangTv), Direktur
// Eksekutif, Pimpinan Redaksi, dan jabatan TV Rakyat Nasional.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { bolehKelolaTvr } from "@/lib/tv-tim";

export const dynamic = "force-dynamic";

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

type Baris = {
  id: number | string;
  judul: string;
  keterangan: string | null;
  link_doksli: string | null;
  kategori: string | null;
  batas_waktu: string | null;
  aktif: boolean;
  dibuat_pada: string;
  dibuat_oleh_id: number | string | null;
};

function bentuk(b: Baris) {
  return {
    id: String(b.id),
    judul: b.judul,
    keterangan: b.keterangan ?? "",
    link_doksli: b.link_doksli ?? "",
    kategori: b.kategori ?? "",
    batas_waktu: b.batas_waktu ?? "",
    aktif: b.aktif === true,
    dibuat_pada: b.dibuat_pada,
  };
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const boleh = await bolehPerintah(user);
    let q = supabase()
      .from("tvr_video_wajib")
      .select("id, judul, keterangan, link_doksli, kategori, batas_waktu, aktif, dibuat_pada, dibuat_oleh_id")
      .order("dibuat_pada", { ascending: false })
      .limit(50);
    // Anggota biasa hanya melihat yang aktif — perintah yang sudah
    // dimatikan bukan lagi kewajibannya.
    if (!boleh) q = q.eq("aktif", true);
    const { data, error } = await q;
    if (error) throw new Error("Gagal memuat video wajib.");
    return { data: (data ?? []).map((b) => bentuk(b as Baris)), boleh };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanBerwenang(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const judul = teks(body.judul, 200);
    if (judul.length < 3) {
      throw Object.assign(new Error("Judul perintah minimal 3 huruf."), { status: 400 });
    }
    const { data, error } = await supabase()
      .from("tvr_video_wajib")
      .insert({
        judul,
        keterangan: teks(body.keterangan, 2000),
        link_doksli: bersihkanLink(body.link_doksli),
        kategori: teks(body.kategori, 120),
        batas_waktu: bersihkanTanggal(body.batas_waktu),
        dibuat_oleh_id: Number(user.id),
      })
      .select("id, judul, keterangan, link_doksli, kategori, batas_waktu, aktif, dibuat_pada, dibuat_oleh_id")
      .single();
    if (error || !data) throw new Error("Gagal menyimpan video wajib.");
    return bentuk(data as Baris);
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
    const { error } = await supabase().from("tvr_video_wajib").delete().eq("id", id);
    if (error) throw new Error("Gagal menghapus.");
    return { ok: true };
  });
}

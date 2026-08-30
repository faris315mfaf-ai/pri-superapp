// Keyword wajib laporan video (fitur 1.22.x/keyword).
//
// Pimpinan Redaksi TV Rakyat menetapkan keyword/tema yang WAJIB diangkat
// seluruh anggota di video laporannya (mis. "BPJS"). Anggota memilih
// keyword ini saat melaporkan videonya.
//
// GET    → keyword AKTIF (semua pengguna, utk form laporan); Pimred
//          melihat SEMUA (termasuk nonaktif) + flag pimred:true.
// POST   { keyword }            → tambah (Pimred)
// PATCH  { id }                 → aktif/nonaktif (Pimred)
// DELETE { id }                 → hapus (Pimred)
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { adalahPimred } from "@/lib/jabatan";

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

async function pastikanPimred(request: Request) {
  const user = await pastikanMasuk(request);
  if (!adalahPimred(user)) {
    throw Object.assign(
      new Error("Hanya Pimpinan Redaksi TV Rakyat yang boleh mengatur keyword."),
      { status: 403 },
    );
  }
  return user;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const pimred = adalahPimred(user);
    let q = supabase()
      .from("keyword_wajib")
      .select("id, keyword, aktif")
      .order("dibuat_pada", { ascending: false });
    // Anggota biasa hanya melihat keyword yang AKTIF (acuan laporannya).
    if (!pimred) q = q.eq("aktif", true);
    const { data, error } = await q;
    if (error) throw new Error("Gagal memuat keyword.");
    return {
      data: (data ?? []).map((k) => ({
        id: String(k.id),
        keyword: k.keyword,
        aktif: k.aktif === true,
      })),
      pimred,
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanPimred(request);
    const body = (await request.json().catch(() => ({}))) as { keyword?: string };
    const keyword = (body.keyword ?? "").trim().slice(0, 60);
    if (keyword.length < 2) {
      throw Object.assign(new Error("Keyword minimal 2 karakter."), { status: 400 });
    }
    const { error } = await supabase()
      .from("keyword_wajib")
      .insert({ keyword, dibuat_oleh_id: Number(user.id), aktif: true });
    if (error) {
      if (error.code === "23505") {
        throw Object.assign(new Error(`Keyword "${keyword}" sudah ada.`), { status: 409 });
      }
      throw new Error("Gagal menambah keyword.");
    }
    return { sukses: true };
  });
}

export async function PATCH(request: Request) {
  return bungkus(async () => {
    await pastikanPimred(request);
    const body = (await request.json().catch(() => ({}))) as { id?: string | number };
    const id = Number(body.id ?? 0);
    if (!id) throw Object.assign(new Error("Keyword tidak disebutkan."), { status: 400 });
    const db = supabase();
    const { data: row } = await db
      .from("keyword_wajib")
      .select("aktif")
      .eq("id", id)
      .maybeSingle();
    if (!row) throw Object.assign(new Error("Keyword tidak ditemukan."), { status: 404 });
    const { error } = await db.from("keyword_wajib").update({ aktif: !row.aktif }).eq("id", id);
    if (error) throw new Error("Gagal mengubah keyword.");
    return { sukses: true, aktif: !row.aktif };
  });
}

export async function DELETE(request: Request) {
  return bungkus(async () => {
    await pastikanPimred(request);
    const body = (await request.json().catch(() => ({}))) as { id?: string | number };
    const id = Number(body.id ?? 0);
    if (!id) throw Object.assign(new Error("Keyword tidak disebutkan."), { status: 400 });
    const { error } = await supabase().from("keyword_wajib").delete().eq("id", id);
    if (error) throw new Error("Gagal menghapus keyword.");
    return { sukses: true };
  });
}

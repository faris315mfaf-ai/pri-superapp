// /api/tv-nasional/kategori-link — link video yang ditambahkan LANGSUNG
// ke satu kategori (13 Sep 2026). Batch: satu link per baris.
//
// GET    ?kategori=BPJS          → daftar link kategori itu
// POST   { kategori, teks }       → tambah banyak sekaligus; yang ditolak
//                                   dilaporkan per baris beserta alasannya
// DELETE { id }                   → hapus satu
//
// Siapa: master, jabatan TV Rakyat Nasional, Pimpinan Redaksi — orang
// yang sama yang boleh membuka insight kategori.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { adalahPimred, adalahTvrNasional } from "@/lib/jabatan";
import { polaPersis, uraiBatchLink } from "@/lib/insight-kategori";

export const dynamic = "force-dynamic";

const MAKS_BARIS = 500;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanBerwenang(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku."), { status: 401 });
  if (!adalahTvrNasional(user) && !adalahPimred(user)) {
    throw Object.assign(new Error("Hanya TV Rakyat Nasional & Pimpinan Redaksi."), { status: 403 });
  }
  return user;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanBerwenang(request);
    const kategori = (new URL(request.url).searchParams.get("kategori") ?? "").trim().slice(0, 120);
    if (!kategori) throw Object.assign(new Error("Sebutkan kategorinya."), { status: 400 });
    const { data, error } = await supabase()
      .from("tvr_kategori_link")
      .select("id, kategori, platform, url, kode, dibuat_pada")
      .ilike("kategori", polaPersis(kategori))
      .order("dibuat_pada", { ascending: false })
      .limit(1000);
    if (error) throw new Error("Gagal membaca link kategori.");
    return {
      data: (data ?? []).map((l) => ({
        id: String(l.id),
        platform: String(l.platform),
        url: String(l.url),
        kode: String(l.kode),
        dibuat_pada: String(l.dibuat_pada),
      })),
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanBerwenang(request);
    const body = (await request.json().catch(() => ({}))) as { kategori?: string; teks?: string };
    const kategori = String(body.kategori ?? "").trim().slice(0, 120);
    if (!kategori) throw Object.assign(new Error("Pilih kategorinya dulu."), { status: 400 });
    const teks = String(body.teks ?? "");
    const baris = teks.split(/\r?\n/).filter((b) => b.trim());
    if (baris.length === 0) throw Object.assign(new Error("Tempel minimal satu link."), { status: 400 });
    if (baris.length > MAKS_BARIS) {
      throw Object.assign(new Error(`Maksimal ${MAKS_BARIS} link sekali kirim.`), { status: 400 });
    }

    const { sah, ditolak } = uraiBatchLink(teks);
    let ditambahkan = 0;
    let sudahAda = 0;
    const db = supabase();
    // Satu per satu supaya yang ganda (unik kategori+kode) tidak
    // menggagalkan seluruh batch — kode 23505 = sudah ada, bukan galat.
    for (const l of sah) {
      const { error } = await db.from("tvr_kategori_link").insert({
        kategori,
        platform: l.platform,
        url: l.url,
        kode: l.kode,
        dibuat_oleh_id: Number(user.id),
      });
      if (!error) ditambahkan += 1;
      else if (error.code === "23505") sudahAda += 1;
      else ditolak.push({ baris: l.url, alasan: error.message });
    }
    return { kategori, ditambahkan, sudah_ada: sudahAda, ditolak };
  });
}

export async function DELETE(request: Request) {
  return bungkus(async () => {
    await pastikanBerwenang(request);
    const body = (await request.json().catch(() => ({}))) as { id?: string | number };
    const id = Number(body.id ?? 0);
    if (!id) throw Object.assign(new Error("Link tidak disebutkan."), { status: 400 });
    const { error } = await supabase().from("tvr_kategori_link").delete().eq("id", id);
    if (error) throw new Error("Gagal menghapus.");
    return { ok: true };
  });
}

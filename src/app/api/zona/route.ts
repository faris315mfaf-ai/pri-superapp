// Kelola ZONA berjenjang (spek 1.18/2.6).
//
// GET            → daftar semua zona (semua pengguna login; dipakai
//                  filter absensi & tabel anggota)
// POST {nama, parent_id?} → tambah zona (pengurus)
// PATCH {user_id, zona_id|null} → tetapkan zona seorang anggota (pengurus)
// DELETE {id}    → hapus zona (pengurus; anggota & anak zona dilepas
//                  ke null oleh ON DELETE SET NULL)
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken, hapusCacheUser } from "@/lib/sesi";

export const dynamic = "force-dynamic";

const PENGURUS = new Set(["master", "super_admin", "admin_hr"]);

async function pastikanMasuk(request: Request) {
  const h = request.headers.get("authorization") ?? "";
  const token = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
  const user = await userDariToken(token);
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  return user;
}

async function pastikanPengurus(request: Request) {
  const user = await pastikanMasuk(request);
  if (!PENGURUS.has(user.role)) {
    throw Object.assign(new Error("Hanya pengurus yang boleh mengelola zona."), {
      status: 403,
    });
  }
  return user;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanMasuk(request);
    const { data } = await supabase()
      .from("zona")
      .select("id, nama, parent_id")
      .order("nama")
      .limit(500);
    return {
      data: (data ?? []).map((z) => ({
        id: String(z.id),
        nama: z.nama as string,
        parent_id: z.parent_id ? String(z.parent_id) : null,
      })),
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    await pastikanPengurus(request);
    const body = (await request.json().catch(() => ({}))) as {
      nama?: string;
      parent_id?: string | null;
    };
    const nama = (body.nama ?? "").trim();
    if (nama.length < 2 || nama.length > 60) {
      throw Object.assign(new Error("Nama zona 2-60 karakter."), { status: 400 });
    }
    const { data, error } = await supabase()
      .from("zona")
      .insert({ nama, parent_id: body.parent_id ? Number(body.parent_id) : null })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        throw Object.assign(new Error(`Zona "${nama}" sudah ada.`), { status: 409 });
      }
      console.error("[zona] tambah:", error.message);
      throw new Error("Gagal menambah zona.");
    }
    return { sukses: true, id: String(data.id) };
  });
}

export async function PATCH(request: Request) {
  return bungkus(async () => {
    await pastikanPengurus(request);
    const body = (await request.json().catch(() => ({}))) as {
      user_id?: string;
      zona_id?: string | null;
    };
    const userId = Number(body.user_id);
    if (!userId) throw Object.assign(new Error("Anggota tidak disebutkan."), { status: 400 });
    const { error } = await supabase()
      .from("app_user")
      .update({ zona_id: body.zona_id ? Number(body.zona_id) : null })
      .eq("id", userId);
    if (error) throw new Error("Gagal menetapkan zona.");
    await hapusCacheUser(userId);
    return { sukses: true };
  });
}

export async function DELETE(request: Request) {
  return bungkus(async () => {
    await pastikanPengurus(request);
    const body = (await request.json().catch(() => ({}))) as { id?: string };
    const id = Number(body.id);
    if (!id) throw Object.assign(new Error("Zona tidak disebutkan."), { status: 400 });
    const { error } = await supabase().from("zona").delete().eq("id", id);
    if (error) throw new Error("Gagal menghapus zona.");
    return { sukses: true };
  });
}

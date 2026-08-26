// TIM TV RAKYAT — dikelola Pimpinan Redaksi.
//
// GET              → wewenang TV SAYA (semua pengguna): untuk tab & tombol
// GET ?kelola=1    → daftar tim + kandidat (khusus Pimred): layar kelola
// POST {user_id, aksi:"tambah"|"hapus"}            → tambah/keluarkan anggota
// PATCH {user_id, boleh_acc?, boleh_upload?}       → atur wewenang anggota
//
// Hanya Pimred (jabatan) & master yang boleh mengelola. Menambahkan
// anggota = membuka modul TV Rakyat untuk orang itu.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { adalahPimred } from "@/lib/jabatan";
import { wewenangTv } from "@/lib/tv-tim";
import { kirimKabar } from "@/lib/notifikasi";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const url = new URL(request.url);

    // --- Wewenang saya sendiri (dipakai semua pengguna) ---
    if (url.searchParams.get("kelola") !== "1") {
      return { wewenang: await wewenangTv(user) };
    }

    // --- Layar kelola (khusus Pimred/master) ---
    if (!adalahPimred(user)) {
      throw Object.assign(new Error("Hanya Pimpinan Redaksi yang boleh mengelola tim TV."), {
        status: 403,
      });
    }

    const db = supabase();
    const [{ data: tim }, { data: semua }] = await Promise.all([
      db
        .from("tv_tim")
        .select("user_id, boleh_acc, boleh_upload, app_user!tv_tim_user_id_fkey(nama, avatar_url, jabatan)")
        .order("dibuat_pada", { ascending: false }),
      db
        .from("app_user")
        .select("id, nama, avatar_url, jabatan, divisi")
        .eq("aktif", true)
        .eq("status", "aktif")
        .neq("role", "master")
        .order("nama"),
    ]);

    const idTim = new Set((tim ?? []).map((t) => Number(t.user_id)));
    return {
      tim: (tim ?? []).map((t) => {
        const u = Array.isArray(t.app_user) ? t.app_user[0] : t.app_user;
        return {
          user_id: String(t.user_id),
          nama: u?.nama ?? "",
          avatar_url: u?.avatar_url ?? "",
          jabatan: u?.jabatan ?? "",
          boleh_acc: t.boleh_acc,
          boleh_upload: t.boleh_upload,
        };
      }),
      // Kandidat = pengguna aktif yang belum jadi anggota tim.
      kandidat: (semua ?? [])
        .filter((u) => !idTim.has(Number(u.id)))
        .map((u) => ({
          id: String(u.id),
          nama: u.nama,
          avatar_url: u.avatar_url ?? "",
          jabatan: u.jabatan ?? "",
          divisi: u.divisi ?? "",
        })),
    };
  });
}

async function pastikanPimred(request: Request) {
  const user = await pastikanMasuk(request);
  if (!adalahPimred(user)) {
    throw Object.assign(new Error("Hanya Pimpinan Redaksi yang boleh mengelola tim TV."), {
      status: 403,
    });
  }
  return user;
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanPimred(request);
    const body = (await request.json().catch(() => ({}))) as {
      user_id?: string | number;
      aksi?: string;
    };
    const id = Number(body.user_id ?? 0);
    if (!id) throw Object.assign(new Error("Anggota tidak disebutkan."), { status: 400 });

    const db = supabase();

    if (body.aksi === "hapus") {
      const { error } = await db.from("tv_tim").delete().eq("user_id", id);
      if (error) throw new Error("Gagal mengeluarkan anggota.");
      return { sukses: true };
    }

    // tambah (default)
    const { data: target } = await db
      .from("app_user")
      .select("id, nama, aktif, status")
      .eq("id", id)
      .maybeSingle();
    if (!target || !target.aktif || target.status !== "aktif") {
      throw Object.assign(new Error("Anggota tidak ditemukan/nonaktif."), { status: 404 });
    }

    const { error } = await db.from("tv_tim").upsert(
      { user_id: id, ditunjuk_oleh_id: Number(user.id) },
      { onConflict: "user_id" },
    );
    if (error) throw new Error("Gagal menambahkan anggota.");

    await kirimKabar({
      judul: "Anda ditambahkan ke Tim TV Rakyat",
      isi: `${user.nama} menambahkan Anda ke Tim TV Rakyat. Modul TV Rakyat kini terbuka di aplikasi Anda.`,
      kategori: "sukses",
      jenis_peristiwa: "tv_tim",
      untukUserIds: [id],
    });
    return { sukses: true };
  });
}

export async function PATCH(request: Request) {
  return bungkus(async () => {
    await pastikanPimred(request);
    const body = (await request.json().catch(() => ({}))) as {
      user_id?: string | number;
      boleh_acc?: boolean;
      boleh_upload?: boolean;
    };
    const id = Number(body.user_id ?? 0);
    if (!id) throw Object.assign(new Error("Anggota tidak disebutkan."), { status: 400 });

    const perubahan: Record<string, boolean> = {};
    if (typeof body.boleh_acc === "boolean") perubahan.boleh_acc = body.boleh_acc;
    if (typeof body.boleh_upload === "boolean") perubahan.boleh_upload = body.boleh_upload;
    if (Object.keys(perubahan).length === 0) {
      throw Object.assign(new Error("Tidak ada wewenang yang diubah."), { status: 400 });
    }

    const { data, error } = await supabase()
      .from("tv_tim")
      .update(perubahan)
      .eq("user_id", id)
      .select("user_id");
    if (error) throw new Error("Gagal menyimpan wewenang.");
    if (!data || data.length === 0) {
      throw Object.assign(new Error("Anggota itu belum ada di tim TV."), { status: 404 });
    }
    return { sukses: true };
  });
}

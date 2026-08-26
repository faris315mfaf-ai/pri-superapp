// GET  /api/notifikasi — daftar notifikasi dalam aplikasi
// PATCH /api/notifikasi — tandai dibaca (satu id, atau semua)
// Sumber: Supabase (view v_app_notifikasi / tabel notifikasi).
import { supabase } from "@/lib/supabase";
import { bungkus, pastikanSukses } from "@/lib/api-helper";
import { pastikanMasuk, userDariToken } from "@/lib/sesi";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return bungkus(async () => {
    // Notifikasi disaring per peran: tim TV Rakyat tidak perlu melihat
    // laporan QC, dan sebaliknya. `untuk_role` kosong = untuk semua.
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    // Wajib login: sebelumnya pemanggil anonim tetap dilayani dan
    // menerima notifikasi internal yang tidak beralamat.
    await pastikanMasuk(request);
    const pengguna = token ? await userDariToken(token) : null;

    let kueri = supabase()
      .from("v_app_notifikasi")
      .select("id, judul, isi, kategori, waktu_relatif, kelompok, dibaca, target, untuk_role, jenis_peristiwa")
      .order("dibuat_pada", { ascending: false })
      .limit(100);

    if (pengguna) {
      // Prinsip relevansi: notifikasi hanya sampai ke yang berkepentingan.
      // - Baris beralamat orang → hanya orang itu.
      // - Baris beralamat peran → peran itu.
      // - Baris TANPA alamat (warisan lama & tulisan n8n): dipetakan dari
      //   kategorinya — VIDEO utk tim TV, QC utk pengurus QC, dan
      //   pengumuman rilis utk semua. Interaksi dua akun tidak pernah
      //   lewat sini karena selalu ditulis beralamat orang.
      const r = pengguna.role;
      // Ultah & video baru TV Rakyat memang untuk SEMUA orang.
      const umumRelevan: string[] = [
        "jenis_peristiwa.eq.rilis_aplikasi",
        "jenis_peristiwa.eq.ultah",
        "jenis_peristiwa.eq.tv_publik",
      ];
      if (r === "master" || r === "admin_tv") umumRelevan.push("kategori.eq.VIDEO");
      if (r === "master" || r === "super_admin" || r === "admin_hr") {
        umumRelevan.push("kategori.eq.QC");
      }
      kueri = kueri.or(
        `and(untuk_role.is.null,untuk_user.is.null,or(${umumRelevan.join(",")})),untuk_role.cs.{${r}},untuk_user.eq.${Number(pengguna.id)}`,
      );
    } else {
      kueri = kueri.is("untuk_user", null);
    }

    const data = pastikanSukses(await kueri, "daftar notifikasi");
    return { data };
  });
}

/**
 * Body: { id: string }  → tandai satu notifikasi dibaca
 *       { semua: true } → tandai semua dibaca
 * Perubahan disimpan permanen supaya status "dibaca" tidak hilang
 * saat pengguna berpindah perangkat atau menutup aplikasi.
 */
export async function PATCH(request: Request) {
  return bungkus(async () => {
    // Tanpa penjaga ini, siapa pun bisa menandai SELURUH notifikasi
    // milik semua orang sebagai sudah dibaca.
    await pastikanMasuk(request);
    const body = (await request.json().catch(() => ({}))) as {
      id?: string;
      semua?: boolean;
    };

    const db = supabase();
    if (body.semua) {
      const { error } = await db
        .from("notifikasi")
        .update({ dibaca: true })
        .eq("dibaca", false);
      if (error) throw new Error("Gagal menandai semua notifikasi dibaca");
      return { sukses: true };
    }

    if (!body.id) throw new Error("Notifikasi yang dimaksud tidak disebutkan");

    const { error } = await db
      .from("notifikasi")
      .update({ dibaca: true })
      .eq("id", Number(body.id));
    if (error) throw new Error("Gagal menandai notifikasi dibaca");
    return { sukses: true };
  });
}

/** Body: { id: string } → hapus satu notifikasi (dipakai gestur geser) */
export async function DELETE(request: Request) {
  return bungkus(async () => {
    // Tanpa penjaga ini, siapa pun bisa menghapus notifikasi orang lain
    // hanya dengan menebak nomornya.
    await pastikanMasuk(request);
    const body = (await request.json().catch(() => ({}))) as { id?: string };
    if (!body.id) throw new Error("Notifikasi yang dimaksud tidak disebutkan");

    const { error } = await supabase()
      .from("notifikasi")
      .delete()
      .eq("id", Number(body.id));
    if (error) throw new Error("Gagal menghapus notifikasi");
    return { sukses: true };
  });
}

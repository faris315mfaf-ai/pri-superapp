// Profil ala ML (spek 1.14 bagian 4.3): galeri "Momen Terbaik PRI"
// (maksimal 5 foto, <=300KB terkompresi) + like foto + like profil.
//
// GET  ?user=ID  → profil publik: foto + like-nya + like profil.
//                  Tanpa ?user = profil sendiri.
// POST {aksi:"unggah", foto, ganti_id?}  → tambah foto; bila sudah 5,
//        wajib menyebut ganti_id (foto lama yang diganti — spek:
//        PENGGUNA yang memilih, bukan sistem menebak).
// POST {aksi:"suka_foto", foto_id}       → toggle like foto.
// POST {aksi:"suka_profil", user_id}     → toggle like profil.
// DELETE {foto_id}                        → hapus foto sendiri.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { kirimKabar } from "@/lib/notifikasi";
import { after } from "next/server";

export const dynamic = "force-dynamic";

const MAKS_FOTO = 5;
const MAKS_BYTE = 350 * 1024; // 300KB target klien + kelonggaran
const JENIS_SAH = ["image/jpeg", "image/png", "image/webp"] as const;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasuk(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  return user;
}

/** Jalur storage dari URL publik bucket 'momen' (untuk penghapusan). */
function jalurDariUrl(url: string): string {
  return url.split("/momen/")[1] ?? "";
}

/**
 * Notifikasi like DI-BATCH (spek 4.3): maksimal satu kabar per pemilik
 * per jam, isinya jumlah like baru dalam jam itu — bukan satu
 * notifikasi per like yang membanjiri saat ramai.
 */
async function kabariPemilikSuka(pemilikId: number, penyukaNama: string, jenis: "foto" | "profil") {
  try {
    const db = supabase();
    const sejam = new Date(Date.now() - 3600_000).toISOString();
    // Sudah ada kabar suka untuk orang ini dalam sejam terakhir? Diam.
    const { data: sudah } = await db
      .from("notifikasi")
      .select("id")
      .eq("jenis_peristiwa", "suka")
      .eq("untuk_user", pemilikId)
      .gte("dibuat_pada", sejam)
      .limit(1)
      .maybeSingle();
    if (sudah) return;

    // Hitung ORANG UNIK yang menyukai sejam terakhir (foto + profil) —
    // satu orang menyukai foto DAN profil tetap terhitung satu orang.
    const [fotoBaru, profilBaru] = await Promise.all([
      db
        .from("foto_suka")
        .select("user_id, profil_foto!inner(user_id)")
        .eq("profil_foto.user_id", pemilikId)
        .gte("dibuat_pada", sejam),
      db
        .from("profil_suka")
        .select("penyuka_id")
        .eq("pemilik_id", pemilikId)
        .gte("dibuat_pada", sejam),
    ]);
    const orang = new Set<number>();
    for (const f of fotoBaru.data ?? []) orang.add(Number(f.user_id));
    for (const pr of profilBaru.data ?? []) orang.add(Number(pr.penyuka_id));
    const lainnya = orang.size - 1;

    await kirimKabar({
      judul: "❤️ Profilmu disukai",
      isi:
        lainnya > 0
          ? `${penyukaNama} dan ${lainnya} orang lain menyukai ${jenis === "foto" ? "foto" : "profil"}mu.`
          : `${penyukaNama} menyukai ${jenis === "foto" ? "foto" : "profil"}mu.`,
      kategori: "sukses",
      jenis_peristiwa: "suka",
      untukUserIds: [pemilikId],
    });
  } catch (e) {
    console.error("[momen] kabar suka:", e);
  }
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const idKu = Number(user.id);
    const url = new URL(request.url);
    const targetId = Number(url.searchParams.get("user") ?? 0) || idKu;
    const db = supabase();

    // Batas tanggal WIB hari ini utk "video yang diupload hari ini".
    const hariIniWib = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

    const [
      { data: foto },
      { count: sukaProfil },
      { data: sukaKu },
      { data: pemilik },
      { data: akunTvr },
      { data: videoTerbaru },
    ] = await Promise.all([
        db
          .from("profil_foto")
          .select("id, url, dibuat_pada")
          .eq("user_id", targetId)
          .order("id", { ascending: true }),
        db
          .from("profil_suka")
          .select("penyuka_id", { count: "exact", head: true })
          .eq("pemilik_id", targetId),
        db
          .from("profil_suka")
          .select("penyuka_id")
          .eq("pemilik_id", targetId)
          .eq("penyuka_id", idKu)
          .maybeSingle(),
        targetId === idKu
          ? Promise.resolve({ data: null })
          : db
              .from("app_user")
              .select("id, nama, nama_panggilan, jabatan, divisi, avatar_url, tanggal_lahir")
              .eq("id", targetId)
              .eq("aktif", true)
              .maybeSingle(),
        // Akun TV Rakyat yang dipegang (spek 1.15 profil)
        db
          .from("akun_tvr_user")
          .select("platform, username")
          .eq("user_id", targetId)
          .order("platform"),
        // Video laporan terbaru (utk embed profil + saringan hari ini)
        db
          .from("laporan_video")
          .select("id, platform, url_video, tanggal_wib, dibuat_pada")
          .eq("user_id", targetId)
          .order("id", { ascending: false })
          .limit(30),
      ]);

    // Like per foto + apakah AKU sudah like, sekali kueri per tabel.
    const idFoto = (foto ?? []).map((f) => Number(f.id));
    const jumlahPer = new Map<number, number>();
    const kuSukaFoto = new Set<number>();
    if (idFoto.length > 0) {
      const { data: semuaSuka } = await db
        .from("foto_suka")
        .select("foto_id, user_id")
        .in("foto_id", idFoto);
      for (const sk of semuaSuka ?? []) {
        const fid = Number(sk.foto_id);
        jumlahPer.set(fid, (jumlahPer.get(fid) ?? 0) + 1);
        if (Number(sk.user_id) === idKu) kuSukaFoto.add(fid);
      }
    }

    return {
      milik_sendiri: targetId === idKu,
      pemilik: pemilik
        ? {
            id: String(pemilik.id),
            nama: pemilik.nama,
            nama_panggilan: pemilik.nama_panggilan ?? "",
            jabatan: pemilik.jabatan ?? "",
            divisi: pemilik.divisi ?? "",
            avatar_url: pemilik.avatar_url ?? "",
          }
        : null,
      suka_profil: sukaProfil ?? 0,
      ku_suka_profil: Boolean(sukaKu),
      // Akun TVR + video (spek 1.15: profil & popup)
      akun_tvr: (akunTvr ?? []).map((a) => ({
        platform: a.platform as string,
        username: a.username as string,
      })),
      video_hari_ini: (videoTerbaru ?? [])
        .filter((v) => v.tanggal_wib === hariIniWib)
        .map((v) => ({ id: String(v.id), platform: v.platform as string, url: v.url_video as string })),
      video_terbaru: (videoTerbaru ?? [])
        .slice(0, 6)
        .map((v) => ({ id: String(v.id), platform: v.platform as string, url: v.url_video as string })),
      foto: (foto ?? []).map((f) => ({
        id: String(f.id),
        url: f.url,
        suka: jumlahPer.get(Number(f.id)) ?? 0,
        ku_suka: kuSukaFoto.has(Number(f.id)),
      })),
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const idKu = Number(user.id);
    const body = (await request.json().catch(() => ({}))) as {
      aksi?: string;
      foto?: string;
      ganti_id?: string;
      foto_id?: string;
      user_id?: string;
    };
    const db = supabase();

    // --- Unggah foto momen ---
    if (body.aksi === "unggah") {
      const m = /^data:([a-z/+.-]+);base64,(.+)$/i.exec(body.foto ?? "");
      if (!m) throw Object.assign(new Error("Format foto tidak dikenali."), { status: 400 });
      const jenis = m[1].toLowerCase();
      if (!JENIS_SAH.includes(jenis as (typeof JENIS_SAH)[number])) {
        throw Object.assign(new Error("Foto harus JPG, PNG, atau WebP."), { status: 400 });
      }
      const isi = Buffer.from(m[2], "base64");
      if (isi.length === 0 || isi.length > MAKS_BYTE) {
        throw Object.assign(
          new Error("Foto terlalu besar — maksimal 300KB setelah kompresi."),
          { status: 400 },
        );
      }

      const { data: fotoKini } = await db
        .from("profil_foto")
        .select("id, url")
        .eq("user_id", idKu);
      const jumlah = (fotoKini ?? []).length;

      // Sudah 5: PENGGUNA wajib memilih foto lama yang diganti (spek:
      // bukan sistem yang menebak menghapus yang tertua).
      let fotoDiganti: { id: number; url: string } | null = null;
      if (jumlah >= MAKS_FOTO) {
        const gantiId = Number(body.ganti_id);
        const lama = (fotoKini ?? []).find((f) => Number(f.id) === gantiId);
        if (!lama) {
          throw Object.assign(
            new Error("Galeri penuh (5 foto). Pilih satu foto lama untuk diganti."),
            { status: 409 },
          );
        }
        fotoDiganti = { id: Number(lama.id), url: String(lama.url) };
      }

      const ekstensi = jenis === "image/jpeg" ? "jpg" : jenis === "image/png" ? "png" : "webp";
      const jalur = `${idKu}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ekstensi}`;
      const { error: eUnggah } = await db.storage
        .from("momen")
        .upload(jalur, isi, { contentType: jenis, upsert: false });
      if (eUnggah) {
        console.error("[momen] unggah:", eUnggah.message);
        throw new Error("Gagal mengunggah foto. Coba lagi.");
      }
      const urlPublik = db.storage.from("momen").getPublicUrl(jalur).data.publicUrl;

      const { data: baru, error } = await db
        .from("profil_foto")
        .insert({ user_id: idKu, url: urlPublik })
        .select("id")
        .single();
      if (error) {
        await db.storage.from("momen").remove([jalur]);
        console.error("[momen] simpan:", error.message);
        throw new Error("Gagal menyimpan foto.");
      }

      // Foto lama yang diganti dibuang SETELAH yang baru selamat —
      // gagal di tengah tidak membuat galeri kehilangan dua-duanya.
      if (fotoDiganti) {
        await db.from("profil_foto").delete().eq("id", fotoDiganti.id);
        const jalurLama = jalurDariUrl(fotoDiganti.url);
        if (jalurLama) await db.storage.from("momen").remove([jalurLama]);
      }

      return { sukses: true, id: String(baru.id), url: urlPublik };
    }

    // --- Toggle like FOTO ---
    if (body.aksi === "suka_foto") {
      const fotoId = Number(body.foto_id);
      if (!fotoId) throw Object.assign(new Error("Foto tidak disebutkan."), { status: 400 });
      const { data: foto } = await db
        .from("profil_foto")
        .select("id, user_id")
        .eq("id", fotoId)
        .maybeSingle();
      if (!foto) throw Object.assign(new Error("Foto tidak ditemukan."), { status: 404 });

      const { data: sudah } = await db
        .from("foto_suka")
        .select("foto_id")
        .eq("foto_id", fotoId)
        .eq("user_id", idKu)
        .maybeSingle();
      if (sudah) {
        await db.from("foto_suka").delete().eq("foto_id", fotoId).eq("user_id", idKu);
        return { sukses: true, suka: false };
      }
      await db.from("foto_suka").insert({ foto_id: fotoId, user_id: idKu });
      const pemilikId = Number(foto.user_id);
      if (pemilikId !== idKu) {
        after(() => kabariPemilikSuka(pemilikId, user.nama, "foto"));
      }
      return { sukses: true, suka: true };
    }

    // --- Toggle like PROFIL ---
    if (body.aksi === "suka_profil") {
      const pemilikId = Number(body.user_id);
      if (!pemilikId || pemilikId === idKu) {
        throw Object.assign(new Error("Profil tidak bisa disukai."), { status: 400 });
      }
      const { data: sudah } = await db
        .from("profil_suka")
        .select("pemilik_id")
        .eq("pemilik_id", pemilikId)
        .eq("penyuka_id", idKu)
        .maybeSingle();
      if (sudah) {
        await db
          .from("profil_suka")
          .delete()
          .eq("pemilik_id", pemilikId)
          .eq("penyuka_id", idKu);
        return { sukses: true, suka: false };
      }
      await db.from("profil_suka").insert({ pemilik_id: pemilikId, penyuka_id: idKu });
      after(() => kabariPemilikSuka(pemilikId, user.nama, "profil"));
      return { sukses: true, suka: true };
    }

    throw Object.assign(new Error("Aksi tidak dikenali."), { status: 400 });
  });
}

export async function DELETE(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const body = (await request.json().catch(() => ({}))) as { foto_id?: string };
    const fotoId = Number(body.foto_id);
    if (!fotoId) throw Object.assign(new Error("Foto tidak disebutkan."), { status: 400 });

    const db = supabase();
    const { data: foto } = await db
      .from("profil_foto")
      .select("id, user_id, url")
      .eq("id", fotoId)
      .maybeSingle();
    if (!foto || Number(foto.user_id) !== Number(user.id)) {
      throw Object.assign(new Error("Foto tidak ditemukan."), { status: 404 });
    }

    await db.from("profil_foto").delete().eq("id", fotoId);
    const jalur = jalurDariUrl(String(foto.url));
    if (jalur) await db.storage.from("momen").remove([jalur]);
    return { sukses: true };
  });
}

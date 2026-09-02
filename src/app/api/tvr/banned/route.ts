// GET   /api/tvr/banned          — laporan banned SAYA yang masih aktif
//        ?semua=1                — semua laporan aktif (HR/pengurus, + bukti)
// POST  /api/tvr/banned          — lapor akun kena banned {platform, buktiDataUrl, keterangan?}
// PATCH /api/tvr/banned          — cabut laporan {id} (pemilik / HR)
//
// REVISI 2 Sep 2026 — kini PERMOHONAN, bukan efek seketika: laporan
// masuk berstatus 'menunggu'; target KPI baru berkurang 5/platform
// setelah HR MENYETUJUI (lib/kpi-video hanya membaca status
// 'disetujui'). Persetujuan/penolakan lewat /api/tvr/persetujuan;
// PATCH di sini tetap untuk MENCABUT (akun pulih / HR).
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { adalahHR } from "@/lib/hr";
import { userDariToken } from "@/lib/sesi";
import { kirimKabar } from "@/lib/notifikasi";
import { PLATFORM_KPI } from "@/lib/kpi-video";

export const dynamic = "force-dynamic";

const MAKS_BUKTI_BYTE = 2 * 1024 * 1024; // 2 MB — screenshot ponsel cukup
const PENGURUS = new Set(["master", "super_admin", "admin_hr"]);

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasuk(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  return user;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const url = new URL(request.url);
    const db = supabase();

    // --- Semua laporan aktif + bukti (HR/pengurus) ---
    if (url.searchParams.get("semua") === "1") {
      if (!PENGURUS.has(user.role) && !adalahHR(user)) {
        throw Object.assign(new Error("Hanya pengurus yang boleh melihat semua laporan."), {
          status: 403,
        });
      }
      const saringStatus = url.searchParams.get("status");
      let qSemua = db
        .from("tvr_banned")
        .select("id, user_id, platform, bukti_url, keterangan, dibuat_pada, status, app_user(nama)")
        .is("dicabut_pada", null)
        .order("dibuat_pada", { ascending: false })
        .limit(200);
      if (saringStatus) qSemua = qSemua.eq("status", saringStatus);
      const { data } = await qSemua;
      return {
        data: (data ?? []).map((b) => {
          const embedded = b.app_user as { nama?: string } | { nama?: string }[] | null;
          const nama = Array.isArray(embedded) ? embedded[0]?.nama : embedded?.nama;
          return {
            id: String(b.id),
            user_id: String(b.user_id),
            nama: nama ?? "",
            platform: b.platform,
            bukti_url: b.bukti_url,
            keterangan: b.keterangan ?? "",
            dibuat_pada: b.dibuat_pada,
            status: String(b.status ?? "disetujui"),
          };
        }),
      };
    }

    // --- Permohonan milik sendiri (menunggu / disetujui; yang ditolak
    //     ikut tampil 7 hari supaya alasannya terbaca) ---
    const batasTolak = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data } = await db
      .from("tvr_banned")
      .select("id, platform, bukti_url, keterangan, dibuat_pada, status, catatan_putusan, diputus_pada")
      .eq("user_id", Number(user.id))
      .or(`dicabut_pada.is.null,and(status.eq.ditolak,diputus_pada.gte.${batasTolak})`)
      .order("dibuat_pada", { ascending: false });
    return {
      data: (data ?? []).map((b) => ({ ...b, id: String(b.id) })),
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const body = (await request.json().catch(() => ({}))) as {
      platform?: string;
      buktiDataUrl?: string;
      keterangan?: string;
    };

    const platform = (body.platform ?? "").toLowerCase();
    if (!(PLATFORM_KPI as readonly string[]).includes(platform)) {
      throw Object.assign(new Error("Pilih platform yang akunnya kena banned."), {
        status: 400,
      });
    }

    // Bukti WAJIB — efeknya langsung mengurangi target, jadi harus ada
    // dasar yang bisa diperiksa HR (pola sama dengan surat perizinan).
    const bukti = body.buktiDataUrl ?? "";
    const cocok = /^data:(image\/jpeg|image\/png);base64,/.exec(bukti);
    if (!cocok) {
      throw Object.assign(
        new Error("Bukti banned wajib diunggah (screenshot JPG/PNG)."),
        { status: 400 },
      );
    }
    const isi = Buffer.from(bukti.slice(bukti.indexOf(",") + 1), "base64");
    if (isi.length < 1024 || isi.length > MAKS_BUKTI_BYTE) {
      throw Object.assign(new Error("Ukuran bukti harus di bawah 2 MB."), { status: 400 });
    }

    const db = supabase();
    const ext = cocok[1] === "image/png" ? "png" : "jpg";
    const jalur = `${user.id}/${platform}-${Date.now()}.${ext}`;
    const { error: eUnggah } = await db.storage
      .from("banned")
      .upload(jalur, isi, { contentType: cocok[1], upsert: false });
    if (eUnggah) {
      console.error("[tvr/banned] unggah bukti:", eUnggah.message);
      throw new Error("Gagal menyimpan bukti. Coba lagi.");
    }
    const buktiUrl = db.storage.from("banned").getPublicUrl(jalur).data.publicUrl;

    const { data, error } = await db
      .from("tvr_banned")
      .insert({
        user_id: Number(user.id),
        platform,
        bukti_path: jalur,
        bukti_url: buktiUrl,
        keterangan: (body.keterangan ?? "").trim().slice(0, 300) || null,
        status: "menunggu",
      })
      .select("id")
      .single();
    if (error) {
      await db.storage.from("banned").remove([jalur]);
      if (error.code === "23505") {
        throw Object.assign(
          new Error(`Permohonan untuk akun ${platform} Anda sudah ada (menunggu/disetujui).`),
          { status: 409 },
        );
      }
      console.error("[tvr/banned] simpan:", error.message);
      throw new Error("Gagal menyimpan laporan.");
    }

    // Kabari HR — target KPI BELUM berubah sampai disetujui.
    await kirimKabar({
      judul: "Permohonan sosmed terblokir",
      isi: `${user.nama} mengajukan akun ${platform}-nya terblokir. Periksa bukti & putuskan di HR Center → ACC KPI.`,
      kategori: "peringatan",
      jenis_peristiwa: "tvr_banned",
      untukRole: ["admin_hr", "super_admin", "master"],
    });

    return { sukses: true, id: String(data.id) };
  });
}

export async function PATCH(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const body = (await request.json().catch(() => ({}))) as { id?: string };
    const id = Number(body.id);
    if (!id) throw Object.assign(new Error("Laporan tidak disebutkan."), { status: 400 });

    const db = supabase();
    const { data: baris } = await db
      .from("tvr_banned")
      .select("id, user_id, platform")
      .eq("id", id)
      .is("dicabut_pada", null)
      .maybeSingle();
    if (!baris) {
      throw Object.assign(new Error("Laporan tidak ditemukan / sudah dicabut."), {
        status: 404,
      });
    }

    // Pemilik boleh mencabut sendiri (akun pulih); HR boleh mencabut
    // laporan siapa pun (bukti janggal).
    const pemilik = Number(baris.user_id) === Number(user.id);
    const pengurus = PENGURUS.has(user.role) || adalahHR(user);
    if (!pemilik && !pengurus) {
      throw Object.assign(new Error("Anda tidak berwenang mencabut laporan ini."), {
        status: 403,
      });
    }

    const { error } = await db
      .from("tvr_banned")
      .update({ dicabut_pada: new Date().toISOString(), dicabut_oleh: user.nama })
      .eq("id", id);
    if (error) throw new Error("Gagal mencabut laporan.");

    // Pemiliknya diberi tahu bila yang mencabut pengurus.
    if (!pemilik) {
      await kirimKabar({
        judul: "Laporan banned dicabut pengurus",
        isi: `Laporan banned akun ${baris.platform} Anda dicabut oleh ${user.nama}. Target KPI platform itu berlaku lagi.`,
        kategori: "info",
        jenis_peristiwa: "tvr_banned",
        untukUserIds: [Number(baris.user_id)],
      });
    }
    return { sukses: true };
  });
}

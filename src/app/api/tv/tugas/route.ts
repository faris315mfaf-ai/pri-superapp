// TUGAS LINK — Pimpinan Redaksi membagikan link (hasil pindaian
// berita ATAU link manual) ke anggota tertentu untuk dijadikan video.
//
// GET    → pimred/master: semua tugas; anggota: tugas miliknya sendiri
// POST   {url, judul?, catatan?, untuk_user_id} → beri tugas (pimred)
// PATCH  {id, aksi:"batal"} → batalkan tugas yang belum selesai (pimred)
//
// Siklus status (kolomnya dijaga CHECK constraint di database):
//   baru → dikerjakan (anggota menautkan unggahan videonya)
//        → selesai    (videonya berhasil diposting ke sosmed — otomatis,
//                      lihat /api/tv/unggah; kewajiban anggota gugur)
//        → batal      (dibatalkan pimred)
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { adalahPimred } from "@/lib/jabatan";
import { kirimKabar } from "@/lib/notifikasi";

export const dynamic = "force-dynamic";

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasuk(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  return user;
}

// Dua jalur FK ke app_user (penerima & pembuat) — constraint-nya wajib
// disebut namanya, atau seluruh permintaan embed gagal.
const KOLOM =
  "id, judul, url, catatan, untuk_user_id, dibuat_oleh_id, status, video_kode, dibuat_pada, selesai_pada, penerima:app_user!tugas_link_untuk_fkey(nama, nama_panggilan), pemberi:app_user!tugas_link_pembuat_fkey(nama)";

type BarisTugas = {
  id: number;
  judul: string;
  url: string;
  catatan: string;
  untuk_user_id: number;
  dibuat_oleh_id: number;
  status: string;
  video_kode: string | null;
  dibuat_pada: string;
  selesai_pada: string | null;
  penerima?: { nama?: string; nama_panggilan?: string } | { nama?: string; nama_panggilan?: string }[] | null;
  pemberi?: { nama?: string } | { nama?: string }[] | null;
};

function rapikan(b: BarisTugas) {
  const penerima = Array.isArray(b.penerima) ? b.penerima[0] : b.penerima;
  const pemberi = Array.isArray(b.pemberi) ? b.pemberi[0] : b.pemberi;
  return {
    id: String(b.id),
    judul: b.judul,
    url: b.url,
    catatan: b.catatan,
    untuk_user_id: String(b.untuk_user_id),
    nama_penerima: penerima?.nama_panggilan || penerima?.nama || "",
    nama_pemberi: pemberi?.nama ?? "",
    status: b.status,
    video_kode: b.video_kode,
    dibuat_pada: b.dibuat_pada,
    selesai_pada: b.selesai_pada,
  };
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const db = supabase();

    let q = db
      .from("tugas_link")
      .select(KOLOM)
      .order("dibuat_pada", { ascending: false })
      .limit(100);
    // Anggota hanya melihat tugasnya sendiri; pimred melihat semuanya.
    if (!adalahPimred(user)) q = q.eq("untuk_user_id", Number(user.id));

    const { data, error } = await q;
    if (error) {
      console.error("[tv/tugas] baca:", error.message);
      throw new Error("Gagal memuat daftar tugas.");
    }
    return { data: ((data ?? []) as unknown as BarisTugas[]).map(rapikan) };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!adalahPimred(user)) {
      throw Object.assign(
        new Error("Hanya Pimpinan Redaksi yang boleh membagikan tugas link."),
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      url?: string;
      judul?: string;
      catatan?: string;
      untuk_user_id?: string | number;
    };

    const url = (body.url ?? "").trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      throw Object.assign(new Error("Link tidak sah. Awali dengan http(s)://"), {
        status: 400,
      });
    }
    const targetId = Number(body.untuk_user_id ?? 0);
    if (!targetId) {
      throw Object.assign(new Error("Pilih anggota penerimanya."), { status: 400 });
    }

    const db = supabase();
    const { data: target } = await db
      .from("app_user")
      .select("id, nama, aktif, status")
      .eq("id", targetId)
      .maybeSingle();
    if (!target || !target.aktif || target.status !== "aktif") {
      throw Object.assign(new Error("Anggota penerima tidak ditemukan/nonaktif."), {
        status: 404,
      });
    }

    const { data: baris, error } = await db
      .from("tugas_link")
      .insert({
        url,
        judul: (body.judul ?? "").trim().slice(0, 160),
        catatan: (body.catatan ?? "").trim().slice(0, 500),
        untuk_user_id: targetId,
        dibuat_oleh_id: Number(user.id),
      })
      .select("id")
      .single();
    if (error) {
      console.error("[tv/tugas] simpan:", error.message);
      throw new Error("Gagal menyimpan tugas.");
    }

    // Tugas menempel di profil anggota — beri tahu orangnya langsung.
    await kirimKabar({
      judul: "Tugas video baru dari Pimred",
      isi: `${user.nama} menugaskan Anda membuat video dari sebuah link${
        body.judul ? `: "${String(body.judul).slice(0, 80)}"` : ""
      }. Buka TVR Saya untuk melihatnya.`,
      kategori: "info",
      jenis_peristiwa: "tugas_link",
      untukUserIds: [targetId],
    });

    return { sukses: true, id: String(baris.id) };
  });
}

export async function PATCH(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!adalahPimred(user)) {
      throw Object.assign(new Error("Hanya Pimpinan Redaksi yang boleh mengubah tugas."), {
        status: 403,
      });
    }

    const body = (await request.json().catch(() => ({}))) as {
      id?: string | number;
      aksi?: string;
    };
    const id = Number(body.id ?? 0);
    if (!id) throw Object.assign(new Error("Tugas tidak disebutkan."), { status: 400 });
    if (body.aksi !== "batal") {
      throw Object.assign(new Error("Aksi tidak dikenal."), { status: 400 });
    }

    // Tugas yang sudah selesai adalah catatan sejarah — tidak bisa dibatalkan.
    const { data, error } = await supabase()
      .from("tugas_link")
      .update({ status: "batal" })
      .eq("id", id)
      .neq("status", "selesai")
      .select("id, untuk_user_id");
    if (error) throw new Error("Gagal membatalkan tugas.");
    if (!data || data.length === 0) {
      throw Object.assign(
        new Error("Tugas tidak ditemukan atau sudah selesai."),
        { status: 409 },
      );
    }

    await kirimKabar({
      judul: "Tugas video dibatalkan",
      isi: `${user.nama} membatalkan salah satu tugas link Anda.`,
      kategori: "peringatan",
      jenis_peristiwa: "tugas_link",
      untukUserIds: [Number(data[0].untuk_user_id)],
    });

    return { sukses: true };
  });
}

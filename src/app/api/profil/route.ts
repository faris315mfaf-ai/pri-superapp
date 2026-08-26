// POST /api/profil — langkah 3 pendaftaran: nama, nama panggilan,
// tanggal lahir, foto, dan pilihan DIVISI (+sub-divisi bila perlu).
//
// Jabatan resmi & posisi kepala/anggota TIDAK bisa diisi dari sini —
// keduanya dikunci dan hanya diubah HRD/super admin di Kelola Pengguna.
//
// Dipanggil setelah OTP terverifikasi, memakai token perangkat yang
// diterbitkan langkah OTP. Setelah ini profil dianggap lengkap dan
// pengguna tinggal menunggu persetujuan super admin.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { KOLOM_USER, keUserPublik, type BarisUser } from "@/lib/sesi";
import { pastikanStrukturSah } from "@/lib/struktur";

export const dynamic = "force-dynamic";
// Foto dikirim sebagai data URL; unggahan bisa mendekati 2 MB.
export const maxDuration = 30;

const MAKS_BYTE = 2 * 1024 * 1024;
const JENIS_DIIZINKAN = ["image/jpeg", "image/png", "image/webp"] as const;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

/**
 * Ubah data URL ("data:image/png;base64,….") menjadi berkas.
 * Melempar bila jenis atau ukurannya di luar batas — pemeriksaan
 * dilakukan di server karena batas di sisi peramban bisa dilewati.
 */
function bacaDataUrl(dataUrl: string): { data: Buffer; jenis: string; ekstensi: string } {
  const m = /^data:([a-z/+.-]+);base64,(.+)$/i.exec(dataUrl ?? "");
  if (!m) throw Object.assign(new Error("Format foto tidak dikenali."), { status: 400 });

  const jenis = m[1].toLowerCase();
  if (!JENIS_DIIZINKAN.includes(jenis as (typeof JENIS_DIIZINKAN)[number])) {
    throw Object.assign(new Error("Foto harus JPG, PNG, atau WebP."), { status: 400 });
  }

  const data = Buffer.from(m[2], "base64");
  if (data.length === 0) {
    throw Object.assign(new Error("Foto kosong."), { status: 400 });
  }
  if (data.length > MAKS_BYTE) {
    throw Object.assign(new Error("Ukuran foto maksimal 2 MB."), { status: 400 });
  }

  const ekstensi = jenis === "image/jpeg" ? "jpg" : jenis === "image/png" ? "png" : "webp";
  return { data, jenis, ekstensi };
}

/**
 * PATCH /api/profil — ganti foto profil saja.
 *
 * Terpisah dari POST karena POST mewajibkan nama & jabatan (langkah
 * pendaftaran), sedangkan mengganti foto belakangan tidak boleh
 * memaksa pengguna mengisi ulang keduanya.
 */
export async function PATCH(request: Request) {
  return bungkus(async () => {
    const token = tokenDari(request);
    const user = token ? await userDariTokenLonggar(token) : null;
    if (!user) {
      throw Object.assign(new Error("Sesi tidak berlaku. Masuk lagi."), { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      foto?: string;
      nama_panggilan?: string;
      tanggal_lahir?: string;
      divisi?: string;
      sub_divisi?: string;
    };

    const db = supabase();
    const perubahan: Record<string, unknown> = {};

    if (body.foto) {
      const { data, jenis, ekstensi } = bacaDataUrl(body.foto);
      const jalur = `${user.id}/${Date.now()}.${ekstensi}`;

      const { error: eUnggah } = await db.storage
        .from("avatar")
        .upload(jalur, data, { contentType: jenis, upsert: true });

      if (eUnggah) {
        console.error("[profil] ganti foto:", eUnggah.message);
        throw new Error("Gagal mengunggah foto. Coba lagi.");
      }

      const { data: pub } = db.storage.from("avatar").getPublicUrl(jalur);
      perubahan.avatar_url = pub.publicUrl;
    }

    // Anggota lama melengkapi data barunya dari layar Profil.
    // Jabatan & posisi kepala/anggota sengaja TIDAK bisa lewat sini.
    if (typeof body.nama_panggilan === "string") {
      const p = body.nama_panggilan.trim();
      if (p.length < 2 || p.length > 30) {
        throw Object.assign(new Error("Nama panggilan 2–30 karakter."), { status: 400 });
      }
      perubahan.nama_panggilan = p;
    }
    if (typeof body.tanggal_lahir === "string" && body.tanggal_lahir) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.tanggal_lahir)) {
        throw Object.assign(new Error("Format tanggal lahir salah."), { status: 400 });
      }
      perubahan.tanggal_lahir = body.tanggal_lahir;
    }
    if (typeof body.divisi === "string" && body.divisi) {
      const sub = (body.sub_divisi ?? "").trim();
      pastikanStrukturSah(body.divisi, sub);
      perubahan.divisi = body.divisi;
      perubahan.sub_divisi = sub;
    }

    if (Object.keys(perubahan).length === 0) {
      throw Object.assign(new Error("Tidak ada yang diubah."), { status: 400 });
    }

    const { error } = await db
      .from("app_user")
      .update(perubahan)
      .eq("id", Number(user.id));
    if (error) throw new Error("Gagal menyimpan profil.");

    const { data: segar } = await db
      .from("app_user")
      .select(KOLOM_USER)
      .eq("id", Number(user.id))
      .maybeSingle();

    return { sukses: true, user: keUserPublik(segar as BarisUser) };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const token = tokenDari(request);
    const user = token ? await userDariTokenLonggar(token) : null;
    if (!user) {
      throw Object.assign(new Error("Sesi tidak berlaku. Masuk lagi."), { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      nama?: string;
      nama_panggilan?: string;
      tanggal_lahir?: string;
      divisi?: string;
      sub_divisi?: string;
      foto?: string; // data URL
    };

    const nama = (body.nama ?? "").trim();
    const panggilan = (body.nama_panggilan ?? "").trim();
    const tanggalLahir = (body.tanggal_lahir ?? "").trim();
    const divisi = (body.divisi ?? "").trim();
    const subDivisi = (body.sub_divisi ?? "").trim();

    if (nama.length < 2) {
      throw Object.assign(new Error("Nama minimal 2 karakter."), { status: 400 });
    }
    if (panggilan.length < 2 || panggilan.length > 30) {
      throw Object.assign(new Error("Nama panggilan 2–30 karakter."), { status: 400 });
    }
    // Input HTML type=date mengirim YYYY-MM-DD; tampilannya DD/MM/YYYY
    // urusan peramban. Umur dibatasi wajar supaya salah ketik tahun
    // (mis. 2205) tidak lolos jadi data ulang tahun.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggalLahir)) {
      throw Object.assign(new Error("Tanggal lahir wajib diisi."), { status: 400 });
    }
    const tahun = Number(tanggalLahir.slice(0, 4));
    const tahunKini = new Date().getFullYear();
    if (tahun < tahunKini - 100 || tahun > tahunKini - 10) {
      throw Object.assign(new Error("Tanggal lahir tidak masuk akal."), { status: 400 });
    }
    if (!divisi) {
      throw Object.assign(new Error("Pilih divisi Anda."), { status: 400 });
    }
    pastikanStrukturSah(divisi, subDivisi);

    const db = supabase();
    const perubahan: Record<string, unknown> = {
      nama,
      nama_panggilan: panggilan,
      tanggal_lahir: tanggalLahir,
      divisi,
      sub_divisi: subDivisi,
      profil_lengkap: true,
    };

    if (body.foto) {
      const { data, jenis, ekstensi } = bacaDataUrl(body.foto);
      // Nama berkas memuat waktu supaya mengganti foto tidak tertahan
      // cache lama di ponsel.
      const jalur = `${user.id}/${Date.now()}.${ekstensi}`;

      const { error: eUnggah } = await db.storage
        .from("avatar")
        .upload(jalur, data, { contentType: jenis, upsert: true });

      if (eUnggah) {
        console.error("[profil] unggah avatar:", eUnggah.message);
        throw new Error("Gagal mengunggah foto. Coba lagi.");
      }

      const { data: pub } = db.storage.from("avatar").getPublicUrl(jalur);
      perubahan.avatar_url = pub.publicUrl;
    }

    const { error } = await db.from("app_user").update(perubahan).eq("id", Number(user.id));
    if (error) {
      console.error("[profil] simpan:", error.message);
      throw new Error("Gagal menyimpan profil.");
    }

    const { data: segar } = await db
      .from("app_user")
      .select(KOLOM_USER)
      .eq("id", Number(user.id))
      .maybeSingle();

    return { sukses: true, user: keUserPublik(segar as BarisUser) };
  });
}

/**
 * Sama seperti userDariToken, tetapi TETAP menerima akun berstatus
 * 'menunggu'. Pendaftar baru justru berada di status itu saat mengisi
 * profilnya — kalau ditolak di sini, mereka tidak akan pernah bisa
 * menyelesaikan pendaftaran.
 */
async function userDariTokenLonggar(token: string) {
  const { createHash } = await import("node:crypto");
  const db = supabase();
  const hash = createHash("sha256").update(token).digest("hex");

  const { data: sesi } = await db
    .from("sesi_perangkat")
    .select("user_id")
    .eq("token_hash", hash)
    .maybeSingle();
  if (!sesi) return null;

  const { data } = await db
    .from("app_user")
    .select(KOLOM_USER)
    .eq("id", sesi.user_id)
    .maybeSingle();

  const u = data as BarisUser | null;
  if (!u || !u.aktif || u.status === "ditolak") return null;
  return keUserPublik(u);
}

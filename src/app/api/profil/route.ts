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
import { hapusCacheUser, KOLOM_USER, keUserPublik, type BarisUser } from "@/lib/sesi";
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
      nama?: string;
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
    //
    // Aturan 1.14 (spek 1.2): tiga kolom di bawah punya pagar berbeda —
    // baris app_user pemanggil dibaca dulu sebagai acuan.
    const { data: sayaKini } = await db
      .from("app_user")
      .select("nama, nama_panggilan, tanggal_lahir, panggilan_diubah_pada")
      .eq("id", Number(user.id))
      .maybeSingle();

    // Edit nama lengkap (fitur 1.19/3.2). Perubahan dicatat di jejak
    // audit di bawah supaya HR bisa menelusuri "dulu namanya siapa".
    let namaLamaAudit: string | null = null;
    if (typeof body.nama === "string") {
      const n = body.nama.trim();
      if (n.length < 2 || n.length > 100) {
        throw Object.assign(new Error("Nama lengkap 2–100 karakter."), { status: 400 });
      }
      if (n !== (sayaKini?.nama ?? "")) {
        namaLamaAudit = String(sayaKini?.nama ?? "");
        perubahan.nama = n;
      }
    }

    if (typeof body.nama_panggilan === "string") {
      const p = body.nama_panggilan.trim();
      if (p.length < 2 || p.length > 30) {
        throw Object.assign(new Error("Nama panggilan 2–30 karakter."), { status: 400 });
      }
      // 1x per 7 hari BERJALAN (dihitung dari perubahan terakhir,
      // bukan reset tiap Senin). Mengirim nilai yang sama tidak
      // dihitung ganti — jatahnya tidak hangus sia-sia.
      if (p !== (sayaKini?.nama_panggilan ?? "")) {
        const terakhir = sayaKini?.panggilan_diubah_pada
          ? Date.parse(String(sayaKini.panggilan_diubah_pada))
          : 0;
        const sisaMs = terakhir + 7 * 24 * 3600_000 - Date.now();
        if (sisaMs > 0) {
          const sisaHari = Math.ceil(sisaMs / (24 * 3600_000));
          throw Object.assign(
            new Error(
              `Nama panggilan hanya bisa diganti 1x per minggu — coba lagi ${sisaHari} hari lagi.`,
            ),
            { status: 400 },
          );
        }
        perubahan.nama_panggilan = p;
        perubahan.panggilan_diubah_pada = new Date().toISOString();
      }
    }

    if (typeof body.tanggal_lahir === "string" && body.tanggal_lahir) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.tanggal_lahir)) {
        throw Object.assign(new Error("Format tanggal lahir salah."), { status: 400 });
      }
      // SATU KALI SEUMUR AKUN (harus sama dengan KTP). Setelah terisi,
      // perubahan hanya lewat permintaan manual ke HR/master.
      if (sayaKini?.tanggal_lahir) {
        if (body.tanggal_lahir !== String(sayaKini.tanggal_lahir)) {
          throw Object.assign(
            new Error(
              "Tanggal lahir sudah terkunci. Hubungi HR/master bila ada kesalahan data.",
            ),
            { status: 400 },
          );
        }
        // Nilai sama = tidak dianggap perubahan.
      } else {
        // Usia minimal 16 tahun SAAT INPUT (dihitung dari tanggalnya,
        // bukan tanggal-lahir-minimum yang dipatok mati).
        const lahir = new Date(`${body.tanggal_lahir}T00:00:00+07:00`);
        const kini = new Date();
        let usia = kini.getFullYear() - lahir.getFullYear();
        const belumUlangTahun =
          kini.getMonth() < lahir.getMonth() ||
          (kini.getMonth() === lahir.getMonth() && kini.getDate() < lahir.getDate());
        if (belumUlangTahun) usia -= 1;
        if (!Number.isFinite(usia) || usia < 16 || usia > 100) {
          throw Object.assign(
            new Error("Usia minimal 16 tahun, sesuai KTP."),
            { status: 400 },
          );
        }
        perubahan.tanggal_lahir = body.tanggal_lahir;
      }
    }

    // Divisi TIDAK bisa diubah sendiri (spek 1.2): hanya ketua
    // divisinya, HR, atau master — lewat panel Kelola Pengguna.
    if (typeof body.divisi === "string" && body.divisi) {
      throw Object.assign(
        new Error("Divisi hanya bisa diubah oleh ketua divisi atau HR/master."),
        { status: 403 },
      );
    }

    if (Object.keys(perubahan).length === 0) {
      throw Object.assign(new Error("Tidak ada yang diubah."), { status: 400 });
    }

    const { error } = await db
      .from("app_user")
      .update(perubahan)
      .eq("id", Number(user.id));
    // Baris app_user berubah → buang cache sesinya supaya perubahan
    // (termasuk pencabutan akses) berlaku seketika, bukan menunggu TTL.
    await hapusCacheUser(user.id);
    if (error) throw new Error("Gagal menyimpan profil.");

    // JEJAK AUDIT nama (spek 3.2) — dicatat setelah update sukses
    // supaya tidak ada jejak untuk perubahan yang gagal tersimpan.
    if (namaLamaAudit !== null && typeof perubahan.nama === "string") {
      await db.from("log_audit").insert({
        aktor_id: Number(user.id),
        aktor_nama: namaLamaAudit,
        aksi: "ubah_nama",
        target_id: Number(user.id),
        target_nama: perubahan.nama,
        detail: `Mengubah nama dari "${namaLamaAudit}" menjadi "${perubahan.nama}".`,
      });
    }

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
    // Baris app_user berubah → buang cache sesinya supaya perubahan
    // (termasuk pencabutan akses) berlaku seketika, bukan menunggu TTL.
    await hapusCacheUser(user.id);
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

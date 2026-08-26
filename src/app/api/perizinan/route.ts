// GET   /api/perizinan — pengajuan sendiri (?semua=1: daftar yang perlu
//        diputus — untuk atasan bawahannya, HR/super admin semuanya)
// POST  /api/perizinan — ajukan izin/sakit + surat (WAJIB, jpg/png/pdf)
// PATCH /api/perizinan — setujui / tolak (atasan ybs, admin HR, super admin)
//
// Alur: anggota mengajukan → atasan & admin HR menerima notifikasi +
// push berisi tautan suratnya → salah satu menyetujui/menolak →
// anggota diberi tahu. Bila DISETUJUI, status kehadiran hari itu
// menjadi izin/sakit dan kewajiban 5 video dibebaskan.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { kirimKabar } from "@/lib/notifikasi";
import { pastikanFiturAktif } from "@/lib/fitur-server";

export const dynamic = "force-dynamic";

const PERAN_HR = new Set(["admin_hr", "super_admin", "master"]);
const MAKS_SURAT_BYTE = 1024 * 1024;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasuk(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  return user;
}

function tanggalWibSekarang(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

type BarisIzin = {
  id: number;
  user_id: number;
  tanggal_wib: string;
  jenis: string;
  keterangan: string | null;
  surat_path: string;
  status: string;
  diputuskan_oleh: number | null;
  diputuskan_pada: string | null;
  catatan_keputusan: string | null;
  dibuat_pada: string;
  app_user?: { nama?: string } | { nama?: string }[] | null;
};

/** Lengkapi baris dengan signed URL surat (1 jam) + nama pengaju. */
async function rapikan(baris: BarisIzin[]) {
  if (baris.length === 0) return [];
  const { data: tanda } = await supabase()
    .storage.from("surat")
    .createSignedUrls(baris.map((b) => b.surat_path), 3600);
  const urlPer = new Map<string, string>();
  for (const t of tanda ?? []) {
    if (t.signedUrl && t.path) urlPer.set(t.path, t.signedUrl);
  }
  return baris.map((b) => {
    const embedded = Array.isArray(b.app_user) ? b.app_user[0] : b.app_user;
    return {
      id: String(b.id),
      user_id: String(b.user_id),
      nama: embedded?.nama ?? "",
      tanggal_wib: b.tanggal_wib,
      jenis: b.jenis,
      keterangan: b.keterangan,
      status: b.status,
      catatan_keputusan: b.catatan_keputusan,
      dibuat_pada: b.dibuat_pada,
      diputuskan_pada: b.diputuskan_pada,
      surat_url: urlPer.get(b.surat_path) ?? "",
    };
  });
}

// Relasi ke app_user WAJIB disebut nama constraint-nya: tabel ini punya
// DUA jalur ke app_user (user_id = pengaju, diputuskan_oleh = pemutus).
// Tanpa penunjuk itu, Supabase tidak tahu mana yang diminta dan seluruh
// permintaan gagal — bukan sekadar kolom namanya kosong.
const KOLOM =
  "id, user_id, tanggal_wib, jenis, keterangan, surat_path, status, diputuskan_oleh, diputuskan_pada, catatan_keputusan, dibuat_pada, app_user!perizinan_user_id_fkey(nama)";

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const url = new URL(request.url);
    const db = supabase();

    if (url.searchParams.get("semua") === "1") {
      // Atasan melihat pengajuan bawahannya; HR/super admin semuanya.
      let idBawahan: number[] | null = null;
      if (!PERAN_HR.has(user.role)) {
        const { data: tim } = await db
          .from("tim_anggota")
          .select("anggota_id")
          .eq("atasan_id", Number(user.id));
        idBawahan = (tim ?? []).map((t) => Number(t.anggota_id));
        if (idBawahan.length === 0) return { data: [] };
      }

      let q = db
        .from("perizinan")
        .select(KOLOM)
        .order("dibuat_pada", { ascending: false })
        .limit(100);
      if (idBawahan) q = q.in("user_id", idBawahan);
      const { data, error } = await q;
      if (error) throw new Error("Gagal memuat daftar perizinan.");
      return { data: await rapikan((data ?? []) as unknown as BarisIzin[]) };
    }

    const { data, error } = await db
      .from("perizinan")
      .select(KOLOM)
      .eq("user_id", Number(user.id))
      .order("tanggal_wib", { ascending: false })
      .limit(30);
    if (error) throw new Error("Gagal memuat perizinan.");
    return { data: await rapikan((data ?? []) as unknown as BarisIzin[]) };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const body = (await request.json().catch(() => ({}))) as {
      jenis?: string;
      keterangan?: string;
      suratDataUrl?: string;
    };

    const jenis = body.jenis === "sakit" ? "sakit" : body.jenis === "izin" ? "izin" : null;
    if (!jenis) throw Object.assign(new Error("Pilih jenis: izin atau sakit."), { status: 400 });

    // Surat WAJIB — tanpa bukti, persetujuan atasan tidak berpijak.
    const surat = body.suratDataUrl ?? "";
    const cocok = /^data:(image\/jpeg|image\/png|application\/pdf);base64,/.exec(surat);
    if (!cocok) {
      throw Object.assign(
        new Error("Surat izin/sakit wajib diunggah (foto JPG/PNG atau PDF)."),
        { status: 400 },
      );
    }
    const isi = Buffer.from(surat.slice(surat.indexOf(",") + 1), "base64");
    if (isi.length < 1024 || isi.length > MAKS_SURAT_BYTE) {
      throw Object.assign(new Error("Ukuran surat harus di bawah 1 MB."), { status: 400 });
    }

    const db = supabase();
    const tanggal = tanggalWibSekarang();
    const ext = cocok[1] === "application/pdf" ? "pdf" : cocok[1] === "image/png" ? "png" : "jpg";
    const jalur = `${user.id}/${tanggal}-${jenis}-${Date.now()}.${ext}`;

    const { error: eUnggah } = await db.storage
      .from("surat")
      .upload(jalur, isi, { contentType: cocok[1], upsert: false });
    if (eUnggah) {
      console.error("[perizinan] unggah surat:", eUnggah.message);
      throw new Error("Gagal menyimpan surat. Coba lagi.");
    }

    const { data, error } = await db
      .from("perizinan")
      .insert({
        user_id: Number(user.id),
        tanggal_wib: tanggal,
        jenis,
        keterangan: (body.keterangan ?? "").trim().slice(0, 300) || null,
        surat_path: jalur,
      })
      .select("id")
      .single();

    if (error) {
      await db.storage.from("surat").remove([jalur]);
      if (error.code === "23505") {
        throw Object.assign(new Error("Anda sudah mengajukan izin/sakit untuk hari ini."), {
          status: 409,
        });
      }
      console.error("[perizinan] simpan:", error.message);
      throw new Error("Gagal menyimpan pengajuan.");
    }

    // Kabari atasan (per-orang) dan seluruh admin HR (per-peran) —
    // surat bisa dibuka lewat layar Absensi masing-masing.
    const { data: relasi } = await db
      .from("tim_anggota")
      .select("atasan_id")
      .eq("anggota_id", Number(user.id))
      .maybeSingle();
    if (relasi?.atasan_id) {
      await kirimKabar({
        judul: `Pengajuan ${jenis}: ${user.nama}`,
        isi: `${user.nama} mengajukan ${jenis} untuk hari ini beserta suratnya. Buka Absensi untuk menyetujui.`,
        kategori: "peringatan",
        jenis_peristiwa: "perizinan",
        untukUserIds: [Number(relasi.atasan_id)],
      });
    }
    await kirimKabar({
      judul: `Pengajuan ${jenis}: ${user.nama}`,
      isi: `${user.nama} mengajukan ${jenis} untuk hari ini beserta suratnya. Buka Absensi untuk menyetujui.`,
      kategori: "peringatan",
      jenis_peristiwa: "perizinan",
      untukRole: ["admin_hr"],
    });

    return { sukses: true, id: String(data.id) };
  });
}

export async function PATCH(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const body = (await request.json().catch(() => ({}))) as {
      id?: string;
      keputusan?: string;
      catatan?: string;
    };
    const id = Number(body.id);
    if (!id) throw Object.assign(new Error("Pengajuan tidak disebutkan."), { status: 400 });
    await pastikanFiturAktif(
      user,
      "absensi.approval",
      "Persetujuan izin/sakit sedang dimatikan untuk peran Anda.",
    );

    const keputusan =
      body.keputusan === "disetujui" || body.keputusan === "ditolak" ? body.keputusan : null;
    if (!keputusan) {
      throw Object.assign(new Error("Keputusan harus disetujui atau ditolak."), { status: 400 });
    }

    const db = supabase();
    const { data: baris } = await db
      .from("perizinan")
      .select("id, user_id, jenis, status")
      .eq("id", id)
      .maybeSingle();
    if (!baris) throw Object.assign(new Error("Pengajuan tidak ditemukan."), { status: 404 });
    if (baris.status !== "menunggu") {
      throw Object.assign(new Error("Pengajuan ini sudah diputuskan."), { status: 409 });
    }

    // Yang berhak memutus: admin HR / super admin / master, atau
    // ATASAN LANGSUNG si pengaju. Anggota tidak bisa menyetujui
    // pengajuannya sendiri.
    if (!PERAN_HR.has(user.role)) {
      const { data: relasi } = await db
        .from("tim_anggota")
        .select("id")
        .eq("atasan_id", Number(user.id))
        .eq("anggota_id", Number(baris.user_id))
        .maybeSingle();
      if (!relasi) {
        throw Object.assign(new Error("Anda tidak berwenang memutus pengajuan ini."), {
          status: 403,
        });
      }
    }

    const { error } = await db
      .from("perizinan")
      .update({
        status: keputusan,
        diputuskan_oleh: Number(user.id),
        diputuskan_pada: new Date().toISOString(),
        catatan_keputusan: (body.catatan ?? "").trim().slice(0, 300) || null,
      })
      .eq("id", id)
      .eq("status", "menunggu");
    if (error) {
      console.error("[perizinan] putuskan:", error.message);
      throw new Error("Gagal menyimpan keputusan.");
    }

    await kirimKabar({
      judul:
        keputusan === "disetujui"
          ? `Pengajuan ${baris.jenis} disetujui`
          : `Pengajuan ${baris.jenis} ditolak`,
      isi:
        keputusan === "disetujui"
          ? `Diputuskan oleh ${user.nama}. Status kehadiran Anda hari itu menjadi "${baris.jenis}" dan kewajiban 5 video dibebaskan.`
          : `Diputuskan oleh ${user.nama}.${body.catatan ? ` Catatan: ${String(body.catatan).slice(0, 140)}` : ""}`,
      kategori: keputusan === "disetujui" ? "sukses" : "peringatan",
      jenis_peristiwa: "perizinan",
      untukUserIds: [Number(baris.user_id)],
    });

    return { sukses: true };
  });
}

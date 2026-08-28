// GET  /api/absensi — riwayat absensi 7 hari (sendiri; ?semua=1 untuk HR)
// POST /api/absensi — kirim absen (masuk/pulang) dengan swafoto + GPS
//
// Prinsip anti-akal-akalan:
// - Waktu absen diambil dari jam SERVER; jam ponsel diabaikan sepenuhnya.
// - Koordinat GPS wajib; alamat (geotag) dicari server lewat OpenStreetMap.
// - Foto wajib jepretan kamera langsung — sisi aplikasi memakai kamera
//   depan hidup (getUserMedia), tidak ada tombol pilih dari galeri.
// - Satu absen masuk + satu absen pulang per orang per hari (dikunci
//   constraint unik di database, bukan cuma di layar).
//
// Retensi: baris + foto dihapus otomatis setelah 7 hari. Pembersihan
// dijalankan di sini setiap kali fitur dipakai — tanpa cron eksternal,
// jadi tidak ada komponen tambahan yang bisa lupa dinyalakan.
import { after } from "next/server";
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { pastikanFiturAktif } from "@/lib/fitur-server";
import { bolehDashboard } from "@/lib/dashboard-akses";
import { catatTugasStreak } from "@/lib/streak";
import { beriKoin } from "@/lib/koin";

export const dynamic = "force-dynamic";

const RETENSI_HARI = 7;
// Aplikasi mengompres foto ke ≤100 KB; 150 KB di sini adalah penjaga
// terakhir supaya penyimpanan tidak membengkak lewat jalur lain.
const MAKS_FOTO_BYTE = 150 * 1024;
const BOLEH_LIHAT_SEMUA = new Set(["admin_hr", "super_admin", "master"]);

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasuk(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  return user;
}

/** Tanggal hari ini menurut WIB (bukan zona server Vercel yang UTC). */
function tanggalWibSekarang(): string {
  const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10);
}

/**
 * Hapus absensi lebih tua dari 7 hari: foto di storage dulu, baru
 * barisnya. Urutan ini disengaja — kalau penghapusan foto gagal di
 * tengah, barisnya masih ada sebagai penunjuk untuk percobaan
 * berikutnya; kebalikannya akan meninggalkan foto yatim selamanya.
 */
async function bersihkanUsang() {
  try {
    const db = supabase();
    const batas = new Date(Date.now() - RETENSI_HARI * 24 * 60 * 60 * 1000).toISOString();
    const { data: usang } = await db
      .from("absensi")
      .select("id, foto_path")
      .lt("waktu", batas)
      .limit(200);
    if (!usang || usang.length === 0) return;

    await db.storage.from("absensi").remove(usang.map((u) => u.foto_path));
    await db.from("absensi").delete().in("id", usang.map((u) => u.id));
  } catch (e) {
    // Pembersihan boleh gagal diam-diam — dicoba lagi pada pemakaian
    // berikutnya. Jangan sampai absen orang gagal karena bersih-bersih.
    console.error("[absensi] bersihkan:", e);
  }
}

/**
 * Geotagging: koordinat → nama tempat, via Nominatim (OpenStreetMap).
 * Gagal bukan masalah fatal — koordinat tetap tersimpan dan tautan
 * peta tetap bisa dibuka; kolom alamat saja yang kosong.
 */
async function cariAlamat(lat: number, lng: number): Promise<string | null> {
  try {
    const kendali = new AbortController();
    const timer = setTimeout(() => kendali.abort(), 6000);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17&accept-language=id`,
      {
        headers: { "User-Agent": "PRI-SuperApp/1.0 (absensi internal)" },
        signal: kendali.signal,
      },
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = (await res.json()) as { display_name?: string };
    const alamat = (json.display_name ?? "").trim();
    return alamat ? alamat.slice(0, 300) : null;
  } catch {
    return null;
  }
}

type BarisAbsensi = {
  id: number;
  user_id: number;
  jenis: string;
  waktu: string;
  tanggal_wib: string;
  lat: number;
  lng: number;
  akurasi_m: number | null;
  alamat: string | null;
  foto_path: string;
  app_user?: { nama: string; jabatan: string | null } | null;
};

/** Lengkapi baris-baris absensi dengan signed URL foto (1 jam). */
async function pasangFoto(baris: BarisAbsensi[]) {
  if (baris.length === 0) return [];
  const db = supabase();
  const { data: tanda } = await db.storage
    .from("absensi")
    .createSignedUrls(baris.map((b) => b.foto_path), 3600);
  const petaUrl = new Map<string, string>();
  for (const t of tanda ?? []) {
    if (t.signedUrl && t.path) petaUrl.set(t.path, t.signedUrl);
  }
  return baris.map((b) => ({
    id: String(b.id),
    user_id: String(b.user_id),
    nama: b.app_user?.nama ?? "",
    jabatan: b.app_user?.jabatan ?? "",
    jenis: b.jenis,
    waktu: b.waktu,
    tanggal_wib: b.tanggal_wib,
    lat: b.lat,
    lng: b.lng,
    akurasi_m: b.akurasi_m,
    alamat: b.alamat,
    foto_url: petaUrl.get(b.foto_path) ?? "",
  }));
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    after(bersihkanUsang);

    const url = new URL(request.url);
    const mauSemua = url.searchParams.get("semua") === "1";
    if (
      mauSemua &&
      !BOLEH_LIHAT_SEMUA.has(user.role) &&
      // Fitur 1.19/3.3.a: akses dashboard "absensi" = boleh MEMBACA
      // absensi semua anggota (baca-saja; POST tetap dijaga).
      !(await bolehDashboard(user.role, "absensi"))
    ) {
      throw Object.assign(new Error("Hanya HR yang boleh melihat absensi semua anggota."), {
        status: 403,
      });
    }

    const db = supabase();
    let q = db
      .from("absensi")
      .select("id, user_id, jenis, waktu, tanggal_wib, lat, lng, akurasi_m, alamat, foto_path, app_user(nama, jabatan)")
      .order("waktu", { ascending: false })
      .limit(300);
    if (!mauSemua) q = q.eq("user_id", Number(user.id));

    const { data, error } = await q;
    if (error) {
      console.error("[absensi] baca:", error.message);
      throw new Error("Gagal memuat riwayat absensi.");
    }

    const daftar = await pasangFoto((data ?? []) as unknown as BarisAbsensi[]);
    return { data: daftar, tanggal_hari_ini: tanggalWibSekarang() };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const body = (await request.json().catch(() => ({}))) as {
      jenis?: string;
      lat?: number;
      lng?: number;
      akurasi?: number;
      fotoDataUrl?: string;
    };

    await pastikanFiturAktif(user, "absensi.lihat", "Absensi sedang dimatikan untuk peran Anda.");

    const jenis = body.jenis === "pulang" ? "pulang" : body.jenis === "masuk" ? "masuk" : null;
    if (!jenis) {
      throw Object.assign(new Error("Jenis absen harus masuk atau pulang."), { status: 400 });
    }

    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw Object.assign(
        new Error("Lokasi GPS tidak terbaca. Nyalakan GPS lalu coba lagi."),
        { status: 400 },
      );
    }

    const foto = body.fotoDataUrl ?? "";
    if (!foto.startsWith("data:image/jpeg;base64,")) {
      throw Object.assign(new Error("Foto absen tidak terbaca. Ulangi pengambilan foto."), {
        status: 400,
      });
    }
    const isiFoto = Buffer.from(foto.slice("data:image/jpeg;base64,".length), "base64");
    if (isiFoto.length < 1024 || isiFoto.length > MAKS_FOTO_BYTE) {
      throw Object.assign(new Error("Ukuran foto tidak wajar. Ulangi pengambilan foto."), {
        status: 400,
      });
    }

    const db = supabase();
    const tanggal = tanggalWibSekarang();

    // Tolak lebih awal dengan pesan ramah; constraint unik di database
    // tetap menjadi penjaga terakhir bila dua permintaan datang bersamaan.
    const { data: sudah } = await db
      .from("absensi")
      .select("waktu")
      .eq("user_id", Number(user.id))
      .eq("tanggal_wib", tanggal)
      .eq("jenis", jenis)
      .maybeSingle();
    if (sudah) {
      throw Object.assign(
        new Error(`Anda sudah absen ${jenis} hari ini.`),
        { status: 409 },
      );
    }

    const jalur = `${user.id}/${tanggal}-${jenis}-${Date.now()}.jpg`;
    const { error: eUnggah } = await db.storage
      .from("absensi")
      .upload(jalur, isiFoto, { contentType: "image/jpeg", upsert: false });
    if (eUnggah) {
      console.error("[absensi] unggah:", eUnggah.message);
      throw new Error("Gagal menyimpan foto absen. Coba lagi.");
    }

    const alamat = await cariAlamat(lat, lng);

    const { data: baris, error: eSimpan } = await db
      .from("absensi")
      .insert({
        user_id: Number(user.id),
        jenis,
        tanggal_wib: tanggal,
        lat,
        lng,
        akurasi_m: Number.isFinite(Number(body.akurasi)) ? Number(body.akurasi) : null,
        alamat,
        foto_path: jalur,
      })
      .select("id, user_id, jenis, waktu, tanggal_wib, lat, lng, akurasi_m, alamat, foto_path")
      .single();

    if (eSimpan) {
      // Baris gagal → foto yang telanjur naik ikut dibuang, supaya
      // tidak ada foto yatim yang tinggal selamanya di storage.
      await db.storage.from("absensi").remove([jalur]);
      if (eSimpan.code === "23505") {
        throw Object.assign(new Error(`Anda sudah absen ${jenis} hari ini.`), { status: 409 });
      }
      console.error("[absensi] simpan:", eSimpan.message);
      throw new Error("Gagal menyimpan absen. Coba lagi.");
    }

    // Absen MASUK = "tugas harian" task streak (spek 4.1). Dijalankan
    // setelah balasan terkirim; gagal mencatat streak tidak boleh
    // menggagalkan absen itu sendiri.
    if (jenis === "masuk") {
      const idUser = Number(user.id);
      after(async () => {
        try {
          await catatTugasStreak(idUser);
        } catch (e) {
          console.error("[absensi] streak:", e);
        }
        // Koin absen (spek 1.16) — referensi tanggal = 1x per hari.
        await beriKoin(idUser, "absen", tanggal);
      });
    }

    after(bersihkanUsang);
    const [rapi] = await pasangFoto([baris as unknown as BarisAbsensi]);
    return { sukses: true, data: rapi };
  });
}

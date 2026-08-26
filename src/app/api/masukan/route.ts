// Masukan pengembang: laporan bug / kritik / saran dari pengguna.
//
// POST — semua pengguna login boleh mengirim.
// GET  — HANYA super admin / master (developer aplikasi); masukan
//        bukan konsumsi pengurus lain, apalagi sesama anggota.
//
// Setiap kiriman juga membunyikan notifikasi ke super admin supaya
// tidak perlu rajin-rajin membuka daftarnya.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { kirimKabar } from "@/lib/notifikasi";

export const dynamic = "force-dynamic";

const PENGEMBANG = new Set(["super_admin", "master"]);

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
    if (!PENGEMBANG.has(user.role)) {
      throw Object.assign(new Error("Hanya pengembang yang boleh membaca masukan."), {
        status: 403,
      });
    }
    const { data, error } = await supabase()
      .from("masukan")
      .select("id, nama, jenis, isi, dibuat_pada")
      .order("id", { ascending: false })
      .limit(100);
    if (error) throw new Error("Gagal memuat masukan.");
    return { data: (data ?? []).map((m) => ({ ...m, id: String(m.id) })) };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const body = (await request.json().catch(() => ({}))) as {
      jenis?: string;
      isi?: string;
    };
    const jenis = ["bug", "kritik", "saran"].includes(body.jenis ?? "")
      ? (body.jenis as string)
      : null;
    if (!jenis) throw Object.assign(new Error("Pilih jenis: bug, kritik, atau saran."), { status: 400 });
    const isi = (body.isi ?? "").trim();
    if (isi.length < 5) {
      throw Object.assign(new Error("Tulis masukannya (min. 5 huruf)."), { status: 400 });
    }

    const { error } = await supabase().from("masukan").insert({
      user_id: Number(user.id),
      nama: user.nama,
      jenis,
      isi: isi.slice(0, 2000),
    });
    if (error) {
      console.error("[masukan] simpan:", error.message);
      throw new Error("Gagal mengirim masukan.");
    }

    // 'master' disebut eksplisit: filter push/notifikasi mencocokkan
    // role persis, dan master adalah developer utamanya.
    await kirimKabar({
      judul: `${jenis === "bug" ? "🐞 Laporan bug" : jenis === "kritik" ? "Kritik" : "Saran"} dari ${user.nama}`,
      isi: isi.slice(0, 200),
      kategori: "peringatan",
      jenis_peristiwa: "masukan",
      untukRole: ["super_admin", "master"],
    });

    return { sukses: true };
  });
}

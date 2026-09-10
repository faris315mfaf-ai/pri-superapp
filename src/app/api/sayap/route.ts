// /api/sayap — daftar Sayap Partai (10 Sep 2026).
//   GET            → semua sayap (bawaan + tambahan aktif) untuk pemilih.
//                    ?semua=1 (pengelola) ikut menampilkan yang nonaktif.
//   POST {nilai, label}        → tambah sayap baru: Divisi HR / superadmin / master.
//   PATCH {id, aktif}          → aktifkan/nonaktifkan sayap tambahan (pengelola).
// Sayap bawaan (SUB_SAYAP di lib/struktur) tidak bisa diubah dari sini.
import { bungkus } from "@/lib/api-helper";
import { adalahHR } from "@/lib/hr";
import { buangCacheSayap, daftarSayap } from "@/lib/sayap";
import { pastikanMasuk } from "@/lib/sesi";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Pengelola = { role?: string; divisi?: string | null; modul_izin?: unknown };
function bolehKelola(u: Pengelola): boolean {
  return u.role === "master" || u.role === "superadmin" || adalahHR(u);
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const semua = await daftarSayap();
    const url = new URL(request.url);
    const tampilSemua = url.searchParams.get("semua") === "1" && bolehKelola(user);
    return {
      boleh_kelola: bolehKelola(user),
      data: (tampilSemua ? semua : semua.filter((s) => s.aktif)).map((s) => ({
        id: s.id,
        nilai: s.nilai,
        label: s.label,
        bawaan: s.bawaan,
        aktif: s.aktif,
      })),
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!bolehKelola(user)) {
      throw Object.assign(new Error("Hanya Divisi HR, superadmin, atau master yang boleh menambah sayap."), { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { nilai?: string; label?: string };
    const nilai = String(body.nilai ?? "").trim().replace(/\s+/g, " ").toUpperCase();
    const label = String(body.label ?? "").trim().replace(/\s+/g, " ");
    if (nilai.length < 2 || nilai.length > 30) {
      throw Object.assign(new Error("Singkatan sayap 2–30 huruf, mis. PERI."), { status: 400 });
    }
    if (!/^[A-Z0-9 .&-]+$/.test(nilai)) {
      throw Object.assign(new Error("Singkatan hanya huruf, angka, spasi, titik, & atau -."), { status: 400 });
    }
    if (label.length < 3 || label.length > 120) {
      throw Object.assign(new Error("Nama panjang sayap 3–120 huruf."), { status: 400 });
    }
    const ada = (await daftarSayap(true)).find((s) => s.nilai.toUpperCase() === nilai);
    if (ada) throw Object.assign(new Error(`Sayap ${nilai} sudah ada.`), { status: 409 });
    const { data, error } = await supabase()
      .from("sayap_partai")
      .insert({ nilai, label: label.startsWith(nilai) ? label : `${nilai} — ${label}`, aktif: true, dibuat_oleh: user.nama })
      .select("id, nilai, label")
      .single();
    if (error) {
      console.error("[sayap] tambah:", error.message);
      throw new Error("Gagal menambah sayap.");
    }
    buangCacheSayap();
    return { sukses: true, data };
  });
}

export async function PATCH(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!bolehKelola(user)) {
      throw Object.assign(new Error("Hanya Divisi HR, superadmin, atau master yang boleh mengubah sayap."), { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { id?: number | string; aktif?: boolean };
    const id = Number(body.id);
    if (!id) throw Object.assign(new Error("Sayap tidak disebutkan."), { status: 400 });
    const { error } = await supabase()
      .from("sayap_partai")
      .update({ aktif: body.aktif !== false })
      .eq("id", id);
    if (error) throw new Error("Gagal mengubah sayap.");
    buangCacheSayap();
    return { sukses: true };
  });
}

// Keyword wajib laporan video (fitur 1.22.x/keyword).
//
// Pimpinan Redaksi TV Rakyat menetapkan keyword/tema yang WAJIB diangkat
// seluruh anggota di video laporannya (mis. "BPJS"). Anggota memilih
// keyword ini saat melaporkan videonya.
//
// GET    → keyword AKTIF (semua pengguna, utk form laporan); Pimred
//          melihat SEMUA (termasuk nonaktif) + flag pimred:true.
// POST   { keyword }            → tambah (Pimred)
// PATCH  { id }                 → aktif/nonaktif (Pimred)
// PATCH  { id, aksi:"selesai" } → tandai SELESAI = DISEMBUNYIKAN (26 Sep
//                                 2026): hilang dari daftar & pilihan
//                                 anggota; datanya TETAP tersimpan. Pengelola.
// PATCH  { id, aksi:"buka" }    → munculkan lagi — HANYA Pimpinan Redaksi /
//                                 Superadmin / master (permintaan user).
// DELETE                        → DITOLAK (13 Sep 2026): kategori tidak
//                                 pernah dihapus — laporan & unggahan lama
//                                 merujuk namanya. Sembunyikan sementara
//                                 (nonaktif) atau tandai selesai.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { adalahPimred, adalahTvrNasional } from "@/lib/jabatan";
import { bolehKelolaTvr } from "@/lib/tv-tim";
import { KATEGORI_TETAP, kategoriTetap } from "@/lib/kategori-tetap";
import { petaKategoriSelesai, ubahKategoriSelesai } from "@/lib/kategori-selesai";

export const dynamic = "force-dynamic";

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasuk(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku."), { status: 401 });
  return user;
}

// Dulu hanya Pimpinan Redaksi. Sejak 12 Sep 2026 seluruh tim TV Rakyat
// Official (plus Direktur Eksekutif & TV Rakyat Nasional) — orang yang
// sama yang menerbitkan video wajib, dan kategori ditambahkan langsung
// dari layar itu. Aturannya satu, di bolehKelolaTvr.
async function pastikanPengelola(request: Request) {
  const user = await pastikanMasuk(request);
  if (!(await bolehKelolaTvr(user))) {
    throw Object.assign(
      new Error("Hanya tim TV Rakyat Official & pimpinan yang boleh mengatur kategori."),
      { status: 403 },
    );
  }
  return user;
}

type BarisKeyword = {
  id: number | string;
  keyword: string;
  aktif: boolean | null;
  selesai?: boolean | null;
  selesai_pada?: string | null;
};

// Pengelola melihat semua; anggota hanya yang AKTIF dan BELUM SELESAI —
// itulah yang boleh dipilih saat mengunggah. Bila kolom `selesai` belum
// ada (sql/51 belum dijalankan), jatuh ke bentuk lama supaya daftar
// kategori tidak lenyap gara-gara migrasi yang tertinggal.
async function daftarKeyword(pengelola: boolean): Promise<BarisKeyword[]> {
  const db = supabase();
  let q = db
    .from("keyword_wajib")
    .select("id, keyword, aktif, selesai, selesai_pada")
    .order("dibuat_pada", { ascending: false });
  if (!pengelola) q = q.eq("aktif", true).eq("selesai", false);
  const { data, error } = await q;
  if (!error) return (data ?? []) as BarisKeyword[];
  if (error.code !== "42703") throw new Error("Gagal memuat keyword.");
  let lama = db
    .from("keyword_wajib")
    .select("id, keyword, aktif")
    .order("dibuat_pada", { ascending: false });
  if (!pengelola) lama = lama.eq("aktif", true);
  const ulang = await lama;
  if (ulang.error) throw new Error("Gagal memuat keyword.");
  return (ulang.data ?? []) as BarisKeyword[];
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    // "pimred" dipertahankan namanya untuk klien lama; artinya kini
    // "boleh mengelola", bukan hanya Pimpinan Redaksi.
    const pimred = adalahPimred(user) || (await bolehKelolaTvr(user));
    // TV Rakyat Nasional melihat semua (termasuk yang selesai) untuk insight;
    // anggota biasa hanya yang boleh dipilih.
    const lihatSemua = pimred || adalahTvrNasional(user);
    const [data, selesaiPer] = await Promise.all([daftarKeyword(lihatSemua), petaKategoriSelesai()]);
    // Kategori TETAP di depan: ia ada di kode, bukan di database, jadi
    // tidak bisa terhapus dan tidak ikut hilang kalau tabelnya kosong.
    const tetap = KATEGORI_TETAP.map((nama) => ({
      id: kategoriTetap.id(nama),
      keyword: nama,
      aktif: true,
      selesai: false,
      selesai_pada: null as string | null,
      tetap: true,
    }));
    const dariDb = data
      .filter((k) => !kategoriTetap.adalah(String(k.keyword)))
      .map((k) => {
        const catatan = selesaiPer.get(String(k.id));
        return {
          id: String(k.id),
          keyword: String(k.keyword),
          aktif: k.aktif === true,
          selesai: k.selesai === true || catatan !== undefined,
          selesai_pada: k.selesai_pada ?? (catatan || null),
          tetap: false,
        };
      })
      // Yang selesai (disembunyikan) hanya terlihat oleh pengelola & TV Nasional.
      .filter((k) => lihatSemua || !k.selesai);
    return { data: [...tetap, ...dariDb], pimred, boleh_munculkan: adalahPimred(user) };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanPengelola(request);
    const body = (await request.json().catch(() => ({}))) as { keyword?: string };
    const keyword = (body.keyword ?? "").trim().slice(0, 60);
    if (keyword.length < 2) {
      throw Object.assign(new Error("Keyword minimal 2 karakter."), { status: 400 });
    }
    if (kategoriTetap.adalah(keyword)) {
      throw Object.assign(new Error(`"${keyword}" sudah ada sebagai kategori tetap.`), { status: 409 });
    }
    const { error } = await supabase()
      .from("keyword_wajib")
      .insert({ keyword, dibuat_oleh_id: Number(user.id), aktif: true });
    if (error) {
      if (error.code === "23505") {
        throw Object.assign(new Error(`Keyword "${keyword}" sudah ada.`), { status: 409 });
      }
      throw new Error("Gagal menambah keyword.");
    }
    return { sukses: true };
  });
}

export async function PATCH(request: Request) {
  return bungkus(async () => {
    const user = await pastikanPengelola(request);
    const body = (await request.json().catch(() => ({}))) as {
      id?: string | number;
      aksi?: "toggle" | "selesai" | "buka";
    };
    if (kategoriTetap.adalahId(String(body.id ?? ""))) {
      throw Object.assign(new Error("Kategori tetap tidak bisa diubah atau dihapus."), { status: 400 });
    }
    const id = Number(body.id ?? 0);
    if (!id) throw Object.assign(new Error("Keyword tidak disebutkan."), { status: 400 });
    const db = supabase();
    const aksi = body.aksi === "selesai" || body.aksi === "buka" ? body.aksi : "toggle";

    if (aksi !== "toggle") {
      // SELESAI = DISEMBUNYIKAN: tidak ada baris laporan, unggahan, atau
      // angka yang disentuh. Menghapus datanya berarti kehilangan bukti
      // kerja untuk acara yang justru sudah usai.
      const selesai = aksi === "selesai";
      if (!selesai && !adalahPimred(user)) {
        throw Object.assign(
          new Error("Hanya Pimpinan Redaksi / Superadmin yang bisa memunculkan lagi kategori yang disembunyikan."),
          { status: 403 },
        );
      }
      await ubahKategoriSelesai(id, selesai);
      return { sukses: true, selesai };
    }

    const { data: row } = await db
      .from("keyword_wajib")
      .select("aktif")
      .eq("id", id)
      .maybeSingle();
    if (!row) throw Object.assign(new Error("Keyword tidak ditemukan."), { status: 404 });
    const { error } = await db.from("keyword_wajib").update({ aktif: !row.aktif }).eq("id", id);
    if (error) throw new Error("Gagal mengubah keyword.");
    return { sukses: true, aktif: !row.aktif };
  });
}

export async function DELETE(request: Request) {
  return bungkus(async () => {
    await pastikanPengelola(request);
    // Menghapus kategori membuat ribuan laporan lama kehilangan
    // pengelompokannya tanpa jejak. Dua jalan yang tersedia sudah cukup:
    // nonaktif (disembunyikan sementara, bisa dinyalakan lagi) dan
    // selesai (acara usai, data tetap tampil).
    throw Object.assign(
      new Error("Kategori tidak bisa dihapus. Nonaktifkan untuk menyembunyikannya sementara, atau tandai selesai."),
      { status: 405 },
    );
  });
}

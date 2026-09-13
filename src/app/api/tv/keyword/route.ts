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
// PATCH  { id, aksi:"selesai" } → tandai SELESAI (13 Sep 2026): acaranya
//                                 sudah lewat, kreator tidak bisa memilihnya
//                                 lagi; datanya TETAP tersimpan & tampil.
// PATCH  { id, aksi:"buka" }    → buka lagi kategori yang selesai
// DELETE                        → DITOLAK (13 Sep 2026): kategori tidak
//                                 pernah dihapus — laporan & unggahan lama
//                                 merujuk namanya. Sembunyikan sementara
//                                 (nonaktif) atau tandai selesai.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { adalahPimred } from "@/lib/jabatan";
import { bolehKelolaTvr } from "@/lib/tv-tim";
import { KATEGORI_TETAP, kategoriTetap } from "@/lib/kategori-tetap";

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
    const data = await daftarKeyword(pimred);
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
      .map((k) => ({
        id: String(k.id),
        keyword: String(k.keyword),
        aktif: k.aktif === true,
        selesai: k.selesai === true,
        selesai_pada: k.selesai_pada ?? null,
        tetap: false,
      }));
    return { data: [...tetap, ...dariDb], pimred };
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
    await pastikanPengelola(request);
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
      // SELESAI hanya menutup pintu masuk: tidak ada baris laporan,
      // unggahan, atau angka yang disentuh. Menghapus datanya berarti
      // kehilangan bukti kerja untuk acara yang justru sudah usai.
      const selesai = aksi === "selesai";
      const { data: row, error } = await db
        .from("keyword_wajib")
        .update({ selesai, selesai_pada: selesai ? new Date().toISOString() : null })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) {
        if (error.code === "42703") {
          throw Object.assign(
            new Error("Fitur selesai belum siap di database: jalankan pri-sql 51_kategori_selesai.sql dulu."),
            { status: 503 },
          );
        }
        throw new Error("Gagal mengubah keyword.");
      }
      if (!row) throw Object.assign(new Error("Keyword tidak ditemukan."), { status: 404 });
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

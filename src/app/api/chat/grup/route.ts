// Grup chat divisi (spek 1.14 bagian 4.2).
//
// Keanggotaan DITURUNKAN dari app_user.divisi — semua anggota aktif
// satu divisi otomatis satu grup; pindah divisi = otomatis pindah grup;
// tidak bisa keluar manual selama masih terdaftar di divisinya.
// Admin grup = kepala divisi (posisi_divisi 'kepala') — boleh menarik
// pesan siapa pun; anggota hanya pesan sendiri. Pengawas (super admin/
// master) bisa membaca semua grup, termasuk pesan yang ditarik, sampai
// retensi 7 hari menghapusnya permanen (aturan sama dengan chat 1-1).
//
// GET              → info grup saya (cuplikan + belum dibaca)
// GET ?pesan=1     → pesan grup saya (?sejak=ID utk polling tambahan)
// GET ?pantau=<divisi> → pengawas membaca grup divisi mana pun
// GET ?anggota=1   → daftar anggota grup saya (nama, foto, kepala)
// POST {aksi:"kirim", isi, gambar?}     → kirim ke grup saya
// POST {aksi:"hapus_pesan", pesan_id}   → tarik pesan
// POST {aksi:"info", nama?, foto?}      → kustomisasi nama/foto grup
//                                          (kepala divisi / pengurus)
// PATCH            → tandai semua pesan grup saya terbaca
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { after } from "next/server";
import { anggotaGrupDivisi, bolehIkutGrupDivisi } from "@/lib/zona";

export const dynamic = "force-dynamic";

const PENGAWAS = new Set(["super_admin", "master"]);
const BATAS_PESAN = 300;
const RETENSI_HARI = 7;
const JENIS_GAMBAR = ["image/jpeg", "image/png", "image/webp"] as const;
const MAKS_BYTE_GAMBAR = 150 * 1024;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasuk(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  return user;
}

/** Hapus pesan grup lebih tua dari retensi + file gambarnya (best-effort). */
// Penahan 10 menit per instance (1 Sep 2026 — pemangkasan beban Supabase).
let sapuGrupTerakhirMs = 0;

async function bersihkanPesanGrupLama() {
  try {
    if (Date.now() - sapuGrupTerakhirMs < 10 * 60_000) return;
    sapuGrupTerakhirMs = Date.now();
    const batas = new Date(Date.now() - RETENSI_HARI * 24 * 60 * 60 * 1000).toISOString();
    const db = supabase();
    const { data: bergambar } = await db
      .from("chat_pesan_grup")
      .select("gambar_url")
      .lt("dibuat_pada", batas)
      .not("gambar_url", "is", null)
      .limit(100);
    const jalur = (bergambar ?? [])
      .map((p) => String(p.gambar_url ?? "").split("/chat/")[1] ?? "")
      .filter(Boolean);
    if (jalur.length > 0) await db.storage.from("chat").remove(jalur);
    await db.from("chat_pesan_grup").delete().lt("dibuat_pada", batas);
  } catch (e) {
    console.error("[grup] bersihkan:", e);
  }
}

async function unggahGambarGrup(dataUrl: string, divisi: string): Promise<string> {
  const m = /^data:([a-z/+.-]+);base64,(.+)$/i.exec(dataUrl ?? "");
  if (!m) throw Object.assign(new Error("Format gambar tidak dikenali."), { status: 400 });
  const jenis = m[1].toLowerCase();
  if (!JENIS_GAMBAR.includes(jenis as (typeof JENIS_GAMBAR)[number])) {
    throw Object.assign(new Error("Gambar harus JPG, PNG, atau WebP."), { status: 400 });
  }
  const data = Buffer.from(m[2], "base64");
  if (data.length === 0 || data.length > MAKS_BYTE_GAMBAR) {
    throw Object.assign(
      new Error("Gambar terlalu besar — maksimal 100KB setelah kompresi."),
      { status: 400 },
    );
  }
  const ekstensi = jenis === "image/jpeg" ? "jpg" : jenis === "image/png" ? "png" : "webp";
  const jalur = `grup-${divisi.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ekstensi}`;
  const db = supabase();
  const { error } = await db.storage
    .from("chat")
    .upload(jalur, data, { contentType: jenis, upsert: false });
  if (error) {
    console.error("[grup] unggah gambar:", error.message);
    throw new Error("Gagal mengunggah gambar. Coba lagi.");
  }
  return db.storage.from("chat").getPublicUrl(jalur).data.publicUrl;
}

type PesanGrupKeluar = {
  id: string;
  pengirim_id: string;
  pengirim_nama: string;
  pengirim_avatar: string;
  isi: string;
  gambar_url: string;
  dibuat_pada: string;
  dihapus?: boolean;
};

/** Ambil pesan satu grup + nama pengirimnya (sekali kueri nama). */
async function ambilPesanGrup(
  divisi: string,
  sejak: number,
  sertakanDihapus: boolean,
): Promise<PesanGrupKeluar[]> {
  const db = supabase();
  let q = db
    .from("chat_pesan_grup")
    .select("id, pengirim_id, isi, gambar_url, dibuat_pada, dihapus_pada")
    .eq("divisi", divisi)
    .order("id", { ascending: true })
    .limit(200);
  if (!sertakanDihapus) q = q.is("dihapus_pada", null);
  if (sejak) q = q.gt("id", sejak);
  const { data: pesan } = await q;

  const idPengirim = [...new Set((pesan ?? []).map((p) => Number(p.pengirim_id)))];
  const namaPer = new Map<number, { nama: string; avatar_url: string }>();
  if (idPengirim.length > 0) {
    const { data: orang } = await db
      .from("app_user")
      .select("id, nama, avatar_url")
      .in("id", idPengirim);
    for (const o of orang ?? []) {
      namaPer.set(Number(o.id), { nama: o.nama, avatar_url: o.avatar_url ?? "" });
    }
  }

  return (pesan ?? []).map((p) => ({
    id: String(p.id),
    pengirim_id: String(p.pengirim_id),
    pengirim_nama: namaPer.get(Number(p.pengirim_id))?.nama ?? "",
    pengirim_avatar: namaPer.get(Number(p.pengirim_id))?.avatar_url ?? "",
    isi: p.isi,
    gambar_url: p.gambar_url ?? "",
    dibuat_pada: p.dibuat_pada,
    ...(sertakanDihapus ? { dihapus: p.dihapus_pada != null } : {}),
  }));
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const idKu = Number(user.id);
    const url = new URL(request.url);
    const db = supabase();
    const pengawas = PENGAWAS.has(user.role);
    after(bersihkanPesanGrupLama);

    // --- Pengawas membaca grup divisi mana pun (termasuk pesan ditarik) ---
    const pantau = url.searchParams.get("pantau");
    if (pantau) {
      if (!pengawas) {
        throw Object.assign(new Error("Hanya super admin yang boleh memantau grup."), {
          status: 403,
        });
      }
      return { divisi: pantau, data: await ambilPesanGrup(pantau, 0, true) };
    }

    const divisi = (user.divisi ?? "").trim();
    if (!divisi) return { divisi: "", anggota: 0, data: [] };
    // Aturan zona (spek 1.18/2.6): anggota di luar cakupan zona ketua
    // divisinya tidak tergabung di grup — layarnya seperti tanpa grup.
    if (!(await bolehIkutGrupDivisi(idKu, divisi))) {
      return { divisi: "", anggota: 0, data: [] };
    }

    // --- Daftar anggota grup saya (spek 1.15) ---
    if (url.searchParams.get("anggota") === "1") {
      const { data: para } = await db
        .from("app_user")
        .select("id, nama, avatar_url, posisi_divisi, jabatan")
        .eq("divisi", divisi)
        .eq("aktif", true)
        .eq("status", "aktif")
        .order("posisi_divisi", { ascending: false }) // kepala duluan
        .order("nama")
        .limit(300);
      // Saring per cakupan zona ketua (spek 2.6); null = tanpa saringan.
      const zonaAnggota = await anggotaGrupDivisi(divisi);
      const tersaring = (para ?? []).filter(
        (a) => zonaAnggota === null || zonaAnggota.has(Number(a.id)),
      );
      return {
        divisi,
        data: tersaring.map((a) => ({
          id: String(a.id),
          nama: a.nama,
          avatar_url: a.avatar_url ?? "",
          kepala: a.posisi_divisi === "kepala",
          jabatan: a.jabatan ?? "",
        })),
      };
    }

    // --- Pesan grup saya ---
    if (url.searchParams.get("pesan") === "1") {
      const sejak = Number(url.searchParams.get("sejak") ?? 0);
      return { divisi, data: await ambilPesanGrup(divisi, sejak, false) };
    }

    // --- Info grup untuk daftar chat: cuplikan + belum dibaca ---
    const [{ count: anggota }, { data: terakhir }, { data: baca }, { data: rias }] = await Promise.all([
      db
        .from("app_user")
        .select("id", { count: "exact", head: true })
        .eq("divisi", divisi)
        .eq("aktif", true)
        .eq("status", "aktif"),
      db
        .from("chat_pesan_grup")
        .select("id, isi, gambar_url, dibuat_pada, pengirim_id")
        .eq("divisi", divisi)
        .is("dihapus_pada", null)
        .order("id", { ascending: false })
        .limit(1),
      db
        .from("chat_grup_baca")
        .select("terakhir_baca_id")
        .eq("divisi", divisi)
        .eq("user_id", idKu)
        .maybeSingle(),
      db
        .from("grup_divisi_info")
        .select("nama_kustom, foto_url")
        .eq("divisi", divisi)
        .maybeSingle(),
    ]);

    const cuplikan = terakhir?.[0] ?? null;
    const terakhirBaca = Number((baca as { terakhir_baca_id?: number } | null)?.terakhir_baca_id ?? 0);
    let belumDibaca = 0;
    if (cuplikan && Number(cuplikan.id) > terakhirBaca) {
      const { count } = await db
        .from("chat_pesan_grup")
        .select("id", { count: "exact", head: true })
        .eq("divisi", divisi)
        .is("dihapus_pada", null)
        .gt("id", terakhirBaca)
        .neq("pengirim_id", idKu);
      belumDibaca = count ?? 0;
    }

    return {
      divisi,
      // Nama tampilan grup: kustom bila disetel kepala divisi,
      // selain itu nama divisinya sendiri.
      nama_grup: (rias?.nama_kustom ?? "").trim() || divisi,
      foto_grup: rias?.foto_url ?? "",
      anggota: anggota ?? 0,
      cuplikan: cuplikan ? cuplikan.isi || (cuplikan.gambar_url ? "📷 Gambar" : "") : "",
      waktu_terakhir: cuplikan?.dibuat_pada ?? "",
      belum_dibaca: belumDibaca,
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const idKu = Number(user.id);
    const body = (await request.json().catch(() => ({}))) as {
      aksi?: string;
      nama?: string;
      foto?: string;
      isi?: string;
      gambar?: string;
      pesan_id?: string;
    };
    const db = supabase();
    const divisi = (user.divisi ?? "").trim();

    if (body.aksi === "kirim") {
      if (!divisi) {
        throw Object.assign(
          new Error("Anda belum terdaftar di divisi mana pun."),
          { status: 403 },
        );
      }
      // Aturan zona (spek 1.18/2.6): di luar cakupan = tidak bisa kirim.
      if (!(await bolehIkutGrupDivisi(idKu, divisi))) {
        throw Object.assign(
          new Error("Anda berada di luar cakupan zona grup divisi ini."),
          { status: 403 },
        );
      }
      const adaGambar = Boolean((body.gambar ?? "").trim());
      const isi = (body.isi ?? "").trim().slice(0, BATAS_PESAN);
      if (!isi && !adaGambar) {
        throw Object.assign(new Error("Pesan kosong."), { status: 400 });
      }
      const gambarUrl = adaGambar ? await unggahGambarGrup(body.gambar ?? "", divisi) : null;

      const { data: pesan, error } = await db
        .from("chat_pesan_grup")
        .insert({ divisi, pengirim_id: idKu, isi, gambar_url: gambarUrl })
        .select("id, dibuat_pada")
        .single();
      if (error) {
        console.error("[grup] kirim:", error.message);
        throw new Error("Gagal mengirim pesan.");
      }

      // Pengirim otomatis "sudah membaca" sampai pesannya sendiri.
      await db.from("chat_grup_baca").upsert(
        { divisi, user_id: idKu, terakhir_baca_id: Number(pesan.id) },
        { onConflict: "divisi,user_id" },
      );

      after(bersihkanPesanGrupLama);
      return {
        sukses: true,
        id: String(pesan.id),
        dibuat_pada: pesan.dibuat_pada,
        gambar_url: gambarUrl ?? "",
      };
    }

    // --- Tarik pesan grup: pengirimnya sendiri, atau kepala divisi
    //     (admin grup, ASUMSI spek), atau pengawas. ---
    // --- Kustomisasi grup (spek 1.15): nama & foto ---
    // Hanya KEPALA divisi (admin grup bawaan) atau pengurus; anggota
    // biasa tidak bisa mengganti identitas grup koordinasi resmi.
    if (body.aksi === "info") {
      const divisiKu = (user.divisi ?? "").trim();
      if (!divisiKu) {
        throw Object.assign(new Error("Anda belum tergabung di divisi mana pun."), {
          status: 400,
        });
      }
      const kepala = user.posisi_divisi === "kepala";
      if (!kepala && !PENGAWAS.has(user.role)) {
        throw Object.assign(
          new Error("Hanya kepala divisi yang boleh mengubah nama/foto grup."),
          { status: 403 },
        );
      }

      const perubahan: Record<string, unknown> = {
        divisi: divisiKu,
        diubah_oleh: idKu,
        diubah_pada: new Date().toISOString(),
      };
      if (typeof body.nama === "string") {
        const nama = body.nama.trim().slice(0, 60);
        perubahan.nama_kustom = nama; // kosong = kembali ke nama divisi
      }
      if ((body.foto ?? "").trim()) {
        // Foto grup memakai jalur unggah yang sama dengan gambar chat
        // (batas & jenis diperiksa di helper).
        perubahan.foto_url = await unggahGambarGrup(body.foto ?? "", divisiKu);
      }

      const { error } = await db
        .from("grup_divisi_info")
        .upsert(perubahan, { onConflict: "divisi" });
      if (error) {
        console.error("[grup] info:", error.message);
        throw new Error("Gagal menyimpan pengaturan grup.");
      }

      const { data: rias } = await db
        .from("grup_divisi_info")
        .select("nama_kustom, foto_url")
        .eq("divisi", divisiKu)
        .maybeSingle();
      return {
        sukses: true,
        nama_grup: (rias?.nama_kustom ?? "").trim() || divisiKu,
        foto_grup: rias?.foto_url ?? "",
      };
    }

    if (body.aksi === "hapus_pesan") {
      const pesanId = Number(body.pesan_id);
      if (!pesanId) throw Object.assign(new Error("Pesan tidak disebutkan."), { status: 400 });
      const { data: pesan } = await db
        .from("chat_pesan_grup")
        .select("id, divisi, pengirim_id, dihapus_pada")
        .eq("id", pesanId)
        .maybeSingle();
      if (!pesan) throw Object.assign(new Error("Pesan tidak ditemukan."), { status: 404 });

      const kepalaDivisiIni =
        user.posisi_divisi === "kepala" && divisi === String(pesan.divisi);
      const boleh =
        Number(pesan.pengirim_id) === idKu || kepalaDivisiIni || PENGAWAS.has(user.role);
      if (!boleh) {
        throw Object.assign(
          new Error("Hanya pengirim atau kepala divisi yang boleh menghapus pesan ini."),
          { status: 403 },
        );
      }
      if (pesan.dihapus_pada == null) {
        const { error } = await db
          .from("chat_pesan_grup")
          .update({ dihapus_pada: new Date().toISOString() })
          .eq("id", pesanId);
        if (error) {
          console.error("[grup] hapus pesan:", error.message);
          throw new Error("Gagal menghapus pesan.");
        }
      }
      return { sukses: true };
    }

    throw Object.assign(new Error("Aksi tidak dikenali."), { status: 400 });
  });
}

export async function PATCH(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const divisi = (user.divisi ?? "").trim();
    if (!divisi) return { sukses: true };
    const db = supabase();

    const { data: terakhir } = await db
      .from("chat_pesan_grup")
      .select("id")
      .eq("divisi", divisi)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (terakhir) {
      await db.from("chat_grup_baca").upsert(
        { divisi, user_id: Number(user.id), terakhir_baca_id: Number(terakhir.id) },
        { onConflict: "divisi,user_id" },
      );
    }
    return { sukses: true };
  });
}

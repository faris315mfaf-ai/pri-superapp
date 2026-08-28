// GET  /api/asisten/basis        — status basis + snapshot (master)
// GET  /api/asisten/basis?cron=1  — refresh terjadwal (header rahasia)
// POST /api/asisten/basis         — {aksi:"refresh"} paksa refresh
//                                   {aksi:"catatan", teks} simpan catatan
//
// Fitur 1.20.4: Basis Pengetahuan Asisten. Snapshot disegarkan
// OTOMATIS tiap jam saat AI membacanya (lazy) — endpoint ini untuk
// master MEMANTAU, memaksa refresh, dan menulis catatan manual; jalur
// ?cron=1 memungkinkan penyegaran proaktif dari n8n / Vercel Cron.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import {
  bacaBasis,
  bahanAjar,
  catatanBasis,
  MAKS_BAHAN_JUMLAH,
  MAKS_BAHAN_PER_BERKAS,
} from "@/lib/asisten-basis";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

const MAKS_CATATAN = 8000;

export async function GET(request: Request) {
  return bungkus(async () => {
    const url = new URL(request.url);

    // --- Jalur penyegaran terjadwal (n8n / Vercel Cron) ---
    // Aktif hanya bila ASISTEN_CRON_SECRET diset DAN cocok. Tanpa itu,
    // jalur ini mati — tidak ada penyegar anonim.
    if (url.searchParams.get("cron") === "1") {
      const rahasia = process.env.ASISTEN_CRON_SECRET;
      if (!rahasia || tokenDari(request) !== rahasia) {
        throw Object.assign(new Error("Tidak berwenang."), { status: 403 });
      }
      const b = await bacaBasis(true);
      return { sukses: true, disegarkan: b.diperbarui_pada };
    }

    // --- Pemantauan master ---
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (user.role !== "master") {
      throw Object.assign(new Error("Hanya master yang boleh membuka Basis Pengetahuan."), {
        status: 403,
      });
    }
    // Baca TANPA memaksa refresh — hanya melihat keadaan sekarang.
    const { data } = await supabase()
      .from("asisten_basis")
      .select("konten, diperbarui_pada")
      .eq("id", 1)
      .maybeSingle();
    const umur = data?.diperbarui_pada
      ? Math.floor((Date.now() - Date.parse(String(data.diperbarui_pada))) / 60_000)
      : null;
    return {
      ada: Boolean(data),
      diperbarui_pada: data?.diperbarui_pada ?? null,
      umur_menit: umur,
      konten: data?.konten ?? {},
      catatan: await catatanBasis(),
      maks_catatan: MAKS_CATATAN,
      // Bahan belajar TXT (fitur 1.22/4) — metadata saja, tanpa isi.
      bahan_ajar: await bahanAjar(false),
      maks_bahan_per_berkas: MAKS_BAHAN_PER_BERKAS,
      maks_bahan_jumlah: MAKS_BAHAN_JUMLAH,
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (user.role !== "master") {
      throw Object.assign(new Error("Hanya master yang boleh mengelola Basis Pengetahuan."), {
        status: 403,
      });
    }

    const body = (await request.json().catch(() => ({}))) as {
      aksi?: string;
      teks?: string;
      nama?: string;
      isi?: string;
      id?: string | number;
    };

    // --- Bahan belajar TXT (fitur 1.22/4) ---
    if (body.aksi === "bahan_tambah") {
      const nama = String(body.nama ?? "").trim().slice(0, 160) || "Tanpa nama.txt";
      const isi = String(body.isi ?? "");
      if (isi.trim().length < 1) {
        throw Object.assign(new Error("Berkas kosong — tidak ada teks untuk dipelajari."), {
          status: 400,
        });
      }
      const { count } = await supabase()
        .from("asisten_bahan_ajar")
        .select("id", { count: "exact", head: true });
      if ((count ?? 0) >= MAKS_BAHAN_JUMLAH) {
        throw Object.assign(
          new Error(`Bahan belajar sudah mencapai batas ${MAKS_BAHAN_JUMLAH} berkas. Hapus yang lama dulu.`),
          { status: 400 },
        );
      }
      const dipotong = isi.slice(0, MAKS_BAHAN_PER_BERKAS);
      const { data: baris, error } = await supabase()
        .from("asisten_bahan_ajar")
        .insert({
          nama,
          isi: dipotong,
          ukuran: dipotong.length,
          dibuat_oleh_id: Number(user.id),
        })
        .select("id")
        .single();
      if (error) throw new Error("Gagal menyimpan bahan belajar.");
      await supabase().from("log_audit").insert({
        aktor_id: Number(user.id),
        aktor_nama: user.nama,
        aksi: "asisten_bahan_tambah",
        target_id: null,
        target_nama: "Basis Pengetahuan AI",
        detail: `Bahan belajar ditambah: ${nama} (${dipotong.length} karakter).`,
      });
      return {
        sukses: true,
        id: String(baris.id),
        dipotong: isi.length > MAKS_BAHAN_PER_BERKAS,
      };
    }

    if (body.aksi === "bahan_hapus") {
      const id = Number(body.id ?? 0);
      if (!id) throw Object.assign(new Error("Bahan belajar tidak disebutkan."), { status: 400 });
      const { error } = await supabase().from("asisten_bahan_ajar").delete().eq("id", id);
      if (error) throw new Error("Gagal menghapus bahan belajar.");
      await supabase().from("log_audit").insert({
        aktor_id: Number(user.id),
        aktor_nama: user.nama,
        aksi: "asisten_bahan_hapus",
        target_id: id,
        target_nama: "Basis Pengetahuan AI",
        detail: "Satu bahan belajar dihapus.",
      });
      return { sukses: true };
    }

    if (body.aksi === "catatan") {
      const teks = String(body.teks ?? "").slice(0, MAKS_CATATAN);
      const { error } = await supabase()
        .from("pengaturan_sistem")
        .upsert({ kunci: "asisten_catatan", nilai: teks }, { onConflict: "kunci" });
      if (error) throw new Error("Gagal menyimpan catatan.");
      await supabase().from("log_audit").insert({
        aktor_id: Number(user.id),
        aktor_nama: user.nama,
        aksi: "asisten_catatan",
        target_id: null,
        target_nama: "Basis Pengetahuan AI",
        detail: teks ? `Catatan basis diperbarui (${teks.length} karakter).` : "Catatan basis dikosongkan.",
      });
      return { sukses: true, panjang: teks.length };
    }

    // Default: paksa refresh snapshot sekarang.
    const b = await bacaBasis(true);
    return { sukses: true, disegarkan: b.diperbarui_pada };
  });
}

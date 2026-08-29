// Modul Acara (spek 1.14 bagian 1.5): tanggal penting partai.
//
// GET    → daftar acara mendatang (semua pengguna). Sekalian memicu
//          pengingat MALAS: acara H-1 / hari-H yang belum dinotifkan
//          dikirimkan ke SELURUH pengguna, tanpa cron.
// POST   → tambah acara (anggota Divisi Acara, atau pengurus).
// DELETE → hapus acara (pembuatnya, atau pengurus).
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { adalahHR } from "@/lib/hr";
import { userDariToken } from "@/lib/sesi";
import { kirimKabar } from "@/lib/notifikasi";
import { after } from "next/server";

export const dynamic = "force-dynamic";

const PENGURUS = new Set(["master", "super_admin", "admin_hr"]);
const DIVISI_ACARA = "Divisi Acara";

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasuk(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  return user;
}

function tanggalWib(geserHari = 0): string {
  return new Date(Date.now() + 7 * 3600_000 + geserHari * 24 * 3600_000)
    .toISOString()
    .slice(0, 10);
}

function tanggalCantik(iso: string): string {
  return new Date(`${iso}T00:00:00+07:00`).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Pengingat MALAS: acara besok (H-1) dan hari ini (H) yang belum
 * pernah dinotifkan dikirim ke seluruh pengguna. Dipicu menumpang GET
 * (setelah balasan terkirim) — pola tanpa-cron yang sudah dipakai
 * retensi absensi & chat.
 */
async function kirimPengingatTertunda() {
  try {
    const db = supabase();
    const hariIni = tanggalWib(0);
    const besok = tanggalWib(1);

    const { data } = await db
      .from("acara_penting")
      .select("id, judul, tanggal, notif_h1, notif_h0")
      .in("tanggal", [hariIni, besok]);

    for (const a of data ?? []) {
      const hariH = a.tanggal === hariIni;
      if (hariH && !a.notif_h0) {
        await kirimKabar({
          judul: `📅 Hari ini: ${a.judul}`,
          isi: `Acara penting partai berlangsung hari ini (${tanggalCantik(a.tanggal)}).`,
          kategori: "info",
          jenis_peristiwa: "acara",
        });
        await db.from("acara_penting").update({ notif_h0: true }).eq("id", a.id);
      } else if (!hariH && !a.notif_h1) {
        await kirimKabar({
          judul: `📅 Besok: ${a.judul}`,
          isi: `Bersiaplah — acara penting partai berlangsung besok (${tanggalCantik(a.tanggal)}).`,
          kategori: "info",
          jenis_peristiwa: "acara",
        });
        await db.from("acara_penting").update({ notif_h1: true }).eq("id", a.id);
      }
    }
  } catch (e) {
    console.error("[acara] pengingat:", e);
  }
}

function bolehKelola(user: { role: string; divisi?: string | null }): boolean {
  return PENGURUS.has(user.role) || adalahHR(user) || (user.divisi ?? "") === DIVISI_ACARA;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    after(kirimPengingatTertunda);

    const { data } = await supabase()
      .from("acara_penting")
      .select("id, judul, keterangan, tanggal, dibuat_oleh, pembuat:app_user!acara_penting_dibuat_oleh_fkey(nama)")
      .gte("tanggal", tanggalWib(0))
      .order("tanggal", { ascending: true })
      .limit(100);

    return {
      boleh_kelola: bolehKelola(user),
      data: (data ?? []).map((a) => {
        const p = Array.isArray(a.pembuat) ? a.pembuat[0] : a.pembuat;
        return {
          id: String(a.id),
          judul: a.judul,
          keterangan: a.keterangan,
          tanggal: a.tanggal,
          dibuat_oleh: a.dibuat_oleh ? String(a.dibuat_oleh) : "",
          pembuat_nama: p?.nama ?? "",
        };
      }),
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!bolehKelola(user)) {
      throw Object.assign(
        new Error("Hanya Divisi Acara atau pengurus yang boleh menambah acara."),
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      judul?: string;
      keterangan?: string;
      tanggal?: string;
    };
    const judul = (body.judul ?? "").trim();
    const keterangan = (body.keterangan ?? "").trim().slice(0, 500);
    const tanggal = (body.tanggal ?? "").trim();

    if (judul.length < 3 || judul.length > 120) {
      throw Object.assign(new Error("Judul acara 3-120 karakter."), { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
      throw Object.assign(new Error("Pilih tanggal acaranya."), { status: 400 });
    }
    if (tanggal < tanggalWib(0)) {
      throw Object.assign(new Error("Tanggal acara tidak boleh di masa lalu."), { status: 400 });
    }

    const { data, error } = await supabase()
      .from("acara_penting")
      .insert({ judul, keterangan, tanggal, dibuat_oleh: Number(user.id) })
      .select("id")
      .single();
    if (error) {
      console.error("[acara] tambah:", error.message);
      throw new Error("Gagal menyimpan acara.");
    }

    // Kabari seluruh pengguna bahwa ada tanggal penting baru (spek:
    // tanggal yang ditambahkan memicu notifikasi ke semua pengguna).
    await kirimKabar({
      judul: `📅 Acara baru: ${judul}`,
      isi: `${tanggalCantik(tanggal)}${keterangan ? ` — ${keterangan.slice(0, 100)}` : ""}`,
      kategori: "info",
      jenis_peristiwa: "acara",
    });

    return { sukses: true, id: String(data.id) };
  });
}

export async function DELETE(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const body = (await request.json().catch(() => ({}))) as { id?: string };
    const id = Number(body.id);
    if (!id) throw Object.assign(new Error("Acara tidak disebutkan."), { status: 400 });

    const { data: acara } = await supabase()
      .from("acara_penting")
      .select("id, dibuat_oleh")
      .eq("id", id)
      .maybeSingle();
    if (!acara) throw Object.assign(new Error("Acara tidak ditemukan."), { status: 404 });

    const pembuatnya = Number(acara.dibuat_oleh) === Number(user.id);
    if (!pembuatnya && !PENGURUS.has(user.role) && !adalahHR(user)) {
      throw Object.assign(new Error("Anda tidak berwenang menghapus acara ini."), {
        status: 403,
      });
    }

    const { error } = await supabase().from("acara_penting").delete().eq("id", id);
    if (error) {
      console.error("[acara] hapus:", error.message);
      throw new Error("Gagal menghapus acara.");
    }
    return { sukses: true };
  });
}

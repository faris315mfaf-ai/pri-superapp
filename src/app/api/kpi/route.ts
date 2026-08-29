// Setel KPI (spek 1.18/2.5) — rencana kerja/tugas tambahan divisi.
//
// Akses: HR (admin_hr/super_admin/master) semua divisi; KETUA DIVISI
// hanya divisinya sendiri.
//
// GET  ?status=aktif|selesai|expired|semua → daftar KPI (yang boleh
//      dilihat pemanggil); KPI lewat tenggat otomatis di-set expired
//      SAAT DIBACA (malas, tanpa cron — pola rumah).
// POST → buat KPI baru (+ notifikasi ke anggota yang dituju)
// PATCH {id, ...} → edit / update progress / tandai selesai
// DELETE {id} → hapus
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { adalahHR } from "@/lib/hr";
import { userDariToken } from "@/lib/sesi";
import { kirimKabar } from "@/lib/notifikasi";

export const dynamic = "force-dynamic";

const HR = new Set(["master", "super_admin", "admin_hr"]);

async function pastikanMasuk(request: Request) {
  const h = request.headers.get("authorization") ?? "";
  const token = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
  const user = await userDariToken(token);
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  return user;
}

/** Divisi yang boleh DIKELOLA pemanggil; null = semua (HR). */
function divisiKelola(user: {
  role: string;
  divisi?: string | null;
  posisi_divisi?: string | null;
}): string | null | false {
  if (HR.has(user.role) || adalahHR(user)) return null; // semua divisi
  if (user.posisi_divisi === "kepala" && user.divisi) return user.divisi;
  return false; // tidak berwenang mengelola
}

function hariIniWib(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

/** Tandai expired KPI aktif yang tenggatnya lewat (malas, saat dibaca). */
async function tandaiExpired(): Promise<void> {
  try {
    await supabase()
      .from("kpi_tugas")
      .update({ status: "expired" })
      .eq("status", "aktif")
      .lt("tenggat", hariIniWib());
  } catch (e) {
    console.error("[kpi] tandai expired:", e);
  }
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    await tandaiExpired();

    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? "semua";
    const kelola = divisiKelola(user);

    let q = supabase()
      .from("kpi_tugas")
      .select(
        "id, judul, deskripsi, divisi, tanggal_mulai, tenggat, prioritas, target_indikator, untuk_semua, status, progress, catatan_progress, dibuat_pada, kpi_tugas_target(user_id)",
      )
      .order("id", { ascending: false })
      .limit(300);
    if (status !== "semua") q = q.eq("status", status);
    // Pengelola terbatas & anggota biasa: hanya KPI divisinya.
    if (kelola !== null) q = q.eq("divisi", user.divisi ?? "-");
    const { data } = await q;

    // Anggota biasa hanya melihat KPI untuk semua ATAU yang menargetnya.
    const idKu = Number(user.id);
    const bolehKelola = kelola !== false;
    const baris = (data ?? []).filter((k) => {
      if (bolehKelola) return true;
      if (k.untuk_semua) return true;
      const target = (k.kpi_tugas_target ?? []) as { user_id: number }[];
      return target.some((t) => Number(t.user_id) === idKu);
    });

    return {
      boleh_kelola: bolehKelola,
      kelola_semua: kelola === null,
      data: baris.map((k) => ({
        id: String(k.id),
        judul: k.judul,
        deskripsi: k.deskripsi,
        divisi: k.divisi,
        tanggal_mulai: k.tanggal_mulai,
        tenggat: k.tenggat,
        prioritas: k.prioritas,
        target_indikator: k.target_indikator,
        untuk_semua: k.untuk_semua,
        status: k.status,
        progress: k.progress,
        catatan_progress: k.catatan_progress,
        target_ids: ((k.kpi_tugas_target ?? []) as { user_id: number }[]).map((t) =>
          String(t.user_id),
        ),
      })),
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const kelola = divisiKelola(user);
    if (kelola === false) {
      throw Object.assign(
        new Error("Hanya HR atau ketua divisi yang boleh menyetel KPI."),
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      judul?: string;
      deskripsi?: string;
      divisi?: string;
      tanggal_mulai?: string;
      tenggat?: string;
      prioritas?: string;
      target_indikator?: string;
      untuk_semua?: boolean;
      target_ids?: string[];
    };

    const judul = (body.judul ?? "").trim();
    if (judul.length < 3) {
      throw Object.assign(new Error("Judul KPI minimal 3 karakter."), { status: 400 });
    }
    // Ketua divisi hanya untuk divisinya sendiri (spek 2.5).
    const divisi = kelola === null ? (body.divisi ?? "").trim() : kelola;
    if (!divisi) throw Object.assign(new Error("Pilih divisinya."), { status: 400 });
    const mulai = (body.tanggal_mulai ?? "").trim() || hariIniWib();
    const tenggat = (body.tenggat ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tenggat)) {
      throw Object.assign(new Error("Pilih tanggal deadline."), { status: 400 });
    }
    if (tenggat < mulai) {
      throw Object.assign(new Error("Deadline harus setelah tanggal mulai."), {
        status: 400,
      });
    }
    const prioritas = ["rendah", "sedang", "tinggi", "kritis"].includes(
      String(body.prioritas),
    )
      ? String(body.prioritas)
      : "sedang";
    const untukSemua = body.untuk_semua !== false;

    const db = supabase();
    const { data: baris, error } = await db
      .from("kpi_tugas")
      .insert({
        judul,
        deskripsi: (body.deskripsi ?? "").trim().slice(0, 2000),
        divisi,
        tanggal_mulai: mulai,
        tenggat,
        prioritas,
        target_indikator: (body.target_indikator ?? "").trim().slice(0, 300),
        untuk_semua: untukSemua,
        dibuat_oleh: Number(user.id),
      })
      .select("id")
      .single();
    if (error) {
      console.error("[kpi] tambah:", error.message);
      throw new Error("Gagal menyimpan KPI.");
    }

    // Target spesifik (multi-select) — hanya anggota divisi itu.
    let targetIds: number[] = [];
    if (!untukSemua) {
      targetIds = (body.target_ids ?? []).map(Number).filter(Boolean);
      if (targetIds.length > 0) {
        await db
          .from("kpi_tugas_target")
          .insert(targetIds.map((uid) => ({ kpi_id: baris.id, user_id: uid })));
      }
    }

    // Notifikasi anggota yang dituju (spek 2.5).
    if (untukSemua) {
      const { data: anggota } = await db
        .from("app_user")
        .select("id")
        .eq("divisi", divisi)
        .eq("aktif", true)
        .eq("status", "aktif")
        .limit(500);
      targetIds = (anggota ?? []).map((a) => Number(a.id));
    }
    if (targetIds.length > 0) {
      await kirimKabar({
        judul: `📋 KPI baru: ${judul}`,
        isi: `${divisi} · deadline ${tenggat} · prioritas ${prioritas}. Buka HR Center untuk detail.`,
        kategori: "info",
        jenis_peristiwa: "kpi",
        untukUserIds: targetIds,
      });
    }

    return { sukses: true, id: String(baris.id) };
  });
}

export async function PATCH(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const kelola = divisiKelola(user);
    if (kelola === false) {
      throw Object.assign(new Error("Anda tidak berwenang mengubah KPI."), { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      id?: string;
      judul?: string;
      deskripsi?: string;
      tenggat?: string;
      prioritas?: string;
      progress?: number;
      catatan?: string;
      status?: string;
    };
    const id = Number(body.id);
    if (!id) throw Object.assign(new Error("KPI tidak disebutkan."), { status: 400 });

    const db = supabase();
    const { data: kpi } = await db
      .from("kpi_tugas")
      .select("id, divisi, status")
      .eq("id", id)
      .maybeSingle();
    if (!kpi) throw Object.assign(new Error("KPI tidak ditemukan."), { status: 404 });
    if (kelola !== null && kpi.divisi !== kelola) {
      throw Object.assign(new Error("KPI ini milik divisi lain."), { status: 403 });
    }

    const perubahan: Record<string, unknown> = {};
    if (typeof body.judul === "string" && body.judul.trim().length >= 3) {
      perubahan.judul = body.judul.trim();
    }
    if (typeof body.deskripsi === "string") {
      perubahan.deskripsi = body.deskripsi.trim().slice(0, 2000);
    }
    if (typeof body.tenggat === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.tenggat)) {
      perubahan.tenggat = body.tenggat;
    }
    if (["rendah", "sedang", "tinggi", "kritis"].includes(String(body.prioritas))) {
      perubahan.prioritas = body.prioritas;
    }
    if (typeof body.progress === "number") {
      const p = Math.max(0, Math.min(100, Math.floor(body.progress)));
      perubahan.progress = p;
      if (typeof body.catatan === "string") {
        perubahan.catatan_progress = body.catatan.trim().slice(0, 500);
      }
      // Progress 100% = selesai otomatis; di bawahnya kembali aktif
      // (kecuali sudah expired — tenggatnya tetap lewat).
      if (p >= 100) perubahan.status = "selesai";
      else if (kpi.status === "selesai") perubahan.status = "aktif";
    }
    if (body.status === "selesai" || body.status === "aktif") {
      perubahan.status = body.status;
    }
    if (Object.keys(perubahan).length === 0) {
      throw Object.assign(new Error("Tidak ada perubahan."), { status: 400 });
    }

    const { error } = await db.from("kpi_tugas").update(perubahan).eq("id", id);
    if (error) throw new Error("Gagal menyimpan perubahan KPI.");
    return { sukses: true };
  });
}

export async function DELETE(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const kelola = divisiKelola(user);
    if (kelola === false) {
      throw Object.assign(new Error("Anda tidak berwenang menghapus KPI."), { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { id?: string };
    const id = Number(body.id);
    if (!id) throw Object.assign(new Error("KPI tidak disebutkan."), { status: 400 });

    const db = supabase();
    const { data: kpi } = await db
      .from("kpi_tugas")
      .select("id, divisi")
      .eq("id", id)
      .maybeSingle();
    if (!kpi) throw Object.assign(new Error("KPI tidak ditemukan."), { status: 404 });
    if (kelola !== null && kpi.divisi !== kelola) {
      throw Object.assign(new Error("KPI ini milik divisi lain."), { status: 403 });
    }
    const { error } = await db.from("kpi_tugas").delete().eq("id", id);
    if (error) throw new Error("Gagal menghapus KPI.");
    return { sukses: true };
  });
}

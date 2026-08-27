// Kelola PROFIL SOSMED yang DIANALISIS (spek 1.17) — khusus pengurus.
//
// 1 profil penyedia (Ayrshare) = 1 kumpulan sosmed. Menambah sosmed
// yang dianalisis = menambah profil baru lalu menautkan akunnya lewat
// halaman penautan white-label — semuanya dari aplikasi, tanpa
// membuka dashboard Ayrshare.
//
// GET             → daftar profil QC + akun tertaut masing-masing
// POST {judul}    → buat profil baru
// POST {aksi:"tautan", id} → URL halaman penautan profil itu
// DELETE {id}     → hapus profil (di penyedia + di database)
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { penyediaAktif } from "@/lib/sosmed-penyedia";

export const dynamic = "force-dynamic";

const PENGURUS = new Set(["master", "super_admin", "admin_hr"]);

async function pastikanPengurus(request: Request) {
  const h = request.headers.get("authorization") ?? "";
  const token = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
  const user = await userDariToken(token);
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  if (!PENGURUS.has(user.role)) {
    throw Object.assign(new Error("Hanya pengurus yang boleh mengelola profil analisis."), {
      status: 403,
    });
  }
  return user;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanPengurus(request);
    const penyedia = penyediaAktif();
    const { data } = await supabase()
      .from("sosmed_profile")
      .select("id, judul, profile_key, dibuat_pada")
      .eq("jenis", "qc")
      .eq("penyedia", penyedia.id)
      .order("id");

    // Akun tertaut tiap profil dibaca LANGSUNG dari penyedia — profil
    // yang gagal dibaca tetap tampil (akun kosong + tanda gagal).
    const hasil = await Promise.all(
      (data ?? []).map(async (p) => {
        try {
          const akun = await penyedia.akunTertaut(p.profile_key as string);
          return { id: String(p.id), judul: p.judul as string, akun, gagal: false };
        } catch {
          return { id: String(p.id), judul: p.judul as string, akun: [], gagal: true };
        }
      }),
    );

    return {
      penyedia: penyedia.id,
      // UI memberi tahu jujur bila tautan penautan belum bisa dibuat.
      penautan_siap: Boolean(process.env.AYRSHARE_PRIVATE_KEY && process.env.AYRSHARE_DOMAIN),
      data: hasil,
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanPengurus(request);
    const body = (await request.json().catch(() => ({}))) as {
      aksi?: string;
      id?: string;
      judul?: string;
    };
    const penyedia = penyediaAktif();
    const db = supabase();

    // --- URL halaman penautan sosmed satu profil ---
    if (body.aksi === "tautan") {
      const { data: p } = await db
        .from("sosmed_profile")
        .select("id, profile_key")
        .eq("id", Number(body.id))
        .eq("jenis", "qc")
        .maybeSingle();
      if (!p) throw Object.assign(new Error("Profil tidak ditemukan."), { status: 404 });
      return { url: await penyedia.tautanHubungkan(p.profile_key as string) };
    }

    // --- Buat profil baru ---
    const judul = (body.judul ?? "").trim();
    if (judul.length < 3 || judul.length > 60) {
      throw Object.assign(new Error("Nama profil 3-60 karakter."), { status: 400 });
    }
    const profil = await penyedia.buatProfil(`QC ${judul}`);
    const { data: baris, error } = await db
      .from("sosmed_profile")
      .insert({
        penyedia: penyedia.id,
        jenis: "qc",
        judul,
        profile_key: profil.profileKey,
        ref_id: profil.refId,
        dibuat_oleh: Number(user.id),
      })
      .select("id")
      .single();
    if (error) {
      // Baris gagal tersimpan = profileKey akan HILANG selamanya —
      // profil yatimnya langsung dibersihkan dari penyedia.
      await penyedia.hapusProfil(profil.profileKey).catch(() => {});
      console.error("[analisis/profil] simpan:", error.message);
      throw new Error("Gagal menyimpan profil.");
    }
    return { sukses: true, id: String(baris.id) };
  });
}

export async function DELETE(request: Request) {
  return bungkus(async () => {
    await pastikanPengurus(request);
    const body = (await request.json().catch(() => ({}))) as { id?: string };
    const db = supabase();
    const { data: p } = await db
      .from("sosmed_profile")
      .select("id, profile_key")
      .eq("id", Number(body.id))
      .eq("jenis", "qc")
      .maybeSingle();
    if (!p) throw Object.assign(new Error("Profil tidak ditemukan."), { status: 404 });

    await penyediaAktif().hapusProfil(p.profile_key as string);
    await db.from("sosmed_profile").delete().eq("id", p.id);
    return { sukses: true };
  });
}

// Kelola SUMBER BERITA untuk scraping n8n (fitur 1.22/bug 6).
//
// GET   → daftar akun sumber + interval scraping (menit)
// POST  → { aksi:"tambah", nama, username, platform }
//         { aksi:"toggle", id }           (stop/aktifkan satu sumber)
//         { aksi:"hapus", id }
//         { aksi:"interval", menit }       (interval auto-scrape, menit)
//
// Workflow n8n "TV Rakyat - Cek Berita Terbaru" membaca baris yang
// aktif=true dari tabel sumber_berita, jadi menambah/menonaktifkan akun
// di sini langsung memengaruhi apa yang di-scrape — tanpa mengedit
// workflow. Hanya tim TV Rakyat / Pimred yang boleh mengubahnya.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { bolehProsesVideo } from "@/types";
import { adalahPimred } from "@/lib/jabatan";

export const dynamic = "force-dynamic";

// Batas interval: minimal 5 menit menjaga kuota scraping (TikHub) tidak
// terkuras — pelajaran dari workflow yang dulu jalan tiap 1 menit.
// Bawaan 5 menit (fitur 1.22.x/5-bug); UI menawarkan preset 5/10/15/30.
const INTERVAL_MIN = 5;
const INTERVAL_MAKS = 1440;
const INTERVAL_BAWAAN = 5;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanTimTv(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku."), { status: 401 });
  if (!bolehProsesVideo(user.role) && !adalahPimred(user)) {
    throw Object.assign(
      new Error("Hanya tim TV Rakyat atau Pimpinan Redaksi yang boleh mengelola sumber berita."),
      { status: 403 },
    );
  }
  return user;
}

async function bacaInterval(): Promise<number> {
  const { data } = await supabase()
    .from("pengaturan_sistem")
    .select("nilai")
    .eq("kunci", "berita_interval_menit")
    .maybeSingle();
  const n = Number(data?.nilai ?? INTERVAL_BAWAAN);
  return Number.isFinite(n) ? Math.min(INTERVAL_MAKS, Math.max(INTERVAL_MIN, n)) : INTERVAL_BAWAAN;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanTimTv(request);
    const { data, error } = await supabase()
      .from("sumber_berita")
      .select("id, nama, username, platform, aktif, dibuat_pada")
      .order("nama", { ascending: true })
      .order("platform", { ascending: true });
    if (error) throw new Error("Gagal memuat sumber berita.");
    return {
      data: (data ?? []).map((s) => ({
        id: String(s.id),
        nama: s.nama,
        username: s.username,
        platform: s.platform,
        aktif: s.aktif === true,
      })),
      interval_menit: await bacaInterval(),
      interval_min: INTERVAL_MIN,
      interval_maks: INTERVAL_MAKS,
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanTimTv(request);
    const body = (await request.json().catch(() => ({}))) as {
      aksi?: string;
      nama?: string;
      username?: string;
      platform?: string;
      id?: string | number;
      menit?: number;
    };
    const db = supabase();

    if (body.aksi === "tambah") {
      const platform = String(body.platform ?? "").toLowerCase();
      if (platform !== "instagram" && platform !== "tiktok") {
        throw Object.assign(new Error("Platform harus Instagram atau TikTok."), { status: 400 });
      }
      // Bersihkan username: buang @ dan spasi.
      const username = String(body.username ?? "").trim().replace(/^@+/, "").replace(/\s+/g, "");
      if (username.length < 2) {
        throw Object.assign(new Error("Username akun tidak sah."), { status: 400 });
      }
      const nama = String(body.nama ?? "").trim().slice(0, 80) || username;
      const { error } = await db
        .from("sumber_berita")
        .insert({ nama, username, platform, aktif: true });
      if (error) {
        if (error.code === "23505") {
          throw Object.assign(new Error(`@${username} (${platform}) sudah terdaftar.`), {
            status: 409,
          });
        }
        throw new Error("Gagal menambah sumber.");
      }
      await db.from("log_audit").insert({
        aktor_id: Number(user.id),
        aktor_nama: user.nama,
        aksi: "sumber_berita_tambah",
        target_nama: `${nama} (@${username}/${platform})`,
        detail: "Sumber berita ditambahkan.",
      });
      return { sukses: true };
    }

    if (body.aksi === "toggle" || body.aksi === "hapus") {
      const id = Number(body.id ?? 0);
      if (!id) throw Object.assign(new Error("Sumber tidak disebutkan."), { status: 400 });

      if (body.aksi === "hapus") {
        const { error } = await db.from("sumber_berita").delete().eq("id", id);
        if (error) throw new Error("Gagal menghapus sumber.");
        return { sukses: true };
      }

      // toggle: balik nilai aktif.
      const { data: baris } = await db
        .from("sumber_berita")
        .select("aktif")
        .eq("id", id)
        .maybeSingle();
      if (!baris) throw Object.assign(new Error("Sumber tidak ditemukan."), { status: 404 });
      const { error } = await db
        .from("sumber_berita")
        .update({ aktif: !baris.aktif })
        .eq("id", id);
      if (error) throw new Error("Gagal mengubah status sumber.");
      return { sukses: true, aktif: !baris.aktif };
    }

    if (body.aksi === "interval") {
      const menit = Math.min(INTERVAL_MAKS, Math.max(INTERVAL_MIN, Math.round(Number(body.menit ?? 0))));
      if (!Number.isFinite(menit)) {
        throw Object.assign(new Error("Interval tidak sah."), { status: 400 });
      }
      const { error } = await db
        .from("pengaturan_sistem")
        .upsert({ kunci: "berita_interval_menit", nilai: String(menit) }, { onConflict: "kunci" });
      if (error) throw new Error("Gagal menyimpan interval.");
      return { sukses: true, interval_menit: menit };
    }

    throw Object.assign(new Error("Aksi tidak dikenal."), { status: 400 });
  });
}

// GET /api/peringkat-koin — pengguna dengan KOIN TERBANYAK (12 Sep 2026).
//
// Sumber: view v_app_koin_saldo (jumlah seluruh koin_transaksi per orang).
// Akun tersembunyi (master/superadmin) dan akun nonaktif tidak ikut —
// leaderboard ini untuk anggota, bukan untuk pengelola sistem.
//
// Ikut dikembalikan posisi PEMANGGIL sendiri, walau di luar 50 besar:
// orang membuka leaderboard terutama untuk mencari dirinya.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { PERAN_TERSEMBUNYI } from "@/lib/peran";

export const dynamic = "force-dynamic";

const MAKS_TAMPIL = 50;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku."), { status: 401 });
    const db = supabase();

    // Diambil lebih dari yang ditampilkan: sebagian akan tersaring
    // (tersembunyi/nonaktif), dan posisi pemanggil butuh daftar lengkap.
    const { data: saldo, error } = await db
      .from("v_app_koin_saldo")
      .select("user_id, saldo")
      .order("saldo", { ascending: false })
      .limit(1000);
    if (error) throw new Error("Gagal membaca saldo koin.");

    const ids = (saldo ?? []).map((s) => Number(s.user_id)).filter((n) => n > 0);
    const orang = new Map<number, { nama: string; avatar_url: string; role: string; aktif: boolean }>();
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await db
        .from("app_user")
        .select("id, nama, avatar_url, role, aktif")
        .in("id", ids.slice(i, i + 300));
      for (const u of data ?? []) {
        orang.set(Number(u.id), {
          nama: String(u.nama ?? ""),
          avatar_url: String(u.avatar_url ?? ""),
          role: String(u.role ?? ""),
          aktif: u.aktif !== false,
        });
      }
    }

    const tersembunyi = new Set<string>(PERAN_TERSEMBUNYI);
    const daftar = (saldo ?? [])
      .map((s) => ({ user_id: Number(s.user_id), saldo: Number(s.saldo ?? 0) }))
      .filter((s) => {
        const o = orang.get(s.user_id);
        return o && o.aktif && !tersembunyi.has(o.role) && s.saldo > 0;
      })
      .map((s, i) => ({
        peringkat: i + 1,
        user_id: String(s.user_id),
        nama: orang.get(s.user_id)?.nama ?? "",
        avatar_url: orang.get(s.user_id)?.avatar_url ?? "",
        saldo: s.saldo,
      }));

    const posisiSaya = daftar.find((d) => d.user_id === String(user.id)) ?? null;
    return {
      daftar: daftar.slice(0, MAKS_TAMPIL),
      jumlah: daftar.length,
      saya: posisiSaya,
    };
  });
}

// GET  /api/perbaikan — status mode perbaikan (publik, tanpa auth):
//        dipakai layar terkunci untuk countdown & auto-berakhir.
// POST /api/perbaikan — nyala/matikan (khusus master).
//        { aktif: boolean, sampai?: string(ISO), pesan?: string }
//
// SENGAJA tanpa auth di GET: layar perbaikan harus bisa memeriksa
// apakah perbaikan sudah selesai TANPA sesi yang barangkali ditolak
// selama perbaikan. Yang dibocorkan hanya status + jam perkiraan,
// tidak ada data pengguna.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import {
  KUNCI_PERBAIKAN,
  KUNCI_SAMPAI,
  KUNCI_PESAN,
  statusPerbaikan,
} from "@/lib/perbaikan";

export const dynamic = "force-dynamic";

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function GET() {
  return bungkus(async () => {
    return await statusPerbaikan();
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (user.role !== "master") {
      throw Object.assign(new Error("Hanya master yang boleh mengatur mode perbaikan."), {
        status: 403,
      });
    }

    const body = (await request.json().catch(() => ({}))) as {
      aktif?: boolean;
      sampai?: string;
      pesan?: string;
    };
    const nyala = body.aktif === true;

    // Perkiraan jam selesai: divalidasi sebagai waktu yang MASUK AKAL —
    // harus di masa depan, dan tidak lebih dari 7 hari (salah ketik
    // tanggal tidak boleh mengunci aplikasi berhari-hari).
    let sampai = "";
    if (nyala && body.sampai) {
      const t = new Date(body.sampai).getTime();
      if (!Number.isFinite(t)) {
        throw Object.assign(new Error("Jam selesai tidak dikenali."), { status: 400 });
      }
      if (t <= Date.now()) {
        throw Object.assign(new Error("Jam selesai harus di masa depan."), { status: 400 });
      }
      if (t > Date.now() + 7 * 24 * 3600 * 1000) {
        throw Object.assign(new Error("Jam selesai maksimal 7 hari dari sekarang."), {
          status: 400,
        });
      }
      sampai = new Date(t).toISOString();
    }

    const db = supabase();
    const baris = [
      { kunci: KUNCI_PERBAIKAN, nilai: nyala ? "true" : "false" },
      { kunci: KUNCI_SAMPAI, nilai: nyala ? sampai : "" },
      { kunci: KUNCI_PESAN, nilai: nyala ? (body.pesan ?? "").slice(0, 200) : "" },
    ];
    const { error } = await db
      .from("pengaturan_sistem")
      .upsert(baris, { onConflict: "kunci" });
    if (error) throw new Error("Gagal menyimpan mode perbaikan.");

    return { sukses: true, ...(await statusPerbaikan()) };
  });
}

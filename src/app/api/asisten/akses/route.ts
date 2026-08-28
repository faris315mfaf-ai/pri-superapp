// GET  /api/asisten/akses — matriks jabatan × akses chatbot (master/super)
// POST /api/asisten/akses — nyalakan/matikan chatbot utk satu jabatan
//
// Fitur 1.20/3: pola sama dengan akses dashboard — baris = NYALA,
// jabatan baru mulai dari mati, master selalu penuh.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { PERAN_DIATUR } from "@/lib/fitur";

export const dynamic = "force-dynamic";

const PENGATUR = new Set(["super_admin", "master"]);
const PERAN_SAH = new Set(PERAN_DIATUR.map((p) => p.id as string));

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanPengatur(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  if (!PENGATUR.has(user.role)) {
    throw Object.assign(
      new Error("Hanya master/super admin yang boleh mengatur akses Asisten AI."),
      { status: 403 },
    );
  }
  return user;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanPengatur(request);
    const { data } = await supabase().from("chatbot_access").select("role, aktif");
    const nyala = (data ?? []).filter((b) => b.aktif === true).map((b) => String(b.role));
    return { peran: PERAN_DIATUR, nyala };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    await pastikanPengatur(request);
    const body = (await request.json().catch(() => ({}))) as {
      role?: string;
      aktif?: boolean;
    };
    const role = String(body.role ?? "");
    if (!PERAN_SAH.has(role)) {
      throw Object.assign(new Error("Jabatan tidak dikenal."), { status: 400 });
    }

    const { error } = await supabase()
      .from("chatbot_access")
      .upsert(
        { role, aktif: body.aktif === true, diubah_pada: new Date().toISOString() },
        { onConflict: "role" },
      );
    if (error) {
      console.error("[asisten-akses] simpan:", error.message);
      throw new Error("Gagal menyimpan pengaturan.");
    }
    return { sukses: true };
  });
}

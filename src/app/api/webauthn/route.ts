// GET    /api/webauthn — status sidik jari SAYA (aktif? berapa perangkat)
// DELETE /api/webauthn — NONAKTIFKAN: hapus semua kredensial sidik jari
//
// Fitur 1.21: dipakai toggle di Profil → Keamanan.
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { supabase } from "@/lib/supabase";
import { jumlahKredensial } from "@/lib/webauthn";

export const dynamic = "force-dynamic";

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasuk(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  return user;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const jumlah = await jumlahKredensial(Number(user.id));
    return { aktif: jumlah > 0, jumlah_perangkat: jumlah };
  });
}

export async function DELETE(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const { error } = await supabase()
      .from("kredensial_webauthn")
      .delete()
      .eq("user_id", Number(user.id));
    if (error) {
      console.error("[webauthn] hapus:", error.message);
      throw new Error("Gagal menonaktifkan sidik jari.");
    }
    return { sukses: true };
  });
}

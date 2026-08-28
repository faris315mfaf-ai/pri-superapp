// GET  /api/asisten/latih — instruksi pelatihan saat ini (master)
// POST /api/asisten/latih — simpan instruksi pelatihan {instruksi}
//
// Fitur 1.20.2: MASTER "melatih" asisten dengan menulis instruksi/
// pengetahuan tambahan yang disuntikkan ke SETIAP percakapan (teks
// & suara). Berlaku seketika, tercatat di jejak audit.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { instruksiLatihan, MAKS_INSTRUKSI_LATIH } from "@/lib/gemini";

export const dynamic = "force-dynamic";

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMaster(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  if (user.role !== "master") {
    throw Object.assign(new Error("Hanya master yang boleh melatih Asisten AI."), {
      status: 403,
    });
  }
  return user;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanMaster(request);
    return { instruksi: await instruksiLatihan(), maks: MAKS_INSTRUKSI_LATIH };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const master = await pastikanMaster(request);
    const body = (await request.json().catch(() => ({}))) as { instruksi?: string };
    const instruksi = String(body.instruksi ?? "").slice(0, MAKS_INSTRUKSI_LATIH);

    const db = supabase();
    const { error } = await db.from("pengaturan_sistem").upsert(
      { kunci: "asisten_instruksi", nilai: instruksi },
      { onConflict: "kunci" },
    );
    if (error) {
      console.error("[asisten/latih] simpan:", error.message);
      throw new Error("Gagal menyimpan pelatihan.");
    }

    // Jejak audit: perubahan otak asisten harus tertelusur.
    await db.from("log_audit").insert({
      aktor_id: Number(master.id),
      aktor_nama: master.nama,
      aksi: "latih_asisten",
      target_id: null,
      target_nama: "Asisten AI",
      detail: instruksi
        ? `Instruksi pelatihan diperbarui (${instruksi.length} karakter).`
        : "Instruksi pelatihan dikosongkan.",
    });

    return { sukses: true, panjang: instruksi.length };
  });
}

// POST /api/wajah/daftar — daftarkan/perbarui wajah saya (fitur 1.22/3).
//
// Menerima satu foto (data URL), meneruskannya ke penyedia untuk
// di-enroll, lalu MENYIMPAN HANYA face_id-nya. Foto tidak disimpan.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { daftarWajahPenyedia, WajahBelumDiaturError, wajahSiap } from "@/lib/wajah";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Batas foto (base64 ~4 MB → ±3 MB biner) supaya payload wajar */
const MAKS_IMAGE = 4 * 1024 * 1024;

export async function POST(request: Request) {
  const tolak = await pastikanTidakMelebihiBatas(request, "wajah-daftar", 8, 10 * 60);
  if (tolak) return tolak;

  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!wajahSiap()) {
      throw Object.assign(
        new Error("Verifikasi wajah belum diaktifkan oleh pengurus."),
        { status: 503 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as { image?: string };
    const image = String(body.image ?? "");
    if (!image.startsWith("data:image/") || image.length < 100) {
      throw Object.assign(new Error("Foto wajah tidak sah."), { status: 400 });
    }
    if (image.length > MAKS_IMAGE) {
      throw Object.assign(new Error("Foto terlalu besar. Coba lagi."), { status: 400 });
    }

    let faceId: string;
    let provider: string;
    try {
      ({ faceId, provider } = await daftarWajahPenyedia(user.id, image));
    } catch (e) {
      if (e instanceof WajahBelumDiaturError) {
        throw Object.assign(new Error(e.message), { status: 503 });
      }
      throw e;
    }

    const { error } = await supabase()
      .from("wajah_template")
      .upsert(
        {
          user_id: Number(user.id),
          face_id: faceId,
          provider,
          didaftarkan_pada: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (error) throw new Error("Gagal menyimpan pendaftaran wajah.");

    await supabase().from("log_audit").insert({
      aktor_id: Number(user.id),
      aktor_nama: user.nama,
      aksi: "wajah_daftar",
      target_id: Number(user.id),
      target_nama: user.nama,
      detail: `Wajah didaftarkan (penyedia ${provider || "?"}).`,
    });

    return { sukses: true, terdaftar: true };
  });
}

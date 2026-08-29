// POST /api/wajah/daftar — daftarkan/perbarui wajah saya (fitur 1.22/3).
//
// Menerima BEBERAPA foto (data URL) untuk beberapa sudut, meneruskannya
// ke penyedia untuk di-enroll, lalu MENYIMPAN HANYA face_id-nya. Foto
// tidak disimpan aplikasi. Menerima {images:[...]} atau {image:"..."}.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { daftarWajahPenyedia, hapusWajahPenyedia, WajahBelumDiaturError, wajahSiap } from "@/lib/wajah";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Batas per-foto (base64 ~4 MB → ±3 MB biner) supaya payload wajar */
const MAKS_IMAGE = 4 * 1024 * 1024;
/** Maksimal foto per pendaftaran */
const MAKS_FOTO = 6;

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

    const body = (await request.json().catch(() => ({}))) as { image?: string; images?: string[] };
    // Terima array {images} maupun tunggal {image} (kompatibel mundur).
    const mentah = Array.isArray(body.images) ? body.images : body.image ? [body.image] : [];
    const images = mentah
      .filter((s): s is string => typeof s === "string" && s.startsWith("data:image/") && s.length >= 100)
      .slice(0, MAKS_FOTO);
    if (images.length === 0) {
      throw Object.assign(new Error("Foto wajah tidak sah."), { status: 400 });
    }
    if (images.some((s) => s.length > MAKS_IMAGE)) {
      throw Object.assign(new Error("Foto terlalu besar. Coba lagi."), { status: 400 });
    }

    // Referensi lama (bila daftar ulang) — dihapus di penyedia SETELAH
    // yang baru sukses tersimpan, supaya tak ada jendela tanpa wajah.
    const { data: lama } = await supabase()
      .from("wajah_template")
      .select("face_id")
      .eq("user_id", Number(user.id))
      .maybeSingle();

    let faceId: string;
    let provider: string;
    try {
      ({ faceId, provider } = await daftarWajahPenyedia(user.id, images));
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

    // Buang subjek lama di penyedia (best-effort) — hanya bila memang beda.
    if (lama?.face_id && lama.face_id !== faceId) {
      await hapusWajahPenyedia(String(lama.face_id)).catch(() => {});
    }

    await supabase().from("log_audit").insert({
      aktor_id: Number(user.id),
      aktor_nama: user.nama,
      aksi: "wajah_daftar",
      target_id: Number(user.id),
      target_nama: user.nama,
      detail: `Wajah didaftarkan dari ${images.length} foto (penyedia ${provider || "?"}).`,
    });

    return { sukses: true, terdaftar: true };
  });
}

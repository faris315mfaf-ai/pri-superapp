/**
 * /api/autoedit/* — gerbang modul Auto Edit (master) dan Edit Otomatis TVR
 * Saya (akun yang dibuka master), 30 Sep 2026. Penjaga peran dan penerusan
 * ke layanan ada di lib/autoedit.
 */
import { galatAutoEdit, keluargaAutoEdit, teruskanAutoEdit } from "@/lib/autoedit";
import { pastikanMasuk } from "@/lib/sesi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function tangani(
  request: Request,
  { params }: { params: Promise<{ jalur: string[] }> },
): Promise<Response> {
  let user;
  try {
    user = await pastikanMasuk(request);
  } catch {
    return galatAutoEdit(401, "Sesi tidak berlaku. Silakan masuk lagi.");
  }
  // Tanpa izin: 404, bukan 403 — modul ini tidak perlu diumumkan.
  const keluarga = keluargaAutoEdit(user);
  if (keluarga.size === 0) return galatAutoEdit(404, "Tidak ditemukan");
  const { jalur } = await params;
  return teruskanAutoEdit(request, jalur ?? [], user.id, keluarga);
}

export const GET = tangani;
export const POST = tangani;
export const PUT = tangani;
export const PATCH = tangani;
export const DELETE = tangani;

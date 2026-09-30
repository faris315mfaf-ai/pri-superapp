/**
 * /api/autoedit/* — gerbang modul Auto Edit (khusus master, 30 Sep 2026).
 * Penjaga peran dan penerusan ke layanan ada di lib/autoedit.
 */
import { bolehAutoEdit, galatAutoEdit, teruskanAutoEdit } from "@/lib/autoedit";
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
  // Bukan master: 404, bukan 403 — modul ini tidak perlu diumumkan.
  if (!bolehAutoEdit(user)) return galatAutoEdit(404, "Tidak ditemukan");
  const { jalur } = await params;
  return teruskanAutoEdit(request, jalur ?? [], user.id);
}

export const GET = tangani;
export const POST = tangani;
export const PUT = tangani;
export const PATCH = tangani;
export const DELETE = tangani;

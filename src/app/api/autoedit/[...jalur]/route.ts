/**
 * /api/autoedit/* — gerbang modul Auto Edit (master), Stok Video TVR Saya
 * (semua akun) dan Edit Otomatis TVR Saya (≥5 akun sosmed terhubung, atau
 * dibuka master). Penjaga peran dan penerusan ke layanan ada di lib/autoedit.
 */
import {
  bolehEditOtomatisServer,
  galatAutoEdit,
  jalurStokTvr,
  keluargaAutoEdit,
  teruskanAutoEdit,
} from "@/lib/autoedit";
import { MINIMAL_AKUN_EDIT_OTOMATIS } from "@/lib/peran";
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
  const j = jalur ?? [];
  // Edit Otomatis TVR (template, sumber, tulisan, render) butuh minimal 5
  // akun sosmed terhubung; Stok Video terbuka untuk semua (5 Okt 2026).
  if (j[0] === "tvr" && !jalurStokTvr(j) && !(await bolehEditOtomatisServer(user))) {
    return galatAutoEdit(
      403,
      `Edit Otomatis terbuka setelah minimal ${MINIMAL_AKUN_EDIT_OTOMATIS} akun sosmed terhubung. Sambung ulang akun Anda di TVR Saya → Hubungkan, lalu tekan Segarkan.`,
    );
  }
  return teruskanAutoEdit(request, j, user.id, keluarga);
}

export const GET = tangani;
export const POST = tangani;
export const PUT = tangani;
export const PATCH = tangani;
export const DELETE = tangani;

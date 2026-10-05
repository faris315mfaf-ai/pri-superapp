/**
 * /api/autoedit/* — gerbang modul Auto Edit (master), Stok Video TVR Saya
 * (semua akun) dan Edit Otomatis TVR Saya (≥5 akun sosmed terhubung, atau
 * dibuka master). Penjaga peran dan penerusan ke layanan ada di lib/autoedit.
 */
import {
  bolehEditOtomatisServer,
  galatAutoEdit,
  identitasTim,
  jalurStokTvr,
  keluargaAutoEdit,
  teruskanAutoEdit,
} from "@/lib/autoedit";
import { bolehAlatVideo, MINIMAL_AKUN_EDIT_OTOMATIS } from "@/lib/peran";
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
  const { jalur } = await params;
  const j = jalur ?? [];
  // Alat video (Kompres Video, Hapus Latar Boom, Blur Watermark): terbuka
  // untuk semua kecuali ditutup master per akun — juga lewat jalur tim. Tanpa izin: 404.
  const fiturUji =
    j[0] !== "tvr"
      ? null
      : j[1] === "kompres"
        ? "kompres"
        : j[1] === "blur"
          ? "blurwm"
          : j[1] === "template" && j[2] === "hapus-latar"
            ? "hapuslatar"
            : null;
  if (fiturUji && !bolehAlatVideo(user, fiturUji)) return galatAutoEdit(404, "Tidak ditemukan");
  // Akun TIM (5 Okt 2026): modul TV Rakyat Official memakai template & stok
  // bersama tim. Hanya jalur TVR; anggota tim dipastikan di identitasTim.
  const tim = (request.headers.get("x-autoedit-tim") ?? "").trim().toLowerCase();
  if (tim) {
    const idTim = await identitasTim(user, tim);
    if (!idTim || j[0] !== "tvr") return galatAutoEdit(404, "Tidak ditemukan");
    return teruskanAutoEdit(request, j, idTim, new Set(["tvr"]), String(user.id));
  }

  // Tanpa izin: 404, bukan 403 — modul ini tidak perlu diumumkan.
  const keluarga = keluargaAutoEdit(user);
  if (keluarga.size === 0) return galatAutoEdit(404, "Tidak ditemukan");
  // Kompres & Blur Watermark tidak memerlukan Edit Otomatis (izinnya sudah dicek di atas).
  if (fiturUji === "kompres" || fiturUji === "blurwm") return teruskanAutoEdit(request, j, user.id, keluarga);
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

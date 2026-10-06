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
import { catatAudit } from "@/lib/audit";
import type { JenisAudit } from "@/lib/audit-jenis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AUDIT (6 Okt 2026): aksi mana yang dicatat, dari jalur & metodenya.
 * GET (melihat stok, memantau antrean) tidak dicatat — terlalu ramai.
 */
function aksiAudit(metode: string, j: string[]): { jenis: JenisAudit; ringkasan: string } | null {
  const [akar, a1, a2, a3] = j;
  if (akar === "tvr") {
    if (metode === "POST" && a1 === "jobs" && !a2) return { jenis: "edit_otomatis", ringkasan: "Membuat video Edit Otomatis" };
    if (metode === "POST" && a1 === "kompres" && !a2) return { jenis: "kompres", ringkasan: "Mengompres video" };
    if (metode === "POST" && a1 === "blur" && (!a2 || a2 === "dari-stok")) return { jenis: "blur_watermark", ringkasan: "Membuka video untuk Blur Watermark" };
    if (metode === "POST" && a1 === "blur" && a3 === "proses") return { jenis: "blur_watermark", ringkasan: "Memproses Blur Watermark" };
    if (metode === "POST" && a1 === "template" && a2 === "hapus-latar") return { jenis: "hapus_latar", ringkasan: "Menghapus latar bahan template" };
    if (metode === "PUT" && a1 === "template" && !a2) return { jenis: "template", ringkasan: "Menyimpan template Edit Otomatis" };
    if (metode === "POST" && a1 === "stok" && !a2) return { jenis: "stok_tambah", ringkasan: "Menambah video ke Stok" };
    if (metode === "DELETE" && a1 === "stok" && a2) return { jenis: "stok_hapus", ringkasan: "Menghapus video dari Stok" };
  }
  if (akar === "video" && metode === "POST" && a1 === "jobs" && (!a2 || a2 === "batch")) {
    return { jenis: "auto_edit", ringkasan: a2 === "batch" ? "Render Auto Edit (banyak template)" : "Render Auto Edit" };
  }
  return null;
}

/** Isi permintaan JSON kecil yang layak disimpan di detail audit. */
async function detailJson(salinan: Request | null): Promise<Record<string, unknown>> {
  if (!salinan) return {};
  try {
    const b = (await salinan.json()) as Record<string, unknown>;
    const teks = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined);
    const texts = (b.texts ?? {}) as Record<string, unknown>;
    return {
      tulisan: teks(b.hook, 300) ?? teks(texts.hook, 300),
      kategori: teks(b.kategori, 60) ?? teks(texts.kategori, 60),
      sumber_kredit: teks(b.sumber, 120) ?? teks(texts.sumber, 120),
      // Tautan sumber (TikTok/IG/FB) — id unggahan internal tidak berguna di layar.
      tautan: /^https?:\/\//.test(String(b.url ?? "")) ? teks(b.url, 500) : undefined,
      jumlah_template: Array.isArray(b.template_ids) ? b.template_ids.length : undefined,
    };
  } catch {
    return {};
  }
}

/** Teruskan, lalu catat aksinya bila berhasil (tidak pernah mengubah jawaban). */
async function teruskanDanCatat(
  request: Request,
  j: string[],
  userId: string,
  jalankan: (r: Request) => Promise<Response>,
  tim = false,
): Promise<Response> {
  const aksi = aksiAudit(request.method, j);
  if (!aksi) return jalankan(request);
  // Hanya permintaan JSON kecil yang disalin; unggahan berkas (multipart)
  // TIDAK — menyalin aliran ratusan MB hanya untuk audit itu pemborosan.
  const json = (request.headers.get("content-type") ?? "").includes("application/json");
  const salinan = json ? request.clone() : null;
  const jawaban = await jalankan(request);
  if (jawaban.status < 400) {
    const detail = { ...(await detailJson(salinan)), ...(tim ? { tim: true } : {}), jalur: j.join("/") };
    catatAudit(userId, aksi.jenis, aksi.ringkasan, { request, detail });
  }
  return jawaban;
}

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
    return teruskanDanCatat(request, j, user.id, (r) => teruskanAutoEdit(r, j, idTim, new Set(["tvr"]), String(user.id)), true);
  }

  // Tanpa izin: 404, bukan 403 — modul ini tidak perlu diumumkan.
  const keluarga = keluargaAutoEdit(user);
  if (keluarga.size === 0) return galatAutoEdit(404, "Tidak ditemukan");
  // Kompres & Blur Watermark tidak memerlukan Edit Otomatis (izinnya sudah dicek di atas).
  if (fiturUji === "kompres" || fiturUji === "blurwm") {
    return teruskanDanCatat(request, j, user.id, (r) => teruskanAutoEdit(r, j, user.id, keluarga));
  }
  // Edit Otomatis TVR (template, sumber, tulisan, render) butuh minimal 5
  // akun sosmed terhubung; Stok Video terbuka untuk semua (5 Okt 2026).
  if (j[0] === "tvr" && !jalurStokTvr(j) && !(await bolehEditOtomatisServer(user))) {
    return galatAutoEdit(
      403,
      `Edit Otomatis terbuka setelah minimal ${MINIMAL_AKUN_EDIT_OTOMATIS} akun sosmed terhubung. Sambung ulang akun Anda di TVR Saya → Hubungkan, lalu tekan Segarkan.`,
    );
  }
  return teruskanDanCatat(request, j, user.id, (r) => teruskanAutoEdit(r, j, user.id, keluarga));
}

export const GET = tangani;
export const POST = tangani;
export const PUT = tangani;
export const PATCH = tangani;
export const DELETE = tangani;

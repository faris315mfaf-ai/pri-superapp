// STATUS VERIFIKASI ARAH MASUK (7 Okt 2026, lib/otp).
//
// GET /api/otp/wa-masuk?token=…  → { terkonfirmasi, kedaluwarsa }
//
// Dipolling klien setelah pengguna membuka tautan wa.me. Token 192-bit acak
// (hanya hash-nya di database) — tak bisa ditebak, tak membuka data akun.
import { bungkus } from "@/lib/api-helper";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { statusOtpMasuk } from "@/lib/otp";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Polling ±2,5 detik selama ≤5 menit ≈ 120 panggilan per kode.
  const tolak = await pastikanTidakMelebihiBatas(request, "otp-wa-masuk-status", 300, 15 * 60);
  if (tolak) return tolak;
  return bungkus(async () => {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    return await statusOtpMasuk(token);
  });
}

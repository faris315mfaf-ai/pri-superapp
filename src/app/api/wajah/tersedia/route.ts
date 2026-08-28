// GET /api/wajah/tersedia — apakah login-wajah aktif? (publik, pra-login)
//
// Dipakai layar Masuk untuk memutuskan menampilkan tombol "Masuk dengan
// Wajah". Tidak membocorkan apa pun selain apakah penyedia tersambung.
import { bungkus } from "@/lib/api-helper";
import { wajahSiap } from "@/lib/wajah";

export const dynamic = "force-dynamic";

export async function GET() {
  return bungkus(async () => ({ siap: wajahSiap() }));
}

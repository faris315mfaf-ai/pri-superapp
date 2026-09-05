// /api/pet/lobi — KONFIGURASI LOBI REALTIME (5 Sep 2026).
// GET → { realtime, url, key, kanal, dunia, saya }
//   • realtime true bila SUPABASE_PUBLISHABLE_KEY terpasang: klien membuka
//     kanal Supabase Realtime (broadcast + presence) langsung dari peramban —
//     posisi robot tidak lewat database sama sekali.
//   • key = kunci PUBLISHABLE (memang untuk peramban; RLS tanpa kebijakan
//     berarti kunci ini tidak bisa membaca tabel apa pun).
//   • saya = rupa robot pemanggil (jenis, skin, aksesoris, barang tradable)
//     yang diumumkan lewat presence.
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { bolehPet, PESAN_PET_DIMATIKAN } from "@/lib/pet-akses";
import { bacaTampilanRobot, DUNIA_LOBI, KANAL_LOBI } from "@/lib/pet-lobi";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!bolehPet(user)) throw Object.assign(new Error(PESAN_PET_DIMATIKAN), { status: 403 });
    const saya = await bacaTampilanRobot(Number(user.id), user.nama);
    if (!saya) throw Object.assign(new Error("Adopsi robot dulu di Pet Robot sebelum masuk lobi."), { status: 404 });
    const key = (process.env.SUPABASE_PUBLISHABLE_KEY ?? "").trim();
    const url = (process.env.SUPABASE_URL ?? "").trim();
    return {
      realtime: Boolean(key && url),
      url,
      key,
      kanal: KANAL_LOBI,
      dunia: DUNIA_LOBI,
      saya,
    };
  });
}

// /api/ruang/status — Ruang Bot untuk SEMUA anggota yang login (14 Okt 2026).
// GET → StatusRuangUmum: siapa online (nama + jenis kegiatan), bot (rupa & tempat), koordinator.
// Tanpa judul video, akun sosmed, platform, divisi, atau kendali — rincian itu tetap di /api/bot/* (master).
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { modulAktifServer } from "@/lib/sakelar";
import { bacaRuangUmum } from "@/lib/ruang-umum";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanMasuk(request);
    if (!(await modulAktifServer("ruangbot"))) {
      throw Object.assign(new Error("Modul Ruang Bot sedang dinonaktifkan."), { status: 423 });
    }
    return bacaRuangUmum();
  });
}

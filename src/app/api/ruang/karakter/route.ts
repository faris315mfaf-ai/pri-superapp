// /api/ruang/karakter — KARAKTER SAYA (16 Okt 2026). Uji coba bertahap: akun Faris saja
// (bolehKarakterSaya di src/lib/karakter-murni.ts).
//   GET            → KarakterSaya (konfig tersimpan, atau rupa bawaan bila belum memilih)
//   PUT { konfig } → simpan (divalidasi ketat terhadap katalog; maks 30 simpan / jam)
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { modulAktifServer } from "@/lib/sakelar";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { adalahBot } from "@/lib/struktur";
import { BATAS_SIMPAN, JENDELA_SIMPAN_DETIK, bolehKarakterSaya, validasiKonfig } from "@/lib/karakter-murni";
import { GalatKarakter, bacaKarakterSaya, simpanKarakterSaya } from "@/lib/karakter";

export const dynamic = "force-dynamic";

function tolak(pesan: string, status: number): never {
  throw Object.assign(new Error(pesan), { status, pesanAman: true });
}

async function pengguna(request: Request) {
  const user = await pastikanMasuk(request);
  if (adalahBot(user)) tolak("Akun bot tidak memilih karakter.", 403);
  if (!bolehKarakterSaya(user)) tolak("Karakter Saya belum dibuka untuk akun ini.", 403);
  if (!(await modulAktifServer("ruangbot"))) tolak("Modul Ruang Bot sedang dinonaktifkan.", 423);
  return user;
}

function lempar(e: unknown): never {
  if (e instanceof GalatKarakter) tolak(e.message, e.status);
  throw e;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pengguna(request);
    try {
      return await bacaKarakterSaya(Number(user.id));
    } catch (e) {
      lempar(e);
    }
  });
}

export async function PUT(request: Request) {
  return bungkus(async () => {
    const user = await pengguna(request);
    const uid = Number(user.id);
    const batas = await pastikanTidakMelebihiBatas(request, "karakter-simpan", BATAS_SIMPAN, JENDELA_SIMPAN_DETIK, String(uid));
    if (batas) tolak(`Terlalu sering menyimpan. Maksimal ${BATAS_SIMPAN} kali per jam.`, 429);
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const sah = validasiKonfig(b.konfig);
    if (!sah.ok) tolak(sah.pesan, 400);
    try {
      return await simpanKarakterSaya(uid, sah.konfig);
    } catch (e) {
      lempar(e);
    }
  });
}

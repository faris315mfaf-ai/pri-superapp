// /api/bot/siaran — SIARAN KOORDINATOR ke akun sosmed anggota (15 Okt 2026). HANYA master.
//   GET ?bagian=penerima[&perintah=<id>]  → semua anggota berprofil upload-post + status kesiapan
//   GET ?bagian=video                      → pilihan video: Antrean ACC, Stok tim, bahan Video Wajib
//   GET ?bagian=riwayat                    → siaran koordinator terakhir + status tiap akun
//   POST { aksi:"variasi", judul, caption } → variasi caption oleh Nara (LLM koordinator)
//   POST { aksi:"siarkan", video{sumber,id|r2_key|path}, judul, caption, variasi[], platforms[],
//          penerima[user_id], mode, jeda_detik, mulai?, konfirmasi?, tampil_ruang, perintah_id? }
//   PATCH { id, aksi:"jeda"|"lanjut"|"batal"|"ulang_gagal" }
// Anggota menyetujui siaran koordinator saat mendaftar (keputusan pemilik); server tetap
// menghitung ulang kesiapan tiap akun dan mengirim bertahap. Rincian: lib/siaran-koordinator.ts.
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { bolehRuangBot } from "@/lib/peran";
import { modulAktifServer } from "@/lib/sakelar";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import {
  GalatSiaran,
  buatSiaranKoordinator,
  daftarPenerima,
  daftarSumberVideo,
  kendaliSiaran,
  riwayatSiaranKoordinator,
  variasiCaptionNara,
  type AksiSiaran,
  type MasukanSiaran,
} from "@/lib/siaran-koordinator";

export const dynamic = "force-dynamic";
// Menyalin video dari Stok mesin ke penyimpanan bisa memakan waktu.
export const maxDuration = 300;

const AKSI_KENDALI: readonly AksiSiaran[] = ["jeda", "lanjut", "batal", "ulang_gagal"];

function tolak(pesan: string, status = 400): never {
  throw Object.assign(new Error(pesan), { status, pesanAman: true });
}

async function pastikanMaster(request: Request) {
  const user = await pastikanMasuk(request);
  if (!bolehRuangBot(user)) tolak("Siaran koordinator hanya untuk master.", 403);
  if (!(await modulAktifServer("ruangbot"))) tolak("Modul Ruang Bot sedang dinonaktifkan.", 423);
  return user;
}

/** Galat siaran → status + pesan yang aman ditampilkan. */
async function jalankan<T>(kerja: () => Promise<T>): Promise<T> {
  try {
    return await kerja();
  } catch (e) {
    if (e instanceof GalatSiaran) tolak(e.message, e.status);
    throw e;
  }
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanMaster(request);
    const url = new URL(request.url);
    const bagian = url.searchParams.get("bagian") ?? "";
    if (bagian === "penerima") {
      const perintah = Number(url.searchParams.get("perintah") ?? 0);
      return jalankan(async () => ({ data: await daftarPenerima({ perintahId: Number.isSafeInteger(perintah) && perintah > 0 ? perintah : null }) }));
    }
    if (bagian === "video") return jalankan(() => daftarSumberVideo());
    if (bagian === "riwayat") return jalankan(async () => ({ data: await riwayatSiaranKoordinator() }));
    tolak("Bagian tidak dikenal.");
  });
}

export async function POST(request: Request) {
  const terlalu = await pastikanTidakMelebihiBatas(request, "bot-siaran", 20, 60);
  if (terlalu) return terlalu;
  return bungkus(async () => {
    const user = await pastikanMaster(request);
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (b.aksi === "variasi") {
      return jalankan(() => variasiCaptionNara(String(b.judul ?? ""), String(b.caption ?? "")));
    }
    if (b.aksi === "siarkan") {
      return jalankan(() => buatSiaranKoordinator(user, b as unknown as MasukanSiaran, request));
    }
    tolak("Aksi tidak dikenal.");
  });
}

export async function PATCH(request: Request) {
  const terlalu = await pastikanTidakMelebihiBatas(request, "bot-siaran-kendali", 30, 60);
  if (terlalu) return terlalu;
  return bungkus(async () => {
    const user = await pastikanMaster(request);
    const b = (await request.json().catch(() => ({}))) as { id?: unknown; aksi?: unknown };
    const id = Number(b.id);
    if (!Number.isSafeInteger(id) || id <= 0) tolak("Siaran tidak disebutkan.");
    const aksi = String(b.aksi ?? "") as AksiSiaran;
    if (!AKSI_KENDALI.includes(aksi)) tolak("Aksi tidak dikenal.");
    return jalankan(() => kendaliSiaran(user, id, aksi, request));
  });
}

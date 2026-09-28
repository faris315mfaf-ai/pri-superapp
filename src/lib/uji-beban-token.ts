// ============================================================
// TOKEN UJI BEBAN (29 Sep 2026). SERVER.
//
// Bentuk: ujibeban.<idPutaran>.<idAkun>.<berlakuSampaiMs>.<tanda>
// tanda = HMAC-SHA256 dari rahasia turunan CRON_SECRET. Token hanya sah
// selama putarannya TERDAFTAR di memori proses ini (dibuat mesin uji saat
// mulai, dihapus saat selesai/dihentikan) — jadi tidak ada pintu belakang
// yang bertahan: begitu uji selesai, semua token uji mati seketika.
// Token tidak pernah dikirim ke peramban; mesin uji memakainya sendiri
// ke 127.0.0.1. Proxy membatasinya ke GET rute uji (lib/uji-beban-skenario).
// ============================================================
import { createHmac, timingSafeEqual } from "node:crypto";
import { AWALAN_TOKEN_UJI } from "@/lib/uji-beban-skenario";

// Satu daftar untuk seluruh proses (modul bisa termuat lebih dari sekali
// oleh bundel rute yang berbeda — pola yang sama dengan lib/kehadiran).
const gudang = globalThis as unknown as { __priPutaranUji?: Map<string, number> };
const putaran: Map<string, number> = (gudang.__priPutaranUji ??= new Map<string, number>());

export function daftarkanPutaranUji(id: string, sampaiMs: number): void {
  putaran.set(id, sampaiMs);
}

export function akhiriPutaranUji(id: string): void {
  putaran.delete(id);
}

export function putaranUjiAktif(id: string, kini: number = Date.now()): boolean {
  const sampai = putaran.get(id);
  return sampai !== undefined && sampai > kini;
}

/** Rahasia penanda token; "" bila server tidak punya CRON_SECRET (fitur mati). */
export function rahasiaUji(): string {
  const dasar = process.env.CRON_SECRET || process.env.ASISTEN_CRON_SECRET || "";
  if (!dasar) return "";
  return createHmac("sha256", dasar).update("pri-uji-beban-v1").digest("hex");
}

function tanda(rahasia: string, isi: string): string {
  return createHmac("sha256", rahasia).update(isi).digest("hex").slice(0, 40);
}

export function buatTokenUji(idPutaran: string, userId: number, sampaiMs: number, rahasia: string = rahasiaUji()): string {
  if (!rahasia) throw new Error("CRON_SECRET belum diatur — uji beban tidak bisa dijalankan.");
  if (!/^[a-z0-9]{6,32}$/.test(idPutaran)) throw new Error("Id putaran tidak sah.");
  const isi = `${idPutaran}.${Math.floor(userId)}.${Math.floor(sampaiMs)}`;
  return `${AWALAN_TOKEN_UJI}${isi}.${tanda(rahasia, isi)}`;
}

/** Id putaran & akun bila token uji sah dan putarannya masih berjalan; selain itu null. */
export function periksaTokenUji(
  token: string,
  kini: number = Date.now(),
  rahasia: string = rahasiaUji(),
): { idPutaran: string; userId: number } | null {
  if (!rahasia || !token.startsWith(AWALAN_TOKEN_UJI)) return null;
  const bagian = token.slice(AWALAN_TOKEN_UJI.length).split(".");
  if (bagian.length !== 4) return null;
  const [idPutaran, idAkun, sampaiTeks, tandaTeks] = bagian;
  if (!/^[a-z0-9]{6,32}$/.test(idPutaran) || !/^\d{1,12}$/.test(idAkun) || !/^\d{10,16}$/.test(sampaiTeks)) return null;
  const harus = Buffer.from(tanda(rahasia, `${idPutaran}.${idAkun}.${sampaiTeks}`));
  const diberi = Buffer.from(tandaTeks);
  if (harus.length !== diberi.length || !timingSafeEqual(harus, diberi)) return null;
  if (Number(sampaiTeks) <= kini) return null;
  if (!putaranUjiAktif(idPutaran, kini)) return null;
  const userId = Number(idAkun);
  return userId > 0 ? { idPutaran, userId } : null;
}

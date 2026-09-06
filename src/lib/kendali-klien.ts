// ============================================================
// BERALIH AKUN PENUH — sisi PERAMBAN (6 Sep 2026).
//
// Admin PALUGODAM "masuk" sebagai anggota Divisi PALUGODAM tanpa kata
// sandi: server membuat sesi perangkat untuk akun tujuan (/api/tvr/kendali
// aksi "masuk"), token admin disimpan sementara di localStorage, token
// tujuan dipasang, lalu aplikasi dimuat ulang → SELURUH aplikasi berjalan
// sebagai akun itu (bukan cuma modul TVR Saya seperti X-Sebagai lama).
// "Kembali ke akun saya" mencabut sesi tujuan dan memulihkan token admin.
// ============================================================
import { ambilToken, kendaliMasuk, keluar, simpanToken } from "@/services";

const KUNCI_TOKEN_ASAL = "pri-kendali-token-asal";
const KUNCI_INFO = "pri-kendali-info";

export type InfoKendali = { admin_nama: string; target_id: string; target_nama: string; sejak: string };

function baca(k: string): string {
  try {
    return window.localStorage.getItem(k) ?? "";
  } catch {
    return "";
  }
}
function tulis(k: string, v: string): void {
  try {
    if (v) window.localStorage.setItem(k, v);
    else window.localStorage.removeItem(k);
  } catch {
    // penyimpanan ditolak — kendali tetap jalan sampai halaman ditutup
  }
}

/** Info kendali yang sedang berjalan di perangkat ini (null = tidak ada). */
export function infoKendali(): InfoKendali | null {
  if (typeof window === "undefined") return null;
  const asal = baca(KUNCI_TOKEN_ASAL);
  if (!asal) return null;
  try {
    const i = JSON.parse(baca(KUNCI_INFO) || "{}") as Partial<InfoKendali>;
    return { admin_nama: String(i.admin_nama ?? ""), target_id: String(i.target_id ?? ""), target_nama: String(i.target_nama ?? ""), sejak: String(i.sejak ?? "") };
  } catch {
    return { admin_nama: "", target_id: "", target_nama: "", sejak: "" };
  }
}

/** Masuk sebagai anggota (admin PALUGODAM). Memuat ulang aplikasi bila sukses. */
export async function masukSebagai(target: { id: string; nama: string }, adminNama: string): Promise<void> {
  if (infoKendali()) throw new Error("Anda sedang mengendalikan akun lain. Kembali ke akun sendiri dulu.");
  const tokenAdmin = ambilToken();
  if (!tokenAdmin) throw new Error("Sesi admin tidak ditemukan.");
  const r = await kendaliMasuk(target.id);
  tulis(KUNCI_TOKEN_ASAL, tokenAdmin);
  tulis(KUNCI_INFO, JSON.stringify({ admin_nama: adminNama, target_id: target.id, target_nama: r.user?.nama ?? target.nama, sejak: new Date().toISOString() } satisfies InfoKendali));
  simpanToken(r.token);
  // Mode Simpel adalah penanda perangkat — jangan sampai admin "terlempar" ke /simpel.
  tulis("pri-mode-simpel", "");
  window.location.replace("/");
}

/** Cabut sesi akun tujuan, pulihkan token admin, muat ulang. */
export async function kembaliKeAkunAsal(): Promise<void> {
  const asal = baca(KUNCI_TOKEN_ASAL);
  // keluar() = DELETE /api/sesi dengan token yang sedang aktif (sesi kendali)
  // lalu mengosongkan token; kalau server tidak terjangkau, tetap lanjut.
  try {
    await keluar();
  } catch {
    // abaikan — token kendali toh dibuang
  }
  tulis(KUNCI_TOKEN_ASAL, "");
  tulis(KUNCI_INFO, "");
  if (asal) simpanToken(asal);
  window.location.replace("/");
}

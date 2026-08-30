// Kode OTP EMAIL: pembuatan, pengiriman, verifikasi. Menggantikan OTP
// WhatsApp untuk pendaftaran & lupa/ganti sandi.
//
// Prinsip (sama dengan lib/otp.ts versi WA):
//  - Kode tidak pernah disimpan apa adanya, hanya hash-nya.
//  - Ada batas percobaan; tanpa itu kode 6 digit bisa ditebak habis.
//  - Ada jeda antar-permintaan supaya tombol "kirim ulang" tak dipakai
//    membanjiri email orang lain.
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { supabase } from "@/lib/supabase";
import { kirimEmail } from "@/lib/email";

/** Berapa lama kode berlaku (email sedikit lebih longgar dari WA). */
export const MASA_BERLAKU_MENIT = 10;
/** Berapa kali boleh salah sebelum kode dihanguskan */
export const MAKS_PERCOBAAN = 5;
/** Jeda minimum antar permintaan kode untuk satu email */
export const JEDA_KIRIM_DETIK = 60;

export function normalkanEmail(email: string): string {
  return (email ?? "").trim().toLowerCase();
}

export function emailSah(email: string): boolean {
  const e = normalkanEmail(email);
  // Cukup ketat untuk mencegah alamat jelas-salah, tanpa menolak alamat
  // sah yang tak biasa. Tolak juga domain sintetis internal lama.
  if (e.endsWith("@pri.internal")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

function hashKode(kode: string, email: string): string {
  // Email ikut di-hash sebagai pengikat: hash kode untuk satu email tak
  // bisa dipakai ulang untuk email lain.
  return createHash("sha256").update(`${email}:${kode}`).digest("hex");
}

function isiEmailOtp(kode: string): { subjek: string; html: string; teks: string } {
  const subjek = `Kode verifikasi PRI SuperApp: ${kode}`;
  const teks =
    `Kode verifikasi PRI SuperApp Anda: ${kode}\n\n` +
    `Berlaku ${MASA_BERLAKU_MENIT} menit. Jangan berikan kode ini kepada siapa pun, ` +
    `termasuk yang mengaku pengurus partai.`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#111">
  <div style="max-width:440px;margin:0 auto;padding:28px 20px">
    <div style="background:#fff;border-radius:16px;padding:28px 24px;border:1px solid #eee">
      <div style="font-weight:800;font-size:16px;color:#DC2626;letter-spacing:.3px">PRI SuperApp</div>
      <p style="font-size:14px;color:#444;margin:18px 0 6px">Kode verifikasi Anda:</p>
      <div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#111;background:#f6f6f6;border-radius:12px;padding:14px 0;text-align:center">${kode}</div>
      <p style="font-size:12.5px;color:#666;line-height:1.6;margin:18px 0 0">
        Berlaku <b>${MASA_BERLAKU_MENIT} menit</b>. Jangan berikan kode ini kepada siapa pun,
        termasuk yang mengaku pengurus partai.
      </p>
    </div>
    <p style="font-size:11px;color:#999;text-align:center;margin:16px 0 0">
      Email otomatis — mohon tidak dibalas.
    </p>
  </div></body></html>`;
  return { subjek, html, teks };
}

/**
 * Buat kode baru, simpan hash-nya, lalu kirim lewat email.
 * Melempar Error (status 429) bila terlalu sering meminta, atau melempar
 * bila email gagal terkirim (pemanggil yang memutuskan sikapnya).
 */
export async function kirimOtpEmail(
  emailMentah: string,
  keperluan: "daftar" | "ganti_sandi" = "daftar",
): Promise<void> {
  const email = normalkanEmail(emailMentah);
  const db = supabase();

  // Penjaga jeda: lihat permintaan terakhir untuk email ini.
  const { data: terakhir } = await db
    .from("otp_email")
    .select("dibuat_pada")
    .eq("email", email)
    .order("dibuat_pada", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (terakhir?.dibuat_pada) {
    const selisihDetik = (Date.now() - new Date(terakhir.dibuat_pada).getTime()) / 1000;
    if (selisihDetik < JEDA_KIRIM_DETIK) {
      const sisa = Math.ceil(JEDA_KIRIM_DETIK - selisihDetik);
      throw Object.assign(new Error(`Tunggu ${sisa} detik sebelum meminta kode lagi.`), {
        status: 429,
      });
    }
  }

  const kode = String(randomInt(0, 1_000_000)).padStart(6, "0");

  const { error } = await db.from("otp_email").insert({
    email,
    kode_hash: hashKode(kode, email),
    keperluan,
    kedaluwarsa: new Date(Date.now() + MASA_BERLAKU_MENIT * 60_000).toISOString(),
  });
  if (error) throw new Error("Gagal menyiapkan kode verifikasi.");

  const { subjek, html, teks } = isiEmailOtp(kode);
  await kirimEmail(email, subjek, html, teks);
}

export type HasilVerifikasi =
  | { sah: true }
  | { sah: false; pesan: string; status?: number };

/**
 * Periksa kode yang dimasukkan pengguna. Kode yang benar langsung ditandai
 * terpakai supaya tidak bisa dipakai dua kali.
 */
export async function verifikasiOtpEmail(
  emailMentah: string,
  kode: string,
): Promise<HasilVerifikasi> {
  const email = normalkanEmail(emailMentah);
  const bersih = (kode ?? "").replace(/[^0-9]/g, "");
  if (bersih.length !== 6) {
    return { sah: false, pesan: "Kode harus 6 angka.", status: 400 };
  }

  const db = supabase();
  const { data } = await db
    .from("otp_email")
    .select("id, kode_hash, kedaluwarsa, percobaan, terpakai")
    .eq("email", email)
    .order("dibuat_pada", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return { sah: false, pesan: "Belum ada kode untuk email ini.", status: 400 };
  }
  if (data.terpakai) {
    return { sah: false, pesan: "Kode ini sudah dipakai. Minta kode baru.", status: 400 };
  }
  if (new Date(data.kedaluwarsa).getTime() < Date.now()) {
    return { sah: false, pesan: "Kode sudah kedaluwarsa. Minta kode baru.", status: 400 };
  }
  if (data.percobaan >= MAKS_PERCOBAAN) {
    return { sah: false, pesan: "Terlalu banyak percobaan. Minta kode baru.", status: 429 };
  }

  const diberikan = Buffer.from(hashKode(bersih, email), "hex");
  const tersimpan = Buffer.from(data.kode_hash, "hex");
  const cocok =
    diberikan.length === tersimpan.length && timingSafeEqual(diberikan, tersimpan);

  if (!cocok) {
    await db
      .from("otp_email")
      .update({ percobaan: data.percobaan + 1 })
      .eq("id", data.id);
    const sisa = MAKS_PERCOBAAN - (data.percobaan + 1);
    return {
      sah: false,
      pesan: sisa > 0 ? `Kode salah. Sisa ${sisa} percobaan.` : "Kode salah. Minta kode baru.",
      status: 400,
    };
  }

  await db.from("otp_email").update({ terpakai: true }).eq("id", data.id);
  return { sah: true };
}

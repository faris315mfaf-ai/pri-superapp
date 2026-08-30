// Kode OTP WhatsApp: pembuatan, pengiriman, dan verifikasi.
//
// Prinsip yang dipegang di sini:
//  - Kode tidak pernah disimpan apa adanya, hanya hash-nya.
//  - Ada batas percobaan; tanpa itu kode 6 digit bisa ditebak habis.
//  - Ada jeda antar-permintaan; tanpa itu tombol "kirim ulang" bisa
//    dipakai membanjiri nomor orang lain dengan pesan.
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { supabase } from "@/lib/supabase";
import { conviaOtpAktif, kirimOtpTemplate, normalkanNomorWa } from "@/lib/convia";
import { kirimWa as kirimWaFonnte } from "@/lib/fonnte";

/** Berapa lama kode berlaku */
export const MASA_BERLAKU_MENIT = 5;
/** Berapa kali boleh salah sebelum kode dihanguskan */
export const MAKS_PERCOBAAN = 5;
/** Jeda minimum antar permintaan kode untuk satu nomor */
export const JEDA_KIRIM_DETIK = 60;

function hashKode(kode: string, nomor: string): string {
  // Nomor ikut di-hash sebagai pengikat: hash kode untuk satu nomor
  // tidak bisa dipakai ulang untuk nomor lain.
  return createHash("sha256").update(`${nomor}:${kode}`).digest("hex");
}

/**
 * Buat kode baru, simpan hash-nya, lalu kirim lewat WhatsApp.
 * Melempar Error berbahasa Indonesia bila terlalu sering meminta.
 */
export async function kirimOtp(
  nomorMentah: string,
  keperluan: "daftar" | "masuk" | "ganti_sandi" = "daftar",
): Promise<void> {
  const nomor = normalkanNomorWa(nomorMentah);
  const db = supabase();

  // Penjaga jeda: lihat permintaan terakhir untuk nomor ini.
  const { data: terakhir } = await db
    .from("otp_wa")
    .select("dibuat_pada")
    .eq("nomor_wa", nomor)
    .order("dibuat_pada", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (terakhir?.dibuat_pada) {
    const selisihDetik = (Date.now() - new Date(terakhir.dibuat_pada).getTime()) / 1000;
    if (selisihDetik < JEDA_KIRIM_DETIK) {
      const sisa = Math.ceil(JEDA_KIRIM_DETIK - selisihDetik);
      throw Object.assign(
        new Error(`Tunggu ${sisa} detik sebelum meminta kode lagi.`),
        { status: 429 },
      );
    }
  }

  // randomInt memakai sumber acak kriptografis — Math.random tidak
  // layak untuk sesuatu yang menjaga pintu masuk akun.
  const kode = String(randomInt(0, 1_000_000)).padStart(6, "0");

  const { error } = await db.from("otp_wa").insert({
    nomor_wa: nomor,
    kode_hash: hashKode(kode, nomor),
    keperluan,
    kedaluwarsa: new Date(Date.now() + MASA_BERLAKU_MENIT * 60_000).toISOString(),
  });
  if (error) throw new Error("Gagal menyiapkan kode verifikasi.");

  // OTP lewat TEMPLATE Convia (WABA resmi — satu-satunya cara sah untuk
  // kontak pertama). Bila Convia belum siap / template belum disetujui /
  // gagal, JATUH ke Fonnte supaya OTP tak pernah gagal (fitur 1.22.x/convia;
  // fallback sementara sampai template Convia dipastikan jalan).
  const pesanTeks =
    `*PRI SuperApp*\n\nKode verifikasi Anda: *${kode}*\n\n` +
    `Berlaku ${MASA_BERLAKU_MENIT} menit. Jangan berikan kode ini kepada siapa pun, ` +
    `termasuk yang mengaku pengurus partai.`;

  // Convia dipakai HANYA bila template OTP sudah approved (CONVIA_OTP_AKTIF).
  // Selama template ditolak/belum ada, langsung Fonnte — tanpa panggilan
  // Convia yang pasti gagal.
  if (conviaOtpAktif()) {
    try {
      await kirimOtpTemplate(nomor, kode);
      return;
    } catch (e) {
      console.error("[otp] Convia template gagal → fallback Fonnte:", e);
    }
  }
  await kirimWaFonnte(nomor, pesanTeks);
}

export type HasilVerifikasi =
  | { sah: true }
  | { sah: false; pesan: string; status?: number };

/**
 * Periksa kode yang dimasukkan pengguna.
 * Kode yang benar langsung ditandai terpakai supaya tidak bisa dipakai dua kali.
 */
export async function verifikasiOtp(
  nomorMentah: string,
  kode: string,
): Promise<HasilVerifikasi> {
  const nomor = normalkanNomorWa(nomorMentah);
  const bersih = (kode ?? "").replace(/[^0-9]/g, "");
  if (bersih.length !== 6) {
    return { sah: false, pesan: "Kode harus 6 angka.", status: 400 };
  }

  const db = supabase();
  const { data } = await db
    .from("otp_wa")
    .select("id, kode_hash, kedaluwarsa, percobaan, terpakai")
    .eq("nomor_wa", nomor)
    .order("dibuat_pada", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return { sah: false, pesan: "Belum ada kode untuk nomor ini.", status: 400 };
  }
  if (data.terpakai) {
    return { sah: false, pesan: "Kode ini sudah dipakai. Minta kode baru.", status: 400 };
  }
  if (new Date(data.kedaluwarsa).getTime() < Date.now()) {
    return { sah: false, pesan: "Kode sudah kedaluwarsa. Minta kode baru.", status: 400 };
  }
  if (data.percobaan >= MAKS_PERCOBAAN) {
    return {
      sah: false,
      pesan: "Terlalu banyak percobaan. Minta kode baru.",
      status: 429,
    };
  }

  const diberikan = Buffer.from(hashKode(bersih, nomor), "hex");
  const tersimpan = Buffer.from(data.kode_hash, "hex");
  const cocok =
    diberikan.length === tersimpan.length && timingSafeEqual(diberikan, tersimpan);

  if (!cocok) {
    await db
      .from("otp_wa")
      .update({ percobaan: data.percobaan + 1 })
      .eq("id", data.id);
    const sisa = MAKS_PERCOBAAN - (data.percobaan + 1);
    return {
      sah: false,
      pesan:
        sisa > 0
          ? `Kode salah. Sisa ${sisa} percobaan.`
          : "Kode salah. Minta kode baru.",
      status: 400,
    };
  }

  await db.from("otp_wa").update({ terpakai: true }).eq("id", data.id);
  return { sah: true };
}

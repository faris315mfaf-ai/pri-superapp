// Kode OTP WhatsApp: pembuatan, pengiriman, dan verifikasi.
//
// Prinsip yang dipegang di sini:
//  - Kode tidak pernah disimpan apa adanya, hanya hash-nya.
//  - Ada batas percobaan; tanpa itu kode 6 digit bisa ditebak habis.
//  - Ada jeda antar-permintaan; tanpa itu tombol "kirim ulang" bisa
//    dipakai membanjiri nomor orang lain dengan pesan.
import { gowaSiap, kirimWaGowa } from "@/lib/gowa";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
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
  keperluan: KeperluanOtp = "daftar",
): Promise<void> {
  const nomor = normalkanNomorWa(nomorMentah);
  const db = supabase();
  await pastikanJeda(db, nomor);

  // randomInt memakai sumber acak kriptografis — Math.random tidak
  // layak untuk sesuatu yang menjaga pintu masuk akun.
  const kode = buatKode();

  const { error } = await db.from("otp_wa").insert({
    nomor_wa: nomor,
    kode_hash: hashKode(kode, nomor),
    keperluan,
    kedaluwarsa: new Date(Date.now() + MASA_BERLAKU_MENIT * 60_000).toISOString(),
  });
  if (error) throw new Error("Gagal menyiapkan kode verifikasi.");

  await kirimLewatPenyedia(nomor, kode);
}

export type KeperluanOtp = "daftar" | "masuk" | "ganti_sandi";

function buatKode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Penjaga jeda: lihat permintaan terakhir untuk nomor ini. */
async function pastikanJeda(db: ReturnType<typeof supabase>, nomor: string): Promise<void> {
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
}

async function kirimLewatPenyedia(nomor: string, kode: string): Promise<void> {
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
      console.error("[otp] Convia template gagal → fallback:", e);
    }
  }
  // Gateway sendiri (GOWA, 7 Okt 2026) — gratis; Fonnte tinggal cadangan.
  if (gowaSiap()) {
    try {
      await kirimWaGowa(nomor, `${pesanTeks}\n\nTekan lama pesan berikut → Salin, lalu ketuk "Tempel kode" di aplikasi.`);
      // Pesan kedua berisi kode SAJA → sekali salin langsung bersih (tombol
      // "salin kode" asli WhatsApp hanya ada di template WABA resmi). Kode
      // sudah ada di pesan pertama, jadi kegagalan pesan kedua cukup dicatat.
      await kirimWaGowa(nomor, kode).catch((e) => console.error("[otp] GOWA pesan kode saja gagal:", e));
      return;
    } catch (e) {
      if (!process.env.FONNTE_TOKEN) throw e;
      console.error("[otp] GOWA gagal → fallback Fonnte:", e);
    }
  }
  await kirimWaFonnte(nomor, pesanTeks);
}

// ============================================================
// ARAH MASUK (7 Okt 2026, sql/64). Gateway WhatsApp sendiri ditolak
// WhatsApp bila MEMULAI chat ke nomor asing (error 463 "reach-out
// timelock"). Maka arahnya dibalik: aplikasi memperlihatkan kode + tautan
// wa.me ke nomor gateway, PENGGUNA yang mengirim pesannya, webhook
// (/api/wa/masuk) mencocokkan nomor pengirim + kode. Kode di sini boleh
// terlihat oleh peminta — bukti kepemilikan adalah pesan yang datang DARI
// nomor itu, dan verifikasiOtp menolak baris 'masuk' yang belum
// terkonfirmasi webhook.
// ============================================================

export type OtpMasuk = {
  /** Kode yang dikirim pengguna (sudah tercantum di teks tautan). */
  kode: string;
  /** Token acak untuk polling status (/api/otp/wa-masuk). */
  token: string;
  /** https://wa.me/<nomor gateway>?text=… */
  tautan: string;
  berlaku_detik: number;
};

/** Nomor WhatsApp gateway (penerima pesan verifikasi), mis. 628…; "" bila belum diatur. */
function nomorGateway(): string {
  const n = process.env.GOWA_NOMOR_OTP?.trim();
  return n ? normalkanNomorWa(n) : "";
}

/** Verifikasi arah masuk siap dipakai: gateway + nomornya + rahasia webhook diatur. */
export function otpMasukSiap(): boolean {
  return gowaSiap() && Boolean(nomorGateway()) && Boolean(process.env.GOWA_WEBHOOK_SECRET?.trim());
}

function hashToken(token: string): string {
  return createHash("sha256").update(`otp-masuk:${token}`).digest("hex");
}

function rakitOtpMasuk(kode: string, token: string, keperluan: KeperluanOtp): OtpMasuk {
  const maksud = keperluan === "ganti_sandi" ? "Reset kata sandi" : "Verifikasi WhatsApp";
  const teks = `${maksud} PRI SuperApp. Kode: ${kode}`;
  return {
    kode,
    token,
    tautan: `https://wa.me/${nomorGateway() || "62"}?text=${encodeURIComponent(teks)}`,
    berlaku_detik: MASA_BERLAKU_MENIT * 60,
  };
}

/** Siapkan kode arah masuk untuk nomor ini (tanpa mengirim apa pun). */
export async function siapkanOtpMasuk(nomorMentah: string, keperluan: KeperluanOtp): Promise<OtpMasuk> {
  if (!otpMasukSiap()) {
    throw Object.assign(new Error("Verifikasi lewat WhatsApp belum diatur."), { status: 503 });
  }
  const nomor = normalkanNomorWa(nomorMentah);
  const db = supabase();
  await pastikanJeda(db, nomor);

  const kode = buatKode();
  const token = randomBytes(24).toString("base64url");
  const { error } = await db.from("otp_wa").insert({
    nomor_wa: nomor,
    kode_hash: hashKode(kode, nomor),
    keperluan,
    arah: "masuk",
    token_hash: hashToken(token),
    kedaluwarsa: new Date(Date.now() + MASA_BERLAKU_MENIT * 60_000).toISOString(),
  });
  if (error) throw new Error("Gagal menyiapkan kode verifikasi.");
  return rakitOtpMasuk(kode, token, keperluan);
}

/**
 * Tiruan bentuk-sama untuk jalur yang tak boleh membocorkan keberadaan akun
 * (lupa sandi): tokennya tak pernah ada di database, jadi tak akan pernah
 * terkonfirmasi.
 */
export function otpMasukTiruan(keperluan: KeperluanOtp): OtpMasuk {
  return rakitOtpMasuk(buatKode(), randomBytes(24).toString("base64url"), keperluan);
}

/** Status polling klien. Token tak dikenal = belum terkonfirmasi (netral). */
export async function statusOtpMasuk(token: string): Promise<{ terkonfirmasi: boolean; kedaluwarsa: boolean }> {
  if (!token || token.length > 64) return { terkonfirmasi: false, kedaluwarsa: false };
  const { data } = await supabase()
    .from("otp_wa")
    .select("kedaluwarsa, dikonfirmasi_pada")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!data) return { terkonfirmasi: false, kedaluwarsa: false };
  return {
    terkonfirmasi: Boolean(data.dikonfirmasi_pada),
    kedaluwarsa: !data.dikonfirmasi_pada && new Date(data.kedaluwarsa).getTime() < Date.now(),
  };
}

/**
 * Dipanggil webhook gateway untuk pesan masuk: cocokkan kode di teks
 * dengan kode arah masuk TERBARU milik nomor pengirim.
 */
export async function konfirmasiOtpMasuk(
  nomorPengirim: string,
  teks: string,
): Promise<"cocok" | "salah" | "kedaluwarsa" | "tidak_ada"> {
  const nomor = normalkanNomorWa(nomorPengirim);
  const kode = teks.match(/(?:^|\D)(\d{6})(?!\d)/)?.[1];
  if (!kode) return "tidak_ada";

  const db = supabase();
  const { data } = await db
    .from("otp_wa")
    .select("id, kode_hash, kedaluwarsa, percobaan, terpakai, dikonfirmasi_pada")
    .eq("nomor_wa", nomor)
    .eq("arah", "masuk")
    .order("dibuat_pada", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data || data.terpakai) return "tidak_ada";
  if (data.dikonfirmasi_pada) return "cocok"; // pesan terkirim dua kali
  if (new Date(data.kedaluwarsa).getTime() < Date.now()) return "kedaluwarsa";
  if (data.percobaan >= MAKS_PERCOBAAN) return "salah";

  const diberikan = Buffer.from(hashKode(kode, nomor), "hex");
  const tersimpan = Buffer.from(data.kode_hash, "hex");
  if (diberikan.length !== tersimpan.length || !timingSafeEqual(diberikan, tersimpan)) {
    await db.from("otp_wa").update({ percobaan: data.percobaan + 1 }).eq("id", data.id);
    return "salah";
  }
  await db.from("otp_wa").update({ dikonfirmasi_pada: new Date().toISOString() }).eq("id", data.id);
  return "cocok";
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
  /** Bila diisi, hanya kode untuk keperluan ini yang berlaku (mis. reset sandi). */
  keperluan?: KeperluanOtp,
): Promise<HasilVerifikasi> {
  const nomor = normalkanNomorWa(nomorMentah);
  const bersih = (kode ?? "").replace(/[^0-9]/g, "");
  if (bersih.length !== 6) {
    return { sah: false, pesan: "Kode harus 6 angka.", status: 400 };
  }

  const db = supabase();
  const { data } = await db
    .from("otp_wa")
    .select("id, kode_hash, kedaluwarsa, percobaan, terpakai, arah, dikonfirmasi_pada")
    .eq("nomor_wa", nomor)
    .match(keperluan ? { keperluan } : {})
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
  // Arah masuk: kodenya memang terlihat oleh peminta — sah HANYA setelah
  // webhook menerima pesan dari nomor ini. Tidak menambah percobaan
  // (klien bisa saja memeriksa sebelum pesan sampai).
  if (data.arah === "masuk" && !data.dikonfirmasi_pada) {
    return {
      sah: false,
      pesan: "Pesan WhatsApp dari nomor terdaftar belum kami terima. Kirim pesannya dulu.",
      status: 409,
    };
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

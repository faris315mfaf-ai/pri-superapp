// WEBHOOK GATEWAY WHATSAPP (7 Okt 2026) — pesan MASUK ke nomor OTP.
//
// POST /api/wa/masuk  ← container pri-wa (GOWA), env WHATSAPP_WEBHOOK
//
// Dipakai HANYA untuk verifikasi arah masuk (lib/otp: konfirmasiOtpMasuk):
// pengguna mengirim "… Kode: 123456" dari nomornya ke nomor gateway; bila
// cocok, baris otp_wa ditandai terkonfirmasi dan aplikasi (yang sedang
// polling) lanjut sendiri. Membalas ke chat yang DIMULAI pengguna aman dari
// pembatasan "reach-out" WhatsApp.
//
// Keamanan: tanda tangan HMAC-SHA256 (header X-Hub-Signature-256) dengan
// GOWA_WEBHOOK_SECRET wajib cocok — rute ini juga terjangkau dari internet.
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { kirimWaGowa } from "@/lib/gowa";
import { konfirmasiOtpMasuk } from "@/lib/otp";

export const dynamic = "force-dynamic";

type PesanMasuk = {
  event?: string;
  payload?: {
    chat_id?: string;
    from?: string;
    body?: string;
    is_from_me?: boolean;
  };
};

function tandaTanganSah(mentah: string, header: string | null): boolean {
  const rahasia = process.env.GOWA_WEBHOOK_SECRET?.trim();
  if (!rahasia || !header) return false;
  const harap = Buffer.from(createHmac("sha256", rahasia).update(mentah, "utf8").digest("hex"), "hex");
  const terima = Buffer.from(header.replace(/^sha256=/, ""), "hex");
  return harap.length === terima.length && timingSafeEqual(harap, terima);
}

/** "62812…@s.whatsapp.net" / "62812…:12@s.whatsapp.net" → "62812…"; selain itu "". */
function nomorDariJid(jid: string | undefined): string {
  const m = (jid ?? "").match(/^(\d{8,16})(?::\d+)?@s\.whatsapp\.net$/);
  return m ? m[1] : "";
}

const BALASAN: Record<"cocok" | "salah" | "kedaluwarsa", string> = {
  cocok: "✅ *Terverifikasi.* Silakan kembali ke aplikasi PRI SuperApp — layarnya lanjut otomatis.",
  salah: "Kode tidak cocok. Pastikan pesan dikirim dari nomor WhatsApp yang terdaftar, lalu minta kode baru di aplikasi.",
  kedaluwarsa: "Kode sudah kedaluwarsa. Minta kode baru di aplikasi PRI SuperApp.",
};

export async function POST(request: Request) {
  const mentah = await request.text();
  if (!tandaTanganSah(mentah, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Tanda tangan tidak sah" }, { status: 401 });
  }

  let isi: PesanMasuk;
  try {
    isi = JSON.parse(mentah) as PesanMasuk;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const p = isi.payload;
  // Hanya pesan teks 1-on-1 dari orang lain; grup/status/pesan sendiri diabaikan.
  if (isi.event !== "message" || !p || p.is_from_me || !p.body) return NextResponse.json({ ok: true });
  const nomor = nomorDariJid(p.from);
  if (!nomor || nomorDariJid(p.chat_id) !== nomor) {
    // Gateway gagal memetakan LID → nomor HP: verifikasi tak bisa dicocokkan.
    // Dicatat (tanpa nomor) supaya kasus seperti ini terlihat di log.
    if (/@lid$/.test(p.from ?? "")) console.warn("[wa/masuk] pengirim @lid tanpa nomor HP — verifikasi tidak bisa dicocokkan");
    return NextResponse.json({ ok: true });
  }

  try {
    const hasil = await konfirmasiOtpMasuk(nomor, p.body);
    // Pesan biasa tanpa kode / tanpa permintaan aktif tidak dibalas —
    // nomor ini bukan layanan chat.
    if (hasil !== "tidak_ada") {
      await kirimWaGowa(nomor, BALASAN[hasil]).catch((e) => console.error("[wa/masuk] balas gagal:", e));
    }
  } catch (e) {
    console.error("[wa/masuk] konfirmasi gagal:", e);
  }
  return NextResponse.json({ ok: true });
}

// ============================================================
// GOWA — gateway WhatsApp sendiri (7 Okt 2026): aldinokemal/
// go-whatsapp-web-multidevice, container `pri-wa` di tumpukan "pri"
// (vps/aplikasi/docker-compose.yml). Dipakai HANYA untuk kode OTP
// (gratis, tanpa pihak ketiga). Pesan massal/pengumuman TIDAK lewat sini
// — gateway tidak resmi berisiko nomor diblokir (lihat pengumuman-wa.ts).
//
// Env (server saja):
//   GOWA_URL        — mis. http://wa:3000 (nama layanan di jaringan "pri")
//   GOWA_BASIC_AUTH — "pengguna:sandi" yang sama dengan APP_BASIC_AUTH gateway
//   GOWA_DEVICE_ID  — slot perangkat WhatsApp di gateway (bawaan "otp")
//   GOWA_NOMOR_OTP  — nomor WhatsApp gateway (penerima verifikasi arah masuk)
//   GOWA_WEBHOOK_SECRET — rahasia HMAC webhook pesan masuk (/api/wa/masuk)
// API: POST /send/message {phone: "62…@s.whatsapp.net", message}.
// ============================================================

import { normalkanNomorWa } from "@/lib/fonnte";

export function gowaSiap(): boolean {
  return Boolean(process.env.GOWA_URL?.trim());
}

function headerAuth(): Record<string, string> {
  const auth = process.env.GOWA_BASIC_AUTH?.trim();
  return {
    "X-Device-Id": process.env.GOWA_DEVICE_ID?.trim() || "otp",
    ...(auth ? { Authorization: `Basic ${Buffer.from(auth).toString("base64")}` } : {}),
  };
}

/**
 * Kirim pesan teks lewat gateway. Melempar bila gateway belum diatur,
 * belum login WhatsApp, atau menolak — pemanggil memutuskan cadangannya.
 */
export async function kirimWaGowa(nomor: string, pesan: string): Promise<void> {
  const dasar = process.env.GOWA_URL?.trim().replace(/\/+$/, "");
  if (!dasar) throw new Error("Gateway WhatsApp (GOWA_URL) belum diatur.");

  const res = await fetch(`${dasar}/send/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerAuth() },
    body: JSON.stringify({ phone: `${normalkanNomorWa(nomor)}@s.whatsapp.net`, message: pesan }),
    signal: AbortSignal.timeout(15_000),
  });
  const teks = await res.text().catch(() => "");
  if (!res.ok) {
    console.error("[gowa] HTTP", res.status, teks.slice(0, 300));
    throw new Error("Gagal mengirim pesan WhatsApp. Coba beberapa saat lagi.");
  }
  // Balasan sukses: {"code":"SUCCESS", ...}; selain itu dianggap gagal.
  try {
    const json = JSON.parse(teks) as { code?: string; message?: string };
    if (json.code && json.code !== "SUCCESS") {
      console.error("[gowa] ditolak:", json.code, json.message);
      throw new Error("Nomor WhatsApp tidak dapat dihubungi.");
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Nomor WhatsApp")) throw e;
  }
}

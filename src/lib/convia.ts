// ============================================================
// Convia — WhatsApp API Gateway RESMI (WABA) pengganti Fonnte.
// (fitur 1.22.x/convia). Kunci HANYA di env CONVIA_API_KEY.
//
// Kontrak (terverifikasi langsung ke api.convia.id):
//   POST https://api.convia.id/api/v1/public/messages/send
//   Header: Authorization: Bearer <key>  (BEDA dari Fonnte, pakai "Bearer")
//   Teks    : { channel, message_type:"text",     phone_number, content }
//   Media   : { channel, message_type:"image|document", phone_number, media_url }
//   Template: { channel, message_type:"template",  phone_number, template:{name, language:{code}, components} }
//
// PENTING (WABA resmi): pesan teks bebas HANYA sampai ke nomor yang sudah
// pernah chat (jendela 24 jam). Untuk OTP (kontak pertama) WAJIB pakai
// TEMPLATE resmi yang disetujui Meta. Karena itu kirimOtp memakai template;
// selama template OTP belum ada/disetujui, pemanggilnya (lib/otp) otomatis
// jatuh ke Fonnte supaya OTP tak pernah gagal.
//
// Keandalan: tiap kiriman DIULANG pada kegagalan sementara (timeout/5xx).
// ============================================================

const URL_CONVIA = "https://api.convia.id/api/v1/public/messages/send";
const MAKS_COBA = 3;

/** Nama & bahasa template OTP (diatur di dashboard Convia + approve Meta). */
const OTP_TEMPLATE = process.env.CONVIA_OTP_TEMPLATE?.trim() || "otp_pri";
const OTP_TEMPLATE_LANG = process.env.CONVIA_OTP_TEMPLATE_LANG?.trim() || "id";

export class ConviaBelumDiaturError extends Error {
  constructor() {
    super("Pengiriman WhatsApp belum diatur. Isi CONVIA_API_KEY di pengaturan server.");
    this.name = "ConviaBelumDiaturError";
  }
}

export function conviaSiap(): boolean {
  return Boolean(process.env.CONVIA_API_KEY);
}

/** Rapikan nomor ke format 62… (sama seperti Fonnte). */
export function normalkanNomorWa(nomor: string): string {
  const d = (nomor ?? "").replace(/\D/g, "");
  if (d.startsWith("0")) return "62" + d.slice(1);
  if (d.startsWith("620")) return "62" + d.slice(3);
  if (d.startsWith("62")) return d;
  return "62" + d;
}

export function nomorWaSah(nomor: string): boolean {
  return /^62[0-9]{9,13}$/.test(normalkanNomorWa(nomor));
}

/** Kesalahan permanen (4xx) — mengulang tak akan menolong. */
class GalatPermanen extends Error {}

async function kirimKeConvia(badan: Record<string, unknown>, timeoutMs: number): Promise<void> {
  const kunci = process.env.CONVIA_API_KEY;
  if (!kunci) throw new ConviaBelumDiaturError();

  let galatTerakhir: Error | null = null;
  for (let coba = 1; coba <= MAKS_COBA; coba++) {
    try {
      const res = await fetch(URL_CONVIA, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${kunci}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(badan),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return; // 2xx = diterima Convia

      const teks = await res.text().catch(() => "");
      let pesan = `WhatsApp ditolak (${res.status}).`;
      try {
        const j = JSON.parse(teks) as { error?: { message?: string }; message?: string };
        pesan = j.error?.message || j.message || pesan;
      } catch {
        // biarkan pesan bawaan
      }
      // 4xx = permintaan/template salah → jangan diulang, lempar apa adanya.
      if (res.status >= 400 && res.status < 500) {
        throw new GalatPermanen(pesan);
      }
      // 5xx → sementara, ulangi.
      galatTerakhir = new Error(pesan);
    } catch (e) {
      if (e instanceof GalatPermanen || e instanceof ConviaBelumDiaturError) throw e;
      galatTerakhir = e instanceof Error ? e : new Error("gagal kirim");
    }
    if (coba < MAKS_COBA) await new Promise((r) => setTimeout(r, 700 * coba));
  }
  throw new Error(
    `Gagal mengirim WhatsApp setelah ${MAKS_COBA} percobaan: ${galatTerakhir?.message ?? ""}`.trim(),
  );
}

/**
 * Kirim teks bebas. Ingat: di WABA resmi ini hanya sampai bila nomor sudah
 * pernah chat (jendela 24 jam). Untuk kontak pertama pakai kirimOtpTemplate.
 */
export async function kirimWa(nomor: string, pesan: string): Promise<void> {
  await kirimKeConvia(
    {
      channel: "whatsapp",
      message_type: "text",
      phone_number: normalkanNomorWa(nomor),
      content: pesan,
    },
    15_000,
  );
}

/** Kirim lampiran (dokumen/PDF) via URL publik. */
export async function kirimWaDenganLampiran(
  nomor: string,
  pesan: string,
  urlBerkas: string,
  _namaBerkas: string,
): Promise<void> {
  await kirimKeConvia(
    {
      channel: "whatsapp",
      message_type: "document",
      phone_number: normalkanNomorWa(nomor),
      media_url: urlBerkas,
      content: pesan,
    },
    20_000,
  );
}

/**
 * Kirim OTP lewat TEMPLATE resmi (satu-satunya cara sah untuk kontak
 * pertama di WABA). Kode dipasang sebagai parameter body {{1}} dan
 * parameter tombol salin-kode (format template Authentication Meta).
 * Melempar bila gagal — pemanggil (lib/otp) yang memutuskan fallback.
 */
export async function kirimOtpTemplate(nomor: string, kode: string): Promise<void> {
  await kirimKeConvia(
    {
      channel: "whatsapp",
      message_type: "template",
      phone_number: normalkanNomorWa(nomor),
      template: {
        name: OTP_TEMPLATE,
        language: { code: OTP_TEMPLATE_LANG },
        components: [
          { type: "body", parameters: [{ type: "text", text: kode }] },
          {
            type: "button",
            sub_type: "url",
            index: 0,
            parameters: [{ type: "text", text: kode }],
          },
        ],
      },
    },
    15_000,
  );
}

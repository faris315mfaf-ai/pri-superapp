// ============================================================
// Pengirim email (KHUSUS SISI SERVER) — lewat SMTP (Gmail/Workspace).
//
// Dipakai untuk OTP email (pendaftaran, lupa/ganti sandi) menggantikan
// OTP WhatsApp. Kredensial HANYA di env:
//   SMTP_USER  = alamat Gmail/Workspace pengirim
//   SMTP_PASS  = "app password" 16 huruf (BUKAN sandi akun biasa)
//   SMTP_HOST  = smtp.gmail.com (bawaan)
//   SMTP_PORT  = 465 (SSL, bawaan) atau 587 (STARTTLS)
//   SMTP_FROM_NAMA = nama tampilan pengirim (bawaan "PRI SuperApp")
//
// Gmail MEMAKSA From = akun SMTP, jadi alamat pengirim selalu SMTP_USER;
// hanya nama tampilannya yang bisa diatur.
//
// Keandalan: tiap kiriman DIULANG pada kegagalan sementara (koneksi).
// ============================================================
import nodemailer, { type Transporter } from "nodemailer";

const MAKS_COBA = 3;

export class EmailBelumDiaturError extends Error {
  constructor() {
    super("Pengiriman email belum diatur. Isi SMTP_USER & SMTP_PASS di pengaturan server.");
    this.name = "EmailBelumDiaturError";
  }
}

export function emailSiap(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter: Transporter | null = null;
function ambilTransporter(): Transporter {
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT) || 465;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465, // 465 = SSL langsung; 587 = STARTTLS
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  });
  return transporter;
}

function pengirim(): string {
  const nama = process.env.SMTP_FROM_NAMA || "PRI SuperApp";
  return `${nama} <${process.env.SMTP_USER}>`;
}

/**
 * Kirim satu email. Melempar EmailBelumDiaturError bila SMTP belum diisi,
 * atau Error biasa bila gagal setelah beberapa percobaan.
 */
export async function kirimEmail(
  ke: string,
  subjek: string,
  html: string,
  teks: string,
): Promise<void> {
  if (!emailSiap()) throw new EmailBelumDiaturError();
  let galatTerakhir: unknown;
  for (let coba = 1; coba <= MAKS_COBA; coba++) {
    try {
      await ambilTransporter().sendMail({
        from: pengirim(),
        to: ke,
        subject: subjek,
        text: teks,
        html,
      });
      return;
    } catch (e) {
      galatTerakhir = e;
      if (coba < MAKS_COBA) await new Promise((r) => setTimeout(r, 700 * coba));
    }
  }
  throw galatTerakhir instanceof Error
    ? galatTerakhir
    : new Error("Gagal mengirim email.");
}

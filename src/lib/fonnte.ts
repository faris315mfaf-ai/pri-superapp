// Pengirim pesan WhatsApp lewat Fonnte.
//
// Dipakai untuk kode OTP pendaftaran. Token disimpan di FONNTE_TOKEN
// (server saja, tidak pernah sampai ke peramban).
//
// Catatan format: Fonnte memakai header `Authorization: <TOKEN>`
// TANPA kata "Bearer" — ini berbeda dari kebanyakan API dan pernah
// jadi sumber kesalahan di proyek ini, jadi jangan "dirapikan".

const URL_FONNTE = "https://api.fonnte.com/send";

export class FonnteBelumDiaturError extends Error {
  constructor() {
    super(
      "Pengiriman WhatsApp belum diatur. Isi FONNTE_TOKEN di pengaturan server.",
    );
    this.name = "FonnteBelumDiaturError";
  }
}

/**
 * Normalkan nomor ke format internasional tanpa tanda baca: 62xxxxxxxxx.
 *
 * Pengguna Indonesia menulis nomornya bermacam-macam (0812…, +62812…,
 * 0812-3456-7890). Semua disamakan di satu tempat supaya nomor yang
 * sama tidak tersimpan sebagai dua akun berbeda.
 */
export function normalkanNomorWa(nomor: string): string {
  let n = (nomor ?? "").replace(/[^0-9]/g, "");
  if (n.startsWith("0")) n = "62" + n.slice(1);
  else if (n.startsWith("620")) n = "62" + n.slice(3);
  else if (!n.startsWith("62")) n = "62" + n;
  return n;
}

/** Nomor WA Indonesia yang masuk akal: 62 + 9–13 digit */
export function nomorWaSah(nomor: string): boolean {
  const n = normalkanNomorWa(nomor);
  return /^62[0-9]{9,13}$/.test(n);
}

/**
 * Kirim pesan WhatsApp. Melempar bila token belum diatur atau Fonnte
 * menolak — pemanggil yang memutuskan cara memberi tahu pengguna.
 */
export async function kirimWa(nomor: string, pesan: string): Promise<void> {
  const token = process.env.FONNTE_TOKEN;
  if (!token) throw new FonnteBelumDiaturError();

  const body = new URLSearchParams({
    target: normalkanNomorWa(nomor),
    message: pesan,
    countryCode: "62",
  });

  const res = await fetch(URL_FONNTE, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });

  const teks = await res.text().catch(() => "");
  if (!res.ok) {
    console.error("[fonnte] HTTP", res.status, teks.slice(0, 300));
    throw new Error("Gagal mengirim pesan WhatsApp. Coba beberapa saat lagi.");
  }

  // Fonnte membalas 200 meski gagal — status sebenarnya ada di badan
  // respons. Tanpa memeriksa ini, OTP yang tidak pernah terkirim akan
  // terlihat seolah berhasil.
  try {
    const json = JSON.parse(teks) as { status?: boolean; reason?: string };
    if (json.status === false) {
      console.error("[fonnte] ditolak:", json.reason);
      throw new Error(
        json.reason
          ? `WhatsApp menolak: ${json.reason}`
          : "Nomor WhatsApp tidak dapat dihubungi.",
      );
    }
  } catch (e) {
    // Bukan JSON — anggap berhasil selama HTTP-nya 200.
    if (e instanceof Error && e.message.startsWith("WhatsApp menolak")) throw e;
  }
}

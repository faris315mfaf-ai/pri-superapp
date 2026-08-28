// ============================================================
// PRI SuperApp — Klien Verifikasi Wajah (KHUSUS SISI SERVER)
//
// Fitur 1.22/3: absen & login berbasis wajah, "tanpa celah pembobol".
//
// Aplikasi ini TIDAK melakukan pencocokan wajah sendiri dan TIDAK
// menyimpan biometrik mentah. Semua pencocokan + LIVENESS (anti-foto)
// dikerjakan sebuah "face service" cloud yang alamat & kuncinya diisi
// di env:
//   WAJAH_ENDPOINT  → URL service (POST menerima JSON)
//   WAJAH_API_KEY   → dikirim sebagai Bearer
//   WAJAH_PROVIDER  → label penyedia (mis. "aws", "azure") — informatif
//
// Kontrak service (disepakati aplikasi):
//   Request : { aksi: "daftar"|"verifikasi", user_id, image }  (image = dataURL/base64)
//   Daftar  → { face_id: string }
//   Verif   → { cocok: boolean, skor?: number, live: boolean }
//
// PENTING soal keamanan: verifikasi hanya dianggap LOLOS bila
// cocok===true DAN live===true. Kalau service tak bisa membuktikan
// keaslian (live), verifikasi GAGAL — jadi foto/rekaman tidak bisa
// menembus. Tanpa env, seluruh fitur mati (bukan "selalu lolos").
// ============================================================

export class WajahBelumDiaturError extends Error {}

export function wajahSiap(): boolean {
  return Boolean(process.env.WAJAH_ENDPOINT && process.env.WAJAH_API_KEY);
}

export function penyediaWajah(): string {
  return process.env.WAJAH_PROVIDER || "";
}

function endpoint(): string {
  const u = process.env.WAJAH_ENDPOINT;
  if (!u) {
    throw new WajahBelumDiaturError(
      "Verifikasi wajah belum tersambung. Isi WAJAH_ENDPOINT & WAJAH_API_KEY di pengaturan lingkungan.",
    );
  }
  return u;
}

async function panggil<T>(badan: Record<string, unknown>, timeoutMs = 30000): Promise<T> {
  const kendali = new AbortController();
  const timer = setTimeout(() => kendali.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WAJAH_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(badan),
      signal: kendali.signal,
      cache: "no-store",
    });
    const teks = await res.text();
    let json: unknown = null;
    try {
      json = teks ? JSON.parse(teks) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const pesan =
        (json as { message?: string; pesan?: string })?.pesan ??
        (json as { message?: string })?.message ??
        `Layanan wajah menolak permintaan (${res.status})`;
      throw Object.assign(new Error(pesan), { status: res.status });
    }
    return json as T;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Layanan wajah tidak menjawab tepat waktu. Coba lagi.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Daftarkan wajah pengguna ke penyedia; kembalikan face_id yang
 * disimpan aplikasi (bukan biometriknya).
 */
export async function daftarWajahPenyedia(
  userId: number | string,
  image: string,
): Promise<{ faceId: string; provider: string }> {
  const d = await panggil<{ face_id?: string; faceId?: string }>({
    aksi: "daftar",
    user_id: String(userId),
    image,
  });
  const faceId = String(d.face_id ?? d.faceId ?? "");
  if (!faceId) throw new Error("Penyedia tidak mengembalikan face_id.");
  return { faceId, provider: penyediaWajah() };
}

/**
 * Verifikasi wajah pengguna. LOLOS hanya bila cocok DAN live (anti-foto).
 * Skor dikembalikan untuk pencatatan/telemetri.
 */
export async function verifikasiWajahPenyedia(
  userId: number | string,
  image: string,
  faceId: string,
): Promise<{ lolos: boolean; cocok: boolean; live: boolean; skor: number }> {
  const d = await panggil<{ cocok?: boolean; live?: boolean; skor?: number }>({
    aksi: "verifikasi",
    user_id: String(userId),
    face_id: faceId,
    image,
  });
  const cocok = d.cocok === true;
  const live = d.live === true;
  return { lolos: cocok && live, cocok, live, skor: Number(d.skor ?? 0) };
}

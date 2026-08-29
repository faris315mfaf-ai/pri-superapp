// ============================================================
// PRI SuperApp — Verifikasi Wajah (KHUSUS SISI SERVER)
//
// Fitur 1.22/3: absen & login berbasis wajah, "tanpa celah pembobol".
//
// Dua jalur penyedia:
//  (A) LUXAND (bawaan produksi) — env: WAJAH_PROVIDER=luxand, LUXAND_TOKEN.
//      Aplikasi memanggil api.luxand.cloud langsung. Enroll & cocokkan
//      wajah + LIVENESS (anti-foto) v2. Kontrak diverifikasi empiris,
//      bukan ditebak.
//  (B) ENDPOINT GENERIK — env: WAJAH_ENDPOINT + WAJAH_API_KEY. Untuk
//      penyedia lain lewat perantara (mis. n8n). Dipertahankan sebagai
//      cadangan/fleksibilitas.
//
// Prinsip keamanan: verifikasi LOLOS hanya bila wajah COCOK dengan yang
// terdaftar DAN LIVE (asli, bukan foto/rekaman). Tanpa penyedia = fitur
// mati total (bukan "selalu lolos"). Aplikasi menyimpan HANYA referensi
// (uuid subjek Luxand) — tidak ada biometrik mentah di database kita.
// ============================================================

export class WajahBelumDiaturError extends Error {}

const LUX_BASE = "https://api.luxand.cloud";

/** Ambang kemiripan minimal agar dianggap "cocok" (0..1). */
function ambangCocok(): number {
  const n = Number(process.env.WAJAH_AMBANG);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.7;
}

function pakaiLuxand(): boolean {
  return (
    (process.env.WAJAH_PROVIDER || "").toLowerCase() === "luxand" &&
    Boolean(process.env.LUXAND_TOKEN)
  );
}

function pakaiGenerik(): boolean {
  return Boolean(process.env.WAJAH_ENDPOINT && process.env.WAJAH_API_KEY);
}

export function wajahSiap(): boolean {
  return pakaiLuxand() || pakaiGenerik();
}

export function penyediaWajah(): string {
  if (pakaiLuxand()) return "luxand";
  return process.env.WAJAH_PROVIDER || (pakaiGenerik() ? "generik" : "");
}

/** Nama subjek deterministik per pengguna — dipakai mencocokkan hasil search. */
function namaSubjek(userId: number | string): string {
  return `pri_${userId}`;
}

// ------------------------------------------------------------
// Util: dataURL → multipart (Node global FormData/Blob/fetch)
// ------------------------------------------------------------

function dataUrlKeBlob(dataUrl: string): Blob {
  const koma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || koma < 0) {
    throw Object.assign(new Error("Foto wajah tidak sah."), { status: 400 });
  }
  const meta = dataUrl.slice(5, koma); // "image/jpeg;base64"
  const tipe = meta.split(";")[0] || "image/jpeg";
  const buf = Buffer.from(dataUrl.slice(koma + 1), "base64");
  return new Blob([buf], { type: tipe });
}

// ------------------------------------------------------------
// LUXAND
// ------------------------------------------------------------

async function luxPost<T>(path: string, foto: Blob, extra?: Record<string, string>): Promise<T> {
  const fd = new FormData();
  fd.append("photo", foto, "wajah.jpg");
  for (const [k, v] of Object.entries(extra ?? {})) fd.append(k, v);
  const kendali = new AbortController();
  const timer = setTimeout(() => kendali.abort(), 30000);
  try {
    const res = await fetch(`${LUX_BASE}${path}`, {
      method: "POST",
      headers: { token: String(process.env.LUXAND_TOKEN) },
      body: fd,
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
      throw new Error(`Layanan wajah menolak permintaan (${res.status}).`);
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

/** Liveness v2 Luxand: {result:"real"|"fake", score} atau failure (kualitas). */
async function luxLiveness(foto: Blob): Promise<{ live: boolean; skor: number; alasan?: string }> {
  const d = await luxPost<{ status?: string; result?: string; score?: number; message?: string }>(
    "/photo/liveness/v2",
    foto,
  );
  if (d.status !== "success") {
    // Kualitas foto kurang (mis. wajah terlalu kecil/jauh). Gagal-TERTUTUP:
    // keaslian tak terbukti → anggap tidak live, sertakan alasan agar UI
    // bisa meminta ambil ulang.
    return { live: false, skor: 0, alasan: bersihkanPesan(d.message) };
  }
  return { live: d.result === "real", skor: Number(d.score ?? 0) };
}

function bersihkanPesan(m?: string): string {
  const t = String(m ?? "").replace(/^Error checking liveness:\s*/i, "").trim();
  if (/interpupillary|too small|too far|no face/i.test(t)) {
    return "Wajah kurang jelas/terlalu jauh. Dekatkan wajah, cahaya cukup, lalu coba lagi.";
  }
  return t || "Keaslian wajah tak terbukti. Ambil ulang langsung dari kamera.";
}

async function luxDaftar(userId: number | string, foto: Blob): Promise<string> {
  const d = await luxPost<{
    status?: string;
    uuid?: string;
    face_uuid?: string;
    message?: string;
  }>("/subject/v2", foto, { name: namaSubjek(userId), store: "1" });
  if (d.status !== "success" || !d.uuid) {
    throw new Error(bersihkanPesan(d.message) || "Gagal mendaftarkan wajah.");
  }
  // Tanpa face_uuid = tak ada wajah terdeteksi di foto → buang subjek kosong.
  if (!d.face_uuid) {
    await luxHapus(d.uuid).catch(() => {});
    throw Object.assign(
      new Error("Wajah tidak terdeteksi di foto. Pastikan wajah terlihat jelas."),
      { status: 400 },
    );
  }
  return d.uuid;
}

async function luxCocok(userId: number | string, foto: Blob): Promise<{ cocok: boolean; skor: number }> {
  const hasil = await luxPost<
    { id?: number; name?: string; probability?: number }[] | { status?: string }
  >("/photo/search", foto);
  const daftar = Array.isArray(hasil) ? hasil : [];
  const target = namaSubjek(userId);
  const ambang = ambangCocok();
  let terbaik = 0;
  for (const h of daftar) {
    if (h.name === target) terbaik = Math.max(terbaik, Number(h.probability ?? 0));
  }
  return { cocok: terbaik >= ambang, skor: terbaik };
}

async function luxHapus(uuid: string): Promise<void> {
  const kendali = new AbortController();
  const timer = setTimeout(() => kendali.abort(), 20000);
  try {
    await fetch(`${LUX_BASE}/subject/${encodeURIComponent(uuid)}`, {
      method: "DELETE",
      headers: { token: String(process.env.LUXAND_TOKEN) },
      signal: kendali.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------
// ENDPOINT GENERIK (cadangan)
// ------------------------------------------------------------

async function generikPanggil<T>(badan: Record<string, unknown>): Promise<T> {
  const kendali = new AbortController();
  const timer = setTimeout(() => kendali.abort(), 30000);
  try {
    const res = await fetch(String(process.env.WAJAH_ENDPOINT), {
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
    const json = teks ? JSON.parse(teks) : null;
    if (!res.ok) {
      throw new Error(
        (json as { pesan?: string; message?: string })?.pesan ??
          (json as { message?: string })?.message ??
          `Layanan wajah menolak permintaan (${res.status}).`,
      );
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

// ------------------------------------------------------------
// API publik lib (dipakai endpoint /api/wajah/* & gerbang absen)
// ------------------------------------------------------------

function pastikanSiap() {
  if (!wajahSiap()) {
    throw new WajahBelumDiaturError(
      "Verifikasi wajah belum tersambung. Atur LUXAND_TOKEN (atau WAJAH_ENDPOINT+WAJAH_API_KEY).",
    );
  }
}

/**
 * Daftarkan/enroll wajah pengguna; kembalikan referensi (face_id) yang
 * disimpan aplikasi. Foto WAJIB lolos liveness (tak bisa mendaftar pakai
 * foto orang lain).
 */
export async function daftarWajahPenyedia(
  userId: number | string,
  image: string,
): Promise<{ faceId: string; provider: string }> {
  pastikanSiap();
  if (pakaiLuxand()) {
    const foto = dataUrlKeBlob(image);
    const live = await luxLiveness(foto);
    if (!live.live) {
      throw Object.assign(
        new Error(live.alasan ?? "Keaslian wajah tak terbukti. Ambil ulang langsung dari kamera."),
        { status: 400 },
      );
    }
    const uuid = await luxDaftar(userId, foto);
    return { faceId: uuid, provider: "luxand" };
  }
  // Generik
  const d = await generikPanggil<{ face_id?: string; faceId?: string }>({
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
 */
export async function verifikasiWajahPenyedia(
  userId: number | string,
  image: string,
  faceId: string,
): Promise<{ lolos: boolean; cocok: boolean; live: boolean; skor: number }> {
  pastikanSiap();
  if (pakaiLuxand()) {
    const foto = dataUrlKeBlob(image);
    // Liveness dulu (murah untuk gagalkan foto), lalu cocokkan identitas.
    const live = await luxLiveness(foto);
    if (!live.live) return { lolos: false, cocok: false, live: false, skor: live.skor };
    const m = await luxCocok(userId, foto);
    return { lolos: m.cocok, cocok: m.cocok, live: true, skor: m.skor };
  }
  // Generik
  const d = await generikPanggil<{ cocok?: boolean; live?: boolean; skor?: number }>({
    aksi: "verifikasi",
    user_id: String(userId),
    face_id: faceId,
    image,
  });
  const cocok = d.cocok === true;
  const live = d.live === true;
  return { lolos: cocok && live, cocok, live, skor: Number(d.skor ?? 0) };
}

/** Hapus referensi wajah di penyedia (dipanggil saat pengguna hapus/daftar ulang). */
export async function hapusWajahPenyedia(faceId: string): Promise<void> {
  if (!faceId) return;
  if (pakaiLuxand()) {
    await luxHapus(faceId).catch(() => {});
    return;
  }
  // Generik: penghapusan opsional — abaikan bila tak didukung.
}

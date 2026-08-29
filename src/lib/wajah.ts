// ============================================================
// PRI SuperApp — Verifikasi Wajah (KHUSUS SISI SERVER)
//
// Fitur 1.22/3 (revisi 1.22.1): absen & login berbasis wajah.
//
// Penyedia: LUXAND (env WAJAH_PROVIDER=luxand + LUXAND_TOKEN) — aplikasi
// memanggil api.luxand.cloud langsung. Cadangan: endpoint generik
// (WAJAH_ENDPOINT + WAJAH_API_KEY).
//
// Perubahan revisi ini (dari umpan balik uji nyata):
//  - PENDAFTARAN pakai BANYAK foto (mis. 5 sudut) → subjek lebih mudah
//    dikenali. TIDAK ada gerbang liveness saat mendaftar (dulu menolak
//    wajah asli); cukup wajah terdeteksi.
//  - LOGIN tanpa username: identifikasi 1:N — pindai wajah, sistem cari
//    siapa pemiliknya (nama subjek deterministik pri_<userId>).
//  - LIVENESS (anti-foto) untuk absen/login BISA DISETEL via env
//    WAJAH_LIVENESS = "off" | "v1" | "v2" (bawaan "v2"). Dipisah dari
//    pendaftaran supaya bisa dilonggarkan tanpa merusak apa pun.
//
// Aplikasi menyimpan HANYA uuid subjek — tak ada biometrik mentah di DB.
// ============================================================

export class WajahBelumDiaturError extends Error {}
/** Layanan wajah menolak karena kuota habis / langganan belum aktif / kunci salah. */
export class WajahLayananError extends Error {}

const LUX_BASE = "https://api.luxand.cloud";

/** Ambang kemiripan untuk absen 1:1 (identitas sudah pasti dari sesi). */
function ambangCocok(): number {
  const n = Number(process.env.WAJAH_AMBANG);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.75;
}
/**
 * Ambang untuk LOGIN 1:N — jauh lebih ketat: di sini sistem MENERBITKAN
 * sesi baru untuk siapa pun yang cocok, jadi false-accept = orang lain
 * masuk sebagai Anda. Bawaan 0.85.
 */
function ambangLogin(): number {
  const n = Number(process.env.WAJAH_AMBANG_LOGIN);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.85;
}
/** Selisih minimal kandidat teratas vs kedua agar tak ambigu (anti mirip). */
function marginAman(): number {
  const n = Number(process.env.WAJAH_MARGIN);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.1;
}

/** Mode anti-foto untuk verifikasi (BUKAN pendaftaran). */
function modeLiveness(): "off" | "v1" | "v2" {
  const m = (process.env.WAJAH_LIVENESS || "v2").toLowerCase();
  return m === "off" || m === "v1" ? m : "v2";
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

/** Nama subjek deterministik per pengguna — kunci pencocokan & identifikasi. */
function namaSubjek(userId: number | string): string {
  return `pri_${userId}`;
}
/** Balik nama subjek → userId (untuk login 1:N). */
function userIdDariNama(nama: string): string | null {
  const m = /^pri_(.+)$/.exec(nama || "");
  return m ? m[1] : null;
}

// ------------------------------------------------------------
// Util: dataURL → Blob (Node global FormData/Blob/fetch)
// ------------------------------------------------------------

function dataUrlKeBlob(dataUrl: string): Blob {
  const koma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || koma < 0) {
    throw Object.assign(new Error("Foto wajah tidak sah."), { status: 400 });
  }
  const meta = dataUrl.slice(5, koma);
  const tipe = meta.split(";")[0] || "image/jpeg";
  const buf = Buffer.from(dataUrl.slice(koma + 1), "base64");
  return new Blob([buf], { type: tipe });
}

// ------------------------------------------------------------
// LUXAND
// ------------------------------------------------------------

async function luxKirim<T>(
  path: string,
  metode: "POST" | "DELETE",
  foto?: Blob,
  extra?: Record<string, string>,
): Promise<{ ok: boolean; status: number; json: T }> {
  const kendali = new AbortController();
  const timer = setTimeout(() => kendali.abort(), 30000);
  try {
    let body: FormData | undefined;
    if (foto) {
      body = new FormData();
      body.append("photo", foto, "wajah.jpg");
      for (const [k, v] of Object.entries(extra ?? {})) body.append(k, v);
    }
    const res = await fetch(`${LUX_BASE}${path}`, {
      method: metode,
      headers: { token: String(process.env.LUXAND_TOKEN) },
      body,
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
    // Deteksi masalah AKUN Luxand (bukan wajah): kuota bulanan habis,
    // langganan belum aktif, atau kunci salah → beri pesan jujur, jangan
    // sampai salah tampil "wajah tidak terdeteksi".
    const pesan = String((json as { message?: string })?.message ?? "");
    if (
      res.status === 401 ||
      res.status === 402 ||
      /upgrade your plan|requests number|per month reached|invalid token|token/i.test(pesan)
    ) {
      throw new WajahLayananError(
        "Layanan wajah sedang tidak tersedia (kuota/langganan belum aktif). Hubungi pengurus.",
      );
    }
    return { ok: res.ok, status: res.status, json: json as T };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Layanan wajah tidak menjawab tepat waktu. Coba lagi.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function bersihkanPesan(m?: string): string {
  const t = String(m ?? "").replace(/^Error checking liveness:\s*/i, "").trim();
  if (/interpupillary|too small|too far|no face/i.test(t)) {
    return "Wajah kurang jelas/terlalu jauh. Dekatkan wajah, cahaya cukup, lalu coba lagi.";
  }
  return t || "Keaslian wajah tak terbukti. Ambil ulang langsung dari kamera.";
}

/** Cek anti-foto sesuai mode env. "off" = lewati (selalu live). */
async function cekLiveness(foto: Blob): Promise<{ live: boolean; skor: number; alasan?: string }> {
  const mode = modeLiveness();
  if (mode === "off") return { live: true, skor: 1 };
  const path = mode === "v1" ? "/photo/liveness" : "/photo/liveness/v2";
  const { json } = await luxKirim<{ status?: string; result?: string; score?: number; message?: string }>(
    path,
    "POST",
    foto,
  );
  if (json?.status !== "success") {
    // Kualitas kurang → keaslian tak terbukti (gagal-tertutup), sertakan alasan.
    return { live: false, skor: 0, alasan: bersihkanPesan(json?.message) };
  }
  return { live: json.result === "real", skor: Number(json.score ?? 0) };
}

/** Buat subjek dengan foto pertama yang wajahnya terdeteksi. */
async function luxBuatSubjek(userId: number | string, foto: Blob): Promise<string | null> {
  const { json } = await luxKirim<{ status?: string; uuid?: string; face_uuid?: string }>(
    "/subject/v2",
    "POST",
    foto,
    { name: namaSubjek(userId), store: "1" },
  );
  // Sukses + face_uuid = wajah benar-benar terdeteksi & tersimpan.
  if (json?.status === "success" && json.uuid && json.face_uuid) return json.uuid;
  return null;
}

/** Tambah satu foto wajah ke subjek yang sudah ada; true bila wajah terdeteksi. */
async function luxTambahFoto(uuid: string, foto: Blob): Promise<boolean> {
  const { json } = await luxKirim<{ status?: string }>(`/subject/${encodeURIComponent(uuid)}`, "POST", foto);
  return json?.status === "success";
}

/**
 * Cari subjek paling cocok. Kembalikan skor TERBAIK & KEDUA agar pemanggil
 * bisa menolak kecocokan yang ambigu (dua orang mirip).
 */
async function luxSearch(
  foto: Blob,
): Promise<{ nama: string; skor: number; skorKedua: number } | null> {
  const { json } = await luxKirim<{ id?: number; name?: string; probability?: number }[]>(
    "/photo/search",
    "POST",
    foto,
  );
  const daftar = (Array.isArray(json) ? json : [])
    .map((h) => ({ nama: String(h.name ?? ""), skor: Number(h.probability ?? 0) }))
    .sort((a, b) => b.skor - a.skor);
  if (daftar.length === 0) return null;
  return { nama: daftar[0].nama, skor: daftar[0].skor, skorKedua: daftar[1]?.skor ?? 0 };
}

async function luxHapus(uuid: string): Promise<void> {
  await luxKirim(`/subject/${encodeURIComponent(uuid)}`, "DELETE").catch(() => {});
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
// API publik lib
// ------------------------------------------------------------

function pastikanSiap() {
  if (!wajahSiap()) {
    throw new WajahBelumDiaturError(
      "Verifikasi wajah belum tersambung. Atur LUXAND_TOKEN (atau WAJAH_ENDPOINT+WAJAH_API_KEY).",
    );
  }
}

/**
 * Daftarkan/enroll wajah pengguna dari BEBERAPA foto. Tanpa gerbang
 * liveness (pendaftaran cukup wajah terdeteksi). Kembalikan face_id
 * (uuid subjek). Melempar bila tak satu pun foto memuat wajah.
 */
export async function daftarWajahPenyedia(
  userId: number | string,
  images: string[],
): Promise<{ faceId: string; provider: string }> {
  pastikanSiap();
  const fotos = images.filter((s) => typeof s === "string" && s.startsWith("data:image/"));
  if (fotos.length === 0) throw Object.assign(new Error("Tidak ada foto yang sah."), { status: 400 });

  if (pakaiLuxand()) {
    let uuid: string | null = null;
    let terpasang = 0;
    for (const img of fotos) {
      const blob = dataUrlKeBlob(img);
      if (!uuid) {
        uuid = await luxBuatSubjek(userId, blob);
        if (uuid) terpasang = 1;
      } else {
        if (await luxTambahFoto(uuid, blob)) terpasang += 1;
      }
    }
    if (!uuid) {
      throw Object.assign(
        new Error("Wajah tidak terdeteksi di foto mana pun. Pastikan wajah terlihat jelas & terang."),
        { status: 400 },
      );
    }
    if (terpasang < 2) {
      // Hanya 1 sudut terpasang — tetap boleh, tapi kabari agar lebih akurat.
      // (tidak melempar; cukup jadi catatan di log endpoint).
    }
    return { faceId: uuid, provider: "luxand" };
  }

  // Generik: kirim foto pertama.
  const d = await generikPanggil<{ face_id?: string; faceId?: string }>({
    aksi: "daftar",
    user_id: String(userId),
    image: fotos[0],
  });
  const faceId = String(d.face_id ?? d.faceId ?? "");
  if (!faceId) throw new Error("Penyedia tidak mengembalikan face_id.");
  return { faceId, provider: penyediaWajah() };
}

/**
 * Verifikasi 1:1 (untuk gerbang absen): wajah pada foto = pemilik userId?
 * LOLOS bila cocok DAN live (sesuai mode liveness).
 */
export async function verifikasiWajahPenyedia(
  userId: number | string,
  image: string,
  faceId: string,
): Promise<{ lolos: boolean; cocok: boolean; live: boolean; skor: number }> {
  pastikanSiap();
  if (pakaiLuxand()) {
    const foto = dataUrlKeBlob(image);
    const live = await cekLiveness(foto);
    if (!live.live) return { lolos: false, cocok: false, live: false, skor: live.skor };
    const m = await luxSearch(foto);
    // 1:1 — kecocokan HARUS subjek pengguna ini & di atas ambang.
    const cocok = Boolean(m && m.nama === namaSubjek(userId) && m.skor >= ambangCocok());
    return { lolos: cocok, cocok, live: true, skor: m?.skor ?? 0 };
  }
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

/**
 * Identifikasi 1:N (untuk LOGIN wajah tanpa username): siapa pemilik
 * wajah ini? Kembalikan userId bila cocok kuat DAN live. Null bila tak
 * dikenali / bukan wajah asli.
 */
export async function identifikasiWajah(
  image: string,
): Promise<{ userId: string | null; live: boolean; skor: number; alasan?: string }> {
  pastikanSiap();
  if (pakaiLuxand()) {
    const foto = dataUrlKeBlob(image);
    const live = await cekLiveness(foto);
    if (!live.live) return { userId: null, live: false, skor: live.skor, alasan: live.alasan };
    const m = await luxSearch(foto);
    // LOGIN 1:N sangat ketat: (a) kecocokan tinggi (ambangLogin, bawaan
    // 0.85), DAN (b) tak ambigu — kandidat teratas harus unggul jelas dari
    // kandidat kedua. Ini mencegah "wajah orang lain (mirip) ikut masuk".
    if (!m || m.skor < ambangLogin() || m.skor - m.skorKedua < marginAman()) {
      return { userId: null, live: true, skor: m?.skor ?? 0 };
    }
    return { userId: userIdDariNama(m.nama), live: true, skor: m.skor };
  }
  // Generik: minta penyedia mengidentifikasi.
  const d = await generikPanggil<{ user_id?: string; live?: boolean; skor?: number }>({
    aksi: "identifikasi",
    image,
  });
  const live = d.live === true;
  return { userId: live ? (d.user_id ?? null) : null, live, skor: Number(d.skor ?? 0) };
}

/** Hapus referensi wajah di penyedia (saat pengguna hapus/daftar ulang). */
export async function hapusWajahPenyedia(faceId: string): Promise<void> {
  if (!faceId) return;
  if (pakaiLuxand()) {
    await luxHapus(faceId);
    return;
  }
  // Generik: penghapusan opsional.
}

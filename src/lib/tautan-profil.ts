// Tautan profil upload-post ke akun superapp (13 Okt 2026) — bagian MURNI
// (tanpa jaringan/basis data) supaya bisa diuji dan dipakai server maupun layar.
//
//  - saringAnggota : pencarian nama/username + filter divisi untuk pemilih akun.
//  - periksaTautan : aturan "boleh/tidak" menautkan satu profil ke satu akun.
//
// Latar: pemeriksaan lama memakai maybeSingle(); bila satu profile_key / satu
// pengguna punya >1 baris, galatnya dibuang dan pemeriksaan LOLOS diam-diam
// (profil tertaut ganda). Di sini semua baris dihitung eksplisit.
import { DIVISI, DIVISI_BOT } from "@/lib/struktur";

export type AnggotaTautan = {
  id: string;
  nama: string;
  username: string;
  avatar_url: string;
  divisi: string;
  /** Profil upload-post yang sudah dimilikinya ("" = belum punya). */
  profil: string;
};

/** Nilai filter khusus (bukan nama divisi). */
export const FILTER_SEMUA = "";
export const FILTER_TANPA_DIVISI = "__tanpa__";

/** Pilihan filter divisi: semua divisi resmi + Divisi BOT (yang sengaja di luar DIVISI). */
export function pilihanFilterDivisi(): string[] {
  return [...DIVISI, DIVISI_BOT];
}

function normal(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").trim();
}

/**
 * Saring daftar akun. `cari` cocok ke nama ATAU username (tiap kata harus ada);
 * `divisi` = nama divisi persis, FILTER_TANPA_DIVISI, atau FILTER_SEMUA.
 * Urutan: nama. `batas` memotong hasil (0 = tanpa batas).
 */
export function saringAnggota(
  daftar: readonly AnggotaTautan[],
  cari: string,
  divisi: string,
  batas = 0,
): AnggotaTautan[] {
  const kata = normal(cari).split(/\s+/).filter(Boolean);
  const hasil = daftar.filter((a) => {
    if (divisi === FILTER_TANPA_DIVISI) {
      if (a.divisi.trim() !== "") return false;
    } else if (divisi !== FILTER_SEMUA && a.divisi.trim() !== divisi) {
      return false;
    }
    if (kata.length === 0) return true;
    const jerami = `${normal(a.nama)} ${normal(a.username)}`;
    return kata.every((k) => jerami.includes(k));
  });
  hasil.sort((x, y) => x.nama.localeCompare(y.nama, "id"));
  return batas > 0 ? hasil.slice(0, batas) : hasil;
}

/** Hitung akun per divisi (untuk angka di pilihan filter). */
export function hitungPerDivisi(daftar: readonly AnggotaTautan[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of daftar) {
    const d = a.divisi.trim() || FILTER_TANPA_DIVISI;
    m.set(d, (m.get(d) ?? 0) + 1);
  }
  return m;
}

// ------------------------------------------------------------
// Aturan tautan
// ------------------------------------------------------------

/** Satu baris sosmed_profile yang relevan (semua penyedia & jenis). */
export type BarisProfilTautan = {
  id: number;
  profile_key: string;
  user_id: number | null;
  penyedia: string;
  jenis: string;
};

export type KeputusanTautan =
  | { ok: true; idMilik: number | null; idempoten: boolean }
  | { ok: false; status: 404 | 409; pesan: string };

/**
 * @param pemilikProfil  SEMUA baris yang memuat profile_key itu (apa pun penyedia/jenisnya).
 * @param milikAnggota   baris jenis 'pengguna' (penyedia anggota) milik anggota target.
 */
export function periksaTautan(p: {
  userId: number;
  profil: string;
  namaAnggota: string;
  pemilikProfil: readonly BarisProfilTautan[];
  milikAnggota: readonly BarisProfilTautan[];
  ganti: boolean;
}): KeputusanTautan {
  const lain = p.pemilikProfil.filter((b) => b.user_id !== p.userId);
  if (lain.length > 0) {
    const ada = lain.find((b) => b.user_id != null);
    return {
      ok: false,
      status: 409,
      pesan: ada
        ? `Profil "${p.profil}" sudah tertaut ke anggota lain (id ${ada.user_id}).`
        : `Profil "${p.profil}" sudah dipakai sebagai profil ${lain[0].jenis} (${lain[0].penyedia}).`,
    };
  }
  if (p.milikAnggota.length > 1) {
    return {
      ok: false,
      status: 409,
      pesan: `${p.namaAnggota} punya ${p.milikAnggota.length} baris profil (data ganda). Rapikan dulu sebelum menautkan.`,
    };
  }
  const milik = p.milikAnggota[0] ?? null;
  // Sudah tertaut ke profil yang sama → idempoten.
  if (milik && milik.profile_key === p.profil) {
    return { ok: true, idMilik: milik.id, idempoten: true };
  }
  if (milik && !p.ganti) {
    return {
      ok: false,
      status: 409,
      pesan: `${p.namaAnggota} sudah punya profil "${milik.profile_key}". Kirim ganti=true untuk mengalihkannya ke "${p.profil}".`,
    };
  }
  return { ok: true, idMilik: milik?.id ?? null, idempoten: false };
}

/** Akun yang boleh dijadikan sasaran tautan: aktif, bukan master/superadmin. */
export function bolehDitautkan(o: {
  aktif: boolean | null;
  status: string | null;
  role: string | null;
}): { ok: true } | { ok: false; pesan: string } {
  if (o.aktif !== true || o.status !== "aktif") {
    return { ok: false, pesan: "Anggota tidak ditemukan / tidak aktif." };
  }
  if (o.role === "master" || o.role === "superadmin" || o.role === "super_admin") {
    return { ok: false, pesan: "Akun master / superadmin tidak bisa dijadikan sasaran tautan profil." };
  }
  return { ok: true };
}

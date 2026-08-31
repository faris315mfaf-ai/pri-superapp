// ============================================================
// Abstraksi PENYEDIA SOSMED (spek 1.17).
//
// Semua fitur profil & penautan sosmed berbicara lewat antarmuka
// ini, BUKAN langsung ke Ayrshare — supaya migrasi ke upload-post
// (rencana dekat) tinggal menulis satu adaptor dan mengganti env
// SOSMED_PENYEDIA, tanpa menyentuh route ataupun UI.
//
// Adaptor tersedia:
// - ayrshare     : aktif sekarang (lib/ayrshare.ts).
// - upload-post  : KODE SIMPANAN — kerangkanya siap, menyala begitu
//                  UPLOAD_POST_API_KEY diisi dan TODO-nya dilengkapi.
// ============================================================
import {
  ambilAkunTertaut,
  buatProfilAyrshare,
  buatTautanHubungkan,
  hapusProfilAyrshare,
} from "@/lib/ayrshare";

export type ProfilPenyedia = { profileKey: string; refId: string };
export type AkunTertautPenyedia = { platform: string; username: string };

export interface PenyediaSosmed {
  id: "ayrshare" | "upload-post";
  /** Buat profil baru; profileKey WAJIB langsung disimpan pemanggil. */
  buatProfil(judul: string): Promise<ProfilPenyedia>;
  /** Hapus profil (akun tertautnya ikut lepas). */
  hapusProfil(profileKey: string): Promise<void>;
  /** URL halaman penautan sosmed untuk profil itu (dibuka di tab baru). */
  tautanHubungkan(profileKey: string): Promise<string>;
  /** Akun sosmed yang sudah tertaut di profil itu. */
  akunTertaut(profileKey: string): Promise<AkunTertautPenyedia[]>;
}

// ------------------------------------------------------------
// Adaptor Ayrshare (aktif)
// ------------------------------------------------------------

const ayrshare: PenyediaSosmed = {
  id: "ayrshare",
  buatProfil: (judul) => buatProfilAyrshare(judul),
  hapusProfil: (profileKey) => hapusProfilAyrshare(profileKey),
  tautanHubungkan: (profileKey) => buatTautanHubungkan(profileKey),
  async akunTertaut(profileKey) {
    const d = await ambilAkunTertaut(profileKey);
    return d.akun
      .filter((a) => a.platform && a.username)
      .map((a) => ({ platform: a.platform, username: a.username }));
  },
};

// ------------------------------------------------------------
// Adaptor upload-post (AKTIF sejak rombakan TVR Saya, 31 Agu 2026)
// "profileKey" pada penyedia ini = username profil upload-post.
// Implementasi API-nya di lib/upload-post (kontrak diverifikasi live).
// ------------------------------------------------------------
import {
  akunTertautUp,
  buatProfilUp,
  hapusProfilUp,
  tautanHubungkanUp,
  uploadPostSiap,
} from "@/lib/upload-post";

/** Username profil upload-post dari judul: huruf kecil/angka/strip. */
function slugProfil(judul: string): string {
  const dasar = judul
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return dasar || `pri-${Date.now().toString(36)}`;
}

const uploadPost: PenyediaSosmed = {
  id: "upload-post",
  async buatProfil(judul) {
    const username = slugProfil(judul);
    await buatProfilUp(username);
    return { profileKey: username, refId: username };
  },
  hapusProfil: (profileKey) => hapusProfilUp(profileKey),
  tautanHubungkan: (profileKey) => tautanHubungkanUp(profileKey),
  async akunTertaut(profileKey) {
    const akun = await akunTertautUp(profileKey);
    return Object.entries(akun).map(([platform, username]) => ({ platform, username }));
  },
};

/** Penyedia aktif — env SOSMED_PENYEDIA ("ayrshare" bawaan). */
export function penyediaAktif(): PenyediaSosmed {
  return process.env.SOSMED_PENYEDIA === "upload-post" ? uploadPost : ayrshare;
}

/**
 * Penyedia untuk AKUN PRIBADI ANGGOTA (TVR Saya): upload-post begitu
 * kuncinya terpasang, tanpa menyentuh jalur Official/QC yang tetap
 * Ayrshare. Dipisah dari penyediaAktif() supaya dua dunia itu tidak
 * saling menular lewat satu env global.
 */
export function penyediaAnggota(): PenyediaSosmed {
  return uploadPostSiap() ? uploadPost : penyediaAktif();
}

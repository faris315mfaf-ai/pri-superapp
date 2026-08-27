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
// Adaptor upload-post (KODE SIMPANAN — spek 1.17)
//
// Pemetaan endpoint yang sudah dipelajari (lengkapi saat migrasi):
// - Buat profil    : POST https://api.upload-post.com/api/uploadposts/users
//                    { username } — header "Authorization: Apikey <KEY>"
// - Tautan penautan: POST .../users/generate-jwt { username } → { access_url }
// - Akun tertaut   : GET  .../users → profiles[].social_accounts
// - Hapus profil   : DELETE .../users { username }
// "profileKey" pada penyedia ini = username profil upload-post.
// ------------------------------------------------------------

function belumAktif(): never {
  throw Object.assign(
    new Error(
      "Penyedia upload-post belum diaktifkan. Isi UPLOAD_POST_API_KEY lalu lengkapi adaptornya di lib/sosmed-penyedia.ts.",
    ),
    { status: 503, pesanAman: true },
  );
}

const uploadPost: PenyediaSosmed = {
  id: "upload-post",
  // TODO(migrasi upload-post): implementasi per pemetaan di atas.
  buatProfil: async () => belumAktif(),
  hapusProfil: async () => belumAktif(),
  tautanHubungkan: async () => belumAktif(),
  akunTertaut: async () => belumAktif(),
};

/** Penyedia aktif — env SOSMED_PENYEDIA ("ayrshare" bawaan). */
export function penyediaAktif(): PenyediaSosmed {
  return process.env.SOSMED_PENYEDIA === "upload-post" ? uploadPost : ayrshare;
}

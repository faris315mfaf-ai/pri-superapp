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

export type IdPenyedia = "ayrshare" | "upload-post" | "postiz";

/**
 * Penyedia yang boleh dipakai AKUN PRIBADI ANGGOTA (TV Rakyat Saya).
 *
 * WAJIB dipakai saat menanyakan profil anggota ke database:
 *     .in("penyedia", PENYEDIA_ANGGOTA)      ← benar
 *     .eq("penyedia", "upload-post")         ← salah sejak ada Postiz
 *
 * Alasannya nyata dan mahal: kolom `sosmed_profile.penyedia` disaring
 * di 18 tempat (dashboard, KPI, galeri, siaran, insight, studio…).
 * Kalau satu anggota dipindah ke Postiz sementara tempat-tempat itu
 * masih mengunci "upload-post", anggota tersebut LENYAP dari semua
 * layar itu tanpa satu pun pesan galat — laporannya hilang, KPI-nya
 * nol, dan kelihatannya seperti dia berhenti bekerja.
 *
 * Ayrshare TIDAK masuk daftar ini: itu dunia TV Rakyat Official.
 */
export const PENYEDIA_ANGGOTA: readonly string[] = ["upload-post", "postiz"];

export interface PenyediaSosmed {
  id: IdPenyedia;
  /** Buat profil baru; profileKey WAJIB langsung disimpan pemanggil. */
  buatProfil(judul: string): Promise<ProfilPenyedia>;
  /** Hapus profil (akun tertautnya ikut lepas). */
  hapusProfil(profileKey: string): Promise<void>;
  /** URL halaman penautan sosmed untuk profil itu (dibuka di tab baru).
   *  `platforms` (opsional) membatasi halamannya ke platform tertentu. */
  tautanHubungkan(profileKey: string, platforms?: string[]): Promise<string>;
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
  tautanHubungkan: (profileKey, platforms) => tautanHubungkanUp(profileKey, platforms),
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

// ------------------------------------------------------------
// Adaptor Postiz SWAKELOLA (15 Sep 2026) — masih UJI COBA.
//
// "profileKey" pada penyedia ini = label "customer" di Postiz, yang
// diketik admin saat menautkan akun sosmed seorang anggota.
//
// PERBEDAAN BESAR yang harus dipahami sebelum memindahkan siapa pun:
// upload-post memberi TAUTAN PENAUTAN per anggota — anggota membuka
// tautan itu sendiri lalu login ke TikTok/Instagram miliknya. Postiz
// tidak bekerja begitu: penautan dilakukan dari DALAM dasbor Postiz
// oleh orang yang punya akun Postiz. Artinya salah satu dari dua ini
// harus dipilih, dan dua-duanya menambah pekerjaan manusia:
//   (a) admin menautkan akun atas nama anggota (anggota menyerahkan
//       aksesnya sekali), atau
//   (b) tiap anggota diberi akun Postiz sendiri.
// Selama itu belum diputuskan, tautanHubungkan() sengaja MELEMPAR
// galat yang menjelaskan keadaannya — bukan memberi tautan rusak yang
// baru ketahuan salah setelah 200 orang mencobanya.
// ------------------------------------------------------------
import { akunMilik, integrasiPostiz, postizSiap } from "@/lib/postiz";

const postiz: PenyediaSosmed = {
  id: "postiz",
  // Tidak ada "buat profil" di Postiz: label pelanggan lahir begitu
  // admin menautkan akun pertama atas nama anggota itu. Kuncinya
  // ditentukan aplikasi supaya tetap sama dengan gaya upload-post.
  async buatProfil(judul) {
    const kunci = slugProfil(judul);
    return { profileKey: kunci, refId: kunci };
  },
  // Penghapusan akun dilakukan di dasbor Postiz. Sengaja TIDAK
  // menghapus apa pun lewat API di sini: satu salah panggil bisa
  // memutus akun sosmed anggota lain yang berbagi label.
  async hapusProfil() {
    /* tidak ada yang perlu dihapus di sisi Postiz */
  },
  async tautanHubungkan() {
    throw new Error(
      "Postiz tidak menyediakan tautan penautan mandiri. Akun sosmed anggota ditautkan dari dasbor Postiz oleh admin, lalu diberi label nama anggotanya.",
    );
  },
  async akunTertaut(profileKey) {
    const semua = await integrasiPostiz();
    return semua
      .filter((a) => akunMilik(a, profileKey) && !a.mati && a.platform)
      .map((a) => ({ platform: a.platform, username: a.nama }));
  },
};

/**
 * Penyedia untuk SATU profil, dipilih dari kolom `sosmed_profile.penyedia`.
 *
 * Inilah pintu uji coba bertahap: memindahkan seorang anggota ke Postiz
 * cukup dengan mengubah satu baris di database, bukan mengganti env
 * global yang akan menyeret 225 orang sekaligus.
 */
export function penyediaDenganId(id: string | null | undefined): PenyediaSosmed {
  if (id === "postiz") return postiz;
  if (id === "upload-post") return uploadPost;
  if (id === "ayrshare") return ayrshare;
  return penyediaAnggota();
}

/** Postiz sudah diatur di server ini? (alamat + kunci terisi) */
export function postizTersedia(): boolean {
  return postizSiap();
}

// ============================================================
// Abstraksi PENYEDIA SOSMED (spek 1.17).
//
// Semua fitur profil & penautan sosmed berbicara lewat antarmuka
// ini, BUKAN langsung ke API penyedia — supaya route & UI tidak ikut
// berubah bila penyedianya berganti.
//
// Adaptor tersedia:
// - upload-post  : penyedia utama (lib/upload-post) — bawaan semua akun.
// - postiz       : uji coba swakelola per anggota (lib/postiz).
//
// 16 Okt 2026: AYRSHARE DIHENTIKAN (keputusan pemilik). Adaptornya
// dihapus. Baris lama `sosmed_profile.penyedia = 'ayrshare'` dianggap
// BELUM TERHUBUNG — pemiliknya wajib menghubungkan ulang lewat
// upload-post. Tidak ada jalur yang boleh mengembalikan adaptor Ayrshare.
// ============================================================
export type ProfilPenyedia = { profileKey: string; refId: string };
export type AkunTertautPenyedia = {
  platform: string;
  username: string;
  /** Tertaut tapi izinnya kedaluwarsa — harus login ulang (5 Okt 2026). */
  perluSambungUlang?: boolean;
};

export type IdPenyedia = "upload-post" | "postiz";

/**
 * Penyedia yang sudah DIHENTIKAN (16 Okt 2026). Baris `sosmed_profile`
 * dengan nilai ini masih bisa tersisa di database; perlakukan sebagai
 * belum terhubung dan minta pemiliknya menghubungkan ulang.
 */
export const PENYEDIA_DIHENTIKAN = "ayrshare";

/** Pesan untuk pemilik profil lama Ayrshare. */
export const PESAN_AYRSHARE_DIHENTIKAN =
  "Ayrshare dihentikan — hubungkan ulang akun sosmed Anda lewat upload-post.";

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
 * Ayrshare sudah dihentikan (16 Okt 2026) dan tidak pernah boleh masuk
 * daftar ini — baris lamanya dianggap belum terhubung.
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
// Adaptor upload-post (AKTIF sejak rombakan TVR Saya, 31 Agu 2026;
// satu-satunya penyedia bawaan sejak Ayrshare dihentikan 16 Okt 2026)
// "profileKey" pada penyedia ini = username profil upload-post.
// Implementasi API-nya di lib/upload-post (kontrak diverifikasi live).
// ------------------------------------------------------------
import {
  buatProfilUp,
  hapusProfilUp,
  statusAkunUp,
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
    const { akun, perluUlang } = await statusAkunUp(profileKey);
    return Object.entries(akun).map(([platform, username]) => ({
      platform,
      username,
      perluSambungUlang: perluUlang.includes(platform),
    }));
  },
};

/**
 * Penyedia aktif — selalu upload-post sejak Ayrshare dihentikan
 * (16 Okt 2026). Env SOSMED_PENYEDIA tidak lagi dibaca: nilai lama
 * "ayrshare" di server tidak boleh menghidupkan jalur yang sudah mati.
 */
export function penyediaAktif(): PenyediaSosmed {
  return uploadPost;
}

/** Galat 503 bila kunci upload-post belum dipasang di server. */
function galatUploadPostBelumSiap(): Error {
  return Object.assign(
    new Error("upload-post belum diatur (UPLOAD_POST_API_KEY kosong). Hubungi pengelola."),
    // pesanAman: pesan ini memang untuk pengguna — jangan disamarkan bungkus().
    { status: 503, pesanAman: true },
  );
}

/**
 * Penyedia bawaan untuk AKUN PRIBADI ANGGOTA (TVR Saya): upload-post.
 * TIDAK ada cadangan lain — bila kuncinya belum terpasang, melempar galat
 * 503 yang jelas daripada diam-diam beralih ke penyedia lain.
 */
export function penyediaAnggota(): PenyediaSosmed {
  if (!uploadPostSiap()) throw galatUploadPostBelumSiap();
  return uploadPost;
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
  // Termasuk "ayrshare" (dihentikan): pemiliknya dianggap belum terhubung
  // dan dihubungkan ulang lewat penyedia bawaan, bukan adaptor lama.
  return penyediaAnggota();
}

/** Postiz sudah diatur di server ini? (alamat + kunci terisi) */
export function postizTersedia(): boolean {
  return postizSiap();
}

// ============================================================
// PENYEDIA PER ANGGOTA (15 Sep 2026)
//
// Postiz BUKAN pengganti upload-post — ia pilihan kedua di samping
// upload-post (Ayrshare dihentikan 16 Okt 2026). Yang menentukan siapa
// memakai apa adalah MASTER, per orang, lewat Panel Master.
//
// Sumber kebenarannya satu: kolom `sosmed_profile.penyedia` pada baris
// milik anggota itu (jenis = 'pengguna'). Disengaja TIDAK memakai
// tabel daftar terpisah — satu anggota tetap punya TEPAT SATU baris
// profil, sehingga 18 tempat yang menanyakan profil anggota tidak
// pernah menerima dua baris dan salah pilih.
//
// Berpindah pun jadi murah: master mengubah satu kolom. Profil lama di
// upload-post tidak dihapus dan `profile_key`-nya tidak berubah (kedua
// penyedia memakai slug yang sama), jadi mengembalikan anggota ke
// upload-post mengembalikan keadaannya persis seperti semula.
// ============================================================
import { supabase } from "@/lib/supabase";
import { unggahVideoPostiz } from "@/lib/postiz";
import { gagalDariBalasan, unggahVideoUp } from "@/lib/upload-post";

/**
 * Penyedia bawaan untuk anggota yang belum pernah disetel master.
 * Selalu "upload-post" — tidak melempar walau kuncinya kosong (dipakai
 * juga untuk tampilan Panel Master); galatnya muncul saat dipakai.
 */
export function idPenyediaBawaan(): IdPenyedia {
  return "upload-post";
}

/**
 * Penyedia yang dipakai SATU anggota. Membaca baris profilnya; anggota
 * yang belum punya baris — atau barisnya masih Ayrshare (dihentikan) —
 * memakai bawaan, sehingga profil lamanya terbaca BELUM terhubung.
 */
export async function idPenyediaAnggota(userId: number): Promise<IdPenyedia> {
  const { data } = await supabase()
    .from("sosmed_profile")
    .select("penyedia")
    .eq("jenis", "pengguna")
    .eq("user_id", userId)
    .maybeSingle();
  const id = String(data?.penyedia ?? "");
  if (id === "postiz" || id === "upload-post") return id;
  return idPenyediaBawaan();
}

/** Adaptor profil untuk satu anggota (dipakai alur Hubungkan). */
export async function penyediaUntukAnggota(userId: number): Promise<PenyediaSosmed> {
  return penyediaDenganId(await idPenyediaAnggota(userId));
}

export type HasilUnggahAnggota = {
  sukses: boolean;
  mentah: Record<string, unknown>;
  request_id: string | null;
  /** Platform yang SUDAH pasti gagal saat balasan diterima. */
  gagalAwal: { platform: string; pesan: string }[];
};

/**
 * Unggah video anggota lewat penyedia yang ditetapkan untuknya.
 *
 * Bentuk hasilnya sama untuk semua penyedia supaya route pemanggilnya
 * tidak bercabang. Yang TIDAK disamarkan: bila penyedianya belum siap,
 * fungsi ini melempar galat yang menyebut penyedianya — tidak diam-diam
 * beralih ke penyedia lain. Beralih diam-diam berarti video anggota
 * terbit di akun yang tidak ia duga, dan itu tidak bisa ditarik kembali.
 */
export async function unggahVideoAnggota(
  penyediaId: IdPenyedia,
  opsi: {
    profil: string;
    videoUrl: string;
    judul: string;
    caption?: string;
    platforms: string[];
    scheduleDate?: string;
    captionPer?: Record<string, string>;
  },
): Promise<HasilUnggahAnggota> {
  if (penyediaId === "postiz") {
    if (!postizSiap()) {
      throw Object.assign(
        new Error("Anggota ini disetel memakai Postiz, tetapi Postiz belum diatur di server (POSTIZ_URL / POSTIZ_API_KEY kosong)."),
        { status: 503 },
      );
    }
    const h = await unggahVideoPostiz(opsi);
    return { sukses: h.sukses, mentah: h.mentah, request_id: h.request_id, gagalAwal: h.gagalAwal };
  }

  if (!uploadPostSiap()) throw galatUploadPostBelumSiap();
  const h = await unggahVideoUp(opsi);
  return {
    sukses: h.sukses,
    mentah: h.mentah,
    request_id: h.request_id,
    gagalAwal: gagalDariBalasan(h.mentah),
  };
}

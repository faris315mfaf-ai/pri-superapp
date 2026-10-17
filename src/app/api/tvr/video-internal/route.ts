// GET /api/tvr/video-internal?jenis=wajib|official|pustaka (17 Okt 2026)
//
// Daftar video yang SUDAH ADA di sistem dan bisa langsung diposting anggota
// ke akun sosmednya sendiri tanpa unggah ulang: bahan Video Wajib, video
// TV Rakyat Official yang siap tayang, dan Pustaka Video. Postingnya lewat
// /api/tvr/unggah {aksi:"post", sumber_internal:{jenis,id}}.
// Balasan: { item: ItemInternal[] } — lihat lib/video-internal.
import { bungkus } from "@/lib/api-helper";
import { userEfektifTvr } from "@/lib/sebagai";
import { pastikanFiturAktif } from "@/lib/fitur-server";
import { daftarVideoInternal, jenisInternalSah } from "@/lib/video-internal";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return bungkus(async () => {
    // Sama dengan /api/tvr/unggah: admin PALUGODAM boleh mengendalikan akun (X-Sebagai).
    const user = await userEfektifTvr(request);
    await pastikanFiturAktif(user, "tvrku", "TV Rakyat Saya sedang dimatikan untuk peran Anda.");
    const jenis = new URL(request.url).searchParams.get("jenis") ?? "";
    if (!jenisInternalSah(jenis)) {
      throw Object.assign(new Error("jenis harus 'wajib', 'official', atau 'pustaka'."), { status: 400 });
    }
    return { item: await daftarVideoInternal(user, jenis) };
  });
}

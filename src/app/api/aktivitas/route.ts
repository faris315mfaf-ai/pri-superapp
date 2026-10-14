// /api/aktivitas — laporan aksi dari PERAMBAN untuk animasi Ruang Bot (14 Okt 2026).
// Dipakai aksi yang tidak lewat server aplikasi sehingga server tidak bisa melihat mulai/selesainya
// (mis. unggah video langsung ke penyimpanan awan). Siapa pun yang login boleh melapor, tetapi hanya
// untuk dirinya sendiri dan hanya jenis dari daftar tertutup; isinya hanya tontonan master.
//   POST { aksi:"mulai", jenis, judul?, akun?, platform? } → { token }
//   POST { aksi:"denyut", token } → { sukses:true }   (tiap ~30 dtk; tanpa denyut 2 menit = dianggap usai)
//   POST { aksi:"selesai", token, judul?, akun?, platform? } → { sukses:true }
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { JENIS_KLIEN, akhiriAktivitas, mulaiAktivitas, perbaruiAktivitas } from "@/lib/dunia";

export const dynamic = "force-dynamic";

const teks = (v: unknown, maks: number): string => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maks) : "");

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    // Dilempar (bukan dikembalikan) supaya bungkus() menjawab 429 sungguhan, bukan 200 berisi {}.
    const batas = await pastikanTidakMelebihiBatas(request, "aktivitas", 90, 60, String(user.id));
    if (batas) throw Object.assign(new Error("Terlalu banyak permintaan."), { status: 429 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const judul = teks(b.judul, 160);
    const akun = teks(b.akun, 80);
    const platform = teks(b.platform, 80);
    const detail = { judul, akun, platform };

    if (b.aksi === "mulai") {
      const jenis = teks(b.jenis, 40);
      if (!(JENIS_KLIEN as readonly string[]).includes(jenis)) {
        throw Object.assign(new Error("Jenis aksi tidak dikenal."), { status: 400 });
      }
      const token = await mulaiAktivitas(user.id, { jenis, ringkasan: judul ? `"${judul}"` : "", detail, sewa: true });
      return { token };
    }
    if (b.aksi === "denyut") {
      const token = teks(b.token, 40);
      if (!/^[0-9a-f]{12}$/.test(token)) throw Object.assign(new Error("Token tidak sah."), { status: 400 });
      await perbaruiAktivitas(user.id, token);
      return { sukses: true };
    }
    if (b.aksi === "selesai") {
      const token = teks(b.token, 40);
      if (!/^[0-9a-f]{12}$/.test(token)) throw Object.assign(new Error("Token tidak sah."), { status: 400 });
      await akhiriAktivitas(user.id, token, { jenis: "", ringkasan: judul ? `"${judul}"` : "", detail });
      return { sukses: true };
    }
    throw Object.assign(new Error("Aksi tidak dikenal."), { status: 400 });
  });
}

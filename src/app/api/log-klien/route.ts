// POST /api/log-klien — penampung laporan crash dari peramban pengguna.
//
// SENGAJA tanpa autentikasi: crash paling parah justru terjadi sebelum
// pengguna sempat masuk (berkas aplikasi gagal dimuat). Risikonya
// dibatasi dengan memangkas ukuran tiap kolom dan menerima hanya
// kolom-kolom yang dikenal — tidak ada data pengguna yang tersimpan
// selain user agent peramban.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { cekBatas, ipDari } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return bungkus(async () => {
    // Throttle per IP: maks 30 laporan/menit. Lewat batas → laporan
    // DIBUANG diam-diam tapi tetap dibalas sukses, supaya peramban
    // yang sedang crash beruntun tidak menganggap pengirimannya galat
    // (dan supaya endpoint tanpa auth ini tidak bisa dipakai
    // membanjiri tabel log).
    const { boleh } = cekBatas(`log-klien|${ipDari(request)}`, 30, 60);
    if (!boleh) return { sukses: true };

    const body = (await request.json().catch(() => ({}))) as {
      jenis?: string;
      pesan?: string;
      stack?: string;
      url?: string;
      versi?: string;
    };

    await supabase()
      .from("log_klien")
      .insert({
        jenis: String(body.jenis ?? "error").slice(0, 40),
        pesan: String(body.pesan ?? "").slice(0, 1000) || null,
        stack: String(body.stack ?? "").slice(0, 4000) || null,
        url: String(body.url ?? "").slice(0, 500) || null,
        versi: String(body.versi ?? "").slice(0, 20) || null,
        user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300) || null,
      });

    return { sukses: true };
  });
}

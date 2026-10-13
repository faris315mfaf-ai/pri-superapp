// /api/bot/internal — jalur "Rumah Bot" (runner di VPS mesin) → aplikasi (13 Okt 2026).
// TANPA sesi pengguna: setiap permintaan ditandatangani HMAC (lib/bot-hmac) dengan
// BOT_RUNNER_SECRET; ada jendela waktu dan nonce sekali pakai. Gagal tertutup:
// tanpa rahasia terkonfigurasi, semua permintaan ditolak.
//
// Pekerjaan 1 hanya mengenal aksi "denyut" (detak + keadaan global). Aksi lain
// (ambil_kerja, lapor) menyusul di Pekerjaan 2.
import { bungkus } from "@/lib/api-helper";
import { supabase } from "@/lib/supabase";
import { cekBatas, pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { HEADER_BOT_NONCE, HEADER_BOT_TANDA, HEADER_BOT_WAKTU, JENDELA_BOT_DETIK, verifikasiTandaBot } from "@/lib/bot-hmac";
import { RUNNER_ONLINE_DETIK, bacaJedaGlobal } from "@/lib/bot-data";
import { siarkanBot } from "@/lib/bot-realtime";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BATAS_BADAN = 8 * 1024;

function tolak(pesan: string, status: number): never {
  throw Object.assign(new Error(pesan), { status });
}

export async function POST(request: Request) {
  const terlalu = await pastikanTidakMelebihiBatas(request, "bot-internal", 120, 60);
  if (terlalu) return terlalu;

  return bungkus(async () => {
    const badan = await request.text();
    if (badan.length > BATAS_BADAN) tolak("Badan permintaan terlalu besar.", 413);
    const rahasia = process.env.BOT_RUNNER_SECRET;
    const hasil = verifikasiTandaBot({
      rahasia,
      waktu: request.headers.get(HEADER_BOT_WAKTU),
      nonce: request.headers.get(HEADER_BOT_NONCE),
      tanda: request.headers.get(HEADER_BOT_TANDA),
      badan,
      sekarangDetik: Math.floor(Date.now() / 1000),
    });
    if (!hasil.sah) {
      if (hasil.alasan === "belum_dikonfigurasi") tolak("Jalur runner belum dikonfigurasi.", 503);
      console.warn("[bot/internal] ditolak:", hasil.alasan);
      tolak("Tanda tangan tidak sah.", 401);
    }
    // Nonce sekali pakai: percobaan kedua dengan nonce sama ditolak (cegah pemutaran ulang).
    const nonce = request.headers.get(HEADER_BOT_NONCE) ?? "";
    const pakaiPertama = await cekBatas(`bot-nonce|${nonce}`, 1, JENDELA_BOT_DETIK * 2);
    if (!pakaiPertama.boleh) {
      console.warn("[bot/internal] nonce dipakai ulang");
      tolak("Tanda tangan tidak sah.", 401);
    }

    let isi: { aksi?: unknown; versi?: unknown };
    try {
      isi = JSON.parse(badan) as { aksi?: unknown; versi?: unknown };
    } catch {
      tolak("Badan bukan JSON.", 400);
    }
    if (isi.aksi !== "denyut") tolak("aksi tidak dikenal.", 400);

    const db = supabase();
    const { data: lama } = await db.from("bot_runner").select("terakhir_denyut").eq("id", 1).maybeSingle();
    const sebelum = (lama as { terakhir_denyut?: string | null } | null)?.terakhir_denyut ?? null;
    const sekarang = new Date();
    const { error } = await db
      .from("bot_runner")
      .upsert({ id: 1, terakhir_denyut: sekarang.toISOString(), versi: typeof isi.versi === "string" ? isi.versi.slice(0, 40) : null }, { onConflict: "id" });
    if (error) {
      console.error("[bot/internal] simpan denyut:", error.message);
      tolak("Gagal menyimpan denyut.", 500);
    }
    // Siarkan hanya saat runner BARU online (detak sebelumnya sudah basi), bukan tiap detak.
    const basi = !sebelum || sekarang.getTime() - Date.parse(sebelum) > RUNNER_ONLINE_DETIK * 1000;
    if (basi) siarkanBot("denyut");

    const { data: bots } = await db.from("bot_redaksi").select("user_id, aktif, jeda, mode");
    return { sukses: true, jeda_global: await bacaJedaGlobal(), bots: bots ?? [] };
  });
}

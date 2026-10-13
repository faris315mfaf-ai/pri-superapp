// /api/bot/internal — jalur "Rumah Bot" (runner di VPS mesin) → aplikasi (13 Okt 2026).
// TANPA sesi pengguna: setiap permintaan ditandatangani HMAC (lib/bot-hmac) dengan
// BOT_RUNNER_SECRET; ada jendela waktu dan nonce sekali pakai. Gagal tertutup:
// tanpa rahasia terkonfigurasi, semua permintaan ditolak.
//
// Aksi (lihat lib/bot-protokol.ts):
//   denyut      detak runner + keadaan global/daftar bot (JawabanDenyut)
//   ambil_kerja perintah berikutnya untuk satu bot (JawabanAmbilKerja)
//   lapor       hasil panen / job / log dari runner (JawabanLapor)
// Bentuk badan divalidasi ketat (lib/bot-kerja-murni): bentuk salah → 400.
// Pesan galat ke runner ringkas; detail hanya di console server.
import { bungkus } from "@/lib/api-helper";
import { supabase } from "@/lib/supabase";
import { cekBatas, pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { HEADER_BOT_NONCE, HEADER_BOT_TANDA, HEADER_BOT_WAKTU, JENDELA_BOT_DETIK, verifikasiTandaBot } from "@/lib/bot-hmac";
import { RUNNER_ONLINE_DETIK, bacaJedaGlobal } from "@/lib/bot-data";
import { siarkanBot } from "@/lib/bot-realtime";
import { ambilKerja, prosesLaporan } from "@/lib/bot-kerja";
import { menitWibDari, validasiPermintaanRunner } from "@/lib/bot-kerja-murni";
import type { JawabanAmbilKerja, JawabanDenyut, JawabanLapor } from "@/lib/bot-protokol";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Laporan kandidat (maks 40 video, caption panjang) bisa ratusan KB; tetap dibatasi.
const BATAS_BADAN = 400 * 1024;

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

    let mentah: unknown;
    try {
      mentah = JSON.parse(badan);
    } catch {
      tolak("Badan bukan JSON.", 400);
    }
    const sah = validasiPermintaanRunner(mentah);
    if (!sah.ok) tolak(sah.pesan, 400);
    const permintaan = sah.permintaan;

    if (permintaan.aksi === "ambil_kerja") {
      const jawaban: JawabanAmbilKerja = { sukses: true, perintah: await ambilKerja(permintaan.bot_id) };
      return jawaban;
    }
    if (permintaan.aksi === "lapor") {
      await prosesLaporan(permintaan.bot_id, permintaan.laporan);
      const jawaban: JawabanLapor = { sukses: true };
      return jawaban;
    }

    const db = supabase();
    const { data: lama } = await db.from("bot_runner").select("terakhir_denyut").eq("id", 1).maybeSingle();
    const sebelum = (lama as { terakhir_denyut?: string | null } | null)?.terakhir_denyut ?? null;
    const sekarang = new Date();
    const { error } = await db
      .from("bot_runner")
      .upsert({ id: 1, terakhir_denyut: sekarang.toISOString(), versi: permintaan.versi ?? null }, { onConflict: "id" });
    if (error) {
      console.error("[bot/internal] simpan denyut:", error.message);
      tolak("Gagal menyimpan denyut.", 500);
    }
    // Siarkan hanya saat runner BARU online (detak sebelumnya sudah basi), bukan tiap detak.
    const basi = !sebelum || sekarang.getTime() - Date.parse(sebelum) > RUNNER_ONLINE_DETIK * 1000;
    if (basi) siarkanBot("denyut");

    const { data: bots } = await db.from("bot_redaksi").select("id, user_id, aktif, jeda, mode").order("id", { ascending: true });
    const jawaban: JawabanDenyut = {
      sukses: true,
      jeda_global: await bacaJedaGlobal(),
      menit_wib: menitWibDari(sekarang.getTime()),
      bots: ((bots ?? []) as { id: number; user_id: number; aktif: boolean | null; jeda: boolean | null; mode: string | null }[]).map((b) => ({
        bot_id: Number(b.id),
        user_id: Number(b.user_id),
        aktif: b.aktif !== false,
        jeda: b.jeda === true,
        mode: b.mode === "otomatis" ? ("otomatis" as const) : ("acc" as const),
      })),
    };
    return jawaban;
  });
}

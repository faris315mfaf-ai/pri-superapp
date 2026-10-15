// POST /api/tv/video-wajib/hitung { perintah_id, laporan_id }
//
// "Hitung sebagai <kategori>" (15 Okt 2026): Pimred/TV Rakyat Nasional
// memasukkan SATU video yang tidak berangka perintah (mis. dibuat anggota
// tanpa tombol "Buat video dari perintah ini") ke perintah itu. Video
// tercatat dengan kategori perintah + penanda "dimasukkan oleh" supaya
// asal-usulnya jelas di Insight.
//
// Hanya baris laporan yang BELUM bernomor perintah yang bisa dimasukkan;
// yang sudah milik perintah lain tidak dipindah diam-diam.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { adalahPimred, adalahTvrNasional } from "@/lib/jabatan";
import { muatPerintah } from "@/lib/video-wajib-pantau";

export const dynamic = "force-dynamic";

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku."), { status: 401 });
    if (!adalahTvrNasional(user) && !adalahPimred(user)) {
      throw Object.assign(new Error("Hanya jabatan TV Rakyat Nasional & Pimpinan Redaksi yang boleh memasukkan video ke perintah."), { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { perintah_id?: unknown; laporan_id?: unknown };
    const perintahId = Number(body.perintah_id);
    const laporanId = Number(body.laporan_id);
    if (!Number.isFinite(perintahId) || perintahId <= 0 || !Number.isFinite(laporanId) || laporanId <= 0) {
      throw Object.assign(new Error("Perintah dan video harus disebutkan."), { status: 400 });
    }
    const perintah = await muatPerintah(perintahId);
    if (!perintah) throw Object.assign(new Error("Perintah tidak ditemukan."), { status: 404 });
    if (!perintah.kategori) throw Object.assign(new Error("Perintah ini belum punya kategori."), { status: 409 });

    const db = supabase();
    const { data, error } = await db
      .from("laporan_video")
      .update({ perintah_id: perintahId, perintah_oleh: Number(user.id), keyword: perintah.kategori })
      .eq("id", laporanId)
      .is("perintah_id", null)
      .select("id");
    if (error) {
      throw Object.assign(new Error("Gagal memasukkan video. Pastikan sql/76_video_wajib_perintah.sql sudah dijalankan."), { status: 503, pesanAman: true });
    }
    if (!(data ?? []).length) {
      throw Object.assign(new Error("Video tidak ditemukan atau sudah masuk sebuah perintah."), { status: 409 });
    }
    return { ok: true };
  });
}

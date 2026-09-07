// ============================================================
// /api/tvr/video-saya/unduh — UNDUH BERKAS VIDEO (7 Sep 2026).
//
// Hasil render tersimpan di CDN Creatomate, domain lain dari aplikasi ini.
// Atribut `download` pada <a> DIABAIKAN peramban untuk tautan lintas domain,
// jadi menautkannya langsung hanya MEMBUKA videonya — di HP malah masuk
// pemutar, bukan ke berkas tersimpan. Karena itu berkasnya dialirkan lewat
// server kita sendiri dengan Content-Disposition: attachment, supaya benar-
// benar tersimpan dan namanya rapi.
//
// GET ?item=<id studio_proyek_item>
// Boleh: pemilik baris itu, atau Admin PALUGODAM / pengurus.
// ============================================================
import { supabase } from "@/lib/supabase";
import { userEfektifTvr } from "@/lib/sebagai";
import { adalahAdminStudio } from "@/lib/struktur";

export const dynamic = "force-dynamic";
/** Video bisa puluhan MB; beri ruang lebih dari bawaan. */
export const maxDuration = 300;

/** Nama berkas yang aman dipakai di header dan di semua sistem berkas. */
function namaBerkas(judul: string, profil: string, id: string): string {
  const inti = (judul || profil || `video-${id}`)
    .normalize("NFKD")
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${inti || `video-${id}`}.mp4`;
}

function galat(pesan: string, status: number): Response {
  return Response.json({ error: pesan }, { status });
}

export async function GET(request: Request) {
  try {
    // Sesi diperiksa lebih dulu: yang belum masuk tidak perlu tahu bentuk
    // parameter yang diterima route ini.
    const user = await userEfektifTvr(request);

    const itemId = Number(
      new URL(request.url).searchParams.get("item") ?? "0",
    );
    if (!Number.isFinite(itemId) || itemId <= 0) {
      return galat("Id video tidak sah.", 400);
    }

    const db = supabase();

    const { data: item } = await db
      .from("studio_proyek_item")
      .select("id, user_id, profil, judul, render_url, render_status")
      .eq("id", itemId)
      .maybeSingle();
    if (!item) return galat("Video tidak ditemukan.", 404);

    // Pemilik baris, atau admin Studio. Saat admin sedang mengendalikan akun
    // anggota, `user` sudah menjadi anggota itu — jadi ia hanya bisa
    // mengunduh video anggota yang sedang dikendalikannya.
    const milikSendiri = Number(item.user_id ?? 0) === Number(user.id);
    if (!milikSendiri && !adalahAdminStudio(user)) {
      return galat("Video ini bukan milik Anda.", 403);
    }

    const sumber = String(item.render_url ?? "");
    if (String(item.render_status) !== "sukses" || !sumber) {
      return galat("Video ini belum selesai dirender.", 409);
    }
    // Tautan ini ditulis server kita sendiri dari jawaban Creatomate, tapi
    // pemeriksaan murah tetap dipasang supaya route ini tidak bisa dipakai
    // mengambil alamat internal seandainya isi kolomnya berubah.
    if (!/^https:\/\//i.test(sumber)) {
      return galat("Alamat berkas video tidak sah.", 502);
    }

    const hulu = await fetch(sumber, { cache: "no-store" });
    if (!hulu.ok || !hulu.body) {
      return galat(
        `Berkas video tidak dapat diambil dari penyimpanan (${hulu.status}).`,
        502,
      );
    }

    const nama = namaBerkas(
      String(item.judul ?? ""),
      String(item.profil ?? ""),
      String(item.id),
    );
    const panjang = hulu.headers.get("content-length");

    // Badan respons diteruskan apa adanya (stream), bukan dikumpulkan di
    // memori — berkas 50 MB tidak boleh menghabiskan memori fungsi.
    return new Response(hulu.body, {
      headers: {
        "Content-Type": hulu.headers.get("content-type") ?? "video/mp4",
        "Content-Disposition": `attachment; filename="${nama}"; filename*=UTF-8''${encodeURIComponent(nama)}`,
        ...(panjang ? { "Content-Length": panjang } : {}),
        "Cache-Control": "no-store",
        "X-Nama-Berkas": nama,
      },
    });
  } catch (e) {
    const status =
      typeof (e as { status?: unknown })?.status === "number"
        ? (e as { status: number }).status
        : 500;
    if (status >= 500) console.error("[video-saya/unduh]", e);
    return galat(
      e instanceof Error && status < 500
        ? e.message
        : "Gagal mengunduh video. Coba lagi sebentar lagi.",
      status,
    );
  }
}

// ============================================================
// PRI SuperApp — Pembantu bersama untuk semua API route
// Menyeragamkan penanganan error supaya pesan yang sampai ke
// layar selalu Bahasa Indonesia dan mudah dimengerti admin.
// ============================================================
import { NextResponse } from "next/server";
import { KonfigurasiError } from "@/lib/supabase";

/**
 * Bungkus isi handler API. Semua error diterjemahkan jadi respons
 * JSON { error } dengan status yang sesuai — bukan halaman error
 * Next.js yang tidak bisa dibaca pengguna non-teknis.
 */
export async function bungkus<T>(
  isi: () => Promise<T>,
): Promise<NextResponse> {
  try {
    return NextResponse.json(await isi());
  } catch (e) {
    if (e instanceof KonfigurasiError) {
      // 503 = layanan belum siap; membedakannya dari salah ketik URL
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    const pesan =
      e instanceof Error && e.message
        ? e.message
        : "Terjadi kesalahan tak terduga di server";

    // Error boleh membawa `status` sendiri (mis. 401 untuk login gagal,
    // 400 untuk masukan tidak valid) supaya UI menampilkan pesan yang
    // tepat, bukan selalu "server bermasalah".
    const status =
      typeof (e as { status?: unknown })?.status === "number"
        ? (e as { status: number }).status
        : 500;

    // Kesalahan pengguna (4xx) tidak perlu memenuhi log server.
    if (status >= 500) console.error("[API]", e);

    // Di produksi, detail error 5xx tidak boleh bocor ke klien —
    // pesan Error internal bisa memuat nama tabel, path, atau pesan
    // pustaka pihak ketiga. Detail aslinya sudah tercatat di
    // console.error di atas. Pesan 4xx tetap dikirim apa adanya
    // karena memang ditulis untuk pengguna.
    const pesanAman =
      status >= 500 && process.env.NODE_ENV === "production"
        ? "Terjadi kesalahan di server. Silakan coba beberapa saat lagi."
        : pesan;

    return NextResponse.json({ error: pesanAman }, { status });
  }
}

/**
 * Lempar error berbahasa Indonesia bila query Supabase gagal.
 * Pesan asli PostgREST (Inggris) tetap dicatat di log server.
 */
export function pastikanSukses<T>(
  hasil: { data: T | null; error: { message: string } | null },
  konteks: string,
): T {
  if (hasil.error) {
    console.error(`[Supabase] ${konteks}:`, hasil.error.message);
    throw new Error(`Gagal memuat ${konteks} dari database`);
  }
  return (hasil.data ?? []) as T;
}

// ============================================================
// REQUEST VIDEO TV Rakyat — sisi SERVER (5 Sep 2026).
// Pimred membuat request bahan video; anggota menekan "Kerjakan" → baris
// tvr_request_kerja status 'dikerjakan'. Begitu anggota MENGUNGGAH video
// (TVR Saya) atau MELAPORKAN link, pekerjaan itu otomatis 'selesai' dan
// pembuat request diberi kabar. Satu anggota hanya mengerjakan satu request
// pada satu waktu.
// ============================================================
import { supabase } from "@/lib/supabase";
import { kirimKabar } from "@/lib/notifikasi";

/** Request yang sedang dikerjakan seseorang (null bila tidak ada). */
export async function requestAktifSaya(uid: number): Promise<{ id: string; kerja_id: string; judul: string } | null> {
  const db = supabase();
  const { data: kerja } = await db
    .from("tvr_request_kerja")
    .select("id, request_id")
    .eq("user_id", uid)
    .eq("status", "dikerjakan")
    .order("diambil_pada", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!kerja) return null;
  const { data: req } = await db.from("tvr_request").select("id, judul, aktif").eq("id", Number(kerja.request_id)).maybeSingle();
  if (!req) return null;
  return { id: String(req.id), kerja_id: String(kerja.id), judul: String(req.judul) };
}

/**
 * Tandai request yang sedang dikerjakan `uid` sebagai SELESAI (dipanggil
 * otomatis setelah unggah video / laporan link). Tidak pernah melempar.
 */
export async function selesaikanRequest(uid: number, ref: { tvrku_post_id?: number; laporan_pending_id?: number }): Promise<boolean> {
  try {
    const db = supabase();
    const aktif = await requestAktifSaya(uid);
    if (!aktif) return false;
    const { error } = await db
      .from("tvr_request_kerja")
      .update({
        status: "selesai",
        selesai_pada: new Date().toISOString(),
        tvrku_post_id: ref.tvrku_post_id ?? null,
        laporan_pending_id: ref.laporan_pending_id ?? null,
      })
      .eq("id", Number(aktif.kerja_id))
      .eq("status", "dikerjakan");
    if (error) return false;
    const [{ data: req }, { data: orang }] = await Promise.all([
      db.from("tvr_request").select("dibuat_oleh").eq("id", Number(aktif.id)).maybeSingle(),
      db.from("app_user").select("nama").eq("id", uid).maybeSingle(),
    ]);
    if (req?.dibuat_oleh) {
      await kirimKabar({
        judul: "✅ Request video dikerjakan",
        isi: `${orang?.nama ?? "Anggota"} sudah ${ref.tvrku_post_id ? "mengunggah video" : "melaporkan link video"} untuk request "${aktif.judul}".`,
        kategori: "sukses",
        jenis_peristiwa: "tvr_request",
        target: "tv",
        untukUserIds: [Number(req.dibuat_oleh)],
      });
    }
    return true;
  } catch (e) {
    console.error("[tvr-request] selesaikan:", e instanceof Error ? e.message : e);
    return false;
  }
}

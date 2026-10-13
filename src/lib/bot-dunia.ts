// ============================================================
// BOT REDAKSI — pemuat data "dunia" Ruang Bot (13 Okt 2026). Sisi server.
//
// Satu fungsi: muatDunia(). Dipanggil ambilStatusBot() supaya GET /api/bot/status
// membawa siapa yang punya API key, tugas berjalan tiap bot, ringkasan koordinator
// (Nara), dan waktu pesan Chat terakhir. Tabel yang belum ada (migrasi 69/73/74
// belum jalan) = keadaan kosong, tidak pernah melempar karena hal itu.
// Kunci API TIDAK dikembalikan: hanya ada/tidaknya baris atau kolom.
// ============================================================

import { supabase } from "@/lib/supabase";
import { tabelBelumAda } from "@/lib/api-helper";
import type { KoordinatorRingkas, TugasAktifBot } from "@/lib/bot-tipe";
import { adalahPenyedia } from "@/lib/bot-otak-murni";
import { TAHAP_KERJA_DUNIA, rakitDiputus, tugasAktifPerBot } from "@/lib/bot-dunia-murni";

export type DataDunia = {
  /** bot_redaksi.id yang punya baris bot_otak. */
  punyaOtak: Set<number>;
  tugas: Map<number, TugasAktifBot>;
  koordinator: KoordinatorRingkas | null;
  chatTerakhir: string | null;
};

const skemaBelumSiap = (e: { code?: string } | null | undefined) => tabelBelumAda(e) || e?.code === "42703" || e?.code === "PGRST204";

function catatGalat(konteks: string, e: { message?: string }): void {
  console.error(`[bot-dunia] ${konteks}:`, e.message ?? "");
}

export async function muatDunia(): Promise<DataDunia> {
  const db = supabase();
  const sejak24Jam = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [rOtak, rTugas, rChat, rKoor, rTerbuka, rDiputus] = await Promise.all([
    db.from("bot_otak").select("bot_id"),
    db.from("bot_tugas").select("id, bot_id, tahap, judul").in("tahap", [...TAHAP_KERJA_DUNIA]).order("id", { ascending: false }).limit(200),
    db.from("bot_chat").select("dibuat_pada").order("id", { ascending: false }).limit(1),
    db.from("bot_koordinator").select("nama, peran, penyedia, kunci_sandi").eq("id", 1).maybeSingle(),
    db.from("bot_usulan").select("id", { count: "exact", head: true }).eq("status", "menunggu"),
    db.from("bot_usulan").select("id, bot_id, judul, diputus_pada").in("status", ["disetujui", "dijalankan"]).gte("diputus_pada", sejak24Jam).order("diputus_pada", { ascending: false }).limit(12),
  ]);

  // Siapa tidur / duduk di meja tergantung dua bacaan ini: galat sesaat TIDAK boleh dibaca "tidak ada key / tugas"
  // (semua bot tiba-tiba ke kamar tidur lalu kembali). Lempar supaya klien mempertahankan data terakhir.
  // Tabel belum ada (migrasi belum jalan) = kosong yang sah.
  if (rOtak.error && !skemaBelumSiap(rOtak.error)) {
    catatGalat("baca otak", rOtak.error);
    throw new Error("Gagal memuat API key bot.");
  }
  if (rTugas.error && !skemaBelumSiap(rTugas.error)) {
    catatGalat("baca tugas", rTugas.error);
    throw new Error("Gagal memuat tugas bot.");
  }
  // Sisanya hiasan: gagal membaca tidak boleh menjatuhkan seluruh layar.
  if (rChat.error && !skemaBelumSiap(rChat.error)) catatGalat("baca chat", rChat.error);
  if (rKoor.error && !skemaBelumSiap(rKoor.error)) catatGalat("baca koordinator", rKoor.error);
  if (rTerbuka.error && !skemaBelumSiap(rTerbuka.error)) catatGalat("hitung usulan", rTerbuka.error);
  if (rDiputus.error && !skemaBelumSiap(rDiputus.error)) catatGalat("baca usulan disetujui", rDiputus.error);

  const punyaOtak = new Set(((rOtak.error ? [] : rOtak.data) ?? []).map((o) => Number((o as { bot_id: number }).bot_id)));
  const tugas = tugasAktifPerBot(
    ((rTugas.error ? [] : rTugas.data) ?? []) as unknown as { id: number; bot_id: number; tahap: string; judul: string | null }[],
  );
  const chatBaris = ((rChat.error ? [] : rChat.data) ?? []) as unknown as { dibuat_pada: string }[];
  const chatTerakhir = chatBaris[0]?.dibuat_pada ?? null;

  let koordinator: KoordinatorRingkas | null = null;
  const k = rKoor.error ? null : ((rKoor.data ?? null) as unknown as { nama: string; peran: string; penyedia: string | null; kunci_sandi: string | null } | null);
  if (k) {
    koordinator = {
      nama: String(k.nama ?? "Nara"),
      peran: String(k.peran ?? "Koordinator Redaksi"),
      punya_otak: adalahPenyedia(k.penyedia) && Boolean(k.kunci_sandi),
      usulan_terbuka: rTerbuka.error ? 0 : (rTerbuka.count ?? 0),
      diputus: rDiputus.error
        ? []
        : rakitDiputus((rDiputus.data ?? []) as unknown as { id: number; bot_id: number; judul: string | null; diputus_pada: string | null }[]),
    };
  }

  return { punyaOtak, tugas, koordinator, chatTerakhir };
}

// ============================================================
// KIRIM LAPORAN VIDEO ke WhatsApp — sisi SERVER (5 Sep 2026).
//
// Dua kanal, dipilih otomatis dari pengaturan master (Panel Master):
//   1. GRUP WhatsApp lewat gateway Fonnte (env FONNTE_TOKEN + kunci
//      pengaturan `wa_grup_laporan` = ID grup, mis. 1203...@g.us).
//      Catatan penting: WhatsApp Business API RESMI (Convia) TIDAK bisa
//      mengirim ke grup — hanya gateway tidak resmi seperti Fonnte yang bisa.
//   2. NOMOR pribadi lewat Convia (kunci `wa_nomor_laporan`) — pesan teks
//      bebas hanya sampai bila nomor itu pernah chat ke bot dalam 24 jam
//      (aturan WABA); cocok sebagai cadangan/uji.
// Jejak kiriman disimpan di laporan_kirim_wa (batas 2×/hari WIB, jeda 1 jam).
// ============================================================
import { supabase } from "@/lib/supabase";
import { conviaSiap, kirimWa as kirimWaConvia } from "@/lib/convia";

export const KUNCI_GRUP = "wa_grup_laporan";
export const KUNCI_NOMOR = "wa_nomor_laporan";
export const BATAS_PER_HARI = 2;
export const JEDA_MENIT = 60;

export type KonfigWaLaporan = { grup: string; nomor: string; kanal: "fonnte_grup" | "convia_nomor" | "belum" };

export async function bacaKonfigWaLaporan(): Promise<KonfigWaLaporan> {
  let grup = "";
  let nomor = "";
  try {
    const { data } = await supabase().from("pengaturan_sistem").select("kunci, nilai").in("kunci", [KUNCI_GRUP, KUNCI_NOMOR]);
    for (const b of data ?? []) {
      if (b.kunci === KUNCI_GRUP) grup = String(b.nilai ?? "").trim();
      if (b.kunci === KUNCI_NOMOR) nomor = String(b.nilai ?? "").trim();
    }
  } catch {
    // tanpa pengaturan → belum
  }
  const kanal: KonfigWaLaporan["kanal"] = grup && process.env.FONNTE_TOKEN ? "fonnte_grup" : nomor && conviaSiap() ? "convia_nomor" : "belum";
  return { grup, nomor, kanal };
}

/** Kirim ke grup lewat Fonnte (target apa adanya: ID grup / nomor). */
async function kirimFonnteMentah(target: string, pesan: string): Promise<void> {
  const token = process.env.FONNTE_TOKEN;
  if (!token) throw new Error("FONNTE_TOKEN belum diatur.");
  const res = await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({ target, message: pesan }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await res.json().catch(() => ({}))) as { status?: boolean; reason?: string; detail?: string };
  if (!res.ok || j.status === false) throw new Error(`Gateway WhatsApp menolak: ${j.reason ?? j.detail ?? res.status}`);
}

/** Kirim teks laporan; mengembalikan kanal & tujuan yang dipakai. */
export async function kirimLaporanWa(teks: string): Promise<{ kanal: string; tujuan: string }> {
  const k = await bacaKonfigWaLaporan();
  if (k.kanal === "fonnte_grup") {
    await kirimFonnteMentah(k.grup, teks);
    return { kanal: "fonnte_grup", tujuan: k.grup };
  }
  if (k.kanal === "convia_nomor") {
    await kirimWaConvia(k.nomor, teks);
    return { kanal: "convia_nomor", tujuan: k.nomor };
  }
  throw Object.assign(new Error("Pengiriman laporan ke WhatsApp belum diatur master (ID grup Fonnte atau nomor Convia di Panel Master)."), { status: 503 });
}

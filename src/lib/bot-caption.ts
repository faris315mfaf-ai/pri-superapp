// Caption posting dari otak bot (13 Okt 2026) — KHUSUS SISI SERVER.
// Dipanggil setelah video bot selesai dirender (tugas `siap_ditinjau`): bila bot punya API key,
// caption ditulis dengan kunci itu dan DISIMPAN di bot_tugas.caption_post (hanya bila masih kosong,
// supaya sunting master tidak tertimpa). Gagal/tanpa kunci = tidak melakukan apa-apa; Antrean ACC
// memakai caption bawaan (judul + kredit) seperti sebelumnya. Tidak pernah melempar.
import { supabase } from "@/lib/supabase";
import { tanyaOtakBot, botPunyaOtak, GalatOtak } from "@/lib/bot-otak";
import { sumberUntukTugas } from "@/lib/bot-kerja";
import { analisaAsal, labelKreditTakarir } from "@/lib/bot-asal";
import { platformEfektif } from "@/lib/bot-platform";
import { SISTEM_CAPTION, bangunPromptCaption, rapikanCaption } from "@/lib/bot-caption-murni";

export async function tulisCaptionOtak(botId: number, tugasId: number): Promise<"ditulis" | "dilewati" | "gagal"> {
  try {
    if (!(await botPunyaOtak(botId))) return "dilewati";
    const db = supabase();
    const { data: tugas } = await db.from("bot_tugas").select("id, bot_id, kandidat_id, judul, hook, caption, caption_post, tahap").eq("id", tugasId).eq("bot_id", botId).maybeSingle();
    if (!tugas || tugas.tahap !== "siap_ditinjau" || String(tugas.caption_post ?? "").trim() !== "") return "dilewati";
    const { data: bot } = await db.from("bot_redaksi").select("user_id, platform").eq("id", botId).maybeSingle();
    if (!bot) return "dilewati";
    const platform = await platformEfektif(db, bot as { user_id: number; platform: string | null });
    if (!platform) return "dilewati";

    const sumber = await sumberUntukTugas(Number(tugas.id), tugas.kandidat_id == null ? null : Number(tugas.kandidat_id));
    let kredit = sumber?.label ?? "";
    let bahan = String(tugas.caption ?? "");
    if (tugas.kandidat_id != null) {
      const { data: k } = await db.from("bot_kandidat").select("url, judul, caption, sumber_id").eq("id", tugas.kandidat_id).maybeSingle();
      if (k) {
        bahan = `${k.caption ?? ""}`.trim() || `${k.judul ?? ""}`;
        const { data: s } = k.sumber_id != null ? await db.from("bot_sumber").select("platform, handle").eq("id", k.sumber_id).maybeSingle() : { data: null };
        const asal = analisaAsal({ judul: k.judul, caption: k.caption, sumberHandle: s?.handle, sumberPlatform: s?.platform, urlSendiri: k.url });
        kredit = labelKreditTakarir(asal, sumber?.label ?? "");
      }
    }
    const jawab = await tanyaOtakBot(botId, Number(bot.user_id), {
      sistem: SISTEM_CAPTION,
      pengguna: bangunPromptCaption({ judul: String(tugas.judul ?? ""), hook: String(tugas.hook ?? ""), bahan, kredit, platform }),
      json: true,
      fitur: "caption",
      maksToken: 500,
      batasMs: 25_000,
    });
    const caption = rapikanCaption(jawab, { kredit, platform });
    if (!caption) return "gagal";
    // Hanya mengisi bila masih kosong DAN tugas masih menunggu (jangan menimpa sunting master / keputusan).
    const { data: terisi } = await db.from("bot_tugas").update({ caption_post: caption }).eq("id", tugasId).eq("caption_post", "").eq("tahap", "siap_ditinjau").select("id");
    return (terisi ?? []).length > 0 ? "ditulis" : "dilewati";
  } catch (e) {
    console.warn(`[bot-caption] bot ${botId} tugas ${tugasId} dilewati:`, e instanceof GalatOtak ? e.kode : e instanceof Error ? e.message : "galat");
    return "gagal";
  }
}

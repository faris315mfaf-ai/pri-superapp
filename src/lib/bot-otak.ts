// "Otak" per bot (13 Okt 2026) — KHUSUS SISI SERVER.
//
// Memanggil LLM dengan API key MILIK BOT itu (tabel bot_otak, sandi AES-GCM —
// lib/bot-rahasia). Kunci hanya didekripsi di sini, sesaat sebelum panggilan,
// dan TIDAK PERNAH dikirim ke runner, ke peramban, atau ke log/pesan galat.
//
//  tanyaOtakBot(botId, ...)   → teks jawaban; melempar GalatOtak (kode jelas)
//  hookDariOtakBot(botId, n)  → hook "KICKER! isi" atau null (bot tanpa kunci / panggilan gagal)
//
// Pemakaian token dicatat ke ai_pemakaian (fitur "bot:<fitur>", user = akun bot).
import { supabase } from "@/lib/supabase";
import { tabelBelumAda } from "@/lib/api-helper";
import { catatPemakaianAi } from "@/lib/ai-pemakaian";
import { dekripsiKunci } from "@/lib/bot-rahasia";
import { dariJawaban, gabung, PROMPT_HOOK } from "@/mesin-video/hook";
import {
  PESAN_GALAT_OTAK,
  adalahPenyedia,
  kodeDariStatusHttp,
  sistemDenganKepribadian,
  type KepribadianBot,
  type KodeGalatOtak,
  type PenyediaOtak,
} from "@/lib/bot-otak-murni";

export class GalatOtak extends Error {
  constructor(public kode: KodeGalatOtak) {
    super(PESAN_GALAT_OTAK[kode]);
  }
}

const MODEL_DEEPSEEK = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const MODEL_GEMINI = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const BASE_DEEPSEEK = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1").replace(/\/+$/, "");

/** Peran + watak bot dari bot_redaksi; null bila tak terbaca (jawaban tetap jalan tanpa kepribadian). */
export async function muatKepribadian(botId: number): Promise<KepribadianBot | null> {
  const { data, error } = await supabase().from("bot_redaksi").select("nama, peran, persona").eq("id", botId).maybeSingle();
  if (error || !data) return null;
  return { nama: String(data.nama ?? ""), peran: String(data.peran ?? ""), persona: String(data.persona ?? "") };
}

export type PermintaanOtak = {
  sistem: string;
  pengguna: string;
  /** Minta jawaban JSON. */
  json?: boolean;
  /** Label pemakaian, mis. "hook" → fitur "bot:hook". */
  fitur: string;
  maksToken?: number;
  batasMs?: number;
};

type BarisOtak = { penyedia: PenyediaOtak; kunci_sandi: string };

async function bacaBaris(botId: number): Promise<BarisOtak | null> {
  const { data, error } = await supabase().from("bot_otak").select("penyedia, kunci_sandi").eq("bot_id", botId).maybeSingle();
  if (error) {
    if (!tabelBelumAda(error)) console.error("[bot-otak] baca kunci:", error.message);
    return null;
  }
  if (!data || !adalahPenyedia(data.penyedia)) return null;
  return { penyedia: data.penyedia, kunci_sandi: String(data.kunci_sandi ?? "") };
}

/** Ada kunci tersimpan untuk bot ini? (tanpa mendekripsi) */
export async function botPunyaOtak(botId: number): Promise<boolean> {
  return (await bacaBaris(botId)) !== null;
}

export async function panggilPenyedia(
  penyedia: PenyediaOtak,
  kunci: string,
  p: PermintaanOtak,
): Promise<{ teks: string; masuk: number; keluar: number; model: string }> {
  const batas = AbortSignal.timeout(p.batasMs ?? 30_000);
  const maks = p.maksToken ?? 400;
  let res: Response;
  try {
    if (penyedia === "deepseek") {
      res = await fetch(`${BASE_DEEPSEEK}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${kunci}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL_DEEPSEEK,
          messages: [
            { role: "system", content: p.sistem },
            { role: "user", content: p.pengguna },
          ],
          temperature: 0.7,
          max_tokens: maks,
          ...(p.json ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: batas,
        cache: "no-store",
      });
    } else {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_GEMINI}:generateContent`, {
        method: "POST",
        // Kunci lewat header, bukan query, supaya tidak muncul di log URL.
        headers: { "x-goog-api-key": kunci, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: p.sistem }] },
          contents: [{ role: "user", parts: [{ text: p.pengguna }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: maks, ...(p.json ? { responseMimeType: "application/json" } : {}) },
        }),
        signal: batas,
        cache: "no-store",
      });
    }
  } catch (e) {
    const nama = e instanceof Error ? e.name : "";
    throw new GalatOtak(nama === "TimeoutError" || nama === "AbortError" ? "waktu_habis" : "gagal");
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new GalatOtak(kodeDariStatusHttp(res.status));
  }
  let j: unknown;
  try {
    j = await res.json();
  } catch {
    throw new GalatOtak("gagal");
  }
  if (penyedia === "deepseek") {
    const d = j as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    return {
      teks: String(d.choices?.[0]?.message?.content ?? ""),
      masuk: Number(d.usage?.prompt_tokens ?? 0),
      keluar: Number(d.usage?.completion_tokens ?? 0),
      model: MODEL_DEEPSEEK,
    };
  }
  const g = j as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
  return {
    teks: (g.candidates?.[0]?.content?.parts ?? []).map((x) => x.text ?? "").join(""),
    masuk: Number(g.usageMetadata?.promptTokenCount ?? 0),
    keluar: Number(g.usageMetadata?.candidatesTokenCount ?? 0),
    model: MODEL_GEMINI,
  };
}

/** Tanya LLM dengan kunci milik bot. `userIdBot` = app_user.id akun bot (untuk catatan pemakaian). */
export async function tanyaOtakBot(botId: number, userIdBot: number, p: PermintaanOtak): Promise<string> {
  const baris = await bacaBaris(botId);
  if (!baris) throw new GalatOtak("tanpa_kunci");
  const kunci = dekripsiKunci(baris.kunci_sandi, botId);
  if (!kunci) throw new GalatOtak("kunci_rusak");
  // Kepribadian bot (peran + watak) ikut memengaruhi GAYA jawaban; aturan di prompt aslinya tetap menang.
  const sistem = sistemDenganKepribadian(p.sistem, await muatKepribadian(botId));
  const r = await panggilPenyedia(baris.penyedia, kunci, { ...p, sistem });
  catatPemakaianAi({
    penyedia: baris.penyedia,
    model: r.model,
    fitur: `bot:${p.fitur}`,
    userId: userIdBot,
    tokenMasuk: r.masuk,
    tokenKeluar: r.keluar,
  });
  return r.teks;
}

/**
 * Hook lower-third dari otak bot, atau null bila bot tidak punya kunci / panggilan
 * gagal / jawaban tak masuk akal (pemanggil lalu memakai jalur bawaan mesin).
 * Tidak pernah melempar; galat hanya masuk log (tanpa kunci).
 */
export async function hookDariOtakBot(botId: number, userIdBot: number, naskah: string): Promise<string | null> {
  const teks = String(naskah ?? "").replace(/\s+/g, " ").trim();
  if (teks.length < 3) return null;
  try {
    if (!(await botPunyaOtak(botId))) return null;
    const jawab = await tanyaOtakBot(botId, userIdBot, {
      sistem: "Kamu redaktur grafis berita televisi Indonesia. Balas hanya JSON valid, tanpa penjelasan tambahan.",
      pengguna: PROMPT_HOOK + teks.slice(0, 4000),
      json: true,
      fitur: "hook",
      maksToken: 300,
      batasMs: 20_000,
    });
    const hasil = dariJawaban(jawab);
    return hasil ? gabung(hasil[0], hasil[1]) : null;
  } catch (e) {
    console.warn(`[bot-otak] hook bot ${botId} dilewati:`, e instanceof GalatOtak ? e.kode : "galat tak terduga");
    return null;
  }
}

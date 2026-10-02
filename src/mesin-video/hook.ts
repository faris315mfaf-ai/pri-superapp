// Hook otomatis: caption → satu paragraf berita "KICKER! ISI" (cermin
// video_hook.py). DeepSeek dulu; kalau mati/tanpa kunci/balasan tak masuk
// akal, dipakai kalimat awal caption dengan kicker bawaan — tidak pernah
// gagal total selama naskahnya tidak kosong.

export const NAMA_LAYER = "hook";
const angka = Number.parseInt(process.env.VIDEO_HOOK_MAX_CHARS ?? "", 10);
export const MAX_KARAKTER_ISI = Number.isFinite(angka) ? angka : 100;
export const MAX_KARAKTER_KICKER = 12;
export const KICKER_BAWAAN = "VIRAL";

const PROMPT =
  "Anda adalah redaktur grafis berita televisi Indonesia. " +
  "Baca caption video berikut, lalu tulis teks lower-third berita seperti " +
  "kanal berita televisi: singkat, tegas, informatif, mudah dipindai. " +
  "Jangan menyalin caption mentah-mentah dan jangan membuat opini atau " +
  "fakta baru. " +
  "Balas hanya JSON valid dengan dua field string: " +
  '"kicker" berisi SATU kata pembuka yang menarik perhatian ' +
  "(contoh: VIRAL, HEBOH, MIRIS, TERUNGKAP, WASPADA, GEGER, HARU), tanpa " +
  'tanda seru; dan "body" berisi isi beritanya dalam satu kalimat ' +
  `padat maksimal ${MAX_KARAKTER_ISI} karakter. Semua huruf kapital, ` +
  "tanpa label, tanpa markdown, tanpa nomor, tanpa tanda kutip." +
  "\n\nCAPTION:\n";

// Model sering tetap menempelkan label di awal walau sudah dilarang.
const LABEL_AWALAN_RE =
  /^(HEADLINE|KETERANGAN|DAMPAK|PESAN|UTAMA|FAKTUAL|RINGKASAN|TIPS|KICKER|BODY|ISI)\s*[:\-*]*\s*/i;
const SAMPAH_AWAL_RE = /^[\s\-*\d.]+/;
const TANDA_AKHIR_RE = /[\s.!?]+$/;

function bersihkan(teks: string): string {
  let t = (teks || "").replaceAll("**", "").replaceAll('"', "").replaceAll("“", "").replaceAll("”", "");
  t = t.replace(SAMPAH_AWAL_RE, "");
  t = t.replace(LABEL_AWALAN_RE, "");
  t = t.replace(/\s+/g, " ").trim();
  return t.replace(TANDA_AKHIR_RE, "").toUpperCase();
}

/** Potong di batas karakter, mundur ke spasi terakhir supaya kata utuh. */
function potongDiKata(teks: string, batas: number): string {
  if (teks.length <= batas) return teks;
  let potong = teks.slice(0, batas);
  if (potong.includes(" ")) potong = potong.slice(0, potong.lastIndexOf(" "));
  return potong.replace(/[ ,;:-]+$/, "");
}

export function rapikanKicker(teks: string): string {
  const kata = bersihkan(teks).split(/\s+/).filter(Boolean);
  if (!kata.length) return "";
  return kata[0].replace(/[^A-Z0-9]/g, "").slice(0, MAX_KARAKTER_KICKER);
}

export function rapikanIsi(teks: string): string {
  return potongDiKata(bersihkan(teks), MAX_KARAKTER_ISI);
}

export function gabung(kicker: string, isi: string): string {
  return `${kicker || KICKER_BAWAAN}! ${isi}`.trim();
}

/** Cadangan tanpa AI: kicker bawaan + kalimat-kalimat awal caption. */
export function dariNaskah(naskah: string): [string, string] {
  const kalimat = String(naskah ?? "")
    .split(/[.!?\n]/)
    .map((k) => k.trim())
    .filter(Boolean);
  let isi = "";
  for (const k of kalimat) {
    const calon = `${isi} ${k}`.trim();
    if (calon.length > MAX_KARAKTER_ISI && isi) break;
    isi = calon;
  }
  isi = isi.replace(/[^A-Za-z0-9 ,]/g, " ");
  return [KICKER_BAWAAN, rapikanIsi(isi)];
}

export function dariJawaban(mentah: string): [string, string] | null {
  if (!mentah) return null;
  let data: unknown = null;
  try {
    data = JSON.parse(mentah);
  } catch {
    const cocok = /\{[\s\S]*\}/.exec(mentah);
    if (cocok) {
      try {
        data = JSON.parse(cocok[0]);
      } catch {
        data = null;
      }
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const kicker = rapikanKicker(String(d.kicker ?? ""));
  const isi = rapikanIsi(String(d.body ?? ""));
  if (!isi) return null;
  return [kicker || KICKER_BAWAAN, isi];
}

export async function buatHookDeepseek(naskah: string, apiKey?: string): Promise<[string, string] | null> {
  const teks = String(naskah ?? "").replace(/\s+/g, " ").trim();
  if (teks.length < 3) return null;
  const kunci = (apiKey || process.env.DEEPSEEK_API_KEY || "").trim();
  if (!kunci) return null;
  const dasar = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1").replace(/\/+$/, "");
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  try {
    const res = await fetch(`${dasar}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${kunci}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "Kamu redaktur grafis berita televisi Indonesia. Balas hanya JSON valid, tanpa penjelasan tambahan.",
          },
          { role: "user", content: PROMPT + teks },
        ],
        temperature: 0.7,
        max_tokens: 300,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status !== 200) {
      console.warn("DeepSeek menolak permintaan hook:", res.status);
      return null;
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return dariJawaban(String(json.choices?.[0]?.message?.content ?? ""));
  } catch (e) {
    console.warn("Gagal membuat hook lewat DeepSeek:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function buatHook(naskah: string): Promise<{
  kicker: string;
  body: string;
  hook: string;
  source: "deepseek" | "cadangan";
  texts: Record<string, string>;
}> {
  let hasil = await buatHookDeepseek(naskah);
  let source: "deepseek" | "cadangan" = "deepseek";
  if (!hasil) {
    hasil = dariNaskah(naskah);
    source = "cadangan";
  }
  const [kicker, isi] = hasil;
  const teks = isi ? gabung(kicker, isi) : "";
  return { kicker: isi ? kicker : "", body: isi, hook: teks, source, texts: teks ? { [NAMA_LAYER]: teks } : {} };
}

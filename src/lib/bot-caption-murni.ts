// Caption posting dari otak bot (13 Okt 2026) — bagian MURNI: prompt dan perapian jawaban.
// Tanpa jaringan; teruji. Otak hanya MENULIS ULANG bahan yang diberikan; kredit sumber selalu
// ditempel oleh kode ini (bukan oleh model) supaya tidak bisa hilang atau dipalsukan.
import { batasCaption, LABEL_PLATFORM } from "@/lib/bot-posting-murni";

export const MAKS_BAHAN = 700;
export const MIN_ISI_CAPTION = 15;
export const MAKS_TAGAR = 3;

export type BahanCaption = {
  judul: string;
  /** Hook di video ("KICKER! isi"), boleh kosong. */
  hook: string;
  /** Takarir/naskah sumber (bahan fakta). */
  bahan: string;
  /** Label kredit yang WAJIB muncul, mis. "@warga (TikTok) via NTV". */
  kredit: string;
  /** Kunci platform ("instagram"). */
  platform: string;
};

export const SISTEM_CAPTION =
  "Kamu redaktur media sosial TV Rakyat (berita partai di Indonesia). Tulis caption dalam Bahasa Indonesia yang wajar, jelas, dan menarik. " +
  "ATURAN: pakai HANYA fakta dari BAHAN; jangan menambah nama, angka, tuduhan, atau klaim baru; jangan menyalin mentah; tanpa tautan; " +
  "tanpa menulis baris 'Sumber' (itu ditambahkan sistem). Balas hanya JSON valid.";

/** Pesan pengguna untuk model: bahan + batas panjang + format keluaran. */
export function bangunPromptCaption(b: BahanCaption): string {
  const batas = batasCaption(b.platform);
  const ruang = Math.max(80, batas - (`\n\nSumber: ${b.kredit}`.length + 8));
  const potong = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);
  return [
    `PLATFORM: ${LABEL_PLATFORM[b.platform] ?? b.platform}`,
    `BATAS ISI CAPTION: ${ruang} karakter (termasuk tagar)`,
    `JUDUL: ${potong(b.judul, 200)}`,
    b.hook.trim() ? `TEKS DI VIDEO: ${potong(b.hook, 200)}` : "",
    `BAHAN: ${potong(b.bahan, MAKS_BAHAN)}`,
    "",
    `Tulis 2-4 kalimat caption yang ringkas dan menarik, lalu paling banyak ${MAKS_TAGAR} tagar yang relevan di baris terakhir.`,
    'Balas JSON: {"caption":"..."}',
  ]
    .filter((x) => x !== "")
    .join("\n");
}

function bersihkanKonten(teks: string): string {
  return teks
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\*\*|__|```|`/g, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/^\s*(sumber|source|credit|kredit|cr)\s*[:：].*$/gim, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Batasi tagar ke MAKS_TAGAR pertama (sisanya dibuang), tanpa merusak kata biasa. */
function batasiTagar(teks: string): string {
  let n = 0;
  return teks
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, (m) => (++n <= MAKS_TAGAR ? m : ""))
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/**
 * Jawaban model (JSON) → caption siap pakai, atau null bila tak layak.
 * Kredit ditempel di akhir; isi dipotong (dengan "…") bila melewati batas platform.
 */
export function rapikanCaption(jawaban: string, p: { kredit: string; platform: string }): string | null {
  let data: unknown = null;
  try {
    data = JSON.parse(jawaban);
  } catch {
    const m = /\{[\s\S]*\}/.exec(jawaban);
    if (m) {
      try {
        data = JSON.parse(m[0]);
      } catch {
        data = null;
      }
    }
  }
  const mentah = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>).caption : null;
  if (typeof mentah !== "string") return null;
  const isi = batasiTagar(bersihkanKonten(mentah));
  if (isi.replace(/#[\p{L}\p{N}_]+/gu, "").trim().length < MIN_ISI_CAPTION) return null;
  const kredit = `\n\nSumber: ${p.kredit.trim() || "tidak disebutkan"}`;
  const batas = batasCaption(p.platform);
  const ruang = batas - kredit.length;
  if (ruang < MIN_ISI_CAPTION) return null;
  const badan = isi.length <= ruang ? isi : `${isi.slice(0, Math.max(0, ruang - 1)).trimEnd()}…`;
  return `${badan}${kredit}`;
}

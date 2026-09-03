// ============================================================
// DeepSeek (3 Sep 2026) — pembangkit teks untuk Studio PALUGODAM:
// judul per profil, kata highlight, dan variasi caption.
// KHUSUS SISI SERVER. Kunci di env DEEPSEEK_API_KEY — jangan hardcode.
//
// API DeepSeek kompatibel OpenAI:
//   POST https://api.deepseek.com/chat/completions
//   { model: "deepseek-chat", messages, response_format: {type:"json_object"} }
// Semua jawaban diminta JSON supaya bisa diurai tanpa tebak-tebakan.
// ============================================================

import { catatPemakaianAi } from "@/lib/ai-pemakaian";

const BASE = "https://api.deepseek.com";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

export function deepseekSiap(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

async function tanyaJson<T>(system: string, user: string, timeoutMs = 60_000, fitur = "studio"): Promise<T> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DeepSeek belum diatur (DEEPSEEK_API_KEY kosong).");
  const kendali = new AbortController();
  const timer = setTimeout(() => kendali.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        temperature: 1.3,
        max_tokens: 2000,
      }),
      signal: kendali.signal,
      cache: "no-store",
    });
    const teks = await res.text();
    if (!res.ok) {
      let pesan = `DeepSeek menolak (${res.status})`;
      try {
        const j = JSON.parse(teks) as { error?: { message?: string } };
        if (j.error?.message) pesan = `DeepSeek: ${j.error.message}`;
      } catch {
        // biarkan pesan bawaan
      }
      throw Object.assign(new Error(pesan), { status: 502 });
    }
    const j = JSON.parse(teks) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    // Catat pemakaian token (Panel Master → Pemakaian Server & Token AI).
    catatPemakaianAi({
      penyedia: "deepseek",
      model: MODEL,
      fitur,
      tokenMasuk: Number(j.usage?.prompt_tokens ?? 0),
      tokenKeluar: Number(j.usage?.completion_tokens ?? 0),
    });
    const isi = j.choices?.[0]?.message?.content ?? "";
    return JSON.parse(isi) as T;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("DeepSeek tidak menjawab tepat waktu.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const SISTEM =
  "Kamu penulis naskah media sosial TV Rakyat (media berita partai di Indonesia). " +
  "Tulis dalam Bahasa Indonesia yang wajar, jelas, dan menarik, TANPA mengubah fakta dari bahan. " +
  "Selalu jawab HANYA dengan JSON valid sesuai format yang diminta.";

function bersihkanDaftar(v: unknown, n: number, maks: number): string[] {
  const arr = Array.isArray(v) ? v : [];
  const hasil = arr
    .map((x) => String(x ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((x) => x.slice(0, maks));
  // Pastikan jumlahnya pas: kurang → ulangi dari awal; lebih → potong.
  const keluar: string[] = [];
  for (let i = 0; i < n && hasil.length > 0; i++) keluar.push(hasil[i % hasil.length]);
  return keluar;
}

/** n judul BERBEDA (maks 60 karakter) dari caption asli + penjelasan. */
export async function generateJudul(bahan: {
  caption: string;
  penjelasan: string;
  n: number;
}): Promise<string[]> {
  const n = Math.min(Math.max(bahan.n, 1), 30);
  const j = await tanyaJson<{ judul?: unknown }>(
    SISTEM,
    `Buat ${n} JUDUL video pendek untuk overlay video berita, masing-masing maksimal 60 karakter, ` +
      `SEMUA BERBEDA sudut pandang dan pilihan kata (bukan sekadar sinonim), tanpa nomor urut, tanpa tanda kutip, ` +
      `gaya headline TV yang memancing rasa ingin tahu tapi tetap faktual.\n` +
      `Bahan:\nCaption asli: ${bahan.caption || "-"}\nPenjelasan: ${bahan.penjelasan || "-"}\n` +
      `Format jawaban: {"judul": ["...", "..."]}`,
    60_000,
    "studio-judul",
  );
  const hasil = bersihkanDaftar(j.judul, n, 60);
  if (hasil.length === 0) throw new Error("DeepSeek tidak menghasilkan judul.");
  return hasil;
}

/** n kata/frasa highlight (1–3 kata, huruf kapital) yang memancing emosi. */
export async function generateHighlight(bahan: { caption: string; penjelasan: string; n: number }): Promise<string[]> {
  const n = Math.min(Math.max(bahan.n, 1), 30);
  const j = await tanyaJson<{ highlight?: unknown }>(
    SISTEM,
    `Buat ${n} kata atau frasa HIGHLIGHT (1–3 kata, HURUF KAPITAL SEMUA) untuk ditempel di video, ` +
      `yang memancing emosi penonton dan cocok dengan isinya — contoh gaya: VIRAL, BOMBASTIS, WOW, HARU, MENGEJUTKAN, ` +
      `TEGAS, GEGER, BANGGA, WASPADA. Semua berbeda, jangan mengulang contoh mentah-mentah bila tidak cocok.\n` +
      `Bahan:\nCaption asli: ${bahan.caption || "-"}\nPenjelasan: ${bahan.penjelasan || "-"}\n` +
      `Format jawaban: {"highlight": ["...", "..."]}`,
    60_000,
    "studio-highlight",
  );
  const hasil = bersihkanDaftar(j.highlight, n, 24).map((x) => x.toUpperCase());
  if (hasil.length === 0) throw new Error("DeepSeek tidak menghasilkan highlight.");
  return hasil;
}

/** n variasi caption sosmed dari caption inti (fakta tetap, susunan beda). */
export async function generateCaption(bahan: { captionInti: string; n: number }): Promise<string[]> {
  const n = Math.min(Math.max(bahan.n, 1), 30);
  const j = await tanyaJson<{ caption?: unknown }>(
    SISTEM,
    `Tulis ${n} VARIASI caption media sosial dari caption inti berikut. Tiap variasi harus berbeda ` +
      `pembuka, susunan kalimat, dan pilihan kata; panjang 1–3 kalimat; boleh 1–2 emoji; akhiri dengan 2–4 tagar ` +
      `yang relevan dan WAJIB menyertakan #TVRakyat. Jangan menambah atau mengubah fakta.\n` +
      `Caption inti: ${bahan.captionInti}\n` +
      `Format jawaban: {"caption": ["...", "..."]}`,
    90_000,
    "studio-caption",
  );
  const hasil = bersihkanDaftar(j.caption, n, 2200);
  if (hasil.length === 0) throw new Error("DeepSeek tidak menghasilkan caption.");
  return hasil;
}

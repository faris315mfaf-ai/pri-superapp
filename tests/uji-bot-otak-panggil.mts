// Uji pemanggil penyedia LLM milik bot (fetch ditiru) — 13 Okt 2026.
// Jalankan: npx tsx tests/uji-bot-otak-panggil.mts
import { GalatOtak, panggilPenyedia } from "@/lib/bot-otak";

let lulus = 0;
let gagal = 0;
const cek = (n: string, ok: boolean, i?: unknown) => {
  if (ok) {
    lulus++;
    console.log("  ✔", n);
  } else {
    gagal++;
    console.log("  ✘", n, i !== undefined ? JSON.stringify(i) : "");
  }
};

const KUNCI = "sk-rahasia-uji-ABCDEFGH12345678";
type Catatan = { url: string; headers: Record<string, string>; body: string };
let catat: Catatan[] = [];
let jawab: () => Response | Promise<Response> = () => new Response("{}");
const asli = globalThis.fetch;
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  catat.push({ url: String(url), headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)), body: String(init?.body ?? "") });
  return jawab();
}) as typeof fetch;

const P = { sistem: "sis", pengguna: "usr", fitur: "uji", json: true, maksToken: 50 };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const kode = async (f: () => Promise<unknown>): Promise<string> => {
  try {
    await f();
    return "tidak-melempar";
  } catch (e) {
    return e instanceof GalatOtak ? e.kode : `lain:${e instanceof Error ? e.message : e}`;
  }
};

console.log("\n[A] DeepSeek");
jawab = () => json({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 11, completion_tokens: 3 } });
let r = await panggilPenyedia("deepseek", KUNCI, P);
cek("teks & token dibaca", r.teks === '{"ok":true}' && r.masuk === 11 && r.keluar === 3, r);
cek("kunci hanya di header Authorization, bukan URL/badan", catat[0].headers.Authorization === `Bearer ${KUNCI}` && !catat[0].url.includes(KUNCI) && !catat[0].body.includes(KUNCI), catat[0].url);
cek("permintaan JSON mengaktifkan response_format", JSON.parse(catat[0].body).response_format?.type === "json_object");
catat = [];
await panggilPenyedia("deepseek", KUNCI, { ...P, json: false });
cek("tanpa json: tidak ada response_format", JSON.parse(catat[0].body).response_format === undefined);

console.log("\n[B] Gemini");
catat = [];
jawab = () => json({ candidates: [{ content: { parts: [{ text: "ha" }, { text: "lo" }] } }], usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 2 } });
r = await panggilPenyedia("gemini", KUNCI, P);
cek("teks digabung & token dibaca", r.teks === "halo" && r.masuk === 7 && r.keluar === 2, r);
cek("kunci di header x-goog-api-key, TIDAK di URL", catat[0].headers["x-goog-api-key"] === KUNCI && !catat[0].url.includes(KUNCI) && !catat[0].url.includes("key="), catat[0].url);
cek("JSON → responseMimeType", JSON.parse(catat[0].body).generationConfig.responseMimeType === "application/json");

console.log("\n[C] Galat dipetakan, kunci tidak bocor");
for (const [status, harap] of [[401, "kunci_ditolak"], [403, "kunci_ditolak"], [429, "kuota"], [402, "kuota"], [500, "gagal"], [400, "gagal"]] as const) {
  jawab = () => new Response(`salah: ${KUNCI}`, { status });
  const k = await kode(() => panggilPenyedia("deepseek", KUNCI, P));
  cek(`HTTP ${status} → ${harap}`, k === harap, k);
}
jawab = () => new Response(`salah: ${KUNCI}`, { status: 401 });
let pesan = "";
try { await panggilPenyedia("gemini", KUNCI, P); } catch (e) { pesan = String((e as Error).message) + String((e as Error).stack ?? ""); }
cek("pesan & stack galat tidak memuat kunci", pesan !== "" && !pesan.includes(KUNCI) && !pesan.includes("ABCDEFGH"), pesan.slice(0, 120));
jawab = () => new Response("bukan json", { status: 200 });
cek("badan 200 bukan JSON → gagal", (await kode(() => panggilPenyedia("deepseek", KUNCI, P))) === "gagal");
globalThis.fetch = (async () => { throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); }) as typeof fetch;
cek("waktu habis → waktu_habis", (await kode(() => panggilPenyedia("deepseek", KUNCI, P))) === "waktu_habis");
globalThis.fetch = (async () => { throw new Error(`koneksi putus ${KUNCI}`); }) as typeof fetch;
const k2 = await kode(() => panggilPenyedia("deepseek", KUNCI, P));
cek("galat jaringan lain → gagal, tanpa pesan asli", k2 === "gagal", k2);

globalThis.fetch = asli;
console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);

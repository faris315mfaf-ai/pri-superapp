// POST /api/proses-video — proses link video TikTok/Instagram
// Body: { link: string, judul_overlay?: string, highlight?: string }
// Menggunakan z-ai-web-dev-sdk (LLM) untuk melengkapi judul_overlay,
// highlight, dan caption_asli yang belum diisi pengguna.
// Jika LLM gagal/timeout → fallback template (selalu respons sukses).
import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const dynamic = "force-dynamic";

const jeda = () => new Promise((r) => setTimeout(r, 300 + Math.random() * 500));

/** Batas waktu menunggu LLM sebelum beralih ke fallback */
const BATAS_TIMEOUT_LLM_MS = 20000;

const BATAS_JUDUL = 60;
const BATAS_HIGHLIGHT = 80;

/** Tambahkan skema https:// bila pengguna lupa menuliskannya */
function normalisasiLink(link: string): string {
  const t = link.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/** Link valid bila host-nya tiktok.com / instagram.com (termasuk subdomain) */
function linkValid(link: string): boolean {
  try {
    const url = new URL(normalisasiLink(link));
    return (
      /(^|\.)tiktok\.com$/.test(url.hostname) ||
      /(^|\.)instagram\.com$/.test(url.hostname)
    );
  } catch {
    return false;
  }
}

function deteksiJenis(link: string): "TIKTOK" | "INSTAGRAM" {
  return /tiktok\.com/i.test(link) ? "TIKTOK" : "INSTAGRAM";
}

/** Ambil objek JSON pertama dari teks respons (tahan code fence) */
function ekstrakJSON(teks: string): Record<string, unknown> | null {
  const mulai = teks.indexOf("{");
  const akhir = teks.lastIndexOf("}");
  if (mulai === -1 || akhir <= mulai) return null;
  try {
    return JSON.parse(teks.slice(mulai, akhir + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function teksAtauKosong(nilai: unknown): string {
  return typeof nilai === "string" ? nilai.trim() : "";
}

async function panggilLLM(
  link: string,
  judulUser: string,
  highlightUser: string,
): Promise<string> {
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: "assistant",
        content:
          "Kamu editor konten TV Rakyat Indonesia. Balas HANYA JSON valid tanpa teks lain.",
      },
      {
        role: "user",
        content: `Buat konten untuk video vertikal dari link: ${link}. ${
          judulUser ? `Judul overlay sudah ada: ${judulUser}.` : ""
        } ${
          highlightUser ? `Highlight sudah ada: ${highlightUser}.` : ""
        } Format JSON: {"judul_overlay": string maksimal 60 karakter, "highlight": string maksimal 80 karakter, "caption_asli": string caption Instagram/TikTok 2-3 kalimat dengan hashtag}. Bahasa Indonesia.`,
      },
    ],
    thinking: { type: "disabled" },
  });
  const isi = completion?.choices?.[0]?.message?.content;
  return typeof isi === "string" ? isi : "";
}

export async function POST(request: NextRequest) {
  await jeda();

  let body: { link?: string; judul_overlay?: string; highlight?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid" }, { status: 400 });
  }

  const linkMentah = (body.link ?? "").trim();
  if (!linkMentah) {
    return NextResponse.json({ error: "Link video wajib diisi" }, { status: 400 });
  }
  if (!linkValid(linkMentah)) {
    return NextResponse.json(
      { error: "Link harus berasal dari tiktok.com atau instagram.com" },
      { status: 400 },
    );
  }

  const link = normalisasiLink(linkMentah);
  const jenis = deteksiJenis(link);
  const judulUser = (body.judul_overlay ?? "").trim();
  const highlightUser = (body.highlight ?? "").trim();

  // Nilai dari LLM (kosong bila gagal)
  let judulLLM = "";
  let highlightLLM = "";
  let captionLLM = "";
  try {
    const teks = await Promise.race([
      panggilLLM(link, judulUser, highlightUser),
      new Promise<never>((_, tolak) =>
        setTimeout(() => tolak(new Error("Timeout LLM")), BATAS_TIMEOUT_LLM_MS),
      ),
    ]);
    const obj = ekstrakJSON(teks);
    if (obj) {
      judulLLM = teksAtauKosong(obj.judul_overlay);
      highlightLLM = teksAtauKosong(obj.highlight);
      captionLLM = teksAtauKosong(obj.caption_asli);
    }
  } catch {
    // LLM gagal / timeout → lanjut dengan fallback template
  }

  // Fallback template yang tetap masuk akal
  const fallbackJudul =
    jenis === "TIKTOK" ? "Video Pilihan dari TikTok" : "Reel Pilihan TV Rakyat";
  const fallbackHighlight = "Sorotan informasi terkini untuk rakyat Indonesia";
  const fallbackCaption =
    "Simak video pilihan TV Rakyat hari ini! Jangan lupa like, komentar, dan bagikan ke semua. #TVRakyat #RakyatBersatu #PRIkuat";

  // Nilai pengguna menang, lalu hasil LLM, lalu fallback
  const judul_overlay = (judulUser || judulLLM || fallbackJudul).slice(0, BATAS_JUDUL);
  const highlight = (highlightUser || highlightLLM || fallbackHighlight).slice(
    0,
    BATAS_HIGHLIGHT,
  );
  const caption_asli = captionLLM || fallbackCaption;

  return NextResponse.json({
    judul_overlay,
    highlight,
    caption_asli,
    sumber: link,
    jenis,
  });
}

// POST /api/asisten/suara       — minta TOKEN SEMENTARA Gemini Live
//                                 (mode suara 2 arah realtime)
// POST /api/asisten/suara?alat=1 — jembatan alat utk sesi suara:
//                                 {nama, args} → hasil alat daftar-putih
//
// Fitur 1.20/3 (voice). Kunci API asli TIDAK pernah dikirim ke
// peramban: server menukar GEMINI_API_KEY dengan token sementara
// (umur pendek, sekali sambung, terkunci ke model suara) — peramban
// menyambung WebSocket ke Gemini Live memakai token itu.
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import {
  bolehChatbotRole,
  geminiSiap,
  jalankanAlat,
  deklarasiAlatUntuk,
  instruksiUntuk,
  MODEL_SUARA,
} from "@/lib/gemini";

export const dynamic = "force-dynamic";

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function POST(request: Request) {
  const tolak = await pastikanTidakMelebihiBatas(request, "asisten-suara", 20, 10 * 60);
  if (tolak) return tolak;

  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (!(await bolehChatbotRole(user.role))) {
      throw Object.assign(
        new Error("Jabatan Anda belum diberi akses Asisten AI."),
        { status: 403 },
      );
    }
    if (!geminiSiap()) {
      throw Object.assign(
        new Error("Asisten AI belum diatur (GEMINI_API_KEY kosong)."),
        { status: 503, pesanAman: true },
      );
    }

    const url = new URL(request.url);

    const pemanggil = {
      id: user.id,
      nama: user.nama,
      role: user.role,
      jabatan: user.jabatan,
    };

    // --- Jembatan alat: sesi suara meneruskan functionCall ke sini ---
    if (url.searchParams.get("alat") === "1") {
      const body = (await request.json().catch(() => ({}))) as {
        nama?: string;
        args?: Record<string, unknown>;
      };
      const nama = String(body.nama ?? "");
      const hasil = await jalankanAlat(nama, body.args ?? {}, pemanggil);
      return { hasil };
    }

    // --- Token sementara Gemini Live ---
    const kunci = process.env.GEMINI_API_KEY!;
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1alpha/auth_tokens",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": kunci,
        },
        body: JSON.stringify({
          // Sekali pakai + umur pendek: kalaupun bocor dari peramban,
          // nilainya kedaluwarsa dalam hitungan menit.
          uses: 1,
          expireTime: new Date(Date.now() + 30 * 60_000).toISOString(),
          // Sambungan HARUS dibuka <2 menit setelah token dicetak —
          // token yang dicuri cepat basi (diverifikasi: lewat jendela
          // ini Gemini menutup sesi "deadline exceeded").
          newSessionExpireTime: new Date(Date.now() + 2 * 60_000).toISOString(),
          // Konfigurasi sesi DIKUNCI ke token (bentuk field diverifikasi
          // langsung ke endpoint v1alpha 28 Agu 2026): model suara,
          // jawaban audio, instruksi, dan alat daftar-putih — peramban
          // tidak bisa menukarnya dengan model/alat lain.
          bidiGenerateContentSetup: {
            model: `models/${MODEL_SUARA}`,
            generationConfig: { responseModalities: ["AUDIO"] },
            // Transkrip suara masuk & keluar (fitur 1.20.3): dipakai
            // layar suara untuk menampilkan percakapan sebagai teks
            // berjalan — persis rasa aplikasi Gemini, dan bukti nyata
            // bagi pengguna bahwa asisten mendengar & menjawab.
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            // Instruksi (identitas + pelatihan master) & alat MENGIKUTI
            // pemanggil — master bersuara pun punya alat aksinya.
            systemInstruction: { parts: [{ text: await instruksiUntuk(pemanggil) }] },
            tools: [{ functionDeclarations: deklarasiAlatUntuk(pemanggil.role) }],
          },
        }),
      },
    );
    if (!res.ok) {
      const galat = await res.text().catch(() => "");
      console.error("[asisten/suara] token", res.status, galat.slice(0, 300));
      throw Object.assign(
        new Error("Gagal menyiapkan mode suara. Coba lagi, atau pakai mode teks."),
        { status: 502, pesanAman: true },
      );
    }
    const json = (await res.json()) as { name?: string };
    if (!json.name) {
      throw Object.assign(
        new Error("Layanan suara tidak mengirim token. Pakai mode teks dulu."),
        { status: 502, pesanAman: true },
      );
    }
    return { token: json.name, model: MODEL_SUARA };
  });
}

// GET  /api/asisten — status: apakah jabatan SAYA boleh & AI siap
// POST /api/asisten — satu giliran chat {pesan, riwayat[]}
//
// Fitur 1.20/3: chatbot data internal (Gemini). Keamanan:
// - akses per jabatan (chatbot_access, diatur master/super);
// - rate limit per pengguna;
// - model hanya bisa memanggil alat daftar-putih (lihat lib/gemini) —
//   tidak ada SQL bebas, tidak ada kolom sensitif.
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { bolehChatbotRole, geminiSiap, tanyaGemini } from "@/lib/gemini";
import { jabatanBolehAsisten } from "@/lib/jabatan";

export const dynamic = "force-dynamic";
// Putaran alat + jaringan Gemini bisa >10 detik.
export const maxDuration = 60;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    return {
      // Akses = per-role (diatur master) ATAU jabatan penerima voice
      // command (fitur 1.22.x/5).
      boleh: (await bolehChatbotRole(user.role)) || jabatanBolehAsisten(user.jabatan),
      siap: geminiSiap(),
    };
  });
}

export async function POST(request: Request) {
  const tolak = await pastikanTidakMelebihiBatas(request, "asisten", 30, 10 * 60);
  if (tolak) return tolak;

  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (!(await bolehChatbotRole(user.role)) && !jabatanBolehAsisten(user.jabatan)) {
      throw Object.assign(
        new Error("Jabatan Anda belum diberi akses Asisten AI."),
        { status: 403 },
      );
    }
    if (!geminiSiap()) {
      throw Object.assign(
        new Error("Asisten AI belum diatur (GEMINI_API_KEY kosong). Hubungi pengelola."),
        { status: 503, pesanAman: true },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      pesan?: string;
      riwayat?: { peran?: string; teks?: string }[];
    };
    const pesan = String(body.pesan ?? "").trim();
    if (!pesan) throw Object.assign(new Error("Pesan kosong."), { status: 400 });
    if (pesan.length > 2000) {
      throw Object.assign(new Error("Pesan terlalu panjang (maks 2000 karakter)."), {
        status: 400,
      });
    }

    const riwayat = (Array.isArray(body.riwayat) ? body.riwayat : [])
      .filter(
        (r): r is { peran: string; teks: string } =>
          Boolean(r) &&
          (r.peran === "pengguna" || r.peran === "asisten") &&
          typeof r.teks === "string",
      )
      .slice(-12)
      .map((r) => ({ peran: r.peran as "pengguna" | "asisten", teks: r.teks }));

    const jawaban = await tanyaGemini(riwayat, pesan, {
      id: user.id,
      nama: user.nama,
      role: user.role,
      jabatan: user.jabatan,
    });
    return { jawaban };
  });
}

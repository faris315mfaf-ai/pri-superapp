// GET  /api/preferensi — semua preferensi tampilan SAYA
// POST /api/preferensi — simpan satu preferensi {kunci, nilai}
//
// Fitur 1.20/1 & 1.20/4: susunan modul footer dan tata letak seksi per
// modul. Kuncinya di-whitelist ketat dan nilainya dipagari ukuran —
// tabel preferensi bukan tempat penyimpanan bebas.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";

export const dynamic = "force-dynamic";

// Kunci yang sah: "footer" (susunan modul nav bawah) dan
// "layout:<modul>" (urutan/lipatan seksi satu modul).
const POLA_KUNCI = /^(footer|layout:[a-z-]{1,24})$/;
const MAKS_NILAI_BYTE = 4096;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });

    const { data } = await supabase()
      .from("preferensi_pengguna")
      .select("kunci, nilai")
      .eq("user_id", Number(user.id))
      .limit(100);

    const peta: Record<string, unknown> = {};
    for (const b of data ?? []) peta[String(b.kunci)] = b.nilai;
    return { preferensi: peta };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      kunci?: string;
      nilai?: unknown;
    };
    const kunci = String(body.kunci ?? "");
    if (!POLA_KUNCI.test(kunci)) {
      throw Object.assign(new Error("Kunci preferensi tidak dikenal."), { status: 400 });
    }
    if (body.nilai === undefined) {
      throw Object.assign(new Error("Nilai preferensi kosong."), { status: 400 });
    }
    // Pagar ukuran: preferensi tampilan itu kecil; payload besar pasti
    // salah pakai (atau disengaja) — tolak sebelum menyentuh database.
    const ukuran = Buffer.byteLength(JSON.stringify(body.nilai), "utf8");
    if (ukuran > MAKS_NILAI_BYTE) {
      throw Object.assign(new Error("Preferensi terlalu besar."), { status: 400 });
    }

    const { error } = await supabase()
      .from("preferensi_pengguna")
      .upsert(
        {
          user_id: Number(user.id),
          kunci,
          nilai: body.nilai,
          diubah_pada: new Date().toISOString(),
        },
        { onConflict: "user_id,kunci" },
      );
    if (error) {
      console.error("[preferensi] simpan:", error.message);
      throw new Error("Gagal menyimpan preferensi.");
    }
    return { sukses: true };
  });
}

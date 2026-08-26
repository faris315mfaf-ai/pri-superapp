// GET  /api/fitur          — izin fitur untuk peran SAYA (semua pengguna)
// GET  /api/fitur?matriks=1 — seluruh matriks peran × fitur (super admin)
// POST /api/fitur          — nyalakan/matikan satu fitur untuk satu peran
//
// Baris yang TIDAK ADA berarti fiturnya nyala; tabel ini hanya
// menyimpan pengecualian. Konsekuensinya disengaja: fitur baru
// langsung tersedia untuk semua peran, dan tidak ada yang mendadak
// kehilangan akses karena matriksnya belum diisi.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { KATALOG_FITUR, PERAN_DIATUR } from "@/lib/fitur";
import { izinPeran } from "@/lib/fitur-server";

export const dynamic = "force-dynamic";

const PENGATUR = new Set(["super_admin", "master"]);
const KUNCI_SAH = new Set(KATALOG_FITUR.map((f) => f.kunci as string));
const PERAN_SAH = new Set(PERAN_DIATUR.map((p) => p.id as string));

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });

    const url = new URL(request.url);
    if (url.searchParams.get("matriks") === "1") {
      if (!PENGATUR.has(user.role)) {
        throw Object.assign(new Error("Hanya super admin yang boleh mengatur fitur."), {
          status: 403,
        });
      }
      const { data } = await supabase().from("fitur_izin").select("peran, fitur, aktif");
      // Kirim hanya yang DIMATIKAN; klien menganggap sisanya nyala.
      const mati: Record<string, string[]> = {};
      for (const b of data ?? []) {
        if (b.aktif === false) {
          const p = b.peran as string;
          (mati[p] ??= []).push(b.fitur as string);
        }
      }
      return { katalog: KATALOG_FITUR, peran: PERAN_DIATUR, mati };
    }

    return { peran: user.role, izin: await izinPeran(user.role) };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (!PENGATUR.has(user.role)) {
      throw Object.assign(new Error("Hanya super admin yang boleh mengatur fitur."), {
        status: 403,
      });
    }

    const body = (await request.json().catch(() => ({}))) as {
      peran?: string;
      fitur?: string;
      aktif?: boolean;
    };
    const peran = String(body.peran ?? "");
    const fitur = String(body.fitur ?? "");
    if (!PERAN_SAH.has(peran)) {
      throw Object.assign(new Error("Peran tidak dikenal."), { status: 400 });
    }
    if (!KUNCI_SAH.has(fitur)) {
      throw Object.assign(new Error("Fitur tidak dikenal."), { status: 400 });
    }

    const db = supabase();
    if (body.aktif === false) {
      const { error } = await db.from("fitur_izin").upsert(
        {
          peran,
          fitur,
          aktif: false,
          diubah_oleh: user.nama,
          diubah_pada: new Date().toISOString(),
        },
        { onConflict: "peran,fitur" },
      );
      if (error) {
        console.error("[fitur] matikan:", error.message);
        throw new Error("Gagal menyimpan pengaturan.");
      }
    } else {
      // Menyalakan = menghapus pengecualiannya, bukan menyimpan true.
      // Dengan begitu tabelnya tetap ringkas dan maknanya tunggal.
      const { error } = await db
        .from("fitur_izin")
        .delete()
        .eq("peran", peran)
        .eq("fitur", fitur);
      if (error) {
        console.error("[fitur] nyalakan:", error.message);
        throw new Error("Gagal menyimpan pengaturan.");
      }
    }

    return { sukses: true };
  });
}

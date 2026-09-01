// GET  /api/dashboard/akses           — dashboard yang boleh SAYA buka
// GET  /api/dashboard/akses?matriks=1 — matriks jabatan × dashboard
//                                       (master/super admin)
// POST /api/dashboard/akses           — nyalakan/matikan satu dashboard
//                                       untuk satu jabatan (fitur 3.3)
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import {
  aksesDashboardRole,
  KATALOG_DASHBOARD,
  KUNCI_DASHBOARD_SAH,
} from "@/lib/dashboard-akses";
import { PERAN_DIATUR } from "@/lib/fitur";
import { adalahHR } from "@/lib/hr";

export const dynamic = "force-dynamic";

const PENGATUR = new Set(["super_admin", "master"]);
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
        throw Object.assign(
          new Error("Hanya master/super admin yang boleh mengatur akses dashboard."),
          { status: 403 },
        );
      }
      const { data } = await supabase()
        .from("dashboard_access")
        .select("role, dashboard_key, aktif");
      // Kirim hanya yang NYALA; baris tak ada = mati (kebalikan
      // fitur_izin — lihat catatan di lib/dashboard-akses).
      const nyala: Record<string, string[]> = {};
      for (const b of data ?? []) {
        if (b.aktif === true) {
          const r = String(b.role);
          (nyala[r] ??= []).push(String(b.dashboard_key));
        }
      }
      // Ikon di katalog adalah komponen React (tidak bisa di-JSON-kan);
      // kirim kunci+label saja — ikon diambil klien dari katalognya.
      return {
        katalog: KATALOG_DASHBOARD.map(({ kunci, label }) => ({ kunci, label })),
        peran: PERAN_DIATUR,
        nyala,
      };
    }

    const boleh = await aksesDashboardRole(user);
    // Orang HR (peran admin_hr / Divisi HR — fitur 1.22.x/1) mendapat
    // akses dashboard HR (absensi, kpi, kepatuhan, anggota) di samping
    // yang mungkin diberi master untuk perannya. Dashboard TV tidak.
    if (adalahHR(user)) {
      const hr = ["absensi", "kpi", "anggota"];
      return { boleh: Array.from(new Set([...boleh, ...hr])) };
    }
    return { boleh };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (!PENGATUR.has(user.role)) {
      throw Object.assign(
        new Error("Hanya master/super admin yang boleh mengatur akses dashboard."),
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      role?: string;
      dashboard_key?: string;
      aktif?: boolean;
    };
    const role = String(body.role ?? "");
    const kunci = String(body.dashboard_key ?? "");
    if (!PERAN_SAH.has(role)) {
      throw Object.assign(new Error("Jabatan tidak dikenal."), { status: 400 });
    }
    // Master tidak diatur dari sini — aksesnya selalu penuh, supaya
    // pemegang kendali tidak bisa mengunci dirinya sendiri.
    if (role === "master") {
      throw Object.assign(new Error("Akses master selalu penuh."), { status: 400 });
    }
    if (!KUNCI_DASHBOARD_SAH.has(kunci)) {
      throw Object.assign(new Error("Dashboard tidak dikenal."), { status: 400 });
    }

    const { error } = await supabase()
      .from("dashboard_access")
      .upsert(
        {
          role,
          dashboard_key: kunci,
          aktif: body.aktif === true,
          diubah_pada: new Date().toISOString(),
        },
        { onConflict: "role,dashboard_key" },
      );
    if (error) {
      console.error("[dashboard-akses] simpan:", error.message);
      throw new Error("Gagal menyimpan pengaturan.");
    }

    return { sukses: true };
  });
}

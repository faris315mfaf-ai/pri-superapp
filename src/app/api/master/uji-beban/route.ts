// /api/master/uji-beban — UJI BEBAN dari Panel Master (29 Sep 2026).
//
// GET  → status uji yang sedang berjalan (angka langsung) + hasil terakhir.
// POST {aksi:"mulai", jumlah, skenario:"normal"|"berat", durasi, konfirmasi:"UJI"}
// POST {aksi:"berhenti"}
//
// Khusus MASTER ASLI (bukan superadmin): uji ini membebani server produksi.
// Mesin & pengamannya: lib/uji-beban, lib/uji-beban-skenario, lib/uji-beban-token.
import { bungkus } from "@/lib/api-helper";
import { supabase } from "@/lib/supabase";
import { lupakanProfilUji, userDariToken } from "@/lib/sesi";
import { adalahMasterAsli, PERAN_TERSEMBUNYI_IN } from "@/lib/peran";
import { kondisiDb } from "@/lib/penjaga-supabase";
import { ambilMetrik } from "@/lib/metrik-server";
import { tanggalWibHariIni } from "@/lib/format";
import { rahasiaUji } from "@/lib/uji-beban-token";
import { hentikanUjiBeban, jalankanUji, statusUjiBeban, type StatusUji } from "@/lib/uji-beban";
import type { SkenarioUji } from "@/lib/uji-beban-skenario";

export const dynamic = "force-dynamic";

const KUNCI_HASIL = "uji_beban_terakhir";

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasterAsli(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  if (!adalahMasterAsli(user)) {
    throw Object.assign(new Error("Uji beban hanya untuk master."), { status: 403 });
  }
  return user;
}

/** Jumlah detik idle & total CPU instansi Supabase dari metrik resminya. */
async function cuplikanCpuSupabase(): Promise<{ idle: number; total: number } | null> {
  const teks = await ambilMetrik();
  let idle = 0;
  let total = 0;
  for (const baris of teks.split("\n")) {
    if (!baris.startsWith("node_cpu_seconds_total{")) continue;
    const v = Number(baris.trim().split(/\s+/).pop());
    if (!Number.isFinite(v)) continue;
    total += v;
    if (baris.includes('mode="idle"')) idle += v;
  }
  return total > 0 ? { idle, total } : null;
}

async function akunAktif(maks: number): Promise<number[]> {
  const { data, error } = await supabase()
    .from("app_user")
    .select("id")
    .eq("aktif", true)
    .eq("status", "aktif")
    .not("role", "in", PERAN_TERSEMBUNYI_IN)
    .limit(2000);
  if (error) throw new Error("Gagal membaca daftar akun.");
  const id = (data ?? []).map((b) => Number(b.id)).filter((n) => n > 0);
  // Acak supaya tiap uji meniru campuran peran yang berbeda.
  for (let i = id.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [id[i], id[j]] = [id[j], id[i]];
  }
  return id.slice(0, Math.max(1, maks));
}

async function kategoriContoh(): Promise<string[]> {
  const { data } = await supabase().from("keyword_wajib").select("keyword").eq("aktif", true).limit(5);
  return (data ?? []).map((b) => String(b.keyword ?? "")).filter(Boolean);
}

async function hasilTerakhir(): Promise<StatusUji | null> {
  const { data } = await supabase().from("pengaturan_sistem").select("nilai").eq("kunci", KUNCI_HASIL).maybeSingle();
  try {
    return data?.nilai ? (JSON.parse(String(data.nilai)) as StatusUji) : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanMasterAsli(request);
    const berjalan = statusUjiBeban();
    const { count } = await supabase()
      .from("app_user")
      .select("id", { count: "exact", head: true })
      .eq("aktif", true)
      .eq("status", "aktif")
      .not("role", "in", PERAN_TERSEMBUNYI_IN);
    return {
      berjalan: berjalan?.berjalan ? berjalan : null,
      terakhir: berjalan && !berjalan.berjalan ? berjalan : await hasilTerakhir(),
      akun_aktif: count ?? 0,
      tingkat_db: kondisiDb().tingkat,
      siap: Boolean(rahasiaUji()),
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasterAsli(request);
    const body = (await request.json().catch(() => ({}))) as {
      aksi?: string;
      jumlah?: number;
      skenario?: string;
      durasi?: number;
      konfirmasi?: string;
    };

    if (body.aksi === "berhenti") {
      return { dihentikan: hentikanUjiBeban(`Dihentikan ${user.nama}.`) };
    }
    if (body.aksi !== "mulai") throw Object.assign(new Error("Aksi tidak dikenal."), { status: 400 });

    if (String(body.konfirmasi ?? "").trim().toUpperCase() !== "UJI") {
      throw Object.assign(new Error('Ketik "UJI" untuk memastikan — uji ini membebani server produksi.'), { status: 400 });
    }
    if (!rahasiaUji()) throw Object.assign(new Error("CRON_SECRET belum diatur di server."), { status: 503 });
    if (statusUjiBeban()?.berjalan) throw Object.assign(new Error("Uji beban lain masih berjalan."), { status: 409 });
    const tingkat = kondisiDb().tingkat;
    if (tingkat !== "normal") {
      throw Object.assign(new Error(`Database sedang ${tingkat} — uji ditunda supaya pengguna sungguhan tidak terganggu.`), { status: 409 });
    }
    const jumlah = Math.floor(Number(body.jumlah));
    if (!Number.isFinite(jumlah) || jumlah < 1 || jumlah > 500) {
      throw Object.assign(new Error("Jumlah orang 1-500."), { status: 400 });
    }
    const durasi = Math.floor(Number(body.durasi ?? 60));
    if (!Number.isFinite(durasi) || durasi < 20 || durasi > 180) {
      throw Object.assign(new Error("Lama tiap tahap 20-180 detik."), { status: 400 });
    }
    const skenario: SkenarioUji = body.skenario === "normal" ? "normal" : "berat";

    // Mesin berjalan di latar proses aplikasi; layar memantau lewat GET.
    const janji = jalankanUji({ jumlah, skenario, durasiTahapDetik: durasi }, user.nama, {
      asal: process.env.UJI_BEBAN_ASAL || `http://127.0.0.1:${process.env.PORT || 3000}`,
      ambilAkun: akunAktif,
      ambilKonteks: async () => ({ tanggal: tanggalWibHariIni(), kategori: await kategoriContoh().catch(() => []) }),
      cuplikanCpu: cuplikanCpuSupabase,
      tingkatDb: () => kondisiDb().tingkat,
      simpanHasil: async (s) => {
        lupakanProfilUji(s.id);
        await supabase()
          .from("pengaturan_sistem")
          .upsert({ kunci: KUNCI_HASIL, nilai: JSON.stringify(s) }, { onConflict: "kunci" });
      },
      catat: (p) => console.log(p),
    });
    // Tunggu sampai uji benar-benar mulai (atau gagal disiapkan).
    const mulai = await Promise.race([
      janji.then(
        () => null,
        (e: unknown) => {
          throw Object.assign(new Error(e instanceof Error ? e.message : "Uji gagal dimulai."), { status: 400 });
        },
      ),
      (async () => {
        for (let i = 0; i < 200; i++) {
          const s = statusUjiBeban();
          if (s?.berjalan) return s;
          await new Promise((r) => setTimeout(r, 100));
        }
        return null;
      })(),
    ]);
    janji.catch((e) => console.error("[uji-beban]", e instanceof Error ? e.message : e));
    return { mulai: Boolean(mulai), status: mulai ?? statusUjiBeban() };
  });
}

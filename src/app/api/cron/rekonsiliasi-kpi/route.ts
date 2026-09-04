// /api/cron/rekonsiliasi-kpi — dijalankan Vercel Cron tiap 15 menit.
//
// FIX 4 Sep 2026: "semua video yang diupload/terkirim ke sosmed otomatis masuk
// KPI dan tercatat link-nya di laporan". Sebelumnya tautan hasil unggahan
// (termasuk yang dikirim admin lewat Studio/Siaran Serentak) baru tercatat
// saat ANGGOTA ITU SENDIRI membuka layar Riwayat/Rangkuman — anggota yang tak
// pernah membukanya KPI-nya tidak naik. Sekarang server yang mencatat sendiri:
// tiap 15 menit, semua unggahan ≤ 72 jam yang masih ada platform belum
// tercatat direkonsiliasi (lib/kpi-otomatis, idempoten) dalam anggaran waktu.
import { supabase } from "@/lib/supabase";
import { rekonsiliasiKpiOtomatis } from "@/lib/kpi-otomatis";
import { uploadPostSiap } from "@/lib/upload-post";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const ANGGARAN_TOTAL_MS = 240_000;
const ANGGARAN_PER_ORANG_MS = 25_000;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function GET(request: Request) {
  const rahasia = process.env.CRON_SECRET || process.env.ASISTEN_CRON_SECRET || "";
  const ua = (request.headers.get("user-agent") ?? "").toLowerCase();
  const sah = rahasia ? tokenDari(request) === rahasia : ua.includes("vercel-cron");
  if (!sah) return Response.json({ error: "Tidak berwenang." }, { status: 403 });
  if (!uploadPostSiap()) return Response.json({ jalan: false, alasan: "upload-post belum tersambung" });

  const mulai = Date.now();
  const db = supabase();
  const batas = new Date(Date.now() - 72 * 3600_000).toISOString();
  const { data: posts } = await db
    .from("tvrku_post")
    .select("user_id, platforms, kpi_tercatat, jadwal, dibuat_pada")
    .gte("dibuat_pada", batas)
    .order("dibuat_pada", { ascending: false })
    .limit(600);

  // Pengguna yang masih punya platform belum tercatat (jadwal yang belum tiba dilewati).
  const perlu = new Map<number, number>();
  for (const p of posts ?? []) {
    if (p.jadwal && Date.parse(String(p.jadwal)) > Date.now()) continue;
    const diminta = (p.platforms ?? []) as string[];
    const sudah = new Set((p.kpi_tercatat ?? []) as string[]);
    if (diminta.some((x) => !sudah.has(x))) perlu.set(Number(p.user_id), (perlu.get(Number(p.user_id)) ?? 0) + 1);
  }
  // Yang unggahannya paling banyak belum tercatat didahulukan.
  const antre = [...perlu.entries()].sort((a, b) => b[1] - a[1]).map(([uid]) => uid);

  let diproses = 0;
  let baru = 0;
  for (const uid of antre) {
    if (Date.now() - mulai > ANGGARAN_TOTAL_MS) break;
    baru += await rekonsiliasiKpiOtomatis(uid, { anggaranMs: ANGGARAN_PER_ORANG_MS });
    diproses += 1;
  }
  return Response.json(
    { jalan: true, unggahan_diperiksa: (posts ?? []).length, pengguna_perlu: antre.length, pengguna_diproses: diproses, laporan_baru: baru, sisa: antre.length - diproses, durasi_ms: Date.now() - mulai },
    { headers: { "Cache-Control": "no-store" } },
  );
}

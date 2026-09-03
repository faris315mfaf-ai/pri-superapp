// GET /api/cron/sinkron-komen — penarik komentar REALTIME (3 Sep 2026).
//
// Dipanggil Vercel Cron tiap 5 menit (vercel.json → crons). Satu panggilan
// MENGULANG penarikan sampai semua postingan periode selesai diperiksa atau
// anggaran waktunya habis (±250 dtk dari maxDuration 300). Bila masih ada
// sisa, route MENYAMBUNG dirinya sendiri (rantai) sampai tuntas — maksimal
// 6 sambungan — sehingga rekap kepatuhan selalu sedekat mungkin dengan
// keadaan sosmed, tanpa menunggu jadwal cron berikutnya.
//
// Keamanan: bila env CRON_SECRET / ASISTEN_CRON_SECRET terpasang, wajib
// `Authorization: Bearer <rahasia>`; tanpa rahasia, hanya user-agent resmi
// Vercel Cron (dan sambungan internal) yang diterima. Pekerjaannya
// idempoten (upsert) dan dijaga LEASE atomik: hanya satu pekerja Ayrshare
// pada satu waktu, jadi tak bisa dipakai membanjiri Ayrshare.
import { after } from "next/server";
import { sinkronKontenTvPaksa } from "@/lib/sinkron-konten-tv";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const ANGGARAN_MS = 250_000;
const MAKS_RANTAI = 6;
const UA_RANTAI = "pri-superapp-rantai/1.0";

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function GET(request: Request) {
  const rahasia = process.env.CRON_SECRET || process.env.ASISTEN_CRON_SECRET || "";
  const ua = (request.headers.get("user-agent") ?? "").toLowerCase();
  const sah = rahasia
    ? tokenDari(request) === rahasia
    : ua.includes("vercel-cron") || ua.includes(UA_RANTAI.toLowerCase());
  if (!sah) {
    return Response.json({ error: "Tidak berwenang." }, { status: 403 });
  }

  const url = new URL(request.url);
  const rantai = Math.max(0, Number(url.searchParams.get("rantai") ?? 0) || 0);
  const hasil = await sinkronKontenTvPaksa(rantai > 0 ? `rantai-${rantai}` : "vercel-cron", ANGGARAN_MS);

  // Masih ada sisa → sambung ke panggilan berikutnya (fire-and-forget:
  // permintaan dibatalkan setelah 3 dtk, fungsi tujuan tetap berjalan).
  if (hasil.jalan && !hasil.selesai && (hasil.sisa ?? 0) > 0 && rantai < MAKS_RANTAI) {
    const asal = process.env.APP_URL?.replace(/\/$/, "") || `${url.protocol}//${url.host}`;
    const tujuan = `${asal}/api/cron/sinkron-komen?rantai=${rantai + 1}`;
    after(async () => {
      try {
        await fetch(tujuan, {
          headers: {
            "user-agent": UA_RANTAI,
            ...(rahasia ? { authorization: `Bearer ${rahasia}` } : {}),
          },
          signal: AbortSignal.timeout(3000),
          cache: "no-store",
        });
      } catch {
        // Timeout 3 dtk = normal (tujuan tetap berjalan). Kegagalan lain
        // tak masalah: cron 5 menit berikutnya melanjutkan.
      }
    });
  }
  return Response.json({ ...hasil, rantai }, { headers: { "Cache-Control": "no-store" } });
}

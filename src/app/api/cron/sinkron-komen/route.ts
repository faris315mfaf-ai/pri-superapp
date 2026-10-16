// GET /api/cron/sinkron-komen — sinkron konten TV Rakyat Official (cron).
//
// Sejak 16 Okt 2026 (Ayrshare dihapus) sumbernya profil upload-post
// Official dan PEMERIKSAAN KOMENTAR OTOMATIS DIMATIKAN — upload-post tidak
// punya API komentar. Nama rute dipertahankan supaya jadwal cron yang sudah
// terpasang tetap jalan; tiap panggilan kini menjalankan SATU putaran
// sinkron konten (postingan periode ini → `postingan` + `feed_konten`).
// Logika rantai di bawah tetap ada, tetapi tidak terpicu lagi karena satu
// putaran selalu tuntas (`selesai: true`).
//
// Keamanan: bila env CRON_SECRET / ASISTEN_CRON_SECRET terpasang, wajib
// `Authorization: Bearer <rahasia>`; tanpa rahasia, hanya user-agent resmi
// Vercel Cron (dan sambungan internal) yang diterima. Pekerjaannya
// idempoten (upsert) dan dijaga LEASE atomik: hanya satu pekerja pada satu
// waktu, jadi tak bisa dipakai membanjiri upload-post.
import { after } from "next/server";
import { sinkronKontenTvPaksa } from "@/lib/sinkron-konten-tv";
import { jalankanLatar, tundaKarenaMacet } from "@/lib/penjaga-supabase";

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
  const tunda = tundaKarenaMacet("sinkron-komen");
  if (tunda) return Response.json({ ...tunda, rantai }, { headers: { "Cache-Control": "no-store" } });
  const hasil = await jalankanLatar("sinkron-komen", () =>
    sinkronKontenTvPaksa(rantai > 0 ? `rantai-${rantai}` : "vercel-cron", ANGGARAN_MS),
  );

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

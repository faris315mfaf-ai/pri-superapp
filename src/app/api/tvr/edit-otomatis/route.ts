// POST /api/tvr/edit-otomatis — PALUGODAM: satu pop-up untuk "edit
// otomatis + upload otomatis" (2 Sep 2026).
//
// Body: { link, highlight, judul_overlay, sumber_akun,
//         caption_umum, caption_platform{}, platforms[], jadwal? }
//
// Bagian EDIT diserahkan ke workflow n8n "TV Rakyat - Proses Video"
// (unduh → judul/caption → Cloudinary → render Creatomate) — workflow
// yang SAMA dan sudah terbukti dipakai TV Rakyat Official, jadi tidak
// ada pipeline render baru yang harus dipelihara.
// Bagian UPLOAD disimpan di `palugodam_pesanan`; begitu render selesai,
// lib/palugodam memposting hasilnya ke sosmed PRIBADI anggota lewat
// upload-post (lihat catatan di sana).
//
// GET → daftar pesanan saya + status render/posting.
import { after } from "next/server";
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { panggilWebhookN8n, N8nBelumDiaturError } from "@/lib/n8n";
import { adalahPalugodam } from "@/lib/struktur";
import { PLATFORM_KPI } from "@/lib/kpi-video";
import { prosesPesananPalugodam } from "@/lib/palugodam";
import { pastikanFiturAktif } from "@/lib/fitur-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanPalugodam(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  if (!adalahPalugodam(user)) {
    throw Object.assign(
      new Error("Fitur edit otomatis khusus anggota Divisi PALUGODAM."),
      { status: 403 },
    );
  }
  return user;
}

/** Tambahkan https:// bila lupa ditulis. */
function normalisasiLink(link: string): string {
  const t = link.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/** Sumber render hanya TikTok/Instagram — sama dengan pipeline Official. */
function linkValid(link: string): boolean {
  try {
    const u = new URL(normalisasiLink(link));
    return /(^|\.)tiktok\.com$/.test(u.hostname) || /(^|\.)instagram\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanPalugodam(request);
    const db = supabase();
    const { data } = await db
      .from("palugodam_pesanan")
      .select("id, kode_antrian, platforms, caption_umum, jadwal, status, pesan, dibuat_pada")
      .eq("user_id", Number(user.id))
      .order("dibuat_pada", { ascending: false })
      .limit(20);

    // Lengkapi dengan kemajuan render dari antrian video.
    const kode = (data ?? []).map((p) => String(p.kode_antrian));
    const { data: antrian } = kode.length
      ? await db
          .from("video_antrian")
          .select("kode, status, tahap_nama, persen, hasil_render_url")
          .in("kode", kode)
      : { data: [] };
    const peta = new Map((antrian ?? []).map((a) => [String(a.kode), a]));

    // Pesanan yang rendernya baru selesai diposting di latar belakang.
    after(() => prosesPesananPalugodam(Number(user.id)));

    return {
      data: (data ?? []).map((p) => {
        const a = peta.get(String(p.kode_antrian));
        return {
          ...p,
          id: String(p.id),
          render_tahap: String(a?.tahap_nama ?? ""),
          render_persen: Number(a?.persen ?? 0),
          render_selesai: Boolean(a?.hasil_render_url),
        };
      }),
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanPalugodam(request);
    await pastikanFiturAktif(user, "tvrku", "TV Rakyat Saya sedang dimatikan untuk peran Anda.");

    const body = (await request.json().catch(() => ({}))) as {
      link?: string;
      highlight?: string;
      judul_overlay?: string;
      sumber_akun?: string;
      caption_umum?: string;
      caption_platform?: Record<string, string>;
      platforms?: string[];
      jadwal?: string;
    };

    const link = String(body.link ?? "").trim();
    if (!link) throw Object.assign(new Error("Link video wajib diisi."), { status: 400 });
    if (!linkValid(link)) {
      throw Object.assign(
        new Error("Link harus dari tiktok.com atau instagram.com."),
        { status: 400 },
      );
    }
    const highlight = String(body.highlight ?? "").trim();
    if (!highlight) {
      throw Object.assign(new Error("HIGHLIGHT wajib diisi (satu kata)."), { status: 400 });
    }
    if (/\s/.test(highlight)) {
      throw Object.assign(new Error("HIGHLIGHT harus satu kata tanpa spasi."), { status: 400 });
    }
    const judulOverlay = String(body.judul_overlay ?? "").trim();
    if (judulOverlay.length < 3) {
      throw Object.assign(new Error("Judul video wajib diisi."), { status: 400 });
    }
    const sumber = String(body.sumber_akun ?? "").trim();

    const platforms = (body.platforms ?? [])
      .map((p) => String(p).toLowerCase())
      .filter((p) => (PLATFORM_KPI as readonly string[]).includes(p));
    if (platforms.length === 0) {
      throw Object.assign(new Error("Pilih minimal satu sosial media tujuan."), { status: 400 });
    }

    // Jadwal opsional: minimal 5 menit lagi, maksimal 7 hari (sejalan
    // dengan batas tautan bertanda tangan di jalur unggah biasa).
    let jadwal: string | null = null;
    if (body.jadwal) {
      const t = Date.parse(body.jadwal);
      if (!Number.isFinite(t) || t < Date.now() + 4 * 60_000) {
        throw Object.assign(new Error("Waktu jadwal minimal 5 menit dari sekarang."), {
          status: 400,
        });
      }
      if (t > Date.now() + 7 * 86_400_000) {
        throw Object.assign(new Error("Jadwal maksimal 7 hari ke depan."), { status: 400 });
      }
      jadwal = new Date(t).toISOString();
    }

    // Caption khusus per sosmed — hanya platform yang benar-benar dipilih.
    const captionPlatform: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.caption_platform ?? {})) {
      const teks = String(v ?? "").trim();
      if (teks && platforms.includes(k)) captionPlatform[k] = teks.slice(0, 2200);
    }

    // --- Serahkan bagian EDIT ke n8n (pipeline render yang sudah ada) ---
    let kode = "";
    try {
      const hasil = (await panggilWebhookN8n("N8N_WEBHOOK_PROSES_VIDEO", {
        link: normalisasiLink(link),
        video_asli: normalisasiLink(link),
        judul_overlay: judulOverlay,
        highlight,
        caption_asli: String(body.caption_umum ?? "").trim(),
        sumber_akun: sumber,
        caption_sumber: sumber,
        digenerate_oleh: user.nama,
        digenerate_user_id: Number(user.id),
      })) as { kode?: string };
      kode = String(hasil?.kode ?? "");
    } catch (e) {
      if (e instanceof N8nBelumDiaturError) {
        throw Object.assign(
          new Error("Otomatisasi video belum tersambung. Hubungi pengelola."),
          { status: 503 },
        );
      }
      throw e;
    }
    if (!kode) {
      throw new Error(
        "Otomatisasi tidak mengembalikan kode antrian. Cek workflow 'TV Rakyat - Proses Video'.",
      );
    }

    // --- Simpan bagian UPLOAD untuk dijalankan setelah render selesai ---
    const { error } = await supabase().from("palugodam_pesanan").insert({
      user_id: Number(user.id),
      kode_antrian: kode,
      platforms,
      caption_umum: String(body.caption_umum ?? "").trim().slice(0, 2200),
      caption_platform: captionPlatform,
      jadwal,
    });
    if (error) {
      console.error("[palugodam] simpan pesanan:", error.message);
      throw new Error("Video sedang dirender, tapi pesanan posting gagal disimpan.");
    }

    return {
      sukses: true,
      kode,
      pesan: jadwal
        ? "Video sedang dirender. Begitu selesai, otomatis diposting pada waktu yang Anda jadwalkan."
        : "Video sedang dirender. Begitu selesai, otomatis diposting ke sosmed Anda.",
    };
  });
}

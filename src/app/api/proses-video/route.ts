// POST /api/proses-video — mulai proses video TV Rakyat
// Body: { link, video_asli, judul_overlay?, highlight?, caption_asli?, sumber_akun? }
//
// Aplikasi TIDAK memproses video sendiri. Seluruh pekerjaan berat
// (unduh dari Apify, judul/caption DeepSeek, unggah Cloudinary, render
// Creatomate) dikerjakan workflow n8n "TV Rakyat - Proses Video".
//
// n8n membalas CEPAT dengan kode antrian, lalu bekerja di latar belakang
// sambil menuliskan tahapnya ke Supabase. Aplikasi memantau kemajuannya
// lewat GET /api/video-antrian/<kode>.
import { NextRequest } from "next/server";
import { panggilWebhookN8n, N8nBelumDiaturError } from "@/lib/n8n";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { bolehProsesVideo } from "@/types";
import { adalahPimred } from "@/lib/jabatan";
import { wewenangTv } from "@/lib/tv-tim";
import { pastikanFiturAktif } from "@/lib/fitur-server";

export const dynamic = "force-dynamic";

/** Tambahkan skema https:// bila pengguna lupa menuliskannya */
function normalisasiLink(link: string): string {
  const t = link.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/** Link valid bila host-nya tiktok.com / instagram.com (termasuk subdomain) */
function linkValid(link: string): boolean {
  try {
    const url = new URL(normalisasiLink(link));
    return (
      /(^|\.)tiktok\.com$/.test(url.hostname) ||
      /(^|\.)instagram\.com$/.test(url.hostname)
    );
  } catch {
    return false;
  }
}

function errorStatus(pesan: string, status: number): Error {
  return Object.assign(new Error(pesan), { status });
}

export async function POST(request: NextRequest) {
  return bungkus(async () => {
    // Otomatisasi video hanya untuk tim TV Rakyat (dan master).
    // Super admin sengaja TIDAK diberi akses: produksi video adalah
    // tanggung jawab timnya, dan setiap video tercatat atas nama
    // penggeneratenya. Diperiksa di server, bukan sekadar dengan
    // menyembunyikan tabnya.
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    const pengguna = await userDariToken(token);

    if (!pengguna) {
      throw errorStatus("Sesi tidak berlaku. Masuk lagi.", 401);
    }
    await pastikanFiturAktif(
      pengguna,
      "tv.proses",
      "Pemrosesan video otomatis sedang dimatikan untuk peran Anda.",
    );
    if (!(await wewenangTv(pengguna)).proses) {
      throw errorStatus(
        "Hanya tim TV Rakyat yang boleh memproses video.",
        403,
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      link?: string;
      video_asli?: string;
      judul_overlay?: string;
      highlight?: string;
      caption_asli?: string;
      sumber_akun?: string;
      caption_sumber?: string;
    };

    // `video_asli` (doksli) adalah yang benar-benar diunduh & dirender.
    // `link` hanya penanda sumber aslinya. Kalau doksli tidak diisi,
    // pakai link biasa supaya alur lama tetap jalan.
    const linkSumber = (body.link ?? "").trim();
    const doksli = (body.video_asli ?? "").trim() || linkSumber;

    if (!doksli) {
      throw errorStatus("Link video wajib diisi", 400);
    }
    if (!linkValid(doksli)) {
      throw errorStatus(
        "Link harus berasal dari tiktok.com atau instagram.com",
        400,
      );
    }

    try {
      const hasil = (await panggilWebhookN8n("N8N_WEBHOOK_PROSES_VIDEO", {
        link: linkSumber ? normalisasiLink(linkSumber) : normalisasiLink(doksli),
        video_asli: normalisasiLink(doksli),
        judul_overlay: (body.judul_overlay ?? "").trim(),
        highlight: (body.highlight ?? "").trim(),
        caption_asli: (body.caption_asli ?? "").trim(),
        sumber_akun: (body.sumber_akun ?? "").trim(),
        caption_sumber: (body.caption_sumber ?? "").trim(),
        // Jejak pertanggungjawaban: nama ini tampil di riwayat
        // pemrosesan, sehingga setiap video punya penanggung jawab.
        digenerate_oleh: pengguna.nama,
        digenerate_user_id: Number(pengguna.id),
      })) as { kode?: string };

      if (!hasil?.kode) {
        throw new Error(
          "Otomatisasi n8n tidak mengembalikan kode antrian. Cek workflow 'TV Rakyat - Proses Video'.",
        );
      }

      return { kode: hasil.kode };
    } catch (e) {
      if (e instanceof N8nBelumDiaturError) {
        throw errorStatus(e.message, 503);
      }
      throw e;
    }
  });
}

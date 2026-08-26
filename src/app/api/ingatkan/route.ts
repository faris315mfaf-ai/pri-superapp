// POST /api/ingatkan — kirim pengingat WhatsApp ke kader yang belum komentar
//
// Aplikasi TIDAK mengirim WhatsApp sendiri. Nomor & pesan dikirim ke
// webhook n8n, dan n8n yang meneruskannya ke Fonnte — supaya token
// Fonnte tetap tersimpan di n8n dan tidak pernah masuk ke aplikasi.
//
// Body: { id_postingan: string }
import { supabase } from "@/lib/supabase";
import { bungkus, pastikanSukses } from "@/lib/api-helper";
import { panggilWebhookN8n, N8nBelumDiaturError } from "@/lib/n8n";

export const dynamic = "force-dynamic";

type BarisRekap = {
  nama_kader: string;
  nomor_wa: string;
  sudah_komentar: boolean;
  akun_wajib: string;
};

export async function POST(request: Request) {
  return bungkus(async () => {
    const body = (await request.json().catch(() => ({}))) as {
      id_postingan?: string;
    };
    const idPostingan = (body.id_postingan ?? "").trim();
    if (!idPostingan) {
      throw Object.assign(new Error("Postingan tidak disebutkan"), { status: 400 });
    }

    const db = supabase();

    // Ambil daftar kader yang BELUM komentar di postingan ini
    const rekap = pastikanSukses(
      await db
        .from("v_app_rekap")
        .select("nama_kader, nomor_wa, sudah_komentar, akun_wajib")
        .eq("id_postingan", idPostingan),
      "rekap kepatuhan",
    ) as BarisRekap[];

    const belum = rekap.filter((r) => !r.sudah_komentar);
    if (belum.length === 0) {
      return { sukses: true, terkirim: 0, pesan: "Semua kader sudah komentar" };
    }

    // Ambil link postingan untuk disertakan dalam pesan
    const post = pastikanSukses(
      await db
        .from("v_app_postingan")
        .select("link_postingan, akun_wajib")
        .eq("id_postingan", idPostingan)
        .limit(1),
      "data postingan",
    ) as { link_postingan: string; akun_wajib: string }[];

    const link = post[0]?.link_postingan ?? "";
    const akun = post[0]?.akun_wajib ?? belum[0]?.akun_wajib ?? "";

    // Kader tanpa nomor WA tidak bisa dihubungi — dilaporkan apa adanya,
    // jangan dianggap "terkirim" supaya laporan ke admin jujur.
    const bisaDikirim = belum.filter((r) => r.nomor_wa && r.nomor_wa.trim() !== "");
    const tanpaNomor = belum.length - bisaDikirim.length;

    if (bisaDikirim.length === 0) {
      return {
        sukses: false,
        terkirim: 0,
        tanpa_nomor: tanpaNomor,
        pesan: "Tidak ada kader yang punya nomor WhatsApp terdaftar",
      };
    }

    try {
      await panggilWebhookN8n("N8N_WEBHOOK_INGATKAN", {
        id_postingan: idPostingan,
        akun_wajib: akun,
        link_postingan: link,
        penerima: bisaDikirim.map((r) => ({
          nama_kader: r.nama_kader,
          nomor_wa: r.nomor_wa,
        })),
      });
    } catch (e) {
      if (e instanceof N8nBelumDiaturError) {
        throw Object.assign(new Error(e.message), { status: 503 });
      }
      throw e;
    }

    return {
      sukses: true,
      terkirim: bisaDikirim.length,
      tanpa_nomor: tanpaNomor,
    };
  });
}

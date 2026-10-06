// =====================================================================
// POST /api/tv/stok-tim — "Upload Official" dari Stok Video Tim (5 Okt 2026).
// Body: { stok_id, judul? }
//
// Video di Stok Video Tim (mesin Auto Edit, akun tim TV Rakyat Official)
// disalin ke penyimpanan — R2 bila sudah diatur, selain itu bucket privat
// Supabase "tvrku" (sama dengan TVR Saya) — lalu dicatat di video_antrian — sama seperti unggahan manual
// — sehingga pratinjau & unggah Official yang sudah ada (/api/tv/unggah:
// pilih platform, caption, jadwal, Ayrshare) langsung bisa dipakai.
//
//   • Pengirim harus anggota tim TV (identitasTim) DAN berhak unggah ke
//     sosmed Official (lib/tv-tim bolehUploadVideo).
//   • Berhak ACC → langsung "SIAP DITINJAU"/disetujui; selain itu "MENUNGGU ACC".
//   • Berkas: tv-stok/<kode>.mp4. Tautannya bertanda tangan 7 hari (batas
//     SigV4), jadi media dihapus 6 hari setelah dikirim — penyapunya berjalan
//     di rute ini setiap kali dipanggil (tanpa kolom database baru: jalur
//     berkas diturunkan dari kode).
// =====================================================================
import { request as mintaHttp, type IncomingMessage } from "node:http";
import { request as mintaHttps } from "node:https";
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { bolehAccVideo, bolehUploadVideo } from "@/lib/tv-tim";
import { ID_TIM, identitasTim, socketAutoEdit } from "@/lib/autoedit";
import { hapusVideoR2, MAKS_UMUR_URL_DETIK, presignR2, r2Siap } from "@/lib/r2";
import { catatAudit } from "@/lib/audit";
import { siarkanTv } from "@/lib/tv-langsung";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AWALAN_KODE = "vid-stok-";
const kunciR2 = (kode: string) => `tv-stok/${kode}.mp4`;
/** Media dihapus sebelum tautan bertanda tangannya (7 hari) kedaluwarsa. */
const UMUR_MEDIA_MS = 6 * 24 * 3600 * 1000;
const MAKS_BYTE = 300 * 1_048_576;

function galat(pesan: string, status: number): Error {
  return Object.assign(new Error(pesan), { status });
}

/** Buka berkas video stok tim dari mesin Auto Edit (lewat socket/jembatan). */
function bukaBerkasStok(stokId: string): Promise<IncomingMessage> {
  return new Promise((ok, gagal) => {
    const req = mintaHttp(
      {
        socketPath: socketAutoEdit(),
        path: `/api/tvr/stok/${encodeURIComponent(stokId)}/berkas`,
        method: "GET",
        headers: { "x-autoedit-pengguna": ID_TIM.tv },
        timeout: 60_000,
      },
      ok,
    );
    req.on("timeout", () => req.destroy(new Error("Mesin Auto Edit tidak menjawab.")));
    req.on("error", gagal);
    req.end();
  });
}

/**
 * Anggota tim yang MEMBUAT video stok ini (job mesin mencatat `anggota`),
 * untuk Riwayat "diedit oleh". Gagal/tidak ada = null — tidak menghalangi kiriman.
 */
function anggotaPembuatStok(stokId: string): Promise<string | null> {
  return new Promise((ok) => {
    const req = mintaHttp(
      {
        socketPath: socketAutoEdit(),
        path: "/api/tvr/stok",
        method: "GET",
        headers: { "x-autoedit-pengguna": ID_TIM.tv },
        timeout: 10_000,
      },
      (res) => {
        let isi = "";
        res.setEncoding("utf8");
        res.on("data", (b: string) => {
          if (isi.length < 2_000_000) isi += b;
        });
        res.on("end", () => {
          try {
            const j = JSON.parse(isi) as { stok?: { id?: string; anggota?: string | null }[] };
            const a = j.stok?.find((s) => s.id === stokId)?.anggota;
            ok(a && /^\d{1,12}$/.test(String(a)) ? String(a) : null);
          } catch {
            ok(null);
          }
        });
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => ok(null));
    req.end();
  });
}

/** Bucket cadangan bila R2 belum diatur — sama dengan TVR Saya (privat). */
const BUCKET = "tvrku";

/** Alirkan isi `sumber` lewat PUT bertanda tangan (tanpa ditampung di memori). */
function alirkanPut(sumber: IncomingMessage, url: string, panjang: number): Promise<void> {
  return new Promise((ok, gagal) => {
    const req = mintaHttps(
      url,
      { method: "PUT", headers: { "Content-Length": String(panjang), "Content-Type": "video/mp4" } },
      (res) => {
        res.resume();
        res.on("end", () =>
          (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300
            ? ok()
            : gagal(new Error(`Penyimpanan menolak berkas (${res.statusCode}).`)),
        );
      },
    );
    req.on("error", gagal);
    sumber.on("error", (e) => req.destroy(e));
    sumber.pipe(req);
  });
}

/** Hapus media R2 video stok yang sudah lewat masa simpan (paling banyak 20 sekali jalan). */
async function sapuKedaluwarsa(): Promise<void> {
  const db = supabase();
  const { data } = await db
    .from("video_antrian")
    .select("kode")
    .like("kode", `${AWALAN_KODE}%`)
    .not("hapus_media_pada", "is", null)
    .lt("hapus_media_pada", new Date().toISOString())
    .limit(20);
  for (const b of data ?? []) {
    const kode = String(b.kode);
    // Berkasnya bisa di R2 atau di bucket cadangan — bersihkan keduanya.
    const r2 = r2Siap() ? await hapusVideoR2(kunciR2(kode)).catch(() => false) : false;
    const { error } = await db.storage.from(BUCKET).remove([kunciR2(kode)]);
    if (r2 || !error) {
      await db.from("video_antrian").update({ hapus_media_pada: null, hasil_render_url: "", video_asli: "" }).eq("kode", kode);
    }
  }
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!(await identitasTim(user, "tv"))) throw galat("Hanya untuk tim TV Rakyat Official.", 403);
    if (!(await bolehUploadVideo(user))) {
      throw galat("Anda belum berhak mengunggah ke akun TV Rakyat Official.", 403);
    }

    const body = (await request.json().catch(() => ({}))) as { stok_id?: string; judul?: string };
    const stokId = String(body.stok_id ?? "").trim();
    if (!/^[0-9a-f]{6,32}$/i.test(stokId)) throw galat("Video stok tidak dikenal.", 400);

    // Penyapu: jangan gagalkan pengiriman bila pembersihan bermasalah.
    await sapuKedaluwarsa().catch((e) => console.error("[tv/stok-tim] penyapu:", e));

    const acak = Math.random().toString(36).slice(2, 8);
    const kode = `${AWALAN_KODE}${Date.now().toString(36)}-${acak}`;
    const key = kunciR2(kode);

    const sumber = await bukaBerkasStok(stokId).catch(() => {
      throw galat("Mesin Auto Edit tidak bisa dihubungi. Coba lagi sebentar.", 503);
    });
    const panjang = Number(sumber.headers["content-length"] ?? 0);
    if (sumber.statusCode !== 200 || !panjang) {
      sumber.resume();
      throw galat(
        sumber.statusCode === 404 ? "Video stok tidak ditemukan (mungkin sudah lewat masa simpan)." : "Video stok gagal diambil.",
        sumber.statusCode === 404 ? 404 : 502,
      );
    }
    if (panjang > MAKS_BYTE) {
      sumber.resume();
      throw galat("Video terlalu besar untuk dikirim ke akun Official.", 413);
    }
    // R2 bila diatur (bandwidth keluar gratis), selain itu bucket Supabase.
    const pakaiR2 = r2Siap();
    let urlPut = pakaiR2 ? presignR2("PUT", key, 900) : "";
    if (!pakaiR2) {
      const { data, error } = await supabase().storage.from(BUCKET).createSignedUploadUrl(key);
      if (error || !data) {
        sumber.resume();
        console.error("[tv/stok-tim] siapkan unggahan:", error?.message);
        throw galat("Penyimpanan video belum siap. Coba lagi.", 502);
      }
      urlPut = data.signedUrl;
    }
    await alirkanPut(sumber, urlPut, panjang).catch((e) => {
      console.error("[tv/stok-tim] simpan berkas:", e);
      throw galat("Video gagal disalin ke penyimpanan. Coba lagi.", 502);
    });

    const urlVideo = pakaiR2
      ? presignR2("GET", key, MAKS_UMUR_URL_DETIK)
      : ((await supabase().storage.from(BUCKET).createSignedUrl(key, MAKS_UMUR_URL_DETIK)).data?.signedUrl ?? "");
    if (!urlVideo) throw galat("Tautan video gagal dibuat. Coba lagi.", 502);
    const acc = await bolehAccVideo(user);
    const kini = new Date().toISOString();
    // Riwayat (sql/65): pembuat video di Edit Otomatis; bila tak tercatat,
    // pengirimnya sendiri.
    const idEditor = await anggotaPembuatStok(stokId);
    let editor = { id: Number(user.id), nama: user.nama };
    if (idEditor && idEditor !== String(user.id)) {
      const { data: org } = await supabase().from("app_user").select("id, nama").eq("id", Number(idEditor)).maybeSingle();
      if (org) editor = { id: Number(org.id), nama: String(org.nama) };
    }
    const judul = String(body.judul ?? "").trim().slice(0, 60) || `Video tim ${user.nama.split(" ")[0]}`;
    const baris = {
      kode,
      judul,
      judul_overlay: judul,
      caption_asli: "",
      jenis: "INSTAGRAM",
      link: "",
      video_asli: urlVideo,
      // Kolom sumber_upload dibatasi (workflow|manual): video stok = unggahan
      // manual; pembedanya awalan kode "vid-stok-".
      sumber_upload: "manual",
      status: acc ? "SIAP DITINJAU" : "MENUNGGU ACC",
      persetujuan: acc ? "disetujui" : "menunggu",
      persetujuan_oleh: acc ? user.nama : null,
      persetujuan_pada: acc ? kini : null,
      diupload_oleh: user.nama,
      diupload_oleh_id: Number(user.id),
      diedit_oleh: editor.nama,
      diedit_oleh_id: editor.id,
      hasil_render_url: urlVideo,
      hapus_media_pada: new Date(Date.now() + UMUR_MEDIA_MS).toISOString(),
      tahap: 5,
      persen: 100,
      tahap_nama: acc ? "Siap diunggah ke akun Official" : "Menunggu persetujuan Pimred",
      jam_tanggal: kini,
    };
    const { error } = await supabase().from("video_antrian").insert(baris);
    if (error) {
      console.error("[tv/stok-tim] simpan:", error.message);
      if (pakaiR2) await hapusVideoR2(key).catch(() => false);
      else await supabase().storage.from(BUCKET).remove([key]);
      throw new Error("Gagal mencatat video. Coba lagi.");
    }

    siarkanTv("kirim");
    catatAudit(user.id, "stok_tim", `Mengirim video Stok Tim ke antrean Official: "${judul}"`, {
      request,
      detail: { kode, judul, stok_id: stokId },
    });
    // Bentuk VideoAntrian (id = kode) supaya layar langsung membuka pratinjau unggah.
    return {
      video: {
        id: kode,
        judul,
        link: "",
        jenis: "INSTAGRAM",
        video_asli: urlVideo,
        caption_asli: "",
        judul_overlay: judul,
        highlight: "",
        status: baris.status,
        link_instagram: "",
        thumbnail_url: "",
        jam_tanggal: kini,
        platform_terunggah: [],
        hasil_render_url: urlVideo,
        caption_platform: null,
        persetujuan: baris.persetujuan,
        persetujuan_oleh: baris.persetujuan_oleh,
        sumber_upload: "manual",
        diupload_oleh: user.nama,
      },
    };
  });
}

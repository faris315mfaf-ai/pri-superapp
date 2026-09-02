// ============================================================
// STUDIO PALUGODAM (3 Sep 2026) — KHUSUS SISI SERVER.
//
// Alur: sumber (link TikTok/IG lewat TikHub → berkas disalin ke R2, atau
// berkas unggahan admin) → teks per profil (DeepSeek) → render Creatomate
// per template profil → Siaran Serentak ke upload-post (video hasil render
// masing-masing profil).
// ============================================================
import { supabase } from "@/lib/supabase";
import { mediaDariLink } from "@/lib/tikhub";
import { MAKS_UMUR_URL_DETIK, dariR2, hapusVideoR2, presignR2, r2Siap } from "@/lib/r2";
import { mulaiRender, statusRender } from "@/lib/creatomate";

/** Batas unduhan video sumber dari link (byte). */
const MAKS_SUMBER_BYTE = 120 * 1024 * 1024;
/** Berkas sumber dihapus dari penyimpanan setelah ini (hari). */
const UMUR_SUMBER_HARI = 3;

export type Sumber = {
  path: string;
  url: string;
  platform: string;
  caption: string;
  ukuran: number;
  akun: string;
};

/** URL sumber yang selalu segar (R2 bertanda tangan 7 hari, dibuat ulang tiap dibaca). */
export function urlSumber(path: string, urlTersimpan: string): string {
  if (!path) return "";
  if (r2Siap() && !urlTersimpan.includes("/storage/v1/")) {
    return presignR2("GET", path, MAKS_UMUR_URL_DETIK);
  }
  return urlTersimpan;
}

/** Ambil video dari link TikTok/Instagram (TikHub) lalu simpan ke penyimpanan kita. */
export async function simpanSumberDariLink(link: string, userId: number): Promise<Sumber> {
  const media = await mediaDariLink(link);
  const res = await fetch(media.url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Video sumber tidak bisa diunduh (${res.status}).`);
  const panjang = Number(res.headers.get("content-length") ?? 0);
  if (panjang > MAKS_SUMBER_BYTE) throw new Error("Video sumber lebih dari 120 MB.");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength === 0) throw new Error("Video sumber kosong.");
  if (buf.byteLength > MAKS_SUMBER_BYTE) throw new Error("Video sumber lebih dari 120 MB.");

  const key = `${userId}/studio-${Date.now()}-${media.kode}.mp4`;
  if (r2Siap()) {
    const put = await fetch(presignR2("PUT", key, 15 * 60), {
      method: "PUT",
      headers: { "content-type": "video/mp4" },
      body: buf,
    });
    if (!put.ok) throw new Error(`Penyimpanan R2 menolak berkas (${put.status}).`);
    return {
      path: key,
      url: presignR2("GET", key, MAKS_UMUR_URL_DETIK),
      platform: media.platform,
      caption: media.caption,
      ukuran: buf.byteLength,
      akun: media.akun,
    };
  }
  const db = supabase();
  const { error } = await db.storage.from("tvrku").upload(key, buf, { contentType: "video/mp4" });
  if (error) throw new Error(`Penyimpanan menolak berkas: ${error.message}`);
  return {
    path: key,
    url: db.storage.from("tvrku").getPublicUrl(key).data.publicUrl,
    platform: media.platform,
    caption: media.caption,
    ukuran: buf.byteLength,
    akun: media.akun,
  };
}

export function hapusPadaSumber(): string {
  return new Date(Date.now() + UMUR_SUMBER_HARI * 86_400_000).toISOString();
}

// ------------------------------------------------------------
// Render Creatomate per item
// ------------------------------------------------------------

type ItemRender = {
  id: number;
  profil: string;
  template_id: string;
  judul: string;
  highlight: string;
  render_id: string | null;
  render_status: string;
};

/** Mulai render untuk item yang belum/gagal — satu panggilan per item. */
export async function mulaiRenderProyek(
  proyekId: number,
): Promise<{ dimulai: number; gagal: { profil: string; pesan: string }[] }> {
  const db = supabase();
  const { data: proyek } = await db
    .from("studio_proyek")
    .select("id, sumber_path, sumber_url, sumber_akun")
    .eq("id", proyekId)
    .maybeSingle();
  if (!proyek) throw new Error("Proyek tidak ditemukan.");
  const sumberAkun = String(proyek.sumber_akun ?? "").trim();
  const sumberUrl = urlSumber(String(proyek.sumber_path ?? ""), String(proyek.sumber_url ?? ""));
  if (!sumberUrl) throw new Error("Video sumber belum ada / sudah disapu.");

  const [{ data: items }, { data: templates }] = await Promise.all([
    db
      .from("studio_proyek_item")
      .select("id, profil, template_id, judul, highlight, render_id, render_status")
      .eq("proyek_id", proyekId)
      .in("render_status", ["belum", "gagal"]),
    db.from("palugodam_template").select("profil, template_id, elemen_video, elemen_judul, elemen_highlight, elemen_sumber, aktif"),
  ]);
  const tpl = new Map((templates ?? []).map((t) => [String(t.profil), t]));
  let dimulai = 0;
  const gagal: { profil: string; pesan: string }[] = [];
  for (const it of (items ?? []) as ItemRender[]) {
    const t = tpl.get(it.profil);
    const templateId = String(it.template_id || t?.template_id || "");
    if (!templateId) {
      gagal.push({ profil: it.profil, pesan: "Belum ada template Creatomate untuk profil ini." });
      await db
        .from("studio_proyek_item")
        .update({ render_status: "gagal", pesan: "Belum ada template Creatomate.", diperbarui_pada: new Date().toISOString() })
        .eq("id", it.id);
      continue;
    }
    if (!it.judul.trim()) {
      gagal.push({ profil: it.profil, pesan: "Judul masih kosong." });
      continue;
    }
    try {
      const mods: Record<string, string> = {
        [`${String(t?.elemen_video || "video-1")}.source`]: sumberUrl,
        [`${String(t?.elemen_judul || "judul")}.text`]: it.judul,
      };
      if (it.highlight.trim()) mods[`${String(t?.elemen_highlight || "highlight")}.text`] = it.highlight;
      // Teks "Sumber: @akun" bila template punya elemen sumber & akun asal diketahui.
      const elemenSumber = String(t?.elemen_sumber ?? "").trim();
      if (elemenSumber && sumberAkun) mods[`${elemenSumber}.text`] = `Sumber: ${sumberAkun.startsWith("@") ? sumberAkun : `@${sumberAkun}`}`;
      const r = await mulaiRender({ templateId, modifications: mods });
      await db
        .from("studio_proyek_item")
        .update({
          template_id: templateId,
          render_id: r.id,
          render_status: r.status === "failed" ? "gagal" : "rendering",
          render_url: r.status === "succeeded" ? r.url : "",
          pesan: r.galat,
          diperbarui_pada: new Date().toISOString(),
        })
        .eq("id", it.id);
      dimulai += 1;
    } catch (e) {
      const pesan = (e instanceof Error ? e.message : "Gagal memulai render").slice(0, 300);
      gagal.push({ profil: it.profil, pesan });
      await db
        .from("studio_proyek_item")
        .update({ render_status: "gagal", pesan, diperbarui_pada: new Date().toISOString() })
        .eq("id", it.id);
    }
  }
  if (dimulai > 0) await db.from("studio_proyek").update({ status: "render" }).eq("id", proyekId);
  return { dimulai, gagal };
}

/** Tanya Creatomate status item yang masih rendering; simpan hasilnya. */
export async function segarkanRenderProyek(proyekId: number): Promise<void> {
  const db = supabase();
  const { data: items } = await db
    .from("studio_proyek_item")
    .select("id, render_id")
    .eq("proyek_id", proyekId)
    .eq("render_status", "rendering")
    .not("render_id", "is", null);
  for (const it of items ?? []) {
    try {
      const r = await statusRender(String(it.render_id));
      if (r.status === "succeeded") {
        await db
          .from("studio_proyek_item")
          .update({ render_status: "sukses", render_url: r.url, pesan: "", diperbarui_pada: new Date().toISOString() })
          .eq("id", it.id);
      } else if (r.status === "failed") {
        await db
          .from("studio_proyek_item")
          .update({ render_status: "gagal", pesan: r.galat || "Render gagal", diperbarui_pada: new Date().toISOString() })
          .eq("id", it.id);
      }
    } catch (e) {
      console.error("[studio] status render", it.render_id, e instanceof Error ? e.message : e);
    }
  }
}

// ------------------------------------------------------------
// Siaran dari hasil render
// ------------------------------------------------------------

export async function buatSiaranDariProyek(opsi: {
  proyekId: number;
  userId: number;
  platforms: string[];
  jadwal?: string;
}): Promise<{ siaranId: number; jumlah: number }> {
  const db = supabase();
  const { data: proyek } = await db
    .from("studio_proyek")
    .select("id, caption_inti, sumber_caption")
    .eq("id", opsi.proyekId)
    .maybeSingle();
  if (!proyek) throw new Error("Proyek tidak ditemukan.");
  const { data: items } = await db
    .from("studio_proyek_item")
    .select("profil, user_id, judul, caption, render_url, render_status")
    .eq("proyek_id", opsi.proyekId)
    .eq("render_status", "sukses")
    .neq("render_url", "");
  if (!items || items.length === 0) throw new Error("Belum ada video hasil render yang sukses.");

  const captionDasar = String(proyek.caption_inti || proyek.sumber_caption || "");
  const { data: induk, error } = await db
    .from("tvr_siaran")
    .insert({
      dibuat_oleh: opsi.userId,
      judul: String(items[0].judul || "TV Rakyat").slice(0, 100),
      caption: captionDasar.slice(0, 2200),
      platforms: opsi.platforms,
      video_path: "",
      video_url: String(items[0].render_url),
      jadwal: opsi.jadwal ?? null,
      hapus_media_pada: null,
    })
    .select("id")
    .single();
  if (error || !induk) throw new Error("Gagal membuat siaran.");

  const { error: eItem } = await db.from("tvr_siaran_item").insert(
    items.map((it) => ({
      siaran_id: Number(induk.id),
      profil: String(it.profil),
      user_id: it.user_id == null ? null : Number(it.user_id),
      platforms: opsi.platforms,
      status: "menunggu",
      video_url: String(it.render_url),
      judul: String(it.judul || "").slice(0, 100) || null,
      caption: String(it.caption || captionDasar).slice(0, 2200) || null,
    })),
  );
  if (eItem) throw new Error("Gagal membuat daftar profil siaran.");
  await db
    .from("studio_proyek")
    .update({ status: "siaran", siaran_id: Number(induk.id) })
    .eq("id", opsi.proyekId);
  return { siaranId: Number(induk.id), jumlah: items.length };
}

/** Hapus berkas sumber proyek yang lewat umur — dipanggil penyapu media. */
export async function bersihkanMediaStudio(): Promise<void> {
  try {
    const db = supabase();
    const { data } = await db
      .from("studio_proyek")
      .select("id, sumber_path, sumber_url")
      .not("hapus_media_pada", "is", null)
      .lt("hapus_media_pada", new Date().toISOString())
      .neq("sumber_path", "")
      .limit(10);
    if (!data || data.length === 0) return;
    const jalur: string[] = [];
    for (const b of data) {
      const path = String(b.sumber_path ?? "");
      if (!path) continue;
      if (dariR2(String(b.sumber_url ?? "")) || (r2Siap() && !String(b.sumber_url ?? "").includes("/storage/v1/"))) {
        await hapusVideoR2(path);
      } else jalur.push(path);
    }
    if (jalur.length > 0) await db.storage.from("tvrku").remove(jalur);
    await db
      .from("studio_proyek")
      .update({ hapus_media_pada: null, sumber_path: "" })
      .in("id", data.map((b) => b.id));
  } catch (e) {
    console.error("[studio] penyapu media:", e);
  }
}

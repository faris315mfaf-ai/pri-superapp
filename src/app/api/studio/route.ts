// /api/studio — STUDIO PALUGODAM (3 Sep 2026). Akses: master, super_admin,
// dan kepala Divisi PALUGODAM (akun ADMIN PALUGODAM).
//
// GET ?bagian=template → kesiapan (deepseek/creatomate/upload-post/r2),
//                        peta profil↔template, daftar profil upload-post.
// GET ?bagian=proyek   → daftar proyek saya (10 terakhir).
// GET ?id=<proyek>     → proyek + item (status render disegarkan) + siaran.
// POST { aksi, ... }   → template_simpan | template_hapus | sumber_link |
//                        sumber_berkas | teks_simpan | generate | item_simpan |
//                        render | siaran | hapus
//                        auto_edit   (3 Sep 2026: 1 klik = pilih SEMUA profil
//                                     PALUGODAM bertemplate → DeepSeek judul/
//                                     highlight/caption → render semua)
//                        auto_upload (1 klik = tunggu render selesai → siaran
//                                     ke semua sosmed tertaut tiap profil)
import { after } from "next/server";
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { adalahAdminStudio, DIVISI_PALUGODAM } from "@/lib/struktur";
import { daftarProfilUp, uploadPostSiap } from "@/lib/upload-post";
import { deepseekSiap, generateCaption, generateHighlight, generateJudul } from "@/lib/deepseek";
import { creatomateSiap } from "@/lib/creatomate";
import { MAKS_UMUR_URL_DETIK, presignR2, r2Siap, hapusVideoR2, dariR2 } from "@/lib/r2";
import { PLATFORM_KPI } from "@/lib/kpi-video";
import { prosesSiaranSerentak } from "@/lib/siaran";
import {
  buatSiaranDariProyek,
  hapusPadaSumber,
  mulaiRenderProyek,
  segarkanRenderProyek,
  simpanSumberDariLink,
  urlSumber,
} from "@/lib/studio";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const ANGGARAN_SIARAN_MS = 240_000;
/** auto_upload: batas menunggu render yang masih berjalan (di bawah maxDuration). */
const ANGGARAN_TUNGGU_RENDER_MS = 200_000;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanAdmin(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  if (!adalahAdminStudio(user)) {
    throw Object.assign(new Error("Studio khusus Admin PALUGODAM / pengurus."), { status: 403 });
  }
  return user;
}

function kesiapan() {
  return { deepseek: deepseekSiap(), creatomate: creatomateSiap(), uploadpost: uploadPostSiap(), r2: r2Siap() };
}

/**
 * ISOLASI (3 Sep 2026): Studio hanya mengenal profil upload-post milik
 * anggota Divisi PALUGODAM — ditambah profil yang sudah punya template
 * PALUGODAM (mis. profil yang belum sempat ditautkan ke anggota).
 * Dipakai untuk daftar tampil DAN penolakan di teks_simpan.
 */
async function profilPalugodam(): Promise<{
  boleh: Set<string>;
  userPer: Map<string, number>;
  namaPer: Map<number, string>;
  tpl: Map<string, Record<string, unknown>>;
}> {
  const db = supabase();
  const [{ data: baris }, { data: tplRows }] = await Promise.all([
    db
      .from("sosmed_profile")
      .select("profile_key, user_id, app_user!inner(id, nama, divisi)")
      .eq("penyedia", "upload-post")
      .eq("jenis", "pengguna")
      .eq("app_user.divisi", DIVISI_PALUGODAM),
    db.from("palugodam_template").select("profil, template_id, label, elemen_video, elemen_judul, elemen_highlight, elemen_sumber, aktif"),
  ]);
  const userPer = new Map<string, number>();
  const namaPer = new Map<number, string>();
  for (const b of baris ?? []) {
    const u = (Array.isArray(b.app_user) ? b.app_user[0] : b.app_user) as { id?: number; nama?: string } | null;
    userPer.set(String(b.profile_key), Number(b.user_id));
    if (u) namaPer.set(Number(b.user_id), String(u.nama ?? ""));
  }
  const tpl = new Map<string, Record<string, unknown>>((tplRows ?? []).map((t) => [String(t.profil), t as Record<string, unknown>]));
  const boleh = new Set<string>([...userPer.keys(), ...tpl.keys()]);
  return { boleh, userPer, namaPer, tpl };
}

async function daftarProfilStudio() {
  const [{ profil: diUpSemua }, { boleh, userPer, namaPer, tpl: tplPer }] = await Promise.all([
    uploadPostSiap() ? daftarProfilUp() : Promise.resolve({ profil: [], kuota: 0, paket: "" }),
    profilPalugodam(),
  ]);
  const diUp = diUpSemua.filter((p) => boleh.has(p.username));
  return {
    template: [...tplPer.values()].map((t) => ({ ...t, profil: String(t.profil) })),
    profil: diUp
      .map((p) => {
        const uid = userPer.get(p.username);
        const t = tplPer.get(p.username);
        return {
          profil: p.username,
          user_id: uid == null ? null : String(uid),
          nama: uid == null ? "" : (namaPer.get(uid) ?? ""),
          akun: p.akun,
          tertaut: Object.keys(p.akun).length,
          template: t
            ? {
                template_id: String(t.template_id),
                label: String(t.label ?? ""),
                elemen_video: String(t.elemen_video ?? "video-1"),
                elemen_judul: String(t.elemen_judul ?? "judul"),
                elemen_highlight: String(t.elemen_highlight ?? "highlight"),
                elemen_sumber: String(t.elemen_sumber ?? "sumber"),
                aktif: t.aktif === true,
              }
            : null,
        };
      })
      .sort((a, b) => Number(Boolean(b.template)) - Number(Boolean(a.template)) || a.profil.localeCompare(b.profil)),
  };
}

async function bacaProyek(id: number, userId: number) {
  const db = supabase();
  const { data: p } = await db
    .from("studio_proyek")
    .select("*")
    .eq("id", id)
    .eq("dibuat_oleh", userId)
    .maybeSingle();
  if (!p) throw Object.assign(new Error("Proyek tidak ditemukan."), { status: 404 });
  return p;
}

async function muatProyekLengkap(id: number, userId: number) {
  const db = supabase();
  const p = await bacaProyek(id, userId);
  const { data: items } = await db
    .from("studio_proyek_item")
    .select("id, profil, user_id, template_id, judul, highlight, caption, render_status, render_url, pesan")
    .eq("proyek_id", id)
    .order("profil", { ascending: true });
  const ids = [...new Set((items ?? []).map((i) => i.user_id).filter((x) => x != null).map(Number))];
  const namaPer = new Map<number, string>();
  if (ids.length > 0) {
    const { data: u } = await db.from("app_user").select("id, nama").in("id", ids);
    for (const x of u ?? []) namaPer.set(Number(x.id), String(x.nama ?? ""));
  }
  let siaran: Record<string, unknown> | null = null;
  if (p.siaran_id) {
    const { data: si } = await db
      .from("tvr_siaran_item")
      .select("id, profil, platforms, status, pesan")
      .eq("siaran_id", Number(p.siaran_id))
      .order("id", { ascending: true });
    const daftar = si ?? [];
    const hitung = (st: string) => daftar.filter((d) => d.status === st).length;
    siaran = {
      id: String(p.siaran_id),
      item: daftar.map((d) => ({ ...d, id: String(d.id) })),
      ringkas: {
        total: daftar.length,
        terkirim: hitung("terkirim"),
        gagal: hitung("gagal"),
        menunggu: hitung("menunggu") + hitung("diproses"),
        dibatalkan: hitung("dibatalkan"),
      },
    };
    if (hitung("menunggu") > 0) after(() => prosesSiaranSerentak(ANGGARAN_SIARAN_MS));
  }
  return {
    proyek: {
      id: String(p.id),
      sumber_link: String(p.sumber_link ?? ""),
      sumber_platform: String(p.sumber_platform ?? ""),
      sumber_url: urlSumber(String(p.sumber_path ?? ""), String(p.sumber_url ?? "")),
      sumber_caption: String(p.sumber_caption ?? ""),
      penjelasan: String(p.penjelasan ?? ""),
      caption_inti: String(p.caption_inti ?? ""),
      sumber_akun: String(p.sumber_akun ?? ""),
      status: String(p.status ?? "sumber"),
      siaran_id: p.siaran_id == null ? null : String(p.siaran_id),
      dibuat_pada: String(p.dibuat_pada),
    },
    item: (items ?? []).map((i) => ({
      id: String(i.id),
      profil: String(i.profil),
      user_id: i.user_id == null ? null : String(i.user_id),
      nama: i.user_id == null ? "" : (namaPer.get(Number(i.user_id)) ?? ""),
      template_id: String(i.template_id ?? ""),
      judul: String(i.judul ?? ""),
      highlight: String(i.highlight ?? ""),
      caption: String(i.caption ?? ""),
      render_status: String(i.render_status ?? "belum"),
      render_url: String(i.render_url ?? ""),
      pesan: String(i.pesan ?? ""),
    })),
    siaran,
  };
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanAdmin(request);
    const url = new URL(request.url);
    const db = supabase();
    const bagian = url.searchParams.get("bagian");
    const id = Number(url.searchParams.get("id") ?? 0);

    if (bagian === "template") {
      const d = await daftarProfilStudio();
      return { siap: kesiapan(), ...d };
    }
    if (id > 0) {
      // Segarkan status render yang masih berjalan sebelum dibaca.
      if (creatomateSiap()) await segarkanRenderProyek(id);
      return muatProyekLengkap(id, Number(user.id));
    }
    const { data } = await db
      .from("studio_proyek")
      .select("id, sumber_link, sumber_platform, sumber_caption, caption_inti, status, siaran_id, dibuat_pada")
      .eq("dibuat_oleh", Number(user.id))
      .order("id", { ascending: false })
      .limit(10);
    const ids = (data ?? []).map((p) => Number(p.id));
    const jumlah = new Map<number, number>();
    if (ids.length > 0) {
      const { data: it } = await db.from("studio_proyek_item").select("proyek_id").in("proyek_id", ids);
      for (const x of it ?? []) jumlah.set(Number(x.proyek_id), (jumlah.get(Number(x.proyek_id)) ?? 0) + 1);
    }
    return {
      siap: kesiapan(),
      data: (data ?? []).map((p) => ({
        id: String(p.id),
        ringkas: String(p.caption_inti || p.sumber_caption || p.sumber_link || "(tanpa caption)").slice(0, 80),
        sumber_platform: String(p.sumber_platform ?? ""),
        status: String(p.status ?? "sumber"),
        siaran_id: p.siaran_id == null ? null : String(p.siaran_id),
        jumlah_item: jumlah.get(Number(p.id)) ?? 0,
        dibuat_pada: String(p.dibuat_pada),
      })),
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanAdmin(request);
    const db = supabase();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const aksi = String(body.aksi ?? "");
    const userId = Number(user.id);

    // ---------- Pengaturan template ----------
    if (aksi === "template_simpan") {
      const profil = String(body.profil ?? "").trim();
      const templateId = String(body.template_id ?? "").trim();
      if (!profil || !templateId) {
        throw Object.assign(new Error("Profil dan ID template wajib diisi."), { status: 400 });
      }
      {
        // Template hanya untuk profil milik anggota Divisi PALUGODAM.
        const { userPer } = await profilPalugodam();
        if (!userPer.has(profil)) {
          const { data: adaTpl } = await db.from("palugodam_template").select("profil").eq("profil", profil).maybeSingle();
          if (!adaTpl) {
            throw Object.assign(
              new Error("Profil ini bukan milik anggota Divisi PALUGODAM — tautkan dulu ke anggota divisi itu."),
              { status: 400 },
            );
          }
        }
      }
      const { error } = await db.from("palugodam_template").upsert(
        {
          profil,
          template_id: templateId,
          label: String(body.label ?? "").trim().slice(0, 80),
          elemen_video: String(body.elemen_video ?? "video-1").trim() || "video-1",
          elemen_judul: String(body.elemen_judul ?? "judul").trim() || "judul",
          elemen_highlight: String(body.elemen_highlight ?? "highlight").trim() || "highlight",
          // Boleh dikosongkan bila template tidak punya elemen sumber.
          elemen_sumber: String(body.elemen_sumber ?? "sumber").trim(),
          aktif: body.aktif !== false,
          diperbarui_pada: new Date().toISOString(),
        },
        { onConflict: "profil" },
      );
      if (error) throw new Error("Gagal menyimpan template.");
      return { sukses: true };
    }
    if (aksi === "template_hapus") {
      await db.from("palugodam_template").delete().eq("profil", String(body.profil ?? ""));
      return { sukses: true };
    }

    // ---------- Sumber ----------
    if (aksi === "sumber_link") {
      const link = String(body.link ?? "").trim();
      if (!/^https?:\/\/(www\.|vm\.|vt\.|m\.)?(tiktok\.com|instagram\.com)\//i.test(link)) {
        throw Object.assign(new Error("Link harus TikTok atau Instagram."), { status: 400 });
      }
      const s = await simpanSumberDariLink(link, userId);
      const { data, error } = await db
        .from("studio_proyek")
        .insert({
          dibuat_oleh: userId,
          sumber_link: link,
          sumber_platform: s.platform,
          sumber_path: s.path,
          sumber_url: s.url,
          sumber_caption: s.caption.slice(0, 2200),
          caption_inti: s.caption.slice(0, 2200),
          sumber_akun: s.akun.slice(0, 80),
          ukuran_byte: s.ukuran,
          hapus_media_pada: hapusPadaSumber(),
        })
        .select("id")
        .single();
      if (error || !data) throw new Error("Gagal menyimpan proyek.");
      return { sukses: true, id: String(data.id) };
    }
    if (aksi === "sumber_berkas") {
      const r2Key = String(body.r2_key ?? "").trim();
      const path = String(body.path ?? "").trim();
      const pakaiR2 = Boolean(r2Key);
      const kunci = pakaiR2 ? r2Key : path;
      if (!kunci.startsWith(`${userId}/`) || !/^[\w./-]+$/.test(kunci)) {
        throw Object.assign(new Error("Berkas video tidak dikenal."), { status: 400 });
      }
      const urlAwal = pakaiR2
        ? presignR2("GET", r2Key, MAKS_UMUR_URL_DETIK)
        : db.storage.from("tvrku").getPublicUrl(path).data.publicUrl;
      const { data, error } = await db
        .from("studio_proyek")
        .insert({
          dibuat_oleh: userId,
          sumber_platform: "berkas",
          sumber_path: kunci,
          sumber_url: urlAwal,
          ukuran_byte: Number.isFinite(Number(body.ukuran)) ? Math.floor(Number(body.ukuran)) : null,
          hapus_media_pada: hapusPadaSumber(),
        })
        .select("id")
        .single();
      if (error || !data) throw new Error("Gagal menyimpan proyek.");
      return { sukses: true, id: String(data.id) };
    }

    // ---------- Semua aksi berikut butuh proyek milik sendiri ----------
    const proyekId = Number(body.proyek_id ?? 0);
    if (!proyekId) throw Object.assign(new Error("Proyek tidak disebutkan."), { status: 400 });
    const proyek = await bacaProyek(proyekId, userId);

    if (aksi === "hapus") {
      const path = String(proyek.sumber_path ?? "");
      if (path) {
        if (dariR2(String(proyek.sumber_url ?? "")) || r2Siap()) await hapusVideoR2(path).catch(() => {});
        else await db.storage.from("tvrku").remove([path]).catch(() => {});
      }
      await db.from("studio_proyek").delete().eq("id", proyekId);
      return { sukses: true };
    }

    if (aksi === "teks_simpan") {
      const captionInti = String(body.caption_inti ?? "").trim().slice(0, 2200);
      const penjelasan = String(body.penjelasan ?? "").trim().slice(0, 1000);
      const sumberAkun = String(body.sumber_akun ?? "").trim().replace(/^@+/, "").slice(0, 80);
      const profilDipilih = [...new Set(((body.profil as unknown[]) ?? []).map((p) => String(p).trim()).filter(Boolean))];
      if (profilDipilih.length === 0) {
        throw Object.assign(new Error("Pilih minimal satu profil."), { status: 400 });
      }
      const { boleh, userPer, tpl } = await profilPalugodam();
      const asing = profilDipilih.filter((p) => !boleh.has(p));
      if (asing.length > 0) {
        throw Object.assign(
          new Error(`Bukan profil Divisi PALUGODAM: ${asing.slice(0, 5).join(", ")}${asing.length > 5 ? "…" : ""}`),
          { status: 400 },
        );
      }
      const tplPer = new Map([...tpl.entries()].map(([k, t]) => [k, String(t.template_id ?? "")]));
      // Item yang tidak dipilih lagi & belum dirender dibuang.
      await db
        .from("studio_proyek_item")
        .delete()
        .eq("proyek_id", proyekId)
        .not("profil", "in", `(${profilDipilih.map((p) => `"${p}"`).join(",")})`)
        .in("render_status", ["belum", "gagal"]);
      const { error } = await db.from("studio_proyek_item").upsert(
        profilDipilih.map((p) => ({
          proyek_id: proyekId,
          profil: p,
          user_id: userPer.get(p) ?? null,
          template_id: tplPer.get(p) ?? "",
        })),
        { onConflict: "proyek_id,profil", ignoreDuplicates: true },
      );
      if (error) throw new Error("Gagal menyimpan daftar profil.");
      await db
        .from("studio_proyek")
        .update({ caption_inti: captionInti, penjelasan, sumber_akun: sumberAkun, status: "teks" })
        .eq("id", proyekId);
      return { sukses: true };
    }

    if (aksi === "generate") {
      if (!deepseekSiap()) {
        throw Object.assign(new Error("DeepSeek belum diatur — isi DEEPSEEK_API_KEY di Vercel."), { status: 503 });
      }
      const jenis = String(body.jenis ?? "");
      const { data: items } = await db
        .from("studio_proyek_item")
        .select("id, profil")
        .eq("proyek_id", proyekId)
        .order("profil", { ascending: true });
      if (!items || items.length === 0) {
        throw Object.assign(new Error("Simpan dulu daftar profil tujuan."), { status: 400 });
      }
      const n = items.length;
      const bahan = {
        caption: String(proyek.caption_inti || proyek.sumber_caption || ""),
        penjelasan: String(proyek.penjelasan ?? ""),
      };
      let hasil: string[];
      let kolom: "judul" | "highlight" | "caption";
      if (jenis === "judul") {
        hasil = await generateJudul({ ...bahan, n });
        kolom = "judul";
      } else if (jenis === "highlight") {
        hasil = await generateHighlight({ ...bahan, n });
        kolom = "highlight";
      } else if (jenis === "caption") {
        if (!bahan.caption) throw Object.assign(new Error("Isi caption inti dulu."), { status: 400 });
        hasil = await generateCaption({ captionInti: bahan.caption, n });
        kolom = "caption";
      } else {
        throw Object.assign(new Error("jenis harus judul / highlight / caption."), { status: 400 });
      }
      for (let i = 0; i < items.length; i++) {
        await db
          .from("studio_proyek_item")
          .update({ [kolom]: hasil[i % hasil.length], diperbarui_pada: new Date().toISOString() })
          .eq("id", items[i].id);
      }
      return { sukses: true, jumlah: items.length };
    }

    if (aksi === "item_simpan") {
      const daftar = (body.item as { profil?: string; judul?: string; highlight?: string; caption?: string }[]) ?? [];
      for (const it of daftar.slice(0, 60)) {
        if (!it.profil) continue;
        await db
          .from("studio_proyek_item")
          .update({
            judul: String(it.judul ?? "").trim().slice(0, 100),
            highlight: String(it.highlight ?? "").trim().slice(0, 40),
            caption: String(it.caption ?? "").trim().slice(0, 2200),
            diperbarui_pada: new Date().toISOString(),
          })
          .eq("proyek_id", proyekId)
          .eq("profil", String(it.profil));
      }
      return { sukses: true };
    }

    if (aksi === "render") {
      if (!creatomateSiap()) {
        throw Object.assign(new Error("Creatomate belum diatur — isi CREATOMATE_API_KEY di Vercel."), { status: 503 });
      }
      return { sukses: true, ...(await mulaiRenderProyek(proyekId)) };
    }

    if (aksi === "siaran") {
      if (!uploadPostSiap()) throw new Error("upload-post belum tersambung.");
      const platforms = [...new Set(((body.platforms as unknown[]) ?? []).map((p) => String(p).toLowerCase()))].filter((p) =>
        (PLATFORM_KPI as readonly string[]).includes(p),
      );
      if (platforms.length === 0) {
        throw Object.assign(new Error("Pilih minimal satu platform."), { status: 400 });
      }
      let jadwal: string | undefined;
      if (body.jadwal) {
        const t = Date.parse(String(body.jadwal));
        if (!Number.isFinite(t) || t < Date.now() + 4 * 60_000) {
          throw Object.assign(new Error("Jadwal minimal 5 menit dari sekarang."), { status: 400 });
        }
        if (t > Date.now() + 7 * 86_400_000) {
          throw Object.assign(new Error("Jadwal maksimal 7 hari ke depan."), { status: 400 });
        }
        jadwal = new Date(t).toISOString();
      }
      const r = await buatSiaranDariProyek({ proyekId, userId, platforms, jadwal });
      after(() => prosesSiaranSerentak(ANGGARAN_SIARAN_MS));
      return { sukses: true, siaran_id: String(r.siaranId), jumlah: r.jumlah };
    }

    // ---------- AUTO EDIT (1 klik, 3 Sep 2026) ----------
    // Seluruh profil anggota Divisi PALUGODAM yang punya template aktif
    // dipilih otomatis → DeepSeek membuat judul/highlight/caption berbeda
    // per profil (tiga permintaan berjalan bersamaan) → semua versi dirender.
    if (aksi === "auto_edit") {
      if (!deepseekSiap()) {
        throw Object.assign(new Error("DeepSeek belum diatur — isi DEEPSEEK_API_KEY di Vercel."), { status: 503 });
      }
      if (!creatomateSiap()) {
        throw Object.assign(new Error("Creatomate belum diatur — isi CREATOMATE_API_KEY di Vercel."), { status: 503 });
      }
      if (!urlSumber(String(proyek.sumber_path ?? ""), String(proyek.sumber_url ?? ""))) {
        throw Object.assign(new Error("Video sumber belum ada / sudah disapu. Buat proyek baru."), { status: 400 });
      }
      const { boleh, userPer, tpl } = await profilPalugodam();
      const target = [...boleh].filter((p) => tpl.get(p)?.aktif === true).sort();
      const tanpaTemplate = [...boleh].filter((p) => tpl.get(p)?.aktif !== true).sort();
      if (target.length === 0) {
        throw Object.assign(
          new Error("Belum ada profil PALUGODAM yang punya template aktif. Isi dulu di tab Template."),
          { status: 400 },
        );
      }
      // Bahan: kiriman UI (bila ada) menimpa yang tersimpan; kosong → caption asli video.
      const captionInti = (String(body.caption_inti ?? "").trim() || String(proyek.caption_inti || proyek.sumber_caption || "")).slice(0, 2200);
      const penjelasan = (String(body.penjelasan ?? "").trim() || String(proyek.penjelasan ?? "")).slice(0, 1000);
      const sumberAkun = (String(body.sumber_akun ?? "").trim() || String(proyek.sumber_akun ?? "")).replace(/^@+/, "").slice(0, 80);
      if (!captionInti) {
        throw Object.assign(new Error("Caption inti kosong — tulis caption dulu sebagai bahan judul & caption."), { status: 400 });
      }
      // Item yang bukan target & belum jadi videonya dibuang; target di-upsert.
      await db
        .from("studio_proyek_item")
        .delete()
        .eq("proyek_id", proyekId)
        .not("profil", "in", `(${target.map((p) => `"${p}"`).join(",")})`)
        .in("render_status", ["belum", "gagal"]);
      const { error: eItem } = await db.from("studio_proyek_item").upsert(
        target.map((p) => ({
          proyek_id: proyekId,
          profil: p,
          user_id: userPer.get(p) ?? null,
          template_id: String(tpl.get(p)?.template_id ?? ""),
        })),
        { onConflict: "proyek_id,profil", ignoreDuplicates: true },
      );
      if (eItem) throw new Error("Gagal menyiapkan daftar profil.");
      await db
        .from("studio_proyek")
        .update({ caption_inti: captionInti, penjelasan, sumber_akun: sumberAkun, status: "teks" })
        .eq("id", proyekId);

      const n = target.length;
      const [judul, highlight, caption] = await Promise.all([
        generateJudul({ caption: captionInti, penjelasan, n }),
        generateHighlight({ caption: captionInti, penjelasan, n }),
        generateCaption({ captionInti, n }),
      ]);
      // Teks hanya ditulis ke item yang belum punya video jadi (sukses/rendering
      // dibiarkan — supaya auto edit ulang tidak merusak hasil yang sudah ada).
      const { data: items } = await db
        .from("studio_proyek_item")
        .select("id, profil, render_status")
        .eq("proyek_id", proyekId)
        .order("profil", { ascending: true });
      let i = 0;
      let ditulis = 0;
      for (const it of items ?? []) {
        const idx = i++;
        if (it.render_status === "sukses" || it.render_status === "rendering") continue;
        await db
          .from("studio_proyek_item")
          .update({
            judul: judul[idx % judul.length],
            highlight: highlight[idx % highlight.length],
            caption: caption[idx % caption.length],
            diperbarui_pada: new Date().toISOString(),
          })
          .eq("id", it.id);
        ditulis += 1;
      }
      const r = await mulaiRenderProyek(proyekId);
      return {
        sukses: true,
        profil: n,
        teks_ditulis: ditulis,
        dimulai: r.dimulai,
        gagal: r.gagal,
        tanpa_template: tanpaTemplate,
      };
    }

    // ---------- AUTO UPLOAD (1 klik, 3 Sep 2026) ----------
    // Tunggu render yang masih berjalan (maks ±200 dtk), lalu siaran ke SEMUA
    // sosmed yang tertaut di tiap profil, langsung (tanpa jadwal).
    if (aksi === "auto_upload") {
      if (!uploadPostSiap()) throw new Error("upload-post belum tersambung.");
      const platforms = [...PLATFORM_KPI];
      const batas = Date.now() + ANGGARAN_TUNGGU_RENDER_MS;
      for (;;) {
        if (creatomateSiap()) await segarkanRenderProyek(proyekId);
        const { data: sisa } = await db
          .from("studio_proyek_item")
          .select("id")
          .eq("proyek_id", proyekId)
          .eq("render_status", "rendering")
          .limit(1);
        if (!sisa || sisa.length === 0) break;
        if (Date.now() > batas) {
          throw Object.assign(new Error("Render belum selesai — ketuk AUTO UPLOAD lagi sebentar lagi."), { status: 409 });
        }
        await new Promise((r) => setTimeout(r, 6_000));
      }
      if (proyek.siaran_id) {
        const { data: berjalan } = await db
          .from("tvr_siaran_item")
          .select("id")
          .eq("siaran_id", Number(proyek.siaran_id))
          .in("status", ["menunggu", "diproses"])
          .limit(1);
        if (berjalan && berjalan.length > 0) {
          throw Object.assign(new Error("Siaran sebelumnya masih berjalan — tunggu selesai dulu."), { status: 409 });
        }
      }
      const r = await buatSiaranDariProyek({ proyekId, userId, platforms });
      after(() => prosesSiaranSerentak(ANGGARAN_SIARAN_MS));
      return { sukses: true, siaran_id: String(r.siaranId), jumlah: r.jumlah };
    }

    throw Object.assign(new Error("aksi tidak dikenal."), { status: 400 });
  });
}

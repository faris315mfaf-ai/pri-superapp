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
//                        4 Sep 2026 — MODE PER AKUN: tiap akun punya link,
//                        caption, judul & highlight sendiri; render baru boleh
//                        setelah semua akun lengkap:
//                        proyek_per_akun | item_sumber_link | item_generate |
//                        item_hapus
import { after } from "next/server";
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { adalahAdminStudio, DIVISI_PALUGODAM } from "@/lib/struktur";
import {
  buatProfilUp,
  daftarProfilUp,
  hapusProfilUp,
  tautanHubungkanUp,
  uploadPostSiap,
  type ProfilUp,
} from "@/lib/upload-post";
import {
  deepseekSiap,
  generateCaption,
  generateHighlight,
  generateJudul,
} from "@/lib/deepseek";
import { creatomateSiap } from "@/lib/creatomate";
import {
  MAKS_UMUR_URL_DETIK,
  presignR2,
  r2Siap,
  hapusVideoR2,
  dariR2,
} from "@/lib/r2";
import { PLATFORM_KPI } from "@/lib/kpi-video";
import { prosesSiaranSerentak } from "@/lib/siaran";
import {
  buatSiaranDariProyek,
  hapusPadaSumber,
  kurangnyaItem,
  mulaiRenderProyek,
  segarkanRenderProyek,
  simpanSumberDariLink,
  urlSumber,
} from "@/lib/studio";

/** Link sumber yang diterima Studio (TikTok / Instagram). */
const POLA_LINK_SUMBER =
  /^https?:\/\/(www\.|vm\.|vt\.|m\.)?(tiktok\.com|instagram\.com)\//i;

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
  if (!user)
    throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  if (!adalahAdminStudio(user)) {
    throw Object.assign(
      new Error("Studio khusus Admin PALUGODAM / pengurus."),
      { status: 403 },
    );
  }
  return user;
}

function kesiapan() {
  return {
    deepseek: deepseekSiap(),
    creatomate: creatomateSiap(),
    uploadpost: uploadPostSiap(),
    r2: r2Siap(),
  };
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
  // Dua kueri terpisah lalu dicocokkan di sini — BUKAN embed PostgREST
  // (`app_user!inner(...)`): tabel sosmed_profile tidak punya foreign key ke
  // app_user, jadi embed itu gagal diam-diam (data kosong) dan Studio tidak
  // mengenal satu pun profil anggota (bug nyata, ditemukan 3 Sep 2026).
  const [{ data: anggotaRows }, { data: profilRows }, { data: tplRows }] =
    await Promise.all([
      db
        .from("app_user")
        .select("id, nama")
        .eq("divisi", DIVISI_PALUGODAM)
        .eq("aktif", true),
      db
        .from("sosmed_profile")
        .select("profile_key, user_id")
        .eq("penyedia", "upload-post")
        .eq("jenis", "pengguna")
        .not("user_id", "is", null),
      db
        .from("palugodam_template")
        .select(
          "profil, template_id, label, elemen_video, elemen_judul, elemen_highlight, elemen_sumber, aktif",
        ),
    ]);
  const namaPer = new Map<number, string>(
    (anggotaRows ?? []).map((u) => [Number(u.id), String(u.nama ?? "")]),
  );
  const userPer = new Map<string, number>();
  for (const b of profilRows ?? []) {
    const uid = Number(b.user_id);
    if (namaPer.has(uid)) userPer.set(String(b.profile_key), uid);
  }
  const tpl = new Map<string, Record<string, unknown>>(
    (tplRows ?? []).map((t) => [
      String(t.profil),
      t as Record<string, unknown>,
    ]),
  );
  // ATURAN (3 Sep 2026): 1 anggota = 1 profil upload-post + 1 template. Yang
  // "boleh" dipakai Studio hanya profil yang TERTAUT ke anggota PALUGODAM;
  // template yang profilnya tidak tertaut ke siapa pun = "yatim" (hanya bisa
  // dihapus di tab Anggota & Template).
  const boleh = new Set<string>([...userPer.keys()]);
  return { boleh, userPer, namaPer, tpl };
}

const PLATFORM6_SET = new Set([
  "instagram",
  "tiktok",
  "youtube",
  "facebook",
  "threads",
  "twitter",
]);
const POLA_USERNAME_UP = /^[a-z0-9][a-z0-9-]{2,39}$/;

/** Usulan nama profil upload-post dari username/nama anggota. */
function usulanProfil(username: string, nama: string, id: number): string {
  const dasar = (username || nama)
    .toLowerCase()
    .replace(/@.*$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const inti =
    dasar.length >= 3
      ? dasar.slice(0, 40)
      : `${dasar || "anggota"}-pri-${id}`.slice(0, 40);
  return POLA_USERNAME_UP.test(inti) ? inti : `anggota-pri-${id}`;
}

/** Sinkron akun tertaut profil → akun_tvr_user (pola sama dengan dashboard tv-anggota). */
async function sinkronAkunTertautStudio(
  db: ReturnType<typeof supabase>,
  userId: number,
  akun: Record<string, string>,
): Promise<number> {
  let tersinkron = 0;
  for (const [platform, mentah] of Object.entries(akun)) {
    if (!PLATFORM6_SET.has(platform)) continue;
    const username = String(mentah).toLowerCase().replace(/^@+/, "");
    if (!username) continue;
    const { data: ada } = await db
      .from("akun_tvr_user")
      .select("id, user_id")
      .eq("platform", platform)
      .ilike("username", username)
      .maybeSingle();
    if (!ada) {
      const { error } = await db
        .from("akun_tvr_user")
        .insert({ user_id: userId, platform, username, terhubung: true });
      if (!error) tersinkron += 1;
    } else if (Number(ada.user_id) === userId) {
      await db
        .from("akun_tvr_user")
        .update({ terhubung: true })
        .eq("id", ada.id);
    }
  }
  return tersinkron;
}

/**
 * Tab "Anggota & Template" (3 Sep 2026): SEMUA anggota aktif Divisi PALUGODAM
 * beserta profil upload-post-nya (kalau ada) dan template Creatomate-nya —
 * satu tempat untuk admin menautkan keduanya. Juga: profil upload-post yang
 * belum tertaut ke siapa pun (untuk "Tautkan yang ada") dan template yatim.
 */
async function daftarAnggotaStudio() {
  const db = supabase();
  const kosong: { profil: ProfilUp[]; kuota: number; paket: string } = {
    profil: [],
    kuota: 0,
    paket: "",
  };
  const [{ data: orang }, { userPer, tpl }, up, { data: semuaTertaut }] =
    await Promise.all([
      db
        .from("app_user")
        .select("id, nama, username, posisi_divisi, avatar_url")
        .eq("divisi", DIVISI_PALUGODAM)
        .eq("aktif", true)
        .eq("status", "aktif")
        .order("nama", { ascending: true }),
      profilPalugodam(),
      uploadPostSiap()
        ? daftarProfilUp().catch(() => kosong)
        : Promise.resolve(kosong),
      db
        .from("sosmed_profile")
        .select("profile_key")
        .eq("penyedia", "upload-post"),
    ]);
  const akunPer = new Map<string, Record<string, string>>(
    up.profil.map((p) => [p.username, p.akun]),
  );
  const adaDiUp = new Set(up.profil.map((p) => p.username));
  const profilPerUser = new Map<number, string>();
  for (const [profil, uid] of userPer) profilPerUser.set(uid, profil);
  const bentukTemplate = (t: Record<string, unknown> | undefined) =>
    t
      ? {
          template_id: String(t.template_id ?? ""),
          label: String(t.label ?? ""),
          elemen_video: String(t.elemen_video ?? "video-1"),
          elemen_judul: String(t.elemen_judul ?? "judul"),
          elemen_highlight: String(t.elemen_highlight ?? "highlight"),
          elemen_sumber: String(t.elemen_sumber ?? "sumber"),
          aktif: t.aktif === true,
        }
      : null;
  const anggota = (orang ?? [])
    .map((o) => {
      const id = Number(o.id);
      const profil = profilPerUser.get(id) ?? "";
      const akun = profil ? (akunPer.get(profil) ?? {}) : {};
      return {
        user_id: String(id),
        nama: String(o.nama ?? ""),
        username: String(o.username ?? ""),
        posisi: String(o.posisi_divisi ?? "anggota"),
        avatar_url: String(o.avatar_url ?? ""),
        profil,
        // Profil tercatat di aplikasi tapi tidak ada lagi di upload-post.
        profil_hilang:
          Boolean(profil) &&
          uploadPostSiap() &&
          up.profil.length > 0 &&
          !adaDiUp.has(profil),
        akun,
        tertaut: Object.keys(akun).length,
        template: bentukTemplate(profil ? tpl.get(profil) : undefined),
        usulan_profil: usulanProfil(
          String(o.username ?? ""),
          String(o.nama ?? ""),
          id,
        ),
      };
    })
    // Kepala dulu, lalu nama.
    .sort(
      (a, b) =>
        Number(b.posisi === "kepala") - Number(a.posisi === "kepala") ||
        a.nama.localeCompare(b.nama),
    );
  const tertautSet = new Set(
    (semuaTertaut ?? []).map((s) => String(s.profile_key)),
  );
  const profil_bebas = up.profil
    .filter((p) => !tertautSet.has(p.username))
    .map((p) => ({ profil: p.username, tertaut: Object.keys(p.akun).length }))
    .sort((a, b) => a.profil.localeCompare(b.profil));
  const template_yatim = [...tpl.values()]
    .filter((t) => !userPer.has(String(t.profil)))
    .map((t) => ({
      profil: String(t.profil),
      template_id: String(t.template_id ?? ""),
      label: String(t.label ?? ""),
    }));
  return {
    anggota,
    profil_bebas,
    template_yatim,
    kuota: up.kuota,
    paket: up.paket,
  };
}

async function daftarProfilStudio() {
  const [{ profil: diUpSemua }, { boleh, userPer, namaPer, tpl: tplPer }] =
    await Promise.all([
      uploadPostSiap()
        ? daftarProfilUp()
        : Promise.resolve({ profil: [], kuota: 0, paket: "" }),
      profilPalugodam(),
    ]);
  const diUp = diUpSemua.filter((p) => boleh.has(p.username));
  return {
    template: [...tplPer.values()].map((t) => ({
      ...t,
      profil: String(t.profil),
    })),
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
      .sort(
        (a, b) =>
          Number(Boolean(b.template)) - Number(Boolean(a.template)) ||
          a.profil.localeCompare(b.profil),
      ),
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
  if (!p)
    throw Object.assign(new Error("Proyek tidak ditemukan."), { status: 404 });
  return p;
}

async function muatProyekLengkap(id: number, userId: number) {
  const db = supabase();
  const p = await bacaProyek(id, userId);
  const { data: items } = await db
    .from("studio_proyek_item")
    .select(
      "id, profil, user_id, template_id, judul, highlight, caption, render_status, render_url, pesan, sumber_link, sumber_platform, sumber_path, sumber_url, sumber_caption, sumber_akun",
    )
    .eq("proyek_id", id)
    .order("profil", { ascending: true });
  const ids = [
    ...new Set(
      (items ?? [])
        .map((i) => i.user_id)
        .filter((x) => x != null)
        .map(Number),
    ),
  ];
  const namaPer = new Map<number, string>();
  if (ids.length > 0) {
    const { data: u } = await db
      .from("app_user")
      .select("id, nama")
      .in("id", ids);
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
    if (hitung("menunggu") > 0)
      after(() => prosesSiaranSerentak(ANGGARAN_SIARAN_MS));
  }
  const perAkun = String(p.mode ?? "bersama") === "per_akun";
  return {
    proyek: {
      id: String(p.id),
      mode: perAkun ? "per_akun" : "bersama",
      sumber_link: String(p.sumber_link ?? ""),
      sumber_platform: String(p.sumber_platform ?? ""),
      sumber_url: urlSumber(
        String(p.sumber_path ?? ""),
        String(p.sumber_url ?? ""),
      ),
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
      // Sumber milik akun ini sendiri (mode per_akun).
      sumber_link: String(i.sumber_link ?? ""),
      sumber_platform: String(i.sumber_platform ?? ""),
      sumber_url: urlSumber(
        String(i.sumber_path ?? ""),
        String(i.sumber_url ?? ""),
      ),
      sumber_caption: String(i.sumber_caption ?? ""),
      sumber_akun: String(i.sumber_akun ?? ""),
      kurang: perAkun ? kurangnyaItem(i as Record<string, string>) : [],
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
      const [d, a] = await Promise.all([
        daftarProfilStudio(),
        daftarAnggotaStudio(),
      ]);
      return { siap: kesiapan(), ...d, ...a };
    }
    if (id > 0) {
      // Segarkan status render yang masih berjalan sebelum dibaca.
      if (creatomateSiap()) await segarkanRenderProyek(id);
      return muatProyekLengkap(id, Number(user.id));
    }
    const { data } = await db
      .from("studio_proyek")
      .select(
        "id, sumber_link, sumber_platform, sumber_caption, caption_inti, status, siaran_id, dibuat_pada",
      )
      .eq("dibuat_oleh", Number(user.id))
      .order("id", { ascending: false })
      .limit(10);
    const ids = (data ?? []).map((p) => Number(p.id));
    const jumlah = new Map<number, number>();
    if (ids.length > 0) {
      const { data: it } = await db
        .from("studio_proyek_item")
        .select("proyek_id")
        .in("proyek_id", ids);
      for (const x of it ?? [])
        jumlah.set(
          Number(x.proyek_id),
          (jumlah.get(Number(x.proyek_id)) ?? 0) + 1,
        );
    }
    return {
      siap: kesiapan(),
      data: (data ?? []).map((p) => ({
        id: String(p.id),
        ringkas: String(
          p.caption_inti ||
            p.sumber_caption ||
            p.sumber_link ||
            "(tanpa caption)",
        ).slice(0, 80),
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
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const aksi = String(body.aksi ?? "");
    const userId = Number(user.id);

    // ---------- Pengaturan template ----------
    if (aksi === "template_simpan") {
      const profil = String(body.profil ?? "").trim();
      const templateId = String(body.template_id ?? "").trim();
      if (!profil || !templateId) {
        throw Object.assign(new Error("Profil dan ID template wajib diisi."), {
          status: 400,
        });
      }
      {
        // Aturan 1 anggota = 1 profil + 1 template: template HANYA untuk profil
        // yang sudah tertaut ke anggota Divisi PALUGODAM.
        const { userPer } = await profilPalugodam();
        if (!userPer.has(profil)) {
          throw Object.assign(
            new Error(
              "Profil ini belum tertaut ke anggota Divisi PALUGODAM — tautkan dulu di tab Anggota & Template.",
            ),
            { status: 400 },
          );
        }
      }
      const { error } = await db.from("palugodam_template").upsert(
        {
          profil,
          template_id: templateId,
          label: String(body.label ?? "")
            .trim()
            .slice(0, 80),
          elemen_video:
            String(body.elemen_video ?? "video-1").trim() || "video-1",
          elemen_judul: String(body.elemen_judul ?? "judul").trim() || "judul",
          elemen_highlight:
            String(body.elemen_highlight ?? "highlight").trim() || "highlight",
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
      await db
        .from("palugodam_template")
        .delete()
        .eq("profil", String(body.profil ?? ""));
      return { sukses: true };
    }

    // ---------- Sumber ----------
    // ---------- Anggota ↔ profil upload-post (3 Sep 2026) ----------
    // Aturan: 1 anggota PALUGODAM = 1 profil upload-post + 1 template, semua
    // diatur admin Studio di satu tempat.
    if (
      aksi === "anggota_tautan" ||
      aksi === "anggota_profil_lepas" ||
      aksi === "anggota_profil_tautkan" ||
      aksi === "anggota_profil_buat"
    ) {
      const uid = Number(body.user_id);
      if (!Number.isFinite(uid) || uid <= 0)
        throw Object.assign(new Error("Anggota tidak disebutkan."), {
          status: 400,
        });
      const { data: orang } = await db
        .from("app_user")
        .select("id, nama, username, divisi, aktif, status")
        .eq("id", uid)
        .maybeSingle();
      if (
        !orang ||
        orang.aktif !== true ||
        orang.status !== "aktif" ||
        String(orang.divisi ?? "") !== DIVISI_PALUGODAM
      ) {
        throw Object.assign(
          new Error(
            "Anggota tidak ditemukan / bukan anggota aktif Divisi PALUGODAM.",
          ),
          { status: 404 },
        );
      }
      const { data: milik } = await db
        .from("sosmed_profile")
        .select("id, profile_key")
        .eq("penyedia", "upload-post")
        .eq("jenis", "pengguna")
        .eq("user_id", uid)
        .maybeSingle();

      if (aksi === "anggota_tautan") {
        if (!uploadPostSiap()) throw new Error("upload-post belum tersambung.");
        if (!milik)
          throw Object.assign(
            new Error(`${orang.nama} belum punya profil upload-post.`),
            { status: 400 },
          );
        return {
          url: await tautanHubungkanUp(String(milik.profile_key)),
          profil: String(milik.profile_key),
        };
      }
      if (aksi === "anggota_profil_lepas") {
        if (!milik) return { sukses: true };
        // Baris penautan dihapus; profil di upload-post dan template-nya TIDAK
        // dihapus (template jadi "yatim", bisa dihapus/ditautkan lagi).
        const { error } = await db
          .from("sosmed_profile")
          .delete()
          .eq("id", milik.id);
        if (error) throw new Error("Gagal melepas profil.");
        return { sukses: true, profil: String(milik.profile_key) };
      }

      if (!uploadPostSiap())
        throw new Error("upload-post belum tersambung (kunci API kosong).");
      if (milik) {
        throw Object.assign(
          new Error(
            `${orang.nama} sudah punya profil "${milik.profile_key}". Lepas dulu bila mau menggantinya.`,
          ),
          { status: 409 },
        );
      }
      const { profil: diUp } = await daftarProfilUp();
      let profil = "";
      let akun: Record<string, string> = {};
      let dibuatBaru = false;
      if (aksi === "anggota_profil_tautkan") {
        profil = String(body.profil ?? "").trim();
        const ada = diUp.find((p) => p.username === profil);
        if (!ada)
          throw Object.assign(
            new Error(`Profil "${profil}" tidak ada di upload-post.`),
            { status: 404 },
          );
        const { data: pemilikLain } = await db
          .from("sosmed_profile")
          .select("user_id")
          .eq("profile_key", profil)
          .maybeSingle();
        if (pemilikLain && Number(pemilikLain.user_id) !== uid) {
          throw Object.assign(
            new Error(`Profil "${profil}" sudah tertaut ke anggota lain.`),
            { status: 409 },
          );
        }
        akun = ada.akun;
      } else {
        profil = String(body.username ?? "")
          .trim()
          .toLowerCase();
        if (!POLA_USERNAME_UP.test(profil)) {
          throw Object.assign(
            new Error("Nama profil: huruf kecil, angka, strip; 3–40 karakter."),
            { status: 400 },
          );
        }
        if (diUp.some((p) => p.username === profil)) {
          throw Object.assign(
            new Error(
              `Profil "${profil}" sudah ada di upload-post — pakai "Tautkan yang ada".`,
            ),
            { status: 409 },
          );
        }
        await buatProfilUp(profil);
        dibuatBaru = true;
      }
      const { error } = await db.from("sosmed_profile").insert({
        penyedia: "upload-post",
        jenis: "pengguna",
        judul: profil,
        profile_key: profil,
        ref_id: profil,
        user_id: uid,
        dibuat_oleh: userId,
        insight_cache: null,
        insight_pada: null,
      });
      if (error) {
        if (dibuatBaru) await hapusProfilUp(profil).catch(() => {});
        console.error("[studio] tautkan profil:", error.message);
        throw new Error("Gagal menyimpan penautan profil.");
      }
      const tersinkron = await sinkronAkunTertautStudio(db, uid, akun);
      return { sukses: true, profil, dibuat: dibuatBaru, tersinkron };
    }

    if (aksi === "sumber_link") {
      const link = String(body.link ?? "").trim();
      if (!POLA_LINK_SUMBER.test(link)) {
        throw Object.assign(new Error("Link harus TikTok atau Instagram."), {
          status: 400,
        });
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
        throw Object.assign(new Error("Berkas video tidak dikenal."), {
          status: 400,
        });
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
          ukuran_byte: Number.isFinite(Number(body.ukuran))
            ? Math.floor(Number(body.ukuran))
            : null,
          hapus_media_pada: hapusPadaSumber(),
        })
        .select("id")
        .single();
      if (error || !data) throw new Error("Gagal menyimpan proyek.");
      return { sukses: true, id: String(data.id) };
    }

    // Proyek MODE PER AKUN: dibuat kosong, langsung berisi semua anggota
    // PALUGODAM yang siap (profil tertaut + template aktif). Tiap baris nanti
    // diisi link/caption/judul/highlight sendiri oleh admin.
    if (aksi === "proyek_per_akun") {
      const { boleh, userPer, tpl } = await profilPalugodam();
      const target = [...boleh]
        .filter((p) => tpl.get(p)?.aktif === true)
        .sort();
      const tanpaTemplate = [...boleh]
        .filter((p) => tpl.get(p)?.aktif !== true)
        .sort();
      if (target.length === 0) {
        throw Object.assign(
          new Error(
            "Belum ada anggota PALUGODAM yang lengkap (profil tertaut + template aktif). Atur di tab Anggota & Template.",
          ),
          { status: 400 },
        );
      }
      const { data, error } = await db
        .from("studio_proyek")
        .insert({
          dibuat_oleh: userId,
          mode: "per_akun",
          sumber_platform: "per-akun",
          status: "teks",
        })
        .select("id")
        .single();
      if (error || !data) throw new Error("Gagal membuat proyek.");
      const { error: eItem } = await db.from("studio_proyek_item").insert(
        target.map((p) => ({
          proyek_id: Number(data.id),
          profil: p,
          user_id: userPer.get(p) ?? null,
          template_id: String(tpl.get(p)?.template_id ?? ""),
        })),
      );
      if (eItem) {
        await db.from("studio_proyek").delete().eq("id", Number(data.id));
        throw new Error("Gagal menyiapkan daftar akun.");
      }
      return {
        sukses: true,
        id: String(data.id),
        akun: target.length,
        tanpa_template: tanpaTemplate,
      };
    }

    // ---------- Semua aksi berikut butuh proyek milik sendiri ----------
    const proyekId = Number(body.proyek_id ?? 0);
    if (!proyekId)
      throw Object.assign(new Error("Proyek tidak disebutkan."), {
        status: 400,
      });
    const proyek = await bacaProyek(proyekId, userId);

    if (aksi === "hapus") {
      const path = String(proyek.sumber_path ?? "");
      if (path) {
        if (dariR2(String(proyek.sumber_url ?? "")) || r2Siap())
          await hapusVideoR2(path).catch(() => {});
        else
          await db.storage
            .from("tvrku")
            .remove([path])
            .catch(() => {});
      }
      // Mode per akun: tiap item punya berkasnya sendiri.
      const { data: berkasItem } = await db
        .from("studio_proyek_item")
        .select("sumber_path, sumber_url")
        .eq("proyek_id", proyekId)
        .neq("sumber_path", "");
      for (const b of berkasItem ?? []) {
        const p = String(b.sumber_path ?? "");
        if (!p) continue;
        if (dariR2(String(b.sumber_url ?? "")) || r2Siap())
          await hapusVideoR2(p).catch(() => {});
        else
          await db.storage
            .from("tvrku")
            .remove([p])
            .catch(() => {});
      }
      await db.from("studio_proyek").delete().eq("id", proyekId);
      return { sukses: true };
    }

    if (aksi === "teks_simpan") {
      const captionInti = String(body.caption_inti ?? "")
        .trim()
        .slice(0, 2200);
      const penjelasan = String(body.penjelasan ?? "")
        .trim()
        .slice(0, 1000);
      const sumberAkun = String(body.sumber_akun ?? "")
        .trim()
        .replace(/^@+/, "")
        .slice(0, 80);
      const profilDipilih = [
        ...new Set(
          ((body.profil as unknown[]) ?? [])
            .map((p) => String(p).trim())
            .filter(Boolean),
        ),
      ];
      if (profilDipilih.length === 0) {
        throw Object.assign(new Error("Pilih minimal satu profil."), {
          status: 400,
        });
      }
      const { boleh, userPer, tpl } = await profilPalugodam();
      const asing = profilDipilih.filter((p) => !boleh.has(p));
      if (asing.length > 0) {
        throw Object.assign(
          new Error(
            `Bukan profil Divisi PALUGODAM: ${asing.slice(0, 5).join(", ")}${asing.length > 5 ? "…" : ""}`,
          ),
          { status: 400 },
        );
      }
      const tplPer = new Map(
        [...tpl.entries()].map(([k, t]) => [k, String(t.template_id ?? "")]),
      );
      // Item yang tidak dipilih lagi & belum dirender dibuang.
      await db
        .from("studio_proyek_item")
        .delete()
        .eq("proyek_id", proyekId)
        .not(
          "profil",
          "in",
          `(${profilDipilih.map((p) => `"${p}"`).join(",")})`,
        )
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
        .update({
          caption_inti: captionInti,
          penjelasan,
          sumber_akun: sumberAkun,
          status: "teks",
        })
        .eq("id", proyekId);
      return { sukses: true };
    }

    if (aksi === "generate") {
      if (!deepseekSiap()) {
        throw Object.assign(
          new Error("DeepSeek belum diatur — isi DEEPSEEK_API_KEY di Vercel."),
          { status: 503 },
        );
      }
      const jenis = String(body.jenis ?? "");
      const { data: items } = await db
        .from("studio_proyek_item")
        .select("id, profil")
        .eq("proyek_id", proyekId)
        .order("profil", { ascending: true });
      if (!items || items.length === 0) {
        throw Object.assign(new Error("Simpan dulu daftar profil tujuan."), {
          status: 400,
        });
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
        if (!bahan.caption)
          throw Object.assign(new Error("Isi caption inti dulu."), {
            status: 400,
          });
        hasil = await generateCaption({ captionInti: bahan.caption, n });
        kolom = "caption";
      } else {
        throw Object.assign(
          new Error("jenis harus judul / highlight / caption."),
          { status: 400 },
        );
      }
      for (let i = 0; i < items.length; i++) {
        await db
          .from("studio_proyek_item")
          .update({
            [kolom]: hasil[i % hasil.length],
            diperbarui_pada: new Date().toISOString(),
          })
          .eq("id", items[i].id);
      }
      return { sukses: true, jumlah: items.length };
    }

    if (aksi === "item_simpan") {
      const daftar =
        (body.item as {
          profil?: string;
          judul?: string;
          highlight?: string;
          caption?: string;
        }[]) ?? [];
      for (const it of daftar.slice(0, 60)) {
        if (!it.profil) continue;
        await db
          .from("studio_proyek_item")
          .update({
            judul: String(it.judul ?? "")
              .trim()
              .slice(0, 100),
            highlight: String(it.highlight ?? "")
              .trim()
              .slice(0, 40),
            caption: String(it.caption ?? "")
              .trim()
              .slice(0, 2200),
            diperbarui_pada: new Date().toISOString(),
          })
          .eq("proyek_id", proyekId)
          .eq("profil", String(it.profil));
      }
      return { sukses: true };
    }

    // ---------- MODE PER AKUN (4 Sep 2026) ----------
    // Tiap akun PALUGODAM mengisi link, caption, judul, dan highlight-nya
    // sendiri; render baru boleh jalan setelah semuanya lengkap.
    if (aksi === "item_sumber_link") {
      if (String(proyek.mode ?? "bersama") !== "per_akun") {
        throw Object.assign(
          new Error("Proyek ini memakai satu video bersama."),
          { status: 400 },
        );
      }
      const profil = String(body.profil ?? "").trim();
      const link = String(body.link ?? "").trim();
      if (!POLA_LINK_SUMBER.test(link)) {
        throw Object.assign(new Error("Link harus TikTok atau Instagram."), {
          status: 400,
        });
      }
      const { data: item } = await db
        .from("studio_proyek_item")
        .select("id, render_status, sumber_path, sumber_url")
        .eq("proyek_id", proyekId)
        .eq("profil", profil)
        .maybeSingle();
      if (!item)
        throw Object.assign(new Error("Akun tidak ada di proyek ini."), {
          status: 404,
        });
      if (item.render_status === "rendering") {
        throw Object.assign(
          new Error("Video akun ini sedang dirender — tunggu selesai."),
          { status: 409 },
        );
      }
      const s = await simpanSumberDariLink(link, userId);
      // Berkas lama akun ini (bila link diganti) dibuang supaya tidak menumpuk.
      const lama = String(item.sumber_path ?? "");
      if (lama && lama !== s.path) {
        if (dariR2(String(item.sumber_url ?? "")) || r2Siap())
          await hapusVideoR2(lama).catch(() => {});
        else
          await db.storage
            .from("tvrku")
            .remove([lama])
            .catch(() => {});
      }
      const { error } = await db
        .from("studio_proyek_item")
        .update({
          sumber_link: link,
          sumber_platform: s.platform,
          sumber_path: s.path,
          sumber_url: s.url,
          sumber_caption: s.caption.slice(0, 2200),
          sumber_akun: s.akun.slice(0, 80),
          ukuran_byte: s.ukuran,
          hapus_media_pada: hapusPadaSumber(),
          // Ganti link = video lama tidak berlaku lagi.
          render_status:
            item.render_status === "sukses" ? "belum" : item.render_status,
          render_url: "",
          pesan: "",
          diperbarui_pada: new Date().toISOString(),
        })
        .eq("id", item.id);
      if (error) throw new Error("Gagal menyimpan video akun ini.");
      return {
        sukses: true,
        platform: s.platform,
        caption: s.caption.slice(0, 2200),
        akun: s.akun,
      };
    }

    if (aksi === "item_hapus") {
      const profil = String(body.profil ?? "").trim();
      const { data: item } = await db
        .from("studio_proyek_item")
        .select("id, render_status, sumber_path, sumber_url")
        .eq("proyek_id", proyekId)
        .eq("profil", profil)
        .maybeSingle();
      if (!item) return { sukses: true };
      if (item.render_status === "rendering") {
        throw Object.assign(
          new Error("Sedang dirender — tunggu selesai dulu."),
          { status: 409 },
        );
      }
      const path = String(item.sumber_path ?? "");
      if (path) {
        if (dariR2(String(item.sumber_url ?? "")) || r2Siap())
          await hapusVideoR2(path).catch(() => {});
        else
          await db.storage
            .from("tvrku")
            .remove([path])
            .catch(() => {});
      }
      await db.from("studio_proyek_item").delete().eq("id", item.id);
      return { sukses: true };
    }

    // Generate teks UNTUK SATU AKUN (bahan: caption/video akun itu sendiri),
    // atau untuk semua akun yang linknya sudah ada (profil dikosongkan).
    if (aksi === "item_generate") {
      if (!deepseekSiap()) {
        throw Object.assign(
          new Error("DeepSeek belum diatur — isi DEEPSEEK_API_KEY di Vercel."),
          { status: 503 },
        );
      }
      const jenis = String(body.jenis ?? "semua");
      if (!["judul", "highlight", "caption", "semua"].includes(jenis)) {
        throw Object.assign(
          new Error("jenis harus judul / highlight / caption / semua."),
          { status: 400 },
        );
      }
      const profil = String(body.profil ?? "").trim();
      let kueri = db
        .from("studio_proyek_item")
        .select(
          "id, profil, judul, highlight, caption, sumber_caption, sumber_url, sumber_path, render_status",
        )
        .eq("proyek_id", proyekId);
      if (profil) kueri = kueri.eq("profil", profil);
      const { data: daftar } = await kueri.order("profil", { ascending: true });
      // Tanpa video, tidak ada bahan untuk ditulis.
      const target = (daftar ?? []).filter(
        (i) =>
          String(i.sumber_url ?? "") ||
          String(i.sumber_path ?? "") ||
          String(i.sumber_caption ?? ""),
      );
      if (target.length === 0) {
        throw Object.assign(
          new Error(
            profil
              ? "Isi link akun ini dulu."
              : "Belum ada akun yang linknya terisi.",
          ),
          { status: 400 },
        );
      }
      let ditulis = 0;
      const gagal: { profil: string; pesan: string }[] = [];
      for (const it of target) {
        if (it.render_status === "rendering") continue;
        const bahan = String(it.caption || it.sumber_caption || "").trim();
        if (!bahan) {
          gagal.push({
            profil: String(it.profil),
            pesan: "Tidak ada caption asli — tulis caption dulu.",
          });
          continue;
        }
        try {
          const perlu = (k: string) => jenis === "semua" || jenis === k;
          const [judul, highlight, caption] = await Promise.all([
            perlu("judul")
              ? generateJudul({ caption: bahan, penjelasan: "", n: 1 })
              : Promise.resolve([]),
            perlu("highlight")
              ? generateHighlight({ caption: bahan, penjelasan: "", n: 1 })
              : Promise.resolve([]),
            perlu("caption")
              ? generateCaption({ captionInti: bahan, n: 1 })
              : Promise.resolve([]),
          ]);
          const kolom: Record<string, string> = {
            diperbarui_pada: new Date().toISOString(),
          };
          if (judul[0]) kolom.judul = judul[0].slice(0, 100);
          if (highlight[0]) kolom.highlight = highlight[0].slice(0, 40);
          if (caption[0]) kolom.caption = caption[0].slice(0, 2200);
          await db.from("studio_proyek_item").update(kolom).eq("id", it.id);
          ditulis += 1;
        } catch (e) {
          gagal.push({
            profil: String(it.profil),
            pesan: (e instanceof Error ? e.message : "Gagal").slice(0, 200),
          });
        }
      }
      return { sukses: true, ditulis, gagal };
    }

    if (aksi === "render") {
      if (!creatomateSiap()) {
        throw Object.assign(
          new Error(
            "Creatomate belum diatur — isi CREATOMATE_API_KEY di Vercel.",
          ),
          { status: 503 },
        );
      }
      // Mode per akun: render hanya boleh jalan bila SEMUA akun sudah lengkap
      // (link + judul + caption + highlight + template) — permintaan admin
      // PALUGODAM, 4 Sep 2026.
      if (String(proyek.mode ?? "bersama") === "per_akun") {
        const { data: semua } = await db
          .from("studio_proyek_item")
          .select(
            "profil, judul, caption, highlight, template_id, sumber_url, sumber_path",
          )
          .eq("proyek_id", proyekId)
          .order("profil", { ascending: true });
        if (!semua || semua.length === 0) {
          throw Object.assign(new Error("Belum ada akun di proyek ini."), {
            status: 400,
          });
        }
        const belum = semua
          .map((i) => ({
            profil: String(i.profil),
            kurang: kurangnyaItem(i as Record<string, string>),
          }))
          .filter((x) => x.kurang.length > 0);
        if (belum.length > 0) {
          throw Object.assign(
            new Error(
              `${belum.length} akun belum lengkap: ` +
                belum
                  .slice(0, 4)
                  .map((b) => `${b.profil} (${b.kurang.join(", ")})`)
                  .join("; ") +
                (belum.length > 4 ? "…" : ""),
            ),
            { status: 400 },
          );
        }
      }
      return { sukses: true, ...(await mulaiRenderProyek(proyekId)) };
    }

    if (aksi === "siaran") {
      if (!uploadPostSiap()) throw new Error("upload-post belum tersambung.");
      const platforms = [
        ...new Set(
          ((body.platforms as unknown[]) ?? []).map((p) =>
            String(p).toLowerCase(),
          ),
        ),
      ].filter((p) => (PLATFORM_KPI as readonly string[]).includes(p));
      if (platforms.length === 0) {
        throw Object.assign(new Error("Pilih minimal satu platform."), {
          status: 400,
        });
      }
      let jadwal: string | undefined;
      if (body.jadwal) {
        const t = Date.parse(String(body.jadwal));
        if (!Number.isFinite(t) || t < Date.now() + 4 * 60_000) {
          throw Object.assign(
            new Error("Jadwal minimal 5 menit dari sekarang."),
            { status: 400 },
          );
        }
        if (t > Date.now() + 7 * 86_400_000) {
          throw Object.assign(new Error("Jadwal maksimal 7 hari ke depan."), {
            status: 400,
          });
        }
        jadwal = new Date(t).toISOString();
      }
      const r = await buatSiaranDariProyek({
        proyekId,
        userId,
        platforms,
        jadwal,
      });
      after(() => prosesSiaranSerentak(ANGGARAN_SIARAN_MS));
      return { sukses: true, siaran_id: String(r.siaranId), jumlah: r.jumlah };
    }

    // ---------- AUTO EDIT (1 klik, 3 Sep 2026) ----------
    // Seluruh profil anggota Divisi PALUGODAM yang punya template aktif
    // dipilih otomatis → DeepSeek membuat judul/highlight/caption berbeda
    // per profil (tiga permintaan berjalan bersamaan) → semua versi dirender.
    if (aksi === "auto_edit") {
      if (!deepseekSiap()) {
        throw Object.assign(
          new Error("DeepSeek belum diatur — isi DEEPSEEK_API_KEY di Vercel."),
          { status: 503 },
        );
      }
      if (!creatomateSiap()) {
        throw Object.assign(
          new Error(
            "Creatomate belum diatur — isi CREATOMATE_API_KEY di Vercel.",
          ),
          { status: 503 },
        );
      }
      if (
        !urlSumber(
          String(proyek.sumber_path ?? ""),
          String(proyek.sumber_url ?? ""),
        )
      ) {
        throw Object.assign(
          new Error("Video sumber belum ada / sudah disapu. Buat proyek baru."),
          { status: 400 },
        );
      }
      // Target = profil yang TERTAUT ke anggota PALUGODAM dan punya template aktif
      // (1 anggota = 1 profil = 1 template).
      const { boleh, userPer, tpl } = await profilPalugodam();
      const target = [...boleh]
        .filter((p) => tpl.get(p)?.aktif === true)
        .sort();
      const tanpaTemplate = [...boleh]
        .filter((p) => tpl.get(p)?.aktif !== true)
        .sort();
      if (target.length === 0) {
        throw Object.assign(
          new Error(
            "Belum ada anggota PALUGODAM yang lengkap (profil tertaut + template aktif). Atur di tab Anggota & Template.",
          ),
          { status: 400 },
        );
      }
      // Bahan: kiriman UI (bila ada) menimpa yang tersimpan; kosong → caption asli video.
      const captionInti = (
        String(body.caption_inti ?? "").trim() ||
        String(proyek.caption_inti || proyek.sumber_caption || "")
      ).slice(0, 2200);
      const penjelasan = (
        String(body.penjelasan ?? "").trim() || String(proyek.penjelasan ?? "")
      ).slice(0, 1000);
      const sumberAkun = (
        String(body.sumber_akun ?? "").trim() ||
        String(proyek.sumber_akun ?? "")
      )
        .replace(/^@+/, "")
        .slice(0, 80);
      if (!captionInti) {
        throw Object.assign(
          new Error(
            "Caption inti kosong — tulis caption dulu sebagai bahan judul & caption.",
          ),
          { status: 400 },
        );
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
        .update({
          caption_inti: captionInti,
          penjelasan,
          sumber_akun: sumberAkun,
          status: "teks",
        })
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
        if (it.render_status === "sukses" || it.render_status === "rendering")
          continue;
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
          throw Object.assign(
            new Error(
              "Render belum selesai — ketuk AUTO UPLOAD lagi sebentar lagi.",
            ),
            { status: 409 },
          );
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
          throw Object.assign(
            new Error(
              "Siaran sebelumnya masih berjalan — tunggu selesai dulu.",
            ),
            { status: 409 },
          );
        }
      }
      const r = await buatSiaranDariProyek({ proyekId, userId, platforms });
      after(() => prosesSiaranSerentak(ANGGARAN_SIARAN_MS));
      return { sukses: true, siaran_id: String(r.siaranId), jumlah: r.jumlah };
    }

    throw Object.assign(new Error("aksi tidak dikenal."), { status: 400 });
  });
}

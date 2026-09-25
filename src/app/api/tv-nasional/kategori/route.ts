// GET /api/tv-nasional/kategori?kategori=BPJS
//
// Insight PER KATEGORI untuk modul TV Rakyat Nasional (dirombak 25 Sep
// 2026). Seluruh video kategori itu — unggahan lewat SuperApp, laporan
// anggota, dan link yang ditambahkan langsung ke kategori — beserta
// angkanya per video: tayangan, suka, komentar, dibagikan.
//
// ANGKA: dari tabel tvr_video_metrik, yang DISEGARKAN TIAP HARI oleh
// penjadwal (/api/cron/metrik-video → lib/segar-metrik-video.ts) langsung
// dari upload-post (post-analytics live). Rute ini TIDAK memanggil
// upload-post sama sekali: membuka panel berkali-kali tidak menghabiskan
// kuota, dan panel tetap cepat.
//
// KATEGORI sebuah video dikenali dari:
//   • laporan_video.keyword (laporan manual, dan sejak 25 Sep 2026 juga
//     laporan otomatis dari unggahan berkategori);
//   • tvrku_post.hasil.kategori (unggahan sejak 25 Sep 2026) atau kolom
//     tvrku_post.keyword bila migrasinya sudah dijalankan;
//   • tvr_kategori_link (sql/50) bila tabelnya ada.
// Kolom/tabel yang belum ada di database dilewati, tidak membuat galat.
//
// ?mentah=<id tvrku_post>: tarik angka SATU unggahan sekarang juga
// (tombol di panel) — satu permintaan ke upload-post, dibatasi bersama.
//
// Akses: jabatan TV Rakyat Nasional, Pimpinan Redaksi, master.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { adalahPimred, adalahTvrNasional } from "@/lib/jabatan";
import { semuaBaris } from "@/lib/semua-baris";
import { kolomTabelAda } from "@/lib/kolom-struktur";
import {
  kodeMetrik,
  polaPersis,
  susunInsightKategori,
  type LaporanKategori,
  type MetrikVideoKategori,
} from "@/lib/insight-kategori";
import {
  angkaLain,
  jumlahkanMetrikPost,
  uraiMetrikPost,
  type MetrikPostTerurai,
} from "@/lib/metrik-post-up";
import { uploadPostSiap } from "@/lib/upload-post";
import { segarkanSatuUnggahan, statusSiklusMetrik } from "@/lib/segar-metrik-video";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

function potong<T>(daftar: T[], ukuran: number): T[][] {
  const hasil: T[][] = [];
  for (let i = 0; i < daftar.length; i += ukuran) hasil.push(daftar.slice(i, i + ukuran));
  return hasil;
}

type BarisPost = {
  id: number | string;
  user_id: number | string;
  judul: string | null;
  platforms: string[] | null;
  request_id: string | null;
  dibuat_pada: string;
};

type BarisLaporan = LaporanKategori & { tvrku_post_id?: unknown };

/** Angka satu platform satu unggahan untuk layar (tanpa `mentah` yang besar). */
type MetrikTampil = Omit<MetrikPostTerurai, "mentah">;

const KOLOM_POST = "id, user_id, judul, platforms, request_id, dibuat_pada";

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku."), { status: 401 });
    if (!adalahTvrNasional(user) && !adalahPimred(user)) {
      throw Object.assign(
        new Error("Hanya jabatan TV Rakyat Nasional & Pimpinan Redaksi yang bisa membuka insight ini."),
        { status: 403 },
      );
    }
    const url = new URL(request.url);
    const db = supabase();

    // ---- "Tarik sekarang" untuk satu unggahan (tombol di panel) ----
    const idMentah = Number(url.searchParams.get("mentah") ?? 0);
    if (idMentah > 0) {
      return segarkanSatuUnggahan(Math.floor(idMentah));
    }

    const kategori = (url.searchParams.get("kategori") ?? "").trim().slice(0, 120);
    if (!kategori) throw Object.assign(new Error("Sebutkan kategorinya."), { status: 400 });
    const pola = polaPersis(kategori);

    const [adaKeywordPost, adaFavorit, adaDurasi, adaSumber, adaMentah] = await Promise.all([
      kolomTabelAda("tvrku_post", "keyword"),
      kolomTabelAda("tvr_video_metrik", "favorit"),
      kolomTabelAda("tvr_video_metrik", "durasi_detik"),
      kolomTabelAda("tvr_video_metrik", "sumber"),
      kolomTabelAda("tvr_video_metrik", "mentah"),
    ]);

    // ==================================================================
    // 1. Sumber video kategori
    // ==================================================================
    const [laporan, { data: linkKategori }, { data: postHasil }, { data: postKeyword }] = await Promise.all([
      semuaBaris<BarisLaporan>(
        (dari, sampai) =>
          db
            .from("laporan_video")
            .select("id, user_id, platform, url_video, tanggal_wib, tvrku_post_id")
            .ilike("keyword", pola)
            .order("tanggal_wib", { ascending: false })
            .range(dari, sampai) as unknown as PromiseLike<{
            data: BarisLaporan[] | null;
            error: { message: string } | null;
          }>,
        20_000,
      ),
      // Tabel sql/50 — belum tentu ada; galatnya = tidak ada link tambahan.
      db
        .from("tvr_kategori_link")
        .select("id, platform, url, dibuat_pada")
        .ilike("kategori", pola)
        .order("dibuat_pada", { ascending: false })
        .limit(1000),
      db
        .from("tvrku_post")
        .select(KOLOM_POST)
        .ilike("hasil->>kategori", pola)
        .order("dibuat_pada", { ascending: false })
        .limit(1000),
      adaKeywordPost
        ? db
            .from("tvrku_post")
            .select(KOLOM_POST)
            .ilike("keyword", pola)
            .order("dibuat_pada", { ascending: false })
            .limit(1000)
        : Promise.resolve({ data: [] as BarisPost[] }),
    ]);

    // Unggahan kategori ini: kategorinya tersimpan, ATAU laporannya
    // (tautan unggahan itu) berkategori ini.
    const postSemua = new Map<string, BarisPost>();
    for (const p of [...((postHasil ?? []) as BarisPost[]), ...((postKeyword ?? []) as BarisPost[])]) {
      postSemua.set(String(p.id), p);
    }
    const idDariLaporan = [
      ...new Set(laporan.map((l) => Number(l.tvrku_post_id ?? 0)).filter((n) => n > 0 && !postSemua.has(String(n)))),
    ];
    for (const bagian of potong(idDariLaporan, 300)) {
      const { data } = await db.from("tvrku_post").select(KOLOM_POST).in("id", bagian);
      for (const p of (data ?? []) as BarisPost[]) postSemua.set(String(p.id), p);
    }
    const postingan = [...postSemua.values()].sort((a, b) => String(b.dibuat_pada).localeCompare(String(a.dibuat_pada)));

    // Tautan per platform tiap unggahan (dicatat rekonsiliasi KPI).
    const tautanPost: { post_id: string; platform: string; url: string; tanggal_wib: string }[] = [];
    for (const bagian of potong(
      postingan.map((p) => Number(p.id)),
      300,
    )) {
      const { data } = await db
        .from("laporan_video")
        .select("tvrku_post_id, platform, url_video, tanggal_wib")
        .in("tvrku_post_id", bagian);
      for (const t of data ?? []) {
        if (!t.tvrku_post_id || !t.url_video) continue;
        tautanPost.push({
          post_id: String(t.tvrku_post_id),
          platform: String(t.platform ?? "").toLowerCase(),
          url: String(t.url_video),
          tanggal_wib: String(t.tanggal_wib ?? ""),
        });
      }
    }

    // ==================================================================
    // 2. Angka per video (tvr_video_metrik)
    // ==================================================================
    const tautanKategori: LaporanKategori[] = (linkKategori ?? []).map((l) => ({
      id: `k${l.id}`,
      user_id: "",
      platform: String(l.platform ?? ""),
      url_video: String(l.url ?? ""),
      tanggal_wib: String(l.dibuat_pada ?? "").slice(0, 10),
      asal: "kategori" as const,
    }));
    const kodeSemua = [
      ...new Set(
        [
          ...laporan.map((l) => kodeMetrik(String(l.platform), String(l.url_video))),
          ...tautanKategori.map((l) => kodeMetrik(l.platform, l.url_video)),
          ...tautanPost.map((t) => kodeMetrik(t.platform, t.url)),
        ].filter((k): k is string => Boolean(k)),
      ),
    ];
    const kolomMetrik = [
      "kode, platform, judul, url, thumbnail_url, nama_akun, akun_username, waktu_posting, tayangan, suka, komentar, bagikan, diperbarui_pada",
      adaFavorit ? "favorit" : "",
      adaDurasi ? "durasi_detik" : "",
      adaSumber ? "sumber" : "",
      adaMentah ? "mentah" : "",
    ]
      .filter(Boolean)
      .join(", ");
    const metrik = new Map<string, MetrikVideoKategori>();
    const mentahPer = new Map<string, Record<string, unknown>>();
    for (const bagian of potong(kodeSemua, 200)) {
      const { data, error } = await db.from("tvr_video_metrik").select(kolomMetrik).in("kode", bagian);
      if (error) {
        console.error("[kategori] baca angka:", error.message);
        continue;
      }
      for (const m of (data ?? []) as unknown as Record<string, unknown>[]) {
        const kode = String(m.kode);
        metrik.set(kode, {
          kode,
          platform: String(m.platform ?? ""),
          judul: String(m.judul ?? ""),
          url: String(m.url ?? ""),
          thumbnail_url: String(m.thumbnail_url ?? ""),
          nama_akun: String(m.nama_akun ?? ""),
          akun_username: String(m.akun_username ?? ""),
          waktu_posting: m.waktu_posting ? String(m.waktu_posting) : null,
          tayangan: Number(m.tayangan ?? 0),
          suka: Number(m.suka ?? 0),
          komentar: Number(m.komentar ?? 0),
          bagikan: Number(m.bagikan ?? 0),
          favorit: Number(m.favorit ?? 0),
          durasi_detik: m.durasi_detik == null ? null : Number(m.durasi_detik),
          sumber: String(m.sumber ?? ""),
          diperbarui_pada: m.diperbarui_pada ? String(m.diperbarui_pada) : null,
        });
        if (m.mentah && typeof m.mentah === "object" && !Array.isArray(m.mentah)) {
          mentahPer.set(kode, m.mentah as Record<string, unknown>);
        }
      }
    }

    // ---- Nama orang (pelapor & pengunggah) ---------------------------
    const idOrang = [
      ...new Set(
        [...laporan.map((l) => Number(l.user_id)), ...postingan.map((p) => Number(p.user_id))].filter((n) => n > 0),
      ),
    ];
    const nama = new Map<string, string>();
    for (const bagian of potong(idOrang, 300)) {
      const { data } = await db.from("app_user").select("id, nama").in("id", bagian);
      for (const u of data ?? []) nama.set(String(u.id), String(u.nama ?? ""));
    }

    // ==================================================================
    // 3. Susun: daftar video unik + ringkasan, dan daftar unggahan
    // ==================================================================
    const pemilikPost = new Map(postingan.map((p) => [String(p.id), String(p.user_id)]));
    // Urutan sumber = prioritas atribusi: video yang ternyata unggahan
    // SuperApp ditandai "unggahan" walau ada juga yang melaporkannya.
    const sumber: LaporanKategori[] = [
      ...tautanPost.map((t, i) => ({
        id: `u${t.post_id}-${i}`,
        user_id: pemilikPost.get(t.post_id) ?? "",
        platform: t.platform,
        url_video: t.url,
        tanggal_wib: t.tanggal_wib,
        asal: "unggahan" as const,
      })),
      ...laporan.map((l) => ({
        id: String(l.id),
        user_id: String(l.user_id),
        platform: String(l.platform ?? ""),
        url_video: String(l.url_video ?? ""),
        tanggal_wib: String(l.tanggal_wib ?? ""),
        asal: "laporan" as const,
      })),
      ...tautanKategori,
    ];
    const { video, ringkasan } = susunInsightKategori(sumber, metrik, nama);

    const daftarPost = postingan.map((p) => {
      const perPlatform: Record<string, MetrikTampil> = {};
      let metrikPada: string | null = null;
      for (const t of tautanPost) {
        if (t.post_id !== String(p.id)) continue;
        const kode = kodeMetrik(t.platform, t.url);
        const m = kode ? metrik.get(kode) : undefined;
        if (!m) continue;
        // Angka baku dari kolom; impresi/jangkauan/angka lain hanya bila
        // kolom `mentah` (sql/50) ada — tanpa itu memang tidak diketahui.
        const mentah = kode ? mentahPer.get(kode) : undefined;
        const tambahan = mentah ? uraiMetrikPost(mentah) : null;
        perPlatform[t.platform] = {
          suka: m.suka,
          komentar: m.komentar,
          bagikan: m.bagikan,
          tayangan: m.tayangan,
          impresi: tambahan?.impresi ?? null,
          jangkauan: tambahan?.jangkauan ?? null,
          simpan: adaFavorit ? m.favorit : null,
          post_url: m.url || t.url,
          post_id: kode ?? "",
          captured_at: m.diperbarui_pada,
          lain: mentah ? angkaLain(mentah) : {},
        };
        if (m.diperbarui_pada && (!metrikPada || m.diperbarui_pada > metrikPada)) metrikPada = m.diperbarui_pada;
      }
      return {
        id: String(p.id),
        judul: String(p.judul ?? ""),
        pengunggah: nama.get(String(p.user_id)) ?? "",
        platforms: (p.platforms ?? []) as string[],
        dibuat_pada: String(p.dibuat_pada),
        metrik_pada: metrikPada,
        terlacak: /^[0-9a-f]{32}$/i.test(String(p.request_id ?? "")),
        per_platform: perPlatform,
        total: jumlahkanMetrikPost(Object.values(perPlatform)),
      };
    });
    const totalUp = jumlahkanMetrikPost(daftarPost.flatMap((p) => Object.values(p.per_platform)));

    const siklus = await statusSiklusMetrik().catch(() => null);
    return {
      kategori,
      ringkasan,
      video: video.slice(0, 300),
      ditampilkan: Math.min(300, video.length),
      postingan: daftarPost,
      postingan_terukur: daftarPost.filter((p) => p.total.platform_terukur > 0).length,
      total_up: totalUp,
      upload_post_siap: uploadPostSiap(),
      /** Kolom favorit (sql/50) ada → angka "disimpan/favorit" bermakna. */
      ada_favorit: adaFavorit,
      /** Keadaan penyegar harian — ditampilkan sebagai "diperbarui …". */
      pembaruan: siklus
        ? {
            siklus: siklus.nomor,
            mulai: siklus.mulai,
            selesai: siklus.selesai,
            terakhir: siklus.terakhir,
            jeda_sampai: siklus.jeda_sampai,
          }
        : null,
    };
  });
}

// POST /api/tv-nasional/kategori-tarik { kategori }
//
// TARIK DATA PER KATEGORI lewat Chocodata (13 Sep 2026). Semua video
// yang termasuk kategori itu — laporan anggota, unggahan lewat SuperApp,
// dan link yang ditambahkan langsung — dikumpulkan, dibuang gandanya
// lewat kode video, lalu yang belum/lama tidak diukur ditarik satu per
// satu dari Chocodata dan disimpan ke tvr_video_metrik (sumber
// 'chocodata').
//
// SATU PANGGILAN = SATU POTONGAN. Chocodata dipanggil per video dan
// masing-masing bisa beberapa detik; menarik 200 video dalam satu
// permintaan HTTP akan menabrak batas waktu fungsi. Jadi tiap panggilan
// mengerjakan sebanyak yang muat dalam ANGGARAN_MS lalu mengembalikan
// {sisa}; klien memanggil lagi sampai sisa = 0, sambil menampilkan
// kemajuannya. Yang gagal dicatat per video, tidak menghentikan yang lain.
//
// Threads & Bilibili: Chocodata belum punya endpoint — dihitung sebagai
// "tidak didukung", bukan gagal.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { adalahPimred, adalahTvrNasional } from "@/lib/jabatan";
import { semuaBaris } from "@/lib/semua-baris";
import { kodeMetrik, polaPersis } from "@/lib/insight-kategori";
import { platformDidukungChocodata, adaAngkaChocodata } from "@/lib/chocodata-urai";
import { ambilPostChocodata, chocodataSiap } from "@/lib/chocodata";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ANGGARAN_MS = 42_000;
const BASI_MS = 6 * 60 * 60_000;
const MAKS_PER_PANGGILAN = 25;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

function potong<T>(daftar: T[], ukuran: number): T[][] {
  const hasil: T[][] = [];
  for (let i = 0; i < daftar.length; i += ukuran) hasil.push(daftar.slice(i, i + ukuran));
  return hasil;
}

type Tautan = { kode: string; platform: string; url: string };

/** Semua tautan berkategori, unik per kode video. */
async function kumpulkanTautan(kategori: string): Promise<Tautan[]> {
  const db = supabase();
  const pola = polaPersis(kategori);
  const hasil = new Map<string, Tautan>();
  const masukkan = (platform: string, url: string) => {
    const p = platform.trim().toLowerCase() === "x" ? "twitter" : platform.trim().toLowerCase();
    const kode = kodeMetrik(p, url);
    if (kode && !hasil.has(kode)) hasil.set(kode, { kode, platform: p, url });
  };

  const laporan = await semuaBaris<{ platform: unknown; url_video: unknown; tvrku_post_id: unknown }>(
    (dari, sampai) =>
      db
        .from("laporan_video")
        .select("platform, url_video, tvrku_post_id")
        .ilike("keyword", pola)
        .range(dari, sampai) as unknown as PromiseLike<{
          data: { platform: unknown; url_video: unknown; tvrku_post_id: unknown }[] | null;
          error: { message: string } | null;
        }>,
    20_000,
  );
  for (const l of laporan) masukkan(String(l.platform ?? ""), String(l.url_video ?? ""));

  // Unggahan lewat SuperApp yang berkategori → URL per platform ada di laporan_video.
  const { data: post } = await db.from("tvrku_post").select("id").ilike("keyword", pola).limit(500);
  const idPost = (post ?? []).map((p) => Number(p.id));
  for (const bagian of potong(idPost, 300)) {
    const { data } = await db.from("laporan_video").select("platform, url_video").in("tvrku_post_id", bagian);
    for (const l of data ?? []) masukkan(String(l.platform ?? ""), String(l.url_video ?? ""));
  }

  const { data: link } = await db
    .from("tvr_kategori_link")
    .select("platform, url")
    .ilike("kategori", pola)
    .limit(1000);
  for (const l of link ?? []) masukkan(String(l.platform ?? ""), String(l.url ?? ""));

  return [...hasil.values()];
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku."), { status: 401 });
    if (!adalahTvrNasional(user) && !adalahPimred(user)) {
      throw Object.assign(new Error("Hanya TV Rakyat Nasional & Pimpinan Redaksi."), { status: 403 });
    }
    if (!chocodataSiap()) {
      throw Object.assign(
        new Error("Kunci Chocodata belum terpasang di server (CHOCODATA_API_KEY)."),
        { status: 503 },
      );
    }
    const body = (await request.json().catch(() => ({}))) as { kategori?: string; paksa?: boolean };
    const kategori = String(body.kategori ?? "").trim().slice(0, 120);
    if (!kategori) throw Object.assign(new Error("Sebutkan kategorinya."), { status: 400 });
    const paksa = body.paksa === true;

    const mulai = Date.now();
    const db = supabase();
    const semua = await kumpulkanTautan(kategori);

    // Yang sudah punya angka segar dilewati (kecuali dipaksa).
    const sudah = new Map<string, string | null>();
    for (const bagian of potong(semua.map((t) => t.kode), 200)) {
      const { data } = await db.from("tvr_video_metrik").select("kode, diperbarui_pada").in("kode", bagian);
      for (const m of data ?? []) sudah.set(String(m.kode), m.diperbarui_pada ? String(m.diperbarui_pada) : null);
    }
    const tidakDidukung = semua.filter((t) => !platformDidukungChocodata(t.platform));
    const antrean = semua.filter((t) => {
      if (!platformDidukungChocodata(t.platform)) return false;
      if (paksa) return true;
      const kapan = sudah.get(t.kode);
      if (kapan === undefined) return true;
      const ms = kapan ? Date.parse(kapan) : NaN;
      return !Number.isFinite(ms) || Date.now() - ms > BASI_MS;
    });

    let terisi = 0;
    let dikerjakan = 0;
    const gagal: { url: string; alasan: string }[] = [];
    for (const t of antrean.slice(0, MAKS_PER_PANGGILAN)) {
      if (Date.now() - mulai > ANGGARAN_MS) break;
      dikerjakan += 1;
      try {
        const { metrik, mentah } = await ambilPostChocodata(t.platform, t.url, 15_000);
        if (!adaAngkaChocodata(metrik)) {
          gagal.push({ url: t.url, alasan: "Chocodata menjawab tanpa angka" });
          continue;
        }
        const { error } = await db.from("tvr_video_metrik").upsert(
          {
            kode: t.kode,
            platform: t.platform,
            akun_username: metrik.akun_username,
            user_id: null,
            nama_akun: metrik.nama_akun,
            judul: metrik.judul,
            url: t.url,
            thumbnail_url: metrik.thumbnail_url,
            waktu_posting: metrik.waktu_posting,
            tayangan: metrik.tayangan ?? 0,
            suka: metrik.suka ?? 0,
            komentar: metrik.komentar ?? 0,
            bagikan: metrik.bagikan ?? 0,
            favorit: metrik.favorit ?? 0,
            durasi_detik: metrik.durasi_detik,
            sumber: "chocodata",
            mentah,
            diperbarui_pada: new Date().toISOString(),
          },
          { onConflict: "kode" },
        );
        if (error) gagal.push({ url: t.url, alasan: error.message });
        else terisi += 1;
      } catch (e) {
        gagal.push({ url: t.url, alasan: e instanceof Error ? e.message : "gagal" });
      }
    }

    return {
      kategori,
      total_video: semua.length,
      tidak_didukung: tidakDidukung.length,
      dikerjakan,
      terisi,
      gagal,
      // Sisa yang masih perlu ditarik SETELAH panggilan ini: klien
      // memanggil lagi sampai nol. Yang gagal tidak dihitung sisa —
      // kalau tidak, satu video rusak membuat pemanggilan tak berhenti.
      sisa: Math.max(0, antrean.length - dikerjakan),
      lama_ms: Date.now() - mulai,
    };
  });
}

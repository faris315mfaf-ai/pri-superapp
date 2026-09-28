// GET /api/tv-nasional/video-harian?tanggal=YYYY-MM-DD[&akun=<user_id>|<platform>][&platform=]
//
// VIDEO PER AKUN (26 Sep 2026) — "di TV Rakyat Nasional bisa melihat
// filter per akun terkait video yang diupload hari itu" (permintaan user).
//
// Sumbernya katalog tvr_video_metrik: SEMUA video akun yang tersambung
// ke upload-post (bukan hanya yang dilaporkan), dengan angka yang
// disegarkan penyegar (lib/segar-metrik-video) — video hari ini ±tiap
// 15 menit. Rute ini hanya MEMBACA (tidak memanggil upload-post), jadi
// dibuka berkali-kali pun tidak menghabiskan kuota.
//
// Hari = tanggal posting menurut WIB. `akun` = satu akun sosmed
// (user_id|platform); tanpa `akun` = semua akun hari itu.
//
// Akses: jabatan TV Rakyat Nasional, Pimpinan Redaksi, master.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { adalahPimred, adalahTvrNasional } from "@/lib/jabatan";
import { semuaBaris } from "@/lib/semua-baris";
import { kolomTabelAda } from "@/lib/kolom-struktur";
import { belumDitarik, platformApp, tanggalWib } from "@/lib/metrik-video-up";
import { statusPenyegar } from "@/lib/segar-metrik-video";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

type BarisVideo = {
  kode: string;
  platform: string;
  user_id: number | string | null;
  akun_username: string | null;
  nama_akun: string | null;
  judul: string | null;
  url: string | null;
  thumbnail_url: string | null;
  waktu_posting: string | null;
  tayangan: number | null;
  suka: number | null;
  komentar: number | null;
  bagikan: number | null;
  favorit?: number | null;
  diperbarui_pada: string | null;
};

type Total = { video: number; berangka: number; tayangan: number; suka: number; komentar: number; bagikan: number };

function totalKosong(): Total {
  return { video: 0, berangka: 0, tayangan: 0, suka: 0, komentar: 0, bagikan: 0 };
}

const MAKS_VIDEO_TAMPIL = 400;

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku."), { status: 401 });
    if (!adalahTvrNasional(user) && !adalahPimred(user)) {
      throw Object.assign(new Error("Hanya jabatan TV Rakyat Nasional & Pimpinan Redaksi yang bisa membuka panel ini."), {
        status: 403,
      });
    }
    const url = new URL(request.url);
    const hariIni = tanggalWib(Date.now());
    const diminta = (url.searchParams.get("tanggal") ?? "").trim();
    const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(diminta) && Number.isFinite(Date.parse(`${diminta}T00:00:00+07:00`)) ? diminta : hariIni;
    const awal = new Date(Date.parse(`${tanggal}T00:00:00+07:00`)).toISOString();
    const akhir = new Date(Date.parse(`${tanggal}T00:00:00+07:00`) + 86_400_000).toISOString();
    const akunDiminta = (url.searchParams.get("akun") ?? "").trim();
    const platformDiminta = platformApp(url.searchParams.get("platform") ?? "");

    const db = supabase();
    const adaFavorit = await kolomTabelAda("tvr_video_metrik", "favorit");
    const kolom =
      "kode, platform, user_id, akun_username, nama_akun, judul, url, thumbnail_url, waktu_posting, tayangan, suka, komentar, bagikan, diperbarui_pada" +
      (adaFavorit ? ", favorit" : "");
    const baris = await semuaBaris<BarisVideo>(
      (dari, sampai) =>
        db
          .from("tvr_video_metrik")
          .select(kolom)
          .not("user_id", "is", null)
          .gte("waktu_posting", awal)
          .lt("waktu_posting", akhir)
          .order("waktu_posting", { ascending: false })
          .range(dari, sampai) as unknown as PromiseLike<{ data: BarisVideo[] | null; error: { message: string } | null }>,
      20_000,
    );

    // Nama anggota pemilik akun.
    const idOrang = [...new Set(baris.map((b) => Number(b.user_id)).filter((n) => n > 0))];
    const nama = new Map<number, string>();
    for (let i = 0; i < idOrang.length; i += 300) {
      const { data } = await db.from("app_user").select("id, nama").in("id", idOrang.slice(i, i + 300));
      for (const u of data ?? []) nama.set(Number(u.id), String(u.nama ?? ""));
    }

    type Akun = Total & { kunci: string; user_id: string; nama: string; platform: string; username: string };
    const perAkun = new Map<string, Akun>();
    const perPlatform: Record<string, Total> = {};
    const semua = totalKosong();
    const tambah = (t: Total, b: BarisVideo, berangka: boolean) => {
      t.video += 1;
      if (!berangka) return;
      t.berangka += 1;
      t.tayangan += Number(b.tayangan ?? 0);
      t.suka += Number(b.suka ?? 0);
      t.komentar += Number(b.komentar ?? 0);
      t.bagikan += Number(b.bagikan ?? 0);
    };
    const tampil: BarisVideo[] = [];
    const totalTampil = totalKosong();
    for (const b of baris) {
      const uid = Number(b.user_id);
      const platform = platformApp(String(b.platform ?? ""));
      const kunci = `${uid}|${platform}`;
      const berangka = !belumDitarik(b.diperbarui_pada);
      const a =
        perAkun.get(kunci) ??
        ({ ...totalKosong(), kunci, user_id: String(uid), nama: nama.get(uid) ?? "", platform, username: String(b.akun_username ?? "") } as Akun);
      if (!a.username && b.akun_username) a.username = String(b.akun_username);
      tambah(a, b, berangka);
      perAkun.set(kunci, a);
      tambah((perPlatform[platform] ??= totalKosong()), b, berangka);
      tambah(semua, b, berangka);
      const cocokAkun = !akunDiminta || kunci === akunDiminta || String(uid) === akunDiminta;
      const cocokPlatform = !platformDiminta || platform === platformDiminta;
      if (cocokAkun && cocokPlatform) {
        tampil.push(b);
        tambah(totalTampil, b, berangka);
      }
    }
    // Yang punya angka & paling banyak ditonton di atas; yang belum
    // ditarik di bawah (terbaru dulu).
    tampil.sort((x, y) => {
      const bx = !belumDitarik(x.diperbarui_pada);
      const by = !belumDitarik(y.diperbarui_pada);
      if (bx !== by) return bx ? -1 : 1;
      if (bx) return Number(y.tayangan ?? 0) - Number(x.tayangan ?? 0);
      return String(y.waktu_posting ?? "").localeCompare(String(x.waktu_posting ?? ""));
    });

    const status = await statusPenyegar().catch(() => null);
    return {
      tanggal,
      hari_ini: hariIni,
      akun_dipilih: akunDiminta,
      platform_dipilih: platformDiminta,
      total: semua,
      total_tampil: totalTampil,
      per_platform: perPlatform,
      akun: [...perAkun.values()].sort((x, y) => y.tayangan - x.tayangan || y.video - x.video),
      video: tampil.slice(0, MAKS_VIDEO_TAMPIL).map((b) => {
        const berangka = !belumDitarik(b.diperbarui_pada);
        return {
          kode: b.kode,
          platform: platformApp(String(b.platform ?? "")),
          user_id: String(b.user_id ?? ""),
          nama: nama.get(Number(b.user_id)) ?? "",
          akun: String(b.akun_username ?? "") || String(b.nama_akun ?? ""),
          judul: String(b.judul ?? ""),
          url: String(b.url ?? ""),
          thumbnail_url: String(b.thumbnail_url ?? ""),
          waktu_posting: b.waktu_posting,
          metrik: berangka
            ? {
                tayangan: Number(b.tayangan ?? 0),
                suka: Number(b.suka ?? 0),
                komentar: Number(b.komentar ?? 0),
                bagikan: Number(b.bagikan ?? 0),
                favorit: adaFavorit ? Number(b.favorit ?? 0) : null,
                diperbarui_pada: b.diperbarui_pada,
              }
            : null,
        };
      }),
      ditampilkan: Math.min(MAKS_VIDEO_TAMPIL, tampil.length),
      pembaruan: status
        ? {
            terakhir: status.terakhir,
            jeda_sampai: status.jeda_sampai,
            menunggu: status.menunggu,
            katalog: status.katalog,
            siklus: status.siklus ?? null,
          }
        : null,
    };
  });
}

// GET /api/konten — feed postingan terbaru akun resmi partai,
// untuk halaman Konten milik anggota biasa.
//
// Sumbernya view `v_app_feed_konten` (tabel `feed_konten`), BUKAN tabel
// `postingan`. Alasannya: `postingan` dipakai menghitung kepatuhan —
// setiap baris di sana melahirkan kewajiban komentar bagi tiap kader —
// dan isinya sengaja dibatasi jendela sesi QC 19:00–18:59 WIB. Feed anggota
// butuh postingan terbaru apa adanya. Rinciannya di sql/08_feed_konten.sql.
//
// Tabel feed diisi workflow n8n kira-kira 1 jam sekali; membuka halaman
// ini tidak memicu scraping dan tidak memakan kuota TikHub sama sekali.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";

export const dynamic = "force-dynamic";

/** Berapa postingan terbaru per akun untuk slideshow (fitur 1.22/bug 5) */
const PER_AKUN = 30;
/** Batas keras saat satu akun di-"expand" (fitur 1.22/bug 5) */
const PER_AKUN_PENUH = 1000;

type BarisAkun = { username: string; nama_akun: string; platform: string };

type BarisFeed = {
  id_postingan: string;
  platform: string;
  akun_username: string;
  akun_nama: string;
  url_postingan: string;
  caption: string;
  thumbnail_url: string;
  jumlah_like: number;
  jumlah_komentar: number;
  waktu_posting: string | null;
  waktu_relatif: string;
  diperbarui_pada: string | null;
};

/** Alamat profil publik sesuai platformnya */
function tautanProfil(platform: string, username: string): string {
  const u = encodeURIComponent(username);
  switch (platform) {
    case "tiktok":
      return `https://www.tiktok.com/@${u}`;
    case "facebook":
      return `https://www.facebook.com/${u}`;
    case "youtube":
      return `https://www.youtube.com/@${u}`;
    case "twitter":
    case "x":
      return `https://x.com/${u}`;
    default:
      return `https://www.instagram.com/${u}/`;
  }
}

export async function GET(request: Request) {
  return bungkus(async () => {
    // Data internal partai — wajib login (dulu endpoint ini terbuka).
    await pastikanMasuk(request);
    const db = supabase();

    // Mode "expand" (fitur 1.22/bug 5): ?akun=<username> mengembalikan
    // HANYA akun itu, tapi hingga 1000 postingan (bukan 30). Dipakai saat
    // pengguna membuka satu akun untuk melihat seluruh arsipnya.
    const akunPenuh = new URL(request.url).searchParams.get("akun")?.trim().toLowerCase() || "";
    const batasPerAkun = akunPenuh ? PER_AKUN_PENUH : PER_AKUN;

    // Filter platform WAJIB ada: di produksi `akun_wajib` sudah berisi
    // baris TikTok juga, dan username tidak lagi unik — 'dpp.pri' muncul
    // dua kali (sekali instagram, sekali tiktok). Tanpa filter ini kartu
    // akun akan tampil ganda di layar anggota.
    //
    // Dipakai `ilike`, bukan `eq`: kolom platform di skema QC lama ditulis
    // berhuruf besar ('Instagram'), sedangkan baris yang lebih baru huruf
    // kecil. `eq` akan diam-diam mengembalikan nol baris.
    const { data: akunData, error: eAkun } = await db
      .from("akun_wajib")
      .select("username, nama_akun, platform")
      .eq("aktif", true)
      .ilike("platform", "instagram")
      .order("id");

    if (eAkun) throw new Error("Gagal memuat daftar akun");

    // Jaga-jaga bila satu username terdaftar dua kali pada platform yang
    // sama (salah input admin) — cukup ambil yang pertama.
    const terlihat = new Set<string>();
    const akun: BarisAkun[] = [];
    for (const baris of (akunData ?? []) as BarisAkun[]) {
      const kunci = (baris.username ?? "").trim().toLowerCase();
      if (!kunci || terlihat.has(kunci)) continue;
      // Mode expand: hanya akun yang diminta.
      if (akunPenuh && kunci !== akunPenuh) continue;
      terlihat.add(kunci);
      akun.push({ ...baris, username: baris.username.trim() });
    }

    if (akun.length === 0) return { data: [], diperbarui_pada: null };

    // Tabel feed_konten BARU dibuat dan workflow n8n pengisinya mungkin
    // belum pernah jalan. Kalau view-nya belum ada atau masih kosong,
    // JANGAN melempar error — kembalikan daftar akun dengan postingan
    // kosong supaya layar menampilkan EmptyState yang menjelaskan,
    // bukan pesan merah yang menakutkan anggota.
    let semua: BarisFeed[] = [];
    const { data: feedData, error: eFeed } = await db
      .from("v_app_feed_konten")
      .select(
        "id_postingan, platform, akun_username, akun_nama, url_postingan, caption, thumbnail_url, jumlah_like, jumlah_komentar, waktu_posting, waktu_relatif, diperbarui_pada",
      )
      .in(
        "akun_username",
        akun.map((a) => a.username.toLowerCase()),
      )
      .order("waktu_posting", { ascending: false, nullsFirst: false })
      .limit(akunPenuh ? PER_AKUN_PENUH : PER_AKUN * akun.length * 3);

    if (eFeed) {
      console.warn("[/api/konten] feed belum tersedia:", eFeed.message);
    } else {
      semua = (feedData ?? []) as BarisFeed[];
    }

    // Kapan data feed terakhir disegarkan — dipakai layar untuk menulis
    // "Diperbarui 12 menit lalu". Diambil yang PALING BARU dari semua
    // baris, bukan per akun, karena satu run n8n menyentuh semuanya.
    let diperbaruiPada: string | null = null;
    for (const f of semua) {
      if (!f.diperbarui_pada) continue;
      if (!diperbaruiPada || f.diperbarui_pada > diperbaruiPada) {
        diperbaruiPada = f.diperbarui_pada;
      }
    }

    const data = akun.map((a) => {
      const username = a.username.toLowerCase();
      const platform = (a.platform ?? "instagram").trim().toLowerCase();

      // Pencocokan lewat USERNAME, bukan nama_akun: nama tampilan di
      // `akun_wajib` ('tv rakyat') berbeda dari yang dipakai scraper.
      const miliknya = semua
        .filter((f) => f.akun_username === username)
        .slice(0, batasPerAkun)
        .map((f) => ({
          id: f.id_postingan,
          caption: (f.caption ?? "").trim(),
          thumbnail_url: f.thumbnail_url ?? "",
          // Tanpa URL tersimpan, susun dari id postingan Instagram.
          link:
            f.url_postingan ||
            `https://www.instagram.com/p/${encodeURIComponent(f.id_postingan)}/`,
          waktu_posting: f.waktu_posting,
          waktu_relatif: f.waktu_relatif ?? "",
          jumlah_like: f.jumlah_like ?? 0,
          jumlah_komentar: f.jumlah_komentar ?? 0,
        }));

      return {
        username: a.username,
        nama_akun: a.nama_akun,
        platform,
        link_profil: tautanProfil(platform, a.username),
        postingan: miliknya,
      };
    });

    return { data, diperbarui_pada: diperbaruiPada };
  });
}

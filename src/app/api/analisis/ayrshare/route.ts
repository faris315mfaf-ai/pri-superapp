// POST /api/analisis/ayrshare — ANALISIS ULANG QC berbasis data
// Ayrshare (tanpa scraping TikHub, tanpa n8n).
//
// Hanya menjangkau akun wajib yang TERTAUT di profil Ayrshare
// (mis. tvrakyat.official) — akun wajib lain (dpp.pri, akun pribadi
// Ketum) tetap lewat pipeline scraping n8n. Jawaban menyebut jujur
// akun mana yang tercakup dan mana yang terlewati.
//
// Alur per akun tertaut:
//   riwayat postingan (periode hari ini, WIB) → upsert `postingan`
//   → komentar per postingan → upsert `komentar` (id deterministik,
//   cocok dengan format TikHub: ig-/tt-<id>) → cocokkan username ke
//   akun sosmed terdaftar anggota → upsert `rekap` (SEMUA pengguna
//   aktif × postingan; yang cocok = Comply) — format id_unik persis
//   punya n8n supaya kedua pipeline saling menimpa dengan benar:
//   `{periode}|||{nama}|||{platform}|||{akun}|||{idPost}`.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { pastikanFiturAktif } from "@/lib/fitur-server";
import {
  ambilAkunTertaut,
  ambilKomentarPostingan,
  ambilRiwayatPostingan,
  ayrshareSiap,
} from "@/lib/ayrshare";

export const dynamic = "force-dynamic";
// Banyak panggilan Ayrshare beruntun; beri napas lebih panjang.
export const maxDuration = 120;

const BOLEH = new Set(["master", "super_admin", "admin_hr"]);

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

function periodeHariIni(): string {
  const tanggal = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return `${tanggal} 00:00-23:59`;
}

/** Awal jendela periode (00:00 WIB) dalam epoch ms. */
function awalPeriodeMs(): number {
  const tanggal = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return new Date(`${tanggal}T00:00:00+07:00`).getTime();
}

/**
 * Samakan ID postingan dengan konvensi pipeline TikHub, supaya dua
 * pipeline saling MENIMPA baris yang sama, bukan menggandakannya:
 * - Instagram: SHORTCODE dari URL (/p/... atau /reel/...) — Ayrshare
 *   memberi media-id numerik yang berbeda dari shortcode TikHub.
 * - TikTok: angka id video dari URL (kebetulan sama dengan id Ayrshare).
 * URL tak terbaca → pakai id Ayrshare apa adanya (tetap konsisten
 * antar-run Ayrshare sendiri).
 */
function idPostinganKanonik(platform: string, idAyrshare: string, url: string): string {
  if (platform === "instagram") {
    const m = /instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/.exec(url);
    if (m) return m[1];
  }
  if (platform === "tiktok") {
    const m = /\/video\/(\d+)/.exec(url);
    if (m) return m[1];
  }
  return idAyrshare;
}

/** Buang kunci dobel dalam satu payload — PostgREST menolaknya. */
function dedup<T>(baris: T[], kunci: (b: T) => string): T[] {
  const peta = new Map<string, T>();
  for (const b of baris) peta.set(kunci(b), b);
  return [...peta.values()];
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (!BOLEH.has(user.role)) {
      throw Object.assign(new Error("Hanya pengurus QC yang boleh menjalankan analisis."), {
        status: 403,
      });
    }
    await pastikanFiturAktif(user, "qc.analisis", "Fitur analisis sedang dimatikan untuk peran Anda.");
    if (!ayrshareSiap()) {
      throw Object.assign(new Error("Ayrshare belum diatur (AYRSHARE_API_KEY kosong)."), {
        status: 503,
      });
    }

    const db = supabase();
    const periode = periodeHariIni();
    const batasMs = awalPeriodeMs();

    // --- Data dasar: akun wajib, akun tertaut Ayrshare, roster, akun sosmed anggota ---
    const [{ data: akunWajib }, tertaut, { data: roster }, { data: akunAnggota }] =
      await Promise.all([
        db.from("akun_wajib").select("username, platform").eq("aktif", true),
        ambilAkunTertaut(),
        db
          .from("app_user")
          .select("id, nama, nomor_wa")
          .eq("aktif", true)
          .eq("status", "aktif"),
        db
          .from("akun_sosmed_user")
          .select("user_id, platform, username")
          .eq("aktif", true),
      ]);

    const tertautPer = new Map(
      tertaut.akun.map((a) => [a.platform, a.username.toLowerCase().replace(/^@/, "")]),
    );
    const cocokTertaut = (akunWajib ?? []).filter(
      (a) => tertautPer.get(a.platform) === a.username.toLowerCase(),
    );
    const terlewat = (akunWajib ?? []).filter(
      (a) => tertautPer.get(a.platform) !== a.username.toLowerCase(),
    );
    if (cocokTertaut.length === 0) {
      throw Object.assign(
        new Error(
          "Tidak ada akun wajib yang tertaut di Ayrshare. Akun Ayrshare hanya memuat akun resmi TV Rakyat.",
        ),
        { status: 409 },
      );
    }

    // Peta pencocokan: platform|username(lower) → user_id → nama
    const namaPerId = new Map((roster ?? []).map((r) => [Number(r.id), r]));
    const pemilikAkun = new Map<string, { nama: string; nomor_wa: string | null }>();
    for (const a of akunAnggota ?? []) {
      const orang = namaPerId.get(Number(a.user_id));
      if (orang) {
        pemilikAkun.set(`${a.platform}|${String(a.username).toLowerCase()}`, {
          nama: orang.nama,
          nomor_wa: orang.nomor_wa ?? null,
        });
      }
    }

    let totalPost = 0;
    let totalKomentar = 0;
    let totalComply = 0;

    for (const akun of cocokTertaut) {
      // 1. Postingan periode ini (riwayat akun tertaut)
      const riwayat = await ambilRiwayatPostingan(akun.platform, 20);
      const postPeriode = riwayat.filter(
        (p) => p.id && p.waktu && new Date(p.waktu).getTime() >= batasMs,
      );
      if (postPeriode.length === 0) continue;
      totalPost += postPeriode.length;

      await db.from("postingan").upsert(
        dedup(
          postPeriode.map((p) => ({
            id_postingan: idPostinganKanonik(akun.platform, p.id, p.url),
            akun_wajib: akun.username,
            platform: akun.platform,
            url_postingan: p.url,
            periode,
            waktu_posting: p.waktu,
            caption_asli: p.teks,
            thumbnail_url: p.thumbnail,
            komentar_status: "ayrshare",
            komentar_diperiksa_pada: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })),
          (b) => b.id_postingan,
        ),
        { onConflict: "id_postingan" },
      );

      // 2. Komentar per postingan → cocokkan ke anggota
      for (const post of postPeriode) {
        // Komentar DIAMBIL pakai id Ayrshare, tapi DISIMPAN pakai id
        // kanonik — dua hal berbeda yang tidak boleh tertukar.
        const idPost = idPostinganKanonik(akun.platform, post.id, post.url);
        const komentar = await ambilKomentarPostingan(akun.platform, post.id);
        totalKomentar += komentar.length;

        const awalanId = akun.platform === "instagram" ? "ig" : "tt";
        const barisKomentar = komentar.map((k) => {
          const unameLower = k.username.toLowerCase().replace(/^@/, "");
          const pemilik = pemilikAkun.get(`${akun.platform}|${unameLower}`);
          return {
            // Sama dengan format TikHub (ig-<id>) supaya dua pipeline
            // tidak menggandakan komentar yang sama.
            id_komentar: k.id
              ? `${awalanId}-${k.id}`
              : `${awalanId}-${idPost}-${unameLower}-${k.teks.length}`,
            id_postingan: idPost,
            akun_wajib: akun.username,
            platform: akun.platform,
            periode,
            username_komentator: unameLower,
            nama_kader: pemilik?.nama ?? null,
            isi_komentar: k.teks,
            waktu_komentar: k.waktu,
          };
        });
        if (barisKomentar.length > 0) {
          await db.from("komentar").upsert(dedup(barisKomentar, (b) => b.id_komentar), {
            onConflict: "id_komentar",
          });
        }

        // 3. Rekap: SEMUA anggota aktif × postingan ini. Yang komentarnya
        // ketemu = Comply; sisanya Belum Komen (persis perilaku n8n).
        const jumlahPer = new Map<string, number>();
        for (const b of barisKomentar) {
          if (b.nama_kader) {
            jumlahPer.set(b.nama_kader, (jumlahPer.get(b.nama_kader) ?? 0) + 1);
          }
        }
        const barisRekap = (roster ?? []).map((r) => {
          const jumlah = jumlahPer.get(r.nama) ?? 0;
          if (jumlah > 0) totalComply += 1;
          return {
            id_unik: `${periode}|||${r.nama}|||${akun.platform}|||${akun.username}|||${idPost}`,
            periode,
            nama_kader: r.nama,
            nomor_wa: r.nomor_wa ?? "",
            platform: akun.platform,
            akun_wajib: akun.username,
            id_postingan: idPost,
            url_postingan: post.url,
            jumlah_komentar: jumlah,
            target: 1,
            status: jumlah > 0 ? "Comply" : "Belum Komen",
            keterangan: "analisis ulang Ayrshare",
            updated_at: new Date().toISOString(),
          };
        });
        await db
          .from("rekap")
          .upsert(dedup(barisRekap, (b) => b.id_unik), { onConflict: "id_unik" });
      }
    }

    return {
      sukses: true,
      periode,
      akun_tercakup: cocokTertaut.map((a) => `${a.username} (${a.platform})`),
      akun_terlewat: terlewat.map((a) => `${a.username} (${a.platform})`),
      postingan: totalPost,
      komentar: totalKomentar,
      comply: totalComply,
    };
  });
}

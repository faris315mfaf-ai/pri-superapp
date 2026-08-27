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

/**
 * Banyaknya riwayat yang diminta per platform sebelum disaring ke
 * periode hari ini. Dibuat longgar karena akun resmi bisa memposting
 * puluhan kali sehari; sisanya dibuang oleh penyaring periode.
 */
const AMBIL_RIWAYAT = 120;

/**
 * Anggaran waktu satu panggilan, dalam milidetik.
 *
 * KENAPA ADA: membaca komentar satu per satu memakan ~2,4 detik per
 * postingan. Saat diuji, satu hari berisi 75 postingan butuh hampir
 * TIGA MENIT — jauh melewati batas fungsi Vercel, sehingga analisisnya
 * akan mati di tengah jalan dan pengurus tidak pernah tahu angkanya
 * tidak lengkap.
 *
 * Maka pekerjaannya dipotong: begitu anggaran habis, sisanya
 * dilaporkan dan panggilan berikutnya melanjutkan dari postingan yang
 * belum diperiksa. Angkanya tidak pernah salah, hanya butuh beberapa
 * putaran bila postingannya banyak.
 */
const ANGGARAN_MS = 40_000;

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

/**
 * GET /api/analisis/ayrshare — CAKUPAN saja, tanpa menjalankan apa pun.
 *
 * Dipakai layar QC untuk menampilkan secara DINAMIS akun wajib mana yang
 * sudah bisa dibaca lewat Ayrshare dan mana yang belum. Daftarnya
 * mengikuti akun yang benar-benar tertaut di profil Ayrshare, jadi
 * begitu dpp.pri atau akun Ketua Umum ditautkan, layarnya ikut berubah
 * tanpa perlu menyentuh kode.
 */
/**
 * Semua SUMBER pembacaan (1.17): profil utama (kunci env) + tiap
 * profil QC tambahan di sosmed_profile. Tiap sumber menyumbang akun
 * tertautnya sendiri; akun wajib dicocokkan per (platform, username)
 * ke sumber mana pun — dua akun Instagram di profil berbeda sah.
 */
async function kumpulkanAkunTertaut(): Promise<
  { platform: string; username: string; kunci: string | undefined }[]
> {
  const sumber: { kunci: string | undefined }[] = [{ kunci: undefined }]; // profil utama
  const { data: profilQc } = await supabase()
    .from("sosmed_profile")
    .select("profile_key")
    .eq("jenis", "qc")
    .eq("penyedia", "ayrshare");
  for (const p of profilQc ?? []) sumber.push({ kunci: p.profile_key as string });

  const hasil: { platform: string; username: string; kunci: string | undefined }[] = [];
  for (const src of sumber) {
    try {
      const t = await ambilAkunTertaut(src.kunci);
      for (const a of t.akun) {
        hasil.push({
          platform: a.platform,
          username: a.username.toLowerCase().replace(/^@/, ""),
          kunci: src.kunci,
        });
      }
    } catch (e) {
      // Satu profil gagal dibaca tidak boleh mengosongkan yang lain.
      console.error("[analisis/ayrshare] profil gagal dibaca:", e);
    }
  }
  return hasil;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (!BOLEH.has(user.role)) {
      throw Object.assign(new Error("Hanya pengurus QC yang boleh melihat cakupan."), {
        status: 403,
      });
    }
    if (!ayrshareSiap()) return { siap: false, tercakup: [], terlewat: [] };

    const { data: akunWajib } = await supabase()
      .from("akun_wajib")
      .select("username, platform")
      .eq("aktif", true);

    const semuaTertaut = await kumpulkanAkunTertaut();
    if (semuaTertaut.length === 0) {
      // Tidak satu pun profil bisa dibaca — laporkan belum siap,
      // jangan menebak cakupan yang belum tentu benar.
      return { siap: false, tercakup: [], terlewat: [] };
    }

    const cocok = (a: { username: string; platform: string }) =>
      semuaTertaut.some(
        (t) => t.platform === a.platform && t.username === a.username.toLowerCase(),
      );

    return {
      siap: true,
      tercakup: (akunWajib ?? []).filter(cocok),
      terlewat: (akunWajib ?? []).filter((a) => !cocok(a)),
    };
  });
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
    const [{ data: akunWajib }, { data: roster }, { data: akunAnggota }] =
      await Promise.all([
        db.from("akun_wajib").select("username, platform").eq("aktif", true),
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

    // 1.17: akun tertaut dikumpulkan dari SEMUA profil; tiap akun
    // wajib yang cocok membawa kunci profil sumbernya utk scraping.
    const semuaTertaut = await kumpulkanAkunTertaut();
    const sumberDari = (a: { username: string; platform: string }) =>
      semuaTertaut.find(
        (t) => t.platform === a.platform && t.username === a.username.toLowerCase(),
      );
    const cocokTertaut = (akunWajib ?? [])
      .map((a) => {
        const src = sumberDari(a);
        return src ? { ...a, kunci: src.kunci } : null;
      })
      .filter((a): a is { username: string; platform: string; kunci: string | undefined } =>
        a !== null,
      );
    const terlewat = (akunWajib ?? []).filter((a) => !sumberDari(a));
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

    const mulaiPada = Date.now();
    const peringatan: string[] = [];

    // Postingan yang komentarnya BARU SAJA diperiksa (fix 1.16).
    //
    // Dulu penanda 'ayrshare' membuat postingan dilewati SELAMANYA
    // dalam periode itu — komentar anggota yang masuk SETELAH analisis
    // pertama tidak pernah terbaca lagi walau analisis dijalankan
    // ulang. Kini yang dilewati hanya postingan yang dibaca dalam
    // SEGAR_MS terakhir: rantai panggilan lanjutan (berjarak detik)
    // tetap hemat, tetapi klik "Mulai Analisis" berikutnya membaca
    // ULANG semua postingan periode — komentar baru ikut terhitung,
    // dan pencocokan memakai daftar akun sosmed TERKINI (akun yang
    // didaftarkan belakangan langsung dikreditkan).
    const SEGAR_MS = 10 * 60 * 1000;
    const { data: sudahDiperiksa } = await db
      .from("postingan")
      .select("id_postingan, komentar_diperiksa_pada")
      .eq("periode", periode)
      .eq("komentar_status", "ayrshare");
    const kini = Date.now();
    const selesaiSebelumnya = new Set(
      (sudahDiperiksa ?? [])
        .filter(
          (p) =>
            p.komentar_diperiksa_pada &&
            kini - new Date(p.komentar_diperiksa_pada as string).getTime() < SEGAR_MS,
        )
        .map((p) => String(p.id_postingan)),
    );

    let sisaBelumDiperiksa = 0;
    let totalPost = 0;
    let totalKomentar = 0;
    let totalComply = 0;

    for (const akun of cocokTertaut) {
      // 1. Postingan periode ini (riwayat akun tertaut).
      //
      // AMBIL BANYAK, LALU SARING. TV Rakyat bisa memposting puluhan kali
      // sehari (terukur 39 kali di Instagram dalam satu hari), jadi
      // meminta sedikit berarti diam-diam kehilangan sebagian kepatuhan.
      const riwayat = await ambilRiwayatPostingan(akun.platform, AMBIL_RIWAYAT, akun.kunci);
      const postPeriode = riwayat.filter(
        (p) => p.id && p.waktu && new Date(p.waktu).getTime() >= batasMs,
      );

      // Bila SELURUH riwayat yang dikembalikan ternyata masih di dalam
      // periode ini, berarti batas atasnya kemungkinan tercapai dan
      // masih ada postingan lebih lama yang belum terlihat. Dilaporkan
      // apa adanya — lebih baik pengurus tahu daripada mengira angkanya
      // sudah lengkap padahal terpotong diam-diam.
      if (riwayat.length >= AMBIL_RIWAYAT && postPeriode.length === riwayat.length) {
        peringatan.push(
          `${akun.username} (${akun.platform}): postingan hari ini melebihi ${AMBIL_RIWAYAT} yang bisa dibaca sekali jalan — jalankan lagi bila ada yang terlewat.`,
        );
      }

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
            // Sengaja BELUM ditandai selesai di sini: baris ini baru
            // mencatat bahwa postingannya ada. Penanda "ayrshare"
            // dipasang setelah komentarnya benar-benar terbaca (lihat
            // di bawah), supaya panggilan lanjutan tidak melewati
            // postingan yang sebenarnya belum diperiksa.
            updated_at: new Date().toISOString(),
          })),
          (b) => b.id_postingan,
        ),
        { onConflict: "id_postingan" },
      );

      // 2. Komentar per postingan → cocokkan ke anggota
      for (const post of postPeriode) {
        const idKanonik = idPostinganKanonik(akun.platform, post.id, post.url);

        // Baru diperiksa <10 menit lalu (rantai panggilan lanjutan
        // analisis yang sama) → lewati; selain itu dibaca ulang.
        if (selesaiSebelumnya.has(idKanonik)) continue;

        // Anggaran habis → sisanya diserahkan ke panggilan berikutnya.
        if (Date.now() - mulaiPada > ANGGARAN_MS) {
          sisaBelumDiperiksa += 1;
          continue;
        }
        // Komentar DIAMBIL pakai id Ayrshare, tapi DISIMPAN pakai id
        // kanonik — dua hal berbeda yang tidak boleh tertukar.
        const idPost = idKanonik;
        const komentar = await ambilKomentarPostingan(akun.platform, post.id, akun.kunci);
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

        // Barulah postingan ini dinyatakan selesai diperiksa. Urutannya
        // penting: bila proses terputus di tengah, postingan yang belum
        // sempat dibaca tetap tampak "belum diperiksa" dan akan
        // dikerjakan panggilan berikutnya.
        const { error: eTandai } = await db
          .from("postingan")
          .update({
            komentar_status: "ayrshare",
            komentar_diperiksa_pada: new Date().toISOString(),
          })
          .eq("id_postingan", idPost);
        if (eTandai) {
          // JANGAN pernah diamkan kegagalan penanda. Persis inilah yang
          // sempat terjadi: CHECK constraint menolak nilai 'ayrshare',
          // penandanya tidak tersimpan, dan analisis mengulang postingan
          // yang sama berkali-kali tanpa pernah tuntas.
          console.error("[analisis/ayrshare] tandai selesai:", eTandai.message);
          peringatan.push(
            `Postingan ${idPost} sudah diperiksa tetapi penandanya gagal disimpan (${eTandai.message}).`,
          );
        }
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
      peringatan,
      /** Komentar terbaca hingga jam ini (jam mulai run — spek 1.16) */
      data_sampai: new Date(mulaiPada).toISOString(),
      /** Postingan yang belum sempat diperiksa pada panggilan ini */
      sisa: sisaBelumDiperiksa,
      /** false = perlu dipanggil lagi untuk menuntaskan sisanya */
      selesai: sisaBelumDiperiksa === 0,
    };
  });
}

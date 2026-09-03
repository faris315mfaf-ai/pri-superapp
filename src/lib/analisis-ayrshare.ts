// ============================================================
// Mesin ANALISIS QC berbasis Ayrshare (KHUSUS SISI SERVER).
//
// Dipisah dari route /api/analisis/ayrshare supaya bisa dipanggil DUA
// cara tanpa menggandakan logikanya:
//   1. Manual  — tombol "Mulai Analisis" (route POST, ada user).
//   2. Otomatis — sinkronisasi konten TV Rakyat (after() di /api/sesi &
//      setelah unggah video), TANPA user.
//
// Alur per akun tertaut:
//   riwayat postingan (periode hari ini, WIB) → upsert `postingan`
//   → (BARU) upsert `feed_konten` (kanal konten) → komentar per postingan
//   → upsert `komentar` (id deterministik, cocok format TikHub ig-/tt-<id>)
//   → cocokkan username ke akun sosmed anggota → upsert `rekap` (SEMUA
//   pengguna aktif × postingan; cocok = Comply). id_unik persis punya
//   n8n supaya dua pipeline saling menimpa, bukan menggandakan.
// ============================================================
import { supabase } from "@/lib/supabase";
import {
  ambilAkunTertaut,
  ambilKomentarPostingan,
  ambilRiwayatPostingan,
  ayrshareSiap,
} from "@/lib/ayrshare";
import { akhirPeriodeMsDari, awalPeriodeMsDari, periodeSaatIni } from "@/lib/periode-qc";

/**
 * Banyaknya riwayat yang diminta per platform sebelum disaring ke
 * periode hari ini. Longgar karena akun resmi bisa memposting puluhan
 * kali sehari; sisanya dibuang oleh penyaring periode.
 */
const AMBIL_RIWAYAT = 120;

/**
 * Anggaran waktu satu panggilan (ms). Membaca komentar satu per satu
 * ~2,4 dtk/postingan; satu hari 75 postingan = hampir 3 menit, jauh
 * melewati batas fungsi. Maka dipotong: begitu anggaran habis, sisanya
 * dilaporkan dan panggilan berikutnya melanjutkan dari yang belum
 * diperiksa. Angkanya tidak pernah salah, hanya butuh beberapa putaran.
 */
const ANGGARAN_MS = 40_000;

/** Postingan yang komentarnya baru diperiksa < 10 mnt → dilewati (hemat). */
const SEGAR_MS = 10 * 60 * 1000;
/**
 * Postingan yang tidak muncul lagi di riwayat akun (diarsipkan/dihapus di
 * sosmednya) baru DIKELUARKAN dari kewajiban bila tetap hilang selama ini —
 * mencegah salah hapus karena riwayat sesaat tidak lengkap (3 Sep 2026).
 */
const HILANG_KONFIRMASI_MS = 15 * 60_000;

/**
 * Awalan id_komentar per platform. WAJIB berbeda tiap platform: tanpa
 * ini komentar X ber-id "123" bisa menimpa komentar TikTok ber-id "123".
 * ig/tt dipertahankan agar cocok format pipeline TikHub (ig-<id>/tt-<id>).
 */
const AWALAN_ID: Record<string, string> = {
  instagram: "ig",
  tiktok: "tt",
  twitter: "tw",
  threads: "th",
  youtube: "yt",
};

// Jendela periode kini 19:00→18:59 WIB (3 Sep 2026; sebelumnya 17:00→16:59) —
// SATU sumber kebenaran di lib/periode-qc. Nama lama dipertahankan agar
// pemanggil (rute wajib-komen dll.) tidak perlu berubah.
export function periodeHariIni(): string {
  return periodeSaatIni();
}

/**
 * Samakan ID postingan dengan konvensi pipeline TikHub, supaya dua
 * pipeline saling MENIMPA baris yang sama, bukan menggandakannya:
 * - Instagram: SHORTCODE dari URL (/p/, /reel/, /tv/) — Ayrshare memberi
 *   media-id numerik yang berbeda dari shortcode TikHub.
 * - TikTok: angka id video dari URL (kebetulan sama dengan id Ayrshare).
 * URL tak terbaca → pakai id Ayrshare apa adanya.
 */
export function idPostinganKanonik(platform: string, idAyrshare: string, url: string): string {
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

/** Ambil satu nilai metrik dari daftar {label,nilai} (0 bila tak ada). */
function metrikNilai(metrik: { label: string; nilai: number }[], label: string): number {
  return metrik.find((m) => m.label === label)?.nilai ?? 0;
}

/** Sama, tapi null bila metriknya memang tak diberikan platform (jujur). */
function metrikNilaiAtauNull(
  metrik: { label: string; nilai: number }[],
  label: string,
): number | null {
  return metrik.find((m) => m.label === label)?.nilai ?? null;
}

/**
 * Header kredensial X milik pengguna bila diatur di env. Sejak 31 Mar
 * 2026 Ayrshare mewajibkan kunci API X SENDIRI untuk operasi X. Tanpa
 * ini, komentar X tak terbaca dan postingannya ditandai "perlu cek
 * manual" — BUKAN dituduh "belum komen".
 */
function headerPlatform(platform: string): Record<string, string> | undefined {
  if (platform === "twitter") {
    const k = process.env.X_OAUTH1_API_KEY;
    const s = process.env.X_OAUTH1_API_SECRET;
    if (k && s) {
      return { "X-Twitter-OAuth1-Api-Key": k, "X-Twitter-OAuth1-Api-Secret": s };
    }
  }
  return undefined;
}

/**
 * Tandai satu postingan PERLU CEK MANUAL karena komentarnya tak terbaca
 * otomatis. Krusial untuk kejujuran angka: rekap tak boleh menuduh
 * "belum komen" pada postingan yang memang belum benar-benar diperiksa.
 * Postingan ini SENGAJA tidak menulis baris rekap sama sekali.
 */
async function tandaiPerluCekManual(
  db: ReturnType<typeof supabase>,
  idPost: string,
  alasan: string,
): Promise<void> {
  await db
    .from("postingan")
    .update({
      komentar_status: "gagal",
      komentar_error: alasan.slice(0, 300),
      perlu_cek_manual: true,
      komentar_diperiksa_pada: new Date().toISOString(),
    })
    .eq("id_postingan", idPost);
}

/**
 * Semua SUMBER pembacaan (1.17): profil utama (kunci env) + tiap profil
 * QC tambahan di sosmed_profile. Tiap sumber menyumbang akun tertautnya;
 * akun wajib dicocokkan per (platform, username) ke sumber mana pun.
 */
export async function kumpulkanAkunTertaut(): Promise<
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
  // RETRY (3 Sep 2026): pembacaan /user Ayrshare bisa gagal sesaat (timeout
  // saat cold start / 429). Tanpa retry, satu kegagalan membuat seluruh
  // putaran sinkron menyerah ("tidak ada akun wajib tertaut") — padahal
  // akunnya ada. Tiga percobaan dengan jeda bertambah.
  const PERCOBAAN_AKUN = 3;
  for (const src of sumber) {
    for (let ke = 1; ke <= PERCOBAAN_AKUN; ke++) {
      try {
        const t = await ambilAkunTertaut(src.kunci);
        for (const a of t.akun) {
          hasil.push({
            platform: a.platform,
            username: a.username.toLowerCase().replace(/^@/, ""),
            kunci: src.kunci,
          });
        }
        break;
      } catch (e) {
        // Satu profil gagal dibaca tidak boleh mengosongkan yang lain.
        console.error(`[analisis/ayrshare] profil gagal dibaca (percobaan ${ke}/${PERCOBAAN_AKUN}):`, e);
        if (ke < PERCOBAAN_AKUN) await new Promise((r) => setTimeout(r, 2000 * ke));
      }
    }
  }
  return hasil;
}

export type HasilAnalisisAyrshare = {
  sukses: boolean;
  periode: string;
  akun_tercakup: string[];
  akun_terlewat: string[];
  postingan: number;
  komentar: number;
  comply: number;
  /** Postingan yang komentarnya tak terbaca otomatis (perlu cek manual) */
  gagal_cek: number;
  peringatan: string[];
  /** Komentar terbaca hingga jam ini (jam mulai run) */
  data_sampai: string;
  /** Postingan yang belum sempat diperiksa pada panggilan ini */
  sisa: number;
  /** false = perlu dipanggil lagi untuk menuntaskan sisanya */
  selesai: boolean;
};

/**
 * Jalankan satu putaran analisis QC Ayrshare. Melempar 409 bila TIDAK
 * ada akun wajib yang tertaut (dipertahankan agar perilaku tombol manual
 * sama). Pemanggil OTOMATIS (after) wajib membungkus dengan try/catch.
 *
 * @param opsi.olehUserId  id pengurus yang menekan tombol; null untuk
 *   jalur otomatis (kolom qc_analisis_riwayat.oleh_user_id boleh null).
 */
export async function jalankanAnalisisAyrshare(opsi: {
  olehUserId: number | null;
  /** Anggaran waktu putaran ini (ms); bawaan 40 dtk (jalur tombol/after). */
  anggaranMs?: number;
  /** Postingan yang diperiksa < ini dilewati (ms); bawaan 10 menit. */
  segarMs?: number;
}): Promise<HasilAnalisisAyrshare> {
  const db = supabase();
  const anggaranMs = opsi.anggaranMs ?? ANGGARAN_MS;
  const segarMs = opsi.segarMs ?? SEGAR_MS;
  const periode = periodeHariIni();
  // Jendela KETAT dua sisi (fix "hanya postingan hari ini"): hanya
  // postingan yang terbit DI DALAM jendela 19:00→18:59 yang diambil;
  // postingan jendela kemarin dianggap lewat — beku sebagai riwayat.
  const batasMs = awalPeriodeMsDari(periode);
  const batasAkhirMs = akhirPeriodeMsDari(periode);

  // --- Data dasar: akun wajib (+ nama tampilan utk feed), roster, akun sosmed anggota ---
  const [{ data: akunWajib }, { data: roster }, { data: akunAnggota }] = await Promise.all([
    db.from("akun_wajib").select("username, platform, nama_akun").eq("aktif", true),
    db.from("app_user").select("id, nama, nomor_wa").eq("aktif", true).eq("status", "aktif"),
    db.from("akun_sosmed_user").select("user_id, platform, username").eq("aktif", true),
  ]);

  // 1.17: akun tertaut dikumpulkan dari SEMUA profil; tiap akun wajib
  // yang cocok membawa kunci profil sumbernya untuk scraping.
  const semuaTertaut = await kumpulkanAkunTertaut();

  // DAFTAR-OTOMATIS akun TV Rakyat (31 Agu 2026): SEMUA platform yang
  // tertaut di profil UTAMA Ayrshare (= akun resmi TV Rakyat) otomatis
  // masuk akun_wajib — YouTube/Facebook/Threads menyusul IG & TikTok
  // tanpa perlu diketik manual (usernamenya diambil dari penautan asli,
  // jadi pasti cocok). X sengaja dilewati (akunnya kena banned).
  const adaDiWajib = new Set(
    (akunWajib ?? []).map((a) => `${a.platform}|${String(a.username).toLowerCase()}`),
  );
  const barisBaru = semuaTertaut
    .filter(
      (t) =>
        t.kunci === undefined && // hanya profil utama (akun resmi TV Rakyat)
        t.platform !== "twitter" &&
        !adaDiWajib.has(`${t.platform}|${t.username}`),
    )
    .map((t) => ({
      username: t.username,
      platform: t.platform,
      nama_akun: "tv rakyat",
      aktif: true,
    }));
  if (barisBaru.length > 0) {
    const { error: eDaftar } = await db
      .from("akun_wajib")
      .upsert(barisBaru, { onConflict: "platform,username", ignoreDuplicates: true });
    if (!eDaftar) {
      // Ikut diproses pada run INI juga — tanpa menunggu putaran berikut.
      for (const b of barisBaru) {
        (akunWajib ?? []).push({ username: b.username, platform: b.platform, nama_akun: b.nama_akun });
      }
    } else {
      console.error("[analisis/ayrshare] daftar-otomatis akun:", eDaftar.message);
    }
  }
  const sumberDari = (a: { username: string; platform: string }) =>
    semuaTertaut.find(
      (t) => t.platform === a.platform && t.username === a.username.toLowerCase(),
    );
  type AkunCocok = {
    username: string;
    platform: string;
    nama_tampilan: string;
    kunci: string | undefined;
  };
  const cocokTertaut: AkunCocok[] = (akunWajib ?? [])
    .map((a) => {
      const src = sumberDari(a);
      return src
        ? {
            username: a.username as string,
            platform: a.platform as string,
            // Kolom label di DB bernama `nama_akun` (BUKAN nama_tampilan).
            nama_tampilan: (a.nama_akun as string) ?? (a.username as string),
            kunci: src.kunci,
          }
        : null;
    })
    .filter((a): a is AkunCocok => a !== null);
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

  // AJUAN DISETUJUI (3 Sep 2026): komentar yang diakui Divisi PALUGODAM
  // lewat ajuan tetap dihitung Comply walau scraper tidak menemukannya —
  // tanpa ini sinkron realtime menimpa keputusan itu tiap beberapa menit.
  const { data: ajuanRows } = await db
    .from("komentar_ajuan")
    .select("nama_kader, id_postingan")
    .eq("periode", periode)
    .eq("status", "disetujui");
  const ajuanDisetujui = new Set((ajuanRows ?? []).map((a) => `${a.nama_kader}|${a.id_postingan}`));

  // Postingan yang komentarnya BARU SAJA diperiksa (< SEGAR_MS) → dilewati
  // agar rantai panggilan lanjutan tetap hemat, tetapi run baru membaca
  // ULANG semua postingan periode (komentar baru ikut terhitung).
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
          kini - new Date(p.komentar_diperiksa_pada as string).getTime() < segarMs,
      )
      .map((p) => String(p.id_postingan)),
  );

  let sisaBelumDiperiksa = 0;
  let totalPost = 0;
  let totalKomentar = 0;
  let totalComply = 0;
  let gagalCek = 0;
  const platformGagalCek = new Set<string>();

  for (const akun of cocokTertaut) {
    // 1. Postingan periode ini (riwayat akun tertaut). AMBIL BANYAK, LALU
    // SARING: TV Rakyat bisa memposting puluhan kali sehari.
    const riwayat = await ambilRiwayatPostingan(akun.platform, AMBIL_RIWAYAT, akun.kunci);
    const postPeriode = riwayat.filter((p) => {
      if (!p.id || !p.waktu) return false;
      const t = new Date(p.waktu).getTime();
      return t >= batasMs && t < batasAkhirMs;
    });

    if (riwayat.length >= AMBIL_RIWAYAT && postPeriode.length === riwayat.length) {
      peringatan.push(
        `${akun.username} (${akun.platform}): postingan hari ini melebihi ${AMBIL_RIWAYAT} yang bisa dibaca sekali jalan — jalankan lagi bila ada yang terlewat.`,
      );
    }

    // POSTINGAN HILANG (bug fix 3 Sep 2026): postingan periode ini yang
    // tersimpan di DB tetapi TIDAK ADA lagi di riwayat akunnya (diarsipkan /
    // dihapus) → setelah ≥15 menit tetap hilang: status 'dihapus' dan baris
    // rekapnya dibuang, jadi angka kewajiban komentar anggota ikut berkurang.
    // Hanya bila riwayat terbaca LENGKAP (< batas ambil), supaya potongan
    // riwayat tidak disalahartikan sebagai penghapusan.
    if (riwayat.length > 0 && riwayat.length < AMBIL_RIWAYAT) {
      const adaSekarang = new Set(postPeriode.map((p) => idPostinganKanonik(akun.platform, p.id, p.url)));
      const { data: tersimpan } = await db
        .from("postingan")
        .select("id_postingan, hilang_sejak, komentar_status")
        .eq("periode", periode)
        .eq("platform", akun.platform)
        .eq("akun_wajib", akun.username);
      const kiniIso = new Date().toISOString();
      for (const t of tersimpan ?? []) {
        const id = String(t.id_postingan);
        if (adaSekarang.has(id) || t.komentar_status === "dihapus") continue;
        if (!t.hilang_sejak) {
          await db.from("postingan").update({ hilang_sejak: kiniIso }).eq("id_postingan", id);
          continue;
        }
        if (Date.now() - new Date(String(t.hilang_sejak)).getTime() < HILANG_KONFIRMASI_MS) continue;
        await db.from("rekap").delete().eq("periode", periode).eq("id_postingan", id);
        await db
          .from("postingan")
          .update({ komentar_status: "dihapus", komentar_diperiksa_pada: kiniIso })
          .eq("id_postingan", id);
        peringatan.push(
          `${akun.username} (${akun.platform}): postingan ${id} sudah tidak ada di akunnya (diarsipkan/dihapus) — dikeluarkan dari kewajiban komentar.`,
        );
      }
    }

    if (postPeriode.length === 0) continue;
    totalPost += postPeriode.length;

    await db.from("postingan").upsert(
      dedup(
        postPeriode.map((p) => {
          // Angka RIIL dari Ayrshare (fix "data dummy" 31 Agu 2026):
          // dulu jumlah_like & total_komen_publik tak pernah diisi mesin
          // → selalu 0 di kartu/detail, tampak palsu. Hanya ditulis bila
          // metriknya memang ada (YouTube/Threads tak memberi angka —
          // jangan menimpa dengan nol palsu).
          const suka = metrikNilaiAtauNull(p.metrik, "Suka");
          const komenPublik = metrikNilaiAtauNull(p.metrik, "Komentar");
          return {
            id_postingan: idPostinganKanonik(akun.platform, p.id, p.url),
            akun_wajib: akun.username,
            platform: akun.platform,
            url_postingan: p.url,
            periode,
            waktu_posting: p.waktu,
            caption_asli: p.teks,
            thumbnail_url: p.thumbnail,
            ...(suka !== null ? { jumlah_like: suka } : {}),
            ...(komenPublik !== null ? { total_komen_publik: komenPublik } : {}),
            // Penanda "ayrshare" dipasang SETELAH komentarnya terbaca
            // (di bawah), supaya panggilan lanjutan tak melewati postingan
            // yang sebenarnya belum diperiksa.
            updated_at: new Date().toISOString(),
            // Terlihat lagi di riwayat → bukan postingan hilang.
            hilang_sejak: null,
          };
        }),
        (b) => b.id_postingan,
      ),
      { onConflict: "id_postingan" },
    );

    // 1b. BARU: mirror ke feed_konten (kanal konten). Kegagalan feed
    // tidak boleh menggagalkan QC — dibungkus try/catch. id_postingan
    // memakai kanonik yang SAMA dengan yang dipakai n8n (shortcode IG),
    // jadi baris feed dari dua sumber saling menimpa, bukan menggandakan.
    try {
      await db.from("feed_konten").upsert(
        dedup(
          postPeriode.map((p) => ({
            id_postingan: idPostinganKanonik(akun.platform, p.id, p.url),
            platform: akun.platform,
            akun_username: akun.username,
            akun_nama: akun.nama_tampilan,
            url_postingan: p.url,
            caption: p.teks,
            thumbnail_url: p.thumbnail,
            jumlah_like: metrikNilai(p.metrik, "Suka"),
            jumlah_komentar: metrikNilai(p.metrik, "Komentar"),
            waktu_posting: p.waktu,
            diperbarui_pada: new Date().toISOString(),
          })),
          (b) => `${b.platform}|${b.id_postingan}`,
        ),
        { onConflict: "platform,id_postingan" },
      );
    } catch (e) {
      console.error("[analisis/ayrshare] feed_konten gagal:", e);
    }

    // 2. Komentar per postingan → cocokkan ke anggota
    for (const post of postPeriode) {
      const idKanonik = idPostinganKanonik(akun.platform, post.id, post.url);

      // Baru diperiksa < 10 menit lalu → lewati; selain itu dibaca ulang.
      if (selesaiSebelumnya.has(idKanonik)) continue;

      // Anggaran habis → sisanya diserahkan ke panggilan berikutnya.
      if (Date.now() - mulaiPada > anggaranMs) {
        sisaBelumDiperiksa += 1;
        continue;
      }
      const idPost = idKanonik;

      // Platform yang komentarnya sudah terbukti gagal dibaca pada run ini
      // → langsung tandai perlu cek manual tanpa memanggil ulang.
      if (platformGagalCek.has(akun.platform)) {
        await tandaiPerluCekManual(db, idPost, `komentar ${akun.platform} tak terbaca otomatis`);
        gagalCek += 1;
        continue;
      }

      let komentar: Awaited<ReturnType<typeof ambilKomentarPostingan>>;
      try {
        komentar = await ambilKomentarPostingan(
          akun.platform,
          post.id,
          akun.kunci,
          headerPlatform(akun.platform),
        );
      } catch (e) {
        // Gagal baca komentar → JANGAN tulis rekap "Belum Komen"; tandai
        // perlu cek manual, dan setel platform ini agar postingan sisanya
        // tak dipanggil lagi (hemat anggaran waktu).
        platformGagalCek.add(akun.platform);
        const pesan = e instanceof Error ? e.message : "gagal membaca komentar";
        await tandaiPerluCekManual(db, idPost, pesan);
        peringatan.push(
          `${akun.username} (${akun.platform}): komentar tak terbaca — ${pesan}. ` +
            `Postingan ditandai "perlu cek manual", bukan "belum komen".`,
        );
        gagalCek += 1;
        continue;
      }
      totalKomentar += komentar.length;

      const awalanId = AWALAN_ID[akun.platform] ?? akun.platform.slice(0, 2);
      const barisKomentar = komentar.map((k) => {
        const unameLower = k.username.toLowerCase().replace(/^@/, "");
        const pemilik = pemilikAkun.get(`${akun.platform}|${unameLower}`);
        return {
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

      // FACEBOOK TIDAK MENGHAKIMI (keputusan user 31 Agu 2026): komentar
      // FB hanya membawa NAMA TAMPILAN (tanpa @username), mustahil
      // dicocokkan otomatis ke kader. Komentarnya TETAP tersimpan (tampil
      // di kelompok "tidak terdaftar"), tapi TIDAK ada baris rekap —
      // tak seorang pun divonis "belum komen" dari postingan Facebook.
      if (akun.platform === "facebook") {
        const { error: eTandaiFb } = await db
          .from("postingan")
          .update({
            komentar_status: "ayrshare",
            komentar_diperiksa_pada: new Date().toISOString(),
          })
          .eq("id_postingan", idPost);
        if (eTandaiFb) {
          console.error("[analisis/ayrshare] tandai FB:", eTandaiFb.message);
        }
        continue;
      }

      // 3. Rekap: SEMUA anggota aktif × postingan ini. Cocok = Comply.
      //
      // BUG FIX 3 Sep 2026 ("username benar tapi tidak masuk"): Ayrshare
      // hanya mengembalikan MAKSIMAL 50 komentar per postingan (terbukti:
      // 50 dari 105), dan 50 yang mana berubah-ubah tiap panggilan. Dulu
      // rekap dihitung dari hasil panggilan INI saja → komentar anggota
      // yang sempat terbaca lalu tergeser keluar dari 50 itu membuat status
      // Comply DITIMPA jadi "Belum Komen". Kini rekap dihitung dari SEMUA
      // komentar postingan ini yang pernah tersimpan (akumulasi tiap
      // putaran), dan username dicocokkan ulang ke akun yang mungkin baru
      // didaftarkan setelah komentarnya tersimpan.
      const { data: semuaKomen } = await db
        .from("komentar")
        .select("id, username_komentator, nama_kader, waktu_komentar")
        .eq("id_postingan", idPost)
        .eq("periode", periode)
        .range(0, 999);
      const jumlahPer = new Map<string, number>();
      const perbaikiNama: { id: number; nama: string }[] = [];
      for (const b of semuaKomen ?? []) {
        const uname = String(b.username_komentator ?? "").toLowerCase().replace(/^@/, "");
        const pemilik = pemilikAkun.get(`${akun.platform}|${uname}`);
        const nama = pemilik?.nama ?? (b.nama_kader ? String(b.nama_kader) : null);
        if (!nama) continue;
        if (pemilik && b.nama_kader !== pemilik.nama) perbaikiNama.push({ id: Number(b.id), nama: pemilik.nama });
        // ATURAN 3 Sep 2026: hanya komentar yang DITULIS di dalam jendela
        // periode (19:00 kemarin s.d. 18:59 hari ini) yang dihitung;
        // komentar di luar jendela tetap tersimpan sebagai arsip tapi
        // tidak menambah kepatuhan. Waktu yang tak diketahui tetap dihitung
        // (tak ada dasar untuk menghukum).
        const tKomen = b.waktu_komentar ? new Date(String(b.waktu_komentar)).getTime() : NaN;
        if (Number.isFinite(tKomen) && (tKomen < batasMs || tKomen >= batasAkhirMs)) continue;
        jumlahPer.set(nama, (jumlahPer.get(nama) ?? 0) + 1);
      }
      // Komentar lama yang usernamenya baru cocok sekarang → nama kadernya dilengkapi.
      for (const pb of perbaikiNama.slice(0, 200)) {
        await db.from("komentar").update({ nama_kader: pb.nama }).eq("id", pb.id);
      }
      const barisRekap = (roster ?? []).map((r) => {
        const adaAjuan = ajuanDisetujui.has(`${r.nama}|${idPost}`);
        const jumlah = Math.max(jumlahPer.get(r.nama) ?? 0, adaAjuan ? 1 : 0);
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
          keterangan: adaAjuan && !(jumlahPer.get(r.nama) ?? 0) ? "ACC ajuan komentar" : "analisis ulang Ayrshare",
          updated_at: new Date().toISOString(),
        };
      });
      await db.from("rekap").upsert(dedup(barisRekap, (b) => b.id_unik), { onConflict: "id_unik" });

      // Barulah postingan ini dinyatakan selesai diperiksa (urutan penting:
      // bila terputus, postingan yang belum sempat dibaca tetap tampak
      // "belum diperiksa" dan dikerjakan panggilan berikutnya).
      const { error: eTandai } = await db
        .from("postingan")
        .update({
          komentar_status: "ayrshare",
          komentar_diperiksa_pada: new Date().toISOString(),
        })
        .eq("id_postingan", idPost);
      if (eTandai) {
        console.error("[analisis/ayrshare] tandai selesai:", eTandai.message);
        peringatan.push(
          `Postingan ${idPost} sudah diperiksa tetapi penandanya gagal disimpan (${eTandai.message}).`,
        );
      }
    }
  }

  // Catat SATU baris riwayat bila putaran ini benar-benar memeriksa
  // postingan — supaya pengurus punya jejak kapan komentar terakhir di-update.
  if (totalPost > 0) {
    await db.from("qc_analisis_riwayat").insert({
      periode,
      sumber: opsi.olehUserId === null ? "ayrshare-otomatis" : "ayrshare",
      oleh_user_id: opsi.olehUserId,
      postingan: totalPost,
      komentar: totalKomentar,
      comply: totalComply,
      gagal_cek: gagalCek,
      data_sampai: new Date(mulaiPada).toISOString(),
      selesai: sisaBelumDiperiksa === 0,
    });
  }

  return {
    sukses: true,
    periode,
    akun_tercakup: cocokTertaut.map((a) => `${a.username} (${a.platform})`),
    akun_terlewat: terlewat.map((a) => `${a.username} (${a.platform})`),
    postingan: totalPost,
    komentar: totalKomentar,
    comply: totalComply,
    gagal_cek: gagalCek,
    peringatan,
    data_sampai: new Date(mulaiPada).toISOString(),
    sisa: sisaBelumDiperiksa,
    selesai: sisaBelumDiperiksa === 0,
  };
}

// ============================================================
// SIARAN SERENTAK (3 Sep 2026) — satu video, sekali klik, terkirim ke
// banyak profil upload-post. KHUSUS SISI SERVER.
//
// Cara kerja:
//   1. /api/tvr/siaran POST menyimpan 1 baris induk (tvr_siaran: video,
//      judul, caption, platform, jadwal) + 1 baris per profil tujuan
//      (tvr_siaran_item, status 'menunggu').
//   2. prosesSiaranSerentak() (dipanggil lewat after() saat siaran dibuat
//      dan tiap kali layar memantau) mengklaim item satu per satu secara
//      ATOMIK (update status menunggu→diproses) lalu memanggil upload-post
//      untuk profil itu. Dua permintaan berbarengan tidak pernah memposting
//      item yang sama dua kali.
//   3. Tiap item yang terkirim juga dicatat ke tvrku_post milik anggota
//      pemilik profil (video_path kosong = bukan berkas miliknya), supaya
//      muncul di TVR Saya-nya dan ikut KPI otomatis.
//
// Anggaran waktu: upload-post bisa 30–180 dtk per profil (mereka mengunduh
// videonya). Item diproses dalam KELOMPOK paralel (12 Okt 2026, 3 item
// serentak; Siaran Koordinator 15 item, asinkron); kelompok baru hanya dimulai bila sisa waktu masih cukup untuk
// satu panggilan terlama + margin, sehingga fungsi tak pernah melewati
// maxDuration. Sisanya diselesaikan sapuan berikutnya (layar memantau tiap
// 10 dtk). Bila upload-post membalas 429 (kuota laju), sapuan dihentikan
// lebih awal dan sisa item menunggu sapuan berikut.
// ============================================================
import { supabase } from "@/lib/supabase";
import { gagalDariBalasan, unggahVideoUp, uploadPostSiap } from "@/lib/upload-post";
import { kirimKabar } from "@/lib/notifikasi";
import { LABEL_SOSMED, solusiGagal } from "@/lib/batas-caption";
import { PLATFORM_KPI } from "@/lib/kpi-video";
import { dariR2, hapusVideoR2 } from "@/lib/r2";
import { namaKolomHilang, sisipkanLonggar } from "@/lib/kolom-struktur";
import { klasifikasiGalatUnggah } from "@/lib/bot-posting-murni";
import { PESAN_TERPUTUS } from "@/lib/siaran-koordinator-murni";
import { akhiriAktivitas, mulaiAktivitas, panggilKeRuang } from "@/lib/dunia";

/** Timeout terlama satu panggilan upload-post (lihat unggahVideoUp). */
const PANGGILAN_TERLAMA_MS = 180_000;
/** Item 'diproses' lebih lama dari ini dianggap terputus (fungsi mati). */
const BASI_DIPROSES_MENIT = 15;
/** Margin pengaman di atas timeout satu unggahan sebelum kelompok baru dimulai. */
const MARGIN_KELOMPOK_MS = 10_000;
/** Item yang dikirim serentak dalam satu kelompok. */
const KONKURENSI_KELOMPOK = 3;
/** Maks item per sapuan — pagar tambahan di luar anggaran waktu. */
const MAKS_ITEM_PER_SAPUAN = 150;
/**
 * Siaran Koordinator memakai upload-post ASINKRON (balasan dalam detik), jadi dikirim jauh lebih
 * banyak sekaligus: kelompok 15 paralel, batas waktu satu panggilan 60 dtk (15 Okt 2026,
 * permintaan pemilik: sebanyak mungkin akun sekaligus, boleh menumpuk).
 */
const KONKURENSI_ASINKRON = 15;
const PANGGILAN_ASINKRON_TERLAMA_MS = 60_000;

/** Kolom belum ada (sql/77 belum dijalankan): 42703 SELECT, PGRST204 INSERT/UPDATE. */
function kolomBelumAda(e: { code?: string; message: string } | null | undefined): boolean {
  return Boolean(e) && (e!.code === "42703" || e!.code === "PGRST204" || namaKolomHilang(e!.message) !== null);
}

/** Galat yang kita lempar sendiri SEBELUM/TANPA upload-post menerima kiriman: pasti belum terposting. */
function galatPasti(pesan: string): Error {
  return Object.assign(new Error(pesan), { pasti: true });
}

/** pasti = belum ada yang terkirim (aman diulang); ambigu = mungkin sudah terposting. */
function jenisGalat(e: unknown): "pasti" | "ambigu" {
  const g = e as { pasti?: unknown; status?: unknown } | null;
  if (g && g.pasti === true) return "pasti";
  if (g && typeof g.status === "number") return klasifikasiGalatUnggah(g.status);
  return "ambigu";
}

/** Galat 429 dari upload-post (kuota laju) — lihat panggilDenganBatas di upload-post.ts. */
function adalahBatasLaju(e: unknown): boolean {
  const g = e as { status?: number; retryAfterDetik?: unknown } | null;
  return g?.status === 429 || (g !== null && typeof g === "object" && "retryAfterDetik" in g);
}

/**
 * Ubah `hasil` mentah upload-post menjadi versi yang memuat jejak platform
 * yang gagal (kpi_gagal + kpi_gagal_alasan) — kunci yang sama dengan
 * tvr/unggah, sehingga rekonsiliasi KPI & layar anggota ikut membacanya.
 */
export function hasilDenganKegagalan(
  mentah: Record<string, unknown>,
  gagal: { platform: string; pesan: string }[],
): Record<string, unknown> {
  if (gagal.length === 0) return mentah;
  return {
    ...mentah,
    kpi_gagal: gagal.map((g) => g.platform),
    kpi_gagal_alasan: Object.fromEntries(gagal.map((g) => [g.platform, g.pesan])),
  };
}

/** Kabari anggota bahwa sebagian/seluruh platform gagal terbit (pola sama dengan tvr/unggah). */
export async function kabariGagalSebagian(
  userId: number,
  judul: string,
  gagal: { platform: string; pesan: string }[],
): Promise<void> {
  if (gagal.length === 0) return;
  await kirimKabar({
    judul: `⚠️ Video gagal terbit di ${gagal.map((g) => LABEL_SOSMED[g.platform] ?? g.platform).join(", ")}`,
    isi: `"${judul}" tidak terbit di ${gagal.length} sosmed:\n${gagal
      .map((g) => {
        const { ringkas, solusi } = solusiGagal(g.platform, g.pesan);
        return `• ${LABEL_SOSMED[g.platform] ?? g.platform}: ${ringkas}${g.pesan ? ` (${g.pesan.slice(0, 120)})` : ""}\n  Solusi: ${solusi}`;
      })
      .join("\n")}`,
    kategori: "peringatan",
    jenis_peristiwa: "unggah_gagal",
    target: "tvrku",
    untukUserIds: [userId],
  });
}

type Induk = {
  id: number;
  judul: string;
  caption: string;
  video_url: string;
  jadwal: string | null;
  status: string;
  /** Siaran koordinator ke akun anggota (sql/77). */
  koordinator: boolean;
  kategori: string;
  perintah_id: number | null;
  tampil_ruang: boolean;
  dijeda: boolean;
};

const KOLOM_INDUK = "id, judul, caption, video_url, jadwal, status, sumber, kategori, perintah_id, tampil_ruang, dijeda";
const KOLOM_INDUK_LAMA = "id, judul, caption, video_url, jadwal, status";
const KOLOM_ITEM = "id, siaran_id, profil, user_id, platforms, video_url, judul, caption";

/**
 * Item yang sudah jatuh giliran (jadwal_kirim lewat atau kosong), tanpa item siaran yang
 * sedang DIJEDA (supaya tidak memenuhi kuota sapuan dan menahan siaran lain).
 */
async function ambilKandidat(db: ReturnType<typeof supabase>, batas: number) {
  const kini = new Date().toISOString();
  const { data: jeda, error: eJeda } = await db
    .from("tvr_siaran")
    .select("id")
    .eq("dijeda", true)
    .in("status", ["menunggu", "berjalan"])
    .limit(200);
  if (eJeda && !kolomBelumAda(eJeda)) throw new Error(`baca siaran dijeda: ${eJeda.message}`);
  if (eJeda) {
    // sql/77 belum dijalankan: perilaku lama (tanpa giliran/jeda).
    const { data } = await db.from("tvr_siaran_item").select(KOLOM_ITEM).eq("status", "menunggu").order("id", { ascending: true }).limit(batas);
    return data ?? [];
  }
  let q = db
    .from("tvr_siaran_item")
    .select(KOLOM_ITEM)
    .eq("status", "menunggu")
    .or(`jadwal_kirim.is.null,jadwal_kirim.lte."${kini}"`);
  const idJeda = (jeda ?? []).map((r) => Number(r.id)).filter((n) => Number.isSafeInteger(n));
  if (idJeda.length > 0) q = q.not("siaran_id", "in", `(${idJeda.join(",")})`);
  const { data, error } = await q
    .order("jadwal_kirim", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true })
    .limit(batas);
  if (error) throw new Error(`baca antrean siaran: ${error.message}`);
  return data ?? [];
}

/**
 * Ruang Bot: karakter anggota yang gilirannya dekat "dipanggil" ke ruangan (walau tidak online),
 * supaya terlihat membawa video ke Kotak Post. Tontonan saja — tidak pernah melempar.
 */
async function panggilAntreanKeRuang(db: ReturnType<typeof supabase>): Promise<void> {
  try {
    const { data: induk, error } = await db
      .from("tvr_siaran")
      .select("id")
      .eq("sumber", "koordinator")
      .eq("tampil_ruang", true)
      .eq("dijeda", false)
      .in("status", ["menunggu", "berjalan"])
      .limit(20);
    if (error || !induk || induk.length === 0) return;
    const batasAtas = new Date(Date.now() + 150_000).toISOString();
    const { data: item } = await db
      .from("tvr_siaran_item")
      .select("user_id")
      .in("siaran_id", induk.map((r) => Number(r.id)))
      .in("status", ["menunggu", "diproses"])
      .lte("jadwal_kirim", batasAtas)
      .order("jadwal_kirim", { ascending: true })
      // Siaran serentak boleh menumpuk: ruangan terisi banyak karakter sekaligus (batas MAKS_PENGHUNI di dunia.ts).
      .limit(60);
    const ids = [...new Set((item ?? []).map((i) => Number(i.user_id)).filter((n) => Number.isSafeInteger(n) && n > 0))];
    if (ids.length > 0) await panggilKeRuang(ids, 300);
  } catch {
    // tontonan saja
  }
}

/**
 * Induk yang semua itemnya sudah beres → 'selesai'. Hanya bila hitungan BERHASIL dibaca (galat
 * baca tidak boleh menandai selesai siaran yang masih punya antrean).
 */
async function rampungkanInduk(db: ReturnType<typeof supabase>, ids: number[]): Promise<void> {
  for (const id of ids) {
    const { count, error } = await db
      .from("tvr_siaran_item")
      .select("id", { count: "exact", head: true })
      .eq("siaran_id", id)
      .in("status", ["menunggu", "diproses"]);
    if (error || count === null) continue;
    if (count === 0) {
      await db.from("tvr_siaran").update({ status: "selesai" }).eq("id", id).in("status", ["menunggu", "berjalan"]);
    }
  }
}

/** Siaran yang masih "berjalan" tanpa antrean (mis. item terakhir disapu basi → gagal) juga dirampungkan. */
async function rampungkanYangTersisa(db: ReturnType<typeof supabase>): Promise<void> {
  const { data } = await db.from("tvr_siaran").select("id").in("status", ["menunggu", "berjalan"]).order("id", { ascending: false }).limit(30);
  await rampungkanInduk(db, (data ?? []).map((r) => Number(r.id)));
}

/**
 * Proses item siaran yang masih menunggu. `anggaranMs` = total waktu yang
 * boleh dipakai sapuan ini (pemanggil menyesuaikan dengan maxDuration-nya).
 */
export async function prosesSiaranSerentak(anggaranMs = 240_000): Promise<void> {
  try {
    if (!uploadPostSiap()) return;
    const mulai = Date.now();
    const db = supabase();

    // Item yang terputus (fungsi mati saat memanggil upload-post) → gagal,
    // JANGAN diulang otomatis: mungkin sudah terposting di sana.
    const basi = new Date(Date.now() - BASI_DIPROSES_MENIT * 60_000).toISOString();
    await db
      .from("tvr_siaran_item")
      .update({
        status: "gagal",
        pesan: `${PESAN_TERPUTUS} — periksa di upload-post sebelum mengirim ulang.`,
        hasil: { galat: "ambigu" },
        selesai_pada: new Date().toISOString(),
      })
      .eq("status", "diproses")
      .lt("diproses_pada", basi);

    await panggilAntreanKeRuang(db);
    const kandidat = await ambilKandidat(db, MAKS_ITEM_PER_SAPUAN);
    if (kandidat.length === 0) {
      await rampungkanYangTersisa(db);
      return;
    }

    const indukIds = [...new Set(kandidat.map((k) => Number(k.siaran_id)))];
    let indukBaca = await db.from("tvr_siaran").select(KOLOM_INDUK).in("id", indukIds);
    if (indukBaca.error && kolomBelumAda(indukBaca.error)) {
      indukBaca = (await db.from("tvr_siaran").select(KOLOM_INDUK_LAMA).in("id", indukIds)) as typeof indukBaca;
    }
    const indukRows = (indukBaca.data ?? []) as unknown as Record<string, unknown>[];
    const induk = new Map<number, Induk>(
      indukRows.map((r) => [
        Number(r.id),
        {
          id: Number(r.id),
          judul: String(r.judul ?? ""),
          caption: String(r.caption ?? ""),
          video_url: String(r.video_url ?? ""),
          jadwal: r.jadwal ? String(r.jadwal) : null,
          status: String(r.status ?? ""),
          koordinator: r.sumber === "koordinator",
          kategori: String(r.kategori ?? ""),
          perintah_id: r.perintah_id == null ? null : Number(r.perintah_id),
          tampil_ruang: r.tampil_ruang === true,
          dijeda: r.dijeda === true,
        },
      ]),
    );

    // Memproses SATU item. Pencegah posting dobel: item DIKLAIM atomik
    // (menunggu→diproses, hanya satu pemenang) SEBELUM memanggil upload-post,
    // dan tiap item hanya masuk satu kelompok — jadi paralel tidak mengubah
    // jaminan itu. Mengembalikan "batas" bila upload-post membalas 429.
    let kuotaPenuh = false;
    const prosesItem = async (item: (typeof kandidat)[number]): Promise<"ok" | "batas"> => {
      if (kuotaPenuh) return "ok"; // biarkan 'menunggu' untuk sapuan berikut
      const s = induk.get(Number(item.siaran_id));
      if (!s) return "ok";
      if (s.dijeda) return "ok"; // dijeda: biarkan 'menunggu'
      if (s.status === "dibatalkan") {
        await db
          .from("tvr_siaran_item")
          .update({ status: "dibatalkan", selesai_pada: new Date().toISOString() })
          .eq("id", item.id)
          .eq("status", "menunggu");
        return "ok";
      }

      // KLAIM atomik — hanya pemenang yang boleh memposting item ini.
      const klaimMs = Date.now();
      const { data: terkunci } = await db
        .from("tvr_siaran_item")
        .update({ status: "diproses", diproses_pada: new Date().toISOString() })
        .eq("id", item.id)
        .eq("status", "menunggu")
        .select("id");
      if (!terkunci || terkunci.length === 0) return "ok";

      if (s.status === "menunggu") {
        await db.from("tvr_siaran").update({ status: "berjalan" }).eq("id", s.id);
        s.status = "berjalan";
      }

      let tokenRuang: string | null = null;
      try {
        const platforms = (item.platforms ?? []).filter((x: string) =>
          (PLATFORM_KPI as readonly string[]).includes(x),
        );
        if (platforms.length === 0) throw galatPasti("Tidak ada platform tertaut yang cocok.");

        // Siaran koordinator: pemilik akun harus masih anggota aktif TEPAT sebelum dikirim.
        if (s.koordinator && item.user_id) {
          const { data: pemilik, error: ePemilik } = await db
            .from("app_user")
            .select("aktif, status")
            .eq("id", Number(item.user_id))
            .maybeSingle();
          if (ePemilik) throw galatPasti("Gagal memeriksa akun anggota (belum dikirim).");
          if (!pemilik || pemilik.aktif !== true || pemilik.status !== "aktif") {
            throw galatPasti("Akun anggota sudah nonaktif — tidak dikirim.");
          }
        }
        if (s.tampil_ruang && item.user_id) {
          tokenRuang = await mulaiAktivitas(Number(item.user_id), {
            jenis: "unggah_sosmed",
            ringkasan: `Siaran koordinator: mengunggah "${String(item.judul || s.judul).slice(0, 120)}"`,
            detail: { judul: String(item.judul || s.judul), platforms },
          });
        }

        // Jadwal yang sudah lewat = kirim sekarang (antrean bisa lebih lama
        // dari perkiraan).
        const jadwalMs = s.jadwal ? Date.parse(s.jadwal) : NaN;
        const jadwal =
          Number.isFinite(jadwalMs) && jadwalMs > Date.now() + 60_000
            ? new Date(jadwalMs).toISOString()
            : undefined;

        // Studio PALUGODAM: item bisa membawa video/judul/caption SENDIRI
        // (hasil render per profil) — menimpa nilai induk.
        const videoUrl = String(item.video_url || s.video_url);
        const judulItem = String(item.judul || s.judul);
        const captionItem = String(item.caption ?? "") || s.caption;
        const hasil = await unggahVideoUp({
          profil: String(item.profil),
          videoUrl,
          judul: judulItem,
          caption: captionItem,
          platforms,
          scheduleDate: jadwal,
          ...(s.koordinator ? { asinkron: true, kunciIdempotensi: `pri-siaran-${item.id}-${klaimMs}` } : {}),
        });
        if (!hasil.sukses) {
          const galat = (hasil.mentah as { message?: string; error?: string })?.message ??
            (hasil.mentah as { error?: string })?.error;
          // upload-post MENJAWAB dan menolak: belum ada yang terposting.
          throw galatPasti(String(galat ?? "upload-post menolak kiriman ini."));
        }

        // Balasan 200 bisa memuat platform yang langsung dinyatakan gagal
        // (success=false per platform) — jangan dicatat "terkirim" mentah.
        const gagalAwal = gagalDariBalasan(hasil.mentah);
        // Siaran koordinator berkategori/bernomor perintah: ikut ke riwayat & laporan otomatis anggota
        // (kunci hasil.kategori / hasil.perintah_id sama dengan /api/tvr/unggah).
        const tanda: Record<string, unknown> = {};
        if (s.kategori) tanda.kategori = s.kategori;
        if (s.perintah_id) tanda.perintah_id = s.perintah_id;
        const hasilSimpan = { ...hasilDenganKegagalan(hasil.mentah, gagalAwal), ...tanda };
        const nama = (pf: string) => LABEL_SOSMED[pf] ?? pf;
        const semuaGagal = gagalAwal.length > 0 && platforms.every((pf) => gagalAwal.some((g) => g.platform === pf));
        const kabari = async () => {
          if (gagalAwal.length === 0 || !item.user_id) return;
          try {
            await kabariGagalSebagian(Number(item.user_id), judulItem, gagalAwal);
          } catch (e) {
            console.error("[siaran] kabar gagal:", e);
          }
        };

        if (semuaGagal) {
          // Tidak ada yang terbit: item gagal (bukan 'terkirim'), tanpa riwayat TVR Saya.
          await db
            .from("tvr_siaran_item")
            .update({
              status: "gagal",
              request_id: hasil.request_id,
              hasil: { ...hasilSimpan, galat: "pasti" },
              pesan: `Gagal di semua sosmed: ${gagalAwal.map((g) => nama(g.platform)).join(", ")}`.slice(0, 300),
              selesai_pada: new Date().toISOString(),
            })
            .eq("id", item.id);
          await kabari();
          return "ok";
        }

        // Sebagian gagal tetap berstatus 'terkirim' (skema tidak punya status
        // 'sebagian' dan layar pemantau hanya menghitung terkirim/gagal);
        // rinciannya ada di `pesan` + hasil.kpi_gagal / kpi_gagal_alasan.
        await db
          .from("tvr_siaran_item")
          .update({
            status: "terkirim",
            request_id: hasil.request_id,
            hasil: hasilSimpan,
            pesan: (gagalAwal.length > 0
              ? `Terkirim sebagian — gagal di: ${gagalAwal.map((g) => nama(g.platform)).join(", ")}`
              : jadwal ? "Terjadwal" : s.koordinator ? "Terkirim ke upload-post (diposting di latar)" : "Terkirim"
            ).slice(0, 300),
            selesai_pada: new Date().toISOString(),
          })
          .eq("id", item.id);

        // Riwayat TVR Saya milik pemilik profil + KPI otomatis.
        if (item.user_id) {
          const riwayat: Record<string, unknown> = {
            user_id: Number(item.user_id),
            judul: judulItem.slice(0, 100),
            caption: captionItem.slice(0, 2200),
            platforms,
            video_path: "",
            video_url: videoUrl,
            jadwal: jadwal ?? null,
            hasil: hasilSimpan,
            request_id: hasil.request_id,
            hapus_media_pada: null,
          };
          // Kolom yang belum ada di database dibuang sendiri oleh sisipkanLonggar.
          if (s.kategori) riwayat.keyword = s.kategori;
          if (s.perintah_id) riwayat.perintah_id = s.perintah_id;
          const { error } = await sisipkanLonggar("tvrku_post", riwayat);
          if (error) console.error("[siaran] simpan riwayat:", error.message);
        }
        if (s.koordinator && item.user_id) {
          const terbit = platforms.filter((pf) => !gagalAwal.some((g) => g.platform === pf));
          try {
            await kirimKabar({
              judul: "📣 Koordinator memposting ke akun Anda",
              isi: `"${judulItem.slice(0, 120)}" ${jadwal ? "dijadwalkan" : "terbit"} di ${terbit.map(nama).join(", ")} Anda.`,
              kategori: "info",
              jenis_peristiwa: "siaran_koordinator",
              target: "tvrku",
              untukUserIds: [Number(item.user_id)],
            });
          } catch (e) {
            console.error("[siaran] kabar koordinator:", e);
          }
        }
        await kabari();
        return "ok";
      } catch (e) {
        // 429 = ditolak SEBELUM diproses upload-post, aman dikembalikan ke
        // antrean (bukan 'gagal'); sapuan dihentikan, sisa item menunggu.
        if (adalahBatasLaju(e)) {
          kuotaPenuh = true;
          await db
            .from("tvr_siaran_item")
            .update({ status: "menunggu", diproses_pada: null })
            .eq("id", item.id)
            .eq("status", "diproses");
          return "batas";
        }
        await db
          .from("tvr_siaran_item")
          .update({
            status: "gagal",
            pesan: (e instanceof Error ? e.message : "Gagal memposting").slice(0, 300),
            hasil: { galat: jenisGalat(e) },
            selesai_pada: new Date().toISOString(),
          })
          .eq("id", item.id);
        return "ok";
      } finally {
        if (tokenRuang && item.user_id) void akhiriAktivitas(Number(item.user_id), tokenRuang);
      }
    };

    // Jeda/batal yang ditekan SELAMA sapuan berjalan berlaku untuk kelompok berikutnya: baca ulang
    // status induk tepat sebelum tiap kelompok diklaim.
    const segarkanInduk = async (kelompok: typeof kandidat) => {
      const ids = [...new Set(kelompok.map((k) => Number(k.siaran_id)))];
      let r = await db.from("tvr_siaran").select("id, status, dijeda").in("id", ids);
      if (r.error && kolomBelumAda(r.error)) r = (await db.from("tvr_siaran").select("id, status").in("id", ids)) as typeof r;
      for (const b of (r.data ?? []) as unknown as { id: number; status: string; dijeda?: boolean }[]) {
        const x = induk.get(Number(b.id));
        if (!x) continue;
        x.status = String(b.status ?? x.status);
        x.dijeda = b.dijeda === true;
      }
    };
    // Kelompok paralel: pagar anggaran dihitung per kelompok. Item Siaran Koordinator (asinkron,
    // cepat) lebih dulu dan dalam kelompok besar; Siaran Serentak lama (sinkron) seperti sebelumnya.
    const jalankanKelompok = async (daftar: typeof kandidat, konkurensi: number, terlamaMs: number) => {
      for (let i = 0; i < daftar.length; i += konkurensi) {
        if (kuotaPenuh) break;
        if (Date.now() - mulai + terlamaMs + MARGIN_KELOMPOK_MS > anggaranMs) break;
        const kelompok = daftar.slice(i, i + konkurensi);
        await segarkanInduk(kelompok);
        const hasilKelompok = await Promise.allSettled(kelompok.map((it) => prosesItem(it)));
        for (const h of hasilKelompok) {
          if (h.status === "rejected") console.error("[siaran] item:", h.reason);
        }
      }
    };
    const adalahKoor = (it: (typeof kandidat)[number]) => induk.get(Number(it.siaran_id))?.koordinator === true;
    await jalankanKelompok(kandidat.filter(adalahKoor), KONKURENSI_ASINKRON, PANGGILAN_ASINKRON_TERLAMA_MS);
    await jalankanKelompok(kandidat.filter((it) => !adalahKoor(it)), KONKURENSI_KELOMPOK, PANGGILAN_TERLAMA_MS);

    // Induk yang semua itemnya sudah beres → 'selesai'.
    await rampungkanInduk(db, indukIds);
  } catch (e) {
    console.error("[siaran] pemroses:", e);
  }
}

/**
 * Hapus berkas video siaran yang lewat umur (2 jam setelah tayang) —
 * dipanggil dari penyapu media TVR Saya. Postingan di sosmed TIDAK disentuh.
 */
export async function bersihkanMediaSiaran(): Promise<void> {
  try {
    const db = supabase();
    const { data } = await db
      .from("tvr_siaran")
      .select("id, video_path, video_url")
      .not("hapus_media_pada", "is", null)
      .lt("hapus_media_pada", new Date().toISOString())
      .neq("video_path", "")
      .limit(10);
    if (!data || data.length === 0) return;
    // Siaran yang masih punya giliran (dijeda, diulang, antrean panjang) TIDAK boleh kehilangan
    // berkasnya: tunda 2 jam lagi. Galat baca = anggap masih dipakai (lebih aman).
    const masihDipakai = new Set<number>();
    for (const b of data) {
      const { count, error } = await db
        .from("tvr_siaran_item")
        .select("id", { count: "exact", head: true })
        .eq("siaran_id", b.id)
        .in("status", ["menunggu", "diproses"]);
      if (error || count === null || count > 0) masihDipakai.add(Number(b.id));
    }
    if (masihDipakai.size > 0) {
      await db
        .from("tvr_siaran")
        .update({ hapus_media_pada: new Date(Date.now() + 2 * 3600_000).toISOString() })
        .in("id", [...masihDipakai]);
    }
    const bebas = data.filter((b) => !masihDipakai.has(Number(b.id)));
    if (bebas.length === 0) return;
    const jalurStorage: string[] = [];
    for (const b of bebas) {
      const path = String(b.video_path ?? "");
      if (!path) continue;
      if (dariR2(String(b.video_url ?? ""))) await hapusVideoR2(path);
      else jalurStorage.push(path);
    }
    if (jalurStorage.length > 0) await db.storage.from("tvrku").remove(jalurStorage);
    await db
      .from("tvr_siaran")
      .update({ hapus_media_pada: null, video_path: "" })
      .in("id", bebas.map((b) => b.id));
  } catch (e) {
    console.error("[siaran] penyapu media:", e);
  }
}

"use client";

// ============================================================
// KontenScreen — halaman utama anggota biasa.
//
// Menampilkan postingan Instagram terbaru dari tiga akun resmi partai
// (dpp.pri, tvrakyat.official, muhammad.nazaruddin_) sebagai slideshow
// yang bisa digeser.
//
// Sumbernya tabel `feed_konten` yang diisi workflow n8n kira-kira satu
// jam sekali — membuka halaman ini TIDAK memicu scraping, jadi tidak
// memakan kuota TikHub sama sekali.
//
// KENAPA POLLING, BUKAN SUPABASE REALTIME:
//   1. Datanya hanya berubah ~1 jam sekali; kanal realtime yang terus
//      terbuka jadi mubazir untuk perubahan sejarang itu.
//   2. Realtime dari browser menuntut kunci publishable NEXT_PUBLIC_*
//      yang belum tersedia di proyek ini.
//   3. Polling + penjaga visibilitas sudah jadi pola rumah (lihat
//      pemuatan notifikasi di src/app/page.tsx).
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Heart,
  Instagram,
  MessageCircle,
  Newspaper,
  RefreshCw,
} from "lucide-react";
import { EmptyState, FadeInUp, GlassSkeleton, ThemeToggle } from "@/components/pri-ui";
import { GlassCard } from "@/components/glass-card";
import { getKonten, type AkunKonten, type FeedKonten, type PostinganKonten } from "@/services";
import { toast } from "@/hooks/use-app-store";
import { KartuVideoBaru } from "@/features/beranda/kartu-video-baru";
import { BerandaAnggotaPanel } from "./beranda-anggota";
import { TombolLonceng } from "@/components/tombol-lonceng";
import { cn } from "@/lib/utils";
import type { User } from "@/types";

/** Jarak antar penyegaran otomatis. Data n8n baru datang ~1 jam sekali,
 *  jadi 5 menit sudah jauh lebih rapat daripada laju perubahannya. */
const JEDA_SEGARKAN_MS = 5 * 60_000;

/** Jeda minimum sebelum penyegaran LATAR boleh jalan lagi. Tanpa ini,
 *  bolak-balik antar tab (visibilitychange + focus menyala berbarengan)
 *  akan memanggil API dua kali beruntun. */
const JEDA_MINIMUM_MS = 30_000;

export function KontenScreen({
  terbenam = false,
  user,
  onBukaLaporanKerja,
  onBukaNotifikasi,
}: {
  /** true = tampil sebagai seksi di Beranda (tanpa header sendiri) */
  terbenam?: boolean;
  user: User;
  onBukaLaporanKerja?: () => void;
  onBukaNotifikasi?: () => void;
}) {
  const [feed, setFeed] = useState<FeedKonten | null>(null);
  const [memuat, setMemuat] = useState(false);
  // Id postingan yang BARU muncul setelah layar ini dibuka — dipakai
  // untuk badge "Baru" yang halus, bukan untuk menggeser apa pun.
  const [idBaru, setIdBaru] = useState<Set<string>>(() => new Set());
  // Jam dinding sederhana supaya teks "Diperbarui X menit lalu" ikut
  // bertambah walau datanya belum berubah.
  const [sekarang, setSekarang] = useState(() => Date.now());

  const hidupRef = useRef(true);
  const sedangMuat = useRef(false);
  const terakhirMuat = useRef(0);
  // null = belum pernah memuat sama sekali. Dibedakan dari Set kosong,
  // karena pada pemuatan PERTAMA semua postingan harus dianggap "sudah
  // pernah dilihat" — kalau tidak, seluruh kartu langsung berlabel Baru.
  const pernahDilihat = useRef<Set<string> | null>(null);

  /** Tandai postingan yang belum pernah tampil di sesi ini */
  const tandaiBaru = useCallback((hasil: FeedKonten) => {
    const semuaId = hasil.akun.flatMap((a) => a.postingan.map((p) => p.id));

    if (pernahDilihat.current === null) {
      pernahDilihat.current = new Set(semuaId);
      return;
    }

    const dilihat = pernahDilihat.current;
    const baru = semuaId.filter((id) => !dilihat.has(id));
    if (baru.length === 0) return;

    baru.forEach((id) => dilihat.add(id));
    setIdBaru((lama) => {
      const gabung = new Set(lama);
      baru.forEach((id) => gabung.add(id));
      return gabung;
    });
  }, []);

  /**
   * @param latar true = penyegaran otomatis di belakang layar. Mode ini
   *   WAJIB diam: tanpa skeleton dan tanpa toast, supaya anggota yang
   *   sedang membaca tidak diganggu kedipan atau pesan merah hanya
   *   karena sinyal sempat putus sedetik.
   */
  const muat = useCallback(
    async (latar: boolean) => {
      if (sedangMuat.current) return;
      if (latar && Date.now() - terakhirMuat.current < JEDA_MINIMUM_MS) return;

      sedangMuat.current = true;
      setMemuat(true);
      try {
        const hasil = await getKonten();
        if (!hidupRef.current) return;
        terakhirMuat.current = Date.now();
        setSekarang(Date.now());
        setFeed(hasil);
        tandaiBaru(hasil);
      } catch (err) {
        if (!hidupRef.current || latar) return;
        // Hanya pemuatan pertama & tombol segarkan manual yang bersuara.
        setFeed((lama) => lama ?? { akun: [], diperbarui_pada: null });
        toast(
          "error",
          "Gagal memuat konten",
          err instanceof Error ? err.message : "Coba lagi sebentar.",
        );
      } finally {
        sedangMuat.current = false;
        if (hidupRef.current) setMemuat(false);
      }
    },
    [tandaiBaru],
  );

  useEffect(() => {
    hidupRef.current = true;
    // Hitung jatah waktu sejak layar dibuka, bukan sejak epoch. Tanpa
    // ini, satu peristiwa 'focus' yang datang bersamaan dengan pemuatan
    // pertama akan dianggap sudah lewat 30 detik dan memanggil API dua kali.
    terakhirMuat.current = Date.now();

    // Pemuatan pertama sengaja dijadwalkan lewat setTimeout(0), bukan
    // dipanggil langsung di badan efek: `muat` menyalakan state pemuatan
    // seketika, dan setState serentak di dalam efek memicu render
    // berantai (ditolak aturan lint react-hooks/set-state-in-effect).
    const pemuatanAwal = setTimeout(() => void muat(false), 0);

    // Satu detak 60 detik mengurus dua hal: memperbarui teks "X menit
    // lalu", dan memicu penyegaran begitu jatah 5 menit lewat.
    const detak = setInterval(() => {
      // WAJIB berhenti saat tab tersembunyi. Ini kritis: page.tsx
      // memasang SEMUA layar tab sekaligus dan hanya menyembunyikan yang
      // tidak aktif, jadi timer ini tetap hidup walau anggota sedang
      // berada di layar Profil atau bahkan menutup tab peramban.
      if (document.visibilityState === "hidden") return;
      setSekarang(Date.now());
      if (Date.now() - terakhirMuat.current >= JEDA_SEGARKAN_MS) void muat(true);
    }, 60_000);

    // Begitu anggota kembali ke aplikasi, segarkan langsung supaya tidak
    // perlu menunggu giliran detak berikutnya.
    const saatTerlihat = () => {
      if (document.visibilityState === "visible") void muat(true);
    };
    const saatFokus = () => {
      if (document.visibilityState !== "hidden") void muat(true);
    };

    document.addEventListener("visibilitychange", saatTerlihat);
    window.addEventListener("focus", saatFokus);

    return () => {
      hidupRef.current = false;
      clearTimeout(pemuatanAwal);
      clearInterval(detak);
      document.removeEventListener("visibilitychange", saatTerlihat);
      window.removeEventListener("focus", saatFokus);
    };
  }, [muat]);

  const sapaan = user.nama.split(" ")[0];
  const daftar = feed?.akun ?? null;
  const totalPostingan =
    daftar?.reduce((jumlah, a) => jumlah + a.postingan.length, 0) ?? 0;

  return (
    <div className={terbenam ? "" : "kolom-aplikasi px-4 pb-32"}>
      {!terbenam && (
      <header className="flex items-start justify-between gap-3 pt-5">
        <div className="min-w-0">
          <p className="text-xs text-teks-sekunder">Selamat datang,</p>
          <h1 className="font-heading truncate text-2xl font-extrabold tracking-tight text-teks-utama">
            {sapaan}
          </h1>
          <p className="mt-0.5 text-xs text-teks-sekunder">
            Konten terbaru akun resmi partai
          </p>
          {feed && (
            <p className="mt-1 text-[11px] text-teks-sekunder/80">
              {labelDiperbarui(feed.diperbarui_pada, sekarang)}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void muat(false)}
            disabled={memuat}
            className="glass btn-tekan flex h-9 w-9 items-center justify-center rounded-xl text-teks-utama disabled:opacity-60"
            aria-label="Segarkan konten sekarang"
            title="Segarkan konten"
          >
            <RefreshCw className={cn("h-4 w-4", memuat && "animate-spin")} />
          </button>
          <TombolLonceng onBuka={onBukaNotifikasi} />
        <ThemeToggle />
        </div>
      </header>
      )}

      {/* Beranda anggota: pengumuman terbaru + KPI kerja + wajib komentar */}
      <BerandaAnggotaPanel user={user} onBukaLaporanKerja={onBukaLaporanKerja} />

      {/* Video TV Rakyat terbaru hasil tarikan Ayrshare/upload-post
          (fitur 1.20/5 & 7): bentuk EMBED tanpa judul + jam presisi,
          lengkap dengan kewajiban komen & share. Umurnya mengikuti
          pengaturan Pimred (1-24 jam, fitur 1.20/8). */}
      <KartuVideoBaru />

      {daftar === null ? (
        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-2.5">
              <GlassSkeleton className="h-5 w-40 rounded-lg" />
              <GlassSkeleton className="h-52 rounded-2xl" />
            </div>
          ))}
        </div>
      ) : totalPostingan === 0 ? (
        <GlassCard className="mt-5 p-4">
          <EmptyState
            ikon={Newspaper}
            judul="Belum ada konten"
            keterangan="Sistem menarik postingan akun resmi partai kira-kira satu jam sekali. Kalau baru dipasang, tunggu sebentar lalu segarkan."
            labelAksi="Segarkan sekarang"
            onAksi={() => void muat(false)}
            className="py-8"
          />
        </GlassCard>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2 md:items-start">
          {daftar.map((akun, i) => (
            // Username BISA muncul dua kali (akun yang sama dianalisis
            // dari dua profil Ayrshare) — kunci digabung indeks supaya
            // React tidak menjatuhkan salah satunya.
            <FadeInUp key={`${akun.username}-${i}`} delay={Math.min(i * 0.08, 0.3)}>
              <BarisAkun akun={akun} idBaru={idBaru} />
            </FadeInUp>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------

/** Teks "Diperbarui X menit lalu" untuk kepala layar */
function labelDiperbarui(iso: string | null, sekarang: number): string {
  if (!iso) return "Menunggu pembaruan pertama";

  const ms = sekarang - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";

  const menit = Math.max(0, Math.floor(ms / 60_000));
  if (menit < 1) return "Diperbarui baru saja";
  if (menit < 60) return `Diperbarui ${menit} menit lalu`;

  const jam = Math.floor(menit / 60);
  if (jam < 24) return `Diperbarui ${jam} jam lalu`;
  return `Diperbarui ${Math.floor(jam / 24)} hari lalu`;
}

// ------------------------------------------------------------

function BarisAkun({ akun, idBaru }: { akun: AkunKonten; idBaru: Set<string> }) {
  const jumlahBaru = akun.postingan.filter((p) => idBaru.has(p.id)).length;

  return (
    <section>
      {/* Kepala akun */}
      <div className="mb-2.5 flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
          style={{
            background: "linear-gradient(135deg, #E1306C, #C13584)",
            boxShadow: "0 6px 16px rgba(193, 53, 132, 0.3)",
          }}
        >
          <Instagram className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-bold text-teks-utama">
              @{akun.username}
            </p>
            {jumlahBaru > 0 && (
              <span className="shrink-0 rounded-full bg-emas/20 px-1.5 py-px text-[9px] font-bold text-emas">
                {jumlahBaru} baru
              </span>
            )}
          </div>
          <p className="truncate text-[11px] text-teks-sekunder">
            {akun.postingan.length} postingan terbaru
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.open(akun.link_profil, "_blank", "noopener,noreferrer")}
          className="glass btn-tekan inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold text-teks-utama"
          aria-label={`Buka profil @${akun.username} di Instagram`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Profil
        </button>
      </div>

      {akun.postingan.length === 0 ? (
        <GlassCard className="p-4">
          <p className="text-center text-[12.5px] text-teks-sekunder">
            Belum ada postingan terpantau dari akun ini.
          </p>
        </GlassCard>
      ) : (
        /* Slideshow: gulir mendatar dengan snap, jadi tiap kartu berhenti
           rapi di tepi layar saat digeser dengan jari.

           Wadah ini SENGAJA tidak pernah dibongkar-pasang saat data
           disegarkan (key-nya id postingan yang stabil), supaya posisi
           geseran pengguna tidak melompat balik ke awal. */
        <div
          className="scrollbar-tipis -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1"
          style={{ scrollbarWidth: "none" }}
        >
          {akun.postingan.map((p) => (
            <KartuKonten key={p.id} post={p} baru={idBaru.has(p.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------

function KartuKonten({ post, baru }: { post: PostinganKonten; baru: boolean }) {
  const [gagalGambar, setGagalGambar] = useState(false);

  // Caption dipotong pendek — kartu ini pengantar, bukan tempat membaca
  // seluruh isi postingan.
  const caption = post.caption.length > 120
    ? post.caption.slice(0, 120).trimEnd() + "…"
    : post.caption;

  return (
    <article className="glass-soft flex w-[248px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl">
      <div className="relative aspect-square w-full shrink-0 bg-black/10 dark:bg-white/10">
        {/* Thumbnail Instagram adalah URL CDN bertanda tangan yang
            kedaluwarsa dalam hitungan jam. Karena itu kegagalan gambar
            dianggap WAJAR dan diganti latar gradasi, bukan ikon rusak. */}
        {post.thumbnail_url && !gagalGambar ? (
          <img
            src={post.thumbnail_url}
            alt=""
            loading="lazy"
            onError={() => setGagalGambar(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: "linear-gradient(135deg, #7F1D1D, #B45309, #0B1120)" }}
          >
            <Instagram className="h-8 w-8 text-white/70" />
          </div>
        )}

        {baru && (
          <span
            className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-bold text-white"
            style={{
              background: "linear-gradient(135deg, #DC2626, #B91C1C)",
              boxShadow: "0 4px 10px rgba(220, 38, 38, 0.35)",
            }}
          >
            Baru
          </span>
        )}

        {post.waktu_relatif && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm">
            {post.waktu_relatif}
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <p className="line-clamp-3 min-h-[3.4em] text-[12.5px] leading-relaxed text-teks-utama/90">
          {caption || "(tanpa caption)"}
        </p>

        <div className="flex items-center gap-3 text-[11px] text-teks-sekunder">
          <span className="inline-flex items-center gap-1">
            <Heart className="h-3 w-3" />
            <span className="angka-tab">{post.jumlah_like.toLocaleString("id-ID")}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="h-3 w-3" />
            <span className="angka-tab">{post.jumlah_komentar.toLocaleString("id-ID")}</span>
          </span>
        </div>

        <button
          type="button"
          onClick={() => window.open(post.link, "_blank", "noopener,noreferrer")}
          className="btn-tekan mt-auto flex h-9 w-full items-center justify-center gap-1.5 rounded-xl text-[12px] font-bold text-white"
          style={{
            background: "linear-gradient(135deg, #DC2626, #B91C1C)",
            boxShadow: "0 6px 14px rgba(220, 38, 38, 0.28)",
          }}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Lihat & Komentari
        </button>
      </div>
    </article>
  );
}

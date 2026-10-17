"use client";

// ============================================================
// PilihVideoInternal (17 Okt 2026) — lembar pemilih video INTERNAL untuk
// diposting langsung ke sosmed pribadi anggota (upload-post), tanpa
// mengunggah berkas dari perangkat.
//
// Empat tab:
//   • Materi Wajib     — bahan video dari perintah Video Wajib (kategori &
//                        nomor perintah ikut terkunci saat diposting).
//   • Official TV Rakyat — Stok Video Tim Official.
//   • Pustaka          — video siap posting yang diunggah tim TV Rakyat.
//   • Galeri           — video sosmed tidak bisa diposting ulang langsung;
//                        diambil dulu ke Stok Video (tombol di Galeri Konten).
//
// Daftar per tab dimuat saat tab pertama kali dibuka lalu disimpan selama
// lembar terbuka. Pratinjau video baru dimuat saat diketuk (preload none)
// supaya membuka lembar tidak menarik puluhan video sekaligus.
// ============================================================

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, Film, Images, Library, PlayCircle, RotateCcw, Tv, Video, X } from "lucide-react";
import { GlassSkeleton } from "@/components/pri-ui";
import { cn } from "@/lib/utils";
import { getVideoInternal, type ItemVideoInternal, type JenisVideoInternal } from "@/services";

type TabPilih = JenisVideoInternal | "galeri";

const TAB: { id: TabPilih; label: string; ikon: typeof Film }[] = [
  { id: "wajib", label: "Materi Wajib", ikon: Video },
  { id: "official", label: "Official TV Rakyat", ikon: Tv },
  { id: "pustaka", label: "Pustaka", ikon: Library },
  { id: "galeri", label: "Galeri", ikon: Images },
];

const KOSONG: Record<JenisVideoInternal, string> = {
  wajib: "Belum ada materi video dari perintah Video Wajib yang aktif.",
  official: "Stok Video Official TV Rakyat sedang kosong.",
  pustaka: "Pustaka video masih kosong. Tim TV Rakyat menambahkannya dari modul TV Rakyat.",
};

export const LABEL_JENIS_INTERNAL: Record<JenisVideoInternal, string> = {
  wajib: "Materi Wajib",
  official: "Official TV Rakyat",
  pustaka: "Pustaka",
};

/** "12 MB" — ukuran ringkas; kosong bila tidak diketahui. */
export function ukuranRingkas(byte: number | null): string {
  if (byte === null || !Number.isFinite(byte) || byte <= 0) return "";
  const mb = byte / 1_048_576;
  return mb >= 1 ? `${Math.round(mb)} MB` : `${Math.max(1, Math.round(byte / 1024))} KB`;
}

function tanggalRingkas(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

type HasilTab = { item: ItemVideoInternal[]; galat: string };

export function PilihVideoInternal({
  terpilihId = null,
  onPilih,
  onTutup,
  onBukaGaleri,
}: {
  /** `${jenis}:${id}` item yang sedang terpasang di formulir (diberi tanda). */
  terpilihId?: string | null;
  onPilih: (item: ItemVideoInternal) => void;
  onTutup: () => void;
  /** Bila ada: tombol di tab Galeri membuka modul Konten. */
  onBukaGaleri?: () => void;
}) {
  const [tab, setTab] = useState<TabPilih>("wajib");
  const [hasil, setHasil] = useState<Partial<Record<JenisVideoInternal, HasilTab>>>({});
  // Item yang pratinjau videonya sedang diputar (satu saja sekaligus).
  const [putar, setPutar] = useState<string | null>(null);
  const tutupRef = useRef<HTMLButtonElement>(null);
  const tabRef = useRef<Partial<Record<TabPilih, HTMLButtonElement | null>>>({});

  const sekarang = tab === "galeri" ? undefined : hasil[tab];

  useEffect(() => {
    if (tab === "galeri" || sekarang !== undefined) return;
    let hidup = true;
    const jenis = tab;
    getVideoInternal(jenis)
      .then((item) => {
        if (hidup) setHasil((h) => ({ ...h, [jenis]: { item, galat: "" } }));
      })
      .catch((e) => {
        if (hidup) {
          setHasil((h) => ({
            ...h,
            [jenis]: { item: [], galat: e instanceof Error ? e.message : "Gagal memuat daftar video." },
          }));
        }
      });
    return () => {
      hidup = false;
    };
  }, [tab, sekarang]);

  // Pemanggil biasa mengoper fungsi baru tiap render — simpan yang terbaru
  // supaya efek pasang di bawah cukup berjalan sekali.
  const tutupTerbaru = useRef(onTutup);
  useEffect(() => {
    tutupTerbaru.current = onTutup;
  });

  // Fokus awal ke tombol tutup; Escape menutup lembar; gulir latar dikunci.
  // Fokus dikembalikan ke pemicu saat lembar ditutup.
  useEffect(() => {
    const pemicu = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    tutupRef.current?.focus();
    const tekan = (ev: globalThis.KeyboardEvent) => {
      if (ev.key === "Escape") tutupTerbaru.current();
    };
    window.addEventListener("keydown", tekan);
    const gulirLama = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", tekan);
      document.body.style.overflow = gulirLama;
      pemicu?.focus();
    };
  }, []);

  function gantiTab(t: TabPilih) {
    setTab(t);
    setPutar(null);
  }

  function muatUlang() {
    if (tab === "galeri") return;
    const jenis = tab;
    setHasil((h) => {
      const n = { ...h };
      delete n[jenis];
      return n;
    });
  }

  // Panah kiri/kanan berpindah tab (pola tablist WAI-ARIA).
  function tekanTab(ev: KeyboardEvent<HTMLButtonElement>, i: number) {
    if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
    ev.preventDefault();
    const j = (i + (ev.key === "ArrowRight" ? 1 : -1) + TAB.length) % TAB.length;
    const t = TAB[j].id;
    gantiTab(t);
    tabRef.current[t]?.focus();
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[96] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="judul-pilih-video-internal"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onTutup} aria-hidden="true" />
      <div className="glass relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl">
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          <Film className="h-5 w-5 text-pri" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p id="judul-pilih-video-internal" className="font-heading text-[15px] font-extrabold text-teks-utama">
              Pilih Video Internal
            </p>
            <p className="text-[11px] leading-snug text-teks-sekunder">
              Diposting langsung dari penyimpanan SuperApp — tanpa unggah dari perangkat.
            </p>
          </div>
          <button
            ref={tutupRef}
            type="button"
            onClick={onTutup}
            aria-label="Tutup pemilih video"
            className="glass btn-tekan flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-teks-utama"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div
          className="scrollbar-tipis flex gap-1.5 overflow-x-auto px-4 pb-2"
          role="tablist"
          aria-label="Sumber video internal"
        >
          {TAB.map((t, i) => {
            const Ikon = t.ikon;
            const aktif = tab === t.id;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  tabRef.current[t.id] = el;
                }}
                type="button"
                role="tab"
                id={`tab-internal-${t.id}`}
                aria-selected={aktif}
                aria-controls="panel-video-internal"
                tabIndex={aktif ? 0 : -1}
                onClick={() => gantiTab(t.id)}
                onKeyDown={(ev) => tekanTab(ev, i)}
                className={cn(
                  "btn-tekan flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold",
                  aktif ? "bg-pri/15 text-pri" : "glass text-teks-sekunder",
                )}
              >
                <Ikon className="h-3.5 w-3.5" aria-hidden="true" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div
          id="panel-video-internal"
          role="tabpanel"
          aria-labelledby={`tab-internal-${tab}`}
          className="scrollbar-tipis flex-1 overflow-y-auto overscroll-contain px-4 pb-5"
        >
          {tab === "galeri" ? (
            <div className="glass-soft mt-1 rounded-2xl p-4 text-[12.5px] leading-relaxed text-teks-sekunder">
              <p className="flex items-center gap-1.5 font-bold text-teks-utama">
                <Images className="h-4 w-4 text-pri" aria-hidden="true" />
                Video dari Galeri Konten
              </p>
              <p className="mt-1.5">
                Video di Galeri adalah postingan sosmed, jadi tidak bisa diposting ulang langsung. Ambil dulu ke{" "}
                <b className="text-teks-utama">Stok Video</b>: buka modul <b className="text-teks-utama">Konten</b>,
                ketuk akun di <b className="text-teks-utama">Akun TV Rakyat</b>, lalu tekan{" "}
                <b className="text-teks-utama">Ambil ke Stok Video</b> pada videonya.
              </p>
              <p className="mt-1.5">
                Setelah masuk, videonya muncul di <b className="text-teks-utama">TV Rakyat Saya › Stok Video</b> —
                ketuk lalu pilih <b className="text-teks-utama">Upload</b>.
              </p>
              {onBukaGaleri && (
                <button
                  type="button"
                  onClick={onBukaGaleri}
                  className="btn-tekan mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl text-[12.5px] font-bold text-white"
                  style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
                >
                  <Images className="h-4 w-4" aria-hidden="true" />
                  Buka Galeri Konten
                </button>
              )}
            </div>
          ) : sekarang === undefined ? (
            <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-busy="true" aria-live="polite">
              <span className="sr-only">Memuat daftar video…</span>
              {[0, 1, 2].map((i) => (
                <GlassSkeleton key={i} className="aspect-[3/4] rounded-2xl" />
              ))}
            </div>
          ) : sekarang.galat ? (
            <div className="glass-soft mt-1 rounded-2xl p-4" role="alert">
              <p className="text-[12.5px] text-teks-utama">{sekarang.galat}</p>
              <button
                type="button"
                onClick={muatUlang}
                className="glass btn-tekan mt-2 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-bold text-teks-utama"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Coba lagi
              </button>
            </div>
          ) : sekarang.item.length === 0 ? (
            <div className="mt-1 flex flex-col items-center rounded-2xl px-6 py-10 text-center">
              <PlayCircle className="h-9 w-9 text-teks-sekunder" aria-hidden="true" />
              <p className="mt-2 text-[12.5px] leading-relaxed text-teks-sekunder">{KOSONG[tab]}</p>
            </div>
          ) : (
            <ul className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {sekarang.item.map((v) => {
                const kunci = `${v.jenis}:${v.id}`;
                return (
                  <li key={kunci}>
                    <KartuInternal
                      item={v}
                      terpilih={terpilihId === kunci}
                      diputar={putar === kunci}
                      onPutar={() => setPutar(kunci)}
                      onPilih={() => onPilih(v)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function KartuInternal({
  item,
  terpilih,
  diputar,
  onPutar,
  onPilih,
}: {
  item: ItemVideoInternal;
  terpilih: boolean;
  diputar: boolean;
  onPutar: () => void;
  onPilih: () => void;
}) {
  const [thumbGagal, setThumbGagal] = useState(false);
  const ukuran = ukuranRingkas(item.ukuran);
  const tanggal = tanggalRingkas(item.dibuat_pada);
  return (
    <article
      className={cn(
        "glass-soft flex h-full flex-col overflow-hidden rounded-2xl",
        terpilih && "ring-2 ring-pri",
      )}
    >
      <div className="relative aspect-[3/4] w-full bg-black/80">
        {diputar && item.pratinjau ? (
          <video
            src={item.pratinjau}
            controls
            autoPlay
            muted
            playsInline
            preload="none"
            className="h-full w-full object-contain"
            aria-label={`Pratinjau ${item.judul}`}
          />
        ) : (
          <button
            type="button"
            onClick={onPutar}
            disabled={!item.pratinjau}
            aria-label={item.pratinjau ? `Putar pratinjau ${item.judul}` : `Pratinjau ${item.judul} tidak tersedia`}
            className="group absolute inset-0 flex h-full w-full items-center justify-center disabled:cursor-default"
          >
            {item.thumbnail && !thumbGagal ? (
              <img
                src={item.thumbnail}
                alt=""
                loading="lazy"
                onError={() => setThumbGagal(true)}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <span
                className="absolute inset-0"
                style={{ background: "linear-gradient(135deg, #7F1D1D, #B45309, #0B1120)" }}
                aria-hidden="true"
              />
            )}
            {item.pratinjau && (
              <PlayCircle
                className="relative h-10 w-10 text-white/85 drop-shadow transition-transform group-active:scale-95"
                aria-hidden="true"
              />
            )}
          </button>
        )}
        {ukuran && !diputar && (
          <span className="pointer-events-none absolute right-2 bottom-2 rounded-full bg-black/55 px-2 py-0.5 text-[9.5px] font-semibold text-white backdrop-blur-sm">
            {ukuran}
          </span>
        )}
        {terpilih && (
          <span className="pointer-events-none absolute top-2 left-2 flex items-center gap-1 rounded-full bg-pri px-2 py-0.5 text-[9.5px] font-bold text-white">
            <Check className="h-3 w-3" aria-hidden="true" /> Terpasang
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <p className="line-clamp-2 text-[12px] leading-snug font-semibold text-teks-utama">{item.judul || "(tanpa judul)"}</p>
        <div className="flex flex-wrap items-center gap-1">
          {item.kategori && (
            <span className="glass rounded-full px-2 py-0.5 text-[9.5px] font-bold text-teks-utama">{item.kategori}</span>
          )}
          {item.perintah_id && (
            <span className="rounded-full bg-[#DBEAFE] px-2 py-0.5 text-[9.5px] font-bold text-[#1E3A8A] dark:bg-[#1E3A8A]/60 dark:text-[#BFDBFE]">
              Perintah #{item.perintah_id}
            </span>
          )}
          {tanggal && <span className="text-[9.5px] text-teks-sekunder">{tanggal}</span>}
        </div>
        <button
          type="button"
          onClick={onPilih}
          aria-label={`Pilih video ${item.judul}`}
          className="btn-tekan mt-auto flex h-9 w-full items-center justify-center gap-1.5 rounded-xl text-[12px] font-bold text-white"
          style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          {terpilih ? "Terpilih" : "Pilih"}
        </button>
      </div>
    </article>
  );
}

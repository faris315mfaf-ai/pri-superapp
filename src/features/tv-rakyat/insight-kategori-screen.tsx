"use client";

// ============================================================
// InsightKategoriScreen (13 Sep 2026) — HALAMAN PENUH insight per kategori.
//
// Pilih kategori → seluruh video kategori itu sebagai KARTU EMBED,
// dipisah per sosial media, tiap kartu membawa angkanya: tayangan, suka,
// komentar, dibagikan, favorit, durasi. Di atasnya: total kategori dan
// rata-rata tayangan per video.
//
// Dua tombol kerja:
//   • TARIK DATA (Chocodata) — menarik angka semua video kategori ini,
//     potongan demi potongan sampai habis, kemajuannya tampak.
//   • TAMBAH LINK — tempel banyak link (satu per baris) ke kategori ini;
//     yang ditolak dilaporkan per baris beserta alasannya.
//
// Embed memakai pemutar resmi tiap platform (iframe). X belum punya
// iframe tanpa skrip pihak ketiga → kartu tautan + thumbnail.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  DownloadCloud,
  ExternalLink,
  Layers,
  Link2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { EmptyState, GlassSkeleton, ThemeToggle } from "@/components/pri-ui";
import { PlatformIcon } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import { idVideo } from "@/lib/tautan-video";
import { formatAngkaRingkas, jamWIB } from "@/lib/format";
import {
  getInsightKategori,
  getKeywordWajib,
  tambahLinkKategori,
  tarikDataKategori,
  type InsightKategori,
} from "@/services";
import { cn } from "@/lib/utils";

const LABEL_PLATFORM: Record<string, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
  threads: "Threads",
  twitter: "X",
  bilibili: "Bilibili",
};
const URUTAN_PLATFORM = ["tiktok", "instagram", "youtube", "facebook", "twitter", "threads", "bilibili"];

const angka = (v: number | null | undefined) => (v == null ? "–" : formatAngkaRingkas(v));

/** Alamat pemutar resmi untuk iframe, atau "" bila platform tak punya. */
export function alamatEmbed(platform: string, url: string): string {
  const id = idVideo(platform, url);
  if (!id) return "";
  switch (platform) {
    case "tiktok":
      return `https://www.tiktok.com/embed/v2/${id}`;
    case "youtube":
      return `https://www.youtube-nocookie.com/embed/${id}`;
    case "instagram":
      return `https://www.instagram.com/p/${id}/embed`;
    case "facebook":
      return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`;
    default:
      return "";
  }
}

function durasi(detik: number | null): string {
  if (detik == null) return "";
  const m = Math.floor(detik / 60);
  const s = Math.round(detik % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

type Video = InsightKategori["video"][number];

function KartuVideo({ v }: { v: Video }) {
  const [muatEmbed, setMuatEmbed] = useState(false);
  const embed = alamatEmbed(v.platform, v.url);
  return (
    <li className="glass-soft flex flex-col overflow-hidden rounded-2xl">
      {/* Embed dimuat SAAT DIMINTA: satu halaman bisa memuat puluhan
          video, dan puluhan iframe sekaligus melumpuhkan ponsel. */}
      <div className="relative aspect-[9/12] w-full bg-black/5 dark:bg-white/5">
        {embed && muatEmbed ? (
          <iframe
            src={embed}
            title={v.judul || v.url}
            className="h-full w-full"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        ) : (
          <button
            type="button"
            onClick={() => (embed ? setMuatEmbed(true) : window.open(v.url, "_blank", "noopener,noreferrer"))}
            className="flex h-full w-full flex-col items-center justify-center gap-2 text-teks-sekunder"
            aria-label={embed ? "Putar video" : "Buka video"}
          >
            {v.thumbnail_url ? (
              // Host thumbnail berubah-ubah (CDN tiap platform) → <img> biasa.
              <img src={v.thumbnail_url} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
            ) : null}
            <span className="relative z-10 glass rounded-full px-3 py-1.5 text-[11px] font-bold text-teks-utama">
              {embed ? "▶ Putar" : "Buka di " + (LABEL_PLATFORM[v.platform] ?? v.platform)}
            </span>
          </button>
        )}
      </div>
      <div className="p-2.5">
        <p className="truncate text-[12px] font-bold text-teks-utama">
          {v.judul || v.url.replace(/^https?:\/\/(www\.)?/, "")}
        </p>
        <p className="mt-0.5 truncate text-[10.5px] text-teks-sekunder">
          {[v.akun, v.asal === "kategori" ? "ditambahkan ke kategori" : v.pelapor && `lapor: ${v.pelapor}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {v.metrik ? (
          <div className="angka-tab mt-1.5 grid grid-cols-3 gap-x-2 gap-y-0.5 text-[10.5px] text-teks-sekunder">
            <span><b className="text-teks-utama">{angka(v.metrik.tayangan)}</b> tayang</span>
            <span><b className="text-teks-utama">{angka(v.metrik.suka)}</b> suka</span>
            <span><b className="text-teks-utama">{angka(v.metrik.komentar)}</b> komentar</span>
            <span><b className="text-teks-utama">{angka(v.metrik.bagikan)}</b> dibagikan</span>
            <span><b className="text-teks-utama">{angka(v.metrik.favorit)}</b> favorit</span>
            <span>{v.metrik.durasi_detik != null ? `${durasi(v.metrik.durasi_detik)} durasi` : ""}</span>
          </div>
        ) : (
          <p className="mt-1.5 text-[10.5px] text-amber-600">belum ada angka — tekan Tarik Data</p>
        )}
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-teks-sekunder/80">
          <span>
            {v.metrik?.diperbarui_pada
              ? `angka ${v.metrik.sumber} · ${jamWIB(v.metrik.diperbarui_pada)}`
              : `dilaporkan ${v.tanggal_wib}`}
          </span>
          <a href={v.url} target="_blank" rel="noopener noreferrer" aria-label="Buka video" className="text-teks-utama">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>
    </li>
  );
}

export function InsightKategoriScreen({
  kategoriAwal,
  onKembali,
}: {
  kategoriAwal?: string;
  onKembali: () => void;
}) {
  const [daftar, setDaftar] = useState<string[] | null>(null);
  // Kategori SELESAI tetap tampil (datanya tetap dibutuhkan), hanya ditandai.
  const [selesai, setSelesai] = useState<Set<string>>(() => new Set());
  const [pilih, setPilih] = useState(kategoriAwal ?? "");
  const [platform, setPlatform] = useState("semua");
  const [data, setData] = useState<InsightKategori | null>(null);
  const [galat, setGalat] = useState("");
  const [muat, setMuat] = useState(0);

  // Tarik data (Chocodata) — berulang sampai sisa nol.
  const [menarik, setMenarik] = useState<{ terisi: number; gagal: number; sisa: number | null } | null>(null);
  // Tambah link batch.
  const [formLink, setFormLink] = useState(false);
  const [teksLink, setTeksLink] = useState("");
  const [mengirimLink, setMengirimLink] = useState(false);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const k = await getKeywordWajib();
        if (!hidup) return;
        const nama = k.data.filter((x) => x.aktif).map((x) => x.keyword);
        setDaftar(nama);
        setSelesai(new Set(k.data.filter((x) => x.selesai === true).map((x) => x.keyword)));
        setPilih((p) => p || nama[0] || "");
      } catch (e) {
        if (!hidup) return;
        setDaftar([]);
        setGalat(e instanceof Error ? e.message : "Gagal memuat kategori.");
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  useEffect(() => {
    if (!pilih) return;
    let hidup = true;
    void (async () => {
      setData(null);
      setGalat("");
      try {
        const d = await getInsightKategori(pilih);
        if (hidup) setData(d);
      } catch (e) {
        if (hidup) setGalat(e instanceof Error ? e.message : "Gagal memuat.");
      }
    })();
    return () => {
      hidup = false;
    };
  }, [pilih, muat]);

  async function tarikSemua() {
    if (menarik || !pilih) return;
    setMenarik({ terisi: 0, gagal: 0, sisa: null });
    let terisi = 0;
    let gagalN = 0;
    try {
      // Potongan demi potongan: tiap panggilan mengerjakan sebanyak yang
      // muat dalam batas waktu server, lalu memberi tahu sisanya.
      for (let putaran = 0; putaran < 40; putaran++) {
        const h = await tarikDataKategori(pilih);
        terisi += h.terisi;
        gagalN += h.gagal.length;
        setMenarik({ terisi, gagal: gagalN, sisa: h.sisa });
        if (h.sisa <= 0 || h.dikerjakan === 0) {
          if (h.tidak_didukung > 0) {
            toast("info", `${h.tidak_didukung} video di platform yang belum didukung Chocodata`, "Threads/Bilibili dihitung sebagai laporan saja.");
          }
          if (gagalN > 0) toast("peringatan", `${gagalN} video gagal ditarik`, h.gagal[0]?.alasan ?? "");
          break;
        }
      }
      toast("sukses", "Tarik data selesai", `${terisi} video terisi angkanya.`);
      setMuat((n) => n + 1);
    } catch (e) {
      toast("error", "Tarik data terhenti", e instanceof Error ? e.message : "");
    } finally {
      setMenarik(null);
    }
  }

  async function kirimLink() {
    if (mengirimLink || !pilih) return;
    setMengirimLink(true);
    try {
      const h = await tambahLinkKategori(pilih, teksLink);
      toast(
        h.ditambahkan > 0 ? "sukses" : "info",
        `${h.ditambahkan} link ditambahkan ke ${h.kategori}`,
        [h.sudah_ada > 0 && `${h.sudah_ada} sudah ada`, h.ditolak.length > 0 && `${h.ditolak.length} ditolak`]
          .filter(Boolean)
          .join(" · ") || "Semua masuk.",
      );
      for (const d of h.ditolak.slice(0, 3)) toast("peringatan", "Ditolak", `${d.baris.slice(0, 50)} — ${d.alasan}`);
      if (h.ditambahkan > 0) {
        setTeksLink("");
        setFormLink(false);
        setMuat((n) => n + 1);
      }
    } catch (e) {
      toast("error", "Gagal menambah link", e instanceof Error ? e.message : "");
    } finally {
      setMengirimLink(false);
    }
  }

  const r = data?.ringkasan;
  const platformAda = useMemo(() => {
    if (!r) return [] as string[];
    return URUTAN_PLATFORM.filter((p) => r.per_platform[p]);
  }, [r]);
  const videoTampil = useMemo(() => {
    if (!data) return [] as Video[];
    return platform === "semua" ? data.video : data.video.filter((v) => v.platform === platform);
  }, [data, platform]);
  const ringkasTampil = useMemo(() => {
    if (!r) return null;
    if (platform === "semua") {
      return { video: r.jumlah_video, terukur: r.jumlah_terukur, total: r.total, rata: r.rata_tayangan };
    }
    const t = { tayangan: 0, suka: 0, komentar: 0, bagikan: 0, favorit: 0 };
    let terukur = 0;
    for (const v of videoTampil) {
      if (!v.metrik) continue;
      terukur += 1;
      t.tayangan += v.metrik.tayangan;
      t.suka += v.metrik.suka;
      t.komentar += v.metrik.komentar;
      t.bagikan += v.metrik.bagikan;
      t.favorit += v.metrik.favorit;
    }
    return { video: videoTampil.length, terukur, total: t, rata: terukur > 0 ? Math.round(t.tayangan / terukur) : null };
  }, [r, platform, videoTampil]);

  return (
    <div className="kolom-aplikasi px-4 pb-32">
      <header className="flex items-center gap-3 pt-5">
        <button
          type="button"
          onClick={onKembali}
          aria-label="Kembali"
          className="glass btn-tekan flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-teks-utama"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-xl font-extrabold tracking-tight text-teks-utama">Insight per Kategori</h1>
          <p className="text-xs text-teks-sekunder">Seluruh video kategori, per sosial media, beserta angkanya</p>
        </div>
        <ThemeToggle />
      </header>

      {/* Pemilih kategori */}
      {daftar === null ? (
        <GlassSkeleton className="mt-4 h-8 w-2/3 rounded-full" />
      ) : (
        <div className="scrollbar-tipis -mx-1 mt-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {daftar.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setPilih(k);
                setPlatform("semua");
              }}
              aria-pressed={pilih === k}
              className={cn(
                "btn-tekan shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition-colors",
                pilih === k ? "bg-pri text-white" : "glass text-teks-sekunder",
              )}
            >
              {k}
              {selesai.has(k) && (
                <span className="ml-1 text-[10px] font-semibold opacity-80">· selesai</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Tombol kerja */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void tarikSemua()}
          disabled={!pilih || menarik !== null}
          className="btn-tekan flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #0EA5E9, #0369A1)" }}
        >
          {menarik ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <DownloadCloud className="h-4 w-4" aria-hidden="true" />}
          {menarik
            ? `Menarik… ${menarik.terisi} terisi${menarik.sisa != null ? `, sisa ${menarik.sisa}` : ""}`
            : "Tarik Data (Chocodata)"}
        </button>
        <button
          type="button"
          onClick={() => setFormLink((v) => !v)}
          disabled={!pilih}
          className="glass btn-tekan flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12.5px] font-bold text-teks-utama disabled:opacity-60"
        >
          <Link2 className="h-4 w-4" aria-hidden="true" />
          {formLink ? "Tutup" : "Tambah Link"}
        </button>
        <button
          type="button"
          onClick={() => setMuat((n) => n + 1)}
          aria-label="Muat ulang"
          className="glass btn-tekan flex h-9 w-9 items-center justify-center rounded-xl text-teks-utama"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {formLink && (
        <GlassCard className="mt-3 p-3.5">
          <p className="text-[12px] font-bold text-teks-utama">Tambah link ke kategori {pilih}</p>
          <p className="mt-0.5 text-[10.5px] leading-snug text-teks-sekunder">
            Satu link per baris (tegak lurus ke bawah). Platform dikenali otomatis dari alamatnya;
            link yang sama tidak dimasukkan dua kali.
          </p>
          <textarea
            value={teksLink}
            onChange={(e) => setTeksLink(e.target.value)}
            rows={6}
            placeholder={"https://www.tiktok.com/@akun/video/…\nhttps://youtube.com/shorts/…\nhttps://www.instagram.com/reel/…"}
            className="glass-input mt-2 w-full rounded-xl px-3 py-2 font-mono text-[12px] text-teks-utama"
          />
          <button
            type="button"
            onClick={() => void kirimLink()}
            disabled={mengirimLink || teksLink.trim().length < 8}
            className="btn-tekan mt-2 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
          >
            {mengirimLink ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
            Masukkan ke Kategori
          </button>
        </GlassCard>
      )}

      {!pilih ? (
        <EmptyState ikon={Layers} judul="Belum ada kategori" keterangan="Tambahkan dari modul TV Rakyat Official." />
      ) : galat ? (
        <EmptyState ikon={AlertTriangle} judul="Gagal memuat" keterangan={galat} labelAksi="Coba Lagi" onAksi={() => setMuat((n) => n + 1)} />
      ) : !data || !r || !ringkasTampil ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <GlassSkeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {/* Tab platform */}
          <div className="scrollbar-tipis -mx-1 mt-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {["semua", ...platformAda].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatform(p)}
                aria-pressed={platform === p}
                className={cn(
                  "btn-tekan flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold",
                  platform === p ? "bg-white text-teks-utama shadow-sm dark:bg-white/15" : "glass-soft text-teks-sekunder",
                )}
              >
                {p !== "semua" && <PlatformIcon platform={p} size={12} />}
                {p === "semua" ? "Semua" : LABEL_PLATFORM[p] ?? p}
                <span className="angka-tab text-teks-sekunder">
                  {p === "semua" ? r.jumlah_video : r.per_platform[p]?.video ?? 0}
                </span>
              </button>
            ))}
          </div>

          {/* Total kategori (atau per platform yang dipilih) */}
          <GlassCard className="mt-3 p-3.5">
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["tayangan", "Tayangan"],
                  ["suka", "Suka"],
                  ["komentar", "Komentar"],
                  ["bagikan", "Dibagikan"],
                  ["favorit", "Favorit"],
                ] as const
              ).map(([k, label]) => (
                <div key={k} className="glass-soft rounded-xl p-2.5 text-center">
                  <p className="angka-tab font-heading text-[16px] leading-none font-extrabold text-teks-utama">
                    {ringkasTampil.terukur > 0 ? formatAngkaRingkas(ringkasTampil.total[k]) : "–"}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold text-teks-sekunder">{label}</p>
                </div>
              ))}
              <div className="glass-soft rounded-xl p-2.5 text-center">
                <p className="angka-tab font-heading text-[16px] leading-none font-extrabold text-teks-utama">
                  {ringkasTampil.rata != null ? formatAngkaRingkas(ringkasTampil.rata) : "–"}
                </p>
                <p className="mt-1 text-[10px] font-semibold text-teks-sekunder">Rata-rata tayangan / video</p>
              </div>
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-teks-sekunder">
              <b className="text-teks-utama">{ringkasTampil.video}</b> video ·{" "}
              <b className="text-teks-utama">{ringkasTampil.terukur}</b> punya angka. Angka dari sapuan TikHub
              (TikTok/Instagram) dan tarikan Chocodata; yang belum punya angka ditandai di kartunya.
            </p>
          </GlassCard>

          {videoTampil.length === 0 ? (
            <EmptyState ikon={Layers} judul="Belum ada video" keterangan="Belum ada video kategori ini di platform tersebut." />
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {videoTampil.map((v) => (
                <KartuVideo key={v.kunci} v={v} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

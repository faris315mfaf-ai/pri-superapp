"use client";

// ============================================================
// PanelInsightKategori (12 Sep 2026) — modul TV Rakyat Nasional.
//
// Pilih satu kategori (mis. BPJS) → seluruh video yang dilaporkan dengan
// kategori itu, angka per video, dan totalnya.
//
// Dua hal dijaga supaya panel ini tidak menyesatkan:
//   • "N video · M punya angka" selalu ditulis. Angka per video hanya
//     ada untuk TikTok & Instagram; video lain tetap dihitung, tanpa
//     angka — total yang tampil adalah total dari yang TERUKUR, dan
//     panel mengatakannya.
//   • Daftar diurutkan yang punya angka dulu, terbesar di atas; yang
//     belum terukur di bawah, ditandai jelas — bukan diam-diam nol.
// ============================================================

import { useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, Layers, RefreshCw } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { EmptyState, GlassSkeleton } from "@/components/pri-ui";
import { PlatformIcon } from "@/components/platform-icon";
import { formatAngkaRingkas } from "@/lib/format";
import { getInsightKategori, getKeywordWajib, type InsightKategori } from "@/services";
import { cn } from "@/lib/utils";

const TILE: { kunci: keyof InsightKategori["ringkasan"]["total"]; label: string }[] = [
  { kunci: "tayangan", label: "Tayangan" },
  { kunci: "suka", label: "Suka" },
  { kunci: "komentar", label: "Komentar" },
  { kunci: "bagikan", label: "Dibagikan" },
];

const LABEL_PLATFORM: Record<string, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
  threads: "Threads",
  twitter: "X",
  bilibili: "Bilibili",
};

export function PanelInsightKategori() {
  const [daftar, setDaftar] = useState<string[] | null>(null);
  const [pilih, setPilih] = useState("");
  const [data, setData] = useState<InsightKategori | null>(null);
  const [galat, setGalat] = useState("");
  const [muat, setMuat] = useState(0);

  // Daftar kategori — dimuat sekali. Kategori pertama langsung dipilih
  // supaya panel tidak terbuka dalam keadaan kosong.
  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const k = await getKeywordWajib();
        if (!hidup) return;
        const nama = k.data.filter((x) => x.aktif).map((x) => x.keyword);
        setDaftar(nama);
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

  const r = data?.ringkasan;

  return (
    <GlassCard className="p-4">
      <div className="flex items-start gap-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-white"
          style={{ background: "linear-gradient(135deg, #0EA5E9, #0369A1)" }}
          aria-hidden="true"
        >
          <Layers className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-[15px] font-bold text-teks-utama">Insight per Kategori</p>
          <p className="mt-0.5 text-[11px] text-teks-sekunder">
            Seluruh video yang dilaporkan dengan kategori itu, beserta angkanya
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMuat((n) => n + 1)}
          aria-label="Muat ulang"
          className="glass btn-tekan flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-teks-utama"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Pemilih kategori */}
      {daftar === null ? (
        <GlassSkeleton className="mt-3 h-8 w-2/3 rounded-full" />
      ) : daftar.length === 0 ? (
        <p className="mt-3 text-[11.5px] text-teks-sekunder">
          Belum ada kategori. Tambahkan dari modul TV Rakyat Official (form video wajib).
        </p>
      ) : (
        <div className="scrollbar-tipis -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {daftar.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setPilih(k)}
              aria-pressed={pilih === k}
              className={cn(
                "btn-tekan shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-bold transition-colors",
                pilih === k ? "bg-pri text-white" : "glass-soft text-teks-sekunder",
              )}
            >
              {k}
            </button>
          ))}
        </div>
      )}

      {!pilih ? null : galat ? (
        <EmptyState
          ikon={AlertTriangle}
          judul="Gagal memuat"
          keterangan={galat}
          labelAksi="Coba Lagi"
          onAksi={() => setMuat((n) => n + 1)}
        />
      ) : !data || !r ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TILE.map((t) => (
            <GlassSkeleton key={t.kunci} className="h-[62px] rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TILE.map((t) => (
              <div key={t.kunci} className="glass-soft rounded-xl p-2.5 text-center">
                <p className="angka-tab font-heading text-[17px] leading-none font-extrabold text-teks-utama">
                  {r.jumlah_terukur > 0 ? formatAngkaRingkas(r.total[t.kunci]) : "–"}
                </p>
                <p className="mt-1 text-[10px] font-semibold text-teks-sekunder">{t.label}</p>
              </div>
            ))}
          </div>

          <p className="mt-2.5 text-[11px] leading-relaxed text-teks-sekunder">
            <b className="text-teks-utama">{r.jumlah_video}</b> video berkategori{" "}
            <b className="text-teks-utama">{data.kategori}</b> ·{" "}
            <b className="text-teks-utama">{r.jumlah_terukur}</b> punya angka.
            {r.jumlah_video > r.jumlah_terukur &&
              " Angka per video baru tersedia untuk TikTok & Instagram; sisanya dihitung sebagai laporan saja."}
          </p>

          {Object.keys(r.per_platform).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(r.per_platform).map(([p, n]) => (
                <span
                  key={p}
                  className="glass inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold text-teks-utama"
                >
                  <PlatformIcon platform={p} size={12} />
                  {LABEL_PLATFORM[p] ?? p}
                  <span className="angka-tab text-teks-sekunder">
                    {n.video}
                    {n.terukur < n.video ? ` (${n.terukur} terukur)` : ""}
                  </span>
                </span>
              ))}
            </div>
          )}

          {data.video.length === 0 ? (
            <p className="mt-3 text-[11.5px] text-teks-sekunder">
              Belum ada video yang dilaporkan dengan kategori ini.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1.5">
              {data.video.map((v) => (
                <li key={v.kunci} className="glass-soft flex items-center gap-2.5 rounded-xl p-2.5">
                  {v.thumbnail_url ? (
                    // Host thumbnail berubah-ubah (CDN TikTok/IG), jadi <img>
                    // biasa — bukan next/image yang butuh daftar host.
                    <img
                      src={v.thumbnail_url}
                      alt=""
                      className="h-12 w-9 shrink-0 rounded-lg object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="flex h-12 w-9 shrink-0 items-center justify-center rounded-lg bg-teks-sekunder/10">
                      <PlatformIcon platform={v.platform} size={14} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-bold text-teks-utama">
                      {v.judul || v.url.replace(/^https?:\/\/(www\.)?/, "")}
                    </p>
                    <p className="mt-0.5 truncate text-[10.5px] text-teks-sekunder">
                      {[LABEL_PLATFORM[v.platform] ?? v.platform, v.akun, v.pelapor && `lapor: ${v.pelapor}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {v.metrik ? (
                      <p className="angka-tab mt-0.5 text-[10.5px] text-teks-sekunder">
                        {formatAngkaRingkas(v.metrik.tayangan)} tayangan ·{" "}
                        {formatAngkaRingkas(v.metrik.suka)} suka ·{" "}
                        {formatAngkaRingkas(v.metrik.komentar)} komentar ·{" "}
                        {formatAngkaRingkas(v.metrik.bagikan)} dibagikan
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[10.5px] text-amber-600">belum ada angka</p>
                    )}
                  </div>
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Buka video"
                    className="glass btn-tekan flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-teks-utama"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          )}
          {data.ditampilkan < r.jumlah_video && (
            <p className="mt-2 text-[10.5px] text-teks-sekunder">
              Menampilkan {data.ditampilkan} dari {r.jumlah_video} video; totalnya tetap dihitung dari semua.
            </p>
          )}
        </>
      )}
    </GlassCard>
  );
}

"use client";

// ============================================================
// PanelVideoHarian (26 Sep 2026) — modul TV Rakyat Nasional.
//
// "Bisa melihat filter per akun terkait video yang diupload hari itu"
// (permintaan user). Pilih tanggal (bawaan: hari ini) → seluruh video
// yang terbit hari itu di akun-akun yang tersambung ke upload-post,
// berikut angkanya; saring per akun sosmed dan per platform.
//
// Angkanya dari katalog yang disegarkan penyegar (lib/segar-metrik-
// video): video hari ini ±tiap 15 menit. Panel memuat ulang sendiri tiap
// menit selama terlihat, supaya angka yang baru masuk langsung tampak.
// Video yang sudah dikenali tapi angkanya belum ditarik ditulis "belum
// ada angka" — bukan 0.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, RefreshCw, Search, Users, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { EmptyState, GlassSkeleton } from "@/components/pri-ui";
import { PlatformIcon } from "@/components/platform-icon";
import { formatAngkaRingkas, jamWIB, sejakRingkas, tanggalWibHariIni } from "@/lib/format";
import { kalimatKatalog, kalimatPembaruan } from "@/lib/kalimat-pembaruan";
import { getVideoHarian, type VideoHarian } from "@/services";
import { cn } from "@/lib/utils";
import { useIntervalAktif } from "@/hooks/use-tab-aktif";

const LABEL_PLATFORM: Record<string, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
  threads: "Threads",
  twitter: "X",
};
const URUTAN_PLATFORM = ["tiktok", "instagram", "youtube", "facebook", "twitter", "threads"];
const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const NAMA_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** Geser "YYYY-MM-DD" sekian hari. */
function geserTanggal(t: string, hari: number): string {
  return new Date(Date.parse(`${t}T00:00:00Z`) + hari * 86_400_000).toISOString().slice(0, 10);
}

function labelTanggal(t: string, hariIni: string): string {
  if (t === hariIni) return "Hari ini";
  if (t === geserTanggal(hariIni, -1)) return "Kemarin";
  const d = new Date(`${t}T00:00:00Z`);
  return `${NAMA_HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${NAMA_BULAN[d.getUTCMonth()]}`;
}

const TILE: { kunci: "video" | "tayangan" | "suka" | "komentar" | "bagikan"; label: string }[] = [
  { kunci: "video", label: "Video" },
  { kunci: "tayangan", label: "Tayangan" },
  { kunci: "suka", label: "Suka" },
  { kunci: "komentar", label: "Komentar" },
  { kunci: "bagikan", label: "Dibagikan" },
];

export function PanelVideoHarian() {
  const [hariIni, setHariIni] = useState(() => tanggalWibHariIni());
  const [tanggal, setTanggal] = useState(hariIni);
  const [akun, setAkun] = useState("");
  const [platform, setPlatform] = useState("");
  const [cari, setCari] = useState("");
  const [data, setData] = useState<VideoHarian | null>(null);
  const [galat, setGalat] = useState("");
  const [muat, setMuat] = useState(0);
  const [memuat, setMemuat] = useState(false);
  const kunciTerakhir = useRef("");

  useEffect(() => {
    let hidup = true;
    void (async () => {
      const kunci = `${tanggal}|${akun}|${platform}`;
      // Saringan berganti → kosongkan (kerangka); muat ulang berkala →
      // angka lama tetap tampil sampai yang baru datang (tanpa kedip).
      if (kunci !== kunciTerakhir.current) {
        kunciTerakhir.current = kunci;
        setData(null);
      }
      setGalat("");
      setMemuat(true);
      try {
        const d = await getVideoHarian({ tanggal, akun: akun || undefined, platform: platform || undefined });
        if (hidup) {
          setData(d);
          setHariIni(d.hari_ini);
        }
      } catch (e) {
        if (hidup) setGalat(e instanceof Error ? e.message : "Gagal memuat.");
      } finally {
        if (hidup) setMemuat(false);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [tanggal, akun, platform, muat]);

  // Se-realtime mungkin: muat ulang tiap menit selama panel terlihat DAN
  // tabnya aktif; menit yang terlewat disusul sekali saat tab dibuka lagi.
  useIntervalAktif(() => setMuat((n) => n + 1), 60_000);

  const akunTerpilih = useMemo(() => data?.akun.find((a) => a.kunci === akun) ?? null, [data, akun]);
  const pilihanAkun = useMemo(() => {
    if (!data) return [];
    const q = cari.trim().toLowerCase();
    return data.akun
      .filter((a) => !platform || a.platform === platform)
      .filter((a) => !q || a.nama.toLowerCase().includes(q) || a.username.toLowerCase().includes(q));
  }, [data, cari, platform]);
  const platformAda = useMemo(
    () => (data ? URUTAN_PLATFORM.filter((p) => data.per_platform[p]?.video) : []),
    [data],
  );

  function gantiTanggal(t: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || t > hariIni) return;
    setTanggal(t);
    setAkun("");
  }

  const t = data?.total_tampil;

  return (
    <GlassCard className="p-4">
      <div className="flex items-start gap-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-white"
          style={{ background: "linear-gradient(135deg, #F97316, #C2410C)" }}
          aria-hidden="true"
        >
          <Users className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-[15px] font-bold text-teks-utama">Video per Akun</p>
          <p className="mt-0.5 text-[11px] text-teks-sekunder">
            Seluruh video yang terbit di akun tersambung, beserta angkanya
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMuat((n) => n + 1)}
          aria-label="Muat ulang"
          className="glass btn-tekan flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-teks-utama"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", memuat && "animate-spin")} aria-hidden="true" />
        </button>
      </div>

      {/* Tanggal */}
      <div className="mt-3 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => gantiTanggal(geserTanggal(tanggal, -1))}
          aria-label="Hari sebelumnya"
          className="glass btn-tekan flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-teks-utama"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <label className="glass-soft relative flex h-8 min-w-0 flex-1 items-center justify-center rounded-full px-3 text-[12px] font-bold text-teks-utama">
          {labelTanggal(tanggal, hariIni)}
          <span className="ml-1 text-[10.5px] font-semibold text-teks-sekunder">{tanggal}</span>
          {/* Pemilih tanggal asli menutupi label (tak terlihat) — ketuk = kalender. */}
          <input
            type="date"
            value={tanggal}
            max={hariIni}
            onChange={(e) => gantiTanggal(e.target.value)}
            aria-label="Pilih tanggal"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
        <button
          type="button"
          onClick={() => gantiTanggal(geserTanggal(tanggal, 1))}
          disabled={tanggal >= hariIni}
          aria-label="Hari berikutnya"
          className="glass btn-tekan flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-teks-utama disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
        {tanggal !== hariIni && (
          <button
            type="button"
            onClick={() => gantiTanggal(hariIni)}
            className="glass btn-tekan shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold text-teks-utama"
          >
            Hari ini
          </button>
        )}
      </div>

      {/* Platform */}
      {platformAda.length > 0 && (
        <div className="scrollbar-tipis -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {["", ...platformAda].map((p) => (
            <button
              key={p || "semua"}
              type="button"
              onClick={() => {
                setPlatform(p);
                setAkun("");
              }}
              aria-pressed={platform === p}
              className={cn(
                "btn-tekan flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold",
                platform === p ? "bg-pri text-white" : "glass-soft text-teks-sekunder",
              )}
            >
              {p && <PlatformIcon platform={p} size={12} />}
              {p ? (LABEL_PLATFORM[p] ?? p) : "Semua"}
              <span className="angka-tab opacity-80">{p ? data?.per_platform[p]?.video ?? 0 : data?.total.video ?? 0}</span>
            </button>
          ))}
        </div>
      )}

      {/* Akun */}
      {data && data.akun.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          <div className="glass-input flex h-9 items-center gap-2 rounded-xl px-3">
            <Search className="h-3.5 w-3.5 shrink-0 text-teks-sekunder" aria-hidden="true" />
            <input
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              placeholder="Cari nama anggota / akun…"
              aria-label="Cari akun"
              className="min-w-0 flex-1 bg-transparent text-[12.5px] text-teks-utama outline-none"
            />
            {cari && (
              <button type="button" onClick={() => setCari("")} aria-label="Hapus pencarian" className="text-teks-sekunder">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
          <select
            value={akun}
            onChange={(e) => setAkun(e.target.value)}
            aria-label="Pilih akun"
            className="glass-input h-10 w-full rounded-xl px-3 text-[12.5px] text-teks-utama"
          >
            <option value="">
              Semua akun ({pilihanAkun.length}
              {cari || platform ? " cocok" : ""})
            </option>
            {akunTerpilih && !pilihanAkun.some((a) => a.kunci === akunTerpilih.kunci) && (
              <option value={akunTerpilih.kunci}>
                {akunTerpilih.nama || "?"} · {LABEL_PLATFORM[akunTerpilih.platform] ?? akunTerpilih.platform}
                {akunTerpilih.username ? ` @${akunTerpilih.username}` : ""} ({akunTerpilih.video} video)
              </option>
            )}
            {pilihanAkun.map((a) => (
              <option key={a.kunci} value={a.kunci}>
                {a.nama || "?"} · {LABEL_PLATFORM[a.platform] ?? a.platform}
                {a.username ? ` @${a.username}` : ""} ({a.video} video
                {a.berangka > 0 ? ` · ${formatAngkaRingkas(a.tayangan)} tayang` : ""})
              </option>
            ))}
          </select>
        </div>
      )}

      {galat ? (
        <EmptyState
          ikon={AlertTriangle}
          judul="Gagal memuat"
          keterangan={galat}
          labelAksi="Coba Lagi"
          onAksi={() => setMuat((n) => n + 1)}
        />
      ) : !data || !t ? (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {TILE.map((x) => (
            <GlassSkeleton key={x.kunci} className="h-[62px] rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {TILE.map((x) => (
              <div key={x.kunci} className="glass-soft rounded-xl p-2.5 text-center">
                <p className="angka-tab font-heading text-[16px] leading-none font-extrabold text-teks-utama">
                  {x.kunci === "video" ? formatAngkaRingkas(t.video) : t.berangka > 0 ? formatAngkaRingkas(t[x.kunci]) : "–"}
                </p>
                <p className="mt-1 text-[10px] font-semibold text-teks-sekunder">{x.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-teks-sekunder">
            <b className="text-teks-utama">{t.berangka}</b> dari {t.video} video sudah berangka
            {akunTerpilih ? ` · ${akunTerpilih.nama || "akun"} (${LABEL_PLATFORM[akunTerpilih.platform] ?? akunTerpilih.platform})` : ""}.{" "}
            {kalimatPembaruan(data.pembaruan)}
          </p>
          {kalimatKatalog(data.pembaruan) && (
            <p className="mt-0.5 text-[10.5px] text-teks-sekunder">{kalimatKatalog(data.pembaruan)}</p>
          )}

          {/* Akun teratas hari itu (tanpa akun terpilih) — ketuk untuk menyaring. */}
          {!akun && pilihanAkun.length > 1 && (
            <>
              <h3 className="mt-3 text-[12px] font-bold text-teks-utama">Akun teratas</h3>
              <ul className="mt-1.5 flex flex-col gap-1">
                {pilihanAkun.slice(0, 8).map((a, i) => (
                  <li key={a.kunci}>
                    <button
                      type="button"
                      onClick={() => setAkun(a.kunci)}
                      className="glass-soft btn-tekan flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left"
                    >
                      <span className="angka-tab w-4 shrink-0 text-[11px] font-bold text-teks-sekunder">{i + 1}</span>
                      <PlatformIcon platform={a.platform} size={14} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-bold text-teks-utama">{a.nama || "?"}</span>
                        <span className="block truncate text-[10.5px] text-teks-sekunder">
                          {a.username ? `@${a.username}` : LABEL_PLATFORM[a.platform]} · {a.video} video
                        </span>
                      </span>
                      <span className="angka-tab shrink-0 text-[11.5px] font-bold text-teks-utama">
                        {a.berangka > 0 ? `${formatAngkaRingkas(a.tayangan)} tayang` : "–"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {data.video.length === 0 ? (
            <p className="mt-3 text-[11.5px] text-teks-sekunder">
              Belum ada video di akun tersambung pada tanggal ini{akun ? " untuk akun ini" : ""}.
            </p>
          ) : (
            <>
              <h3 className="mt-3 text-[12px] font-bold text-teks-utama">
                Video <span className="font-semibold text-teks-sekunder">· urut tayangan</span>
              </h3>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {data.video.map((v) => (
                  <li key={v.kode} className="glass-soft flex items-center gap-2.5 rounded-xl p-2.5">
                    {v.thumbnail_url ? (
                      // Host thumbnail berubah-ubah (CDN tiap platform) → <img> biasa.
                      <img src={v.thumbnail_url} alt="" className="h-12 w-9 shrink-0 rounded-lg object-cover" loading="lazy" />
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
                        {[
                          LABEL_PLATFORM[v.platform] ?? v.platform,
                          v.nama,
                          v.akun && `@${v.akun}`,
                          v.waktu_posting && `terbit ${jamWIB(v.waktu_posting)}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {v.metrik ? (
                        <p className="angka-tab mt-0.5 text-[10.5px] text-teks-sekunder">
                          <b className="text-teks-utama">{formatAngkaRingkas(v.metrik.tayangan)}</b> tayang ·{" "}
                          {formatAngkaRingkas(v.metrik.suka)} suka · {formatAngkaRingkas(v.metrik.komentar)} komentar ·{" "}
                          {formatAngkaRingkas(v.metrik.bagikan)} dibagikan
                          {v.metrik.diperbarui_pada && (
                            <span className="text-teks-sekunder/80"> · {sejakRingkas(v.metrik.diperbarui_pada)}</span>
                          )}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[10.5px] text-amber-600">belum ada angka — menunggu giliran ditarik</p>
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
              {data.ditampilkan < t.video && (
                <p className="mt-2 text-[10.5px] text-teks-sekunder">
                  Menampilkan {data.ditampilkan} dari {t.video} video; totalnya tetap dihitung dari semua. Pilih akun untuk
                  melihat semua videonya.
                </p>
              )}
            </>
          )}
        </>
      )}
    </GlassCard>
  );
}

"use client";

// ============================================================
// PanelInsightKategori (12 Sep 2026, dirombak 25 Sep 2026) — modul TV
// Rakyat Nasional.
//
// Pilih satu kategori (mis. BPJS) → dua bagian:
//
//  1. UNGGAHAN LEWAT SUPERAPP — video yang diunggah lewat aplikasi dengan
//     kategori itu; angkanya per platform (tayangan, suka, komentar,
//     dibagikan). Tombol ↻ menarik satu unggahan dari upload-post saat
//     itu juga.
//  2. SEMUA VIDEO KATEGORI — unggahan, laporan anggota, dan link yang
//     ditambahkan ke kategori, satu baris per video (tanpa dobel).
//
// Angka per video DIPERBARUI OTOMATIS TIAP HARI dari upload-post
// (lib/segar-metrik-video.ts) — panel ini hanya membaca, jadi membukanya
// berkali-kali tidak menghabiskan kuota. Video di akun yang tidak
// tersambung ke upload-post memang tidak punya angka.
//
// Angka yang tidak diberikan sumbernya ditulis "–", bukan 0: nol berarti
// benar-benar nol, "–" berarti tidak diketahui.
// ============================================================

import { useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, Layers, RefreshCw, Upload } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { EmptyState, GlassSkeleton } from "@/components/pri-ui";
import { PlatformIcon } from "@/components/platform-icon";
import { formatAngkaRingkas, jamWIB, sejakRingkas } from "@/lib/format";
import { kalimatKatalog, kalimatPembaruan } from "@/lib/kalimat-pembaruan";
import { toast } from "@/hooks/use-app-store";
import {
  getInsightKategori,
  getKeywordWajib,
  tarikMetrikPostSekarang,
  type HasilTarikMetrik,
  type InsightKategori,
} from "@/services";
import { cn } from "@/lib/utils";

const TILE_KATEGORI: { kunci: "tayangan" | "suka" | "komentar" | "bagikan"; label: string }[] = [
  { kunci: "tayangan", label: "Tayangan" },
  { kunci: "suka", label: "Suka" },
  { kunci: "komentar", label: "Komentar" },
  { kunci: "bagikan", label: "Dibagikan" },
];

const TILE_UP: { kunci: "tayangan" | "suka" | "komentar" | "bagikan" | "impresi" | "jangkauan"; label: string }[] = [
  { kunci: "tayangan", label: "Tayangan" },
  { kunci: "suka", label: "Suka" },
  { kunci: "komentar", label: "Komentar" },
  { kunci: "bagikan", label: "Dibagikan" },
  { kunci: "impresi", label: "Impresi" },
  { kunci: "jangkauan", label: "Jangkauan" },
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

const LABEL_STATUS: Record<string, string> = {
  ok: "angka diperbarui",
  galat: "upload-post tidak bisa membaca angkanya",
  tidak_terbit: "tidak terbit di platform ini",
};

const angka = (v: number | null | undefined) => (v == null ? "–" : formatAngkaRingkas(v));

export function PanelInsightKategori({
  onBukaHalaman,
}: {
  /** Buka halaman penuh (kartu embed per sosmed) untuk kategori terpilih. */
  onBukaHalaman?: (kategori: string) => void;
} = {}) {
  const [daftar, setDaftar] = useState<string[] | null>(null);
  // Kategori yang sudah SELESAI tetap tampil di insight (datanya justru
  // yang dibutuhkan setelah acara usai) — hanya diberi tanda.
  const [selesai, setSelesai] = useState<Set<string>>(() => new Set());
  const [pilih, setPilih] = useState("");
  const [data, setData] = useState<InsightKategori | null>(null);
  const [galat, setGalat] = useState("");
  const [muat, setMuat] = useState(0);
  // "Tarik sekarang" per unggahan: satu permintaan live ke upload-post.
  // Hasil per platform (termasuk alasan bila gagal) ditampilkan di bawah
  // daftar supaya "–" selalu punya penjelasan.
  const [tarikId, setTarikId] = useState<string | null>(null);
  const [tarikTerakhir, setTarikTerakhir] = useState<HasilTarikMetrik | null>(null);

  async function tarikSekarang(id: string) {
    if (tarikId) return;
    setTarikId(id);
    try {
      const h = await tarikMetrikPostSekarang(id);
      setTarikTerakhir(h);
      const ok = h.per_platform.filter((p) => p.status === "ok").length;
      const gagal = h.per_platform.filter((p) => p.status === "galat");
      toast(
        ok > 0 ? "sukses" : "info",
        ok > 0 ? `Angka ${ok} platform diperbarui` : "upload-post belum memberi angka",
        gagal.length > 0
          ? `${gagal.map((g) => LABEL_PLATFORM[g.platform] ?? g.platform).join(", ")}: ${gagal[0].galat}`
          : ok > 0
            ? "Langsung dari upload-post."
            : "Lihat rincian di bawah daftar.",
      );
      setMuat((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal menarik dari upload-post", e instanceof Error ? e.message : "");
    } finally {
      setTarikId(null);
    }
  }

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

  const r = data?.ringkasan;
  // Impresi & jangkauan hanya ada bila database menyimpan angka mentah
  // (sql/50); tanpa itu tile-nya disembunyikan, bukan ditulis 0.
  const tileUp = data
    ? TILE_UP.filter(
        (t) =>
          (t.kunci !== "impresi" && t.kunci !== "jangkauan") ||
          data.postingan.some((p) => Object.values(p.per_platform).some((m) => m[t.kunci] != null)),
      )
    : TILE_UP.slice(0, 4);

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
            Tayangan, suka, komentar & dibagikan tiap video — diperbarui otomatis tiap hari
          </p>
        </div>
        {onBukaHalaman && (
          <button
            type="button"
            onClick={() => pilih && onBukaHalaman(pilih)}
            disabled={!pilih}
            className="btn-tekan flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #0EA5E9, #0369A1)" }}
          >
            Halaman penuh
          </button>
        )}
        <button
          type="button"
          onClick={() => setMuat((n) => n + 1)}
          aria-label="Muat ulang"
          className="glass btn-tekan flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-teks-utama"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

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
              {selesai.has(k) && (
                <span className="ml-1 text-[9.5px] font-semibold opacity-80">· selesai</span>
              )}
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
          {TILE_KATEGORI.map((t) => (
            <GlassSkeleton key={t.kunci} className="h-[62px] rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {/* ===== Ringkasan seluruh video kategori ===== */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TILE_KATEGORI.map((t) => (
              <div key={t.kunci} className="glass-soft rounded-xl p-2.5 text-center">
                <p className="angka-tab font-heading text-[16px] leading-none font-extrabold text-teks-utama">
                  {r.jumlah_terukur > 0 ? formatAngkaRingkas(r.total[t.kunci]) : "–"}
                </p>
                <p className="mt-1 text-[10px] font-semibold text-teks-sekunder">{t.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-teks-sekunder">
            <b className="text-teks-utama">{r.jumlah_video}</b> video kategori ini ·{" "}
            <b className="text-teks-utama">{r.jumlah_terukur}</b> punya angka
            {r.rata_tayangan != null && (
              <>
                {" "}· rata-rata <b className="text-teks-utama">{formatAngkaRingkas(r.rata_tayangan)}</b> tayangan/video
              </>
            )}
            .
          </p>
          <p
            className={cn(
              "mt-1 text-[10.5px] leading-relaxed",
              data.pembaruan?.jeda_sampai && Date.parse(data.pembaruan.jeda_sampai) > Date.now()
                ? "text-amber-600"
                : "text-teks-sekunder",
            )}
          >
            {kalimatPembaruan(data.pembaruan)}
          </p>
          {kalimatKatalog(data.pembaruan) && (
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-teks-sekunder">{kalimatKatalog(data.pembaruan)}</p>
          )}
          {!data.upload_post_siap && (
            <p className="mt-1 text-[10.5px] text-amber-600">
              Kunci upload-post belum terpasang di server ini — angka tidak bisa ditarik.
            </p>
          )}

          {/* ===== 1. Unggahan lewat SuperApp ===== */}
          <h3 className="mt-4 flex items-center gap-1.5 font-heading text-[13px] font-bold text-teks-utama">
            <Upload className="h-3.5 w-3.5 text-sky-500" aria-hidden="true" />
            Unggahan lewat SuperApp
            <span className="text-[11px] font-semibold text-teks-sekunder">
              · {data.postingan.length} unggahan · {data.postingan_terukur} punya angka
            </span>
          </h3>
          {data.postingan.length > 0 && (
            <div className={cn("mt-2 grid gap-2", tileUp.length > 4 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4")}>
              {tileUp.map((t) => (
                <div key={t.kunci} className="glass-soft rounded-xl p-2.5 text-center">
                  <p className="angka-tab font-heading text-[16px] leading-none font-extrabold text-teks-utama">
                    {data.postingan_terukur > 0 ? angka(data.total_up[t.kunci]) : "–"}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold text-teks-sekunder">{t.label}</p>
                </div>
              ))}
            </div>
          )}

          {data.postingan.length === 0 ? (
            <p className="mt-2 text-[11.5px] text-teks-sekunder">
              Belum ada unggahan lewat SuperApp dengan kategori ini. Kategori unggahan dicatat sejak 25 Sep 2026.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {data.postingan.map((p) => (
                <li key={p.id} className="glass-soft rounded-xl p-2.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-bold text-teks-utama">{p.judul || "(tanpa judul)"}</p>
                      <p className="mt-0.5 truncate text-[10.5px] text-teks-sekunder">
                        {[p.pengunggah, jamWIB(p.dibuat_pada)].filter(Boolean).join(" · ")}
                        {p.metrik_pada
                          ? ` · angka ${sejakRingkas(p.metrik_pada)}`
                          : p.terlacak
                            ? " · menunggu penarikan harian"
                            : " · tidak tercatat di upload-post"}
                      </p>
                    </div>
                    <span className="angka-tab shrink-0 text-[11px] font-bold text-teks-utama">
                      {p.total.platform_terukur > 0 ? `${angka(p.total.tayangan)} tayang` : "–"}
                    </span>
                    <button
                      type="button"
                      onClick={() => void tarikSekarang(p.id)}
                      disabled={tarikId !== null || !data.upload_post_siap || !p.terlacak}
                      aria-label="Tarik angka dari upload-post sekarang"
                      title="Tarik angka dari upload-post sekarang"
                      className="glass btn-tekan flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-teks-utama disabled:opacity-50"
                    >
                      <RefreshCw
                        className={cn("h-3.5 w-3.5", tarikId === p.id && "animate-spin")}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                  {Object.keys(p.per_platform).length > 0 && (
                    <div className="mt-1.5 flex flex-col gap-1">
                      {Object.entries(p.per_platform).map(([pf, m]) => (
                        <div key={pf} className="flex items-center gap-1.5 text-[10.5px] text-teks-sekunder">
                          <PlatformIcon platform={pf} size={12} />
                          <span className="w-16 shrink-0 font-semibold text-teks-utama">{LABEL_PLATFORM[pf] ?? pf}</span>
                          <span className="angka-tab min-w-0 flex-1">
                            {angka(m.tayangan)} tayang · {angka(m.suka)} suka · {angka(m.komentar)} komentar ·{" "}
                            {angka(m.bagikan)} dibagikan
                            {m.impresi != null && ` · ${angka(m.impresi)} impresi`}
                            {m.jangkauan != null && ` · ${angka(m.jangkauan)} jangkauan`}
                            {m.simpan != null && ` · ${angka(m.simpan)} disimpan`}
                            {/* Angka lain dari upload-post yang tidak masuk kolom baku:
                                tetap ditampilkan apa adanya, bukan hilang diam-diam. */}
                            {m.lain && Object.keys(m.lain).length > 0 && (
                              <span className="block text-[10px] text-teks-sekunder/80">
                                lainnya: {Object.entries(m.lain).map(([k, v]) => `${k} ${formatAngkaRingkas(v)}`).join(" · ")}
                              </span>
                            )}
                          </span>
                          {m.post_url && (
                            <a
                              href={m.post_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Buka di ${LABEL_PLATFORM[pf] ?? pf}`}
                              className="shrink-0 text-teks-utama"
                            >
                              <ExternalLink className="h-3 w-3" aria-hidden="true" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Hasil "Tarik sekarang" terakhir — per platform beserta alasannya,
              supaya "–" selalu bisa dijelaskan (token kedaluwarsa, video
              dihapus, tidak terbit, …). */}
          {tarikTerakhir && (
            <details className="glass-soft mt-2 rounded-xl p-2.5 text-[10.5px] text-teks-sekunder" open>
              <summary className="cursor-pointer font-bold text-teks-utama">
                Tarikan terakhir — {tarikTerakhir.judul || `unggahan #${tarikTerakhir.post_id}`}
                {tarikTerakhir.profil ? ` · profil ${tarikTerakhir.profil}` : ""}
              </summary>
              <ul className="mt-1.5 flex flex-col gap-1">
                {tarikTerakhir.per_platform.map((b) => (
                  <li key={b.platform} className="flex items-start gap-1.5">
                    <PlatformIcon platform={b.platform} size={12} />
                    <span className="w-16 shrink-0 font-semibold text-teks-utama">
                      {LABEL_PLATFORM[b.platform] ?? b.platform}
                    </span>
                    <span className={cn("min-w-0 flex-1", b.status !== "ok" && "text-amber-600")}>
                      {b.status === "ok"
                        ? `${LABEL_STATUS.ok}${b.tayangan != null ? ` · ${formatAngkaRingkas(b.tayangan)} tayang` : ""}`
                        : `${LABEL_STATUS[b.status] ?? b.status}${
                            b.galat && b.galat !== LABEL_STATUS[b.status] ? ` — ${b.galat}` : ""
                          }`}
                    </span>
                  </li>
                ))}
                {tarikTerakhir.per_platform.length === 0 && (
                  <li>upload-post tidak mengembalikan platform apa pun untuk unggahan ini.</li>
                )}
              </ul>
            </details>
          )}

          {/* ===== 2. Semua video kategori (unggahan + laporan + link) ===== */}
          <h3 className="mt-5 font-heading text-[13px] font-bold text-teks-utama">
            Semua video kategori
            <span className="ml-1 text-[11px] font-semibold text-teks-sekunder">
              · {r.jumlah_video} video · {r.jumlah_terukur} punya angka
            </span>
          </h3>
          <p className="mt-1 text-[10.5px] leading-relaxed text-teks-sekunder">
            Unggahan SuperApp, laporan anggota, dan link kategori — satu baris per video. Angka dibaca upload-post
            dari akun anggota yang tersambung; video di akun lain tampil tanpa angka.
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

          {data.video.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5">
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
                      {[
                        LABEL_PLATFORM[v.platform] ?? v.platform,
                        v.akun,
                        v.asal === "kategori"
                          ? "ditambahkan ke kategori"
                          : v.pelapor && (v.asal === "unggahan" ? `unggah: ${v.pelapor}` : `lapor: ${v.pelapor}`),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {v.metrik ? (
                      <p className="angka-tab mt-0.5 text-[10.5px] text-teks-sekunder">
                        {formatAngkaRingkas(v.metrik.tayangan)} tayangan · {formatAngkaRingkas(v.metrik.suka)} suka ·{" "}
                        {formatAngkaRingkas(v.metrik.komentar)} komentar · {formatAngkaRingkas(v.metrik.bagikan)} dibagikan
                        {v.metrik.diperbarui_pada && (
                          <span className="text-teks-sekunder/80"> · {sejakRingkas(v.metrik.diperbarui_pada)}</span>
                        )}
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

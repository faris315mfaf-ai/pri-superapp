"use client";

// ============================================================
// PanelInsightKategori (12 Sep 2026) — modul TV Rakyat Nasional.
//
// Pilih satu kategori (mis. BPJS) → dua bagian yang sengaja DIPISAH
// karena sumber dan artinya berbeda:
//
//  1. POSTINGAN LEWAT SUPERAPP — video yang diunggah lewat aplikasi dan
//     diberi kategori saat unggah. Angkanya LANGSUNG dari upload-post
//     (post-analytics), per postingan per platform: suka, komentar,
//     dibagikan, tayangan, impresi, jangkauan. Inilah yang dipakai untuk
//     pengiklan: "20 video bulan ini dapat berapa" dijawab dari sini,
//     lengkap dengan jam penarikan angkanya.
//  2. LAPORAN ANGGOTA — semua video yang dilaporkan dengan kategori itu;
//     angkanya dari sapuan TikHub (TikTok & Instagram saja).
//
// Angka yang tidak diberikan sumbernya ditulis "–", bukan 0: nol berarti
// benar-benar nol, "–" berarti tidak diketahui. Keduanya tidak boleh
// tampak sama.
// ============================================================

import { useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, Layers, RefreshCw, Upload } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { EmptyState, GlassSkeleton } from "@/components/pri-ui";
import { PlatformIcon } from "@/components/platform-icon";
import { formatAngkaRingkas, jamWIB } from "@/lib/format";
import { toast, useAppStore } from "@/hooks/use-app-store";
import {
  getInsightKategori,
  getKeywordWajib,
  tarikMetrikPostSekarang,
  type HasilTarikMetrik,
  type InsightKategori,
} from "@/services";
import { cn } from "@/lib/utils";

const TILE_LAPORAN: { kunci: keyof InsightKategori["ringkasan"]["total"]; label: string }[] = [
  { kunci: "tayangan", label: "Tayangan" },
  { kunci: "suka", label: "Suka" },
  { kunci: "komentar", label: "Komentar" },
  { kunci: "bagikan", label: "Dibagikan" },
];

const TILE_UP: { kunci: "suka" | "komentar" | "bagikan" | "tayangan" | "impresi" | "jangkauan"; label: string }[] = [
  { kunci: "suka", label: "Suka" },
  { kunci: "komentar", label: "Komentar" },
  { kunci: "bagikan", label: "Dibagikan" },
  { kunci: "tayangan", label: "Tayangan" },
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

const angka = (v: number | null | undefined) => (v == null ? "–" : formatAngkaRingkas(v));

export function PanelInsightKategori() {
  const [daftar, setDaftar] = useState<string[] | null>(null);
  const [pilih, setPilih] = useState("");
  const [data, setData] = useState<InsightKategori | null>(null);
  const [galat, setGalat] = useState("");
  const [muat, setMuat] = useState(0);
  // "Tarik sekarang" per unggahan (13 Sep 2026): menarik profil pemiliknya
  // dari upload-post saat itu juga. Untuk master, jawaban mentahnya ikut
  // ditampilkan di bawah — pengganti alamat API yang tidak bisa dibuka
  // dari bilah alamat (butuh token login).
  const peran = useAppStore((s) => s.user?.role);
  const [tarikId, setTarikId] = useState<string | null>(null);
  const [mentahTerakhir, setMentahTerakhir] = useState<HasilTarikMetrik | null>(null);

  async function tarikSekarang(id: string) {
    if (tarikId) return;
    setTarikId(id);
    try {
      const h = await tarikMetrikPostSekarang(id);
      setMentahTerakhir(h);
      toast(
        h.unggahan_terisi > 0 ? "sukses" : "info",
        `upload-post: ${h.postingan_di_upload_post} postingan di profil ${h.profil}`,
        h.unggahan_terisi > 0
          ? `${h.unggahan_terisi} unggahan terisi angkanya.`
          : "Tidak ada yang cocok dengan unggahan aplikasi — lihat rincian di bawah daftar.",
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
            Angka per postingan dari upload-post, plus laporan anggota
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
        <div className="mt-3 grid grid-cols-3 gap-2">
          {TILE_UP.map((t) => (
            <GlassSkeleton key={t.kunci} className="h-[62px] rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {/* ===== 1. Postingan lewat SuperApp (upload-post) ===== */}
          <h3 className="mt-4 flex items-center gap-1.5 font-heading text-[13px] font-bold text-teks-utama">
            <Upload className="h-3.5 w-3.5 text-sky-500" aria-hidden="true" />
            Postingan lewat SuperApp
            <span className="text-[11px] font-semibold text-teks-sekunder">
              · {data.postingan.length} unggahan · {data.postingan_terukur} punya angka
            </span>
          </h3>
          {!data.upload_post_siap && (
            <p className="mt-1 text-[10.5px] text-amber-600">
              Kunci upload-post belum terpasang di server ini — angka tidak bisa ditarik.
            </p>
          )}
          <div className="mt-2 grid grid-cols-3 gap-2">
            {TILE_UP.map((t) => (
              <div key={t.kunci} className="glass-soft rounded-xl p-2.5 text-center">
                <p className="angka-tab font-heading text-[16px] leading-none font-extrabold text-teks-utama">
                  {data.postingan_terukur > 0 ? angka(data.total_up[t.kunci]) : "–"}
                </p>
                <p className="mt-1 text-[10px] font-semibold text-teks-sekunder">{t.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-teks-sekunder">
            Total dari {data.total_up.platform_terukur} platform yang memberi angka. Angka disegarkan
            bertahap dari upload-post; unggahan yang belum ditarik menyusul di pembukaan berikutnya.
          </p>

          {data.postingan.length === 0 ? (
            <p className="mt-2 text-[11.5px] text-teks-sekunder">
              Belum ada unggahan lewat SuperApp dengan kategori ini.
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
                          ? ` · angka ${jamWIB(p.metrik_pada)}`
                          : p.terlacak
                            ? " · angka belum ditarik"
                            : " · tidak terlacak (tanpa request_id)"}
                      </p>
                    </div>
                    <span className="angka-tab shrink-0 text-[11px] font-bold text-teks-utama">
                      {p.total.platform_terukur > 0 ? `${angka(p.total.tayangan)} tayang` : "–"}
                    </span>
                    <button
                      type="button"
                      onClick={() => void tarikSekarang(p.id)}
                      disabled={tarikId !== null || !data.upload_post_siap}
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
                            {angka(m.suka)} suka · {angka(m.komentar)} komentar · {angka(m.bagikan)} dibagikan ·{" "}
                            {angka(m.tayangan)} tayang · {angka(m.impresi)} impresi · {angka(m.jangkauan)} jangkauan
                            {m.simpan != null && ` · ${angka(m.simpan)} disimpan`}
                            {/* Angka lain dari upload-post yang tidak masuk kolom baku:
                                tetap ditampilkan apa adanya, bukan hilang diam-diam. */}
                            {m.lain && Object.keys(m.lain).length > 0 && (
                              <span className="block text-[10px] text-teks-sekunder/80">
                                lainnya: {Object.entries(m.lain).map(([k, v]) => `${k} ${formatAngkaRingkas(v)}`).join(" · ")}
                              </span>
                            )}
                            {m.captured_at && (
                              <span className="block text-[10px] text-teks-sekunder/80">
                                ditarik upload-post {jamWIB(m.captured_at)}
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

          {/* Hasil "Tarik sekarang" terakhir — supaya yang tidak cocok bisa
              dilihat sebabnya, bukan sekadar "–". Master juga melihat
              jawaban upload-post apa adanya. */}
          {mentahTerakhir && (
            <details className="glass-soft mt-2 rounded-xl p-2.5 text-[10.5px] text-teks-sekunder">
              <summary className="cursor-pointer font-bold text-teks-utama">
                Rincian tarikan terakhir — profil {mentahTerakhir.profil}
              </summary>
              <p className="mt-1.5">
                upload-post mengembalikan <b>{mentahTerakhir.postingan_di_upload_post}</b> postingan
                untuk profil ini; <b>{mentahTerakhir.unggahan_terisi}</b> unggahan aplikasi terisi.
                {mentahTerakhir.postingan_di_upload_post === 0 &&
                  " Nol postingan berarti upload-post belum punya rekaman angka untuk profil ini — angka baru tersedia sehari setelah unggahan tayang."}
                {mentahTerakhir.postingan_di_upload_post > 0 && mentahTerakhir.unggahan_terisi === 0 &&
                  " Ada postingan, tapi tidak satu pun cocok dengan alamat yang tercatat di laporan — kirimkan rincian ini ke developer."}
              </p>
              {peran === "master" && mentahTerakhir.mentah_halaman_pertama !== undefined && (
                <pre className="scrollbar-tipis mt-2 max-h-72 overflow-auto rounded-lg bg-black/5 p-2 text-[10px] leading-snug whitespace-pre-wrap break-all dark:bg-white/10">
                  {JSON.stringify(mentahTerakhir.mentah_halaman_pertama, null, 1).slice(0, 12000)}
                </pre>
              )}
            </details>
          )}

          {/* ===== 2. Laporan anggota (TikHub) ===== */}
          <h3 className="mt-5 font-heading text-[13px] font-bold text-teks-utama">
            Laporan anggota
            <span className="ml-1 text-[11px] font-semibold text-teks-sekunder">
              · {r.jumlah_video} video · {r.jumlah_terukur} punya angka
            </span>
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TILE_LAPORAN.map((t) => (
              <div key={t.kunci} className="glass-soft rounded-xl p-2.5 text-center">
                <p className="angka-tab font-heading text-[16px] leading-none font-extrabold text-teks-utama">
                  {r.jumlah_terukur > 0 ? formatAngkaRingkas(r.total[t.kunci]) : "–"}
                </p>
                <p className="mt-1 text-[10px] font-semibold text-teks-sekunder">{t.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-teks-sekunder">
            Angka per video dari sapuan TikHub — hanya TikTok & Instagram; video lain dihitung sebagai laporan saja.
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
                      {[LABEL_PLATFORM[v.platform] ?? v.platform, v.akun, v.pelapor && `lapor: ${v.pelapor}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {v.metrik ? (
                      <p className="angka-tab mt-0.5 text-[10.5px] text-teks-sekunder">
                        {formatAngkaRingkas(v.metrik.tayangan)} tayangan · {formatAngkaRingkas(v.metrik.suka)} suka ·{" "}
                        {formatAngkaRingkas(v.metrik.komentar)} komentar · {formatAngkaRingkas(v.metrik.bagikan)} dibagikan
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

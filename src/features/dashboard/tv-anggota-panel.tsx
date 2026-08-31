"use client";

// ============================================================
// TvAnggotaPanel — PENGENDALI akun TV Rakyat anggota (upload-post)
// di dashboard TV (rombakan TVR Saya, 31 Agu 2026):
//  1. Kuota profil (terpakai / 225) + paket.
//  2. GABUNGAN insight: pengikut Official (Ayrshare) + total anggota.
//  3. Daftar SEMUA profil anggota (x/6 akun tertaut, pengikut) —
//     klik = insight lengkap per profil (cache 15 menit, bisa paksa).
// ============================================================

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RefreshCw, Users, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, GlassSkeleton } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { toast } from "@/hooks/use-app-store";
import {
  getInsightSosmed,
  getTvAnggotaDashboard,
  getTvAnggotaProfil,
  type ProfilTvAnggota,
} from "@/services";
import { PlatformIcon } from "@/components/platform-icon";
import { cn } from "@/lib/utils";

const PLATFORM6 = ["instagram", "tiktok", "youtube", "facebook", "threads", "twitter"];
const LABEL: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  facebook: "Facebook",
  threads: "Threads",
  twitter: "X",
  x: "X",
};

/** Metrik angka dari objek analitik satu platform (jujur, maks 6). */
function metrikDari(obj: unknown): { label: string; nilai: number }[] {
  if (!obj || typeof obj !== "object") return [];
  const o = obj as Record<string, unknown>;
  if (o.success === false) return [];
  const LABELM: Record<string, string> = {
    followers: "Pengikut",
    follower_count: "Pengikut",
    followers_count: "Pengikut",
    subscribers: "Subscriber",
    fans: "Pengikut",
    views: "Tayangan",
    impressions: "Impresi",
    reach: "Jangkauan",
    likes: "Suka",
    media_count: "Post",
    video_count: "Video",
  };
  const hasil: { label: string; nilai: number }[] = [];
  for (const [k, v] of Object.entries(o)) {
    const n = Number(v);
    if (v == null || !Number.isFinite(n) || /id$/i.test(k)) continue;
    hasil.push({ label: LABELM[k] ?? k.replace(/_/g, " "), nilai: n });
    if (hasil.length >= 6) break;
  }
  return hasil;
}

export function TvAnggotaPanel() {
  const [data, setData] = useState<{
    siap: boolean;
    kuota: number;
    terpakai: number;
    profil: ProfilTvAnggota[];
  } | null>(null);
  // Pengikut Official per platform (Ayrshare, cache server).
  const [official, setOfficial] = useState<Record<string, number | null> | null>(null);
  const [buka, setBuka] = useState<ProfilTvAnggota | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [memuatDetail, setMemuatDetail] = useState(false);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const d = await getTvAnggotaDashboard();
        if (hidup) setData(d);
      } catch {
        if (hidup) setData({ siap: false, kuota: 0, terpakai: 0, profil: [] });
      }
      // Official per platform — tiap panggilan tercache di server; gagal
      // satu platform tidak menggagalkan lainnya.
      const hasil: Record<string, number | null> = {};
      await Promise.all(
        PLATFORM6.map(async (p) => {
          try {
            const r = await getInsightSosmed(false, p);
            hasil[p] = r.insight?.pengikut ?? null;
          } catch {
            hasil[p] = null;
          }
        }),
      );
      if (hidup) setOfficial(hasil);
    })();
    return () => {
      hidup = false;
    };
  }, []);

  async function bukaDetail(p: ProfilTvAnggota, paksa = false) {
    setBuka(p);
    setMemuatDetail(true);
    try {
      const d = await getTvAnggotaProfil(p.profil, paksa);
      setDetail(d.insight);
    } catch (e) {
      toast("error", "Gagal memuat insight", e instanceof Error ? e.message : "");
      setDetail(null);
    } finally {
      setMemuatDetail(false);
    }
  }

  if (data === null) return <GlassSkeleton className="h-48 rounded-2xl" />;
  if (!data.siap) {
    return (
      <GlassCard className="p-4">
        <p className="text-[12.5px] text-teks-sekunder">
          upload-post belum diatur (UPLOAD_POST_API_KEY). Fitur akun anggota menyala
          setelah kuncinya terpasang di server.
        </p>
      </GlassCard>
    );
  }

  // Total pengikut anggota per platform (dari cache tiap profil).
  const totalAnggota: Record<string, number> = {};
  for (const p of data.profil) {
    for (const [platform, n] of Object.entries(p.pengikut)) {
      const app = platform === "x" ? "twitter" : platform;
      if (n != null) totalAnggota[app] = (totalAnggota[app] ?? 0) + n;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Kuota */}
      <GlassCard className="flex items-center gap-3 p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-pri/10 text-pri">
          <Users className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-bold text-teks-utama">
            {data.terpakai} / {data.kuota} profil terpakai
          </p>
          <p className="text-[11px] text-teks-sekunder">
            Satu anggota = satu profil upload-post (6 akun sosmed).
            {data.kuota - data.terpakai <= 10 && data.kuota > 0
              ? ` ⚠ Sisa ${data.kuota - data.terpakai} — mendekati batas paket.`
              : ""}
          </p>
        </div>
      </GlassCard>

      {/* Gabungan Official + anggota */}
      <GlassCard className="p-4">
        <p className="text-[12.5px] font-bold text-teks-utama">
          Gabungan Pengikut: Official + Akun Anggota
        </p>
        <div className="scrollbar-tipis mt-2 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-[11.5px]">
            <thead>
              <tr className="text-teks-sekunder">
                <th className="py-1.5 pr-2 font-semibold">Platform</th>
                <th className="py-1.5 pr-2 font-semibold">Official</th>
                <th className="py-1.5 pr-2 font-semibold">Anggota</th>
                <th className="py-1.5 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {PLATFORM6.map((p) => {
                const off = official?.[p] ?? null;
                const agg = totalAnggota[p] ?? 0;
                return (
                  <tr key={p} className="border-t border-glass-border/60">
                    <td className="flex items-center gap-1.5 py-1.5 pr-2 font-semibold text-teks-utama">
                      <PlatformIcon platform={p} className="h-3.5 w-3.5" />
                      {LABEL[p]}
                    </td>
                    <td className="angka-tab py-1.5 pr-2 text-teks-utama">
                      {official === null ? "…" : off == null ? "–" : off.toLocaleString("id-ID")}
                    </td>
                    <td className="angka-tab py-1.5 pr-2 text-teks-utama">
                      {agg.toLocaleString("id-ID")}
                    </td>
                    <td className="angka-tab py-1.5 font-bold text-teks-utama">
                      {((off ?? 0) + agg).toLocaleString("id-ID")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-[10px] text-teks-sekunder">
          Angka anggota dari insight yang sudah pernah ditarik (buka profilnya untuk
          menyegarkan). Strip (–) = belum ada datanya, bukan nol.
        </p>
      </GlassCard>

      {/* Daftar profil anggota */}
      <GlassCard className="p-4">
        <p className="text-[12.5px] font-bold text-teks-utama">
          Akun TV Rakyat Anggota ({data.profil.length})
        </p>
        {data.profil.length === 0 ? (
          <p className="mt-2 text-[12px] text-teks-sekunder">
            Belum ada anggota yang menghubungkan akunnya.
          </p>
        ) : (
          <div className="scrollbar-tipis mt-2 flex max-h-96 flex-col gap-1.5 overflow-y-auto">
            {data.profil.map((p) => (
              <button
                key={p.profil}
                type="button"
                onClick={() => void bukaDetail(p)}
                className="btn-tekan flex items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
              >
                {p.avatar_url ? (
                  <FotoBulat src={p.avatar_url} ukuran={32} />
                ) : (
                  <AvatarInisial nama={p.nama} ukuran={32} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-teks-utama">
                    {p.nama}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1">
                    {PLATFORM6.map((pf) => (
                      <PlatformIcon
                        key={pf}
                        platform={pf}
                        className={cn(
                          "h-3 w-3",
                          p.akun[pf] ? "text-emerald-500" : "text-teks-sekunder/30",
                        )}
                      />
                    ))}
                  </span>
                </span>
                <span
                  className={cn(
                    "angka-tab shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold",
                    p.tertaut >= 6
                      ? "bg-sukses/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-gagal/10 text-gagal",
                  )}
                >
                  {p.tertaut}/6
                </span>
              </button>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Modal detail per profil */}
      <AnimatePresence>
        {buka && (
          <motion.div
            className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setBuka(null)} />
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              className="glass relative max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-t-3xl p-4 sm:rounded-3xl"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-teks-utama">{buka.nama}</p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void bukaDetail(buka, true)}
                    disabled={memuatDetail}
                    aria-label="Segarkan"
                    className="glass btn-tekan rounded-lg p-1.5 text-teks-utama disabled:opacity-50"
                  >
                    <RefreshCw className={memuatDetail ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setBuka(null)}
                    aria-label="Tutup"
                    className="glass btn-tekan rounded-lg p-1.5 text-teks-utama"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="mt-0.5 text-[11px] text-teks-sekunder">
                profil: {buka.profil}
                {Object.entries(buka.akun).length > 0 &&
                  ` · ${Object.entries(buka.akun)
                    .map(([pf, un]) => `${LABEL[pf] ?? pf}: @${un}`)
                    .join(" · ")}`}
              </p>

              {memuatDetail ? (
                <GlassSkeleton className="mt-3 h-40 rounded-xl" />
              ) : !detail ? (
                <p className="mt-3 text-[12px] text-teks-sekunder">Belum ada data insight.</p>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  {Object.entries(detail)
                    .filter(([, v]) => metrikDari(v).length > 0)
                    .map(([platform, obj]) => (
                      <div key={platform} className="glass-soft rounded-xl p-3">
                        <p className="flex items-center gap-1.5 text-[12px] font-bold text-teks-utama">
                          <PlatformIcon
                            platform={platform === "x" ? "twitter" : platform}
                            className="h-4 w-4"
                          />
                          {LABEL[platform] ?? platform}
                        </p>
                        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                          {metrikDari(obj).map((m) => (
                            <div key={m.label} className="text-center">
                              <p className="angka-tab text-[14px] font-extrabold text-teks-utama">
                                {m.nilai.toLocaleString("id-ID")}
                              </p>
                              <p className="text-[9px] text-teks-sekunder">{m.label}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

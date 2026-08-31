"use client";

// ============================================================
// InsightSayaPanel — analitik akun sosmed PRIBADI anggota dari profil
// upload-post miliknya (rombakan TVR Saya, 31 Agu 2026). Seperti
// insight TV Rakyat Official, tapi untuk akun si anggota sendiri.
//
// Bentuk balasan tiap platform BERBEDA-BEDA (kolom metrik tidak
// seragam) — panel ini menampilkan angka apa adanya per platform,
// tanpa mengarang metrik yang tidak diberikan.
// ============================================================

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import { getInsightSaya } from "@/services";
import { PlatformIcon } from "@/components/platform-icon";

const LABEL: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  facebook: "Facebook",
  threads: "Threads",
  x: "X",
  twitter: "X",
};

/** Label Indonesia untuk kolom metrik yang umum; sisanya apa adanya. */
const LABEL_METRIK: Record<string, string> = {
  followers: "Pengikut",
  follower_count: "Pengikut",
  followers_count: "Pengikut",
  subscribers: "Subscriber",
  subscriber_count: "Subscriber",
  fans: "Pengikut",
  fan_count: "Pengikut",
  views: "Tayangan",
  view_count: "Tayangan",
  video_views: "Tayangan",
  impressions: "Impresi",
  reach: "Jangkauan",
  likes: "Suka",
  like_count: "Suka",
  media_count: "Jumlah Post",
  video_count: "Jumlah Video",
  posts: "Jumlah Post",
  comments: "Komentar",
  comment_count: "Komentar",
  engagement: "Interaksi",
  saves: "Disimpan",
  saved: "Disimpan",
  shares: "Dibagikan",
  share_count: "Dibagikan",
  profile_views: "Kunjungan Profil",
  watch_time: "Durasi Tonton",
  average_view_duration: "Rata2 Tonton",
};

/** Ambil pasangan metrik ANGKA dari objek platform (maks 6, jujur). */
function metrikDari(obj: unknown): { label: string; nilai: number }[] {
  if (!obj || typeof obj !== "object") return [];
  const o = obj as Record<string, unknown>;
  if (o.success === false) return [];
  const hasil: { label: string; nilai: number }[] = [];
  for (const [k, v] of Object.entries(o)) {
    const n = Number(v);
    if (v == null || !Number.isFinite(n)) continue;
    if (/id$/i.test(k)) continue; // id akun bukan metrik
    hasil.push({ label: LABEL_METRIK[k] ?? k.replace(/_/g, " "), nilai: n });
    if (hasil.length >= 6) break;
  }
  return hasil;
}

export function InsightSayaPanel() {
  const [data, setData] = useState<Record<string, unknown> | null | undefined>(undefined);
  const [memuatUlang, setMemuatUlang] = useState(false);
  const [pada, setPada] = useState<string | null>(null);

  async function muat(paksa: boolean) {
    try {
      const r = await getInsightSaya(paksa);
      setData(r.profil ? (r.insight ?? {}) : null);
      setPada(r.diperbarui_pada ?? null);
    } catch (e) {
      if (paksa) toast("error", "Gagal memuat insight", e instanceof Error ? e.message : "");
      setData((d) => d ?? null);
    }
  }

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const r = await getInsightSaya(false);
        if (!hidup) return;
        setData(r.profil ? (r.insight ?? {}) : null);
        setPada(r.diperbarui_pada ?? null);
      } catch {
        if (hidup) setData((d) => d ?? null);
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  if (data === undefined) return <GlassSkeleton className="h-36 rounded-2xl" />;

  if (data === null) {
    return (
      <GlassCard className="p-4">
        <p className="text-[13px] leading-relaxed text-teks-sekunder">
          Insight muncul setelah akun sosmed Anda tertaut (tombol Hubungkan di seksi
          Akun TV Rakyat Saya). Setelah login, angka pengikut & performa tiap
          platform terbaca di sini — seperti TV Rakyat Official.
        </p>
      </GlassCard>
    );
  }

  const platforms = Object.entries(data).filter(([, v]) => metrikDari(v).length > 0);

  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-teks-sekunder">
          {pada ? `Diperbarui ${new Date(pada).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })} WIB` : ""}
        </p>
        <button
          type="button"
          onClick={() => {
            setMemuatUlang(true);
            void muat(true).finally(() => setMemuatUlang(false));
          }}
          disabled={memuatUlang}
          aria-label="Segarkan insight"
          className="glass btn-tekan flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-teks-utama disabled:opacity-50"
        >
          <RefreshCw className={memuatUlang ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          Segarkan
        </button>
      </div>

      {platforms.length === 0 ? (
        <p className="mt-3 text-[12.5px] leading-relaxed text-teks-sekunder">
          Belum ada angka yang bisa dibaca — pastikan akun sudah tertaut, lalu tekan
          Segarkan. Beberapa platform butuh waktu sebelum analitiknya tersedia.
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-2.5">
          {platforms.map(([platform, obj]) => (
            <div key={platform} className="glass-soft rounded-xl p-3">
              <p className="flex items-center gap-1.5 text-[12px] font-bold text-teks-utama">
                <PlatformIcon platform={platform === "x" ? "twitter" : platform} className="h-4 w-4" />
                {LABEL[platform] ?? platform}
              </p>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                {metrikDari(obj).map((m) => (
                  <div key={m.label} className="text-center">
                    <p className="angka-tab text-[15px] font-extrabold text-teks-utama">
                      {m.nilai.toLocaleString("id-ID")}
                    </p>
                    <p className="text-[9.5px] text-teks-sekunder">{m.label}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

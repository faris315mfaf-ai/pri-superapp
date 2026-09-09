"use client";
// ============================================================
// Layar pendamping Beranda anggota (10 Sep 2026) — versi KACA MERAH dari
// dua layar Mode Simpel: daftar Pengumuman dan Leaderboard Kepatuhan
// Komen. Datanya SAMA PERSIS dengan Mode Simpel (satu API yang sama),
// hanya kulitnya yang mengikuti UI bawaan SuperApp (glass + aksen merah).
// ============================================================
import { useEffect, useState } from "react";
import { Crown, Megaphone, RefreshCw } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, EmptyState, FadeInUp, GlassSkeleton, ScreenHeader } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { PlatformIcon, labelPlatform } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import { waktuJelasWIB } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  getKepatuhanKomenLeaderboard,
  getPengumuman,
  type KepatuhanKomenLeaderboard,
  type Pengumuman,
} from "@/services";

function TombolSegar({ onClick, sibuk }: { onClick: () => void; sibuk: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={sibuk}
      aria-label="Muat ulang"
      className="glass btn-tekan flex h-10 w-10 items-center justify-center rounded-full text-teks-utama disabled:opacity-60"
    >
      <RefreshCw className={cn("h-4 w-4", sibuk && "animate-spin")} aria-hidden="true" />
    </button>
  );
}

// ------------------------------------------------------------
// PENGUMUMAN — seluruh pengumuman yang ditujukan ke saya
// ------------------------------------------------------------
export function PengumumanDaftarScreen({ onKembali }: { onKembali: () => void }) {
  const [daftar, setDaftar] = useState<Pengumuman[] | null>(null);
  const [versi, setVersi] = useState(0);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    let hidup = true;
    getPengumuman()
      .then((r) => hidup && setDaftar(r.data))
      .catch((e) => {
        if (!hidup) return;
        setDaftar([]);
        toast("error", "Pengumuman gagal dimuat", e instanceof Error ? e.message : "");
      })
      .finally(() => hidup && setSibuk(false));
    return () => {
      hidup = false;
    };
  }, [versi]);

  return (
    <div className="kolom-aplikasi px-4 pb-32">
      <ScreenHeader
        judul="Pengumuman"
        onKembali={onKembali}
        kanan={
          <TombolSegar
            sibuk={sibuk}
            onClick={() => {
              setSibuk(true);
              setVersi((v) => v + 1);
            }}
          />
        }
      />
      {daftar === null ? (
        <div className="flex flex-col gap-2.5">
          <GlassSkeleton className="h-24 rounded-2xl" />
          <GlassSkeleton className="h-24 rounded-2xl" />
        </div>
      ) : daftar.length === 0 ? (
        <GlassCard className="p-1">
          <EmptyState
            ikon={Megaphone}
            judul="Belum Ada Pengumuman"
            keterangan="Pengumuman dari pengurus untuk Anda akan tampil di sini."
            className="py-6"
          />
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-2.5">
          {daftar.map((p, i) => (
            <FadeInUp key={p.id} delay={Math.min(i, 6) * 0.03}>
              <GlassCard className="p-3.5">
                <div className="flex items-start gap-3">
                  <span
                    className="ubin-ikon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
                    aria-hidden="true"
                  >
                    <Megaphone className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-heading text-[14px] font-bold leading-snug text-teks-utama">{p.judul}</p>
                    <p className="mt-0.5 text-[11px] text-teks-sekunder">
                      {p.pengirim_nama} · {waktuJelasWIB(p.dibuat_pada)}
                    </p>
                  </div>
                </div>
                <p className="mt-2.5 whitespace-pre-wrap text-[13px] leading-relaxed text-teks-utama">
                  {p.isi}
                </p>
              </GlassCard>
            </FadeInUp>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// LEADERBOARD kepatuhan komen — filter per sosmed
// ------------------------------------------------------------
const PLATFORM_LB = ["", "instagram", "tiktok", "twitter", "threads", "youtube"] as const;

export function LeaderboardKomenScreen({ onKembali, namaSaya }: { onKembali: () => void; namaSaya: string }) {
  const [data, setData] = useState<KepatuhanKomenLeaderboard | null>(null);
  const [platform, setPlatform] = useState<string>("");
  const [versi, setVersi] = useState(0);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    let hidup = true;
    getKepatuhanKomenLeaderboard(platform)
      .then((r) => hidup && setData(r))
      .catch((e) => {
        if (!hidup) return;
        setData({ periode: "", daftar: [] } as unknown as KepatuhanKomenLeaderboard);
        toast("error", "Leaderboard gagal dimuat", e instanceof Error ? e.message : "");
      })
      .finally(() => hidup && setSibuk(false));
    return () => {
      hidup = false;
    };
  }, [platform, versi]);

  const daftar = data?.daftar ?? [];

  return (
    <div className="kolom-aplikasi px-4 pb-32">
      <ScreenHeader
        judul="Leaderboard Komen"
        onKembali={onKembali}
        kanan={
          <TombolSegar
            sibuk={sibuk}
            onClick={() => {
              setSibuk(true);
              setVersi((v) => v + 1);
            }}
          />
        }
      />
      <div className="tanpa-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {PLATFORM_LB.map((p) => (
          <button
            key={p || "semua"}
            type="button"
            onClick={() => {
              setData(null);
              setPlatform(p);
            }}
            aria-pressed={platform === p}
            className={cn(
              "btn-tekan flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold",
              platform === p ? "text-white" : "glass text-teks-sekunder",
            )}
            style={platform === p ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" } : undefined}
          >
            {p ? <PlatformIcon platform={p} size={12} /> : null}
            {p ? labelPlatform(p) : "Semua"}
          </button>
        ))}
      </div>
      {data?.periode ? (
        <p className="mt-2 text-[11px] text-teks-sekunder">Periode {data.periode}</p>
      ) : null}
      {data === null ? (
        <div className="mt-3 flex flex-col gap-2">
          <GlassSkeleton className="h-14 rounded-2xl" />
          <GlassSkeleton className="h-14 rounded-2xl" />
          <GlassSkeleton className="h-14 rounded-2xl" />
        </div>
      ) : daftar.length === 0 ? (
        <GlassCard className="mt-3 p-1">
          <EmptyState
            ikon={Crown}
            judul="Belum Ada Data"
            keterangan="Belum ada data kepatuhan komen di periode ini."
            className="py-6"
          />
        </GlassCard>
      ) : (
        <ol className="mt-3 flex flex-col gap-2">
          {daftar.map((o, i) => {
            const saya = o.nama === namaSaya;
            const warnaJuara = i === 0 ? "#F59E0B" : i === 1 ? "#9CA3AF" : "#B45309";
            return (
              <li key={`${o.nama}-${i}`}>
                <GlassCard
                  className={cn("flex items-center gap-3 p-3", saya && "ring-2 ring-emas/60")}
                >
                  <span
                    className={cn(
                      "angka-tab flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold",
                      i < 3 ? "text-white" : "bg-pri/10 text-pri",
                    )}
                    style={i < 3 ? { background: warnaJuara, boxShadow: `0 6px 14px ${warnaJuara}55` } : undefined}
                  >
                    {i < 3 ? <Crown className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
                  </span>
                  {o.avatar_url ? (
                    <FotoBulat src={o.avatar_url} ukuran={34} alt={o.nama} />
                  ) : (
                    <AvatarInisial nama={o.nama} ukuran={34} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-teks-utama">
                      {o.nama}
                      {saya ? " (Anda)" : ""}
                    </span>
                    <span className="block text-[11px] text-teks-sekunder">
                      {o.sudah}/{o.total} postingan dikomentari
                    </span>
                  </span>
                  <span
                    className="angka-tab shrink-0 rounded-lg px-2 py-1 text-[12px] font-extrabold text-white"
                    style={{
                      background:
                        o.persen >= 100 ? "#10B981" : o.persen >= 50 ? "#F59E0B" : "#DC2626",
                    }}
                  >
                    {o.persen}%
                  </span>
                </GlassCard>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

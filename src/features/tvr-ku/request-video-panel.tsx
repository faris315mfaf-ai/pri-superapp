"use client";

// ============================================================
// RequestVideoPanel — REQUEST VIDEO dari TV Rakyat Official untuk anggota
// (5 Sep 2026). Anggota melihat bahan video yang diminta pimred, menekan
// "Kerjakan" → unggahan / laporan link berikutnya OTOMATIS tercatat untuk
// request itu (server: lib/tvr-request). Satu request aktif per orang.
// ============================================================

import { useEffect, useState } from "react";
import { CheckCircle2, Clapperboard, ExternalLink, Play, Users, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import { useVersiSegar } from "@/hooks/use-segar-otomatis";
import { getRequestVideo, requestVideoAksi, type DataRequestVideo } from "@/services";
import { waktuJelasWIB } from "@/lib/format";
import { cn } from "@/lib/utils";

export function RequestVideoPanel({ onBerubah }: { onBerubah?: () => void }) {
  const versiSegar = useVersiSegar();
  const [data, setData] = useState<DataRequestVideo | null>(null);
  const [sibuk, setSibuk] = useState("");
  const [buka, setBuka] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    getRequestVideo()
      .then((d) => hidup && setData(d))
      .catch((e) => hidup && toast("error", "Request video gagal dimuat", e instanceof Error ? e.message : ""));
    return () => {
      hidup = false;
    };
  }, [versiSegar]);

  async function aksi(nama: string, id: string, pesanSukses: string) {
    if (sibuk) return;
    setSibuk(`${nama}:${id}`);
    try {
      const r = await requestVideoAksi(nama, { id });
      setData(r);
      toast("sukses", r.pesan ?? pesanSukses);
      onBerubah?.();
    } catch (e) {
      toast("peringatan", "Tidak bisa", e instanceof Error ? e.message : "");
    } finally {
      setSibuk("");
    }
  }

  if (!data) return <GlassSkeleton className="h-24 rounded-2xl" />;
  const aktif = data.request.filter((r) => r.aktif);
  return (
    <div className="flex flex-col gap-2.5">
      {data.aktif_saya ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-amber-400/50 bg-amber-400/12 px-3 py-2.5">
          <Clapperboard className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-[12px] leading-snug text-teks-utama">
            Sedang mengerjakan: <span className="font-bold">{data.aktif_saya.judul}</span>. Unggahan atau laporan link berikutnya otomatis tercatat untuk request ini.
          </p>
          <button type="button" onClick={() => void aksi("batal_kerja", data.aktif_saya!.id, "Pekerjaan dibatalkan")} disabled={Boolean(sibuk)} aria-label="Batalkan pekerjaan" className="glass btn-tekan flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gagal disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {aktif.length === 0 ? (
        <GlassCard className="p-4">
          <p className="text-[12px] text-teks-sekunder">Belum ada request video dari TV Rakyat. Saat pimred mengirim bahan, request muncul di sini dan Anda mendapat notifikasi.</p>
        </GlassCard>
      ) : (
        aktif.map((r) => {
          const terbuka = buka === r.id;
          return (
            <GlassCard key={r.id} className={cn("p-3.5", r.status_saya === "dikerjakan" && "ring-2 ring-amber-400/60")}>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }} aria-hidden="true">
                  <Clapperboard className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold leading-snug text-teks-utama">{r.judul}</p>
                  <p className="text-[10.5px] text-teks-sekunder">
                    {r.pembuat} · {waktuJelasWIB(r.dibuat_pada)} · <Users className="inline h-3 w-3" aria-hidden="true" /> {r.jumlah_dikerjakan} mengerjakan · {r.jumlah_selesai} selesai
                  </p>
                </div>
                {r.status_saya === "selesai" ? <StatusBadge label="selesai" warna="hijau" /> : r.status_saya === "dikerjakan" ? <StatusBadge label="dikerjakan" warna="kuning" berkedip /> : null}
              </div>
              {r.keterangan ? (
                <p className={cn("mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-teks-sekunder", !terbuka && "line-clamp-3")}>{r.keterangan}</p>
              ) : null}
              {r.keterangan.length > 160 ? (
                <button type="button" onClick={() => setBuka(terbuka ? null : r.id)} className="mt-1 text-[11px] font-bold text-pri">
                  {terbuka ? "Sembunyikan" : "Baca selengkapnya"}
                </button>
              ) : null}
              <div className="mt-3 flex gap-2">
                {r.video_url ? (
                  <a href={r.video_url} target="_blank" rel="noopener noreferrer" className="btn-tekan glass flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-[12px] font-bold text-teks-utama">
                    <Play className="h-4 w-4 text-pri" aria-hidden="true" /> Lihat bahan
                    <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
                  </a>
                ) : null}
                {r.status_saya === "selesai" ? (
                  <span className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500/12 text-[12px] font-bold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Sudah Anda kerjakan
                  </span>
                ) : r.status_saya === "dikerjakan" ? (
                  <span className="flex h-10 flex-1 items-center justify-center rounded-xl bg-amber-400/15 text-[12px] font-bold text-amber-700 dark:text-amber-300">Menunggu unggahan Anda…</span>
                ) : (
                  <button type="button" onClick={() => void aksi("kerjakan", r.id, "Request diambil")} disabled={Boolean(sibuk)} className="btn-tekan flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-[12px] font-bold text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}>
                    {sibuk === `kerjakan:${r.id}` ? "…" : "Kerjakan request"}
                  </button>
                )}
              </div>
            </GlassCard>
          );
        })
      )}
    </div>
  );
}

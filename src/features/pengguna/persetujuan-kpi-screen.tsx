"use client";

// ============================================================
// PersetujuanKpiScreen (2 Sep 2026) — meja Divisi HR untuk PERMOHONAN
// SOSMED TERBLOKIR: setuju = target KPI -5/platform, tolak = alasan.
// Dibuka dari HR Center → "Sosmed Terblokir".
//
// Tab "Laporan Link" DIHAPUS (23 Sep 2026): laporan manual kini langsung
// masuk KPI dan sisa antrean lamanya diluluskan otomatis
// (lib/laporan-tertahan). Yang masih butuh keputusan HR hanya blokir —
// karena ia MENGURANGI target, buktinya harus dilihat orang.
// ============================================================

import { useEffect, useState } from "react";
import { Ban, Check, Loader2, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, EmptyState, GlassSkeleton, ScreenHeader, ThemeToggle } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { PlatformIcon, labelPlatform } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import { getPersetujuanKpi, putusPersetujuanKpi, type PersetujuanKpi } from "@/services";
import { jamWIB } from "@/lib/format";
import { cn } from "@/lib/utils";


function Avatar({ src, nama }: { src: string; nama: string }) {
  return src ? <FotoBulat src={src} ukuran={32} /> : <AvatarInisial nama={nama} ukuran={32} />;
}

export function PersetujuanKpiScreen({ onKembali }: { onKembali: () => void }) {
  const [data, setData] = useState<PersetujuanKpi | null>(null);
  const [sibuk, setSibuk] = useState("");
  // id yang sedang diminta alasan penolakannya
  const [tolakUntuk, setTolakUntuk] = useState<string | null>(null);
  const [alasan, setAlasan] = useState("");

  function muat() {
    getPersetujuanKpi(true)
      .then(setData)
      .catch((e) => toast("error", "Gagal memuat", e instanceof Error ? e.message : ""));
  }
  useEffect(() => {
    muat();
  }, []);

  async function putus(id: string, aksi: "setuju" | "tolak") {
    if (sibuk) return;
    if (aksi === "tolak" && !alasan.trim()) {
      toast("peringatan", "Tulis alasan penolakan dulu");
      return;
    }
    setSibuk(id);
    try {
      await putusPersetujuanKpi({ jenis: "banned", id, aksi, catatan: aksi === "tolak" ? alasan.trim() : undefined });
      toast("sukses", aksi === "setuju" ? "Disetujui" : "Ditolak");
      setTolakUntuk(null);
      setAlasan("");
      muat();
    } catch (e) {
      toast("error", "Gagal", e instanceof Error ? e.message : "");
    } finally {
      setSibuk("");
    }
  }

  function tombolPutus(id: string) {
    const meminta = tolakUntuk === id;
    return (
      <div className="mt-2">
        {meminta ? (
          <textarea
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
            rows={2}
            maxLength={300}
            autoFocus
            placeholder="Alasan penolakan (dibaca anggotanya)…"
            className="glass-input mb-2 w-full rounded-xl px-3 py-2 text-[12px] text-teks-utama"
          />
        ) : null}
        <div className="flex gap-2">
          {!meminta ? (
            <button
              type="button"
              onClick={() => void putus(id, "setuju")}
              disabled={Boolean(sibuk)}
              className="btn-tekan flex flex-1 items-center justify-center gap-1 rounded-xl py-2 text-[12px] font-bold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
            >
              {sibuk === id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Setujui
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              if (meminta) void putus(id, "tolak");
              else {
                setTolakUntuk(id);
                setAlasan("");
              }
            }}
            disabled={Boolean(sibuk)}
            className={cn(
              "btn-tekan flex flex-1 items-center justify-center gap-1 rounded-xl py-2 text-[12px] font-bold disabled:opacity-50",
              meminta ? "bg-gagal text-white" : "bg-gagal/12 text-gagal",
            )}
          >
            <X className="h-3.5 w-3.5" />
            {meminta ? "Kirim Penolakan" : "Tolak"}
          </button>
          {meminta ? (
            <button
              type="button"
              onClick={() => setTolakUntuk(null)}
              className="glass btn-tekan rounded-xl px-3 text-[12px] font-bold text-teks-utama"
            >
              Batal
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="kolom-aplikasi px-4 pb-32">
      <ScreenHeader judul="Sosmed Terblokir" onKembali={onKembali} kanan={<ThemeToggle />} />

      <p className="mt-2 px-1 text-[10.5px] leading-relaxed text-teks-sekunder">
        Anggota yang akun sosmednya terblokir mengajukan keringanan di sini. Bila disetujui, target
        KPI-nya berkurang 5 video untuk platform itu. Periksa bukti screenshot-nya dulu.
        {data ? ` · ${data.banned.length} menunggu` : ""}
      </p>

      {!data ? (
        <GlassSkeleton className="mt-3 h-40 rounded-2xl" />
      ) : data.banned.length === 0 ? (
        <GlassCard className="mt-3">
          <EmptyState ikon={Ban} judul="Tidak ada permohonan" keterangan="Semua permohonan blokir sudah diputus." />
        </GlassCard>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {data.banned.map((b) => (
            <GlassCard key={b.id} className="p-3">
              <div className="flex items-center gap-2.5">
                <Avatar src={b.avatar_url} nama={b.nama} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-bold text-teks-utama">{b.nama}</p>
                  <p className="text-[10px] text-teks-sekunder">
                    {labelPlatform(b.platform)} · diajukan {jamWIB(b.dibuat_pada)}
                  </p>
                </div>
                <PlatformIcon platform={b.platform} size={16} />
              </div>
              {b.keterangan ? (
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-teks-utama">"{b.keterangan}"</p>
              ) : null}
              <a href={b.bukti_url} target="_blank" rel="noopener noreferrer" className="btn-tekan mt-2 block">
                <img
                  src={b.bukti_url}
                  alt={`Bukti blokir ${b.platform} ${b.nama}`}
                  className="max-h-56 w-full rounded-xl object-contain"
                />
              </a>
              {tombolPutus(b.id)}
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}

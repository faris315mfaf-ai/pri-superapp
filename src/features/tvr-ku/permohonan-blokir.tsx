"use client";

// ============================================================
// PermohonanBlokir (2 Sep 2026) — anggota mengajukan bahwa salah satu
// akun sosmed TV Rakyat-nya TERBLOKIR, supaya target KPI (5 video x 6
// sosmed = 30) berkurang 5 untuk platform itu. Bukti screenshot WAJIB.
// Target baru berubah SETELAH Divisi HR menyetujui — sebelum itu status
// "menunggu" dan KPI tetap penuh.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { Ban, ImagePlus, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { PlatformIcon, labelPlatform } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import { cabutBanned, getBannedKu, laporBanned, type BannedKu } from "@/services";
import { jamWIB } from "@/lib/format";
import { cn } from "@/lib/utils";

const PLATFORM = ["instagram", "tiktok", "youtube", "facebook", "threads", "twitter"] as const;
const MAKS_BUKTI = 2 * 1024 * 1024;

function bacaSebagaiDataUrl(berkas: File): Promise<string> {
  return new Promise((selesai, gagal) => {
    const r = new FileReader();
    r.onload = () => selesai(String(r.result ?? ""));
    r.onerror = () => gagal(new Error("Gagal membaca gambar."));
    r.readAsDataURL(berkas);
  });
}

export function PermohonanBlokir() {
  const [daftar, setDaftar] = useState<BannedKu[] | null>(null);
  const [platform, setPlatform] = useState<string>("");
  const [alasan, setAlasan] = useState("");
  const [bukti, setBukti] = useState<{ nama: string; dataUrl: string } | null>(null);
  const [kirim, setKirim] = useState(false);
  const [sibuk, setSibuk] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function muat() {
    getBannedKu()
      .then(setDaftar)
      .catch(() => setDaftar([]));
  }
  useEffect(() => {
    muat();
  }, []);

  async function pilihBukti(berkas: File | undefined) {
    if (!berkas) return;
    if (!/^image\/(jpeg|png)$/.test(berkas.type)) {
      toast("peringatan", "Bukti harus JPG/PNG");
      return;
    }
    if (berkas.size > MAKS_BUKTI) {
      toast("peringatan", "Ukuran bukti maksimal 2 MB");
      return;
    }
    try {
      setBukti({ nama: berkas.name, dataUrl: await bacaSebagaiDataUrl(berkas) });
    } catch (e) {
      toast("error", "Gagal", e instanceof Error ? e.message : "");
    }
  }

  async function ajukan() {
    if (!platform || !bukti || kirim) return;
    setKirim(true);
    try {
      await laporBanned({ platform, buktiDataUrl: bukti.dataUrl, keterangan: alasan.trim() || undefined });
      toast(
        "sukses",
        "Permohonan terkirim",
        "Menunggu persetujuan Divisi HR. Target KPI berubah setelah disetujui.",
      );
      setPlatform("");
      setAlasan("");
      setBukti(null);
      if (inputRef.current) inputRef.current.value = "";
      muat();
    } catch (e) {
      toast("error", "Gagal mengajukan", e instanceof Error ? e.message : "");
    } finally {
      setKirim(false);
    }
  }

  async function cabut(b: BannedKu) {
    if (sibuk) return;
    setSibuk(b.id);
    try {
      await cabutBanned(b.id);
      toast("sukses", b.status === "menunggu" ? "Permohonan ditarik" : "Akun pulih — target KPI kembali penuh");
      muat();
    } catch (e) {
      toast("error", "Gagal", e instanceof Error ? e.message : "");
    } finally {
      setSibuk("");
    }
  }

  const aktif = new Set((daftar ?? []).filter((d) => d.status !== "ditolak").map((d) => d.platform));

  return (
    <div className="flex flex-col gap-3">
      <GlassCard className="p-4">
        <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-teks-utama">
          <Ban className="h-4 w-4 text-pri" /> Ajukan Sosmed Terblokir
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-teks-sekunder">
          Kalau salah satu akun TV Rakyat Anda diblokir platformnya, ajukan di sini.
          Setelah <b>disetujui Divisi HR</b>, target KPI Anda otomatis berkurang
          <b> 5 video</b> untuk sosmed itu.
        </p>

        <p className="mt-3 text-[11px] font-semibold text-teks-sekunder">Sosmed yang terblokir:</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {PLATFORM.map((p) => {
            const sudah = aktif.has(p);
            return (
              <button
                key={p}
                type="button"
                disabled={sudah || kirim}
                onClick={() => setPlatform(p)}
                aria-pressed={platform === p}
                title={sudah ? "Sudah ada permohonan aktif" : undefined}
                className={cn(
                  "btn-tekan flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold disabled:opacity-40",
                  platform === p ? "text-white" : "glass text-teks-sekunder",
                )}
                style={platform === p ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" } : undefined}
              >
                <PlatformIcon platform={p} size={12} />
                {labelPlatform(p)}
              </button>
            );
          })}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={(e) => void pilihBukti(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={kirim}
          className="glass btn-tekan mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[12px] font-bold text-teks-utama"
        >
          <ImagePlus className="h-4 w-4 text-pri" />
          {bukti ? bukti.nama : "Unggah bukti screenshot (wajib)"}
        </button>
        {bukti ? (
          <img src={bukti.dataUrl} alt="Pratinjau bukti" className="mt-2 max-h-40 w-full rounded-xl object-contain" />
        ) : null}

        <textarea
          value={alasan}
          onChange={(e) => setAlasan(e.target.value)}
          rows={2}
          maxLength={300}
          placeholder="Keterangan singkat (opsional)…"
          disabled={kirim}
          className="glass-input mt-2 w-full rounded-xl px-3 py-2 text-[12.5px] text-teks-utama"
        />

        <button
          type="button"
          onClick={() => void ajukan()}
          disabled={!platform || !bukti || kirim}
          className="btn-tekan mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
        >
          {kirim ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {kirim ? "Mengirim…" : "Ajukan ke Divisi HR"}
        </button>
      </GlassCard>

      {daftar === null ? (
        <GlassSkeleton className="h-16 rounded-2xl" />
      ) : daftar.length > 0 ? (
        <GlassCard className="p-4">
          <p className="text-[12.5px] font-bold text-teks-utama">Permohonan Saya</p>
          <div className="mt-2 flex flex-col gap-2">
            {daftar.map((b) => (
              <div key={b.id} className="glass-soft flex items-center gap-2.5 rounded-xl p-2.5">
                <PlatformIcon platform={b.platform} size={14} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-teks-utama">{labelPlatform(b.platform)}</p>
                  <p className="text-[10px] text-teks-sekunder">
                    {jamWIB(b.dibuat_pada)}
                    {b.status === "ditolak" && b.catatan_putusan ? ` · alasan: ${b.catatan_putusan}` : ""}
                  </p>
                </div>
                {b.status === "menunggu" ? (
                  <StatusBadge label="menunggu HR" warna="kuning" />
                ) : b.status === "ditolak" ? (
                  <StatusBadge label="ditolak" warna="merah" />
                ) : (
                  <StatusBadge label="disetujui -5" warna="hijau" />
                )}
                {b.status !== "ditolak" ? (
                  <button
                    type="button"
                    onClick={() => void cabut(b)}
                    disabled={Boolean(sibuk)}
                    aria-label={b.status === "menunggu" ? "Tarik permohonan" : "Akun sudah pulih"}
                    title={b.status === "menunggu" ? "Tarik permohonan" : "Akun sudah pulih — cabut"}
                    className="btn-tekan p-1.5 text-teks-sekunder/70"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </GlassCard>
      ) : null}
    </div>
  );
}

"use client";

// ============================================================
// VideoSiapUnggah (7 Sep 2026) — jalur MANUAL untuk anggota PALUGODAM.
//
// Studio merender satu versi per anggota. Selama ini versi itu hanya dipakai
// Siaran Serentak (server yang mengunggahkannya). Panel ini memberi anggota
// versinya sendiri untuk DIUNDUH, lalu diunggah manual dari HP-nya — dipakai
// saat unggah otomatis gagal, akun sosmednya belum tertaut, atau anggota
// ingin memilih sendiri waktu tayangnya.
//
// Judul, highlight, dan caption ikut ditampilkan dengan tombol salin, karena
// itulah yang dibutuhkan saat menempel di aplikasi sosmed.
// ============================================================

import { useEffect, useState } from "react";
import {
  Copy,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  Video,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { EmptyState, GlassSkeleton } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import {
  getVideoSaya,
  unduhVideoStudio,
  type VideoSiapUnggah as Baris,
} from "@/services";
import { cn } from "@/lib/utils";

const MERAH = "linear-gradient(135deg, #DC2626, #B91C1C)";

function waktuWib(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t + 7 * 3600_000);
  const dua = (n: number) => String(n).padStart(2, "0");
  return `${dua(d.getUTCDate())}/${dua(d.getUTCMonth() + 1)} ${dua(d.getUTCHours())}:${dua(d.getUTCMinutes())} WIB`;
}

async function salin(teks: string, pesan: string) {
  try {
    await navigator.clipboard.writeText(teks);
    toast("sukses", pesan);
  } catch {
    toast("error", "Gagal menyalin", "Peramban menolak akses papan klip.");
  }
}

function KartuVideo({ baris }: { baris: Baris }) {
  const [mengunduh, setMengunduh] = useState(false);

  async function unduh() {
    setMengunduh(true);
    try {
      await unduhVideoStudio(baris.id);
      toast("sukses", "Video tersimpan", "Cek folder Unduhan di perangkat Anda.");
    } catch (e) {
      toast(
        "error",
        "Gagal mengunduh",
        e instanceof Error ? e.message : "Coba lagi sebentar lagi.",
      );
    } finally {
      setMengunduh(false);
    }
  }

  const teksLengkap = [baris.judul, baris.caption].filter(Boolean).join("\n\n");

  return (
    <GlassCard className="p-3.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-teks-utama">
            {baris.judul || "Tanpa judul"}
          </p>
          <p className="mt-0.5 text-[10.5px] text-teks-sekunder">
            {baris.profil}
            {baris.siap_pada ? ` · siap ${waktuWib(baris.siap_pada)}` : ""}
          </p>
        </div>
        {baris.highlight ? (
          <span className="shrink-0 rounded-full bg-pri/12 px-2 py-0.5 text-[10px] font-bold text-pri">
            {baris.highlight}
          </span>
        ) : null}
      </div>

      {baris.caption ? (
        <p className="mt-2 whitespace-pre-wrap break-words text-[11.5px] leading-relaxed text-teks-sekunder">
          {baris.caption}
        </p>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => void unduh()}
          disabled={mengunduh}
          className="btn-tekan col-span-2 flex h-11 items-center justify-center gap-2 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
          style={{ background: MERAH }}
        >
          {mengunduh ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4" aria-hidden="true" />
          )}
          {mengunduh ? "Menyiapkan berkas…" : "Unduh video"}
        </button>

        <button
          type="button"
          disabled={!teksLengkap}
          onClick={() => void salin(teksLengkap, "Judul & caption disalin")}
          className="glass btn-tekan flex h-10 items-center justify-center gap-1.5 rounded-xl text-[11.5px] font-bold text-teks-utama disabled:opacity-40"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          Salin caption
        </button>

        <a
          href={baris.render_url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "glass btn-tekan flex h-10 items-center justify-center gap-1.5 rounded-xl text-[11.5px] font-bold text-teks-utama",
            !baris.render_url && "pointer-events-none opacity-40",
          )}
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          Tonton
        </a>
      </div>
    </GlassCard>
  );
}

export function VideoSiapUnggah() {
  const [baris, setBaris] = useState<Baris[] | null>(null);
  const [menyegarkan, setMenyegarkan] = useState(false);
  // Dinaikkan tombol Segarkan; setState hanya terjadi di dalam callback
  // promise, tidak langsung di badan effect (aturan React 19).
  const [versi, setVersi] = useState(0);

  useEffect(() => {
    let hidup = true;
    getVideoSaya()
      .then((d) => {
        if (!hidup) return;
        setBaris(d);
        setMenyegarkan(false);
      })
      .catch((e: unknown) => {
        if (!hidup) return;
        setBaris([]);
        setMenyegarkan(false);
        toast(
          "error",
          "Gagal memuat video",
          e instanceof Error ? e.message : "",
        );
      });
    return () => {
      hidup = false;
    };
  }, [versi]);

  function segarkan() {
    setMenyegarkan(true);
    setVersi((v) => v + 1);
  }

  if (baris === null) {
    return (
      <div className="flex flex-col gap-2">
        <GlassSkeleton className="h-28 rounded-2xl" />
        <GlassSkeleton className="h-28 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-[11px] text-teks-sekunder">
          {baris.length > 0 ? `${baris.length} video siap. ` : ""}Versi yang
          dibuat Studio untuk akun Anda — unduh, lalu unggah sendiri ke sosmed
          Anda.
        </p>
        <button
          type="button"
          onClick={segarkan}
          disabled={menyegarkan}
          className="glass btn-tekan flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[11.5px] font-bold text-teks-utama disabled:opacity-50"
        >
          {menyegarkan ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Segarkan
        </button>
      </div>

      {baris.length === 0 ? (
        <GlassCard className="p-1">
          <EmptyState
            ikon={Video}
            judul="Belum ada video untuk Anda"
            keterangan="Begitu Admin PALUGODAM merender video untuk akun Anda, versinya muncul di sini dan bisa langsung diunduh."
          />
        </GlassCard>
      ) : (
        baris.map((b) => <KartuVideo key={b.id} baris={b} />)
      )}
    </div>
  );
}

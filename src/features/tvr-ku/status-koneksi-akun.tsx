"use client";

// ============================================================
// Status koneksi akun sosmed TVR Saya (5 Okt 2026).
//
// Memberi tahu berapa dari 6 akun yang terhubung SEHAT, mana yang perlu
// disambung ulang (izinnya kedaluwarsa di upload-post), dan mana yang belum
// ditautkan — lengkap dengan tombol untuk masing-masing. Edit Otomatis
// terbuka sendiri bila minimal 5 akun sehat (lib/peran).
//
// KartuEditTerkunci menggantikan Edit Otomatis selama syarat itu belum
// terpenuhi, supaya anggota tahu persis apa yang kurang.
// ============================================================

import { AlertTriangle, CheckCircle2, Link2, Loader2, Lock, RefreshCw, RotateCcw } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton } from "@/components/pri-ui";
import { PlatformIcon, labelPlatform } from "@/components/platform-icon";
import type { KoneksiSosmedTvr, StatusAkunTvr } from "@/services";
import { cn } from "@/lib/utils";

const JUMLAH_PLATFORM = 6;

function BilahKemajuan({ jumlah, minimal }: { jumlah: number; minimal: number }) {
  const cukup = jumlah >= minimal;
  return (
    <div className="relative mt-2 h-2.5 rounded-full bg-black/10 dark:bg-white/10" aria-hidden="true">
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", cukup ? "bg-sukses" : "bg-amber-500")}
        style={{ width: `${Math.min(100, (100 * jumlah) / JUMLAH_PLATFORM)}%` }}
      />
      {/* Penanda batas minimal */}
      <span
        className="absolute -top-1 h-4.5 w-0.5 rounded-full bg-teks-utama/60"
        style={{ left: `${(100 * minimal) / JUMLAH_PLATFORM}%` }}
      />
    </div>
  );
}

export function StatusKoneksiAkun({
  koneksi,
  galat,
  sedangHubung,
  onHubungkan,
  onSegarkan,
}: {
  koneksi: KoneksiSosmedTvr | null;
  galat: string;
  sedangHubung: boolean;
  onHubungkan: (platform: string) => void;
  onSegarkan: () => void;
}) {
  if (!koneksi) {
    if (!galat) return <GlassSkeleton className="mb-3 h-40 rounded-2xl" />;
    return (
      <GlassCard className="mb-3 p-3.5" dataTur="tvr-status-akun">
        <p className="text-[12.5px] font-bold text-teks-utama">Status akun belum terbaca</p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-teks-sekunder">{galat}</p>
        <button
          type="button"
          onClick={onSegarkan}
          disabled={sedangHubung}
          className="glass btn-tekan mt-2 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-bold text-teks-utama disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Coba lagi
        </button>
      </GlassCard>
    );
  }

  const { jumlah_terhubung: jumlah, minimal, status } = koneksi;
  const cukup = jumlah >= minimal;
  const perluUlang = status.filter((s) => s.keadaan === "ulang").length;
  const idUlangPertama = status.find((s) => s.keadaan === "ulang")?.platform;

  return (
    <GlassCard className="mb-3 p-3.5">
      {/* Ringkasan (angka + bilah + pesan) — yang disorot tutorial. */}
      <div data-tur="tvr-status-akun">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-teks-utama">Status akun sosmed</p>
            <p className="mt-0.5 text-[11px] leading-snug text-teks-sekunder">
              Minimal {minimal} akun terhubung untuk membuka Edit Otomatis.
            </p>
          </div>
          <p className="angka-tab shrink-0 font-heading text-2xl font-extrabold text-teks-utama">
            {jumlah}
            <span className="text-[14px] font-bold text-teks-sekunder">/{JUMLAH_PLATFORM}</span>
          </p>
        </div>
        <BilahKemajuan jumlah={jumlah} minimal={minimal} />
        <p
          className={cn(
            "mt-2 flex items-center gap-1.5 text-[11.5px] font-bold",
            cukup ? "text-sukses" : "text-amber-600 dark:text-amber-400",
          )}
        >
          {cukup ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Lock className="h-4 w-4 shrink-0" />}
          {cukup
            ? "Edit Otomatis terbuka untuk akun Anda."
            : `Kurang ${minimal - jumlah} akun lagi untuk membuka Edit Otomatis.`}
        </p>
      </div>

      {perluUlang > 0 && (
        <p className="mt-2 flex gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-teks-utama">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span>
            <b>{perluUlang} akun perlu disambung ulang.</b> Izinnya kedaluwarsa, jadi unggahan ke akun itu gagal
            dan tidak dihitung terhubung sampai Anda login lagi.
          </span>
        </p>
      )}

      <ul className="mt-2.5 flex flex-col gap-1.5">
        {status.map((s) => (
          <BarisStatus
            key={s.platform}
            s={s}
            sedangHubung={sedangHubung}
            onHubungkan={onHubungkan}
            tandaTur={s.platform === idUlangPertama ? "tvr-baris-ulang" : undefined}
          />
        ))}
      </ul>

      <p className="mt-2.5 flex items-center gap-1.5 text-[10.5px] leading-relaxed text-teks-sekunder">
        <RefreshCw className="h-3 w-3 shrink-0" />
        Sudah login di tab baru? Kembali ke sini lalu tekan Segarkan supaya angkanya diperbarui.
      </p>
    </GlassCard>
  );
}

function BarisStatus({
  s,
  sedangHubung,
  onHubungkan,
  tandaTur,
}: {
  s: StatusAkunTvr;
  sedangHubung: boolean;
  onHubungkan: (platform: string) => void;
  tandaTur?: string;
}) {
  const label = s.platform === "facebook" ? "Facebook Page" : labelPlatform(s.platform);
  return (
    <li
      data-tur={tandaTur}
      className={cn(
        "flex items-center gap-2.5 rounded-xl p-2",
        s.keadaan === "ulang" ? "border border-amber-500/40 bg-amber-500/10" : "glass-soft",
      )}
    >
      <PlatformIcon platform={s.platform} size={16} denganWadah />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-bold text-teks-utama">{label}</p>
        <p className="truncate text-[10.5px] text-teks-sekunder">
          {s.username ? `@${s.username}` : "Belum terhubung"}
        </p>
      </div>
      {s.keadaan === "terhubung" ? (
        <span className="shrink-0 rounded-full bg-sukses/15 px-2 py-0.5 text-[10px] font-bold text-sukses">Terhubung</span>
      ) : (
        <button
          type="button"
          onClick={() => onHubungkan(s.platform)}
          disabled={sedangHubung}
          className={cn(
            "btn-tekan flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10.5px] font-bold disabled:opacity-50",
            s.keadaan === "ulang" ? "bg-amber-500 text-white" : "glass text-teks-utama",
          )}
        >
          {sedangHubung ? <Loader2 className="h-3 w-3 animate-spin" /> : s.keadaan === "ulang" ? <RotateCcw className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
          {s.keadaan === "ulang" ? "Sambung Ulang" : "Hubungkan"}
        </button>
      )}
    </li>
  );
}

/** Pengganti Edit Otomatis selama akun terhubung belum mencapai minimal. */
export function KartuEditTerkunci({
  koneksi,
  onLihatStatus,
}: {
  koneksi: KoneksiSosmedTvr | null;
  onLihatStatus: () => void;
}) {
  if (!koneksi) {
    return (
      <GlassCard className="flex items-center gap-2 p-4" dataTur="tvr-edit-otomatis">
        <Loader2 className="h-4 w-4 animate-spin text-teks-sekunder" />
        <p className="text-[12px] text-teks-sekunder">Memeriksa akun sosmed yang terhubung…</p>
      </GlassCard>
    );
  }
  const { jumlah_terhubung: jumlah, minimal } = koneksi;
  return (
    <GlassCard className="p-4" dataTur="tvr-edit-otomatis">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500" aria-hidden="true">
          <Lock className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-[14px] font-bold text-teks-utama">Edit Otomatis terkunci</p>
          <p className="mt-0.5 text-[11px] leading-snug text-teks-sekunder">
            Terbuka sendiri setelah minimal {minimal} akun sosmed terhubung. Sekarang {jumlah} dari {JUMLAH_PLATFORM}.
          </p>
        </div>
      </div>
      <BilahKemajuan jumlah={jumlah} minimal={minimal} />
      <button
        type="button"
        onClick={onLihatStatus}
        className="glass btn-tekan mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-bold text-teks-utama"
      >
        <Link2 className="h-3.5 w-3.5" /> Lihat & sambung akun
      </button>
      <p className="mt-2 text-[10.5px] leading-relaxed text-teks-sekunder">
        Sambil menunggu, Anda tetap bisa memposting lewat Stok Video di bawah.
      </p>
    </GlassCard>
  );
}

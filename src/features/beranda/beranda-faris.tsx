"use client";

// ============================================================
// BERANDA DESAIN BARU (7 Okt 2026, dari mockup lokal; menggantikan
// eksperimen Beranda Faris). Untuk akun desainBaru (lib/desain-apple) yang
// bukan master — master memakai DashboardScreen dengan BarisAtasBeranda +
// RuangKarya di atas dashboard pengurusnya.
//
// Susunan: sapaan → [Kehadiran 1/3 | Dompet Token Merah Putih 2/3] →
// Ruang karya (Stok Video) + aksi cepat + Fokus hari ini | Informasi
// terkini + Video baru TV Rakyat. Tanpa kartu komentar wajib, konsistensi,
// dan peringkat (permintaan pemilik produk).
// ============================================================

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, CalendarCheck, Camera, Check, ChevronRight, ClipboardList, FolderOpen,
  Minimize2, Play, Sparkles, UploadCloud, WandSparkles,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, ThemeToggle } from "@/components/pri-ui";
import { TombolLonceng } from "@/components/tombol-lonceng";
import { KartuPengumumanTerbaru } from "@/features/konten/beranda-anggota";
import { KartuVideoBaru } from "@/features/beranda/kartu-video-baru";
import { DompetTmp } from "@/features/koin/dompet-tmp";
import { KartuUltah } from "@/components/ultah";
import { useAppStore } from "@/hooks/use-app-store";
import { useLebarWadah } from "@/hooks/use-kolom-wadah";
import { useSegarOtomatis } from "@/hooks/use-segar-otomatis";
import { bolehFitur } from "@/lib/fitur";
import { bebasKewajiban } from "@/lib/jabatan";
import { jamWIB, namaSapaan, sapaanHari } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getAbsensi, getLaporanVideo } from "@/services";
import type { KomponenIkon, User } from "@/types";

export type TujuanTvr = "akun" | "stok-video" | "edit-otomatis" | "unggah-sosmed" | "laporan" | "kompres-video";

type Props = {
  user: User;
  onBukaNotifikasi: () => void;
  onBukaAbsensi: () => void;
  onBukaLaporanKerja: () => void;
  onBukaProfil: () => void;
  onBukaPengumuman: () => void;
  onBukaKonten?: () => void;
  onBukaTvrKu?: (seksi: TujuanTvr) => void;
};

const tanggalPanjang = () =>
  new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date());

/** Data absensi & laporan video hari ini (dipakai beranda & baris atas). */
function useRingkasanHariIni(user: User, mauAbsen: boolean, mauVideo: boolean) {
  const [tik, setTik] = useState(0);
  const [hasil, setHasil] = useState<{
    absen: Awaited<ReturnType<typeof getAbsensi>> | null;
    video: Awaited<ReturnType<typeof getLaporanVideo>> | null;
  } | null>(null);
  useSegarOtomatis(() => setTik((n) => n + 1), 300);
  useEffect(() => {
    let hidup = true;
    void Promise.allSettled([
      mauAbsen ? getAbsensi(false) : Promise.resolve(null),
      mauVideo ? getLaporanVideo() : Promise.resolve(null),
    ]).then(([absen, video]) => {
      if (!hidup) return;
      setHasil({
        absen: absen.status === "fulfilled" ? absen.value : null,
        video: video.status === "fulfilled" ? video.value : null,
      });
    });
    return () => { hidup = false; };
  }, [user.id, mauAbsen, mauVideo, tik]);
  const hariIni = hasil?.absen?.data.filter((a) => String(a.user_id) === String(user.id) && a.tanggal_wib === hasil.absen?.tanggal_hari_ini);
  return {
    dimuat: hasil !== null,
    masuk: hariIni?.find((a) => a.jenis === "masuk"),
    pulang: hariIni?.find((a) => a.jenis === "pulang"),
    video: hasil?.video ?? null,
  };
}

/* ---------------- Kehadiran (1/3) ---------------- */
function KartuKehadiran({ ringkas, onBukaAbsensi }: { ringkas: ReturnType<typeof useRingkasanHariIni>; onBukaAbsensi: () => void }) {
  const { masuk, pulang, dimuat } = ringkas;
  const status = !dimuat ? "Memuat" : masuk ? (pulang ? "Lengkap" : "Hadir") : "Belum";
  return (
    <GlassCard className="flex h-full flex-col rounded-[24px] p-[18px]">
      <div className="flex items-center gap-2.5">
        <h2 className="flex-1 font-heading text-[17px] font-bold tracking-tight text-teks-utama">Kehadiran</h2>
        <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-bold", masuk ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/15 text-amber-700 dark:text-amber-400")}>{status}</span>
      </div>
      <p className="mt-1 text-xs text-teks-sekunder">{tanggalPanjang()}</p>
      <ol className="my-4 space-y-3">
        {[
          ["Masuk", masuk ? `${jamWIB(masuk.waktu)} WIB` : "Belum tercatat", !!masuk],
          ["Pulang", pulang ? `${jamWIB(pulang.waktu)} WIB` : "Belum tercatat", !!pulang],
        ].map(([judul, ket, ok], i) => (
          <li key={String(judul)} className="relative flex gap-3">
            {i === 0 && <span aria-hidden="true" className="absolute top-5 bottom-[-14px] left-[5px] w-0.5 bg-teks-utama/15" />}
            <span aria-hidden="true" className={cn("relative mt-1 h-3 w-3 shrink-0 rounded-full border-2", ok ? "border-emerald-500 bg-emerald-500" : "border-teks-utama/25 bg-transparent")} />
            <span><b className="block text-sm text-teks-utama">{judul}</b><span className="text-xs text-teks-sekunder">{ket}</span></span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={onBukaAbsensi}
        className="btn-tekan mt-auto flex h-[42px] w-full items-center justify-center gap-2 rounded-[13px] text-sm font-semibold text-white"
        style={{ background: "linear-gradient(180deg, #34C759, #248A3D)" }}
      >
        {pulang ? <Check className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
        {pulang ? "Absensi lengkap" : masuk ? "Absen pulang" : "Absen masuk"}
      </button>
    </GlassCard>
  );
}

/** Baris paling atas: Kehadiran (1/3) | Dompet TMP (2/3). Di HP dompet di atas. */
export function BarisAtasBeranda({ user, onBukaAbsensi }: { user: User; onBukaAbsensi: () => void }) {
  const izin = useAppStore((s) => s.izinFitur);
  const mauAbsen = !bebasKewajiban(user) && bolehFitur(izin, "beranda.absensi", user.role);
  const ringkas = useRingkasanHariIni(user, mauAbsen, false);
  const wadah = useRef<HTMLDivElement>(null);
  const lebar = useLebarWadah(wadah) ?? 0;
  const dua = mauAbsen && lebar >= 860;
  return (
    <div ref={wadah} className="grid items-stretch gap-3" style={{ gridTemplateColumns: dua ? "minmax(0,1fr) minmax(0,2fr)" : "minmax(0,1fr)" }}>
      {mauAbsen && <div className={cn("min-w-0", !dua && "order-2")}><KartuKehadiran ringkas={ringkas} onBukaAbsensi={onBukaAbsensi} /></div>}
      <div className="min-w-0"><DompetTmp /></div>
    </div>
  );
}

/* ---------------- Ruang karya + aksi cepat ---------------- */
export function RuangKarya({ onBukaTvrKu }: { onBukaTvrKu: (seksi: TujuanTvr) => void }) {
  const aksi: [KomponenIkon, string, string, string, TujuanTvr][] = [
    [WandSparkles, "Edit Otomatis", "Template + render", "#0A84FF", "edit-otomatis"],
    [UploadCloud, "Unggah", "Ke sosmed Anda", "#FF2D55", "unggah-sosmed"],
    [Minimize2, "Kompres", "Hemat kuota", "#34C759", "kompres-video"],
    [ClipboardList, "Laporan", "Link & KPI", "#AF52DE", "laporan"],
  ];
  return (
    <>
      <section className="hero-karya relative isolate flex items-center gap-5 overflow-hidden rounded-[24px] px-[22px] py-6 text-white">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[10.5px] font-bold tracking-[0.12em] text-white/75 uppercase"><FolderOpen className="h-3.5 w-3.5" />TV Rakyat Saya</p>
          <h2 className="mt-2 font-heading text-[clamp(26px,3.4vw,34px)] leading-[1.08] font-bold tracking-[-0.03em]">Karya Anda,<br />siap dibagikan.</h2>
          <p className="mt-2.5 max-w-[420px] text-[13.5px] text-white/85">Mulai dari Stok Video: pilih hasil terbaik, lalu unggah ke akun sosial Anda. Video di stok tersimpan 48 jam.</p>
          <div className="mt-[18px] flex flex-wrap gap-2">
            <button type="button" onClick={() => onBukaTvrKu("stok-video")} className="btn-tekan flex h-[42px] items-center gap-2 rounded-[13px] bg-white px-4 text-sm font-semibold text-[#9f1239]">Buka Stok Video<ArrowRight className="h-4 w-4" /></button>
            <button type="button" onClick={() => onBukaTvrKu("edit-otomatis")} className="btn-tekan flex h-[42px] items-center gap-2 rounded-[13px] border border-white/30 bg-white/15 px-4 text-sm font-semibold"><Sparkles className="h-4 w-4" />Edit Otomatis</button>
          </div>
        </div>
        <div aria-hidden="true" className="hero-tumpuk relative hidden h-[170px] w-[210px] shrink-0 sm:block">
          {[["#2C3E66", "#0F172A"], ["#7A2E3A", "#2B0F16"], ["#2F5D50", "#0E2A22"]].map(([a, b], i) => (
            <span key={a} className="absolute flex aspect-[4/5] w-[104px] items-center justify-center rounded-2xl border border-white/25 text-white/90 shadow-[0_14px_30px_rgba(0,0,0,0.35)]" style={{ background: `linear-gradient(160deg,${a},${b})`, left: i * 52, top: i * 6 + 4, transform: `rotate(${(i - 1) * 7}deg)` }}>
              <Play className="h-6 w-6" />
            </span>
          ))}
        </div>
      </section>
      <div className="grid grid-cols-4 gap-2">
        {aksi.map(([Ikon, judul, ket, warna, ke]) => (
          <button key={judul} type="button" onClick={() => onBukaTvrKu(ke)} className="btn-tekan glass flex min-w-0 flex-col items-center gap-1.5 rounded-[22px] px-2 py-3.5 text-center transition-transform hover:-translate-y-0.5">
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] text-white" style={{ background: warna }}><Ikon className="h-[17px] w-[17px]" /></span>
            <b className="text-[13px] text-teks-utama">{judul}</b>
            <span className="hidden text-[11px] text-teks-sekunder min-[560px]:block">{ket}</span>
          </button>
        ))}
      </div>
    </>
  );
}

/* ---------------- Beranda ---------------- */
export function BerandaFaris(props: Props) {
  const { user, onBukaTvrKu } = props;
  const izin = useAppStore((s) => s.izinFitur);
  const bebas = bebasKewajiban(user);
  const mauVideo = !bebas && bolehFitur(izin, "beranda.kpi_video", user.role);
  const mauAbsen = !bebas && bolehFitur(izin, "beranda.absensi", user.role);
  const mauPengumuman = bolehFitur(izin, "beranda.pengumuman", user.role);
  const ringkas = useRingkasanHariIni(user, mauAbsen, mauVideo);
  const wadah = useRef<HTMLDivElement>(null);
  const lebar = useLebarWadah(wadah) ?? 0;

  const video = ringkas.video;
  const persen = video && video.kpi_target > 0
    ? Math.min(100, Math.max(0, video.kpi_persen ?? Math.round((video.data.length / video.kpi_target) * 100))) : 0;
  const langkah = [
    mauAbsen && { judul: "Absen pulang", ket: ringkas.masuk ? `Masuk ${jamWIB(ringkas.masuk.waktu)} · pulang ${ringkas.pulang ? "tercatat" : "belum tercatat"}` : "Belum absen masuk hari ini", selesai: !!ringkas.pulang, aksi: props.onBukaAbsensi, Ikon: CalendarCheck, warna: "#34C759" },
    mauVideo && onBukaTvrKu && { judul: "Lengkapi laporan video", ket: video ? `${video.data.length} tercatat dari target ${video.kpi_target}` : "Pastikan link video Anda tercatat", selesai: !!video && (!!video.dibebaskan || (video.kpi_target > 0 && persen >= 100)), aksi: () => onBukaTvrKu("laporan"), Ikon: ClipboardList, warna: "#0A84FF" },
    { judul: "Rencana & hasil kerja", ket: "Isi laporan kerja hari ini", selesai: false, aksi: props.onBukaLaporanKerja, Ikon: ClipboardList, warna: "#AF52DE" },
  ].filter(Boolean) as { judul: string; ket: string; selesai: boolean; aksi: () => void; Ikon: KomponenIkon; warna: string }[];
  const sisa = langkah.filter((l) => !l.selesai).length;

  return (
    <div ref={wadah} className="kolom-aplikasi kolom-lebar flex flex-col gap-3 px-4 pt-5 pb-32">
      <header className="flex items-center gap-3 px-1">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[11px] font-bold tracking-[0.14em] text-teks-sekunder uppercase">Beranda · Ruang pribadi</p>
          <h1 className="font-heading text-[clamp(28px,4.2vw,40px)] leading-[1.06] font-bold tracking-[-0.028em] text-teks-utama">
            {sapaanHari()}, {namaSapaan(user)}<span className="text-pri">.</span>
          </h1>
          <p className="mt-1.5 text-[13.5px] text-teks-sekunder">
            {tanggalPanjang()}
            {ringkas.masuk && <> · <b className="text-emerald-600 dark:text-emerald-400">Hadir</b> sejak {jamWIB(ringkas.masuk.waktu)}</>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <TombolLonceng onBuka={props.onBukaNotifikasi} />
          <ThemeToggle />
          <button type="button" onClick={props.onBukaProfil} className="btn-tekan hidden rounded-full sm:block" aria-label="Buka profil saya"><AvatarInisial nama={user.nama} ukuran={40} /></button>
        </div>
      </header>

      <BarisAtasBeranda user={user} onBukaAbsensi={props.onBukaAbsensi} />

      <div className="grid items-start gap-3" style={{ gridTemplateColumns: lebar >= 900 ? "minmax(0,1.55fr) minmax(0,1fr)" : "minmax(0,1fr)" }}>
        <div className="flex min-w-0 flex-col gap-3">
          {onBukaTvrKu && <RuangKarya onBukaTvrKu={onBukaTvrKu} />}

          <GlassCard className="rounded-[24px] p-[18px]">
            <div className="flex items-center gap-2.5">
              <h2 className="flex-1 font-heading text-[17px] font-bold tracking-tight text-teks-utama">Fokus hari ini</h2>
              <span className="rounded-full bg-teks-utama/[0.07] px-3 py-1 text-xs font-semibold text-teks-utama">{sisa ? `${sisa} tersisa` : "Semua beres"}</span>
            </div>
            {mauVideo && (
              <div className="mt-3 rounded-[14px] bg-teks-utama/[0.06] p-3.5">
                <div className="flex justify-between text-sm"><b className="text-teks-utama">Target video harian</b><b className="angka-tab text-pri">{video ? video.dibebaskan ? "Dibebaskan" : `${video.data.length} / ${video.kpi_target}` : "—"}</b></div>
                <div role="progressbar" aria-label="Target video" aria-valuemin={0} aria-valuemax={100} aria-valuenow={persen} className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-teks-utama/10">
                  <div className="h-full rounded-full bg-pri transition-[width] duration-700" style={{ width: `${video?.dibebaskan ? 0 : persen}%` }} />
                </div>
                <p className="mt-2 text-xs text-teks-sekunder">{video ? video.dibebaskan ? "Tidak ada kewajiban video hari ini." : persen >= 100 ? "Target hari ini tercapai. Terima kasih atas karya Anda!" : "Minimal 5 video di tiap sosmed aktif · reset 19.00 WIB" : "Memuat…"}</p>
              </div>
            )}
            <div className="mt-1.5">
              {langkah.map(({ judul, ket, selesai, aksi, Ikon, warna }, i) => (
                <button key={judul} type="button" onClick={aksi} className={cn("btn-tekan flex w-full items-center gap-3 py-3 text-left", i > 0 && "border-t border-teks-utama/10")}>
                  <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors", selesai ? "border-emerald-500 bg-emerald-500 text-white" : "border-teks-utama/20 text-transparent")}><Check className="h-3.5 w-3.5" /></span>
                  <span className="min-w-0 flex-1">
                    <b className={cn("block text-[14.5px] font-semibold", selesai ? "text-teks-sekunder line-through" : "text-teks-utama")}>{judul}</b>
                    <span className="block text-xs text-teks-sekunder">{ket}</span>
                  </span>
                  <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] text-white" style={{ background: warna }}><Ikon className="h-4 w-4" /></span>
                </button>
              ))}
            </div>
          </GlassCard>
        </div>

        <aside className="flex min-w-0 flex-col gap-3">
          {mauPengumuman && (
            <GlassCard className="rounded-[24px] p-[18px] [&>div]:mt-1">
              <div className="flex items-center">
                <h2 className="flex-1 font-heading text-[17px] font-bold tracking-tight text-teks-utama">Informasi terkini</h2>
                <button type="button" onClick={props.onBukaPengumuman} className="btn-tekan flex items-center gap-0.5 text-[12.5px] font-semibold text-pri">Semua<ChevronRight className="h-3.5 w-3.5" /></button>
              </div>
              <KartuPengumumanTerbaru />
            </GlassCard>
          )}
          <KartuVideoBaru />
          <KartuUltah idKu={user.id} />
        </aside>
      </div>
    </div>
  );
}

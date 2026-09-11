"use client";
// ============================================================
// BerandaSimpelGlass (10 Sep 2026) — beranda untuk SEMUA yang tidak
// memegang jabatan. Susunannya meniru Mode Simpel (ringkas, satu layar,
// tombol besar yang jelas), tetapi kulitnya WAJIB sama dengan UI bawaan
// SuperApp: kaca (glassmorphism) beraksen merah — bukan biru polos.
//
//   kepala   : sapaan, tanggal, jam, avatar, lonceng, tema
//   pintasan : Pengumuman · Leaderboard Komen
//   4 ubin   : KPI Video · KPI Komen · Absen · Kaitkan Akun
//   modul    : Komen Video · Laporan Video · Upload Video ·
//              Postingan Terbaru · Chat Admin (WhatsApp) · Pengaturan
//   penutup  : pengumuman terbaru
//
// Kartu yang dimatikan lewat matriks izin (beranda.*) tidak dirender DAN
// datanya tidak ditarik — aturan lama BerandaScreen dipertahankan.
// ============================================================
import { useEffect, useState } from "react";
import {
  CalendarCheck,
  ChevronRight,
  Crown,
  Link2,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  Newspaper,
  Settings,
  UploadCloud,
  Video,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, FadeInUp, ThemeToggle } from "@/components/pri-ui";
import { ProgressRing } from "@/components/progress-ring";
import { TombolLonceng } from "@/components/tombol-lonceng";
import { IkonStreak } from "@/components/ikon-streak";
import { FotoBulat } from "@/components/foto-bulat";
import { IkonSinyal } from "@/components/ikon-sinyal";
import { JamDigital } from "@/components/jam-digital";
import { KartuUltah } from "@/components/ultah";
import { CincinJuara } from "@/features/peringkat/cincin-mythic";
import { KartuPengumumanTerbaru } from "@/features/konten/beranda-anggota";
import { ModalAkunSosmed } from "@/features/profil/pengaturan-akun";
import { useAppStore } from "@/hooks/use-app-store";
import { useSegarOtomatis } from "@/hooks/use-segar-otomatis";
import { bolehFitur } from "@/lib/fitur";
import { jamWIB, namaSapaan, sapaanHari, tanggalIndonesia } from "@/lib/format";
import { bebasKewajiban } from "@/lib/jabatan";
import { getAbsensi, getKomentarSaya, getLaporanVideo, getStreakSaya } from "@/services";
import type { KomponenIkon, User } from "@/types";
import { RunningTextJuara } from "./running-text-juara";

import { LencanaOnline } from "@/components/lencana-online";
/** Nomor WhatsApp admin (permintaan user 10 Sep 2026) — menggantikan Chat NAKA. */
export const WA_ADMIN = "6287718123039";

function tanggalWibPerangkat(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}


// ------------------------------------------------------------
// Ubin ringkas 2x2 — angka besar, ring persen, ikon beraksen merah
// ------------------------------------------------------------
function Ubin({
  label,
  nilai,
  keterangan,
  persen,
  Ikon,
  onKlik,
  aria,
}: {
  label: string;
  nilai: string;
  keterangan: string;
  persen?: number | null;
  Ikon: KomponenIkon;
  onKlik?: () => void;
  aria: string;
}) {
  return (
    <button
      type="button"
      onClick={onKlik}
      disabled={!onKlik}
      aria-label={aria}
      className="btn-tekan text-left disabled:cursor-default"
    >
      <GlassCard className="ubin-beranda flex min-h-[118px] flex-col justify-between rounded-2xl p-3.5">
        <div className="flex items-start justify-between gap-2">
          <span
            className="ubin-ikon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
            aria-hidden="true"
          >
            <Ikon className="h-4.5 w-4.5" />
          </span>
          {persen != null && (
            <ProgressRing value={persen} size={38} strokeWidth={4}>
              <span className="angka-tab text-[9px] font-extrabold text-teks-utama">{persen}%</span>
            </ProgressRing>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-teks-sekunder">{label}</p>
          <p className="angka-tab mt-0.5 truncate font-heading text-[19px] font-extrabold leading-tight text-teks-utama">
            {nilai}
          </p>
          <p className="mt-0.5 truncate text-[10.5px] text-teks-sekunder">{keterangan}</p>
        </div>
      </GlassCard>
    </button>
  );
}

// ------------------------------------------------------------
// Baris modul — satu tujuan per baris, ikon kiri, panah kanan
// ------------------------------------------------------------
function BarisModul({
  label,
  keterangan,
  Ikon,
  onKlik,
  href,
  hijau,
}: {
  label: string;
  keterangan: string;
  Ikon: KomponenIkon;
  onKlik?: () => void;
  href?: string;
  hijau?: boolean;
}) {
  const isi = (
    <GlassCard className="ubin-beranda flex items-center gap-3 rounded-2xl p-3.5">
      <span
        className={`${hijau ? "ubin-ikon-hijau" : "ubin-ikon"} flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white`}
        aria-hidden="true"
      >
        <Ikon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-[14px] font-bold text-teks-utama">{label}</span>
        <span className="mt-0.5 block truncate text-[11px] text-teks-sekunder">{keterangan}</span>
      </span>
      <ChevronRight className="h-4.5 w-4.5 shrink-0 text-teks-sekunder" aria-hidden="true" />
    </GlassCard>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="btn-tekan block" aria-label={label}>
        {isi}
      </a>
    );
  }
  return (
    <button type="button" onClick={onKlik} className="btn-tekan w-full text-left" aria-label={label}>
      {isi}
    </button>
  );
}

function Pintasan({ label, Ikon, onKlik, emas }: { label: string; Ikon: KomponenIkon; onKlik?: () => void; emas?: boolean }) {
  return (
    <button
      type="button"
      onClick={onKlik}
      className="glass btn-tekan flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-[12.5px] font-bold text-teks-utama"
      aria-label={label}
    >
      <Ikon className={`h-4 w-4 ${emas ? "text-emas" : "text-pri"}`} aria-hidden="true" />
      {label}
    </button>
  );
}

export function BerandaSimpelGlass({
  user,
  onBukaNotifikasi,
  onBukaAbsensi,
  onBukaTvrKu,
  onBukaKonten,
  onBukaProfil,
  onBukaPengumuman,
  onBukaLeaderboard,
}: {
  user: User;
  onBukaNotifikasi?: () => void;
  onBukaAbsensi?: () => void;
  /** Buka TVR Saya; `seksi` menggulirkan ke seksi tertentu (laporan / unggah-sosmed). */
  onBukaTvrKu?: (seksi?: "laporan" | "unggah-sosmed") => void;
  onBukaKonten?: () => void;
  onBukaProfil?: () => void;
  onBukaPengumuman?: () => void;
  onBukaLeaderboard?: () => void;
}) {
  const izin = useAppStore((s) => s.izinFitur);
  const sakelarFitur = useAppStore((s) => s.sakelar.fitur);
  const boleh = (k: Parameters<typeof bolehFitur>[1]) => bolehFitur(izin, k, user.role);

  const bebas = bebasKewajiban(user);
  const mauVideo = boleh("beranda.kpi_video") && !bebas;
  const mauKomentar = boleh("beranda.kpi_komentar") && !bebas;
  const mauAbsen = boleh("beranda.absensi") && !bebas;

  const [video, setVideo] = useState<{ jumlah: number; target: number; persen: number | null; dibebaskan: string | null } | null>(null);
  const [komentar, setKomentar] = useState<{ total: number; sudah: number } | null>(null);
  const [absen, setAbsen] = useState<{ masuk: string | null; pulang: string | null } | null>(null);
  const [streak, setStreak] = useState(0);
  const [modalAkun, setModalAkun] = useState(false);

  // Penyegaran diam-diam tiap 30 dtk + saat aplikasi dibuka kembali.
  const [tik, setTik] = useState(0);
  useSegarOtomatis(() => setTik((t) => t + 1));

  useEffect(() => {
    let hidup = true;
    void (async () => {
      const tugas = await Promise.allSettled([
        mauVideo ? getLaporanVideo() : Promise.resolve(null),
        mauKomentar ? getKomentarSaya() : Promise.resolve(null),
        mauAbsen ? getAbsensi(false) : Promise.resolve(null),
        getStreakSaya(),
      ]);
      if (!hidup) return;
      const [vid, kom, abs, streakku] = tugas;
      if (vid.status === "fulfilled" && vid.value) {
        setVideo({
          jumlah: vid.value.data.length,
          target: vid.value.kpi_target,
          persen: vid.value.kpi_persen ?? null,
          dibebaskan: vid.value.dibebaskan ?? null,
        });
      }
      if (kom.status === "fulfilled" && kom.value) setKomentar(kom.value);
      if (abs.status === "fulfilled" && abs.value) {
        const hariIni = abs.value.tanggal_hari_ini;
        const milikku = abs.value.data.filter((a) => a.user_id === user.id && a.tanggal_wib === hariIni);
        setAbsen({
          masuk: milikku.find((a) => a.jenis === "masuk")?.waktu ?? null,
          pulang: milikku.find((a) => a.jenis === "pulang")?.waktu ?? null,
        });
      }
      if (streakku.status === "fulfilled" && streakku.value) setStreak(streakku.value.hari);
    })();
    return () => {
      hidup = false;
    };
  }, [user.id, mauVideo, mauKomentar, mauAbsen, tik]);

  const persenVideo =
    video && video.target > 0
      ? (video.persen ?? Math.min(100, Math.round((100 * video.jumlah) / video.target)))
      : 0;
  const persenKomentar =
    komentar && komentar.total > 0 ? Math.round((100 * komentar.sudah) / komentar.total) : 0;

  const pesanWa = encodeURIComponent(`Halo Admin PRI SuperApp, saya ${user.nama}.`);

  return (
    <div className="kolom-aplikasi px-4 pt-5 pb-32">
      {/* Kepala — sama dengan beranda pemegang jabatan supaya seragam */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-teks-sekunder">{sapaanHari()},</p>
          <h1 className="truncate font-heading text-[22px] leading-tight font-extrabold tracking-tight text-teks-utama">
            {namaSapaan(user)}
          </h1>
          <p className="mt-1 text-[11px] text-teks-sekunder">
            {tanggalIndonesia(`${tanggalWibPerangkat()}T00:00:00+07:00`)}
          </p>
          <JamDigital className="mt-0.5 block font-heading text-lg font-extrabold tracking-tight text-teks-utama" />
          <LencanaOnline className="mt-1.5" />
        </div>
        <div className="flex max-w-[62%] shrink-0 flex-wrap items-center justify-end gap-2">
          <CincinJuara userId={user.id} ukuran={36}>
            {user.avatar_url ? (
              <FotoBulat src={user.avatar_url} ukuran={36} />
            ) : (
              <AvatarInisial nama={user.nama} ukuran={36} />
            )}
          </CincinJuara>
          {streak > 0 && (
            <span className="glass flex h-10 items-center rounded-xl px-2.5">
              <IkonStreak hari={streak} />
            </span>
          )}
          <TombolLonceng onBuka={onBukaNotifikasi} />
          <IkonSinyal />
          <ThemeToggle />
        </div>
      </header>

      <KartuUltah idKu={user.id} />
      {sakelarFitur.juara_efek !== false && <RunningTextJuara />}

      {/* Pintasan: Pengumuman · Leaderboard Komen (ikon toa & mahkota Mode Simpel) */}
      <FadeInUp>
        <div className="mt-4 flex gap-2">
          <Pintasan label="Pengumuman" Ikon={Megaphone} onKlik={onBukaPengumuman} />
          <Pintasan label="Leaderboard Komen" Ikon={Crown} onKlik={onBukaLeaderboard} emas />
        </div>
      </FadeInUp>

      {/* Empat ubin ringkas */}
      <FadeInUp delay={0.04}>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <Ubin
            label="KPI Video"
            nilai={bebas ? "Bebas" : video ? (video.dibebaskan ? "Dibebaskan" : `${video.jumlah}/${video.target}`) : "…"}
            keterangan={
              bebas
                ? "Bebas kewajiban"
                : video?.dibebaskan
                  ? `Status ${video.dibebaskan} disetujui`
                  : "video hari ini · ketuk untuk laporan"
            }
            persen={bebas || !mauVideo ? null : persenVideo}
            Ikon={Video}
            onKlik={mauVideo ? () => onBukaTvrKu?.("laporan") : undefined}
            aria="KPI video, buka laporan video"
          />
          <Ubin
            label="KPI Komen"
            nilai={bebas ? "Bebas" : komentar ? `${komentar.sudah}/${komentar.total}` : "…"}
            keterangan={
              bebas
                ? "Bebas kewajiban"
                : komentar && komentar.total === 0
                  ? "menunggu konten hari ini"
                  : "postingan dikomentari · ketuk untuk komen"
            }
            persen={bebas || !mauKomentar ? null : persenKomentar}
            Ikon={MessageCircle}
            onKlik={mauKomentar ? onBukaKonten : undefined}
            aria="KPI komen, buka komen video"
          />
          <Ubin
            label="Absen"
            nilai={
              !mauAbsen
                ? "—"
                : absen === null
                  ? "…"
                  : absen.masuk
                    ? absen.pulang
                      ? "Lengkap"
                      : "Hadir"
                    : "Belum"
            }
            keterangan={
              !mauAbsen
                ? "Tidak berlaku"
                : absen?.masuk
                  ? `Masuk ${jamWIB(absen.masuk)}${absen.pulang ? ` · Pulang ${jamWIB(absen.pulang)}` : " · belum pulang"}`
                  : "ketuk untuk absen masuk"
            }
            Ikon={CalendarCheck}
            onKlik={mauAbsen ? onBukaAbsensi : undefined}
            aria="Absen hari ini"
          />
          <Ubin
            label="Kaitkan Akun"
            nilai="Sosmed"
            keterangan="akun IG/TikTok/X/Threads/YT Anda"
            Ikon={Link2}
            onKlik={() => setModalAkun(true)}
            aria="Kaitkan akun sosmed"
          />
        </div>
      </FadeInUp>

      {/* Modul utama — satu baris satu tujuan */}
      <FadeInUp delay={0.08}>
        <div className="mt-3 flex flex-col gap-2.5">
          <BarisModul
            label="Komen Video"
            keterangan="Postingan wajib komen hari ini"
            Ikon={MessageSquareText}
            onKlik={onBukaKonten}
          />
          <BarisModul
            label="Laporan Video"
            keterangan="Link video yang sudah tercatat hari ini"
            Ikon={Video}
            onKlik={() => onBukaTvrKu?.("laporan")}
          />
          <BarisModul
            label="Upload Video"
            keterangan="Unggah ke sosmed TV Rakyat Anda"
            Ikon={UploadCloud}
            onKlik={() => onBukaTvrKu?.("unggah-sosmed")}
          />
          <BarisModul
            label="Postingan Terbaru"
            keterangan="Konten terbaru akun resmi partai"
            Ikon={Newspaper}
            onKlik={onBukaKonten}
          />
          <BarisModul
            label="Chat Admin"
            keterangan="Tanya admin lewat WhatsApp"
            Ikon={MessageCircle}
            href={`https://wa.me/${WA_ADMIN}?text=${pesanWa}`}
            hijau
          />
          <BarisModul
            label="Pengaturan"
            keterangan="Profil, sandi, dan preferensi"
            Ikon={Settings}
            onKlik={onBukaProfil}
          />
        </div>
      </FadeInUp>

      {boleh("beranda.pengumuman") && (
        <FadeInUp delay={0.12}>
          <div className="mt-4">
            <KartuPengumumanTerbaru />
          </div>
        </FadeInUp>
      )}

      <p className="mt-5 text-center text-[11px] text-teks-sekunder">{user.nama} · Beranda ringkas</p>

      {modalAkun && <ModalAkunSosmed onTutup={() => setModalAkun(false)} />}
    </div>
  );
}

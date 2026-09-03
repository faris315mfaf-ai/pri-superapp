"use client";
import { adalahKetum } from "@/lib/jabatan";

// ============================================================
// BerandaScreen — halaman pertama untuk Ketua & Anggota.
//
// Isinya dipilih super admin lewat matriks izin fitur (kunci
// "beranda.*"), sehingga tiap peran bisa punya beranda yang
// berbeda tanpa perlu rilis aplikasi baru:
//
// - beranda.pengumuman   : kartu pengumuman terbaru dari atasan
// - beranda.kpi_kerja    : rencana kerja hari ini
// - beranda.kpi_komentar : kewajiban komentar di konten resmi
// - beranda.kpi_video    : target 5 laporan video harian
// - beranda.absensi      : status kehadiran hari ini
//
// Kartu yang dimatikan tidak dirender sama sekali — bukan sekadar
// disamarkan, supaya tidak ada data yang tetap diambil diam-diam.
// ============================================================

import { useEffect, useState } from "react";
import {
  CalendarCheck,
  ClipboardList,
  MessageCircle,
  Video, Megaphone, Newspaper } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, FadeInUp, StatusBadge, ThemeToggle } from "@/components/pri-ui";
import { ProgressRing } from "@/components/progress-ring";
import { TombolLonceng } from "@/components/tombol-lonceng";
import { IkonStreak } from "@/components/ikon-streak";
import { FotoBulat } from "@/components/foto-bulat";
import { IkonSinyal } from "@/components/ikon-sinyal";
import { TombolPeringkat } from "@/features/peringkat/tombol-peringkat";
import { CincinJuara } from "@/features/peringkat/cincin-mythic";
import { useAppStore } from "@/hooks/use-app-store";
import { KartuPengumumanTerbaru } from "@/features/konten/beranda-anggota";
import { KontenScreen } from "@/features/konten/konten-screen";
import { SeksiLipat } from "@/components/seksi-lipat";
import { TataLetakModul } from "@/components/tata-letak-modul";
import { KartuUltah } from "@/components/ultah";
import { JamDigital } from "@/components/jam-digital";
import {
  getAbsensi,
  getLaporanKerja,
  getLaporanVideo,
  getKomentarSaya,
  type KerjaKpi,
  getStreakSaya,
} from "@/services";
import { bolehFitur } from "@/lib/fitur";
import { jamWIB, sapaanHari, tanggalIndonesia, waktuJelasWIB } from "@/lib/format";
import { useSegarOtomatis } from "@/hooks/use-segar-otomatis";
import type { KomponenIkon, User } from "@/types";

function tanggalWibPerangkat(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

type KartuAngkaProps = {
  label: string;
  nilai: string;
  keterangan: string;
  persen: number;
  Ikon: KomponenIkon;
  onKlik?: () => void;
};

function KartuAngka({ label, nilai, keterangan, persen, Ikon, onKlik }: KartuAngkaProps) {
  const isi = (
    <GlassCard className="flex h-full items-center gap-3 p-3.5">
      <ProgressRing value={persen} size={52} strokeWidth={5}>
        <Ikon className="h-4 w-4 text-pri" aria-hidden="true" />
      </ProgressRing>
      <div className="min-w-0">
        <p className="text-xs font-bold text-teks-utama">{label}</p>
        <p className="angka-tab mt-0.5 font-heading text-base font-extrabold text-teks-utama">
          {nilai}
        </p>
        <p className="text-[10px] leading-tight text-teks-sekunder">{keterangan}</p>
      </div>
    </GlassCard>
  );

  if (!onKlik) return isi;
  return (
    <button type="button" onClick={onKlik} className="btn-tekan text-left" aria-label={label}>
      {isi}
    </button>
  );
}

export function BerandaScreen({
  user,
  onBukaNotifikasi,
  onBukaLaporanKerja,
  onBukaAbsensi,
  onBukaTvrKu,
}: {
  user: User;
  onBukaNotifikasi?: () => void;
  onBukaLaporanKerja?: () => void;
  onBukaAbsensi?: () => void;
  onBukaTvrKu?: () => void;
}) {
  const izin = useAppStore((s) => s.izinFitur);
  const boleh = (k: Parameters<typeof bolehFitur>[1]) => bolehFitur(izin, k, user.role);

  const [kpiKerja, setKpiKerja] = useState<KerjaKpi | null>(null);
  const [video, setVideo] = useState<{ jumlah: number; target: number; persen: number | null } | null>(null);
  const [komentar, setKomentar] = useState<{ total: number; sudah: number; diperbarui?: string | null } | null>(null);
  const [absen, setAbsen] = useState<{ masuk: string | null; pulang: string | null } | null>(
    null,
  );
  // Task streak (spek 4.1) — api di pojok header
  const [streak, setStreak] = useState(0);

  // Hanya mengambil data untuk kartu yang MENYALA. Kartu yang
  // dimatikan tidak boleh diam-diam tetap memanggil server.
  // Ketua Umum (2 Sep 2026): bukan objek KPI/absensi — kartu-kartunya
  // tidak dirender dan datanya tidak ditarik.
  const ketum = adalahKetum(user);
  const mauKerja = boleh("beranda.kpi_kerja") && !ketum;
  const mauVideo = boleh("beranda.kpi_video") && !ketum;
  const mauKomentar = boleh("beranda.kpi_komentar") && !ketum;
  const mauAbsen = boleh("beranda.absensi") && !ketum;

  // Penyegaran otomatis (1 Sep 2026): angka KPI/absen/komentar beranda
  // ditarik ulang diam-diam tiap 30 dtk + saat aplikasi dibuka kembali.
  const [tik, setTik] = useState(0);
  useSegarOtomatis(() => setTik((t) => t + 1));

  useEffect(() => {
    let hidup = true;
    void (async () => {
      const tugas = await Promise.allSettled([
        mauKerja ? getLaporanKerja() : Promise.resolve(null),
        mauVideo ? getLaporanVideo() : Promise.resolve(null),
        mauAbsen ? getAbsensi(false) : Promise.resolve(null),
        // Dihitung SERVER per pengguna (perbaikan 0/0 — presisi &
        // bebas cap 1000 baris; lihat /api/rekap?saya=1).
        mauKomentar
          ? getKomentarSaya()
          : Promise.resolve(null),
        getStreakSaya(),
      ]);
      if (!hidup) return;

      const [kerja, vid, abs, rekap, streakku] = tugas;
      if (streakku.status === "fulfilled" && streakku.value) {
        setStreak(streakku.value.hari);
      }
      if (kerja.status === "fulfilled" && kerja.value) setKpiKerja(kerja.value.kpi);
      if (vid.status === "fulfilled" && vid.value) {
        setVideo({
          jumlah: vid.value.data.length,
          target: vid.value.kpi_target,
          persen: vid.value.kpi_persen ?? null,
        });
      }
      if (abs.status === "fulfilled" && abs.value) {
        const hariIni = abs.value.tanggal_hari_ini;
        const milikku = abs.value.data.filter(
          (a) => a.user_id === user.id && a.tanggal_wib === hariIni,
        );
        setAbsen({
          masuk: milikku.find((a) => a.jenis === "masuk")?.waktu ?? null,
          pulang: milikku.find((a) => a.jenis === "pulang")?.waktu ?? null,
        });
      }
      if (rekap.status === "fulfilled" && rekap.value) {
        setKomentar(rekap.value);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [user.id, user.nama, mauKerja, mauVideo, mauAbsen, mauKomentar, tik]);

  const persenKerja = kpiKerja && kpiKerja.rencana_total > 0 ? (kpiKerja.kpi_persen ?? 0) : 0;
  // Persen KETAT per platform dari server (2 Sep 2026); cadangan hitung kasar.
  const persenVideo = video && video.target > 0
    ? (video.persen ?? Math.min(100, Math.round((100 * video.jumlah) / video.target)))
    : 0;
  const persenKomentar = komentar && komentar.total > 0
    ? Math.round((100 * komentar.sudah) / komentar.total)
    : 0;

  return (
    <div className="kolom-aplikasi px-4 pt-5 pb-32">
      {/* Sapaan */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-teks-sekunder">{sapaanHari()},</p>
          <h1 className="truncate font-heading text-[22px] leading-tight font-extrabold tracking-tight text-teks-utama">
            {user.nama.split(" ")[0] || user.nama}
          </h1>
          <p className="mt-1 text-[11px] text-teks-sekunder">
            {tanggalIndonesia(`${tanggalWibPerangkat()}T00:00:00+07:00`)}
          </p>
          {/* Jam WIB berjalan tiap detik (spek 1.15) */}
          <JamDigital className="mt-0.5 block font-heading text-lg font-extrabold tracking-tight text-teks-utama" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Avatar saya — bercincin Mythical bila masuk 3 besar TVR */}
          <CincinJuara userId={user.id} ukuran={36}>
            {user.avatar_url ? (
              <FotoBulat src={user.avatar_url} ukuran={36} />
            ) : (
              <AvatarInisial nama={user.nama} ukuran={36} />
            )}
          </CincinJuara>
          {/* Api task streak (spek 4.1): absensi harian berturut-turut */}
          {streak > 0 && (
            <span className="glass flex h-10 items-center rounded-xl px-2.5">
              <IkonStreak hari={streak} />
            </span>
          )}
          {/* Mahkota leaderboard TV Rakyat (kiri lonceng, 1 Sep 2026) */}
          <TombolPeringkat />
          <TombolLonceng onBuka={onBukaNotifikasi} />
          {/* Sinyal latensi server (1 Sep 2026) — pojok kanan atas */}
          <IkonSinyal />
          <ThemeToggle />
        </div>
      </header>

      {/* Ulang tahun hari ini */}
      <KartuUltah idKu={user.id} />

      {/* CHAT NAKA (3 Sep 2026): untuk anggota TANPA jabatan — tombol WhatsApp
          langsung ke NAKA. Pemegang jabatan / pengurus tidak melihatnya. */}
      {!(user.jabatan ?? "").trim() && user.role !== "master" && user.role !== "super_admin" && (
        <a
          href="https://wa.me/62882007525790?text=Halo%20NAKA%2C%20saya%20anggota%20PRI%20SuperApp."
          target="_blank"
          rel="noopener noreferrer"
          className="btn-tekan mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[14px] font-extrabold tracking-wide text-white shadow-lg"
          style={{ background: "linear-gradient(135deg, #25D366, #128C7E)" }}
          aria-label="Chat NAKA lewat WhatsApp"
        >
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
          CHAT NAKA
        </a>
      )}

      {/* Seksi-seksi Beranda dalam kerangka TATA LETAK (fitur 1.20/1&2):
          semua bisa dilipat, diurutkan ulang, dan disembunyikan lewat
          tombol "Atur Tata Letak" — pilihannya milik tiap pengguna.
          Id seksi pengumuman & konten SENGAJA sama dengan kunci
          SeksiLipat lama supaya preferensi lipatan 1.19 tidak hangus. */}
      <div className="mt-4">
        <TataLetakModul
          modul="beranda"
          seksi={[
            ...(boleh("beranda.pengumuman")
              ? [
                  {
                    id: "pengumuman",
                    judul: "Pengumuman",
                    ikon: Megaphone,
                    bawaanTerbuka: true,
                    render: () => <KartuPengumumanTerbaru />,
                  },
                ]
              : []),
            ...(mauAbsen
              ? [
                  {
                    id: "kehadiran",
                    judul: "Kehadiran Hari Ini",
                    ikon: CalendarCheck,
                    bawaanTerbuka: true,
                    render: () => (
                      <button
                        type="button"
                        onClick={onBukaAbsensi}
                        className="btn-tekan w-full text-left"
                        aria-label="Buka Absensi"
                      >
                        <GlassCard className="flex items-center gap-3 p-3.5">
                          <span
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                            style={{ backgroundColor: "#10B9811a", color: "#10B981" }}
                            aria-hidden="true"
                          >
                            <CalendarCheck className="h-5 w-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-teks-utama">Kehadiran Hari Ini</p>
                            <p className="mt-0.5 text-[11px] text-teks-sekunder">
                              {absen === null
                                ? "Memuat…"
                                : absen.masuk
                                  ? `Masuk ${jamWIB(absen.masuk)}${absen.pulang ? ` · Pulang ${jamWIB(absen.pulang)}` : " · belum absen pulang"}`
                                  : "Belum absen masuk — ketuk untuk absen"}
                            </p>
                          </div>
                          {absen?.masuk ? (
                            <StatusBadge label="hadir" warna="hijau" />
                          ) : (
                            <StatusBadge label="belum" warna="kuning" />
                          )}
                        </GlassCard>
                      </button>
                    ),
                  },
                ]
              : []),
            ...(mauKerja || mauKomentar || mauVideo
              ? [
                  {
                    id: "kpi",
                    judul: "Target Harian",
                    ikon: ClipboardList,
                    bawaanTerbuka: true,
                    render: () => (
                      <div className="grid grid-cols-2 gap-2.5">
                        {mauKerja && (
                          <KartuAngka
                            label="Kerja Hari Ini"
                            nilai={kpiKerja ? `${kpiKerja.rencana_selesai}/${kpiKerja.rencana_total}` : "…"}
                            keterangan={
                              kpiKerja && kpiKerja.rencana_total === 0
                                ? "Belum ada rencana — ketuk"
                                : "rencana selesai"
                            }
                            persen={persenKerja}
                            Ikon={ClipboardList}
                            onKlik={onBukaLaporanKerja}
                          />
                        )}
                        {mauKomentar && (
                          <KartuAngka
                            label="Wajib Komentar"
                            nilai={komentar ? `${komentar.sudah}/${komentar.total}` : "…"}
                            keterangan={
                              komentar && komentar.total === 0
                                ? `Menunggu konten hari ini · komentar terakhir diambil ${waktuJelasWIB(komentar.diperbarui)}`
                                : `postingan dikomentari · komentar terakhir diambil ${waktuJelasWIB(komentar?.diperbarui)}`
                            }
                            persen={persenKomentar}
                            Ikon={MessageCircle}
                          />
                        )}
                        {mauVideo && (
                          <KartuAngka
                            label="Laporan Video"
                            nilai={video ? `${video.jumlah}/${video.target}` : "…"}
                            keterangan="video dilaporkan"
                            persen={persenVideo}
                            Ikon={Video}
                            onKlik={onBukaTvrKu}
                          />
                        )}
                      </div>
                    ),
                  },
                ]
              : []),
            {
              id: "konten",
              judul: "Konten",
              ikon: Newspaper,
              keterangan: "Konten terbaru akun resmi partai",
              render: () => (
                <KontenScreen user={user} terbenam onBukaLaporanKerja={onBukaLaporanKerja} />
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}

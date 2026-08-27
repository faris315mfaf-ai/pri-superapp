"use client";

// ============================================================
// Seksi pemantauan dashboard super admin:
// 1. Insight TV Rakyat — angka profil per sosmed (pemilih 6 platform).
// 2. Laporan absensi harian — status tiap anggota hari ini
//    (masuk / izin / sakit / alfa), digabung dari absensi + perizinan.
// 3. Rencana anggota — KPI rencana harian semua anggota + daftar
//    rencana besar yang sedang berjalan.
// ============================================================

import { useEffect, useState } from "react";
import { toast } from "@/hooks/use-app-store";
import { statusTelat, tepatWaktu } from "@/lib/absensi-status";
import { BarChart3, Eye, Heart, Radar, Users, FileDown, X, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { FotoBulat } from "@/components/foto-bulat";
import { NavHalaman } from "@/components/nav-halaman";
import { AvatarInisial, FadeInUp, GlassSkeleton, SectionTitle, StatusBadge } from "@/components/pri-ui";
import { PlatformIcon } from "@/components/platform-icon";
import { ProgressRing } from "@/components/progress-ring";
import {
  getAbsensi,
  getInsightSosmed,
  getKpiSemua,
  getPengguna,
  getPerizinan,
  getRekapVideoSemua,
  getRencanaBesarSemua,
  type BalasanInsight,
  type KerjaKpiBaris,
  type RencanaBesarBaris,
  setKpiVideo,
  buatRekapAbsensiPdf,
} from "@/services";
import { formatAngkaRingkas, jamWIB } from "@/lib/format";
import { cn } from "@/lib/utils";

const PLATFORM_PILIHAN = [
  { id: "instagram", label: "IG" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YT" },
  { id: "facebook", label: "FB" },
  { id: "threads", label: "Threads" },
  { id: "twitter", label: "X" },
] as const;

// ------------------------------------------------------------
// 1. Insight TV Rakyat per platform
// ------------------------------------------------------------

export function SeksiInsightTvr() {
  const [platform, setPlatform] = useState<string>("instagram");
  const [data, setData] = useState<BalasanInsight | null>(null);
  const [memuat, setMemuat] = useState(true);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getInsightSosmed(false, platform);
        if (!hidup) return;
        setData(hasil);
      } catch {
        if (hidup) setData(null);
      } finally {
        if (hidup) setMemuat(false);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [platform]);

  const insight = data?.insight ?? null;
  const tertaut = new Set((data?.akun?.platformAktif ?? []).map((p) => p.toLowerCase()));

  return (
    <FadeInUp delay={0.05}>
      <SectionTitle judul="Insight TV Rakyat" className="mt-6" />
      <GlassCard className="p-4">
        {/* Pemilih sosmed */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-tipis">
          {PLATFORM_PILIHAN.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setMemuat(true);
                setPlatform(p.id);
              }}
              className={cn(
                "btn-tekan flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold",
                platform === p.id ? "text-white" : "glass-soft text-teks-sekunder",
              )}
              style={
                platform === p.id
                  ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                  : undefined
              }
            >
              <PlatformIcon platform={p.id} size={12} />
              {p.label}
            </button>
          ))}
        </div>

        {memuat ? (
          <GlassSkeleton className="mt-3 h-20 rounded-xl" />
        ) : !insight ? (
          <p className="mt-3 py-4 text-center text-xs leading-relaxed text-teks-sekunder">
            {tertaut.size > 0 && !tertaut.has(platform)
              ? "Akun untuk platform ini belum ditautkan di Ayrshare."
              : "Insight belum tersedia untuk platform ini."}
          </p>
        ) : (
          <>
            <div className="mt-3 flex items-center gap-2.5">
              {insight.fotoProfil ? (
                <img src={insight.fotoProfil} alt="" className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <BarChart3 className="h-5 w-5 text-pri" aria-hidden="true" />
              )}
              <p className="min-w-0 flex-1 truncate text-sm font-bold text-teks-utama">
                @{insight.username}
              </p>
              {data?.kedaluwarsa && <StatusBadge label="data lama" warna="kuning" />}
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {(
                [
                  { label: "Pengikut", nilai: insight.pengikut, Ikon: Users, warna: "#DC2626" },
                  { label: "Tayangan", nilai: insight.tayangan, Ikon: Eye, warna: "#10B981" },
                  { label: "Jangkauan", nilai: insight.jangkauan, Ikon: Radar, warna: "#8B5CF6" },
                  { label: "Suka", nilai: insight.suka, Ikon: Heart, warna: "#EC4899" },
                ] as const
              ).map((m) => (
                <div key={m.label} className="glass-soft rounded-xl px-2 py-2 text-center">
                  <m.Ikon className="mx-auto h-3.5 w-3.5" style={{ color: m.warna }} aria-hidden="true" />
                  <p className="angka-tab mt-1 font-heading text-sm font-extrabold text-teks-utama">
                    {m.nilai === null ? "–" : formatAngkaRingkas(m.nilai)}
                  </p>
                  <p className="text-[9px] text-teks-sekunder">{m.label}</p>
                </div>
              ))}
            </div>
            {insight.diperbarui && (
              <p className="mt-2 text-center text-[10px] text-teks-sekunder/80">
                Diperbarui Ayrshare pukul {jamWIB(insight.diperbarui)} WIB
              </p>
            )}
          </>
        )}
      </GlassCard>
    </FadeInUp>
  );
}

// ------------------------------------------------------------
// 2. Laporan absensi harian semua anggota
// ------------------------------------------------------------

type StatusHarian = {
  id: string;
  nama: string;
  avatar_url: string;
  status: "masuk" | "izin" | "sakit" | "alfa" | "menunggu izin";
  jamMasuk: string | null;
  videoHariIni: number;
  /** Bukti absen masuk hari ini (signed URL 1 jam) — utk modal detail */
  fotoMasuk: string;
  alamatMasuk: string;
};

export function SeksiAbsensiHarian() {
  const [daftar, setDaftar] = useState<StatusHarian[] | null>(null);
  // Ringkas: angka rekap tampil dulu; daftar orangnya dilipat dan
  // berhalaman supaya dashboard tidak memanjang puluhan baris.
  const [terbuka, setTerbuka] = useState(false);
  const [targetPer, setTargetPer] = useState<Map<string, number>>(new Map());
  const [kpiUntuk, setKpiUntuk] = useState<{ id: string; nama: string } | null>(null);
  // Filter status absensi (spek 1.15): klik chip untuk menyaring
  const [saringStatus, setSaringStatus] = useState<StatusHarian["status"] | "semua">("semua");
  // Baris yang dibuka detailnya (foto bukti + KPI)
  const [detailAbsen, setDetailAbsen] = useState<StatusHarian | null>(null);
  const [modalRekap, setModalRekap] = useState(false);
  const [halamanAbsen, setHalamanAbsen] = useState(1);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        // Empat sumber digabung: daftar pengguna (basis), absensi hari
        // ini, perizinan hari ini, dan laporan video (konteks KPI).
        const [pengguna, absensi, izin, video] = await Promise.all([
          getPengguna(),
          getAbsensi(true),
          getPerizinan(true).catch(() => []),
          getRekapVideoSemua().catch(() => null),
        ]);
        if (!hidup) return;

        const hariIni = absensi.tanggal_hari_ini;
        const masukPer = new Map<string, string>();
        const buktiPer = new Map<string, { foto: string; alamat: string }>();
        for (const a of absensi.data) {
          if (a.tanggal_wib === hariIni && a.jenis === "masuk") {
            masukPer.set(a.user_id, a.waktu);
            buktiPer.set(a.user_id, { foto: a.foto_url ?? "", alamat: a.alamat ?? "" });
          }
        }
        const izinPer = new Map(
          izin.filter((i) => i.tanggal_wib === hariIni).map((i) => [i.user_id, i]),
        );
        const videoPer = new Map((video?.data ?? []).map((v) => [v.user_id, v.jumlah]));
        // Target KPI khusus per akun (spek 3.1); tanpa entri = bawaan 5.
        const targetPeta = new Map(
          (video?.target_khusus ?? []).map((t) => [t.user_id, t.kpi]),
        );
        setTargetPer(targetPeta);

        setDaftar(
          pengguna.data
            .filter((u) => u.status === "aktif" && u.aktif)
            .map((u) => {
              const jamMasuk = masukPer.get(u.id) ?? null;
              const iz = izinPer.get(u.id);
              const status: StatusHarian["status"] = jamMasuk
                ? "masuk"
                : iz?.status === "disetujui"
                  ? (iz.jenis as "izin" | "sakit")
                  : iz?.status === "menunggu"
                    ? "menunggu izin"
                    : "alfa";
              return {
                id: u.id,
                nama: u.nama,
                avatar_url: u.avatar_url ?? "",
                status,
                jamMasuk,
                videoHariIni: videoPer.get(u.id) ?? 0,
                fotoMasuk: buktiPer.get(u.id)?.foto ?? "",
                alamatMasuk: buktiPer.get(u.id)?.alamat ?? "",
              };
            }),
        );
      } catch {
        if (hidup) setDaftar([]);
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  return (
    <FadeInUp delay={0.08}>
      <SectionTitle judul="Absensi Hari Ini" className="mt-6" />
      {daftar === null ? (
        <GlassSkeleton className="h-24 rounded-2xl" />
      ) : daftar.length === 0 ? (
        <GlassCard className="p-4">
          <p className="text-center text-xs text-teks-sekunder">Belum ada data anggota.</p>
        </GlassCard>
      ) : (
        <GlassCard className="p-3">
          {/* Rekap ringkas per status */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Chip = FILTER (spek 1.15): klik untuk menyaring daftar */}
            {(
              [
                ["masuk", "hijau"],
                ["izin", "biru"],
                ["sakit", "biru"],
                ["menunggu izin", "kuning"],
                ["alfa", "merah"],
              ] as const
            ).map(([st, warna]) => {
              const n = daftar.filter((d) => d.status === st).length;
              if (n === 0) return null;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    setSaringStatus((v) => (v === st ? "semua" : st));
                    setTerbuka(true);
                    setHalamanAbsen(1);
                  }}
                  aria-pressed={saringStatus === st}
                  className={cn(
                    "btn-tekan rounded-full transition-opacity",
                    saringStatus !== "semua" && saringStatus !== st && "opacity-40",
                  )}
                >
                  <StatusBadge label={`${st} ${n}`} warna={warna} />
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setModalRekap(true)}
              className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-pri underline-offset-4 hover:underline"
            >
              <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
              Rekap PDF
            </button>
            <button
              type="button"
              onClick={() => setTerbuka((v) => !v)}
              className="text-[11px] font-semibold text-pri underline-offset-4 hover:underline"
            >
              {terbuka ? "Sembunyikan daftar" : `Lihat daftar (${daftar.length})`}
            </button>
          </div>
          {terbuka && (
          <div className="mt-2 flex flex-col">
            {daftar
              .filter((d) => saringStatus === "semua" || d.status === saringStatus)
              .slice((halamanAbsen - 1) * 10, halamanAbsen * 10)
              .map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDetailAbsen(d)}
                aria-label={`Detail absen ${d.nama}`}
                className="btn-tekan flex items-center gap-2.5 rounded-xl px-2 py-2 text-left"
              >
                {d.avatar_url ? (
                  <FotoBulat src={d.avatar_url} ukuran={32} />
                ) : (
                  <AvatarInisial nama={d.nama} ukuran={32} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold text-teks-utama">{d.nama}</p>
                  {/* Status Absensi menggantikan KPI video (spek 1.15):
                      <=09:15 tepat waktu, lewat = telat terhitung.
                      Setel KPI video pindah ke modal detail. */}
                  <p className="text-[10px] text-teks-sekunder">
                    {d.jamMasuk ? (
                      <>
                        masuk {jamWIB(d.jamMasuk)} ·{" "}
                        <span
                          className={cn(
                            "font-bold",
                            tepatWaktu(d.jamMasuk) ? "text-sukses" : "text-gagal",
                          )}
                        >
                          {statusTelat(d.jamMasuk)}
                        </span>
                      </>
                    ) : (
                      "belum absen"
                    )}
                  </p>
                </div>
                <StatusBadge
                  label={d.status}
                  warna={
                    d.status === "masuk"
                      ? "hijau"
                      : d.status === "alfa"
                        ? "merah"
                        : d.status === "menunggu izin"
                          ? "kuning"
                          : "biru"
                  }
                />
              </button>
            ))}
          </div>
          )}
          {terbuka && (
            <NavHalaman
              total={daftar.filter((d) => saringStatus === "semua" || d.status === saringStatus).length}
              perHalaman={10}
              halaman={halamanAbsen}
              onGanti={setHalamanAbsen}
            />
          )}
        </GlassCard>
      )}

      {/* Modal detail absen: foto bukti + alamat + setel KPI (spek 1.15) */}
      {detailAbsen && (
        <ModalDetailAbsen
          data={detailAbsen}
          targetKpi={targetPer.get(detailAbsen.id) ?? 5}
          onSetelKpi={() => {
            setKpiUntuk({ id: detailAbsen.id, nama: detailAbsen.nama });
            setDetailAbsen(null);
          }}
          onTutup={() => setDetailAbsen(null)}
        />
      )}

      {/* Modal rekap absensi -> PDF -> WA (spek 1.15) */}
      {modalRekap && <ModalRekapPdf onTutup={() => setModalRekap(false)} />}

      {/* Modal setel KPI video per akun (spek 3.1) */}
      {kpiUntuk && (
        <ModalKpiVideo
          target={kpiUntuk}
          nilaiAwal={targetPer.get(kpiUntuk.id) ?? 5}
          onTutup={() => setKpiUntuk(null)}
          onTersimpan={(kpiBaru) => {
            setTargetPer((peta) => {
              const b = new Map(peta);
              if (kpiBaru === null) b.delete(kpiUntuk.id);
              else b.set(kpiUntuk.id, kpiBaru);
              return b;
            });
            setKpiUntuk(null);
          }}
        />
      )}
    </FadeInUp>
  );
}

// ------------------------------------------------------------
// ModalDetailAbsen — klik profil di daftar absensi (spek 1.15):
// foto bukti absen, alamat, status telat, dan pintu setel KPI video.
// ------------------------------------------------------------

function ModalDetailAbsen({
  data,
  targetKpi,
  onSetelKpi,
  onTutup,
}: {
  data: StatusHarian;
  targetKpi: number;
  onSetelKpi: () => void;
  onTutup: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center px-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Detail absen ${data.nama}`}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onTutup} />
      <div className="glass-strong relative max-h-[85dvh] w-full max-w-[360px] overflow-y-auto rounded-2xl p-5">
        <div className="flex items-center gap-3">
          {data.avatar_url ? (
            <FotoBulat src={data.avatar_url} ukuran={44} />
          ) : (
            <AvatarInisial nama={data.nama} ukuran={44} />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-teks-utama">{data.nama}</p>
            <p className="text-[11px] text-teks-sekunder">
              {data.jamMasuk ? `Masuk ${jamWIB(data.jamMasuk)}` : "Belum absen hari ini"}
            </p>
          </div>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            className="btn-tekan p-1.5 text-teks-sekunder"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {data.jamMasuk && (
          <p
            className={cn(
              "mt-2 rounded-xl px-3 py-2 text-center text-[12.5px] font-bold",
              tepatWaktu(data.jamMasuk)
                ? "bg-sukses/10 text-sukses"
                : "bg-gagal/10 text-gagal",
            )}
          >
            {statusTelat(data.jamMasuk)}
          </p>
        )}

        {/* Foto bukti absen (spek 1.15: klik profil -> lihat bukti) */}
        {data.fotoMasuk ? (
          <img
            src={data.fotoMasuk}
            alt={`Foto bukti absen ${data.nama}`}
            className="mt-3 max-h-72 w-full rounded-xl object-contain"
          />
        ) : (
          <p className="mt-3 rounded-xl bg-teks-sekunder/10 px-3 py-4 text-center text-[11.5px] text-teks-sekunder">
            {data.jamMasuk ? "Foto bukti tidak tersedia." : "Belum ada foto — orang ini belum absen."}
          </p>
        )}
        {data.alamatMasuk && (
          <p className="mt-2 text-[11px] leading-relaxed text-teks-sekunder">
            📍 {data.alamatMasuk}
          </p>
        )}

        {/* KPI video pindah ke sini (dulu di baris daftar) */}
        <button
          type="button"
          onClick={onSetelKpi}
          className="glass btn-tekan mt-3 flex w-full items-center justify-between rounded-xl px-3.5 py-2.5"
        >
          <span className="text-[12px] font-semibold text-teks-utama">
            Video hari ini: {data.videoHariIni}/{targetKpi}
          </span>
          <span className="text-[11px] font-bold text-pri">Setel KPI</span>
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// ModalRekapPdf — pengurus memilih rentang tanggal; server membuat
// PDF rekap absensi, memberi tautan unduh, dan (opsional) langsung
// mengirimkannya ke nomor WhatsApp tujuan (spek 1.15).
// ------------------------------------------------------------

function ModalRekapPdf({ onTutup }: { onTutup: () => void }) {
  const hariIni = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const awalBulan = hariIni.slice(0, 8) + "01";
  const [dari, setDari] = useState(awalBulan);
  const [sampai, setSampai] = useState(hariIni);
  const [nomorWa, setNomorWa] = useState("");
  const [sedang, setSedang] = useState(false);
  const [hasilUrl, setHasilUrl] = useState("");

  async function buat() {
    if (sedang) return;
    setSedang(true);
    try {
      const hasil = await buatRekapAbsensiPdf({
        dari,
        sampai,
        nomorWa: nomorWa.trim() || undefined,
      });
      setHasilUrl(hasil.url);
      if (nomorWa.trim() && !hasil.terkirim_wa) {
        // WA gagal — PDF tetap ada; katakan apa adanya (fix 1.16).
        toast("peringatan", `Rekap ${hasil.baris} baris siap`, hasil.pesan_wa || "WhatsApp tidak bisa dihubungi — unduh lewat tombol di bawah.");
      } else {
        toast(
          "sukses",
          `Rekap ${hasil.baris} baris siap`,
          hasil.terkirim_wa ? "PDF sudah dikirim ke WhatsApp tujuan." : "Ketuk untuk mengunduh.",
        );
      }
    } catch (e) {
      toast("error", "Gagal membuat rekap", e instanceof Error ? e.message : "");
    } finally {
      setSedang(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center px-6"
      role="dialog"
      aria-modal="true"
      aria-label="Rekap absensi PDF"
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onTutup} />
      <div className="glass-strong relative w-full max-w-[340px] rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-base font-bold text-teks-utama">Rekap Absensi</h3>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            className="btn-tekan p-1 text-teks-sekunder"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-[11.5px] leading-relaxed text-teks-sekunder">
          PDF berisi jam masuk/pulang & status telat tiap orang. Isi nomor
          WhatsApp untuk langsung mengirimkannya.
        </p>

        <div className="mt-3 flex gap-2">
          <label className="min-w-0 flex-1 text-[10.5px] font-semibold text-teks-sekunder">
            Dari
            <input
              type="date"
              value={dari}
              onChange={(e) => setDari(e.target.value)}
              className="glass mt-1 h-10 w-full rounded-xl px-3 text-sm text-teks-utama focus:outline-none"
            />
          </label>
          <label className="min-w-0 flex-1 text-[10.5px] font-semibold text-teks-sekunder">
            Sampai
            <input
              type="date"
              value={sampai}
              onChange={(e) => setSampai(e.target.value)}
              className="glass mt-1 h-10 w-full rounded-xl px-3 text-sm text-teks-utama focus:outline-none"
            />
          </label>
        </div>
        <input
          value={nomorWa}
          onChange={(e) => setNomorWa(e.target.value)}
          placeholder="Nomor WA tujuan (opsional)…"
          aria-label="Nomor WhatsApp tujuan"
          inputMode="tel"
          className="glass mt-2 h-10 w-full rounded-xl px-3.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
        />

        {hasilUrl ? (
          <a
            href={hasilUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-tekan mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 font-heading text-sm font-bold text-white"
            style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
          >
            <FileDown className="h-4 w-4" aria-hidden="true" />
            Unduh PDF
          </a>
        ) : (
          <button
            type="button"
            onClick={() => void buat()}
            disabled={sedang}
            className="btn-tekan mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 font-heading text-sm font-bold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            {sedang ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileDown className="h-4 w-4" aria-hidden="true" />
            )}
            {nomorWa.trim() ? "Buat & Kirim ke WA" : "Buat PDF"}
          </button>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// ModalKpiVideo — HR/QC/Pengawas menyetel target video harian satu
// akun (spek 3.1). Bawaan 5; bisa diturunkan (mis. akun suspend).
// ------------------------------------------------------------

function ModalKpiVideo({
  target,
  nilaiAwal,
  onTutup,
  onTersimpan,
}: {
  target: { id: string; nama: string };
  nilaiAwal: number;
  onTutup: () => void;
  onTersimpan: (kpi: number | null) => void;
}) {
  const [nilai, setNilai] = useState(nilaiAwal);
  const [sibuk, setSibuk] = useState(false);

  async function simpan(kpi: number | null) {
    if (sibuk) return;
    setSibuk(true);
    try {
      await setKpiVideo(target.id, kpi);
      toast(
        "sukses",
        `KPI ${target.nama.split(" ")[0]} disetel`,
        kpi === null ? "Kembali ke bawaan 5 video/hari." : `${kpi} video per hari.`,
      );
      onTersimpan(kpi);
    } catch (e) {
      toast("error", "Gagal menyimpan KPI", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center px-8"
      role="dialog"
      aria-modal="true"
      aria-label="Setel KPI video"
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onTutup} />
      <div className="glass-strong relative w-full max-w-[300px] rounded-2xl p-5 text-center">
        <p className="text-sm font-bold text-teks-utama">Target video {target.nama}</p>
        <p className="mt-0.5 text-[11px] text-teks-sekunder">
          Bawaan 5/hari — turunkan mis. untuk akun yang kena suspend.
        </p>
        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => setNilai((n) => Math.max(0, n - 1))}
            aria-label="Kurangi target"
            className="glass btn-tekan flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold text-teks-utama"
          >
            −
          </button>
          <span className="angka-tab font-heading w-12 text-3xl font-extrabold text-teks-utama">
            {nilai}
          </span>
          <button
            type="button"
            onClick={() => setNilai((n) => Math.min(30, n + 1))}
            aria-label="Tambah target"
            className="glass btn-tekan flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold text-teks-utama"
          >
            +
          </button>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={sibuk}
            onClick={() => void simpan(null)}
            className="glass btn-tekan flex-1 rounded-xl py-2.5 text-[12px] font-semibold text-teks-utama disabled:opacity-60"
          >
            Bawaan (5)
          </button>
          <button
            type="button"
            disabled={sibuk}
            onClick={() => void simpan(nilai)}
            className="btn-tekan flex-1 rounded-xl py-2.5 text-[12px] font-bold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// 3. Rencana harian (KPI) + rencana besar semua anggota
// ------------------------------------------------------------

export function SeksiRencanaAnggota() {
  const [kpi, setKpi] = useState<KerjaKpiBaris[] | null>(null);
  const [besar, setBesar] = useState<RencanaBesarBaris[]>([]);
  const [halamanKpi, setHalamanKpi] = useState(1);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const [harian, proyek] = await Promise.all([
          getKpiSemua(),
          getRencanaBesarSemua().catch(() => []),
        ]);
        if (!hidup) return;
        setKpi(harian.data);
        setBesar(proyek.filter((b) => b.status !== "selesai").slice(0, 8));
      } catch {
        if (hidup) setKpi([]);
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  return (
    <FadeInUp delay={0.11}>
      <SectionTitle judul="Rencana Kerja Anggota" className="mt-6" />

      {kpi === null ? (
        <GlassSkeleton className="h-20 rounded-2xl" />
      ) : kpi.length === 0 ? (
        <GlassCard className="p-4">
          <p className="text-center text-xs leading-relaxed text-teks-sekunder">
            Belum ada anggota yang mengisi rencana harian hari ini.
          </p>
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-2">
          {kpi.slice((halamanKpi - 1) * 10, halamanKpi * 10).map((b) => (
            <GlassCard key={b.user_id} className="flex items-center gap-3 p-2.5">
              <AvatarInisial nama={b.nama} ukuran={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold text-teks-utama">{b.nama}</p>
                <p className="text-[10px] text-teks-sekunder">
                  {b.rencana_selesai}/{b.rencana_total} selesai
                  {b.rencana_belum_lapor > 0 ? ` · ${b.rencana_belum_lapor} belum lapor` : ""}
                </p>
              </div>
              <ProgressRing value={b.kpi_persen ?? 0} size={38} strokeWidth={4}>
                <span className="angka-tab text-[9px] font-bold text-teks-utama">
                  {b.kpi_persen ?? 0}%
                </span>
              </ProgressRing>
            </GlassCard>
          ))}
          <NavHalaman
            total={kpi.length}
            perHalaman={10}
            halaman={halamanKpi}
            onGanti={setHalamanKpi}
          />
        </div>
      )}

      {besar.length > 0 && (
        <>
          <p className="mt-3 mb-1.5 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
            Rencana Besar Berjalan
          </p>
          <div className="flex flex-col gap-2">
            {besar.map((b) => (
              <GlassCard key={b.id} className="p-3">
                <p className="text-[12.5px] font-semibold leading-snug text-teks-utama">
                  {b.deskripsi}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold text-teks-sekunder">{b.nama}</span>
                  {b.tenggat && (
                    <span className="inline-flex items-center rounded-full border border-emas/30 bg-emas/10 px-2 py-0.5 text-[9.5px] font-bold text-amber-600 dark:text-amber-400">
                      tenggat {b.tenggat}
                    </span>
                  )}
                  {b.nama_penugas && (
                    <span className="text-[10px] text-teks-sekunder">
                      dari {b.nama_penugas}
                    </span>
                  )}
                </div>
              </GlassCard>
            ))}
          </div>
        </>
      )}
    </FadeInUp>
  );
}

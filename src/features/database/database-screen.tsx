"use client";

// ============================================================
// DatabaseScreen — "kaca pembesar" pengurus atas satu anggota.
//
// Daftar semua pengguna aktif (dengan ringkasan hari ini), lalu
// detail per orang: kewajiban komentar, KPI kerja 7 hari, absensi
// 7 hari, dan laporan video 7 hari. Dibuka dari beranda super
// admin; peran lain menyusul lewat sakelar "Database anggota"
// di Pengaturan Fitur.
// ============================================================

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarCheck,
  ClipboardList,
  Database,
  ExternalLink,
  MessageCircle,
  Search,
  Video,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { FotoBulat } from "@/components/foto-bulat";
import {
  AvatarInisial,
  EmptyState,
  FadeInUp,
  GlassSkeleton,
  SectionTitle,
  StatusBadge,
} from "@/components/pri-ui";
import { NavHalaman } from "@/components/nav-halaman";
import { toast } from "@/hooks/use-app-store";
import {
  getDatabasePengguna,
  getDatabaseDetail,
  type DbRingkasPengguna,
  type DbDetailPengguna,
} from "@/services";
import { jamWIB, tanggalIndonesia } from "@/lib/format";
import { labelPlatform } from "@/components/platform-icon";

const PER_HALAMAN = 10;

// ------------------------------------------------------------
// Detail satu pengguna
// ------------------------------------------------------------

function DetailPengguna({ id, onKembali }: { id: string; onKembali: () => void }) {
  const [data, setData] = useState<DbDetailPengguna | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getDatabaseDetail(id);
        if (hidup) setData(hasil);
      } catch (e) {
        if (hidup) {
          toast("error", "Gagal memuat detail", e instanceof Error ? e.message : "");
          onKembali();
        }
      }
    })();
    return () => {
      hidup = false;
    };
    // onKembali stabil dari induk; id-lah pemicu muat ulangnya.
  }, [id]);

  if (!data) return <GlassSkeleton className="mt-4 h-48 rounded-2xl" />;

  const p = data.pengguna;
  return (
    <>
      <FadeInUp>
        <GlassCard className="mt-4 flex items-center gap-3 p-4">
          {p.avatar_url ? (
            <FotoBulat src={p.avatar_url} ukuran={48} />
          ) : (
            <AvatarInisial nama={p.nama} ukuran={48} />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold text-teks-utama">{p.nama}</p>
            <p className="mt-0.5 text-[11px] text-teks-sekunder">
              {p.struktur || "Belum memilih divisi"}
            </p>
          </div>
        </GlassCard>
      </FadeInUp>

      {/* Kewajiban komentar hari ini */}
      <FadeInUp delay={0.04}>
        <SectionTitle judul="Kewajiban Komentar Hari Ini" className="mt-5" />
        <GlassCard className="p-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-pri" aria-hidden="true" />
            <p className="angka-tab text-sm font-extrabold text-teks-utama">
              {data.komentar.sudah}/{data.komentar.total}
            </p>
            <p className="text-[11px] text-teks-sekunder">postingan dikomentari</p>
          </div>
          {data.komentar.per_akun.length > 0 && (
            <div className="mt-2.5 flex flex-col gap-1">
              {data.komentar.per_akun.map((a) => (
                <div key={a.akun} className="flex items-center justify-between text-[11.5px]">
                  <span className="truncate text-teks-sekunder">{a.akun}</span>
                  <span className="angka-tab ml-2 shrink-0 font-bold text-teks-utama">
                    {a.sudah}/{a.total}
                  </span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </FadeInUp>

      {/* KPI kerja 7 hari */}
      <FadeInUp delay={0.08}>
        <SectionTitle judul="KPI Rencana Kerja (7 Hari)" className="mt-5" />
        <GlassCard className="p-4">
          {data.kerja.length === 0 ? (
            <p className="text-center text-xs text-teks-sekunder">
              Belum ada rencana kerja tercatat.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {data.kerja.map((k) => (
                <div key={k.tanggal} className="flex items-center gap-2 text-[12px]">
                  <ClipboardList className="h-3.5 w-3.5 shrink-0 text-teks-sekunder" aria-hidden="true" />
                  <span className="w-24 shrink-0 text-teks-sekunder">
                    {tanggalIndonesia(`${k.tanggal}T00:00:00+07:00`)}
                  </span>
                  <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${k.persen}%`,
                        background: "linear-gradient(90deg, #DC2626, #F59E0B)",
                      }}
                    />
                  </div>
                  <span className="angka-tab w-14 shrink-0 text-right font-bold text-teks-utama">
                    {k.selesai}/{k.total} · {k.persen}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </FadeInUp>

      {/* Absensi 7 hari */}
      <FadeInUp delay={0.12}>
        <SectionTitle judul="Absensi (7 Hari)" className="mt-5" />
        <GlassCard className="p-4">
          {data.absensi.length === 0 ? (
            <p className="text-center text-xs text-teks-sekunder">Belum ada catatan absen.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {data.absensi.map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px]">
                  <CalendarCheck className="h-3.5 w-3.5 shrink-0 text-teks-sekunder" aria-hidden="true" />
                  <span className="w-24 shrink-0 text-teks-sekunder">
                    {tanggalIndonesia(`${a.tanggal_wib}T00:00:00+07:00`)}
                  </span>
                  <StatusBadge label={a.jenis} warna={a.jenis === "masuk" ? "hijau" : "biru"} />
                  <span className="angka-tab text-teks-utama">{jamWIB(a.waktu)}</span>
                  <span className="min-w-0 flex-1 truncate text-right text-[10.5px] text-teks-sekunder">
                    {a.alamat ?? ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </FadeInUp>

      {/* Laporan video 7 hari */}
      <FadeInUp delay={0.16}>
        <SectionTitle judul={`Laporan Video (7 Hari) — hari ini ${data.video.hari_ini}/5`} className="mt-5" />
        <GlassCard className="p-4">
          {data.video.daftar.length === 0 ? (
            <p className="text-center text-xs text-teks-sekunder">Belum ada laporan video.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {data.video.daftar.map((v, i) => (
                <a
                  key={i}
                  href={v.url_video}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-[12px]"
                >
                  <Video className="h-3.5 w-3.5 shrink-0 text-teks-sekunder" aria-hidden="true" />
                  <span className="w-24 shrink-0 text-teks-sekunder">
                    {tanggalIndonesia(`${v.tanggal_wib}T00:00:00+07:00`)}
                  </span>
                  <span className="shrink-0 font-semibold text-teks-utama">
                    {labelPlatform(v.platform)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-teks-sekunder underline-offset-2 hover:underline">
                    {v.url_video}
                  </span>
                  <ExternalLink className="h-3 w-3 shrink-0 text-teks-sekunder" aria-hidden="true" />
                </a>
              ))}
            </div>
          )}
        </GlassCard>
      </FadeInUp>
    </>
  );
}

// ------------------------------------------------------------
// Layar utama: daftar + pencarian + halaman
// ------------------------------------------------------------

export function DatabaseScreen({ onKembali }: { onKembali: () => void }) {
  const [daftar, setDaftar] = useState<DbRingkasPengguna[] | null>(null);
  const [cari, setCari] = useState("");
  const [halaman, setHalaman] = useState(1);
  const [terpilih, setTerpilih] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getDatabasePengguna();
        if (hidup) setDaftar(hasil);
      } catch (e) {
        if (hidup) {
          setDaftar([]);
          toast("error", "Gagal memuat database", e instanceof Error ? e.message : "");
        }
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  const tersaring = (daftar ?? []).filter((u) =>
    u.nama.toLowerCase().includes(cari.trim().toLowerCase()),
  );
  const tampil = tersaring.slice((halaman - 1) * PER_HALAMAN, halaman * PER_HALAMAN);

  return (
    <div className="kolom-aplikasi px-4 pt-5 pb-16">
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => (terpilih ? setTerpilih(null) : onKembali())}
          aria-label="Kembali"
          className="glass btn-tekan flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-teks-utama"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading truncate text-xl font-extrabold tracking-tight text-teks-utama">
            Database Anggota
          </h1>
          <p className="text-xs text-teks-sekunder">
            {terpilih ? "Detail aktivitas" : "Kewajiban, KPI, absen, dan video per orang"}
          </p>
        </div>
        <Database className="h-5 w-5 shrink-0 text-pri" aria-hidden="true" />
      </header>

      {terpilih ? (
        <DetailPengguna id={terpilih} onKembali={() => setTerpilih(null)} />
      ) : (
        <>
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-teks-sekunder" />
            <input
              value={cari}
              onChange={(e) => {
                setCari(e.target.value);
                setHalaman(1);
              }}
              placeholder="Cari nama anggota…"
              aria-label="Cari anggota"
              className="glass-soft h-11 w-full rounded-xl pr-3.5 pl-10 text-sm text-teks-utama outline-none placeholder:text-teks-sekunder/60 focus:ring-2 focus:ring-pri/50"
            />
          </div>

          <div className="mt-3 flex flex-col gap-2">
            {daftar === null ? (
              <GlassSkeleton className="h-40 rounded-2xl" />
            ) : tampil.length === 0 ? (
              <EmptyState
                ikon={Database}
                judul="Tidak ada yang cocok"
                keterangan="Coba kata kunci lain."
              />
            ) : (
              tampil.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setTerpilih(u.id)}
                  className="btn-tekan text-left"
                  aria-label={`Buka detail ${u.nama}`}
                >
                  <GlassCard className="flex items-center gap-3 p-3">
                    {u.avatar_url ? (
                      <FotoBulat src={u.avatar_url} ukuran={40} />
                    ) : (
                      <AvatarInisial nama={u.nama} ukuran={40} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold text-teks-utama">{u.nama}</p>
                      <p className="mt-0.5 truncate text-[10.5px] text-teks-sekunder">
                        {u.struktur || "Tanpa divisi"} · komen {u.komentar_sudah}/
                        {u.komentar_total} · video {u.video}/5
                      </p>
                    </div>
                    <StatusBadge
                      label={u.masuk ? "masuk" : "belum absen"}
                      warna={u.masuk ? "hijau" : "kuning"}
                    />
                  </GlassCard>
                </button>
              ))
            )}
          </div>
          <NavHalaman
            total={tersaring.length}
            perHalaman={PER_HALAMAN}
            halaman={halaman}
            onGanti={setHalaman}
          />
        </>
      )}
    </div>
  );
}

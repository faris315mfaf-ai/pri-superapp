"use client";

// ============================================================
// SeksiKuota (2 Sep 2026) — pantauan KUOTA & PENYIMPANAN di Panel
// Master. Menyatukan angka dari tiga tempat supaya pengelola tak
// perlu membuka tiga dashboard: penyimpanan Supabase per bucket,
// kredit Cloudinary (bandwidth-lah yang menghabiskannya), dan kuota
// profil upload-post. Ditambah lalu-lintas video bulan berjalan.
// ============================================================

import { useEffect, useState } from "react";
import { AlertTriangle, Database, HardDrive, RefreshCw, Video } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { EmptyState, GlassSkeleton, SectionTitle } from "@/components/pri-ui";
import { getKuotaSistem, type KuotaSistem } from "@/services";

/** Byte → "1,2 GB" / "345 MB" (Indonesia: koma desimal). */
function ukuran(byte: number): string {
  if (!Number.isFinite(byte) || byte <= 0) return "0 MB";
  const mb = byte / 1048576;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0).replace(".", ",")} MB`;
  return `${(mb / 1024).toFixed(2).replace(".", ",")} GB`;
}

function Baris({
  label,
  nilai,
  warna,
}: {
  label: string;
  nilai: string;
  warna?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-black/5 py-1.5 first:border-0 dark:border-white/10">
      <span className="min-w-0 truncate text-[12px] text-teks-sekunder">{label}</span>
      <span
        className="angka-tab shrink-0 text-[12.5px] font-bold"
        style={{ color: warna ?? "var(--teks-utama, currentColor)" }}
      >
        {nilai}
      </span>
    </div>
  );
}

/** Bilah persentase sederhana (statis — tanpa animasi, hemat). */
function Bilah({ persen, warna }: { persen: number; warna: string }) {
  const p = Math.max(0, Math.min(100, persen));
  return (
    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-black/8 dark:bg-white/10">
      <div className="h-full rounded-full" style={{ width: `${p}%`, background: warna }} />
    </div>
  );
}

function warnaPersen(p: number): string {
  if (p >= 100) return "#DC2626";
  if (p >= 80) return "#EA580C";
  if (p >= 60) return "#CA8A04";
  return "#16A34A";
}

export function SeksiKuota() {
  const [data, setData] = useState<KuotaSistem | null>(null);
  const [gagal, setGagal] = useState<string | null>(null);
  const [muat, setMuat] = useState(0);

  useEffect(() => {
    let hidup = true;
    // setState hanya di dalam .then/.catch (asinkron) — aturan
    // react-hooks/set-state-in-effect melarang yang sinkron.
    void getKuotaSistem()
      .then((d) => {
        if (!hidup) return;
        setData(d);
        setGagal(null);
      })
      .catch((e) => hidup && setGagal(e instanceof Error ? e.message : "Gagal memuat."));
    return () => {
      hidup = false;
    };
  }, [muat]);

  return (
    <>
      <div className="mt-6 flex items-center justify-between gap-2">
        <SectionTitle judul="Kuota & Penyimpanan" className="!mt-0" />
        <button
          type="button"
          onClick={() => setMuat((n) => n + 1)}
          aria-label="Muat ulang kuota"
          className="glass btn-tekan flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold text-teks-utama"
        >
          <RefreshCw className="h-3 w-3" />
          Segarkan
        </button>
      </div>

      {gagal && !data ? (
        <GlassCard>
          <EmptyState ikon={AlertTriangle} judul="Gagal memuat kuota" keterangan={gagal} />
        </GlassCard>
      ) : !data ? (
        <GlassSkeleton className="h-48 rounded-2xl" />
      ) : (
        <div className="flex flex-col gap-3">
          {/* Penyimpanan Supabase */}
          <GlassCard className="p-4">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-pri" />
              <p className="font-heading text-[13.5px] font-bold text-teks-utama">
                Penyimpanan Supabase
              </p>
              <span className="angka-tab ml-auto text-[13px] font-extrabold text-teks-utama">
                {ukuran(data.penyimpanan.total_byte)}
              </span>
            </div>
            <div className="mt-2">
              {data.penyimpanan.bucket.map((b) => (
                <Baris
                  key={b.nama}
                  label={`${b.nama} · ${b.objek} berkas`}
                  nilai={ukuran(b.byte)}
                />
              ))}
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-teks-sekunder">
              Paket Pro menyediakan ±100 GB penyimpanan & ±250 GB lalu-lintas per bulan.
              Video TVR Saya dihapus otomatis 2 jam setelah tayang, jadi tidak menumpuk.
            </p>
          </GlassCard>

          {/* Lalu-lintas video bulan ini */}
          <GlassCard className="p-4">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-pri" />
              <p className="font-heading text-[13.5px] font-bold text-teks-utama">
                Video Bulan Ini
              </p>
              <span className="angka-tab ml-auto text-[13px] font-extrabold text-teks-utama">
                {data.video_bulan_ini.jumlah} video
              </span>
            </div>
            <div className="mt-2">
              <Baris label="Total ukuran diunggah" nilai={ukuran(data.video_bulan_ini.byte)} />
              <Baris
                label="Perkiraan lalu-lintas keluar"
                nilai={ukuran(data.video_bulan_ini.bandwidth_byte)}
              />
            </div>
            {data.video_bulan_ini.tanpa_ukuran > 0 && (
              <p className="mt-2 text-[10.5px] leading-relaxed text-teks-sekunder">
                {data.video_bulan_ini.tanpa_ukuran} video diunggah sebelum pencatatan ukuran
                aktif — tidak ikut terhitung, jadi angka di atas adalah batas bawah.
              </p>
            )}
          </GlassCard>

          {/* Cloudinary */}
          <GlassCard className="p-4">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-pri" />
              <p className="font-heading text-[13.5px] font-bold text-teks-utama">
                Cloudinary
              </p>
              {data.cloudinary.siap && (
                <span
                  className="angka-tab ml-auto text-[13px] font-extrabold"
                  style={{ color: warnaPersen(data.cloudinary.persen) }}
                >
                  {Math.round(data.cloudinary.persen)}%
                </span>
              )}
            </div>
            {!data.cloudinary.siap ? (
              <p className="mt-1.5 text-[11.5px] text-teks-sekunder">
                Tidak terhubung (kunci belum diatur).
              </p>
            ) : (
              <>
                <Bilah
                  persen={data.cloudinary.persen}
                  warna={warnaPersen(data.cloudinary.persen)}
                />
                <div className="mt-2">
                  <Baris
                    label={`Kredit terpakai (paket ${data.cloudinary.paket})`}
                    nilai={`${data.cloudinary.kredit_pakai.toFixed(1).replace(".", ",")} / ${data.cloudinary.kredit_limit}`}
                    warna={warnaPersen(data.cloudinary.persen)}
                  />
                  <Baris
                    label="— dari lalu-lintas keluar"
                    nilai={`${data.cloudinary.bandwidth_gb.toFixed(1).replace(".", ",")} GB`}
                  />
                  <Baris
                    label="— dari penyimpanan"
                    nilai={`${data.cloudinary.simpan_gb.toFixed(1).replace(".", ",")} GB`}
                  />
                </div>
                {data.cloudinary.persen >= 100 && (
                  <p className="mt-2 rounded-lg bg-red-500/10 px-2.5 py-2 text-[10.5px] leading-relaxed text-red-600 dark:text-red-400">
                    Kuota terlampaui. 1 kredit = 1 GB lalu-lintas — dan lalu-lintas
                    inilah yang menghabiskannya. Jalur video sudah dipindahkan supaya
                    angka ini berhenti bertambah.
                  </p>
                )}
              </>
            )}
          </GlassCard>

          {/* upload-post */}
          <GlassCard className="p-4">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-pri" />
              <p className="font-heading text-[13.5px] font-bold text-teks-utama">
                upload-post (akun sosmed anggota)
              </p>
            </div>
            {!data.uploadpost.siap ? (
              <p className="mt-1.5 text-[11.5px] text-teks-sekunder">
                Tidak terhubung (kunci belum diatur).
              </p>
            ) : (
              <>
                <Bilah
                  persen={(data.uploadpost.profil / Math.max(1, data.uploadpost.limit)) * 100}
                  warna={warnaPersen(
                    (data.uploadpost.profil / Math.max(1, data.uploadpost.limit)) * 100,
                  )}
                />
                <div className="mt-2">
                  <Baris
                    label={`Profil terpakai (paket ${data.uploadpost.paket})`}
                    nilai={`${data.uploadpost.profil} / ${data.uploadpost.limit}`}
                  />
                </div>
              </>
            )}
          </GlassCard>

          <p className="px-1 text-[10.5px] leading-relaxed text-teks-sekunder">
            Penyimpanan video saat ini:{" "}
            <b>{data.r2_aktif ? "Cloudflare R2 (lalu-lintas keluar gratis)" : "Supabase"}</b>.
          </p>
        </div>
      )}
    </>
  );
}

"use client";

// ============================================================
// PanelAbsensiSadar (14 Sep 2026) — tampilan "Absensi SADAR": seluruh
// isinya apa adanya dari SADAR (kode pegawai, jam masuk/pulang, status,
// verifikasi), per tanggal. Anggota melihat barisnya sendiri; HR melihat
// semua orang — termasuk pegawai SADAR yang belum cocok dengan akun mana
// pun, ditandai supaya bisa dipasangkan dari Database Anggota.
// ============================================================

import { useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCcw, ShieldCheck, UserX } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, EmptyState, GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { toast } from "@/hooks/use-app-store";
import { getAbsensiSadar, type BarisSadarTampil, type RingkasanSadar } from "@/services";
import { tanggalIndonesia, tanggalWibHariIni } from "@/lib/format";
import { cn } from "@/lib/utils";

const WARNA_JENIS: Record<BarisSadarTampil["jenis"], "hijau" | "merah" | "kuning" | "biru"> = {
  hadir: "hijau",
  alfa: "merah",
  sakit: "kuning",
  izin: "biru",
};

function geserTanggal(tanggal: string, hari: number): string {
  return new Date(Date.parse(`${tanggal}T00:00:00Z`) + hari * 86_400_000).toISOString().slice(0, 10);
}

export function PanelAbsensiSadar({ semua }: { semua: boolean }) {
  const hariIni = tanggalWibHariIni();
  const [tanggal, setTanggal] = useState(hariIni);
  const [data, setData] = useState<BarisSadarTampil[] | null>(null);
  const [ringkasan, setRingkasan] = useState<RingkasanSadar | null>(null);
  const [galat, setGalat] = useState("");
  const [muatUlang, setMuatUlang] = useState(0);
  const [saring, setSaring] = useState<"semua" | BarisSadarTampil["jenis"] | "belum-cocok">("semua");

  useEffect(() => {
    let hidup = true;
    void (async () => {
      await Promise.resolve();
      if (!hidup) return;
      setData(null);
      try {
        const h = await getAbsensiSadar(tanggal, semua);
        if (!hidup) return;
        setData(h.data);
        setRingkasan(h.ringkasan);
        setGalat(h.galat);
      } catch (e) {
        if (!hidup) return;
        setData([]);
        toast("error", "Gagal memuat data SADAR", e instanceof Error ? e.message : "");
      }
    })();
    return () => {
      hidup = false;
    };
  }, [tanggal, semua, muatUlang]);

  const tampil = (data ?? []).filter((b) =>
    saring === "semua" ? true : saring === "belum-cocok" ? b.user_id === null : b.jenis === saring,
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Pemilih tanggal */}
      <GlassCard className="flex items-center gap-2 p-2.5">
        <button
          type="button"
          onClick={() => setTanggal((t) => geserTanggal(t, -1))}
          aria-label="Hari sebelumnya"
          className="glass btn-tekan flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-teks-utama"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <label className="relative flex min-w-0 flex-1 items-center justify-center gap-1.5 text-[12.5px] font-bold text-teks-utama">
          <CalendarDays className="h-4 w-4 shrink-0 text-pri" aria-hidden="true" />
          <span className="truncate">{tanggalIndonesia(`${tanggal}T00:00:00+07:00`)}</span>
          <input
            type="date"
            value={tanggal}
            max={hariIni}
            onChange={(e) => e.target.value && setTanggal(e.target.value)}
            aria-label="Pilih tanggal"
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <button
          type="button"
          onClick={() => setTanggal((t) => geserTanggal(t, 1))}
          disabled={tanggal >= hariIni}
          aria-label="Hari berikutnya"
          className="glass btn-tekan flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-teks-utama disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setMuatUlang((n) => n + 1)}
          aria-label="Segarkan dari SADAR"
          className="glass btn-tekan flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-pri"
        >
          <RefreshCcw className={cn("h-4 w-4", data === null && "animate-spin")} />
        </button>
      </GlassCard>

      {galat && (
        <p className="rounded-xl bg-gagal/10 px-3 py-2 text-[11px] text-gagal">
          SADAR tidak terjangkau ({galat}) — menampilkan tarikan terakhir.
        </p>
      )}

      {/* Ringkasan + saring (HR) */}
      {semua && ringkasan && (
        <div className="scrollbar-tipis -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {(
            [
              ["semua", `Semua ${ringkasan.jumlah}`],
              ["hadir", `Hadir ${ringkasan.hadir}`],
              ["sakit", `Sakit ${ringkasan.sakit}`],
              ["izin", `Izin ${ringkasan.izin}`],
              ["alfa", `Alfa ${ringkasan.alfa}`],
              ["belum-cocok", `Belum cocok ${ringkasan.tidak_cocok}`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSaring(k)}
              aria-pressed={saring === k}
              className={cn(
                "btn-tekan shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold",
                saring === k ? "bg-pri text-white" : "glass-soft text-teks-sekunder",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Daftar */}
      {data === null ? (
        <div className="flex flex-col gap-2">
          <GlassSkeleton className="h-16 rounded-2xl" />
          <GlassSkeleton className="h-16 rounded-2xl" />
        </div>
      ) : tampil.length === 0 ? (
        <EmptyState
          ikon={ShieldCheck}
          judul="Tidak Ada Data SADAR"
          keterangan={
            semua
              ? "Belum ada catatan SADAR pada tanggal ini."
              : "Belum ada catatan SADAR atas nama Anda pada tanggal ini. Pastikan email akun SADAR sama dengan email SuperApp, atau minta HR memasangkannya."
          }
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          {tampil.map((b) => (
            <GlassCard key={b.kode} className="flex items-center gap-2.5 p-2.5">
              {b.user_id === null ? (
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F59E0B]/15 text-[#F59E0B]"
                  title="Belum cocok dengan akun SuperApp"
                >
                  <UserX className="h-4 w-4" aria-hidden="true" />
                </span>
              ) : b.avatar_url ? (
                <FotoBulat src={b.avatar_url} ukuran={36} />
              ) : (
                <AvatarInisial nama={b.nama_akun || b.nama} ukuran={36} />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-bold text-teks-utama">
                  {b.nama}
                  <span className="ml-1.5 text-[10px] font-semibold text-teks-sekunder">{b.kode}</span>
                </p>
                <p className="truncate text-[10.5px] text-teks-sekunder">
                  {b.jam_masuk ? `Masuk ${b.jam_masuk}` : "Belum masuk"}
                  {b.jam_pulang ? ` · Pulang ${b.jam_pulang}` : ""}
                  {b.label ? ` · ${b.label}` : ""}
                  {b.label_verifikasi ? ` · ${b.label_verifikasi}` : ""}
                </p>
                {semua && b.user_id === null && (
                  <p className="truncate text-[10px] text-[#F59E0B]">
                    Belum cocok — {b.email || "tanpa email"}
                  </p>
                )}
              </div>
              <StatusBadge label={b.jenis} warna={WARNA_JENIS[b.jenis]} />
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}

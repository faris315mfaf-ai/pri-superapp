"use client";

// ============================================================
// PanelJadwalTayang (15 Sep 2026) — daftar video yang MENUNGGU jadwal
// tayang di TV Rakyat Official.
//
// Sebelum ini, menjadwalkan posting membuatnya lenyap dari pandangan:
// datanya tersimpan dan Ayrshare menerbitkannya nanti, tapi tidak ada
// satu layar pun yang menampilkannya. Tim tidak punya cara mengetahui
// apa yang akan tayang malam nanti, apalagi membatalkannya.
// ============================================================

import { useEffect, useState } from "react";
import { CalendarClock, Loader2, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { PlatformIcon } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import { batalkanJadwalPosting, getJadwalPosting, type JadwalPosting } from "@/services";
import { waktuJelasWIB } from "@/lib/format";

export function PanelJadwalTayang() {
  const [data, setData] = useState<JadwalPosting[] | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [muat, setMuat] = useState(0);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const d = await getJadwalPosting();
        if (hidup) setData(d);
      } catch (e) {
        if (!hidup) return;
        setData([]);
        toast("error", "Gagal memuat jadwal", e instanceof Error ? e.message : "");
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muat]);

  async function batalkan(j: JadwalPosting) {
    if (sibuk) return;
    setSibuk(j.id);
    try {
      await batalkanJadwalPosting(j.id);
      toast("sukses", "Jadwal dibatalkan", "Video ini tidak jadi tayang.");
      setMuat((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal membatalkan", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(null);
    }
  }

  // Yang sudah tayang/gagal tidak ditampilkan di sini — riwayatnya ada di
  // Riwayat Video. Panel ini khusus tentang yang BELUM terjadi.
  const menunggu = (data ?? []).filter((j) => j.status === "terjadwal");

  if (data === null) return <GlassSkeleton className="h-24 rounded-2xl" />;
  if (menunggu.length === 0) {
    return (
      <p className="py-3 text-center text-[11.5px] text-teks-sekunder">
        Tidak ada video yang menunggu jadwal tayang.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {menunggu.map((j) => {
        const lewat = Date.parse(j.jadwal_pada) < Date.now();
        return (
          <GlassCard key={j.id} className="p-3">
            <div className="flex items-start gap-2.5">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-white"
                style={{ background: "linear-gradient(135deg, #6366F1, #4338CA)" }}
                aria-hidden="true"
              >
                <CalendarClock className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-teks-utama">
                  {j.judul_youtube || j.caption.slice(0, 60) || "Tanpa judul"}
                </p>
                <p className="mt-0.5 text-[11px] text-teks-sekunder">
                  Tayang {waktuJelasWIB(j.jadwal_pada)}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {j.platforms.map((p) => (
                    <PlatformIcon key={p} platform={p} size={13} />
                  ))}
                  <span className="text-[10px] text-teks-sekunder">· oleh {j.oleh}</span>
                </div>
                {lewat && (
                  // Waktunya lewat tapi statusnya belum berubah: pencocok
                  // berkala menanyakan hasilnya ke Ayrshare tiap 5 menit.
                  <p className="mt-1 text-[10.5px] text-teks-sekunder">
                    Waktunya sudah lewat — hasilnya sedang dipastikan.
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <StatusBadge label="terjadwal" warna="biru" />
                <button
                  type="button"
                  onClick={() => void batalkan(j)}
                  disabled={sibuk === j.id}
                  aria-label={`Batalkan jadwal ${j.judul_youtube || j.id}`}
                  className="glass btn-tekan flex h-7 w-7 items-center justify-center rounded-full text-[#DC2626] disabled:opacity-50"
                >
                  {sibuk === j.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}

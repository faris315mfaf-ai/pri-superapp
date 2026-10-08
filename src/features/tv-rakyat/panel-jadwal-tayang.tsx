"use client";

// ============================================================
// PanelJadwalTayang (15 Sep 2026) — daftar video yang MENUNGGU jadwal
// tayang di TV Rakyat Official.
//
// Sebelum ini, menjadwalkan posting membuatnya lenyap dari pandangan:
// datanya tersimpan dan Ayrshare menerbitkannya nanti, tapi tidak ada
// satu layar pun yang menampilkannya. Tim tidak punya cara mengetahui
// apa yang akan tayang malam nanti, apalagi membatalkannya.
//
// 9 Okt 2026: daftar diurut MENAIK (yang paling dekat tayang paling
// atas) dengan hitung mundur ringkas ("3 jam lagi"), dan panel bisa
// dimuat ulang dari luar lewat peristiwa PERISTIWA_JADWAL_SEGAR — pola
// yang sama dengan segarkanStokTvr() — supaya jadwal yang baru dibuat
// di pratinjau langsung muncul di sini tanpa tutup-buka modul.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Loader2, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { PlatformIcon } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import { batalkanJadwalPosting, getJadwalPosting, type JadwalPosting } from "@/services";

/** Nama peristiwa custom: daftar jadwal perlu dimuat ulang. */
export const PERISTIWA_JADWAL_SEGAR = "pri:jadwal-tayang-segar";

/** Panggil setelah menjadwalkan/membatalkan dari tempat lain (pola segarkanStokTvr). */
export function segarkanJadwalTayang(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PERISTIWA_JADWAL_SEGAR));
  }
}

/**
 * Waktu tayang dalam WIB: "Rab, 9 Okt 14:35 WIB".
 *
 * Sengaja TIDAK memakai waktuJelasWIB() — fungsi itu selalu menambah
 * keterangan lampau ("12 menit lalu", "baru saja") yang justru salah
 * untuk jadwal yang BELUM tiba.
 */
function waktuWibTayang(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "waktu tidak sah";
  const d = new Date(t + 7 * 3600_000);
  const dua = (n: number) => String(n).padStart(2, "0");
  const hari = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"][d.getUTCDay()];
  const bulan = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
  ][d.getUTCMonth()];
  return `${hari}, ${d.getUTCDate()} ${bulan} ${dua(d.getUTCHours())}:${dua(d.getUTCMinutes())} WIB`;
}

/** Hitung mundur ringkas ke suatu jadwal: "5 mnt lagi", "3 jam lagi", "2 hari lagi". */
function hitungMundur(iso: string, kini: number): string {
  const sisa = Date.parse(iso) - kini;
  if (!Number.isFinite(sisa)) return "";
  const mnt = Math.floor(sisa / 60_000);
  if (mnt < 1) return "kurang dari 1 mnt lagi";
  if (mnt < 60) return `${mnt} mnt lagi`;
  const jam = Math.floor(mnt / 60);
  if (jam < 24) return `${jam} jam lagi`;
  return `${Math.floor(jam / 24)} hari lagi`;
}

export function PanelJadwalTayang() {
  const [data, setData] = useState<JadwalPosting[] | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [muat, setMuat] = useState(0);
  // Denyut waktu kini untuk hitung mundur — disegarkan tiap menit selama
  // ada daftar, supaya "3 jam lagi" tidak membeku di layar.
  const [kini, setKini] = useState(() => Date.now());

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

  // Muat ulang saat ada jadwal baru / perubahan dari tempat lain
  // (mis. pratinjau unggah baru saja menjadwalkan posting).
  useEffect(() => {
    const segar = () => setMuat((n) => n + 1);
    window.addEventListener(PERISTIWA_JADWAL_SEGAR, segar);
    return () => window.removeEventListener(PERISTIWA_JADWAL_SEGAR, segar);
  }, []);

  const adaTerjadwal = (data ?? []).some((j) => j.status === "terjadwal");
  useEffect(() => {
    if (!adaTerjadwal) return;
    const id = setInterval(() => setKini(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [adaTerjadwal]);

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
  // Riwayat Video. Panel ini khusus tentang yang BELUM terjadi. Diurut
  // menaik di klien juga, supaya urutannya benar apa pun yang terjadi
  // di server.
  const menunggu = useMemo(
    () =>
      (data ?? [])
        .filter((j) => j.status === "terjadwal")
        .sort((a, b) => Date.parse(a.jadwal_pada) - Date.parse(b.jadwal_pada)),
    [data],
  );

  if (data === null) return <GlassSkeleton className="h-24 rounded-2xl" />;
  if (menunggu.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-teks-sekunder/25 px-4 py-5 text-center">
        <CalendarClock className="h-5 w-5 text-teks-sekunder/60" aria-hidden="true" />
        <p className="text-[11.5px] leading-snug text-teks-sekunder">
          Tidak ada video yang menunggu jadwal tayang.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {menunggu.map((j) => {
        const lewat = Date.parse(j.jadwal_pada) < kini;
        return (
          <GlassCard key={j.id} className="p-3.5">
            <div className="flex items-start gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm"
                style={{
                  background: lewat
                    ? "linear-gradient(135deg, #F59E0B, #D97706)"
                    : "linear-gradient(135deg, #6366F1, #4338CA)",
                }}
                aria-hidden="true"
              >
                <CalendarClock className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[13px] leading-snug font-bold text-teks-utama">
                  {j.judul_youtube || j.caption.slice(0, 60) || "Tanpa judul"}
                </p>
                <p className="mt-1 text-[11px] text-teks-sekunder">
                  Tayang {waktuWibTayang(j.jadwal_pada)}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {j.platforms.map((p) => (
                    <PlatformIcon key={p} platform={p} size={13} />
                  ))}
                  <span className="text-[10px] text-teks-sekunder">· oleh {j.oleh || "—"}</span>
                </div>
                {lewat && (
                  // Waktunya lewat tapi statusnya belum berubah: pencocok
                  // berkala menanyakan hasilnya ke Ayrshare tiap 5 menit.
                  <p className="mt-1.5 text-[10.5px] leading-snug text-amber-600 dark:text-amber-400">
                    Waktunya sudah lewat — hasilnya sedang dipastikan.
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {lewat ? (
                  <StatusBadge label="menunggu hasil" warna="kuning" />
                ) : (
                  <StatusBadge
                    label={hitungMundur(j.jadwal_pada, kini) || "terjadwal"}
                    warna="biru"
                  />
                )}
                <button
                  type="button"
                  onClick={() => void batalkan(j)}
                  disabled={sibuk === j.id}
                  aria-label={`Batalkan jadwal ${j.judul_youtube || j.id}`}
                  title="Batalkan jadwal ini"
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

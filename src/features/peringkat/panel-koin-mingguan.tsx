"use client";

// ============================================================
// Dua mode baru di pop-up leaderboard (12 Sep 2026):
//
//   • PanelKoinTerkaya — pengguna dengan koin terbanyak.
//   • PanelTopMingguan — siapa yang NAIK paling banyak pekan ini
//     (Senin–Minggu) dibanding rentang yang sama pekan lalu. Dua ukuran:
//     laporan video (langsung terisi) dan pengikut (menunggu rekaman
//     harian terkumpul — panel mengatakannya, bukan menampilkan nol).
//
// Keduanya menampilkan posisi PEMBACA sendiri di bawah daftar walau di
// luar 50 besar: orang membuka leaderboard terutama untuk mencari
// dirinya.
// ============================================================

import { useEffect, useState } from "react";
import { AlertTriangle, Coins, TrendingUp } from "lucide-react";
import { AvatarInisial, EmptyState, GlassSkeleton } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { useAppStore } from "@/hooks/use-app-store";
import { formatAngkaRingkas } from "@/lib/format";
import {
  getPeringkatKoin,
  getPeringkatMingguan,
  type PeringkatKoin,
  type PeringkatMingguan,
} from "@/services";
import { cn } from "@/lib/utils";

const WARNA_PODIUM = ["#F59E0B", "#9CA3AF", "#B45309"];

function Nomor({ n }: { n: number }) {
  const warna = WARNA_PODIUM[n - 1];
  return (
    <span
      className={cn(
        "angka-tab flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold",
        warna ? "text-white" : "glass-soft text-teks-sekunder",
      )}
      style={warna ? { background: warna } : undefined}
    >
      {n}
    </span>
  );
}

function Baris({
  peringkat,
  nama,
  avatar_url,
  saya,
  kanan,
  bawah,
}: {
  peringkat: number;
  nama: string;
  avatar_url: string;
  saya: boolean;
  kanan: string;
  bawah?: string;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-2.5 rounded-xl px-2.5 py-2",
        saya ? "bg-pri/10 ring-1 ring-pri/40" : "glass-soft",
      )}
    >
      <Nomor n={peringkat} />
      {avatar_url ? <FotoBulat src={avatar_url} ukuran={30} /> : <AvatarInisial nama={nama} ukuran={30} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-bold text-teks-utama">
          {nama}
          {saya && <span className="ml-1 text-[10px] font-semibold text-pri">(Anda)</span>}
        </span>
        {bawah && <span className="block truncate text-[10.5px] text-teks-sekunder">{bawah}</span>}
      </span>
      <span className="angka-tab shrink-0 text-[13px] font-extrabold text-teks-utama">{kanan}</span>
    </li>
  );
}

export function PanelKoinTerkaya() {
  const idSaya = useAppStore((s) => s.user?.id);
  const [data, setData] = useState<PeringkatKoin | null>(null);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const d = await getPeringkatKoin();
        if (hidup) setData(d);
      } catch (e) {
        if (hidup) setGalat(e instanceof Error ? e.message : "Gagal memuat.");
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  if (galat) return <EmptyState ikon={AlertTriangle} judul="Gagal memuat" keterangan={galat} />;
  if (!data) {
    return (
      <div className="flex flex-col gap-2 pt-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <GlassSkeleton key={i} className="h-12 rounded-xl" />
        ))}
      </div>
    );
  }
  if (data.daftar.length === 0) {
    return <EmptyState ikon={Coins} judul="Belum ada koin" keterangan="Belum ada anggota yang memperoleh koin." />;
  }
  const sayaDiLuar = data.saya && !data.daftar.some((d) => d.user_id === data.saya?.user_id);
  return (
    <div className="pt-2">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] text-teks-sekunder">
        <Coins className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
        {data.jumlah} anggota memiliki koin
      </p>
      <ul className="flex flex-col gap-1.5">
        {data.daftar.map((d) => (
          <Baris
            key={d.user_id}
            peringkat={d.peringkat}
            nama={d.nama}
            avatar_url={d.avatar_url}
            saya={d.user_id === idSaya}
            kanan={`${formatAngkaRingkas(d.saldo)} koin`}
          />
        ))}
        {sayaDiLuar && data.saya && (
          <>
            <li className="py-0.5 text-center text-[10px] text-teks-sekunder">···</li>
            <Baris
              peringkat={data.saya.peringkat}
              nama={data.saya.nama}
              avatar_url={data.saya.avatar_url}
              saya
              kanan={`${formatAngkaRingkas(data.saya.saldo)} koin`}
            />
          </>
        )}
      </ul>
    </div>
  );
}

const UKURAN: { kunci: "laporan" | "pengikut"; label: string }[] = [
  { kunci: "laporan", label: "Laporan Video" },
  { kunci: "pengikut", label: "Pengikut" },
];

function tanda(n: number): string {
  return n > 0 ? `+${formatAngkaRingkas(n)}` : n < 0 ? `−${formatAngkaRingkas(Math.abs(n))}` : "0";
}

export function PanelTopMingguan() {
  const idSaya = useAppStore((s) => s.user?.id);
  const [metrik, setMetrik] = useState<"laporan" | "pengikut">("laporan");
  const [data, setData] = useState<PeringkatMingguan | null>(null);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    let hidup = true;
    void (async () => {
      setData(null);
      setGalat("");
      try {
        const d = await getPeringkatMingguan(metrik);
        if (hidup) setData(d);
      } catch (e) {
        if (hidup) setGalat(e instanceof Error ? e.message : "Gagal memuat.");
      }
    })();
    return () => {
      hidup = false;
    };
  }, [metrik]);

  const sayaDiLuar = data?.saya && !data.daftar.some((d) => d.user_id === data.saya?.user_id);

  return (
    <div className="pt-2">
      <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/10">
        {UKURAN.map((u) => (
          <button
            key={u.kunci}
            type="button"
            onClick={() => setMetrik(u.kunci)}
            aria-pressed={metrik === u.kunci}
            className={cn(
              "btn-tekan rounded-lg py-1.5 text-[11.5px] font-bold",
              metrik === u.kunci ? "bg-white text-teks-utama shadow-sm dark:bg-white/15" : "text-teks-sekunder",
            )}
          >
            {u.label}
          </button>
        ))}
      </div>

      {galat ? (
        <EmptyState ikon={AlertTriangle} judul="Gagal memuat" keterangan={galat} />
      ) : !data ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <GlassSkeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <p className="mb-2 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-teks-sekunder">
            <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
            <span>
              Pekan ini (hari ke-{data.jendela.hari_ke}) dibanding rentang yang sama pekan lalu. {data.catatan}
            </span>
          </p>
          {!data.tersedia || data.daftar.length === 0 ? (
            <EmptyState
              ikon={TrendingUp}
              judul={data.tersedia ? "Belum ada kenaikan" : "Belum ada data"}
              keterangan={
                data.tersedia
                  ? "Belum ada yang mencatat kenaikan pekan ini."
                  : "Angkanya mulai terisi setelah rekaman harian berjalan."
              }
            />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {data.daftar.map((d) => (
                <Baris
                  key={d.user_id}
                  peringkat={d.peringkat}
                  nama={d.nama}
                  avatar_url={d.avatar_url}
                  saya={d.user_id === idSaya}
                  kanan={tanda(d.naik)}
                  bawah={`${formatAngkaRingkas(d.ini)} pekan ini · ${formatAngkaRingkas(d.lalu)} pekan lalu`}
                />
              ))}
              {sayaDiLuar && data.saya && (
                <>
                  <li className="py-0.5 text-center text-[10px] text-teks-sekunder">···</li>
                  <Baris
                    peringkat={data.saya.peringkat}
                    nama={data.saya.nama}
                    avatar_url={data.saya.avatar_url}
                    saya
                    kanan={tanda(data.saya.naik)}
                    bawah={`${formatAngkaRingkas(data.saya.ini)} pekan ini · ${formatAngkaRingkas(data.saya.lalu)} pekan lalu`}
                  />
                </>
              )}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

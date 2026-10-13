"use client";

// ============================================================
// AntreanAccNyata (13 Okt 2026) — Antrean ACC dengan DATA SUNGGUHAN dari server.
//
// Video hasil bot yang menunggu keputusan master. Tiap kartu: pratinjau video
// (diambil saat ditekan, bukan otomatis), hasil pemeriksaan otomatis, caption yang
// bisa disunting, lalu Setujui / Minta edit ulang / Tolak.
//
// "Setujui & jadwalkan" = langsung memposting (dijadwalkan beberapa menit ke depan),
// dan postingan yang sudah tayang tidak bisa ditarik, jadi dikonfirmasi di halaman:
// klik pertama mengubah tombol, klik kedua baru mengirim. Posting nyata hanya jalan bila
// server mengaktifkannya (BOT_POSTING_AKTIF) — bila mati, layar mengatakannya dengan jelas.
// Anti-balapan: satu aksi berjalan sekaligus; muatan bernomor; unmount aman.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Play } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import { useSegarOtomatis } from "@/hooks/use-segar-otomatis";
import { ambilVideoAcc, getStatusAcc, kirimAksiAcc } from "@/services";
import type { ItemAccApi, RiwayatAccApi, StatusAcc, TandaPemeriksaan } from "@/lib/bot-posting-murni";
import { waktuRelatif } from "./peta-nyata";
import { cn } from "@/lib/utils";

const KELAS_TANDA: Record<TandaPemeriksaan["jenis"], string> = {
  ok: "bg-sukses/15 text-emerald-700 dark:text-emerald-400",
  warn: "bg-emas/20 text-amber-700 dark:text-amber-300",
  bad: "bg-gagal/15 text-red-700 dark:text-red-400",
};
const SR_TANDA: Record<TandaPemeriksaan["jenis"], string> = { ok: "Baik: ", warn: "Perhatian: ", bad: "Masalah: " };
const KELAS_TOMBOL = "btn-tekan min-h-11 rounded-xl border px-3.5 py-2 text-[13px] font-bold sm:min-h-10 disabled:opacity-50";

const jamWib = (iso: string): string => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t + 7 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} WIB`;
};

function Pratinjau({ item }: { item: ItemAccApi }) {
  const [url, setUrl] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);
  const urlRef = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );
  const muat = async () => {
    if (memuat) return;
    setMemuat(true);
    try {
      const u = await ambilVideoAcc(item.id);
      urlRef.current = u;
      setUrl(u);
    } catch (e) {
      toast("error", "Pratinjau gagal dimuat", e instanceof Error ? e.message : "");
    } finally {
      setMemuat(false);
    }
  };
  return (
    <div
      className="relative aspect-[9/16] w-[132px] max-w-full overflow-hidden rounded-[10px] border border-glass-border bg-black"
      aria-label={`Pratinjau video ${item.judul}`}
    >
      {url ? (
        <video src={url} controls playsInline className="h-full w-full object-contain" />
      ) : (
        <button
          type="button"
          onClick={() => void muat()}
          disabled={!item.stok_ada || memuat}
          className="btn-tekan flex h-full w-full flex-col items-center justify-center gap-1.5 text-[11px] font-bold text-white disabled:opacity-50"
        >
          {memuat ? <Loader2 className="h-6 w-6 animate-spin" /> : <Play className="h-6 w-6" />}
          {item.stok_ada ? "Putar pratinjau" : "Video tidak ada"}
        </button>
      )}
      <span className="pointer-events-none absolute left-2 top-2 rounded-[3px] bg-[#c2413b] px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.08em] text-white">{item.kategori}</span>
    </div>
  );
}

function Kartu({
  item,
  sibuk,
  konfirmasi,
  onKonfirmasi,
  onAksi,
}: {
  item: ItemAccApi;
  sibuk: string | null;
  konfirmasi: boolean;
  onKonfirmasi: (v: boolean) => void;
  onAksi: (aksi: "setuju" | "ulang" | "tolak", caption: string) => void;
}) {
  const [caption, setCaption] = useState(item.caption);
  const idCaption = `acc-nyata-caption-${item.id}`;
  const sibukIni = sibuk?.endsWith(`:${item.id}`) ?? false;
  const adaMasalah = item.tanda.some((t) => t.jenis === "bad");
  const ulangiSetuju = item.tahap === "disetujui";
  return (
    <GlassCard className="grid gap-3.5 p-3 sm:grid-cols-[132px_minmax(0,1fr)] sm:p-3.5">
      <Pratinjau item={item} />
      <div className="min-w-0">
        <h3 className="m-0 mb-1 break-words font-heading text-[15px] font-bold leading-snug text-teks-utama">{item.judul}</h3>
        {item.hook && <p className="m-0 mb-1 break-words text-[11.5px] font-semibold text-amber-700 dark:text-amber-300">{item.hook}</p>}
        <p className="m-0 text-xs leading-relaxed text-teks-sekunder">
          Disiapkan <b className="text-teks-utama">{item.bot_nama}</b> · sumber {item.sumber_label || "—"} · tayang di{" "}
          <b className="text-teks-utama">{item.platform_label || "—"}</b> · {jamWib(item.jadwal_iso)}
          {item.durasi_detik != null ? ` · ${Math.round(item.durasi_detik)} dtk` : ""}
        </p>
        <ul className="m-0 my-2 flex list-none flex-wrap gap-1.5 p-0" aria-label="Hasil pemeriksaan otomatis">
          {item.tanda.map((t, i) => (
            <li key={`${t.teks}-${i}`}>
              <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", KELAS_TANDA[t.jenis])}>
                <span className="sr-only">{SR_TANDA[t.jenis]}</span>
                {t.teks}
              </span>
            </li>
          ))}
        </ul>
        <label htmlFor={idCaption} className="mb-1 block text-xs text-teks-sekunder">
          Caption (bisa disunting)
        </label>
        <textarea
          id={idCaption}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={4}
          disabled={sibukIni}
          className="glass-input min-h-[78px] w-full resize-y rounded-xl px-3 py-2 text-base text-teks-utama sm:text-[12.5px]"
        />
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!sibuk}
            onClick={() => (konfirmasi ? onAksi("setuju", caption) : onKonfirmasi(true))}
            className={cn(
              KELAS_TOMBOL,
              konfirmasi ? "border-transparent bg-sukses text-white" : "border-sukses/50 bg-sukses/10 text-emerald-700 dark:text-emerald-300",
            )}
          >
            {sibuk === `setuju:${item.id}` ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-4 w-4 animate-spin" /> Memposting…
              </span>
            ) : konfirmasi ? (
              `Yakin? Tayang di ${item.platform_label} · ${jamWib(item.jadwal_iso)}`
            ) : ulangiSetuju ? (
              "Coba posting lagi"
            ) : (
              "Setujui & jadwalkan"
            )}
          </button>
          {konfirmasi ? (
            <button type="button" disabled={!!sibuk} onClick={() => onKonfirmasi(false)} className={cn(KELAS_TOMBOL, "border-glass-border text-teks-utama")}>
              Batal
            </button>
          ) : (
            <>
              <button type="button" disabled={!!sibuk} onClick={() => onAksi("ulang", caption)} className={cn(KELAS_TOMBOL, "border-glass-border text-teks-utama")}>
                {sibuk === `ulang:${item.id}` ? "…" : "Minta edit ulang"}
              </button>
              <button type="button" disabled={!!sibuk} onClick={() => onAksi("tolak", caption)} className={cn(KELAS_TOMBOL, "border-gagal/50 text-red-600 hover:bg-gagal/10 dark:text-red-400")}>
                {sibuk === `tolak:${item.id}` ? "…" : "Tolak"}
              </button>
            </>
          )}
        </div>
        {konfirmasi && (
          <p role="status" className="m-0 mt-2 text-xs text-teks-sekunder">
            Video yang sudah tayang tidak bisa ditarik. Tekan tombol hijau sekali lagi untuk memposting, atau Batal.
            {adaMasalah ? " Ada tanda merah di atas — pastikan sudah Anda periksa." : ""}
          </p>
        )}
      </div>
    </GlassCard>
  );
}

function BarisRiwayat({ r, sibuk, onBatal }: { r: RiwayatAccApi; sibuk: string | null; onBatal: (id: number) => void }) {
  const [yakin, setYakin] = useState(false);
  const label = { setuju: "Disetujui", ulang: "Edit ulang", tolak: "Ditolak", batal: "Jadwal dibatalkan" }[r.keputusan];
  return (
    <li className="glass flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-bold text-teks-utama">{r.judul}</span>
        <span className="block truncate text-[10.5px] text-teks-sekunder">
          {r.bot_nama} · {label}
          {r.catatan ? ` · ${r.catatan}` : ""}
          {r.jadwal_iso && r.tahap === "selesai" ? ` · tayang ${jamWib(r.jadwal_iso)}` : ""}
          {r.keputusan_pada ? ` · ${waktuRelatif(r.keputusan_pada)}` : ""}
        </span>
        {r.perlu_diperiksa && <span className="block text-[10.5px] font-bold text-red-600 dark:text-red-400">Periksa akun sosmed bot sebelum mengulang.</span>}
      </span>
      {r.bisa_batal &&
        (yakin ? (
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={!!sibuk}
              onClick={() => {
                setYakin(false);
                onBatal(r.tugas_id);
              }}
              className="btn-tekan rounded-full bg-gagal/15 px-3 py-1.5 text-[11px] font-bold text-gagal"
            >
              {sibuk === `batalkan_jadwal:${r.tugas_id}` ? "…" : "Ya, batalkan"}
            </button>
            <button type="button" onClick={() => setYakin(false)} className="btn-tekan text-[11px] font-bold text-teks-sekunder">
              Tidak
            </button>
          </span>
        ) : (
          <button type="button" disabled={!!sibuk} onClick={() => setYakin(true)} className="btn-tekan rounded-full px-3 py-1.5 text-[11px] font-bold text-red-600 dark:text-red-400">
            Batalkan jadwal
          </button>
        ))}
    </li>
  );
}

export function AntreanAccNyata() {
  const [status, setStatus] = useState<StatusAcc | null>(null);
  const [galat, setGalat] = useState("");
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [konfirmasiId, setKonfirmasiId] = useState<number | null>(null);
  const nomor = useRef(0);
  const sibukRef = useRef<string | null>(null);
  const hidup = useRef(true);

  const muat = useCallback(async () => {
    const ini = ++nomor.current;
    try {
      const d = await getStatusAcc();
      // Hasil basi, atau tiba saat aksi berjalan, dibuang agar tidak menimpa keadaan terbaru.
      if (ini !== nomor.current || !hidup.current || sibukRef.current) return;
      setStatus(d);
      setGalat("");
    } catch (e) {
      if (ini !== nomor.current || !hidup.current) return;
      setGalat(e instanceof Error ? e.message : "Gagal memuat antrean.");
    }
  }, []);

  useEffect(() => {
    hidup.current = true;
    return () => {
      hidup.current = false;
    };
  }, []);
  // Muatan awal (ditunda satu tick: tanpa setState sinkron di effect).
  useEffect(() => {
    void Promise.resolve().then(muat);
  }, [muat]);
  useSegarOtomatis(() => void muat(), 30);

  const jalankan = useCallback(
    async (kunci: string, tugasId: number, aksi: "setuju" | "ulang" | "tolak" | "batalkan_jadwal", caption: string) => {
      if (sibukRef.current) return;
      sibukRef.current = kunci;
      setSibuk(kunci);
      setKonfirmasiId(null);
      try {
        const r = await kirimAksiAcc(aksi === "setuju" ? { aksi, tugas_id: tugasId, caption } : { aksi, tugas_id: tugasId });
        toast(r.sukses ? "sukses" : "peringatan", { setuju: "Disetujui", ulang: "Edit ulang diminta", tolak: "Ditolak", batalkan_jadwal: "Jadwal dibatalkan" }[aksi], r.pesan);
      } catch (e) {
        toast("error", "Aksi gagal", e instanceof Error ? e.message : "");
      } finally {
        sibukRef.current = null;
        if (hidup.current) setSibuk(null);
        void muat();
      }
    },
    [muat],
  );

  if (status === null) {
    return galat ? (
      <GlassCard className="p-6 text-center text-sm text-teks-sekunder">Antrean ACC gagal dimuat: {galat}</GlassCard>
    ) : (
      <GlassSkeleton className="h-40 rounded-2xl" />
    );
  }
  if (!status.tabel_ada) {
    return <GlassCard className="p-6 text-center text-sm text-teks-sekunder">Migrasi posting bot (sql/70) belum dijalankan.</GlassCard>;
  }

  return (
    <div className="space-y-3.5">
      {!status.posting_aktif && (
        <p role="status" className="m-0 rounded-xl bg-amber-500/10 px-3 py-2 text-[11.5px] leading-relaxed text-amber-700 dark:text-amber-300">
          Posting nyata <b>belum diaktifkan</b> di server (BOT_POSTING_AKTIF). Anda bisa meninjau video, menolak, atau meminta edit ulang, tetapi tombol
          Setujui akan ditolak sampai posting diaktifkan.
        </p>
      )}
      {galat && <p className="m-0 text-xs text-red-600 dark:text-red-400">Pembaruan terakhir gagal: {galat}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 font-heading text-[11px] font-bold uppercase tracking-[0.08em] text-teks-sekunder">Menunggu keputusan Pimred</h2>
        <span className="text-xs text-teks-sekunder" aria-live="polite">
          {status.antrean.length > 0 ? `${status.antrean.length} video menunggu` : ""}
        </span>
      </div>

      {status.antrean.length === 0 ? (
        <GlassCard className="p-6 text-center text-sm text-teks-sekunder">Tidak ada video yang menunggu. Hasil bot akan muncul di sini begitu selesai dirender.</GlassCard>
      ) : (
        <div className="grid gap-3">
          {status.antrean.map((item) => (
            <Kartu
              key={`${item.id}:${item.tahap}`}
              item={item}
              sibuk={sibuk}
              konfirmasi={konfirmasiId === item.id}
              onKonfirmasi={(v) => setKonfirmasiId((id) => (v ? item.id : id === item.id ? null : id))}
              onAksi={(aksi, caption) => void jalankan(`${aksi}:${item.id}`, item.id, aksi, caption)}
            />
          ))}
        </div>
      )}

      {status.riwayat.length > 0 && (
        <>
          <h2 className="m-0 mt-2 font-heading text-[11px] font-bold uppercase tracking-[0.08em] text-teks-sekunder">Keputusan terakhir</h2>
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {status.riwayat.map((r) => (
              <BarisRiwayat key={`${r.tugas_id}:${r.keputusan}`} r={r} sibuk={sibuk} onBatal={(id) => void jalankan(`batalkan_jadwal:${id}`, id, "batalkan_jadwal", "")} />
            ))}
          </ul>
          <p className="m-0 text-[10.5px] leading-relaxed text-teks-sekunder">
            Membatalkan jadwal = menghapus berkas video sebelum jam tayang. Bila penyedia sudah mengunduhnya, postingan tetap tayang.
          </p>
        </>
      )}
    </div>
  );
}

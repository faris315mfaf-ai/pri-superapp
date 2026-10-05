"use client";

// ============================================================
// Kelola Koin (5 Okt 2026) — Pimpinan Redaksi, superadmin, master.
//
// Cari anggota → lihat saldo & video yang diunggahnya (upload TVR Saya,
// laporan link video, upload ke TV Official) → beri koin per video (pilihan
// cepat atau jumlah bebas; satu video satu kali). Reset koin satu anggota,
// atau semua anggota sekaligus dengan konfirmasi ketik "RESET".
// ============================================================

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Check, ExternalLink, Loader2, RotateCcw, Search, Settings2, X } from "lucide-react";
import { toast } from "@/hooks/use-app-store";
import {
  beriKoinVideo,
  cariAnggotaKoin,
  getKoinAnggota,
  resetKoinAnggota,
  resetKoinSemua,
  type AnggotaKoin,
  type VideoKoin,
} from "@/services";
import { teksAngkaKoin } from "@/lib/koin-chat";
import { cn } from "@/lib/utils";

const PILIHAN = [5, 10, 25, 50, 100] as const;

const tanggalPendek = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

const pesan = (e: unknown, cadangan: string) => (e instanceof Error && e.message ? e.message : cadangan);

export function KelolaKoin({ onTutup }: { onTutup: () => void }) {
  const [pilih, setPilih] = useState<AnggotaKoin | null>(null);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Kelola koin">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onTutup} />
      <div className="glass relative flex h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl sm:h-[80dvh] sm:rounded-3xl">
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          {pilih ? (
            <button
              type="button"
              onClick={() => setPilih(null)}
              aria-label="Kembali ke daftar anggota"
              className="glass btn-tekan flex h-9 w-9 items-center justify-center rounded-xl text-teks-utama"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <Settings2 className="h-5 w-5 text-sky-500" aria-hidden="true" />
          )}
          <p className="min-w-0 flex-1 truncate font-heading text-[15px] font-extrabold text-teks-utama">
            {pilih ? pilih.nama : "Kelola Koin"}
          </p>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            className="glass btn-tekan flex h-9 w-9 items-center justify-center rounded-xl text-teks-utama"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="scrollbar-tipis flex-1 overflow-y-auto px-4 pb-4">
          {pilih ? <DetailAnggota anggota={pilih} /> : <DaftarAnggota onPilih={setPilih} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---- Daftar & cari anggota ---------------------------------------------------

function DaftarAnggota({ onPilih }: { onPilih: (a: AnggotaKoin) => void }) {
  const [q, setQ] = useState("");
  const [hasil, setHasil] = useState<AnggotaKoin[] | null>(null);
  const [galat, setGalat] = useState("");
  const [versi, setVersi] = useState(0);

  useEffect(() => {
    let hidup = true;
    const t = window.setTimeout(() => {
      cariAnggotaKoin(q.trim())
        .then((d) => {
          if (!hidup) return;
          setHasil(d);
          setGalat("");
        })
        .catch((e) => hidup && setGalat(pesan(e, "Daftar anggota gagal dimuat.")));
    }, 300);
    return () => {
      hidup = false;
      window.clearTimeout(t);
    };
  }, [q, versi]);

  return (
    <>
      <label className="glass mt-1 flex items-center gap-2 rounded-xl px-3">
        <Search className="h-4 w-4 shrink-0 text-teks-sekunder" aria-hidden="true" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama anggota…"
          aria-label="Cari nama anggota"
          className="h-10 min-w-0 flex-1 bg-transparent text-[13px] text-teks-utama outline-none placeholder:text-teks-sekunder"
        />
      </label>

      {galat && (
        <p className="mt-3 rounded-xl border border-gagal/30 bg-gagal/10 p-2.5 text-[11.5px] text-teks-utama" role="alert">
          {galat}
        </p>
      )}
      {hasil === null && !galat ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-teks-sekunder" />
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {(hasil ?? []).map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onPilih(a)}
                className="glass-soft btn-tekan flex w-full items-center gap-3 rounded-xl p-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-teks-utama">{a.nama}</p>
                  {a.jabatan && <p className="truncate text-[10.5px] text-teks-sekunder">{a.jabatan}</p>}
                </div>
                <span className="flex shrink-0 items-center gap-1 text-[12.5px] font-extrabold text-teks-utama">
                  <img src="/KMP.svg" alt="" aria-hidden="true" className="h-4 w-4" />
                  <span className="angka-tab">{teksAngkaKoin(a.saldo ?? 0)}</span>
                </span>
              </button>
            </li>
          ))}
          {hasil?.length === 0 && <p className="text-[12px] text-teks-sekunder">Tidak ada anggota dengan nama itu.</p>}
        </ul>
      )}

      <ResetSemua onSelesai={() => setVersi((v) => v + 1)} />
    </>
  );
}

function ResetSemua({ onSelesai }: { onSelesai: () => void }) {
  const [buka, setBuka] = useState(false);
  const [ketik, setKetik] = useState("");
  const [sibuk, setSibuk] = useState(false);

  async function jalankan() {
    if (ketik !== "RESET" || sibuk) return;
    setSibuk(true);
    try {
      const r = await resetKoinSemua();
      toast("sukses", "Koin semua anggota direset", `${r.jumlah_orang} saldo dinolkan. Riwayatnya tetap tercatat.`);
      setBuka(false);
      setKetik("");
      onSelesai();
    } catch (e) {
      toast("error", "Reset gagal", pesan(e, "Coba lagi."));
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-gagal/30 bg-gagal/5 p-3">
      <p className="text-[12.5px] font-bold text-teks-utama">Reset koin semua anggota</p>
      <p className="mt-0.5 text-[10.5px] leading-snug text-teks-sekunder">
        Semua saldo menjadi 0. Riwayat tidak dihapus — dicatat sebagai &ldquo;Koin direset&rdquo;.
      </p>
      {buka ? (
        <div className="mt-2 flex gap-2">
          <input
            value={ketik}
            onChange={(e) => setKetik(e.target.value.toUpperCase())}
            placeholder='Ketik "RESET"'
            aria-label='Ketik RESET untuk mengonfirmasi'
            className="glass h-9 min-w-0 flex-1 rounded-lg px-3 text-[12.5px] font-bold text-teks-utama outline-none"
          />
          <button
            type="button"
            onClick={() => void jalankan()}
            disabled={ketik !== "RESET" || sibuk}
            className="btn-tekan flex items-center gap-1 rounded-lg bg-gagal px-3 text-[12px] font-bold text-white disabled:opacity-40"
          >
            {sibuk ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Reset
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setBuka(true)}
          className="btn-tekan mt-2 rounded-lg px-3 py-1.5 text-[11.5px] font-bold text-gagal ring-1 ring-gagal/40"
        >
          Reset semua…
        </button>
      )}
    </div>
  );
}

// ---- Detail anggota: saldo, reset, video ---------------------------------------

function DetailAnggota({ anggota }: { anggota: AnggotaKoin }) {
  const [saldo, setSaldo] = useState<number | null>(null);
  const [video, setVideo] = useState<VideoKoin[] | null>(null);
  const [galat, setGalat] = useState("");
  const [buka, setBuka] = useState<string | null>(null);
  const [mereset, setMereset] = useState(false);
  const [yakinReset, setYakinReset] = useState(false);

  useEffect(() => {
    let hidup = true;
    getKoinAnggota(anggota.id)
      .then((d) => {
        if (!hidup) return;
        setSaldo(d.saldo);
        setVideo(d.video);
      })
      .catch((e) => hidup && setGalat(pesan(e, "Data anggota gagal dimuat.")));
    return () => {
      hidup = false;
    };
  }, [anggota.id]);

  async function reset() {
    if (mereset) return;
    setMereset(true);
    try {
      const r = await resetKoinAnggota(anggota.id);
      setSaldo(r.saldo);
      setYakinReset(false);
      toast("sukses", "Koin direset", `${teksAngkaKoin(r.saldo_sebelum)} koin milik ${anggota.nama} dinolkan.`);
    } catch (e) {
      toast("error", "Reset gagal", pesan(e, "Coba lagi."));
    } finally {
      setMereset(false);
    }
  }

  const kunci = (v: VideoKoin) => `${v.sumber}-${v.id}`;

  return (
    <>
      <div className="glass-soft mt-1 flex items-center gap-3 rounded-2xl p-3">
        <img src="/KMP.svg" alt="" aria-hidden="true" className="h-8 w-8" />
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] text-teks-sekunder">Saldo koin</p>
          <p className="angka-tab font-heading text-[20px] leading-tight font-extrabold text-teks-utama">
            {saldo === null ? "…" : teksAngkaKoin(saldo)}
          </p>
        </div>
        {yakinReset ? (
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              onClick={() => setYakinReset(false)}
              className="glass btn-tekan rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-teks-utama"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => void reset()}
              disabled={mereset}
              className="btn-tekan flex items-center gap-1 rounded-lg bg-gagal px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
            >
              {mereset && <Loader2 className="h-3 w-3 animate-spin" />}
              Ya, reset
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setYakinReset(true)}
            disabled={!saldo}
            className="btn-tekan flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-gagal ring-1 ring-gagal/40 disabled:opacity-40"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        )}
      </div>

      <p className="mt-4 text-[13px] font-bold text-teks-utama">Video yang diunggah</p>
      <p className="mt-0.5 text-[10.5px] text-teks-sekunder">Satu video hanya bisa diberi koin satu kali.</p>

      {galat && (
        <p className="mt-3 rounded-xl border border-gagal/30 bg-gagal/10 p-2.5 text-[11.5px] text-teks-utama" role="alert">
          {galat}
        </p>
      )}
      {video === null && !galat ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-teks-sekunder" />
        </div>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {(video ?? []).map((v) => (
            <li key={kunci(v)} className="glass-soft rounded-xl p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[12.5px] font-bold text-teks-utama">{v.judul}</p>
                  <p className="mt-0.5 text-[10.5px] text-teks-sekunder">
                    {v.sumber_label} · {tanggalPendek(v.tanggal)}
                    {v.platform.length > 0 ? ` · ${v.platform.join(", ")}` : ""}
                  </p>
                  {v.url && (
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-semibold text-sky-600 dark:text-sky-400"
                    >
                      <ExternalLink className="h-3 w-3" /> Buka video
                    </a>
                  )}
                </div>
                {v.koin !== null ? (
                  <span className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500/15 px-2 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3 w-3" /> {teksAngkaKoin(v.koin)} koin
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setBuka((b) => (b === kunci(v) ? null : kunci(v)))}
                    aria-expanded={buka === kunci(v)}
                    className="btn-tekan flex shrink-0 items-center gap-1 rounded-lg bg-sky-500/15 px-2.5 py-1.5 text-[11px] font-bold text-sky-600 dark:text-sky-300"
                  >
                    <img src="/KMP.svg" alt="" aria-hidden="true" className="h-3.5 w-3.5" />
                    Beri koin
                  </button>
                )}
              </div>
              {buka === kunci(v) && v.koin === null && (
                <PemberiKoin
                  anggota={anggota}
                  video={v}
                  onSelesai={(d) => {
                    setSaldo(d.saldo);
                    setVideo(d.video);
                    setBuka(null);
                  }}
                />
              )}
            </li>
          ))}
          {video?.length === 0 && (
            <p className="glass-soft rounded-xl p-3 text-[12px] text-teks-sekunder">Anggota ini belum mengunggah video.</p>
          )}
        </ul>
      )}
    </>
  );
}

function PemberiKoin({
  anggota,
  video,
  onSelesai,
}: {
  anggota: AnggotaKoin;
  video: VideoKoin;
  onSelesai: (d: { saldo: number; video: VideoKoin[] }) => void;
}) {
  const [jumlah, setJumlah] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const n = Math.floor(Number(jumlah));
  const sah = Number.isFinite(n) && n >= 1 && n <= 100_000;

  async function kirim() {
    if (!sah || sibuk) return;
    setSibuk(true);
    try {
      const d = await beriKoinVideo(anggota.id, video, n);
      toast("sukses", "Koin terkirim", `${teksAngkaKoin(n)} koin untuk ${anggota.nama}.`);
      onSelesai(d);
    } catch (e) {
      toast("error", "Koin gagal diberikan", pesan(e, "Coba lagi."));
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className="mt-2.5 border-t border-black/5 pt-2.5 dark:border-white/10">
      <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Pilihan cepat jumlah koin">
        {PILIHAN.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setJumlah(String(p))}
            aria-pressed={n === p}
            className={cn(
              "btn-tekan rounded-lg py-1.5 text-[11.5px] font-bold",
              n === p ? "bg-sky-500 text-white" : "glass text-teks-utama",
            )}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={100000}
          value={jumlah}
          onChange={(e) => setJumlah(e.target.value)}
          placeholder="Jumlah lain"
          aria-label="Jumlah koin"
          className="glass angka-tab h-10 min-w-0 flex-1 rounded-lg px-3 text-[13px] font-bold text-teks-utama outline-none"
        />
        <button
          type="button"
          onClick={() => void kirim()}
          disabled={!sah || sibuk}
          className="btn-tekan flex items-center gap-1.5 rounded-lg px-4 text-[12.5px] font-bold text-white disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, #00AED6, #0284C7)" }}
        >
          {sibuk ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Beri {sah ? teksAngkaKoin(n) : ""}
        </button>
      </div>
    </div>
  );
}

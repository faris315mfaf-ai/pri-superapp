"use client";

// ============================================================
// STUDIO TEMPLATE — VIDEO PRATINJAU (16 Okt 2026). Template draf dirender
// mesin (perender yang sama dengan video sungguhan) dari video contoh atau
// video Stok, ±15 detik + outro. Hasilnya diputar di sini sebelum disimpan.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Play, X } from "lucide-react";
import { bacaJson, pesanGalat } from "@/features/auto-edit/api";
import { useApiAutoEdit } from "@/features/auto-edit/tim";
import { rentangTampil, type DokStudio } from "@/mesin-video/studio-model";
import { cn } from "@/lib/utils";
import { PRATINJAU_AKTIF, type RingkasPratinjau } from "./studio-tipe";
import { fmtDetik, namaElemen } from "./studio-murni";

type ItemStok = { id: string; judul: string; durasi: number | null };

type Props = {
  dok: DokStudio;
  awal: RingkasPratinjau | null;
  onTutup: (terakhir: RingkasPratinjau | null) => void;
  onSimpan: () => void;
  menyimpan: boolean;
};

const DURASI_PRATINJAU = 15;

export function PratinjauStudio({ dok, awal, onTutup, onSimpan, menyimpan }: Props) {
  const api = useApiAutoEdit();
  const [sumber, setSumber] = useState<string>("contoh:tegak");
  const [stok, setStok] = useState<ItemStok[]>([]);
  const [pr, setPr] = useState<RingkasPratinjau | null>(awal);
  const [mengirim, setMengirim] = useState(false);
  const [pesan, setPesan] = useState("");
  const [video, setVideo] = useState<{ id: string; url: string } | null>(null);
  const [dokDibuat, setDokDibuat] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const aktif = pr !== null && PRATINJAU_AKTIF.includes(pr.status);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const res = await api.fetch("/api/tvr/stok", { cache: "no-store" });
        const d = await bacaJson(res);
        if (hidup && res.ok) setStok(((d.stok as ItemStok[]) ?? []).slice(0, 12));
      } catch {
        // daftar stok hanya pilihan tambahan
      }
    })();
    return () => {
      hidup = false;
    };
  }, [api]);

  // Pantau selama dirender.
  useEffect(() => {
    if (!aktif) return;
    let sedang = false;
    const t = window.setInterval(async () => {
      if (sedang) return;
      sedang = true;
      try {
        const res = await api.fetch("/api/tvr/studio/pratinjau", { cache: "no-store" });
        const d = await bacaJson(res);
        if (res.ok) setPr((d.pratinjau as RingkasPratinjau | null) ?? null);
      } catch {
        // dicoba lagi
      } finally {
        sedang = false;
      }
    }, 2000);
    return () => window.clearInterval(t);
  }, [aktif, api]);

  // Hasil siap -> ambil videonya (butuh token -> blob).
  const idSiap = pr && pr.status === "done" ? pr.id : null;
  useEffect(() => {
    if (!idSiap || video?.id === idSiap) return;
    let hidup = true;
    let url = "";
    void (async () => {
      try {
        const res = await api.fetch(`/api/tvr/studio/pratinjau/${idSiap}/video`, { cache: "no-store" });
        if (!res.ok) throw new Error(pesanGalat(res.status, await bacaJson(res), "Video pratinjau gagal dimuat."));
        url = URL.createObjectURL(await res.blob());
        if (hidup) setVideo({ id: idSiap, url });
        else URL.revokeObjectURL(url);
      } catch (e) {
        if (hidup) setPesan(e instanceof Error ? e.message : "Video pratinjau gagal dimuat.");
      }
    })();
    return () => {
      hidup = false;
    };
  }, [idSiap, api, video?.id]);

  useEffect(() => {
    const u = video?.url;
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [video?.url]);

  async function buat() {
    if (mengirim || aktif) return;
    setMengirim(true);
    setPesan("");
    try {
      const res = await api.fetch("/api/tvr/studio/pratinjau", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dok, sumber, bingkai_hitam: sumber === "contoh:lebar" }),
      });
      const d = await bacaJson(res);
      if (!res.ok) throw new Error(pesanGalat(res.status, d, "Pratinjau gagal dibuat."));
      setPr((d.pratinjau as RingkasPratinjau | null) ?? null);
      setDokDibuat(JSON.stringify(dok));
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Pratinjau gagal dibuat.");
    } finally {
      setMengirim(false);
    }
  }

  const durasiBadan = sumber.startsWith("stok:") ? Math.min(DURASI_PRATINJAU, stok.find((s) => `stok:${s.id}` === sumber)?.durasi ?? DURASI_PRATINJAU) : DURASI_PRATINJAU;
  const momen = [
    ...dok.elemen
      .filter((e) => !e.tersembunyi)
      .map((e) => ({ t: rentangTampil(e.waktu, durasiBadan)?.mulai ?? null, nama: `${namaElemen(e)} masuk` }))
      .filter((m): m is { t: number; nama: string } => m.t !== null && m.t > 0.2),
    ...(dok.outro.file ? [{ t: Math.max(0, durasiBadan - 1), nama: "Sambungan ke outro" }] : []),
  ]
    .sort((a, b) => a.t - b.t)
    .slice(0, 5);
  const usang = dokDibuat !== null && dokDibuat !== JSON.stringify(dok);

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Video pratinjau template">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onTutup(pr)} />
      <div className="relative flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-app-bg sm:rounded-3xl">
        <div className="flex items-center gap-2 border-b border-black/10 px-4 py-3 dark:border-white/10">
          <Play className="h-5 w-5 text-pri" aria-hidden="true" />
          <p className="m-0 flex-1 font-heading text-[15px] font-extrabold text-teks-utama">Video pratinjau</p>
          <button type="button" onClick={() => onTutup(pr)} aria-label="Tutup pratinjau" className="btn-tekan flex h-10 w-10 items-center justify-center rounded-xl text-teks-utama">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[minmax(0,1fr)_260px]">
          <div className="flex min-w-0 flex-col gap-3">
            <p className="m-0 text-[12.5px] leading-relaxed text-teks-sekunder">
              Mesin merakit video pendek dengan template yang sedang Anda tata (belum disimpan) — perender yang sama dengan pembuatan video sungguhan, jadi letak, waktu tampil, latar yang dihapus, dan outro persis seperti hasil akhir.
            </p>
            <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
              <legend className="mb-1.5 text-[12px] font-bold text-teks-utama">Video contoh</legend>
              {[
                ["contoh:tegak", "Video contoh tegak 9:16", "15 detik pola warna"],
                ["contoh:lebar", "Video contoh lebar 16:9", "cek tampilan berita video lebar (bingkai hitam)"],
              ].map(([nilai, judul, ket]) => (
                <label key={nilai} className={cn("flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-[12.5px]", sumber === nilai ? "border-teks-utama" : "border-black/10 dark:border-white/10")}>
                  <input type="radio" name="sumber-pratinjau" checked={sumber === nilai} onChange={() => setSumber(nilai!)} className="h-[18px] w-[18px]" style={{ accentColor: "#dc2626" }} />
                  <span className="min-w-0 flex-1">
                    <b className="text-teks-utama">{judul}</b>
                    <span className="block text-[11.5px] text-teks-sekunder">{ket}</span>
                  </span>
                </label>
              ))}
              {stok.length > 0 && (
                <label className={cn("flex items-center gap-2.5 rounded-xl border px-3 py-2 text-[12.5px]", sumber.startsWith("stok:") ? "border-teks-utama" : "border-black/10 dark:border-white/10")}>
                  <input type="radio" name="sumber-pratinjau" checked={sumber.startsWith("stok:")} onChange={() => setSumber(`stok:${stok[0]!.id}`)} className="h-[18px] w-[18px]" style={{ accentColor: "#dc2626" }} />
                  <span className="min-w-0 flex-1">
                    <b className="text-teks-utama">Dari Stok Video saya</b>
                    <select
                      aria-label="Pilih video stok"
                      value={sumber.startsWith("stok:") ? sumber : ""}
                      onChange={(e) => setSumber(e.target.value)}
                      className="mt-1 block h-9 w-full rounded-lg border border-black/15 bg-white/70 px-2 text-[12px] text-teks-utama dark:border-white/15 dark:bg-white/5"
                    >
                      <option value="" disabled>
                        Pilih video…
                      </option>
                      {stok.map((s) => (
                        <option key={s.id} value={`stok:${s.id}`}>
                          {s.judul}
                        </option>
                      ))}
                    </select>
                    <span className="block text-[11.5px] text-teks-sekunder">dipakai 15 detik pertama</span>
                  </span>
                </label>
              )}
            </fieldset>
            <button
              type="button"
              onClick={() => void buat()}
              disabled={mengirim || aktif || !sumber}
              className="btn-tekan flex h-11 items-center justify-center gap-2 rounded-xl bg-teks-utama px-4 text-[13px] font-bold text-app-bg disabled:opacity-50"
            >
              {mengirim || aktif ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
              {aktif ? "Sedang merender…" : pr?.status === "done" ? "Buat pratinjau baru" : "Buat video pratinjau"}
            </button>
            {pr && aktif && (
              <div className="flex flex-col gap-1.5 rounded-xl border border-black/10 p-3 dark:border-white/10" aria-live="polite">
                <div className="flex justify-between text-[12.5px] text-teks-utama">
                  <b>{pr.status === "queued" ? (pr.antrean ? `Menunggu giliran (#${pr.antrean})` : "Menunggu giliran…") : pr.status === "downloading" ? "Menyiapkan video contoh…" : "Merender…"}</b>
                  <span className="font-mono">{Math.round(pr.progress)}%</span>
                </div>
                <div role="progressbar" aria-valuenow={Math.round(pr.progress)} aria-valuemin={0} aria-valuemax={100} aria-label="Kemajuan pratinjau" className="h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div className="h-2 bg-pri transition-all" style={{ width: `${Math.max(3, pr.progress)}%` }} />
                </div>
              </div>
            )}
            {pr && (pr.status === "error" || pr.status === "dibatalkan") && (
              <p className="m-0 rounded-xl border border-gagal/30 bg-gagal/10 p-2.5 text-[12px] text-teks-utama" role="alert">
                {pr.error || "Pratinjau dihentikan."}
              </p>
            )}
            {pesan && (
              <p className="m-0 rounded-xl border border-gagal/30 bg-gagal/10 p-2.5 text-[12px] text-teks-utama" role="alert">
                {pesan}
              </p>
            )}
          </div>

          <div className="flex flex-col items-center gap-2.5">
            <div className="relative aspect-[9/16] w-full max-w-[240px] overflow-hidden rounded-xl bg-[#1e293b]">
              {video && pr?.status === "done" && video.id === pr.id ? (
                <video ref={videoRef} src={video.url} controls playsInline className="h-full w-full bg-black" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-[12px] text-slate-300">
                  {aktif ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" /> : <Play className="h-6 w-6" aria-hidden="true" />}
                  {aktif ? "Video muncul di sini begitu selesai." : "Belum ada pratinjau."}
                </div>
              )}
            </div>
            {video && pr?.status === "done" && (
              <div className="flex w-full max-w-[240px] flex-col gap-1">
                <span className="text-[11.5px] font-bold text-teks-utama">Lompat ke momen</span>
                {[{ t: 0, nama: "Awal: kotak berita & kategori" }, ...momen].map((m) => (
                  <button
                    key={`${m.t}-${m.nama}`}
                    type="button"
                    onClick={() => {
                      const v = videoRef.current;
                      if (!v) return;
                      v.currentTime = m.t;
                      void v.play().catch(() => undefined);
                    }}
                    className="btn-tekan min-h-9 rounded-lg border border-black/10 px-2 text-left text-[11.5px] font-semibold text-teks-utama dark:border-white/15"
                  >
                    {fmtDetik(m.t)} · {m.nama}
                  </button>
                ))}
                {usang && <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">Template sudah diubah setelah pratinjau ini dibuat.</span>}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 border-t border-black/10 p-3 dark:border-white/10">
          <button type="button" onClick={() => onTutup(pr)} className="btn-tekan h-11 flex-1 rounded-xl border border-black/15 text-[13px] font-semibold text-teks-utama dark:border-white/15">
            Kembali menata
          </button>
          <button type="button" onClick={onSimpan} disabled={menyimpan} className="btn-tekan flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-pri text-[13px] font-bold text-white disabled:opacity-50">
            {menyimpan && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Simpan &amp; Tetapkan
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

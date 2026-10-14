"use client";

// ============================================================
// PENCARI VIDEO ASLI (Lacak Sumber, 15 Okt 2026) — tampilan hasil satu pelacakan.
//
// Dipakai master di Ruang Bot → Lacak Sumber. Isinya mengikuti rancangan
// "Main" di kanvas: pita tahap (hidup selama berjalan), kartu saduran,
// petunjuk (watermark, kata kunci, ucapan, frame kunci), daftar kandidat yang
// bisa dipilih, perbandingan kandidat terpilih (strip kecocokan + rincian
// skor), dan tombol keputusan. Server tidak mengirim gambar frame kunci, jadi
// frame kunci tampil sebagai cip waktu.
// ============================================================

import { useState } from "react";
import { AlertTriangle, ArrowRight, Check, ExternalLink, Film, Loader2, Minus, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AksiKeputusan, HasilLacak, Kandidat, TahapLacak, VideoInfo } from "@/lib/lacak-tipe";
import {
  KELAS_BATANG,
  KELAS_SKOR,
  KELAS_ZONA,
  KOMPONEN,
  LABEL_AKSI,
  LABEL_LEWAT,
  LABEL_SUMBER,
  LABEL_ZONA,
  bagianTeks,
  durasiTeks,
  koma,
  namaPlatform,
  offsetTeks,
  persen,
  resolusi,
  waktuWib,
} from "./format";

const KARTU = "glass rounded-2xl p-4";
const JUDUL_KECIL = "text-[11px] font-bold uppercase tracking-[0.06em] text-teks-sekunder";

/** Hanya alamat http(s) yang boleh menjadi tautan keluar. */
export const tautanAman = (url: string): boolean => /^https?:\/\//i.test(url);

// ------------------------------------------------------------ potongan kecil

/** Gambar sampul video dari server (URL luar); kotak polos bila kosong/gagal dimuat. */
export function SampulVideo({ src, className, label }: { src: string; className?: string; label?: string }) {
  const [gagal, setGagal] = useState(false);
  return (
    <span
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      className={cn("relative block shrink-0 overflow-hidden rounded-lg bg-slate-500/25 dark:bg-white/10", className)}
    >
      {src && !gagal ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setGagal(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <Film className="absolute top-1/2 left-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-teks-sekunder opacity-60" />
      )}
    </span>
  );
}

/** Lingkaran tanda status satu tahap. */
export function TandaTahap({ status, no, className }: { status: TahapLacak["status"]; no: number; className?: string }) {
  const dasar = "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold";
  if (status === "selesai")
    return (
      <span aria-hidden="true" className={cn(dasar, "bg-emerald-600 text-white", className)}>
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    );
  if (status === "jalan")
    return (
      <span aria-hidden="true" className={cn(dasar, "bg-info text-white", className)}>
        <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" strokeWidth={3} />
      </span>
    );
  if (status === "gagal")
    return (
      <span aria-hidden="true" className={cn(dasar, "bg-gagal text-white", className)}>
        <X className="h-3 w-3" strokeWidth={3} />
      </span>
    );
  if (status === "lewati")
    return (
      <span aria-hidden="true" className={cn(dasar, "bg-black/10 text-teks-sekunder dark:bg-white/15", className)}>
        <Minus className="h-3 w-3" strokeWidth={3} />
      </span>
    );
  return (
    <span aria-hidden="true" className={cn(dasar, "bg-black/10 text-teks-sekunder dark:bg-white/15", className)}>
      {no}
    </span>
  );
}

const LABEL_STATUS_TAHAP: Record<TahapLacak["status"], string> = {
  tunggu: "menunggu",
  jalan: "berjalan",
  selesai: "selesai",
  lewati: "dilewati",
  gagal: "gagal",
};

function waktuTahap(t: TahapLacak): string {
  if (t.status === "jalan") return "berjalan…";
  if (t.status === "lewati") return "dilewati";
  if (t.status === "tunggu") return "—";
  return t.detik !== null ? `${Math.max(0, Math.round(t.detik))} dtk` : "—";
}

/** Total detik tahap yang sudah tercatat. */
export function totalDetik(tahap: TahapLacak[]): number {
  return Math.round(tahap.reduce((n, t) => n + (t.detik ?? 0), 0));
}

/** Pita tahap pelacakan (6 kotak). */
export function PitaTahap({ tahap }: { tahap: TahapLacak[] }) {
  if (tahap.length === 0) return null;
  return (
    <ol aria-label="Tahap pelacakan" className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3 lg:grid-cols-6">
      {tahap.map((t, i) => (
        <li
          key={t.kunci}
          aria-current={t.status === "jalan" ? "step" : undefined}
          className={cn(
            "glass flex min-w-0 flex-col gap-1 rounded-xl px-3 py-2.5",
            t.status === "jalan" && "ring-2 ring-info/50",
            t.status === "gagal" && "ring-2 ring-gagal/50",
          )}
        >
          <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-teks-utama">
            <TandaTahap status={t.status} no={i + 1} />
            <span className="min-w-0 truncate">{t.nama}</span>
            <span className="sr-only">({LABEL_STATUS_TAHAP[t.status]})</span>
          </span>
          {t.catatan && <span className="line-clamp-2 text-[11.5px] leading-snug text-teks-sekunder">{t.catatan}</span>}
          <span className="font-mono text-[11px] text-teks-sekunder">{waktuTahap(t)}</span>
        </li>
      ))}
    </ol>
  );
}

/** Lencana keadaan pelacakan (judul hasil). */
export function LencanaStatus({ hasil }: { hasil: HasilLacak }) {
  if (hasil.status === "selesai") {
    const detik = totalDetik(hasil.tahap);
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1.5 text-[12px] font-bold text-emerald-700 dark:text-emerald-300">
        <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
        {detik > 0 ? `Selesai dalam ${detik} detik` : "Selesai"}
      </span>
    );
  }
  if (hasil.status === "gagal") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-gagal/15 px-3 py-1.5 text-[12px] font-bold text-gagal">
        <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
        Gagal
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-info/15 px-3 py-1.5 text-[12px] font-bold text-info">
      <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      {hasil.status === "antre" ? "Menunggu giliran" : "Sedang melacak…"}
    </span>
  );
}

// ------------------------------------------------------------ kartu saduran

function KartuSaduran({ hasil, saduran }: { hasil: HasilLacak; saduran: VideoInfo }) {
  const ukuran = [durasiTeks(saduran.durasi), resolusi(saduran.lebar, saduran.tinggi)].filter((x) => x && x !== "—").join(" · ");
  return (
    <section aria-label="Video saduran" className={cn(KARTU, "flex gap-3.5")}>
      <span className="relative shrink-0">
        <SampulVideo src={saduran.gambar} className="h-[160px] w-[90px] sm:h-[192px] sm:w-[108px]" />
        {saduran.durasi > 0 && (
          <span className="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1.5 font-mono text-[10px] text-white">{durasiTeks(saduran.durasi)}</span>
        )}
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="self-start rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10.5px] font-extrabold tracking-wide text-amber-700 dark:text-amber-300">
          VIDEO SADURAN
        </span>
        <h3 className="m-0 line-clamp-3 text-[15px] leading-snug font-extrabold text-teks-utama">{saduran.judul || "Tanpa judul"}</h3>
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-0.5 text-[12.5px]">
          <dt className="text-teks-sekunder">Akun</dt>
          <dd className="m-0 truncate font-bold text-teks-utama">
            {saduran.akun || "—"} · {namaPlatform(saduran.platform)}
          </dd>
          <dt className="text-teks-sekunder">Diunggah</dt>
          <dd className="m-0 text-teks-utama">{saduran.diunggah ? `${waktuWib(saduran.diunggah)} WIB` : "tidak diketahui"}</dd>
          {ukuran && (
            <>
              <dt className="text-teks-sekunder">Ukuran</dt>
              <dd className="m-0 text-teks-utama">{ukuran}</dd>
            </>
          )}
          <dt className="text-teks-sekunder">Diminta</dt>
          <dd className="m-0 truncate text-teks-utama">
            {hasil.diminta_oleh || "—"} ({LABEL_SUMBER[hasil.sumber] ?? hasil.sumber}) · {waktuWib(hasil.dibuat)}
          </dd>
        </dl>
        {tautanAman(saduran.url) && (
          <a
            href={saduran.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-auto inline-flex min-h-11 items-center gap-1 self-start text-[12.5px] font-bold text-pri underline"
          >
            Buka video saduran
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------ petunjuk

function PanelPetunjuk({ hasil }: { hasil: HasilLacak }) {
  const p = hasil.petunjuk;
  if (!p) return null;
  const kosong = p.watermark.length === 0 && p.kata_kunci.length === 0 && !p.transkrip.trim() && p.frame_kunci.length === 0;
  return (
    <section aria-label="Petunjuk yang ditemukan" className={cn(KARTU, "flex flex-col gap-3.5")}>
      <h3 className="m-0 text-[14.5px] font-extrabold text-teks-utama">Petunjuk yang ditemukan</h3>
      {kosong && <p className="m-0 text-[12.5px] text-teks-sekunder">Belum ada petunjuk yang terbaca dari video ini.</p>}

      {p.watermark.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className={JUDUL_KECIL}>Watermark / username di video</span>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {p.watermark.map((w) => (
              <li
                key={w.handle}
                className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl border border-info/30 bg-info/10 px-3 py-2"
              >
                <b className="text-[14.5px] text-blue-800 dark:text-blue-200">{w.handle}</b>
                <span className="text-[12px] text-blue-800/80 dark:text-blue-200/80">
                  terbaca di {w.frame} dari {w.total} frame · keyakinan OCR {persen(w.yakin <= 1 ? w.yakin : w.yakin / 100)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {p.kata_kunci.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className={JUDUL_KECIL}>Kata kunci (caption + teks di video)</span>
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {p.kata_kunci.map((k) => (
              <li key={k} className="glass-soft rounded-full px-2.5 py-1 text-[12.5px] font-semibold text-teks-utama">
                {k}
              </li>
            ))}
          </ul>
        </div>
      )}

      {p.transkrip.trim() && (
        <div className="flex flex-col gap-1.5">
          <span className={JUDUL_KECIL}>Teks ucapan (audio)</span>
          <blockquote className="glass-soft m-0 rounded-xl px-3 py-2.5 text-[13px] leading-relaxed text-teks-utama">
            “{p.transkrip.trim()}”
          </blockquote>
        </div>
      )}

      {p.frame_kunci.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className={JUDUL_KECIL}>Frame kunci ({p.frame_kunci.length}, tiap ganti adegan)</span>
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {p.frame_kunci.map((f, i) => (
              <li key={`${f}-${i}`} className="rounded-md bg-black/[0.06] px-2 py-1 font-mono text-[11.5px] text-teks-utama dark:bg-white/10">
                {durasiTeks(f)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------ kandidat

function BarisKandidat({
  k,
  no,
  dipilih,
  otomatis,
  onPilih,
}: {
  k: Kandidat;
  no: number;
  dipilih: boolean;
  otomatis: boolean;
  onPilih: () => void;
}) {
  const info = [waktuWib(k.diunggah || null), durasiTeks(k.durasi), resolusi(k.lebar, k.tinggi)].filter((x) => x && x !== "—").join(" · ");
  return (
    <button
      type="button"
      aria-pressed={dipilih}
      onClick={onPilih}
      className={cn(
        "btn-tekan flex w-full items-center gap-2.5 rounded-2xl border-2 p-2.5 text-left sm:gap-3 sm:px-3",
        dipilih ? "border-pri bg-pri/[0.06]" : "border-glass-border bg-transparent",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12.5px] font-extrabold text-white",
          otomatis ? "bg-emerald-600" : "bg-stone-500",
        )}
      >
        {no}
      </span>
      <SampulVideo src={k.gambar} className="h-20 w-[45px] rounded-md sm:h-24 sm:w-[54px]" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <b className="min-w-0 truncate text-[13.5px] text-teks-utama">{k.akun || "Akun tidak diketahui"}</b>
          <span className="glass-soft rounded-full px-2 py-0.5 text-[10.5px] font-bold text-teks-sekunder">{namaPlatform(k.platform)}</span>
          {(k.label || otomatis) && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10.5px] font-extrabold",
                otomatis ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-black/[0.06] text-teks-sekunder dark:bg-white/10",
              )}
            >
              {[k.label, otomatis ? "dipilih otomatis" : ""].filter(Boolean).join(" · ")}
            </span>
          )}
        </span>
        {k.judul && <span className="truncate text-[12.5px] text-teks-utama/80">{k.judul}</span>}
        {info && <span className="text-[11.5px] text-teks-sekunder">{info}</span>}
        <span className="text-[11px] text-teks-sekunder">Ditemukan lewat {LABEL_LEWAT[k.ditemukan_lewat]?.toLowerCase() ?? k.ditemukan_lewat}</span>
      </span>
      <span className="flex w-[72px] shrink-0 flex-col items-end gap-1.5 sm:w-[104px]">
        <span className={cn("font-mono text-[18px] font-bold sm:text-[20px]", KELAS_SKOR[k.zona])}>{koma(k.skor)}</span>
        <span className="block h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10" aria-hidden="true">
          <span className={cn("block h-full rounded-full", KELAS_BATANG[k.zona])} style={{ width: `${Math.max(2, Math.min(100, k.skor * 100))}%` }} />
        </span>
        <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-bold", KELAS_ZONA[k.zona])}>{LABEL_ZONA[k.zona]}</span>
      </span>
    </button>
  );
}

// ------------------------------------------------------------ perbandingan

const KELAS_STRIP = ["bg-black/15 dark:bg-white/15", "bg-amber-500", "bg-emerald-600 dark:bg-emerald-500"];

function StripCocok({ strip, durasi }: { strip: number[]; durasi: number }) {
  if (strip.length === 0) return null;
  const cocok = strip.filter((s) => s >= 2).length;
  const sebagian = strip.filter((s) => s === 1).length;
  return (
    <div className="flex flex-col gap-1.5">
      <span className={JUDUL_KECIL}>Kecocokan frame sepanjang video saduran</span>
      <div
        role="img"
        aria-label={`${cocok} dari ${strip.length} potongan cocok, ${sebagian} cocok sebagian`}
        className="grid gap-[2px]"
        style={{ gridTemplateColumns: `repeat(${strip.length}, minmax(0, 1fr))` }}
      >
        {strip.map((s, i) => (
          <span key={i} className={cn("h-7 rounded-[3px]", KELAS_STRIP[Math.max(0, Math.min(2, Math.round(s)))])} />
        ))}
      </div>
      {durasi > 0 && (
        <div className="flex justify-between font-mono text-[10.5px] text-teks-sekunder" aria-hidden="true">
          <span>0:00</span>
          <span>{durasiTeks(durasi / 2)}</span>
          <span>{durasiTeks(durasi)}</span>
        </div>
      )}
      <ul className="m-0 flex list-none flex-wrap gap-x-3.5 gap-y-1 p-0 text-[11.5px] text-teks-sekunder">
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={cn("h-3 w-3 rounded-[3px]", KELAS_STRIP[2])} />
          Cocok
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={cn("h-3 w-3 rounded-[3px]", KELAS_STRIP[1])} />
          Cocok sebagian (teks/stiker ditempel)
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={cn("h-3 w-3 rounded-[3px]", KELAS_STRIP[0])} />
          Tidak cocok
        </li>
      </ul>
    </div>
  );
}

function TabelRincian({ k }: { k: Kandidat }) {
  const sel = "border-b border-glass-border px-1.5 py-2";
  const kepala = "border-b border-glass-border px-1.5 py-2 text-[10.5px] font-bold uppercase tracking-[0.05em] text-teks-sekunder";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[340px] border-collapse text-[12.5px] text-teks-utama">
        <caption className="sr-only">Rincian skor kandidat {k.akun}</caption>
        <thead>
          <tr>
            <th scope="col" className={cn(kepala, "text-left")}>
              Komponen
            </th>
            <th scope="col" className={cn(kepala, "text-right")}>
              Bobot
            </th>
            <th scope="col" className={cn(kepala, "text-right")}>
              Nilai
            </th>
            <th scope="col" className={cn(kepala, "text-right")}>
              Sumbangan
            </th>
          </tr>
        </thead>
        <tbody>
          {KOMPONEN.map((c) => {
            const bobot = k.bobot?.[c.kunci] ?? 0;
            const nilai = k.komponen?.[c.kunci] ?? 0;
            return (
              <tr key={c.kunci}>
                <th scope="row" className={cn(sel, "text-left font-normal")}>
                  <b className="block text-teks-utama">{c.nama}</b>
                  <span className="text-[11px] text-teks-sekunder">{c.ket}</span>
                </th>
                <td className={cn(sel, "text-right font-mono")}>{Math.round(bobot * 100)}%</td>
                <td className={cn(sel, "text-right font-mono")}>{koma(nilai)}</td>
                <td className={cn(sel, "text-right font-mono font-bold")}>{koma(bobot * nilai, 3)}</td>
              </tr>
            );
          })}
          <tr>
            <th scope="row" className="px-1.5 py-2.5 text-left font-extrabold">
              Skor total
            </th>
            <td />
            <td />
            <td className={cn("px-1.5 py-2.5 text-right font-mono text-[17px] font-bold", KELAS_SKOR[k.zona])}>{koma(k.skor)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function vonis(k: Kandidat, otomatis: boolean): { teks: string; kelas: string } {
  if (otomatis) return { teks: "Video asli · dipilih otomatis", kelas: KELAS_ZONA.yakin };
  if (k.zona === "yakin") return { teks: "Cocok, tetapi bukan yang paling awal", kelas: "bg-info/15 text-blue-700 dark:text-blue-300" };
  if (k.zona === "perlu_acc") return { teks: "Perlu keputusan master", kelas: KELAS_ZONA.perlu_acc };
  return { teks: "Bukan sumber", kelas: KELAS_ZONA.bukan };
}

function PanelPerbandingan({
  hasil,
  k,
  indeks,
  memutus,
  onPutuskan,
}: {
  hasil: HasilLacak;
  k: Kandidat;
  indeks: number;
  memutus: boolean;
  onPutuskan?: (aksi: AksiKeputusan, kandidat: number | null) => void;
}) {
  const otomatis = hasil.terpilih === indeks;
  const v = vonis(k, otomatis);
  const saduran = hasil.saduran;
  const keputusanIni = hasil.keputusan && hasil.keputusan.kandidat === indeks ? hasil.keputusan.aksi : null;
  const tombolSekunder =
    "glass btn-tekan flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-[13px] font-bold text-teks-utama disabled:opacity-50";
  return (
    <section aria-label="Perbandingan" className={cn(KARTU, "flex flex-col gap-4")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="m-0 min-w-0 text-[16px] font-extrabold text-teks-utama">
          Perbandingan: saduran vs <span className="break-all">{k.akun || `kandidat ${indeks + 1}`}</span>
        </h3>
        <span className={cn("rounded-full px-3 py-1 text-[12px] font-extrabold", v.kelas)}>{v.teks}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3.5">
          <div className="flex flex-wrap items-center gap-3">
            <figure className="m-0 flex flex-col items-center gap-1">
              <SampulVideo src={saduran?.gambar ?? ""} className="h-[128px] w-[72px] sm:h-[144px] sm:w-[81px]" />
              <figcaption className="text-[11px] text-teks-sekunder">Saduran · {durasiTeks(saduran?.durasi)}</figcaption>
            </figure>
            <ArrowRight className="h-4 w-4 shrink-0 text-teks-sekunder" aria-hidden="true" />
            <figure className="m-0 flex flex-col items-center gap-1">
              <SampulVideo src={k.gambar} className="h-[128px] w-[72px] sm:h-[144px] sm:w-[81px]" />
              <figcaption className="text-[11px] text-teks-sekunder">
                {namaPlatform(k.platform)} · {durasiTeks(k.durasi)}
              </figcaption>
            </figure>
            <div className="flex min-w-[180px] flex-1 flex-col gap-1.5 text-[12.5px] leading-relaxed text-teks-utama">
              <span>
                <b>Bagian yang dipakai saduran:</b> {k.bagian ? `${bagianTeks(k.bagian)} dari video ini` : bagianTeks(null)}
              </span>
              <span>
                <b>Selisih waktu suara:</b> {offsetTeks(k.offset_suara)}
              </span>
              <span>
                <b>Diunggah:</b> {k.diunggah ? `${waktuWib(k.diunggah)} WIB` : "tidak diketahui"}
              </span>
              <span className="text-teks-sekunder">Ditemukan lewat {LABEL_LEWAT[k.ditemukan_lewat]?.toLowerCase() ?? k.ditemukan_lewat}.</span>
            </div>
          </div>
          <StripCocok strip={k.strip} durasi={saduran?.durasi ?? 0} />
        </div>
        <TabelRincian k={k} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-glass-border pt-3.5">
        {onPutuskan && (
          <>
            <button
              type="button"
              onClick={() => onPutuskan("pakai_asli", indeks)}
              disabled={memutus}
              aria-pressed={keputusanIni === "pakai_asli"}
              className="btn-tekan flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-[13px] font-extrabold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
            >
              {memutus ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Pakai video asli
            </button>
            <button
              type="button"
              onClick={() => onPutuskan("pakai_kredit", indeks)}
              disabled={memutus}
              aria-pressed={keputusanIni === "pakai_kredit"}
              className={tombolSekunder}
            >
              Pakai kreditnya saja
            </button>
            <button
              type="button"
              onClick={() => onPutuskan("bukan", indeks)}
              disabled={memutus}
              aria-pressed={keputusanIni === "bukan"}
              className="btn-tekan flex min-h-11 items-center justify-center rounded-xl border border-gagal/40 px-4 text-[13px] font-bold text-gagal disabled:opacity-50"
            >
              Bukan ini
            </button>
          </>
        )}
        {tautanAman(k.url) && (
          <a
            href={k.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex min-h-11 items-center gap-1 text-[12.5px] font-bold text-pri underline"
          >
            Buka video di {namaPlatform(k.platform)}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------ tampilan utama

type HasilLacakProps = {
  hasil: HasilLacak;
  /** Sedang mengirim keputusan. */
  memutus?: boolean;
  /** Galat terakhir (mulai/keputusan) dari hook. */
  galat?: string;
  onPutuskan?: (aksi: AksiKeputusan, kandidat: number | null) => void;
  /** Lacak ulang (tombol pada keadaan gagal); kosong = tombol tidak tampil. */
  onUlang?: () => void;
};

/** Pasang dengan `key={hasil.id}` supaya pilihan kandidat kembali ke awal saat job berganti. */
export function HasilLacakView({ hasil, memutus = false, galat, onPutuskan, onUlang }: HasilLacakProps) {
  const [pilih, setPilih] = useState<number | null>(null);
  const jumlah = hasil.kandidat.length;
  const awal = hasil.terpilih !== null && hasil.terpilih < jumlah ? hasil.terpilih : jumlah > 0 ? 0 : null;
  const indeks = pilih !== null && pilih < jumlah ? pilih : awal;
  const k = indeks !== null ? hasil.kandidat[indeks] : null;
  const berjalan = hasil.status === "antre" || hasil.status === "berjalan";

  return (
    <div className="flex flex-col gap-3.5" aria-busy={berjalan}>
      <div className="flex flex-wrap items-center gap-2">
        <LencanaStatus hasil={hasil} />
        {hasil.selesai && <span className="text-[11.5px] text-teks-sekunder">{waktuWib(hasil.selesai)} WIB</span>}
      </div>

      <PitaTahap tahap={hasil.tahap} />

      {hasil.status === "gagal" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-gagal/30 bg-gagal/10 px-3.5 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-gagal" aria-hidden="true" />
          <p className="m-0 min-w-0 flex-1 text-[12.5px] leading-relaxed text-teks-utama">{hasil.pesan || "Pelacakan gagal."}</p>
          {onUlang && (
            <button
              type="button"
              onClick={onUlang}
              className="glass btn-tekan flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-4 text-[12.5px] font-bold text-teks-utama"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Coba lagi
            </button>
          )}
        </div>
      )}
      {hasil.status !== "gagal" && hasil.pesan && <p className="m-0 text-[12px] text-teks-sekunder" role="status">{hasil.pesan}</p>}

      {(hasil.saduran || hasil.petunjuk || jumlah > 0 || hasil.status === "selesai") && (
        <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="flex min-w-0 flex-col gap-3.5">
            {hasil.saduran && <KartuSaduran hasil={hasil} saduran={hasil.saduran} />}
            <PanelPetunjuk hasil={hasil} />
          </div>

          <section aria-label="Kandidat" className={cn(KARTU, "flex min-w-0 flex-col gap-3")}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="m-0 text-[14.5px] font-extrabold text-teks-utama">Kandidat video asli ({jumlah})</h3>
              {hasil.kredit && <span className="font-mono text-[11.5px] font-bold text-emerald-700 dark:text-emerald-300">{hasil.kredit}</span>}
            </div>
            {jumlah === 0 ? (
              <p className="m-0 text-[12.5px] text-teks-sekunder">
                {berjalan ? "Kandidat muncul setelah tahap pencarian selesai." : "Tidak ada kandidat yang ditemukan. Video asli tidak ditemukan."}
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {hasil.kandidat.map((c, i) => (
                  <li key={`${c.url}-${i}`}>
                    <BarisKandidat k={c} no={i + 1} dipilih={indeks === i} otomatis={hasil.terpilih === i} onPilih={() => setPilih(i)} />
                  </li>
                ))}
              </ul>
            )}
            <p className="m-0 text-[11.5px] leading-relaxed text-teks-sekunder">
              Bila ada beberapa kandidat di zona yakin, yang diunggah paling awal dipilih sebagai video asli. Kandidat di zona perlu ACC menunggu
              keputusan master.
            </p>
          </section>
        </div>
      )}

      {k && indeks !== null && <PanelPerbandingan hasil={hasil} k={k} indeks={indeks} memutus={memutus} onPutuskan={berjalan ? undefined : onPutuskan} />}

      {hasil.keputusan && (
        <p role="status" className="m-0 rounded-xl bg-emerald-500/10 px-3.5 py-3 text-[12.5px] leading-relaxed text-emerald-800 dark:text-emerald-200">
          <b>{LABEL_AKSI[hasil.keputusan.aksi]}</b>
          {hasil.keputusan.kandidat !== null && hasil.kandidat[hasil.keputusan.kandidat]
            ? ` · ${hasil.kandidat[hasil.keputusan.kandidat].akun}`
            : ""}
          {" — oleh "}
          {hasil.keputusan.oleh || "—"} · {waktuWib(hasil.keputusan.pada)} WIB
        </p>
      )}
      {galat && (
        <p role="alert" className="m-0 rounded-xl border border-gagal/30 bg-gagal/10 px-3 py-2.5 text-[12px] text-teks-utama">
          {galat}
        </p>
      )}
    </div>
  );
}

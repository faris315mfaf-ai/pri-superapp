"use client";

// ============================================================
// PENCARI VIDEO ASLI (Lacak Sumber, 15 Okt 2026) — tombol "Cari video asli" di TVR Saya.
//
// Tampil di bawah kolom link Edit Otomatis bila linknya sah DAN master
// menyalakan pengaturan `tombol_pengguna`. Alurnya (rancangan "Ponsel"):
//   awal → mencari (tahap hidup) → hasil ringkas → selesai.
// Pilihan:
//   • Pakai video asli      → keputusan pakai_asli; link diganti ke video asli, kredit diisi.
//   • Isi kreditnya saja    → keputusan pakai_kredit; kredit diisi, link tetap.
//   • Bukan ini             → keputusan bukan; kartu ditutup.
// Komponen ini tidak memegang isian form: perubahan link/kredit dikirim lewat callback.
// ============================================================

import { useState } from "react";
import { ExternalLink, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAKS_URL_LACAK, type AksiKeputusan, type HasilLacak, type Kandidat } from "@/lib/lacak-tipe";
import { SampulVideo, TandaTahap, tautanAman } from "./hasil-lacak";
import { URL_SAH, bagianTeks, durasiTeks, kreditDari, namaPlatform, persen, selisihWaktu, waktuWibRingkas } from "./format";
import { masihBerjalan, useLacakJob, usePengaturanLacak } from "./use-lacak";

type Props = {
  /** Isi kolom link saat ini (belum di-trim). */
  link: string;
  /** Form sedang mengirim: tombol dinonaktifkan. */
  nonaktif?: boolean;
  /** Panjang maksimal kolom kredit sumber (batas.maks_sumber_teks). */
  maksKredit: number;
  onPakaiAsli: (url: string, kredit: string) => void;
  onIsiKredit: (kredit: string) => void;
};

type Utama = { k: Kandidat; indeks: number; yakin: boolean };

/** Kandidat yang ditawarkan: pilihan otomatis (zona yakin), atau skor tertinggi bila zona perlu ACC. */
function kandidatUtama(h: HasilLacak): Utama | null {
  if (h.terpilih !== null && h.kandidat[h.terpilih]) return { k: h.kandidat[h.terpilih], indeks: h.terpilih, yakin: true };
  if (h.zona === "perlu_acc" && h.kandidat.length > 0) {
    let indeks = 0;
    h.kandidat.forEach((c, i) => {
      if (c.skor > h.kandidat[indeks].skor) indeks = i;
    });
    return { k: h.kandidat[indeks], indeks, yakin: false };
  }
  return null;
}

function kalimatWaktu(h: HasilLacak, k: Kandidat): string {
  const sad = h.saduran?.diunggah;
  if (!sad || !k.diunggah) return "";
  const beda = selisihWaktu(k.diunggah, sad);
  if (!beda) return "";
  return Date.parse(k.diunggah) <= Date.parse(sad)
    ? `Diunggah ${beda} sebelum video yang Anda tempel.`
    : `Diunggah ${beda} sesudah video yang Anda tempel.`;
}

const TOMBOL_UTAMA =
  "btn-tekan flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl text-[13.5px] font-extrabold text-white disabled:opacity-50";
const TOMBOL_KEDUA =
  "glass btn-tekan flex min-h-11 w-full items-center justify-center rounded-xl px-3 text-[12.5px] font-bold text-teks-utama disabled:opacity-50";
const TOMBOL_TIPIS =
  "btn-tekan flex min-h-11 w-full items-center justify-center rounded-xl px-3 text-[12.5px] font-bold text-teks-sekunder disabled:opacity-50";

export function CariAsliTvr({ link, nonaktif = false, maksKredit, onPakaiAsli, onIsiKredit }: Props) {
  const pengaturan = usePengaturanLacak();
  const job = useLacakJob();
  /** Link yang sedang/sudah dilacak; hasil hanya tampil bila sama dengan isi kolom. */
  const [urlJob, setUrlJob] = useState("");
  /** Link yang sudah diputuskan (pesan kosong = kartu ditutup untuk link itu). */
  const [selesai, setSelesai] = useState<{ url: string; pesan: string } | null>(null);

  const linkBersih = link.trim();
  const linkSah = URL_SAH.test(linkBersih) && linkBersih.length <= MAKS_URL_LACAK;
  if (!pengaturan.data?.tombol_pengguna || !linkSah) return null;

  // ---- sudah diputuskan untuk link ini ----
  if (selesai && selesai.url === linkBersih) {
    if (!selesai.pesan) return null;
    return (
      <div role="status" className="mt-2 flex items-start gap-2 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-[12px] leading-relaxed text-emerald-800 dark:text-emerald-200">
        <p className="m-0 min-w-0 flex-1 self-center">{selesai.pesan}</p>
        <button
          type="button"
          onClick={() => setSelesai({ url: selesai.url, pesan: "" })}
          aria-label="Tutup pemberitahuan"
          className="btn-tekan -my-1.5 -mr-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  async function cari() {
    // Link diganti saat pelacakan lama masih berjalan: batalkan dulu (pengguna biasa hanya boleh satu).
    if (job.hasil && masihBerjalan(job.hasil)) await job.batal();
    setUrlJob(linkBersih);
    setSelesai(null);
    await job.mulai(linkBersih);
  }

  function abaikan(pesan = "") {
    setSelesai({ url: linkBersih, pesan });
    job.tutup();
  }

  async function putuskan(aksi: AksiKeputusan, u: Utama) {
    const d = await job.putuskan(aksi, u.indeks);
    if (!d) return; // galat tampil di kartu
    const kredit = (d.kredit || kreditDari(u.k.akun)).slice(0, maksKredit);
    const akun = u.k.akun || "pemilik aslinya";
    if (aksi === "pakai_asli") {
      onPakaiAsli(u.k.url, kredit);
      const bagian = u.k.bagian ? ` Bagian yang dipakai saduran: ${bagianTeks(u.k.bagian)}.` : "";
      setSelesai({ url: u.k.url.trim(), pesan: `Link diganti ke video asli ${akun}. Kredit sumber diisi otomatis.${bagian}` });
      job.tutup();
    } else if (aksi === "pakai_kredit") {
      onIsiKredit(kredit);
      abaikan(`Video tetap dari link Anda. Kredit sumber diganti ke ${akun}.`);
    } else {
      abaikan("Baik, hasil itu diabaikan.");
    }
  }

  const hasil = job.hasil && urlJob === linkBersih ? job.hasil : null;
  const galat = job.galat ? (
    <p role="alert" className="m-0 rounded-lg border border-gagal/30 bg-gagal/10 px-2.5 py-2 text-[11.5px] text-teks-utama">
      {job.galat}
    </p>
  ) : null;

  // ---- belum dilacak ----
  if (!hasil) {
    return (
      <div className="mt-2 flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
        <p className="m-0 text-[12px] leading-relaxed text-amber-900 dark:text-amber-100">
          <b>Video ini saduran?</b> Cari video aslinya supaya kredit sumbernya benar dan kualitasnya lebih tajam.
        </p>
        {urlJob === linkBersih && galat}
        <button
          type="button"
          onClick={() => void cari()}
          disabled={nonaktif || job.memulai}
          className="btn-tekan flex min-h-11 items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 text-[13px] font-extrabold text-white disabled:opacity-50 dark:bg-white dark:text-stone-900"
        >
          {job.memulai ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
          Cari video asli
        </button>
      </div>
    );
  }

  // ---- sedang mencari ----
  if (hasil.status === "antre" || hasil.status === "berjalan") {
    return (
      <div role="status" aria-live="polite" aria-busy="true" className="glass-soft mt-2 flex flex-col gap-2 rounded-xl p-3">
        <b className="flex items-center gap-2 text-[13px] text-teks-utama">
          <Loader2 className="h-4 w-4 animate-spin text-info motion-reduce:animate-none" aria-hidden="true" />
          {hasil.status === "antre" ? "Menunggu giliran mencari…" : "Mencari video asli…"}
        </b>
        {hasil.tahap.length > 0 && (
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
            {hasil.tahap.map((t, i) => (
              <li
                key={t.kunci}
                className={cn("flex items-center gap-2 text-[12px]", t.status === "tunggu" || t.status === "lewati" ? "text-teks-sekunder" : "text-teks-utama")}
              >
                <TandaTahap status={t.status} no={i + 1} />
                <span className="min-w-0 flex-1 truncate">{t.nama}</span>
                {t.status === "lewati" && <span className="text-[11px]">dilewati</span>}
              </li>
            ))}
          </ol>
        )}
        <button
          type="button"
          onClick={() => {
            setSelesai({ url: linkBersih, pesan: "" });
            void job.batal();
          }}
          className={cn(TOMBOL_TIPIS, "self-start w-auto")}
        >
          Batal
        </button>
      </div>
    );
  }

  // ---- gagal ----
  if (hasil.status === "gagal") {
    return (
      <div role="alert" className="mt-2 flex flex-col gap-2 rounded-xl border border-gagal/30 bg-gagal/10 p-3">
        <p className="m-0 text-[12px] leading-relaxed text-teks-utama">
          <b>Pencarian gagal.</b> {hasil.pesan || "Coba lagi beberapa saat lagi."}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void cari()} disabled={nonaktif || job.memulai} className={TOMBOL_KEDUA}>
            Coba lagi
          </button>
          <button type="button" onClick={() => abaikan()} className={TOMBOL_TIPIS}>
            Tutup
          </button>
        </div>
      </div>
    );
  }

  // ---- selesai ----
  const u = kandidatUtama(hasil);
  if (!u) {
    return (
      <div role="status" className="glass-soft mt-2 flex items-center gap-2 rounded-xl px-3 py-2">
        <p className="m-0 min-w-0 flex-1 text-[12px] text-teks-utama">
          <b>Video asli tidak ditemukan.</b> Tetap pakai link Anda dan isi kredit sumbernya sendiri.
        </p>
        <button
          type="button"
          onClick={() => abaikan()}
          aria-label="Tutup hasil pencarian"
          className="btn-tekan flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-teks-sekunder"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  const { k } = u;
  const info = [namaPlatform(k.platform), k.diunggah ? waktuWibRingkas(k.diunggah) : "", k.durasi > 0 ? durasiTeks(k.durasi) : "", k.tinggi > 0 ? `${Math.min(k.lebar, k.tinggi) || k.tinggi}p` : ""]
    .filter(Boolean)
    .join(" · ");
  const lain = hasil.kandidat.length - 1;
  return (
    <section
      aria-label="Hasil pencarian video asli"
      aria-live="polite"
      className={cn(
        "mt-2 flex flex-col gap-2.5 rounded-xl border-2 p-3",
        u.yakin ? "border-emerald-600/80 bg-emerald-500/[0.06]" : "border-amber-500/80 bg-amber-500/[0.06]",
      )}
    >
      <span
        className={cn(
          "self-start rounded-full px-2.5 py-0.5 text-[10.5px] font-extrabold tracking-wide",
          u.yakin ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
        )}
      >
        {u.yakin ? `VIDEO ASLI DITEMUKAN · ${persen(k.skor)} YAKIN` : `MUNGKIN INI · ${persen(k.skor)}`}
      </span>
      <div className="flex gap-2.5">
        <SampulVideo src={k.gambar} className="h-28 w-[63px]" />
        <div className="flex min-w-0 flex-col gap-1 text-[12px] text-teks-sekunder">
          <b className="truncate text-[14px] text-teks-utama">{k.akun || "Akun tidak diketahui"}</b>
          {info && <span>{info}</span>}
          {kalimatWaktu(hasil, k) && <span>{kalimatWaktu(hasil, k)}</span>}
          {!u.yakin && <span>Skornya belum cukup yakin; periksa dulu videonya.</span>}
          {tautanAman(k.url) && (
            <a
              href={k.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1 self-start font-bold text-pri underline"
            >
              Lihat videonya
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
      {galat}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => void putuskan("pakai_asli", u)}
          disabled={nonaktif || job.memutus || !tautanAman(k.url)}
          className={TOMBOL_UTAMA}
          style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
        >
          {job.memutus && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Pakai video asli
        </button>
        <button type="button" onClick={() => void putuskan("pakai_kredit", u)} disabled={nonaktif || job.memutus} className={TOMBOL_KEDUA}>
          Tetap pakai link saya, isi kreditnya saja
        </button>
        <button type="button" onClick={() => void putuskan("bukan", u)} disabled={nonaktif || job.memutus} className={TOMBOL_TIPIS}>
          Bukan ini, abaikan
        </button>
      </div>
      {lain > 0 && (
        <p className="m-0 text-[11px] text-teks-sekunder">
          Ada {lain} kandidat lain. Master bisa melihat rincian skornya di Ruang Bot.
        </p>
      )}
    </section>
  );
}

"use client";

// ============================================================
// PENCARI VIDEO ASLI (Lacak Sumber, 15 Okt 2026) — tab master di Ruang Bot.
//
// Form link saduran → POST /api/lacak/jobs, hasilnya dipantau sampai selesai
// (use-lacak.ts) dan ditampilkan lewat HasilLacakView. Di bawahnya riwayat
// pelacakan terbaru; ketuk satu baris untuk membuka hasilnya.
// ============================================================

import { useRef, useState } from "react";
import { Loader2, RotateCcw, Search, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton } from "@/components/pri-ui";
import { cn } from "@/lib/utils";
import { MAKS_URL_LACAK, type RingkasLacak } from "@/lib/lacak-tipe";
import { HasilLacakView } from "./hasil-lacak";
import { KELAS_ZONA, LABEL_LEWAT, LABEL_SUMBER, URL_SAH, koma, waktuWib } from "./format";
import { useLacakJob, useRiwayatLacak } from "./use-lacak";

/** Teks & warna kolom "Hasil" riwayat. */
function hasilRingkas(r: RingkasLacak): { teks: string; kelas: string } {
  if (r.status === "antre" || r.status === "berjalan") return { teks: "Sedang dilacak", kelas: "bg-info/15 text-blue-700 dark:text-blue-300" };
  if (r.status === "gagal") return { teks: "Gagal", kelas: "bg-gagal/15 text-gagal" };
  if (r.zona === "yakin") {
    const akun = r.kredit.replace(/^SUMBER:\s*/i, "");
    return { teks: akun ? `Ditemukan · ${akun}` : "Ditemukan", kelas: KELAS_ZONA.yakin };
  }
  if (r.zona === "perlu_acc") return { teks: "Perlu ACC", kelas: KELAS_ZONA.perlu_acc };
  return { teks: "Tidak ditemukan", kelas: KELAS_ZONA.bukan };
}

function TabelRiwayat({
  item,
  aktifId,
  onBuka,
}: {
  item: RingkasLacak[];
  aktifId: string | null;
  onBuka: (id: string) => void;
}) {
  const kepala = "border-b border-glass-border px-2 py-2 text-left text-[10.5px] font-bold uppercase tracking-[0.05em] text-teks-sekunder";
  const sel = "border-b border-glass-border px-2 py-1.5 align-middle";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-[12.5px] text-teks-utama">
        <caption className="sr-only">Riwayat pelacakan; pilih judul untuk membuka hasilnya</caption>
        <thead>
          <tr>
            <th scope="col" className={kepala}>
              Waktu
            </th>
            <th scope="col" className={kepala}>
              Saduran
            </th>
            <th scope="col" className={kepala}>
              Diminta oleh
            </th>
            <th scope="col" className={kepala}>
              Hasil
            </th>
            <th scope="col" className={cn(kepala, "text-right")}>
              Skor
            </th>
            <th scope="col" className={kepala}>
              Ditemukan lewat
            </th>
          </tr>
        </thead>
        <tbody>
          {item.map((r) => {
            const h = hasilRingkas(r);
            const aktif = r.id === aktifId;
            return (
              <tr key={r.id} onClick={() => onBuka(r.id)} className={cn("cursor-pointer hover:bg-black/[0.03] dark:hover:bg-white/5", aktif && "bg-pri/[0.06]")}>
                <td className={cn(sel, "font-mono text-[11.5px] whitespace-nowrap text-teks-sekunder")}>{waktuWib(r.dibuat)}</td>
                <td className={sel}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onBuka(r.id);
                    }}
                    aria-current={aktif ? "true" : undefined}
                    className="flex min-h-11 w-full max-w-[260px] items-center text-left font-semibold text-teks-utama underline-offset-2 hover:underline"
                  >
                    <span className="line-clamp-2">{r.judul || "Tanpa judul"}</span>
                  </button>
                </td>
                <td className={sel}>
                  {r.diminta_oleh || "—"}
                  <span className="block text-[11px] text-teks-sekunder">{LABEL_SUMBER[r.sumber] ?? r.sumber}</span>
                </td>
                <td className={sel}>
                  <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[11px] font-extrabold", h.kelas)}>{h.teks}</span>
                </td>
                <td className={cn(sel, "text-right font-mono")}>{r.skor !== null ? koma(r.skor) : "—"}</td>
                <td className={cn(sel, "text-teks-sekunder")}>{r.ditemukan_lewat ? LABEL_LEWAT[r.ditemukan_lewat] : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function LacakSumberView() {
  const riwayat = useRiwayatLacak(50);
  const { muatUlang } = riwayat;
  // Job selesai/gagal → riwayat disegarkan (dipanggil dari callback pemantau, bukan dari efek).
  const job = useLacakJob({ onAkhir: muatUlang });
  const [url, setUrl] = useState("");
  const [galatForm, setGalatForm] = useState("");
  const hasilRef = useRef<HTMLDivElement>(null);

  const urlBersih = url.trim();

  async function lacak(alamat: string) {
    if (!URL_SAH.test(alamat)) {
      setGalatForm("Tempel link video lengkap yang diawali https://");
      return;
    }
    setGalatForm("");
    const ok = await job.mulai(alamat);
    if (ok) {
      muatUlang();
      hasilRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function buka(id: string) {
    const ok = await job.buka(id);
    if (ok) hasilRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const hasil = job.hasil;
  const urlUlang = hasil?.saduran?.url || job.urlTerakhir;

  return (
    <div className="flex flex-col gap-4">
      <GlassCard className="p-4">
        <h2 className="m-0 text-[17px] font-extrabold text-teks-utama">Lacak video asli</h2>
        <p className="mt-1 mb-3 text-[12.5px] leading-relaxed text-teks-sekunder">
          Mesin mencari video pertama yang diunggah pemilik aslinya, lalu membandingkan gambar dan suaranya dengan video saduran.
        </p>
        <form
          className="flex flex-wrap items-end gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!job.memulai) void lacak(urlBersih);
          }}
        >
          <label className="flex min-w-0 flex-[1_1_320px] flex-col gap-1 text-[12px] font-bold text-teks-sekunder">
            Link video saduran
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              maxLength={MAKS_URL_LACAK}
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="https://www.tiktok.com/@akun/video/…"
              aria-invalid={galatForm ? true : undefined}
              aria-describedby={galatForm ? "lacak-galat-form" : undefined}
              className="glass-input h-11 w-full rounded-xl px-3 text-[13.5px] font-normal text-teks-utama"
            />
          </label>
          <button
            type="submit"
            disabled={job.memulai || !urlBersih}
            className="btn-tekan flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-5 text-[13.5px] font-extrabold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            {job.memulai ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
            Lacak sumber
          </button>
        </form>
        {galatForm && (
          <p id="lacak-galat-form" role="alert" className="mt-2 mb-0 text-[12px] text-gagal">
            {galatForm}
          </p>
        )}
        {job.galat && !hasil && (
          <p role="alert" className="mt-2 mb-0 rounded-xl border border-gagal/30 bg-gagal/10 px-3 py-2.5 text-[12px] text-teks-utama">
            {job.galat}
          </p>
        )}
      </GlassCard>

      <div ref={hasilRef} className="scroll-mt-4" aria-live="polite">
        {hasil && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="m-0 min-w-0 truncate text-[15px] font-extrabold text-teks-utama">Hasil pelacakan</h2>
              <div className="flex shrink-0 gap-1.5">
                {hasil.status !== "antre" && hasil.status !== "berjalan" && urlUlang && (
                  <button
                    type="button"
                    onClick={() => void lacak(urlUlang)}
                    disabled={job.memulai}
                    className="glass btn-tekan flex min-h-11 items-center gap-1.5 rounded-xl px-3.5 text-[12.5px] font-bold text-teks-utama disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Lacak ulang
                  </button>
                )}
                <button
                  type="button"
                  onClick={job.tutup}
                  aria-label="Tutup hasil pelacakan"
                  className="glass btn-tekan flex h-11 w-11 items-center justify-center rounded-xl text-teks-utama"
                >
                  <X className="h-4.5 w-4.5" aria-hidden="true" />
                </button>
              </div>
            </div>
            <HasilLacakView
              key={hasil.id}
              hasil={hasil}
              memutus={job.memutus}
              galat={job.galat}
              onPutuskan={(aksi, kandidat) => {
                void job.putuskan(aksi, kandidat).then((d) => {
                  if (d) muatUlang();
                });
              }}
              onUlang={urlUlang ? () => void lacak(urlUlang) : undefined}
            />
          </div>
        )}
      </div>

      <GlassCard className="p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="m-0 text-[15px] font-extrabold text-teks-utama">Riwayat pelacakan terbaru</h2>
          <button
            type="button"
            onClick={muatUlang}
            aria-label="Muat ulang riwayat"
            className="glass btn-tekan flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-teks-utama"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {riwayat.galat && (
          <p role="alert" className="mb-2 text-[12px] text-gagal">
            {riwayat.galat}
          </p>
        )}
        {riwayat.item === null ? (
          riwayat.galat ? null : <GlassSkeleton className="h-28 rounded-2xl" />
        ) : riwayat.item.length === 0 ? (
          <p className="m-0 text-[12.5px] text-teks-sekunder">Belum ada pelacakan. Tempel link video saduran di atas untuk memulai.</p>
        ) : (
          <TabelRiwayat item={riwayat.item} aktifId={hasil?.id ?? null} onBuka={(id) => void buka(id)} />
        )}
      </GlassCard>
    </div>
  );
}

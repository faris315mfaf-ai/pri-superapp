"use client";

// ============================================================
// AntreanAccView (Oktober 2026) — tampilan "Antrean ACC" Ruang Bot.
//
// Komponen PRESENTASIONAL terkontrol: daftar antrean & riwayat dimiliki
// cangkang layar. Yang lokal di sini hanya (1) suntingan caption per
// video dan (2) video mana yang sedang menunggu konfirmasi "Setujui".
//
// Posting yang sudah tayang TIDAK bisa ditarik, jadi "Setujui & jadwalkan"
// memakai konfirmasi di halaman: klik pertama mengubah tombol jadi
// "Yakin? Tayang di <platform> · <waktu>", klik kedua baru memanggil
// onKeputusan. "Minta edit ulang" dan "Tolak" langsung dikirim.
// Sumber visual: docs/mockups/pri-ruang-bot.html (renderAcc).
// ============================================================

import { useState } from "react";
import { GlassCard } from "@/components/glass-card";
import { cn } from "@/lib/utils";
import type { BotContoh, ItemAcc, KeputusanAcc, KesehatanTanda } from "./tipe";

export type AntreanAccViewProps = {
  antrean: ItemAcc[];
  riwayat: KeputusanAcc[];
  bots: BotContoh[];
  onKeputusan: (id: number, jenis: "setuju" | "ulang" | "tolak", caption: string) => void;
};

const KELAS_TANDA: Record<KesehatanTanda, string> = {
  ok: "bg-sukses/15 text-emerald-700 dark:text-emerald-400",
  warn: "bg-emas/20 text-amber-700 dark:text-amber-300",
  bad: "bg-gagal/15 text-red-700 dark:text-red-400",
};

const SR_TANDA: Record<KesehatanTanda, string> = {
  ok: "Baik: ",
  warn: "Perhatian: ",
  bad: "Masalah: ",
};

function Tanda({ jenis, teks }: { jenis: KesehatanTanda; teks: string }) {
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", KELAS_TANDA[jenis])}>
      <span className="sr-only">{SR_TANDA[jenis]}</span>
      {teks}
    </span>
  );
}

const KELAS_TOMBOL =
  "btn-tekan min-h-11 rounded-xl border px-3.5 py-2 text-[13px] font-bold sm:min-h-10 disabled:opacity-50";

function KartuAcc({
  item,
  bot,
  caption,
  onCaption,
  konfirmasi,
  onKonfirmasi,
  onKeputusan,
}: {
  item: ItemAcc;
  bot: BotContoh | undefined;
  caption: string;
  onCaption: (v: string) => void;
  konfirmasi: boolean;
  onKonfirmasi: (v: boolean) => void;
  onKeputusan: AntreanAccViewProps["onKeputusan"];
}) {
  const idCaption = `acc-caption-${item.id}`;
  const putus = (jenis: "setuju" | "ulang" | "tolak") => {
    onKonfirmasi(false);
    onKeputusan(item.id, jenis, caption);
  };

  return (
    <GlassCard className="grid gap-3.5 p-3 sm:grid-cols-[132px_minmax(0,1fr)] sm:p-3.5">
      {/* Pratinjau 9:16 (gradasi sementara, belum video asli) */}
      <div
        role="img"
        aria-label={`Pratinjau video ${item.judul}`}
        className="relative aspect-[9/16] w-[132px] max-w-full overflow-hidden rounded-[10px] border border-glass-border"
        style={{ background: `linear-gradient(160deg, ${item.gradasi[0]}, ${item.gradasi[1]})` }}
      >
        <span className="absolute left-2 top-2 rounded-[3px] bg-[#c2413b] px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.08em] text-white">
          {item.kategori}
        </span>
        <span className="absolute right-1.5 top-2 rounded-[3px] bg-black/60 px-1.5 py-px font-mono text-[9px] font-bold text-white">
          {item.durasiDetik} dtk
        </span>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2.5 pt-6 font-heading text-[13px] font-bold leading-tight text-white">
          <em className="block not-italic text-amber-200">{item.hook[0]}</em>
          {item.hook[1]}
        </div>
      </div>

      <div className="min-w-0">
        <h3 className="m-0 mb-1 break-words font-heading text-[15px] font-bold leading-snug text-teks-utama">{item.judul}</h3>
        <p className="m-0 text-xs leading-relaxed text-teks-sekunder">
          Disiapkan{" "}
          <b className="inline-flex items-center gap-1 text-teks-utama">
            {bot && <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: bot.warna }} />}
            {bot?.nama ?? item.botId}
          </b>{" "}
          · sumber {item.akunSumber} ({item.platformSumber}) · tayang di {item.platformTujuan} · {item.waktuTayang}
        </p>

        <ul className="m-0 my-2 flex list-none flex-wrap gap-1.5 p-0" aria-label="Hasil pemeriksaan otomatis">
          {item.tanda.map((t, i) => (
            <li key={`${t.teks}-${i}`}>
              <Tanda jenis={t.jenis} teks={t.teks} />
            </li>
          ))}
        </ul>

        <label htmlFor={idCaption} className="mb-1 block text-xs text-teks-sekunder">
          Caption (bisa disunting)
        </label>
        <textarea
          id={idCaption}
          value={caption}
          onChange={(e) => onCaption(e.target.value)}
          rows={4}
          className="glass-input min-h-[78px] w-full resize-y rounded-xl px-3 py-2 text-base text-teks-utama sm:text-[12.5px]"
        />

        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            id={`acc-setuju-${item.id}`}
            type="button"
            onClick={() => (konfirmasi ? putus("setuju") : onKonfirmasi(true))}
            className={cn(
              KELAS_TOMBOL,
              konfirmasi
                ? "border-transparent bg-sukses text-white"
                : "border-sukses/50 bg-sukses/10 text-emerald-700 dark:text-emerald-300",
            )}
          >
            {konfirmasi ? `Yakin? Tayang di ${item.platformTujuan} · ${item.waktuTayang}` : "Setujui & jadwalkan"}
          </button>
          {konfirmasi ? (
            <button
              id={`acc-batal-${item.id}`}
              type="button"
              onClick={() => onKonfirmasi(false)}
              className={cn(KELAS_TOMBOL, "border-glass-border text-teks-utama")}
            >
              Batal
            </button>
          ) : (
            <>
              <button
                id={`acc-ulang-${item.id}`}
                type="button"
                onClick={() => putus("ulang")}
                className={cn(KELAS_TOMBOL, "border-glass-border text-teks-utama")}
              >
                Minta edit ulang
              </button>
              <button
                id={`acc-tolak-${item.id}`}
                type="button"
                onClick={() => putus("tolak")}
                className={cn(KELAS_TOMBOL, "border-gagal/50 text-red-600 hover:bg-gagal/10 dark:text-red-400")}
              >
                Tolak
              </button>
            </>
          )}
        </div>
        {konfirmasi && (
          <p role="status" className="m-0 mt-2 text-xs text-teks-sekunder">
            Video yang sudah tayang tidak bisa ditarik. Tekan tombol hijau sekali lagi untuk menyetujui, atau Batal.
          </p>
        )}
      </div>
    </GlassCard>
  );
}

export function AntreanAccView({ antrean, riwayat, bots, onKeputusan }: AntreanAccViewProps) {
  // Suntingan caption per video; belum disentuh = pakai caption bawaan item.
  const [suntingan, setSuntingan] = useState<Record<number, string>>({});
  // Satu video saja yang boleh dalam keadaan "menunggu konfirmasi".
  const [konfirmasiId, setKonfirmasiId] = useState<number | null>(null);

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 font-heading text-[11px] font-bold uppercase tracking-[0.08em] text-teks-sekunder">
          Menunggu keputusan Pimred
        </h2>
        <span className="text-xs text-teks-sekunder" aria-live="polite">
          {antrean.length > 0 ? `${antrean.length} video menunggu` : ""}
        </span>
      </div>

      {antrean.length === 0 ? (
        <GlassCard className="p-6 text-center text-sm text-teks-sekunder">
          Tidak ada video yang menunggu. Bot bermode ACC akan mengirim hasilnya ke sini.
        </GlassCard>
      ) : (
        <div className="grid gap-3">
          {antrean.map((item) => (
            <KartuAcc
              key={item.id}
              item={item}
              bot={bots.find((b) => b.id === item.botId)}
              caption={suntingan[item.id] ?? item.caption}
              onCaption={(v) => setSuntingan((s) => ({ ...s, [item.id]: v }))}
              konfirmasi={konfirmasiId === item.id}
              onKonfirmasi={(v) => setKonfirmasiId((id) => (v ? item.id : id === item.id ? null : id))}
              onKeputusan={onKeputusan}
            />
          ))}
        </div>
      )}

      <GlassCard className="p-3.5">
        <h3 className="m-0 mb-2.5 font-heading text-[11px] font-bold uppercase tracking-[0.08em] text-teks-sekunder">
          Riwayat keputusan
        </h3>
        {riwayat.length === 0 ? (
          <p className="m-0 text-xs text-teks-sekunder">Belum ada keputusan hari ini.</p>
        ) : (
          <ul className="m-0 list-none p-0 text-[12.5px]">
            {riwayat.map((r, i) => (
              <li
                key={`${r.judul}-${i}`}
                className="flex items-center justify-between gap-2 border-b border-dashed border-glass-border py-1.5 last:border-b-0"
              >
                <span className="min-w-0 break-words text-teks-utama">
                  {r.judul} <span className="text-teks-sekunder">· {r.botNama}</span>
                </span>
                <Tanda jenis={r.jenis} teks={r.label} />
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}

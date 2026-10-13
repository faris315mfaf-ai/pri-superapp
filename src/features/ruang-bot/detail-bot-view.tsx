"use client";

// ============================================================
// DetailBotView (Oktober 2026) — tampilan "Detail Bot" Ruang Bot.
//
// Komponen PRESENTASIONAL terkontrol: seluruh state (bot terpilih, mode,
// jeda, kuota, status hidup) dimiliki cangkang layar dan masuk lewat
// props; tampilan ini hanya menggambar dan memanggil callback.
// Sumber visual: docs/mockups/pri-ruang-bot.html (renderDetail).
//
// Mode contoh: angka yang masih CONTOH (belum dari server): rata-rata
// tayangan, persentase disetujui Pimred, ID mesin, status koneksi.
// Mode NYATA (prop `nyata`): identitas, mode, jeda, kuota, jam aktif, akun
// tertaut, dan log dari server; riwayat 7 hari, jadwal, tayangan, dan sumber
// belum tersedia sehingga ditandai "belum ada data" (bukan angka palsu).
// ============================================================

import { useMemo } from "react";
import { GlassCard } from "@/components/glass-card";
import { tanggalWibHariIni } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NAMA_TAHAP, WARNA_TAHAP } from "./data-contoh";
import { GrafikBatang7Hari, LiniMasaJadwal } from "./grafik-bot";
import { PotretBot } from "./potret-bot";
import type { BotContoh, HasilHariIni, LogItem, ModeBot, StatusHidup, SumberContoh, TahapBot } from "./tipe";

export type DetailBotViewProps = {
  bots: BotContoh[];
  terpilihId: string;
  onPilihId: (id: string) => void;
  status: Record<string, StatusHidup>;
  /** Jumlah post hari ini per bot. */
  kuota: Record<string, number>;
  /** Batas post per bot per hari. */
  maksKuota: number;
  hasil: HasilHariIni[];
  log: LogItem[];
  sumber: SumberContoh[];
  /** Bot yang sedang dijeda satu per satu. */
  jedaBot: Record<string, boolean>;
  /** Jam simulasi dalam jam desimal WIB (9,25 = 09:15). */
  jamSimulasi: number;
  onUbahMode: (id: string, mode: ModeBot) => void;
  onJedaBot: (id: string, v: boolean) => void;
  /** Mode data nyata dari server (bagian yang belum tersedia ditandai "belum ada data"). */
  nyata?: boolean;
  /** Kunci kontrol yang sedang memproses aksi ke server (lihat kunciAksi). */
  sibuk?: ReadonlySet<string>;
};

const NAMA_HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

/** Label 7 hari terakhir (hari ini paling kanan) menurut tanggal WIB. */
function labelTujuhHari(hariIni: string): string[] {
  const dasar = Date.parse(`${hariIni}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(dasar - (6 - i) * 86_400_000);
    return NAMA_HARI[d.getUTCDay()];
  });
}

const SATU_TAHAP: TahapBot[] = ["cari", "edit", "posting"];

const ATURAN_KESELAMATAN = (maks: number, jam: string) => [
  `Kuota ${maks} post per hari, jam aktif ${jam} WIB.`,
  "Hanya mengambil dari daftar sumber di atas.",
  "Caption selalu memuat kredit sumber.",
  "Pagar dobel: video yang sama tidak diposting dua kali.",
  "Berhenti otomatis bila gagal 3× berturut-turut.",
];

function Judul({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={cn("mb-2.5 font-heading text-[11px] font-bold uppercase tracking-[0.08em] text-teks-sekunder", className)}>
      {children}
    </h3>
  );
}

function Ubin({ nilai, label }: { nilai: string; label: string }) {
  return (
    <div className="rounded-xl border border-glass-border bg-black/[0.03] px-3 py-2.5 dark:bg-white/[0.04]">
      <b className="angka-tab block font-heading text-xl font-extrabold leading-tight text-teks-utama">{nilai}</b>
      <span className="text-[11.5px] leading-snug text-teks-sekunder">{label}</span>
    </div>
  );
}

function KolomKanban({
  judul,
  warna,
  kartu,
}: {
  judul: string;
  warna: string;
  kartu: { teks: string; hidup?: boolean }[];
}) {
  return (
    <div
      className="min-h-[90px] rounded-xl border border-glass-border border-t-[3px] bg-black/[0.03] p-2 dark:bg-white/[0.04]"
      style={{ borderTopColor: warna }}
    >
      <h4 className="mb-1.5 flex items-center gap-1.5 font-heading text-[11px] font-bold uppercase tracking-wide text-teks-sekunder">
        <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: warna }} />
        {judul}
      </h4>
      {kartu.length === 0 ? (
        <span className="text-[11.5px] text-teks-sekunder">kosong</span>
      ) : (
        <ul className="space-y-1.5">
          {kartu.map((k, i) => (
            <li
              key={`${k.teks}-${i}`}
              className={cn(
                "break-words rounded-lg bg-black/[0.05] px-2 py-1.5 text-[11.5px] leading-snug text-teks-utama dark:bg-white/[0.07]",
                k.hidup && "outline outline-1",
              )}
              style={k.hidup ? { outlineColor: warna } : undefined}
            >
              {k.teks}
              {k.hidup && <span className="sr-only"> (sedang dikerjakan)</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DetailBotView(p: DetailBotViewProps) {
  const {
    bots, terpilihId, onPilihId, status, kuota, maksKuota, hasil, log, sumber, jedaBot, jamSimulasi, onUbahMode, onJedaBot,
    nyata = false, sibuk,
  } = p;

  // Tanggal WIB hanya dihitung sekali per pemasangan (cukup untuk label hari).
  const labelHari = useMemo(() => labelTujuhHari(tanggalWibHariIni()), []);

  const indeks = Math.max(0, bots.findIndex((b) => b.id === terpilihId));
  const bot = bots[indeks];
  if (!bot) {
    return (
      <GlassCard className="p-6 text-center text-sm text-teks-sekunder">Belum ada bot untuk ditampilkan.</GlassCard>
    );
  }

  const st = status[bot.id];
  const dijeda = !!jedaBot[bot.id];
  const postHariIni = kuota[bot.id] ?? 0;
  // Kuota milik bot ini (nyata) atau kuota bersama (contoh).
  const kuotaBot = bot.kuotaHarian ?? maksKuota;
  const data7 = [...bot.riwayat6Hari, postHariIni];
  const total7 = data7.reduce((a, c) => a + c, 0);
  const sumberBot = sumber.filter((s) => s.botId === bot.id);
  const jamAktif = bot.nyata ? `${bot.nyata.jamMulai}–${bot.nyata.jamSelesai}` : "08:00–20:00";
  const jamAktifAngka = (hhmm: string, bawaan: number) => {
    const j = Number.parseInt(hhmm.slice(0, 2), 10);
    const m = Number.parseInt(hhmm.slice(3, 5), 10);
    return Number.isFinite(j) && Number.isFinite(m) ? j + m / 60 : bawaan;
  };
  const sibukMode = !!sibuk?.has(`mode:${bot.nyata?.id ?? bot.id}`);
  const sibukJeda = !!sibuk?.has(`jeda:${bot.nyata?.id ?? bot.id}`);
  const hasilBot = hasil.filter((h) => h.botId === bot.id).slice(0, 2);
  const logBot = log.filter((l) => l.botId === bot.id).slice(0, 14);

  const labelStatus = dijeda
    ? "Dijeda"
    : nyata
      ? "Menunggu tugas"
      : !st
        ? "Menunggu"
        : st.keadaan === "bekerja"
          ? (st.tahap ? NAMA_TAHAP[st.tahap] : "Bekerja")
          : st.keadaan === "berjalan"
            ? "Berjalan"
            : "Menunggu";

  // Kartu "live" kanban: hanya bila bot sedang bekerja/berjalan di salah satu tahap.
  const sedangAktif = !nyata && !dijeda && (st?.keadaan === "bekerja" || st?.keadaan === "berjalan");
  const kartuKolom = (tahap: TahapBot): { teks: string; hidup?: boolean }[] =>
    sedangAktif && st?.tahap === tahap && st.judul ? [{ teks: st.judul, hidup: true }] : [];

  return (
    <div className="space-y-3.5">
      {/* Pemilih bot */}
      <div role="group" aria-label="Pilih bot" className="flex flex-wrap gap-2">
        {bots.map((b) => {
          const aktif = b.id === bot.id;
          return (
            <button
              key={b.id}
              id={`pilih-bot-${b.id}`}
              type="button"
              aria-pressed={aktif}
              onClick={() => onPilihId(b.id)}
              className={cn(
                "glass btn-tekan flex min-h-11 items-center gap-2.5 rounded-xl py-1.5 pl-2 pr-3.5 text-left",
                aktif && "ring-2 ring-pri",
              )}
            >
              <PotretBot rupa={b.rupa} lencana={b.warna} skala={1.5} label={`Potret ${b.nama}`} className="shrink-0 rounded-lg bg-black/5 dark:bg-white/10" />
              <span className="text-[13px] font-bold leading-tight text-teks-utama">
                {b.nama}
                <span className="block text-[11px] font-medium text-teks-sekunder">{b.peran}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid items-start gap-3.5 xl:grid-cols-[18.5rem_minmax(0,1fr)]">
        {/* Potret + identitas */}
        <GlassCard className="flex flex-col items-center gap-2.5 p-3.5 text-center">
          <div className="rounded-2xl border border-glass-border bg-gradient-to-b from-violet-200/70 to-violet-300/40 p-2 dark:from-[#2b2440] dark:to-[#1d1830]">
            <PotretBot rupa={bot.rupa} lencana={bot.warna} skala={5} label={`Potret ${bot.nama}`} />
          </div>
          <h2 className="font-heading text-2xl font-extrabold leading-none" style={{ color: bot.warna }}>
            {bot.nama}
          </h2>
          <span className="text-xs text-teks-sekunder">{bot.peran}</span>
          <p className="m-0 text-xs leading-relaxed text-teks-sekunder">{bot.persona}</p>

          <dl className="grid w-full grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-left text-[12.5px]">
            <dt className="text-teks-sekunder">Akun</dt>
            <dd className="m-0 break-words text-teks-utama">
              {bot.handle} · {bot.platform}
            </dd>
            {bot.nyata ? (
              <>
                <dt className="text-teks-sekunder">Akun tertaut</dt>
                <dd className="m-0 text-teks-utama">
                  <span className="angka-tab">{bot.nyata.akunTertaut}</span> akun di TVR Saya
                </dd>
              </>
            ) : (
              <>
                <dt className="text-teks-sekunder">Koneksi</dt>
                <dd className="m-0 text-teks-utama">
                  <span className="mr-1.5 inline-block rounded-full bg-sukses/15 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700 dark:text-emerald-400">
                    Terhubung
                  </span>
                  token sehat
                </dd>
              </>
            )}
            <dt className="text-teks-sekunder">Status</dt>
            <dd className="m-0 break-words text-teks-utama" aria-live="polite">
              {labelStatus}
              {!nyata && !dijeda && st?.teks ? ` · ${st.teks}` : ""}
            </dd>
            <dt className="text-teks-sekunder">Mode</dt>
            <dd className="m-0">
              <div role="group" aria-label={`Mode ${bot.nama}`} className="inline-flex overflow-hidden rounded-xl border border-glass-border">
                {(["otomatis", "acc"] as const).map((m) => {
                  const pilih = bot.mode === m;
                  return (
                    <button
                      key={m}
                      id={`mode-${bot.id}-${m}`}
                      type="button"
                      aria-pressed={pilih}
                      disabled={sibukMode}
                      onClick={() => !pilih && onUbahMode(bot.id, m)}
                      className={cn(
                        "min-h-11 px-3 text-xs font-bold transition-colors disabled:opacity-50 sm:min-h-9",
                        pilih
                          ? m === "acc"
                            ? "bg-emas/20 text-amber-700 dark:text-amber-300"
                            : "bg-sukses/20 text-emerald-700 dark:text-emerald-300"
                          : "text-teks-sekunder hover:bg-black/5 dark:hover:bg-white/10",
                      )}
                    >
                      {m === "acc" ? "Perlu ACC" : "Otomatis"}
                    </button>
                  );
                })}
              </div>
            </dd>
            <dt className="text-teks-sekunder">ID mesin</dt>
            <dd className="m-0 text-teks-sekunder">
              {bot.nyata ? <span className="angka-tab text-teks-utama">{bot.nyata.userId}</span> : `90000000${indeks + 2} (contoh)`}
            </dd>
            {bot.nyata && (
              <>
                <dt className="text-teks-sekunder">Gagal beruntun</dt>
                <dd className="m-0 text-teks-utama">
                  <span className="angka-tab">{bot.nyata.gagalBeruntun}</span>
                  {bot.nyata.gagalBeruntun >= 3 && <span className="ml-1.5 font-semibold text-red-600 dark:text-red-400">(berhenti otomatis)</span>}
                </dd>
              </>
            )}
          </dl>

          <button
            id={`jeda-${bot.id}`}
            type="button"
            disabled={sibukJeda}
            aria-busy={sibukJeda}
            onClick={() => onJedaBot(bot.id, !dijeda)}
            className={cn(
              "btn-tekan min-h-11 w-full rounded-xl border px-3 text-[13px] font-bold disabled:opacity-50 sm:min-h-10",
              dijeda
                ? "border-sukses/50 bg-sukses/10 text-emerald-700 dark:text-emerald-300"
                : "border-gagal/50 text-red-600 hover:bg-gagal/10 dark:text-red-400",
            )}
          >
            {dijeda ? "Lanjutkan bot ini" : "Jeda bot ini"}
          </button>
        </GlassCard>

        <div className="min-w-0 space-y-3.5">
          {/* Ubin metrik */}
          <div>
            {nyata ? (
              <>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <Ubin nilai={`${postHariIni}/${kuotaBot}`} label="Post hari ini" />
                  <Ubin nilai="—" label="Post 7 hari (belum ada data)" />
                  <Ubin nilai="—" label="Rata-rata tayangan (belum ada data)" />
                  <Ubin nilai="—" label="Disetujui Pimred (belum ada data)" />
                </div>
                <p className="mt-1.5 text-[11px] text-teks-sekunder">
                  Yang bertanda &quot;belum ada data&quot; baru terisi setelah runner mulai bekerja dan mencatat hasilnya.
                </p>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <Ubin nilai={`${postHariIni}/${kuotaBot}`} label="Post hari ini" />
                  <Ubin nilai={String(total7)} label="Post 7 hari" />
                  <Ubin nilai={bot.rataTayangan} label="Rata-rata tayangan (contoh)" />
                  <Ubin nilai={bot.mode === "otomatis" ? "—" : "92%"} label="Disetujui Pimred (contoh)" />
                </div>
                <p className="mt-1.5 text-[11px] text-teks-sekunder">Data contoh: tayangan dan persentase disetujui belum dari server.</p>
              </>
            )}
          </div>

          <div className="grid gap-3.5 lg:grid-cols-2">
            <GlassCard className="p-3.5">
              <Judul>Post 7 hari terakhir</Judul>
              {nyata ? (
                <p className="m-0 py-6 text-center text-xs text-teks-sekunder">
                  Belum ada data. Riwayat post harian akan tampil setelah runner mulai memposting.
                </p>
              ) : (
                <GrafikBatang7Hari data={data7} hari={labelHari} warna={bot.warna} kuota={kuotaBot} nama={bot.nama} />
              )}
            </GlassCard>
            <GlassCard className="p-3.5">
              <Judul>Jadwal posting hari ini</Judul>
              <LiniMasaJadwal
                jadwal={bot.jadwalHariIni}
                warna={bot.warna}
                jamSekarang={jamSimulasi}
                jamAktifMulai={bot.nyata ? jamAktifAngka(bot.nyata.jamMulai, 8) : undefined}
                jamAktifSelesai={bot.nyata ? jamAktifAngka(bot.nyata.jamSelesai, 20) : undefined}
                nama={bot.nama}
              />
              <p className="mt-2 text-[11.5px] text-teks-sekunder">
                {nyata ? "Belum ada jadwal posting. " : ""}
                Pita kuning = jam aktif {jamAktif}. Garis merah = sekarang.
              </p>
            </GlassCard>
          </div>

          <GlassCard className="p-3.5">
            <Judul>Alur tugas</Judul>
            {nyata && (
              <p className="m-0 mb-2 text-[11.5px] text-teks-sekunder">
                Runner belum mengerjakan tugas apa pun pada tahap ini, jadi semua kolom kosong.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {SATU_TAHAP.map((t) => (
                <KolomKanban key={t} judul={NAMA_TAHAP[t]} warna={WARNA_TAHAP[t]} kartu={kartuKolom(t)} />
              ))}
              <KolomKanban
                judul="Selesai hari ini"
                warna="#34d399"
                kartu={hasilBot.map((h) => ({ teks: h.judul }))}
              />
            </div>
          </GlassCard>

          <div className="grid gap-3.5 lg:grid-cols-2">
            <GlassCard className="p-3.5">
              <Judul>Sumber yang dipakai</Judul>
              {sumberBot.length === 0 ? (
                <p className="m-0 text-xs text-teks-sekunder">Belum ada sumber. Tambah di tab Sumber &amp; Kuota.</p>
              ) : (
                <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                  {sumberBot.map((s, i) => (
                    <li
                      key={`${s.akun}-${s.platform}-${i}`}
                      className={cn(
                        "break-all rounded-full border border-glass-border bg-black/[0.04] px-2.5 py-0.5 text-xs text-teks-utama dark:bg-white/[0.06]",
                        !s.aktif && "opacity-55",
                      )}
                    >
                      {s.akun} · {s.platform}
                      {!s.aktif && <span className="sr-only"> (nonaktif)</span>}
                    </li>
                  ))}
                </ul>
              )}

              <Judul className="mt-4">Batas keselamatan</Judul>
              <ul className="m-0 grid list-none gap-1.5 p-0 text-[12.5px] text-teks-utama">
                {ATURAN_KESELAMATAN(kuotaBot, jamAktif).map((a) => (
                  <li key={a} className="flex gap-2">
                    <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-sm bg-sukses" />
                    {a}
                  </li>
                ))}
              </ul>
            </GlassCard>

            <GlassCard className="p-3.5">
              <Judul>Aktivitas terakhir</Judul>
              {logBot.length === 0 ? (
                <p className="m-0 text-xs text-teks-sekunder">
                  {nyata ? "Belum ada aktivitas dari runner untuk bot ini." : "Belum ada aktivitas."}
                </p>
              ) : (
                <ol className="m-0 max-h-[340px] list-none overflow-y-auto p-0 text-[12px] leading-snug">
                  {logBot.map((l, i) => (
                    <li
                      key={`${l.waktu}-${i}`}
                      className="flex items-baseline gap-2 border-b border-dashed border-glass-border py-1.5 last:border-b-0"
                    >
                      <time className="shrink-0 font-mono text-teks-sekunder">{l.waktu}</time>
                      <span className="flex shrink-0 items-center gap-1 rounded border border-glass-border px-1.5 text-[10px] font-bold text-teks-sekunder">
                        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: WARNA_TAHAP[l.tahap] }} />
                        {NAMA_TAHAP[l.tahap]}
                      </span>
                      <span className="min-w-0 break-words text-teks-utama">{l.teks}</span>
                    </li>
                  ))}
                </ol>
              )}
            </GlassCard>
          </div>
        </div>
      </div>
    </div>
  );
}

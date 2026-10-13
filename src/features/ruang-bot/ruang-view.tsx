"use client";

// ============================================================
// RUANG VIEW — isi tab "Ruang" pada layar Ruang Bot.
//
// Toolbar (Siang/Malam, kecepatan, Hari baru, Jeda darurat), kartu kanvas
// isometrik dengan HUD + spanduk jeda + legenda tahap, dan panel samping:
// Tim bot, Umpan aktivitas langsung, Hasil hari ini.
//
// State kuota / hasil / log / mode / jeda dimiliki cangkang layar. Komponen
// ini hanya MEMBACA lewat props dan MELAPOR lewat callback. Simulasi dibuat
// sekali (useState malas) dan disinkronkan lewat setter — tidak dibuat ulang
// saat props berubah.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { GlassCard } from "@/components/glass-card";
import { useLebarWadah } from "@/hooks/use-kolom-wadah";
import { useIntervalAktif } from "@/hooks/use-tab-aktif";
import { cn } from "@/lib/utils";
import { NAMA_TAHAP, URUTAN_TAHAP, WARNA_TAHAP } from "./data-contoh";
import { PotretBot } from "./potret-bot";
import { RuangIsometrik } from "./ruang-isometrik";
import { SimulasiBot, formatJam } from "./simulasi-bot";
import type { BotContoh, HasilHariIni, LogItem, ModeBot, StatusHidup, TahapBot } from "./tipe";

export type RuangViewProps = {
  bots: BotContoh[];
  kuota: Record<string, number>;
  maksKuota: number;
  hasil: HasilHariIni[];
  log: LogItem[];
  terpilihId: string | null;
  jedaGlobal: boolean;
  onPilih: (id: string | null) => void;
  onUbahMode: (id: string, mode: ModeBot) => void;
  onBukaDetail: (id: string) => void;
  onJedaGlobal: (v: boolean) => void;
  onHariBaru: () => void;
  onBotSelesaiPosting: (botId: string, judul: string) => void;
  onLog: (item: LogItem) => void;
  onStatus: (s: Record<string, StatusHidup>) => void;
  /**
   * Mode data nyata: simulasi DIAM (bot menunggu tugas di sofa, tanpa siklus tahap
   * dan tanpa posting palsu), tanpa kecepatan/"Hari baru", kuota per bot dari server.
   */
  nyata?: boolean;
  /** Kunci kontrol yang sedang memproses aksi ke server (lihat kunciAksi). */
  sibuk?: ReadonlySet<string>;
};

const KECEPATAN = [1, 3, 8] as const;
/** Lebar isi wadah (px) minimal untuk tata letak 2 kolom (kanvas + panel). */
const BATAS_DUA_KOLOM = 900;
const LEBAR_PANEL = 380;
const MAKS_BARIS_LOG = 40;
const WARNA_NETRAL = "#a79fb2";

// ---------- potret ringan untuk UI (diperbarui 2x/detik, bukan tiap frame) ----------

type PotretBotUI = { tahap: TahapBot; keadaan: StatusHidup["keadaan"]; teks: string };

type Potret = {
  bots: Record<string, PotretBotUI>;
  perTahap: Record<TahapBot, string[]>;
  render: number;
  antre: number;
  jam: string;
};

function buatPotret(sim: SimulasiBot): Potret {
  const bots: Record<string, PotretBotUI> = {};
  const perTahap: Record<TahapBot, string[]> = { cari: [], edit: [], posting: [], istirahat: [] };
  let render = 0;
  let antre = 0;
  for (const b of sim.bots) {
    bots[b.id] = { tahap: b.tahap, keadaan: b.keadaan, teks: b.teks };
    if (b.keadaan === "bekerja") {
      perTahap[b.tahap].push(b.id);
      if (b.tahap === "edit") render++;
    } else if (b.keadaan === "menunggu") {
      antre++;
    }
  }
  return { bots, perTahap, render, antre, jam: formatJam(sim.jamSimulasi) };
}

// ---------- potongan tampilan ----------

function Judul({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2.5 font-mono text-[11px] font-bold uppercase tracking-wider text-teks-sekunder">{children}</h3>;
}

function Segmen<T extends string | number>({
  label,
  pilihan,
  nilai,
  onPilih,
  format,
}: {
  label: string;
  pilihan: readonly T[];
  nilai: T;
  onPilih: (v: T) => void;
  format: (v: T) => string;
}) {
  return (
    <div role="group" aria-label={label} className="glass inline-flex overflow-hidden rounded-xl p-0.5">
      {pilihan.map((v) => (
        <button
          key={String(v)}
          type="button"
          aria-pressed={nilai === v}
          onClick={() => onPilih(v)}
          className={cn(
            "rounded-[10px] px-3 text-[12.5px] font-bold transition-colors max-md:min-h-11 md:h-8",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-pri",
            nilai === v ? "bg-pri/15 text-pri" : "text-teks-sekunder hover:text-teks-utama",
          )}
        >
          {format(v)}
        </button>
      ))}
    </div>
  );
}

function ChipTahap({ warna, label }: { warna: string; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-px text-[10.5px] font-bold text-teks-utama"
      style={{ borderColor: warna }}
    >
      <i className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: warna }} />
      {label}
    </span>
  );
}

function KartuBot({
  bot,
  potret,
  kuota,
  maksKuota,
  terpilih,
  jeda,
  nyata,
  sibukMode,
  onPilih,
  onUbahMode,
  onBukaDetail,
}: {
  bot: BotContoh;
  potret: PotretBotUI | undefined;
  kuota: number;
  maksKuota: number;
  terpilih: boolean;
  jeda: boolean;
  /** Mode data nyata: status = "Menunggu tugas" / "Dijeda" (tanpa tahap simulasi). */
  nyata: boolean;
  /** Perubahan mode bot ini sedang diproses server. */
  sibukMode: boolean;
  onPilih: () => void;
  onUbahMode: (mode: ModeBot) => void;
  onBukaDetail: () => void;
}) {
  const bekerja = !nyata && potret?.keadaan === "bekerja";
  const warnaTahap = bekerja && potret ? WARNA_TAHAP[potret.tahap] : WARNA_NETRAL;
  const dijedaNyata = jeda || !!bot.nyata?.jeda;
  const labelTahap = nyata
    ? dijedaNyata
      ? "Dijeda"
      : "Menunggu tugas"
    : !potret
      ? "Menunggu"
      : bekerja
        ? jeda && potret.tahap === "istirahat"
          ? "Dijeda"
          : NAMA_TAHAP[potret.tahap]
        : potret.keadaan === "berjalan"
          ? "Berjalan"
          : "Menunggu";
  const persen = maksKuota > 0 ? Math.min(100, (kuota / maksKuota) * 100) : 100;
  const otomatis = bot.mode === "otomatis";

  return (
    <li
      className={cn(
        "relative rounded-xl border p-2.5",
        terpilih ? "border-emas bg-emas/10" : "border-black/10 bg-black/[0.03] dark:border-white/10 dark:bg-white/5",
      )}
    >
      {/* Tombol pilih menutupi seluruh kartu; kontrol lain berada di atasnya. */}
      <button
        type="button"
        aria-pressed={terpilih}
        aria-label={`Pilih ${bot.nama}, ${bot.peran}`}
        onClick={onPilih}
        className="absolute inset-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emas"
      />
      <div className="pointer-events-none relative grid grid-cols-[84px_minmax(0,1fr)] gap-2.5">
        <PotretBot
          rupa={bot.rupa}
          lencana={bot.warna}
          skala={3}
          label={`Potret ${bot.nama}`}
          className="rounded-[10px] bg-black/5 dark:bg-white/10"
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="text-[14px] font-bold text-teks-utama">{bot.nama}</span>
            <span className="text-[11px] font-semibold text-teks-sekunder">{bot.peran}</span>
            <ChipTahap warna={warnaTahap} label={labelTahap} />
          </div>
          <p className="mt-0.5 min-h-[1.2em] text-[12px] leading-snug text-teks-utama">{potret?.teks || "—"}</p>
          <p className="truncate text-[11.5px] text-teks-sekunder">
            {bot.handle} · {bot.platform}
          </p>
          <div
            role="progressbar"
            aria-label={`Kuota post ${bot.nama} hari ini`}
            aria-valuemin={0}
            aria-valuemax={maksKuota}
            aria-valuenow={Math.min(kuota, maksKuota)}
            className="my-1.5 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10"
          >
            <div
              className="h-full rounded-full bg-emas transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${persen}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-[11.5px] text-teks-sekunder">
            <span className="flex items-center gap-1">
              <span className="angka-tab">
                Post hari ini {kuota}/{maksKuota}
              </span>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={onBukaDetail}
                aria-label={`Buka detail ${bot.nama}`}
                className="pointer-events-auto relative z-10 rounded px-1 text-[11.5px] underline focus-visible:outline-2 focus-visible:outline-emas max-md:min-h-11"
              >
                Detail
              </button>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={otomatis}
              aria-label={`Mode otomatis untuk ${bot.nama}`}
              disabled={sibukMode}
              aria-busy={sibukMode}
              onClick={() => onUbahMode(otomatis ? "acc" : "otomatis")}
              className={cn(
                "pointer-events-auto relative z-10 shrink-0 rounded-full border px-2.5 text-[10.5px] font-bold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emas disabled:opacity-50 max-md:min-h-11 md:py-0.5",
                otomatis
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
              )}
            >
              {otomatis ? "Otomatis" : "Perlu ACC"}
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

// ---------- komponen utama ----------

export function RuangView(p: RuangViewProps) {
  const wadahRef = useRef<HTMLDivElement>(null);
  const lebarWadah = useLebarWadah(wadahRef) ?? 0;
  const duaKolom = lebarWadah >= BATAS_DUA_KOLOM;

  const nyata = !!p.nyata;
  const sibuk = p.sibuk;
  const [sim] = useState(() => new SimulasiBot(p.bots, { kuotaAwal: p.kuota, maksKuota: p.maksKuota, diam: nyata }));

  // Pembaca mode & callback laporan selalu mengikuti props terbaru
  // (simulasi tidak dibuat ulang).
  const { bots, onLog, onBotSelesaiPosting, onStatus } = p;
  useEffect(() => {
    sim.hubungkan({
      ambilMode: (id) => bots.find((b) => b.id === id)?.mode ?? "acc",
      onLog,
      onPosting: onBotSelesaiPosting,
      onStatus,
    });
  }, [sim, bots, onLog, onBotSelesaiPosting, onStatus]);

  // Sinkron props -> simulasi.
  useEffect(() => {
    sim.setJeda(p.jedaGlobal);
  }, [sim, p.jedaGlobal]);
  // Mode diam: teks bubble mengikuti jeda (global / per bot); abaikan di mode contoh.
  useEffect(() => {
    sim.setTeksDiam(Object.fromEntries(bots.map((b) => [b.id, p.jedaGlobal || b.nyata?.jeda ? "Dijeda" : "Menunggu tugas"])));
  }, [sim, bots, p.jedaGlobal]);
  useEffect(() => {
    sim.setMaksKuota(p.maksKuota);
  }, [sim, p.maksKuota]);
  useEffect(() => {
    for (const [id, n] of Object.entries(p.kuota)) sim.setKuota(id, n);
  }, [sim, p.kuota]);

  const [malam, setMalam] = useState(false);
  const [kecepatan, setKecepatan] = useState<number>(1);

  // Potret UI: 2x/detik, hanya bila isinya berubah.
  const [potret, setPotret] = useState<Potret>(() => buatPotret(sim));
  const tandaRef = useRef(JSON.stringify(potret));
  useIntervalAktif(() => {
    const baru = buatPotret(sim);
    const tanda = JSON.stringify(baru);
    if (tanda === tandaRef.current) return;
    tandaRef.current = tanda;
    setPotret(baru);
  }, 500);

  const totalPost = p.bots.reduce((s, b) => s + (p.kuota[b.id] ?? 0), 0);
  const totalMaks = p.bots.reduce((s, b) => s + (b.kuotaHarian ?? p.maksKuota), 0);
  const botAktif = p.bots.filter((b) => b.nyata?.aktif !== false && !b.nyata?.jeda).length;
  const namaBot = (id: string) => p.bots.find((b) => b.id === id)?.nama ?? id;
  const warnaBot = (id: string) => p.bots.find((b) => b.id === id)?.warna ?? WARNA_NETRAL;

  const hariBaru = () => {
    sim.hariBaru();
    p.onHariBaru();
  };

  return (
    <div ref={wadahRef} className="flex flex-col gap-3" aria-label="Ruang bot">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmen label="Waktu ruangan" pilihan={["siang", "malam"] as const} nilai={malam ? "malam" : "siang"} onPilih={(v) => setMalam(v === "malam")} format={(v) => (v === "siang" ? "Siang" : "Malam")} />
        {!nyata && (
          <>
            <Segmen label="Kecepatan simulasi" pilihan={KECEPATAN} nilai={kecepatan as (typeof KECEPATAN)[number]} onPilih={setKecepatan} format={(v) => `${v}×`} />
            <button
              type="button"
              onClick={hariBaru}
              className="glass btn-tekan rounded-xl px-3 text-[12.5px] font-bold text-teks-utama focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-pri max-md:min-h-11 md:h-9"
            >
              Hari baru
            </button>
          </>
        )}
        <span className="flex-1" />
        <button
          type="button"
          aria-pressed={p.jedaGlobal}
          disabled={!!sibuk?.has("jeda_global")}
          aria-busy={!!sibuk?.has("jeda_global")}
          onClick={() => p.onJedaGlobal(!p.jedaGlobal)}
          className={cn(
            "btn-tekan rounded-xl border px-3 text-[12.5px] font-bold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gagal disabled:opacity-50 max-md:min-h-11 md:h-9",
            p.jedaGlobal ? "border-gagal bg-gagal/15 text-gagal" : "glass border-gagal/50 text-gagal",
          )}
        >
          {p.jedaGlobal ? "Lanjutkan semua bot" : "Jeda darurat semua bot"}
        </button>
      </div>

      <div
        className="grid items-start gap-3.5"
        style={{ gridTemplateColumns: duaKolom ? `minmax(0,1fr) ${LEBAR_PANEL}px` : "minmax(0,1fr)" }}
      >
        {/* Kolom kiri: kanvas + legenda */}
        <GlassCard className="min-w-0 p-2.5">
          <RuangIsometrik
            sim={sim}
            bots={p.bots}
            malam={malam}
            kecepatan={kecepatan}
            terpilihId={p.terpilihId}
            onPilih={p.onPilih}
          >
            <div className="pointer-events-none absolute left-2.5 top-2.5 flex flex-wrap gap-1.5 font-mono text-[11px] font-semibold text-[#f4efe8]">
              <span className="rounded-lg border border-white/10 bg-[rgba(14,11,20,.8)] px-2 py-0.5">
                {p.jedaGlobal ? "Semua bot dijeda" : `${nyata ? botAktif : p.bots.length} bot aktif`}
              </span>
              <span className="rounded-lg border border-white/10 bg-[rgba(14,11,20,.8)] px-2 py-0.5">
                Post hari ini {totalPost}/{nyata ? totalMaks : p.maksKuota * p.bots.length}
              </span>
              {!nyata && (
                <span className="rounded-lg border border-white/10 bg-[rgba(14,11,20,.8)] px-2 py-0.5">
                  Render: {potret.render} berjalan · {potret.antre} antre
                </span>
              )}
              <span className="rounded-lg border border-white/10 bg-[rgba(14,11,20,.8)] px-2 py-0.5">{potret.jam} WIB</span>
            </div>
            {p.jedaGlobal && (
              <div
                role="status"
                className="pointer-events-none absolute left-1/2 top-12 -translate-x-1/2 whitespace-nowrap rounded-full border border-[#f87171] bg-[#4a1f1f] px-3 py-1 text-[12px] font-bold text-[#fecaca]"
              >
                Semua bot dijeda, kembali ke sofa
              </div>
            )}
          </RuangIsometrik>

          <ul className="mt-2.5 grid grid-cols-2 gap-2 xl:grid-cols-4">
            {URUTAN_TAHAP.map((k) => {
              const siapa = potret.perTahap[k].map(namaBot);
              return (
                <li
                  key={k}
                  className="rounded-xl border-l-[3px] bg-black/5 px-2.5 py-2 dark:bg-white/5"
                  style={{ borderLeftColor: WARNA_TAHAP[k] }}
                >
                  <b className="block text-[12px] text-teks-utama">{NAMA_TAHAP[k]}</b>
                  <span className="text-[11.5px] text-teks-sekunder">{siapa.length ? siapa.join(", ") : "kosong"}</span>
                </li>
              );
            })}
          </ul>
        </GlassCard>

        {/* Kolom kanan: panel samping */}
        <div className="flex min-w-0 flex-col gap-3">
          <GlassCard className="p-3.5">
            <Judul>Tim bot</Judul>
            <ul className="flex flex-col gap-2">
              {p.bots.map((b) => (
                <KartuBot
                  key={b.id}
                  bot={b}
                  potret={potret.bots[b.id]}
                  kuota={p.kuota[b.id] ?? 0}
                  maksKuota={b.kuotaHarian ?? p.maksKuota}
                  terpilih={p.terpilihId === b.id}
                  jeda={p.jedaGlobal}
                  nyata={nyata}
                  sibukMode={!!sibuk?.has(`mode:${b.nyata?.id ?? b.id}`)}
                  onPilih={() => p.onPilih(p.terpilihId === b.id ? null : b.id)}
                  onUbahMode={(mode) => p.onUbahMode(b.id, mode)}
                  onBukaDetail={() => p.onBukaDetail(b.id)}
                />
              ))}
            </ul>
          </GlassCard>

          <GlassCard className="p-3.5">
            <Judul>Umpan aktivitas langsung</Judul>
            {p.log.length === 0 ? (
              <p className="text-[12px] text-teks-sekunder">
                {nyata ? "Belum ada aktivitas dari runner." : "Belum ada aktivitas."}
              </p>
            ) : (
              <ol aria-live="off" className="max-h-[230px] overflow-auto font-mono text-[11.5px] leading-snug">
                {p.log.slice(0, MAKS_BARIS_LOG).map((l, i) => (
                  <li
                    key={`${l.waktu}-${l.botId}-${i}`}
                    className="flex items-baseline gap-1.5 border-b border-dashed border-black/10 py-1 last:border-0 dark:border-white/10"
                  >
                    <time className="shrink-0 text-teks-sekunder">{l.waktu}</time>
                    <b className="shrink-0 text-teks-utama" style={{ textDecoration: "underline", textDecorationColor: warnaBot(l.botId), textUnderlineOffset: 2 }}>
                      {namaBot(l.botId)}
                    </b>
                    <span
                      className="shrink-0 rounded border px-1 text-[9.5px] text-teks-utama"
                      style={{ borderColor: WARNA_TAHAP[l.tahap] }}
                    >
                      {NAMA_TAHAP[l.tahap]}
                    </span>
                    <span className="min-w-0 text-teks-utama">{l.teks}</span>
                  </li>
                ))}
              </ol>
            )}
          </GlassCard>

          <GlassCard className="p-3.5">
            <Judul>Hasil hari ini</Judul>
            {p.hasil.length === 0 ? (
              <p className="text-[12px] text-teks-sekunder">
                {nyata
                  ? "Belum ada hasil hari ini. Runner belum mengerjakan tugas pada tahap ini, jadi belum ada video yang diproses atau tayang."
                  : "Belum ada hasil hari ini."}
              </p>
            ) : (
              <ul>
                {p.hasil.map((h, i) => {
                  const tayang = h.status === "tayang";
                  return (
                    <li
                      key={`${h.judul}-${h.waktu}-${i}`}
                      className="flex items-center gap-2.5 border-b border-dashed border-black/10 py-2 last:border-0 dark:border-white/10"
                    >
                      <span
                        aria-hidden="true"
                        className="relative flex h-[30px] w-[46px] shrink-0 items-center justify-center rounded-md"
                        style={{ background: `linear-gradient(135deg, ${h.gradasi[0]}, ${h.gradasi[1]})` }}
                      >
                        <svg viewBox="0 0 10 10" className="h-3 w-3 text-white/90">
                          <path d="M2 1l7 4-7 4z" fill="currentColor" />
                        </svg>
                      </span>
                      <span className="min-w-0 flex-1 text-[12px]">
                        <b className="block truncate text-teks-utama">{h.judul}</b>
                        <span className="text-[11.5px] text-teks-sekunder">
                          {namaBot(h.botId)} · {h.platform} · {h.waktu}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 whitespace-nowrap rounded-full px-2 py-px text-[10.5px] font-bold",
                          tayang
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                        )}
                      >
                        {tayang ? "Tayang" : "Menunggu ACC"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </GlassCard>
        </div>
      </div>

      <GlassCard className="p-3.5 text-[12.5px] leading-relaxed text-teks-sekunder">
        {nyata ? (
          <>
            <b className="text-teks-utama">Cara membaca.</b> Daftar bot, mode, kuota, jeda, dan umpan aktivitas di sini
            data nyata dari server. Pada tahap ini runner belum mengerjakan tugas apa pun, jadi bot ditampilkan diam di
            sofa dengan status &quot;Menunggu tugas&quot;. Klik bot atau kartunya untuk memilih; tombol mode (Otomatis /
            Perlu ACC) dan jeda darurat langsung berlaku di server.
          </>
        ) : (
          <>
            <b className="text-teks-utama">Cara membaca.</b> Pencarian → Edit → Posting → Istirahat. Klik bot atau
            kartunya untuk memilih; tombol mode (Otomatis / Perlu ACC) bisa diklik. Bila meja terisi, bot lain antre di
            tengah ruangan seperti antrean render. Bot bermode ACC mengirim hasilnya ke tab Antrean ACC.
          </>
        )}
      </GlassCard>
    </div>
  );
}

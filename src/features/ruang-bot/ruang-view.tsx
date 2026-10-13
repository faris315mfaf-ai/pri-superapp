"use client";

// ============================================================
// RUANG VIEW — isi tab "Ruang" pada layar Ruang Bot.
//
// Toolbar (Siang/Malam, kecepatan, Hari baru, Panggil rapat, Jeda darurat), kartu
// kanvas gedung empat ruang (kerja, meeting, koordinator, kamar tidur) dengan HUD +
// spanduk jeda + legenda tempat, dan panel samping: Koordinator (Nara), Tim bot,
// Umpan aktivitas langsung, Hasil hari ini.
//
// Siapa berada di mana (mode nyata): tanpa API key -> kamar tidur; tugas berjalan ->
// meja tahap itu; room Chat ramai (atau tombol Panggil rapat) -> ruang meeting; usulan
// Nara yang disetujui -> Nara mengantar surat tugas.
//
// State kuota / hasil / log / mode / jeda dimiliki cangkang layar. Komponen
// ini hanya MEMBACA lewat props dan MELAPOR lewat callback. Simulasi dibuat
// sekali (useState malas) dan disinkronkan lewat setter — tidak dibuat ulang
// saat props berubah.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { GlassCard } from "@/components/glass-card";
import { useLebarWadah } from "@/hooks/use-kolom-wadah";
import { useIntervalAktif } from "@/hooks/use-tab-aktif";
import { rapatBerlangsung, sisaRapatMs } from "@/lib/bot-dunia-murni";
import type { KoordinatorRingkas } from "@/lib/bot-tipe";
import { cn } from "@/lib/utils";
import { NAMA_TAHAP, NAMA_TEMPAT, URUTAN_TEMPAT, WARNA_TAHAP, WARNA_TEMPAT } from "./data-contoh";
import type { ZonaRuang } from "./denah";
import { petaCatatan, petaSasaran, suratBaru } from "./peta-nyata";
import { PotretBot } from "./potret-bot";
import { RuangIsometrik } from "./ruang-isometrik";
import { SimulasiBot, formatJam } from "./simulasi-bot";
import { RUPA_NARA, WARNA_NARA, type KeadaanNara } from "./simulasi-nara";
import type { BotContoh, HasilHariIni, LogItem, ModeBot, StatusHidup, TampilanBot, TempatBot } from "./tipe";

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
  /** Koordinator (Nara) dari server; null/absen = migrasi sql/74 belum jalan. */
  koordinator?: KoordinatorRingkas | null;
  /** ISO pesan room Chat terbaru: selama masih "hangat" bot berkumpul di ruang meeting. */
  chatTerakhir?: string | null;
  /** Pindah tab layar (klik ruang meeting -> Chat, ruang koordinator / Nara -> Koordinator). */
  onBukaTab?: (tab: TampilanBot) => void;
  /** Mode contoh saja: pasang/cabut API key bot (menunjukkan bot bangun / tidur). */
  onUbahOtakContoh?: (id: string, ada: boolean) => void;
};

const KECEPATAN = [1, 3, 8] as const;
/** Lebar isi wadah (px) minimal untuk tata letak 2 kolom (kanvas + panel). */
const BATAS_DUA_KOLOM = 900;
const LEBAR_PANEL = 380;
const MAKS_BARIS_LOG = 40;
const WARNA_NETRAL = "#a79fb2";

// ---------- potret ringan untuk UI (diperbarui 2x/detik, bukan tiap frame) ----------

type PotretBotUI = { tempat: TempatBot; keadaan: StatusHidup["keadaan"]; teks: string };

type PotretNara = { keadaan: KeadaanNara; teks: string; punyaOtak: boolean; usulan: number; nama: string };

type Potret = {
  bots: Record<string, PotretBotUI>;
  perTempat: Record<TempatBot, string[]>;
  render: number;
  antre: number;
  tidur: number;
  rapat: boolean;
  nara: PotretNara;
  jam: string;
};

function buatPotret(sim: SimulasiBot): Potret {
  const bots: Record<string, PotretBotUI> = {};
  const perTempat: Record<TempatBot, string[]> = { cari: [], edit: [], posting: [], istirahat: [], rapat: [], tidur: [] };
  let render = 0;
  let antre = 0;
  for (const b of sim.bots) {
    bots[b.id] = { tempat: b.tempat, keadaan: b.keadaan, teks: b.teks };
    if (b.keadaan === "bekerja") {
      perTempat[b.tempat].push(b.id);
      if (b.tempat === "edit") render++;
    } else if (b.keadaan === "menunggu") {
      antre++;
    }
  }
  const n = sim.nara;
  return {
    bots,
    perTempat,
    render,
    antre,
    tidur: perTempat.tidur.length,
    rapat: sim.rapat,
    nara: { keadaan: n.keadaan, teks: n.teksTampil(), punyaOtak: n.punyaOtak, usulan: n.usulanTerbuka, nama: n.nama },
    jam: formatJam(sim.jamSimulasi),
  };
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
  onUbahOtak,
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
  /** Hanya mode contoh: pasang/cabut API key. */
  onUbahOtak?: (ada: boolean) => void;
}) {
  const tempat = potret?.tempat ?? "istirahat";
  const bekerja = potret?.keadaan === "bekerja";
  const tidur = tempat === "tidur";
  const rapat = tempat === "rapat";
  const dijedaNyata = jeda || !!bot.nyata?.jeda;
  const berwarna = bekerja && (tidur || rapat || !nyata || tempat !== "istirahat");
  const warnaTahap = berwarna ? WARNA_TEMPAT[tempat] : WARNA_NETRAL;
  const labelTahap = !potret
    ? nyata
      ? "Menunggu tugas"
      : "Menunggu"
    : potret.keadaan === "berjalan"
      ? "Berjalan"
      : tidur
        ? "Tidur"
        : rapat
          ? "Rapat"
          : nyata
            ? dijedaNyata
              ? "Dijeda"
              : bekerja && tempat !== "istirahat"
                ? NAMA_TAHAP[tempat]
                : "Menunggu tugas"
            : bekerja
              ? jeda && tempat === "istirahat"
                ? "Dijeda"
                : NAMA_TAHAP[tempat as keyof typeof NAMA_TAHAP]
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
          {tidur && nyata && (
            <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-300">
              Tidur karena belum punya API key. Pasang di TVR Saya → Otak Bot.
            </p>
          )}
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
          {onUbahOtak && (
            <button
              type="button"
              role="switch"
              aria-checked={bot.punyaOtak !== false}
              aria-label={`API key ${bot.nama} (contoh)`}
              onClick={() => onUbahOtak(bot.punyaOtak === false)}
              className="pointer-events-auto relative z-10 mt-1.5 rounded-full border border-black/15 px-2.5 text-[10.5px] font-bold text-teks-sekunder focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emas dark:border-white/15 max-md:min-h-11 md:py-0.5"
            >
              {bot.punyaOtak === false ? "Pasang API key (contoh)" : "Cabut API key (contoh)"}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

const LABEL_NARA: Record<KeadaanNara, string> = {
  meja: "Di mejanya",
  jalan: "Berjalan",
  tempel: "Menempel tugas",
  serah: "Mengantar tugas",
  rapat: "Rapat",
};

function KartuNara({
  nara,
  peran,
  nyata,
  tersedia,
  onBuka,
}: {
  nara: PotretNara;
  peran: string;
  nyata: boolean;
  /** Mode nyata: koordinator sudah ada di server (migrasi sql/74 sudah jalan). */
  tersedia: boolean;
  onBuka?: () => void;
}) {
  const tanpaKunci = !nara.punyaOtak;
  const label = nyata && !tersedia ? "Belum aktif" : tanpaKunci && nara.keadaan === "meja" ? "Tanpa API key" : LABEL_NARA[nara.keadaan];
  const warna = tanpaKunci || (nyata && !tersedia) ? WARNA_NETRAL : WARNA_NARA;
  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-2.5">
      <PotretBot rupa={RUPA_NARA} lencana={WARNA_NARA} skala={3} label={`Potret ${nara.nama}`} className="rounded-[10px] bg-black/5 dark:bg-white/10" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="text-[14px] font-bold text-teks-utama">{nara.nama}</span>
          <span className="text-[11px] font-semibold text-teks-sekunder">{peran}</span>
          <ChipTahap warna={warna} label={label} />
        </div>
        <p className="mt-0.5 min-h-[1.2em] text-[12px] leading-snug text-teks-utama">{nara.teks || "—"}</p>
        {nyata && !tersedia ? (
          <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-300">Jalankan migrasi sql/74 supaya koordinator aktif.</p>
        ) : tanpaKunci && nyata ? (
          <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-300">
            Belum bisa berpikir. Pasang API key di TVR Saya → Otak Bot → Koordinator.
          </p>
        ) : null}
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11.5px] text-teks-sekunder">
          <span className="angka-tab">{nyata ? `${nara.usulan} usulan menunggu` : "Contoh: tanpa usulan nyata"}</span>
          {onBuka && (
            <button
              type="button"
              onClick={onBuka}
              className="btn-tekan rounded-full bg-pri/12 px-3 py-1 text-[11px] font-bold text-pri focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-pri max-md:min-h-11"
            >
              Buka Koordinator
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- komponen utama ----------

export function RuangView(p: RuangViewProps) {
  const wadahRef = useRef<HTMLDivElement>(null);
  const lebarWadah = useLebarWadah(wadahRef) ?? 0;
  const duaKolom = lebarWadah >= BATAS_DUA_KOLOM;

  const nyata = !!p.nyata;
  const sibuk = p.sibuk;
  const [sim] = useState(
    () =>
      new SimulasiBot(p.bots, {
        kuotaAwal: p.kuota,
        maksKuota: p.maksKuota,
        diam: nyata,
        sasaranAwal: nyata ? petaSasaran(p.bots, p.jedaGlobal) : undefined,
      }),
  );

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
  // Mode nyata: tempat & teks tiap bot mengikuti tugas berjalan (meja) atau sofa / "Dijeda".
  useEffect(() => {
    if (nyata) sim.setSasaran(petaSasaran(bots, p.jedaGlobal));
  }, [sim, nyata, bots, p.jedaGlobal]);
  // API key: tanpa key bot tidur di kamar tidur, dengan key bangun dan bekerja.
  useEffect(() => {
    for (const b of bots) sim.setPunyaOtak(b.id, b.punyaOtak !== false);
  }, [sim, bots]);
  // Koordinator (Nara): punya key atau belum, usulan menunggu, dan surat tugas yang baru disetujui.
  const koordinator = p.koordinator ?? null;
  const kPunyaOtak = koordinator?.punya_otak ?? false;
  const kUsulan = koordinator?.usulan_terbuka ?? 0;
  const kNama = koordinator?.nama;
  const kDiputus = koordinator?.diputus;
  useEffect(() => {
    sim.nara.setKeadaan(nyata ? { punyaOtak: kPunyaOtak, usulanTerbuka: kUsulan, nama: kNama } : { punyaOtak: true, usulanTerbuka: 0 });
  }, [sim, nyata, kPunyaOtak, kUsulan, kNama]);
  useEffect(() => {
    if (!nyata || !kDiputus) return;
    const baru = suratBaru(kDiputus, new Set(bots.map((b) => b.id)), Date.now());
    const idBaru = new Set(baru.map((x) => x.id));
    // Yang lama hanya jadi catatan di papan; yang baru diantar sekali (Nara menyaring id yang sudah dikenal).
    for (const d of kDiputus) if (!idBaru.has(d.id)) sim.nara.anggapSudahAda(d.id);
    for (const surat of baru) sim.nara.antar(surat);
    sim.nara.setCatatan(petaCatatan(kDiputus));
  }, [sim, nyata, kDiputus, bots]);
  // Rapat: tombol manual ATAU room Chat sedang ramai (pesan terakhir < 3 menit; mode nyata).
  const [rapatManual, setRapatManual] = useState(false);
  const chatTerakhir = p.chatTerakhir ?? null;
  useEffect(() => {
    const hitung = () => sim.setRapat(rapatManual || (nyata && rapatBerlangsung(chatTerakhir, Date.now())));
    hitung();
    const sisa = nyata ? sisaRapatMs(chatTerakhir, Date.now()) : 0;
    if (sisa <= 0) return undefined;
    const t = window.setTimeout(hitung, sisa + 300);
    return () => window.clearTimeout(t);
  }, [sim, nyata, rapatManual, chatTerakhir]);

  // Klik pil ruang / Nara di kanvas -> tab terkait (hanya mode nyata).
  const { onBukaTab } = p;
  const bukaZona = useMemo<Partial<Record<ZonaRuang, () => void>> | undefined>(
    () => (nyata && onBukaTab ? { meeting: () => onBukaTab("chat"), koordinator: () => onBukaTab("koordinator") } : undefined),
    [nyata, onBukaTab],
  );
  const bukaKoordinator = useMemo(() => (nyata && onBukaTab ? () => onBukaTab("koordinator") : undefined), [nyata, onBukaTab]);
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
        <button
          type="button"
          aria-pressed={rapatManual}
          onClick={() => setRapatManual((v) => !v)}
          title={nyata ? "Bot berkunci dan Nara berkumpul di ruang meeting. Rapat juga berjalan otomatis saat room Chat ramai." : undefined}
          className={cn(
            "btn-tekan rounded-xl border px-3 text-[12.5px] font-bold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-pri max-md:min-h-11 md:h-9",
            rapatManual ? "border-[#fb7185] bg-[#fb7185]/15 text-[#e11d48] dark:text-[#fda4af]" : "glass border-black/10 text-teks-utama dark:border-white/10",
          )}
        >
          {rapatManual ? "Bubarkan rapat" : "Panggil rapat"}
        </button>
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
            onPilihNara={bukaKoordinator}
            onBukaZona={bukaZona}
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
              {potret.tidur > 0 && (
                <span className="rounded-lg border border-white/10 bg-[rgba(14,11,20,.8)] px-2 py-0.5">{potret.tidur} tidur (tanpa API key)</span>
              )}
              {potret.rapat && (
                <span className="rounded-lg border border-[#fb7185]/60 bg-[rgba(60,16,32,.85)] px-2 py-0.5 text-[#fecdd3]">Rapat berlangsung</span>
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

          <ul className="mt-2.5 grid grid-cols-2 gap-2 xl:grid-cols-3">
            {URUTAN_TEMPAT.map((k) => {
              const siapa = potret.perTempat[k].map(namaBot);
              return (
                <li
                  key={k}
                  className="rounded-xl border-l-[3px] bg-black/5 px-2.5 py-2 dark:bg-white/5"
                  style={{ borderLeftColor: WARNA_TEMPAT[k] }}
                >
                  <b className="block text-[12px] text-teks-utama">{NAMA_TEMPAT[k]}</b>
                  <span className="text-[11.5px] text-teks-sekunder">{siapa.length ? siapa.join(", ") : "kosong"}</span>
                </li>
              );
            })}
          </ul>
        </GlassCard>

        {/* Kolom kanan: panel samping */}
        <div className="flex min-w-0 flex-col gap-3">
          <GlassCard className="p-3.5">
            <Judul>Koordinator</Judul>
            <KartuNara
              nara={potret.nara}
              peran={koordinator?.peran ?? "Koordinator Redaksi"}
              nyata={nyata}
              tersedia={!!koordinator}
              onBuka={bukaKoordinator}
            />
          </GlassCard>

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
                  onUbahOtak={!nyata && p.onUbahOtakContoh ? (ada) => p.onUbahOtakContoh?.(b.id, ada) : undefined}
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
            <b className="text-teks-utama">Cara membaca.</b> Gedung ini punya empat ruang yang dipisah sekat kaca.{" "}
            <b className="text-teks-utama">Ruang kerja</b>: bot duduk di meja tahap tugasnya (Pencarian / Edit / Posting) atau
            menunggu di sofa. <b className="text-teks-utama">Kamar tidur</b>: bot yang belum punya API key tidur di sini sampai
            key dipasang di TVR Saya → Otak Bot. <b className="text-teks-utama">Ruang meeting</b>: bot berkunci dan Nara
            berkumpul saat room Chat ramai (atau tombol Panggil rapat); klik namanya untuk membuka Chat.{" "}
            <b className="text-teks-utama">Ruang koordinator</b>: meja Nara dan papan penugasan; usulan yang Anda setujui
            diantar Nara sebagai surat tugas ke bot yang bersangkutan. Klik bot atau kartunya untuk memilih; mode dan jeda
            darurat langsung berlaku di server.
          </>
        ) : (
          <>
            <b className="text-teks-utama">Cara membaca.</b> Pencarian → Edit → Posting → Istirahat di ruang kerja. Bot tanpa
            API key tidur di kamar tidur (coba tombol &quot;Pasang API key&quot; di kartu bot); tombol Panggil rapat
            mengumpulkan bot berkunci dan Nara di ruang meeting. Bila meja terisi, bot lain antre di tengah ruangan seperti
            antrean render. Bot bermode ACC mengirim hasilnya ke tab Antrean ACC.
          </>
        )}
      </GlassCard>
    </div>
  );
}

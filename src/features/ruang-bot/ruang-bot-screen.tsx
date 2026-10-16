"use client";

// ============================================================
// RUANG BOT — tampilan MASTER (13 Okt 2026). Pengguna umum memakai ruang-bot-umum.tsx (14 Okt 2026).
//
// Cangkang tampilan: Ruang (gedung pixel-art empat ruang tempat bot bekerja),
// Detail Bot, Antrean ACC, Sumber & Kuota, serta Chat dan Koordinator (mode nyata). Cangkang ini PEMEGANG STATE;
// tampilan hanya membaca lewat props dan melapor lewat callback.
//
// DUA MODE (ditentukan dari GET /api/bot/status, lihat use-status-bot.ts):
//  • nyata  — tabel_ada && ada bot: bot, mode, kuota, jeda, post hari ini,
//             runner, dan log dari server; kendali (jeda darurat, jeda per
//             bot, mode, kuota) lewat POST /api/bot/kendali dengan
//             pembaruan optimis; daftar sumber & blokir juga nyata (CRUD lewat
//             POST /api/bot/sumber). Simulasi DIAM (runner belum mengerjakan apa
//             pun). Antrean ACC masih CONTOH (bertanda spanduk) sampai Pekerjaan 3.
//  • contoh — migrasi belum dijalankan atau belum ada bot: simulasi penuh di
//             peramban dengan data contoh, berlabel "Data contoh".
// Gerbang server (bolehRuangBot) dipasang pada setiap endpoint /api/bot/*.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Lock } from "lucide-react";
import { EmptyState, GlassSkeleton, ScreenHeader } from "@/components/pri-ui";
import { KUOTA_BOT_MAKS, KUOTA_BOT_MIN, type AksiKendaliBot, type AksiSumberBot, type StatusBot } from "@/lib/bot-tipe";
import { cn } from "@/lib/utils";
import { AntreanAccView } from "./antrean-acc-view";
import { AntreanAccNyata } from "./antrean-acc-nyata";
import { ChatBotView } from "./chat-bot-view";
import { KoordinatorTab } from "./koordinator-tab";
import { KarakterSayaPanel } from "./karakter-saya";
import { bolehKarakterSaya } from "@/lib/karakter-murni";
import { LacakSumberView } from "@/features/lacak-sumber/lacak-sumber-view";
import { MAKS_KUOTA_AWAL } from "./data-contoh";
import { DetailBotView } from "./detail-bot-view";
import { RuangView } from "./ruang-view";
import { petakanBot, petakanLog, petakanSumber, waktuRelatif } from "./peta-nyata";
import { SumberKuotaView } from "./sumber-kuota-view";
import { useStatusBot } from "./use-status-bot";
import type {
  BotContoh,
  HasilHariIni,
  ItemAcc,
  HasilAksiSumber,
  KendaliSumberNyata,
  KeputusanAcc,
  LogItem,
  ModeBot,
  StatusHidup,
  SumberContoh,
  TampilanBot,
} from "./tipe";

const TAB: { kunci: TampilanBot; label: string }[] = [
  { kunci: "ruang", label: "Ruang" },
  { kunci: "karakter", label: "Karakter Saya" },
  { kunci: "detail", label: "Detail Bot" },
  { kunci: "acc", label: "Antrean ACC" },
  { kunci: "sumber", label: "Sumber & Kuota" },
  { kunci: "chat", label: "Chat" },
  { kunci: "koordinator", label: "Koordinator" },
  { kunci: "lacak", label: "Lacak Sumber" },
];

const GRADASI_BARU: [string, string][] = [
  ["#22d3ee", "#1e3a8a"],
  ["#f472b6", "#581c87"],
  ["#a3e635", "#14532d"],
  ["#fb923c", "#7c2d12"],
];

/** Detik sejak tengah malam menurut WIB (UTC+7) — dipakai garis "sekarang" di Detail Bot. */
function detikWibSekarang(): number {
  const d = new Date(Date.now() + 7 * 3600_000);
  return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
}

function jamTeks(detik: number): string {
  const j = Math.floor(detik / 3600) % 24;
  const m = Math.floor(detik / 60) % 60;
  return `${String(j).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}


/** Mode nyata dipakai bila migrasi sudah jalan DAN sudah ada bot. */
function adaDataNyata(s: StatusBot | null): boolean {
  return !!s && s.tabel_ada && s.bots.length > 0;
}

/** Peta kosong/daftar kosong tetap (identitas stabil, tidak memicu render ulang). */
const HASIL_KOSONG: HasilHariIni[] = [];
const BLOKIR_KOSONG: string[] = [];

// ---------- potongan tampilan ----------

/** Awal yang kosong: belum ada bot. Dunia (pengguna online) tetap hidup; bot muncul setelah dibuat di Kelola Bot. */
function KartuBelumAdaBot({ onBuka }: { onBuka?: () => void }) {
  return (
    <div
      role="note"
      className="mb-3 flex flex-col gap-2 rounded-2xl border border-amber-500/50 bg-amber-500/10 px-3.5 py-3 text-[12.5px] leading-snug text-amber-800 dark:text-amber-200 sm:flex-row sm:items-center"
    >
      <p className="m-0 min-w-0 flex-1">
        <b>Belum ada bot.</b> Ruangan di bawah menampilkan pengguna yang sedang online. Bot (beserta akun, profil upload-post, dan API key-nya) dibuat di{" "}
        <b>Profil → Kelola Bot</b>; begitu bot pertama dibuat, layar ini otomatis berganti ke data nyata.
      </p>
      {onBuka && (
        <button type="button" onClick={onBuka} className="btn-tekan shrink-0 rounded-full bg-amber-600 px-4 py-2 text-[12px] font-bold text-white">
          Buka Kelola Bot
        </button>
      )}
    </div>
  );
}

function LencanaHeader({ status }: { status: StatusBot | null }) {
  // Memuat/galat: tanpa lencana. Mode contoh: tetap berlabel "Data contoh".
  if (!status) return null;
  if (!adaDataNyata(status)) {
    return (
      <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
        Belum ada bot
      </span>
    );
  }
  const online = status.runner.online;
  const denyut = status.runner.terakhir_denyut ? `denyut ${waktuRelatif(status.runner.terakhir_denyut)}` : "belum pernah berdenyut";
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
      <span className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
        Data nyata
      </span>
      <span
        title={`Runner ${online ? "online" : "mati"} · ${denyut}${status.runner.versi ? ` · v${status.runner.versi}` : ""}`}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-bold",
          online
            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "border-gagal/50 bg-gagal/10 text-gagal",
        )}
      >
        <i aria-hidden="true" className={cn("inline-block h-1.5 w-1.5 rounded-full", online ? "bg-emerald-500" : "bg-gagal")} />
        Runner {online ? "online" : "mati"}
        <span className="hidden font-semibold opacity-80 sm:inline">· {denyut}</span>
      </span>
    </div>
  );
}

function SkeletonMemuat() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">Memuat Ruang Bot…</span>
      <GlassSkeleton className="h-12 rounded-2xl" />
      <GlassSkeleton className="h-72 rounded-2xl" />
      <GlassSkeleton className="h-40 rounded-2xl" />
    </div>
  );
}

// ---------- cangkang: memuat status dari server, lalu memilih mode ----------

export function RuangBotScreen({ onBukaKelolaBot, sayaId }: { onBukaKelolaBot?: () => void; sayaId?: number } = {}) {
  const s = useStatusBot();
  const { data } = s;
  const nyata = adaDataNyata(data);

  let isi: React.ReactNode;
  if (s.dilarang) {
    isi = <EmptyState ikon={Lock} judul="Hanya untuk master" keterangan="Ruang Bot hanya bisa dibuka oleh akun master." />;
  } else if (!data) {
    isi = s.memuat ? (
      <SkeletonMemuat />
    ) : (
      <EmptyState
        ikon={AlertTriangle}
        judul="Ruang Bot gagal dimuat"
        keterangan={s.galat || "Periksa koneksi lalu coba lagi."}
        labelAksi="Coba lagi"
        onAksi={() => void s.muatUlang()}
      />
    );
  } else {
    // key = mode: pindah contoh <-> nyata memasang ulang isi dengan state awal yang tepat.
    isi = (
      <RuangBotIsi
        key={nyata ? "nyata" : "contoh"}
        server={data}
        nyata={nyata}
        sibuk={s.sibuk}
        kendali={s.kendali}
        ubahSumber={s.ubahSumber}
        onBukaKelolaBot={onBukaKelolaBot}
        sayaId={sayaId}
      />
    );
  }

  return (
    <div className="kolom-aplikasi kolom-lebar px-4 pb-32">
      <ScreenHeader judul="Ruang Bot" kanan={s.dilarang ? null : <LencanaHeader status={data} />} />
      {nyata && !s.dilarang && data && (
        <p className="-mt-2 mb-3 text-[11.5px] text-teks-sekunder sm:hidden">
          Runner {data.runner.online ? "online" : "mati"} ·{" "}
          {data.runner.terakhir_denyut ? `denyut ${waktuRelatif(data.runner.terakhir_denyut)}` : "belum pernah berdenyut"}
        </p>
      )}
      {isi}
    </div>
  );
}

// ---------- isi: empat tampilan ----------

type RuangBotIsiProps = {
  /** Status terakhir dari server (pada mode contoh hanya dipakai untuk menentukan mode). */
  server: StatusBot;
  nyata: boolean;
  sibuk: ReadonlySet<string>;
  kendali: (aksi: AksiKendaliBot[]) => Promise<boolean>;
  ubahSumber: (aksi: AksiSumberBot) => Promise<HasilAksiSumber>;
  onBukaKelolaBot?: () => void;
  sayaId?: number;
};

function RuangBotIsi({ server, nyata, sibuk, kendali, ubahSumber, onBukaKelolaBot, sayaId }: RuangBotIsiProps) {
  const [tampilan, setTampilan] = useState<TampilanBot>("ruang");
  // State mode CONTOH (simulasi di peramban). Pada mode nyata sebagian besar tidak dipakai.
  // Awal yang KOSONG (14 Okt 2026): tanpa bot contoh. Bot muncul setelah dibuat di Profil → Kelola Bot.
  const [botsContoh, setBotsContoh] = useState<BotContoh[]>([]);
  const [kuotaContoh, setKuotaContoh] = useState<Record<string, number>>({});
  const [maksKuotaContoh, setMaksKuotaContoh] = useState(MAKS_KUOTA_AWAL);
  const [hasilContoh, setHasilContoh] = useState<HasilHariIni[]>([]);
  const [logContoh, setLogContoh] = useState<LogItem[]>([]);
  const [jedaGlobalContoh, setJedaGlobalContoh] = useState(false);
  const [jedaBotContoh, setJedaBotContoh] = useState<Record<string, boolean>>({});
  // Sumber & blokir CONTOH (mode nyata memakai daftar dari server, lihat di bawah).
  const [sumberContoh, setSumberContoh] = useState<SumberContoh[]>([]);
  const [blokirContoh, setBlokirContoh] = useState<string[]>([]);
  // State yang dipakai kedua mode (Antrean ACC tetap contoh pada mode nyata).
  const [statusHidup, setStatusHidup] = useState<Record<string, StatusHidup>>({});
  const [terpilihId, setTerpilihId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string>(() => (nyata ? String(server.bots[0]?.id ?? "") : ""));
  const [antrean, setAntrean] = useState<ItemAcc[]>([]);
  const [riwayat, setRiwayat] = useState<KeputusanAcc[]>([]);
  const [jam, setJam] = useState(detikWibSekarang);
  // Lacak Sumber dipasang sejak pertama dibuka lalu dibiarkan (disembunyikan) agar pelacakan yang berjalan tetap terpantau.
  const [lacakDibuka, setLacakDibuka] = useState(false);

  // ---- nilai turunan dari server (mode nyata) ----
  const botsNyata = useMemo(() => server.bots.map(petakanBot), [server.bots]);
  const logNyata = useMemo(() => petakanLog(server.log), [server.log]);
  /** id tampilan (String) -> id numerik bot_redaksi untuk memanggil API. */
  const petaId = useMemo(() => new Map(server.bots.map((b) => [String(b.id), b.id] as const)), [server.bots]);
  const kuotaNyata = useMemo(
    () => Object.fromEntries(server.bots.map((b) => [String(b.id), b.post_hari_ini])),
    [server.bots],
  );
  const jedaBotNyata = useMemo(() => Object.fromEntries(server.bots.map((b) => [String(b.id), b.jeda])), [server.bots]);
  const maksKuotaNyata = useMemo(
    () => server.bots.reduce((m, b) => Math.max(m, b.kuota_harian), KUOTA_BOT_MIN),
    [server.bots],
  );
  // Sumber & blokir dari server. `jam` ikut sebagai pemicu agar "terakhir ambil" (waktu relatif) ikut menyegar.
  const sumberNyata = useMemo(() => {
    void jam;
    return (server.sumber ?? []).map(petakanSumber);
  }, [server.sumber, jam]);
  const blokirNyata = server.blokir ?? BLOKIR_KOSONG;
  const kendaliSumber = useMemo<KendaliSumberNyata>(
    () => ({
      tambah: (a) => ubahSumber({ aksi: "tambah", bot_id: a.botId, platform: a.platform, handle: a.handle, kategori: a.kategori }),
      aktif: (id, nilai) => ubahSumber({ aksi: "aktif", id, nilai }),
      hapus: (id) => ubahSumber({ aksi: "hapus", id }),
      tambahBlokir: (kata) => ubahSumber({ aksi: "blokir_tambah", kata }),
      hapusBlokir: (kata) => ubahSumber({ aksi: "blokir_hapus", kata }),
    }),
    [ubahSumber],
  );
  /** Tanda daftar bot: bila berubah, Ruang dipasang ulang agar simulasi memuat bot yang baru. */
  const tandaBot = useMemo(() => server.bots.map((b) => b.id).join(","), [server.bots]);

  const sumber = nyata ? sumberNyata : sumberContoh;
  const blokir = nyata ? blokirNyata : blokirContoh;
  const bots = nyata ? botsNyata : botsContoh;
  const kuota = nyata ? kuotaNyata : kuotaContoh;
  const maksKuota = nyata ? maksKuotaNyata : maksKuotaContoh;
  const hasil = nyata ? HASIL_KOSONG : hasilContoh;
  const log = nyata ? logNyata : logContoh;
  const jedaGlobal = nyata ? server.jeda_global : jedaGlobalContoh;
  const jedaBot = nyata ? jedaBotNyata : jedaBotContoh;

  // Ref berisi bot terbaru: callback dari simulasi dibaca tanpa membuat ulang handler.
  const botsRef = useRef(bots);
  const urutAcc = useRef(10);
  useEffect(() => {
    botsRef.current = bots;
  }, [bots]);

  // Jam WIB untuk garis "sekarang"; perbarui tiap 30 detik, hanya saat tab aktif.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setJam(detikWibSekarang());
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);

  // ---- kendali: nyata = ke server (optimis), contoh = state lokal ----

  const ubahMode = useCallback(
    (id: string, mode: ModeBot) => {
      if (nyata) {
        const botId = petaId.get(id);
        if (botId !== undefined) void kendali([{ aksi: "mode", bot_id: botId, nilai: mode }]);
        return;
      }
      setBotsContoh((b) => b.map((x) => (x.id === id ? { ...x, mode } : x)));
    },
    [nyata, petaId, kendali],
  );

  // Hanya mode contoh: pasang/cabut API key menunjukkan bot bangun atau tidur.
  const ubahOtakContoh = useCallback((id: string, ada: boolean) => {
    setBotsContoh((b) => b.map((x) => (x.id === id ? { ...x, punyaOtak: ada } : x)));
  }, []);

  const setJedaGlobal = useCallback(
    (v: boolean) => {
      if (nyata) void kendali([{ aksi: "jeda_global", nilai: v }]);
      else setJedaGlobalContoh(v);
    },
    [nyata, kendali],
  );

  const setJedaBot = useCallback(
    (id: string, v: boolean) => {
      if (nyata) {
        const botId = petaId.get(id);
        if (botId !== undefined) void kendali([{ aksi: "jeda_bot", bot_id: botId, nilai: v }]);
        return;
      }
      setJedaBotContoh((j) => ({ ...j, [id]: v }));
    },
    [nyata, petaId, kendali],
  );

  const setMaksKuota = useCallback(
    (n: number) => {
      if (!nyata) {
        setMaksKuotaContoh(n);
        return;
      }
      // Mode nyata: kuota berlaku untuk SEMUA bot (satu aksi per bot yang nilainya berbeda).
      const nilai = Math.min(KUOTA_BOT_MAKS, Math.max(KUOTA_BOT_MIN, Math.round(n)));
      const aksi: AksiKendaliBot[] = server.bots
        .filter((b) => b.kuota_harian !== nilai)
        .map((b) => ({ aksi: "kuota" as const, bot_id: b.id, nilai }));
      if (aksi.length > 0) void kendali(aksi);
    },
    [nyata, server.bots, kendali],
  );

  // ---- simulasi (hanya mode contoh) ----

  const catatLog = useCallback((item: LogItem) => {
    setLogContoh((l) => [item, ...l].slice(0, 60));
  }, []);

  const botSelesaiPosting = useCallback((botId: string, judul: string) => {
    const bot = botsRef.current.find((b) => b.id === botId);
    if (!bot) return;
    const gradasi = GRADASI_BARU[Math.floor(Math.random() * GRADASI_BARU.length)];
    const waktu = jamTeks(detikWibSekarang());
    setKuotaContoh((k) => ({ ...k, [botId]: (k[botId] ?? 0) + 1 }));
    setHasilContoh((h) =>
      [{ judul, botId, platform: bot.platform, status: bot.mode === "otomatis" ? "tayang" : "menunggu-acc", waktu, gradasi } as HasilHariIni, ...h].slice(0, 6),
    );
    if (bot.mode === "acc") {
      const kata = judul.split(" ");
      urutAcc.current += 1;
      const item: ItemAcc = {
        id: urutAcc.current,
        judul,
        hook: [`${kata[0].toUpperCase()}!`, kata.slice(1).join(" ")],
        kategori: "NEWS",
        akunSumber: "@ntv",
        platformSumber: "Instagram",
        botId,
        platformTujuan: bot.platform,
        durasiDetik: 30 + Math.floor(Math.random() * 14),
        waktuTayang: "Slot berikutnya",
        gradasi,
        caption: `${judul}.\n\nSumber: @ntv (Instagram)\n#berita`,
        tanda: [
          { jenis: "ok", teks: "Kredit sumber ada" },
          { jenis: "ok", teks: "Belum pernah dipakai bot lain" },
        ],
      };
      setAntrean((a) => [...a, item]);
    }
  }, []);

  const keputusan = useCallback((id: number, jenis: "setuju" | "ulang" | "tolak", caption: string) => {
    void caption; // contoh: caption hasil sunting tidak disimpan di mana pun
    const item = antrean.find((a) => a.id === id);
    if (!item) return;
    const bot = botsRef.current.find((b) => b.id === item.botId);
    const peta = {
      setuju: { label: "Disetujui · terjadwal", jenis: "ok" as const },
      ulang: { label: "Edit ulang diminta", jenis: "warn" as const },
      tolak: { label: "Ditolak", jenis: "bad" as const },
    }[jenis];
    setAntrean((a) => a.filter((x) => x.id !== id));
    setRiwayat((r) => [{ judul: item.judul, botNama: bot?.nama ?? item.botId, label: peta.label, jenis: peta.jenis }, ...r]);
    if (jenis === "setuju") {
      setHasilContoh((h) => h.map((x) => (x.judul === item.judul && x.status === "menunggu-acc" ? { ...x, status: "tayang" as const } : x)));
    }
  }, [antrean]);

  const hariBaru = useCallback(() => {
    setKuotaContoh({ bot1: 0, bot2: 0, bot3: 0 });
  }, []);

  const renderBerjalan = Object.values(statusHidup).filter((x) => x.keadaan === "bekerja" && x.tahap === "edit").length;

  return (
    <>
      {!nyata && <KartuBelumAdaBot onBuka={onBukaKelolaBot} />}
      <div
        role="tablist"
        aria-label="Tampilan Ruang Bot"
        className="tanpa-scrollbar glass mb-4 flex gap-1 overflow-x-auto rounded-2xl p-1"
      >
        {TAB.filter((t) => ((t.kunci !== "chat" && t.kunci !== "koordinator") || nyata) && (t.kunci !== "karakter" || bolehKarakterSaya({ id: sayaId }))).map((t) => {
          const aktif = tampilan === t.kunci;
          return (
            <button
              key={t.kunci}
              id={`rb-tab-${t.kunci}`}
              role="tab"
              type="button"
              aria-selected={aktif}
              aria-controls={`rb-panel-${t.kunci}`}
              onClick={() => {
                setTampilan(t.kunci);
                if (t.kunci === "lacak") setLacakDibuka(true);
              }}
              className={cn(
                "btn-tekan flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-semibold",
                aktif ? "bg-pri/15 text-pri" : "text-teks-sekunder",
              )}
            >
              {t.label}
              {t.kunci === "acc" && !nyata && antrean.length > 0 && (
                <span className="angka-tab rounded-full bg-pri px-1.5 text-[10.5px] font-bold text-white">{antrean.length}</span>
              )}
              {t.kunci === "koordinator" && nyata && (server.koordinator?.usulan_terbuka ?? 0) > 0 && (
                <span className="angka-tab rounded-full bg-pri px-1.5 text-[10.5px] font-bold text-white">{server.koordinator?.usulan_terbuka}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Ruang selalu terpasang (disembunyikan) agar simulasi bot tidak mengulang dari nol. */}
      <div id="rb-panel-ruang" role="tabpanel" aria-labelledby="rb-tab-ruang" hidden={tampilan !== "ruang"}>
        <RuangView
          key={nyata ? `nyata-${tandaBot}` : "contoh"}
          bots={bots}
          kuota={kuota}
          maksKuota={maksKuota}
          hasil={hasil}
          log={log}
          terpilihId={terpilihId}
          jedaGlobal={jedaGlobal}
          nyata={nyata}
          sibuk={sibuk}
          onPilih={setTerpilihId}
          onUbahMode={ubahMode}
          onBukaDetail={(id) => {
            setDetailId(id);
            setTampilan("detail");
          }}
          onJedaGlobal={setJedaGlobal}
          onHariBaru={hariBaru}
          onBotSelesaiPosting={botSelesaiPosting}
          onLog={catatLog}
          onStatus={setStatusHidup}
          koordinator={server.koordinator ?? null}
          chatTerakhir={server.chat_terakhir ?? null}
          onBukaTab={setTampilan}
          onUbahOtakContoh={ubahOtakContoh}
          sayaId={sayaId}
        />
      </div>

      {tampilan === "detail" && (
        <div id="rb-panel-detail" role="tabpanel" aria-labelledby="rb-tab-detail">
          <DetailBotView
            bots={bots}
            terpilihId={detailId}
            onPilihId={setDetailId}
            status={statusHidup}
            kuota={kuota}
            maksKuota={maksKuota}
            hasil={hasil}
            log={log}
            sumber={sumber}
            jedaBot={jedaBot}
            jamSimulasi={jam / 3600}
            nyata={nyata}
            sibuk={sibuk}
            onUbahMode={ubahMode}
            onJedaBot={setJedaBot}
          />
        </div>
      )}

      {tampilan === "acc" && (
        <div id="rb-panel-acc" role="tabpanel" aria-labelledby="rb-tab-acc">
          {nyata ? (
            <AntreanAccNyata />
          ) : (
            <AntreanAccView antrean={antrean} riwayat={riwayat} bots={bots} onKeputusan={keputusan} />
          )}
        </div>
      )}

      {tampilan === "chat" && nyata && (
        <div id="rb-panel-chat" role="tabpanel" aria-labelledby="rb-tab-chat">
          <ChatBotView />
        </div>
      )}

      {tampilan === "koordinator" && nyata && (
        <div id="rb-panel-koordinator" role="tabpanel" aria-labelledby="rb-tab-koordinator">
          <KoordinatorTab />
        </div>
      )}

      {lacakDibuka && (
        <div id="rb-panel-lacak" role="tabpanel" aria-labelledby="rb-tab-lacak" hidden={tampilan !== "lacak"}>
          <LacakSumberView />
        </div>
      )}

      {tampilan === "karakter" && bolehKarakterSaya({ id: sayaId }) && (
        <div id="rb-panel-karakter" role="tabpanel" aria-labelledby="rb-tab-karakter">
          <KarakterSayaPanel />
        </div>
      )}

      {tampilan === "sumber" && (
        <div id="rb-panel-sumber" role="tabpanel" aria-labelledby="rb-tab-sumber">
          <SumberKuotaView
            bots={bots}
            sumber={sumber}
            onSumber={setSumberContoh}
            blokir={blokir}
            onBlokir={setBlokirContoh}
            kendaliSumber={nyata ? kendaliSumber : undefined}
            maksKuota={maksKuota}
            onMaksKuota={setMaksKuota}
            jedaGlobal={jedaGlobal}
            onJedaGlobal={setJedaGlobal}
            renderBerjalan={renderBerjalan}
            nyata={nyata}
            sibuk={sibuk}
          />
        </div>
      )}
    </>
  );
}

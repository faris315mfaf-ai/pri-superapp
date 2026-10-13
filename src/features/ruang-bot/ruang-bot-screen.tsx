"use client";

// ============================================================
// RUANG BOT — tab khusus MASTER (13 Okt 2026).
//
// Cangkang empat tampilan: Ruang (kantor pixel-art tempat bot bekerja),
// Detail Bot, Antrean ACC, Sumber & Kuota. Cangkang ini PEMEGANG STATE;
// tampilan hanya membaca lewat props dan melapor lewat callback.
//
// STATUS: seluruh isi masih DATA CONTOH (simulasi di peramban) karena bot
// belum tersambung ke server. Bentuk tipe di tipe.ts sengaja sama dengan
// yang kelak dikirim /api/bot/status, jadi penyambungannya tinggal mengganti
// sumber state di sini. Gerbang server (bolehRuangBot) wajib dipasang pada
// setiap endpoint /api/bot/* saat endpoint itu dibuat.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { ScreenHeader } from "@/components/pri-ui";
import { cn } from "@/lib/utils";
import { AntreanAccView } from "./antrean-acc-view";
import { BOT_CONTOH, ACC_AWAL, BLOKIR_AWAL, HASIL_AWAL, KUOTA_AWAL, MAKS_KUOTA_AWAL, SUMBER_AWAL } from "./data-contoh";
import { DetailBotView } from "./detail-bot-view";
import { RuangView } from "./ruang-view";
import { SumberKuotaView } from "./sumber-kuota-view";
import type {
  BotContoh,
  HasilHariIni,
  ItemAcc,
  KeputusanAcc,
  LogItem,
  ModeBot,
  StatusHidup,
  SumberContoh,
  TampilanBot,
} from "./tipe";

const TAB: { kunci: TampilanBot; label: string }[] = [
  { kunci: "ruang", label: "Ruang" },
  { kunci: "detail", label: "Detail Bot" },
  { kunci: "acc", label: "Antrean ACC" },
  { kunci: "sumber", label: "Sumber & Kuota" },
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

export function RuangBotScreen() {
  const [tampilan, setTampilan] = useState<TampilanBot>("ruang");
  const [bots, setBots] = useState<BotContoh[]>(BOT_CONTOH);
  const [kuota, setKuota] = useState<Record<string, number>>(KUOTA_AWAL);
  const [maksKuota, setMaksKuota] = useState(MAKS_KUOTA_AWAL);
  const [hasil, setHasil] = useState<HasilHariIni[]>(HASIL_AWAL);
  const [log, setLog] = useState<LogItem[]>([]);
  const [status, setStatus] = useState<Record<string, StatusHidup>>({});
  const [terpilihId, setTerpilihId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string>(BOT_CONTOH[0].id);
  const [antrean, setAntrean] = useState<ItemAcc[]>(ACC_AWAL);
  const [riwayat, setRiwayat] = useState<KeputusanAcc[]>([]);
  const [sumber, setSumber] = useState<SumberContoh[]>(SUMBER_AWAL);
  const [blokir, setBlokir] = useState<string[]>(BLOKIR_AWAL);
  const [jedaGlobal, setJedaGlobal] = useState(false);
  const [jedaBot, setJedaBot] = useState<Record<string, boolean>>({});
  const [jam, setJam] = useState(detikWibSekarang);

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

  const ubahMode = useCallback((id: string, mode: ModeBot) => {
    setBots((b) => b.map((x) => (x.id === id ? { ...x, mode } : x)));
  }, []);

  const catatLog = useCallback((item: LogItem) => {
    setLog((l) => [item, ...l].slice(0, 60));
  }, []);

  const botSelesaiPosting = useCallback((botId: string, judul: string) => {
    const bot = botsRef.current.find((b) => b.id === botId);
    if (!bot) return;
    const gradasi = GRADASI_BARU[Math.floor(Math.random() * GRADASI_BARU.length)];
    const waktu = jamTeks(detikWibSekarang());
    setKuota((k) => ({ ...k, [botId]: (k[botId] ?? 0) + 1 }));
    setHasil((h) =>
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
      setHasil((h) => h.map((x) => (x.judul === item.judul && x.status === "menunggu-acc" ? { ...x, status: "tayang" as const } : x)));
    }
  }, [antrean]);

  const hariBaru = useCallback(() => {
    setKuota({ bot1: 0, bot2: 0, bot3: 0 });
  }, []);

  const renderBerjalan = Object.values(status).filter((s) => s.keadaan === "bekerja" && s.tahap === "edit").length;

  return (
    <div className="kolom-aplikasi kolom-lebar px-4 pb-32">
      <ScreenHeader
        judul="Ruang Bot"
        kanan={
          <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            Data contoh
          </span>
        }
      />

      <div
        role="tablist"
        aria-label="Tampilan Ruang Bot"
        className="tanpa-scrollbar glass mb-4 flex gap-1 overflow-x-auto rounded-2xl p-1"
      >
        {TAB.map((t) => {
          const aktif = tampilan === t.kunci;
          return (
            <button
              key={t.kunci}
              id={`rb-tab-${t.kunci}`}
              role="tab"
              type="button"
              aria-selected={aktif}
              aria-controls={`rb-panel-${t.kunci}`}
              onClick={() => setTampilan(t.kunci)}
              className={cn(
                "btn-tekan flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-semibold",
                aktif ? "bg-pri/15 text-pri" : "text-teks-sekunder",
              )}
            >
              {t.label}
              {t.kunci === "acc" && antrean.length > 0 && (
                <span className="angka-tab rounded-full bg-pri px-1.5 text-[10.5px] font-bold text-white">{antrean.length}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Ruang selalu terpasang (disembunyikan) agar simulasi bot tidak mengulang dari nol. */}
      <div id="rb-panel-ruang" role="tabpanel" aria-labelledby="rb-tab-ruang" hidden={tampilan !== "ruang"}>
        <RuangView
          bots={bots}
          kuota={kuota}
          maksKuota={maksKuota}
          hasil={hasil}
          log={log}
          terpilihId={terpilihId}
          jedaGlobal={jedaGlobal}
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
          onStatus={setStatus}
        />
      </div>

      {tampilan === "detail" && (
        <div id="rb-panel-detail" role="tabpanel" aria-labelledby="rb-tab-detail">
          <DetailBotView
            bots={bots}
            terpilihId={detailId}
            onPilihId={setDetailId}
            status={status}
            kuota={kuota}
            maksKuota={maksKuota}
            hasil={hasil}
            log={log}
            sumber={sumber}
            jedaBot={jedaBot}
            jamSimulasi={jam / 3600}
            onUbahMode={ubahMode}
            onJedaBot={(id, v) => setJedaBot((j) => ({ ...j, [id]: v }))}
          />
        </div>
      )}

      {tampilan === "acc" && (
        <div id="rb-panel-acc" role="tabpanel" aria-labelledby="rb-tab-acc">
          <AntreanAccView antrean={antrean} riwayat={riwayat} bots={bots} onKeputusan={keputusan} />
        </div>
      )}

      {tampilan === "sumber" && (
        <div id="rb-panel-sumber" role="tabpanel" aria-labelledby="rb-tab-sumber">
          <SumberKuotaView
            bots={bots}
            sumber={sumber}
            onSumber={setSumber}
            blokir={blokir}
            onBlokir={setBlokir}
            maksKuota={maksKuota}
            onMaksKuota={setMaksKuota}
            jedaGlobal={jedaGlobal}
            onJedaGlobal={setJedaGlobal}
            renderBerjalan={renderBerjalan}
          />
        </div>
      )}
    </div>
  );
}

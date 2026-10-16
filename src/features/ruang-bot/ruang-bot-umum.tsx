"use client";

// ============================================================
// RUANG BOT UNTUK PENGGUNA UMUM (14 Okt 2026) — mode lihat.
//
// Semua anggota yang login (selain master) melihat: gedung yang sama (bot di mejanya / sofa / kamar tidur,
// Nara, sayap pengguna), siapa yang sedang online (nama + JENIS kegiatan), dan chat global. Tanpa tab
// Detail Bot, Antrean ACC, Sumber & Kuota, Chat bot, Koordinator, dan tanpa kendali apa pun.
// Data dari GET /api/ruang/status (disanitasi server) dan /api/ruang/chat.
// Pesan chat baru muncul sebagai gelembung di atas karakter pengirim.
// Ponsel / wadah sempit: kanvas di atas, lalu tab Ruang / Online / Chat.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { EmptyState, GlassSkeleton, ScreenHeader } from "@/components/pri-ui";
import { useLebarWadah } from "@/hooks/use-kolom-wadah";
import { rapatBerlangsung, sisaRapatMs } from "@/lib/bot-dunia-murni";
import type { PesanGlobal } from "@/lib/chat-global-murni";
import type { PenghuniDunia } from "@/lib/dunia-murni";
import type { BotUmum, StatusRuangUmum } from "@/lib/ruang-umum-murni";
import { cn } from "@/lib/utils";
import { bolehKarakterSaya } from "@/lib/karakter-murni";
import { ChatGlobal } from "./chat-global";
import { KarakterSayaPanel } from "./karakter-saya";
import { WARNA_STASIUN } from "./dunia-sayap";
import { PanelOnline } from "./panel-online";
import { DENAH_SIM_V2 } from "./denah2-sim";
import { petaSasaran } from "./peta-nyata";
import { RuangDunia2 } from "./ruang-dunia2";
import { RuangIsometrik } from "./ruang-isometrik";
import { useRupaSaya } from "./rupa-saya";
import { isiRupaDariDaftar } from "./potret-karakter";
import { SimulasiBot } from "./simulasi-bot";
import { SimulasiPenghuni } from "./simulasi-penghuni";
import type { BotContoh } from "./tipe";
import { useChatGlobal } from "./use-chat-global";
import { useRuangUmum } from "./use-dunia";

const BATAS_DUA_KOLOM = 900;
const LEBAR_PANEL = 380;

type TabPonsel = "ruang" | "online" | "chat";

const LEGENDA: { warna: string; nama: string; isi: string }[] = [
  { warna: "#e9d5ff", nama: "Aula", isi: "Tempat semua yang online" },
  { warna: WARNA_STASIUN.rak, nama: "Ruang database", isi: "Yang sedang mengunggah video" },
  { warna: WARNA_STASIUN.autoedit, nama: "Ruang alat", isi: "Edit Otomatis, Kompres, Blur" },
  { warna: WARNA_STASIUN.kotak_post, nama: "Ruang pos", isi: "Yang sedang posting ke sosmed" },
];

/** Bot versi umum -> bentuk yang dipahami simulasi & kanvas. Tanpa handle, platform, atau judul tugas. */
function botDariUmum(b: BotUmum): BotContoh {
  return {
    id: String(b.id),
    nama: b.nama,
    peran: b.peran,
    persona: "",
    warna: b.warna,
    handle: "",
    platform: "",
    mode: "acc",
    rupa: b.rupa,
    riwayat6Hari: [],
    jadwalHariIni: [],
    rataTayangan: "—",
    punyaOtak: b.punya_otak,
    nyata: {
      id: b.id,
      userId: 0,
      username: "",
      jeda: b.jeda,
      aktif: true,
      jamMulai: "",
      jamSelesai: "",
      gagalBeruntun: 0,
      akunTertaut: 0,
      tugasAktif: b.tahap ? { tahap: b.tahap, judul: "" } : null,
    },
  };
}

const gerakKurang = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- kanvas (dipasang ulang bila daftar bot berubah) ----------

function KanvasUmum({
  bots,
  status,
  penghuni,
  daftar,
  terpilihPenghuniId,
  onPilihPenghuni,
  dunia2,
  sayaId,
}: {
  bots: BotContoh[];
  status: StatusRuangUmum;
  penghuni: SimulasiPenghuni;
  daftar: readonly PenghuniDunia[];
  terpilihPenghuniId: number | null;
  onPilihPenghuni: (id: number | null) => void;
  /** Dunia v2 (gedung 8 ruang pixel art) — harus sama dengan denah simulasi `penghuni`. */
  dunia2: boolean;
  sayaId: number;
}) {
  const jedaGlobal = status.jeda_global;
  const rupaSaya = useRupaSaya();
  const [sim] = useState(
    () =>
      new SimulasiBot(bots, {
        kuotaAwal: {},
        maksKuota: 1,
        diam: true,
        sasaranAwal: petaSasaran(bots, jedaGlobal),
        denah: dunia2 ? DENAH_SIM_V2 : undefined,
      }),
  );
  const [terpilihBot, setTerpilihBot] = useState<string | null>(null);

  useEffect(() => {
    sim.setJeda(jedaGlobal);
    sim.setSasaran(petaSasaran(bots, jedaGlobal));
    for (const b of bots) sim.setPunyaOtak(b.id, b.punyaOtak !== false);
  }, [sim, bots, jedaGlobal]);

  const k = status.koordinator;
  useEffect(() => {
    sim.nara.setKeadaan({ punyaOtak: k?.punya_otak ?? false, usulanTerbuka: 0, nama: k?.nama });
  }, [sim, k?.punya_otak, k?.nama]);

  // Rapat: room Chat bot sedang ramai (pesan terakhir < 3 menit).
  const chatTerakhir = status.chat_terakhir;
  useEffect(() => {
    const hitung = () => sim.setRapat(rapatBerlangsung(chatTerakhir, Date.now()));
    hitung();
    const sisa = sisaRapatMs(chatTerakhir, Date.now());
    if (sisa <= 0) return undefined;
    const t = window.setTimeout(hitung, sisa + 300);
    return () => window.clearTimeout(t);
  }, [sim, chatTerakhir]);

  const botAktif = bots.filter((b) => !b.nyata?.jeda).length;

  const pilihBot = (id: string | null) => {
    setTerpilihBot(id);
    if (id) onPilihPenghuni(null);
  };
  const pilihPenghuni = (id: number | null) => {
    onPilihPenghuni(id);
    if (id !== null) setTerpilihBot(null);
  };
  const pilStatus = (
    <>
      <span className="rounded-lg border border-emerald-400/40 bg-[rgba(8,40,28,.85)] px-2 py-0.5 text-[#bbf7d0]">{status.dunia.jumlah} online</span>
      {bots.length > 0 && (
        <span className="rounded-lg border border-white/10 bg-[rgba(14,11,20,.8)] px-2 py-0.5">
          {jedaGlobal ? "Semua bot dijeda" : `${botAktif} bot aktif`}
        </span>
      )}
    </>
  );

  if (dunia2) {
    return (
      <RuangDunia2
        sim={sim}
        bots={bots}
        malam={false}
        kecepatan={1}
        terpilihId={terpilihBot}
        onPilih={pilihBot}
        penghuni={penghuni}
        daftarPenghuni={daftar}
        terpilihPenghuniId={terpilihPenghuniId}
        onPilihPenghuni={pilihPenghuni}
        sayaId={sayaId}
        rupaSaya={rupaSaya}
        ruangAwal="aula"
        hud={<div className="flex max-w-full flex-wrap gap-1.5 font-mono text-[11px] font-semibold text-[#f4efe8]">{pilStatus}</div>}
      />
    );
  }
  return (
    <RuangIsometrik
      sim={sim}
      bots={bots}
      malam={false}
      kecepatan={1}
      terpilihId={terpilihBot}
      onPilih={pilihBot}
      penghuni={penghuni}
      daftarPenghuni={daftar}
      terpilihPenghuniId={terpilihPenghuniId}
      onPilihPenghuni={pilihPenghuni}
    >
      <div className="pointer-events-none absolute left-2.5 top-2.5 flex flex-wrap gap-1.5 font-mono text-[11px] font-semibold text-[#f4efe8]">{pilStatus}</div>
    </RuangIsometrik>
  );
}

function Legenda() {
  return (
    <ul className="mt-2.5 grid grid-cols-2 gap-2 xl:grid-cols-4">
      {LEGENDA.map((l) => (
        <li key={l.nama} className="rounded-xl border-l-[3px] bg-black/5 px-2.5 py-2 dark:bg-white/5" style={{ borderLeftColor: l.warna }}>
          <b className="block text-[12px] text-teks-utama">{l.nama}</b>
          <span className="text-[11.5px] text-teks-sekunder">{l.isi}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------- layar ----------

export function RuangBotUmumScreen({ sayaId }: { sayaId: number }) {
  const ruang = useRuangUmum();
  const status = ruang.status;
  // Dunia v2 (gedung 8 ruang pixel art) — semua akun (gerbang bolehKarakterSaya).
  const [dunia2] = useState(() => bolehKarakterSaya({ id: sayaId }));
  const [penghuni] = useState(() => new SimulasiPenghuni({ gerakKurang, denah: dunia2 ? DENAH_SIM_V2.penghuni : undefined }));
  const kabarChat = useCallback(
    (baru: PesanGlobal[]) => {
      for (const p of baru) penghuni.kabarChat(p.user_id, p.teks);
    },
    [penghuni],
  );
  const chat = useChatGlobal(kabarChat);

  useEffect(() => {
    if (status) {
      penghuni.setDaftar(status.dunia.online, status.dunia.waktu);
      isiRupaDariDaftar(status.dunia.online);
    }
  }, [penghuni, status]);

  const wadahRef = useRef<HTMLDivElement>(null);
  const lebar = useLebarWadah(wadahRef) ?? 0;
  const duaKolom = lebar >= BATAS_DUA_KOLOM;
  const [tab, setTab] = useState<TabPonsel>("chat");
  const bolehKarakter = bolehKarakterSaya({ id: sayaId });
  const [layar, setLayar] = useState<"ruang" | "karakter">("ruang");
  const [terpilihPenghuniId, setTerpilihPenghuniId] = useState<number | null>(null);

  const botsUmum = status?.bots;
  const bots = useMemo(() => (botsUmum ?? []).map(botDariUmum), [botsUmum]);
  const tandaBot = bots.map((b) => b.id).join(",");
  const daftar = status?.dunia.online ?? [];
  const jumlah = status?.dunia.jumlah ?? 0;

  let isi: React.ReactNode;
  if (!status) {
    isi = ruang.galat ? (
      <EmptyState ikon={AlertTriangle} judul="Ruang Bot gagal dimuat" keterangan={ruang.galat} labelAksi="Coba lagi" onAksi={() => void ruang.muatUlang()} />
    ) : (
      <div role="status" aria-busy="true" className="flex flex-col gap-3">
        <span className="sr-only">Memuat Ruang Bot…</span>
        <GlassSkeleton className="h-72 rounded-2xl" />
        <GlassSkeleton className="h-40 rounded-2xl" />
      </div>
    );
  } else {
    const panelOnline = (kelas?: string, tinggi?: string) => (
      <PanelOnline
        daftar={daftar}
        jumlah={jumlah}
        diluar={penghuni.diluar}
        terpotong={status.dunia.terpotong}
        galat={ruang.galat}
        terpilihId={terpilihPenghuniId}
        onPilih={setTerpilihPenghuniId}
        ringkas
        sayaId={sayaId}
        className={kelas}
        tinggiDaftar={tinggi}
      />
    );
    isi = (
      <div className="grid items-start gap-3.5" style={{ gridTemplateColumns: duaKolom ? `minmax(0,1fr) ${LEBAR_PANEL}px` : "minmax(0,1fr)" }}>
        <GlassCard className="min-w-0 p-2.5">
          <KanvasUmum
            key={tandaBot}
            bots={bots}
            status={status}
            penghuni={penghuni}
            daftar={daftar}
            terpilihPenghuniId={terpilihPenghuniId}
            onPilihPenghuni={setTerpilihPenghuniId}
            dunia2={dunia2}
            sayaId={sayaId}
          />
          {duaKolom && <Legenda />}
        </GlassCard>

        {duaKolom ? (
          <div className="flex min-w-0 flex-col gap-3">
            {panelOnline(undefined, "max-h-[300px]")}
            <ChatGlobal chat={chat} sayaId={sayaId} />
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-3">
            <div role="tablist" aria-label="Bagian Ruang Bot" className="glass grid grid-cols-3 gap-1 rounded-2xl p-1">
              {(
                [
                  ["ruang", "Ruang"],
                  ["online", `Online (${jumlah})`],
                  ["chat", "Chat"],
                ] as const
              ).map(([kunci, label]) => (
                <button
                  key={kunci}
                  id={`rbu-tab-${kunci}`}
                  role="tab"
                  type="button"
                  aria-selected={tab === kunci}
                  aria-controls={`rbu-panel-${kunci}`}
                  onClick={() => setTab(kunci)}
                  className={cn("btn-tekan min-h-10 rounded-xl text-[13px] font-bold", tab === kunci ? "bg-pri/15 text-pri" : "text-teks-sekunder")}
                >
                  {label}
                </button>
              ))}
            </div>
            <div id="rbu-panel-ruang" role="tabpanel" aria-labelledby="rbu-tab-ruang" hidden={tab !== "ruang"}>
              <GlassCard className="p-3.5 text-[12.5px] leading-relaxed text-teks-sekunder">
                Ketuk karakter di ruangan untuk melihat nama dan kegiatannya. Gelembung chat muncul sebentar di atas karakter yang
                mengirim pesan.
                <Legenda />
              </GlassCard>
            </div>
            <div id="rbu-panel-online" role="tabpanel" aria-labelledby="rbu-tab-online" hidden={tab !== "online"}>
              {panelOnline(undefined, "max-h-[60vh]")}
            </div>
            {/* Chat tetap terpasang saat tab lain dibuka supaya ketikan tidak hilang. */}
            <div id="rbu-panel-chat" role="tabpanel" aria-labelledby="rbu-tab-chat" hidden={tab !== "chat"}>
              <ChatGlobal chat={chat} sayaId={sayaId} tinggiDaftar="max-h-[55vh]" />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={wadahRef} className="kolom-aplikasi kolom-lebar px-4 pb-32">
      <ScreenHeader
        judul="Ruang Bot"
        kanan={
          <div className="flex shrink-0 items-center gap-1.5">
            {status && (
              <span className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                {jumlah} online
              </span>
            )}
            <span className="rounded-full border border-black/10 bg-black/5 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-teks-sekunder dark:border-white/10 dark:bg-white/5">
              Mode lihat
            </span>
          </div>
        }
      />
      <p className="-mt-2 mb-3 text-[12px] text-teks-sekunder">
        Anda melihat ruangan secara langsung. Kendali bot, antrean ACC, dan sumber hanya untuk master.
      </p>
      {bolehKarakter && (
        <div role="tablist" aria-label="Tampilan Ruang Bot" className="glass mb-3 grid grid-cols-2 gap-1 rounded-2xl p-1">
          {(
            [
              ["ruang", "Ruang"],
              ["karakter", "Karakter Saya"],
            ] as const
          ).map(([kunci, label]) => (
            <button
              key={kunci}
              id={`rbu-layar-${kunci}`}
              role="tab"
              type="button"
              aria-selected={layar === kunci}
              aria-controls={`rbu-isi-${kunci}`}
              onClick={() => setLayar(kunci)}
              className={cn("btn-tekan min-h-10 rounded-xl text-[13px] font-bold", layar === kunci ? "bg-pri/15 text-pri" : "text-teks-sekunder")}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div id="rbu-isi-ruang" role={bolehKarakter ? "tabpanel" : undefined} hidden={bolehKarakter && layar !== "ruang"}>
        {isi}
      </div>
      {bolehKarakter && layar === "karakter" && (
        <div id="rbu-isi-karakter" role="tabpanel" aria-labelledby="rbu-layar-karakter">
          <KarakterSayaPanel ringkas={!duaKolom} />
        </div>
      )}
    </div>
  );
}

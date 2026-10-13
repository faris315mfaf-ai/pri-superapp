"use client";

// ============================================================
// TUGAS BOT di TVR Saya akun bot (2F, 13 Okt 2026).
//
// Hanya dirender untuk akun Divisi BOT (saat master masuk ke akun bot lewat
// Kendali Akun BOT). Empat bagian: ringkasan bot, permintaan Video Wajib
// Pimred (tombol "Ambil sekarang" dengan konfirmasi di halaman), kandidat
// video dari sumber (tombol "Cari sekarang"), dan 10 tugas terbaru bot.
//
// Data: GET /api/bot/tugas-saya (getTugasBotSaya); aksi: POST (kirimAksiTugasBot).
// Segar otomatis 30 dtk lewat useSegarOtomatis (hanya saat tab terlihat).
// Anti-balapan: tiap muatan bernomor, hasil lama dibuang; unmount aman.
// Logika label/urutan ada di tugas-bot-murni.ts (diuji tests/uji-tugas-bot.mts).
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, CalendarClock, Clock3, Database, ExternalLink, Globe, Loader2, RefreshCw, Search, Zap } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { EmptyState, GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { PlatformIcon } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import { useSegarOtomatis } from "@/hooks/use-segar-otomatis";
import { waktuRelatif } from "@/features/ruang-bot/peta-nyata";
import { tampilkanHandle } from "@/lib/bot-sumber";
import type { AksiTugasBot, KandidatBotRingkas, PermintaanWajibRingkas, TugasBotRingkas, TugasBotSaya } from "@/lib/bot-tipe";
import { cn } from "@/lib/utils";
import { getTugasBotSaya, kirimAksiTugasBot } from "@/services";
import {
  bisaAmbilPermintaan,
  formatAngkaRingkas,
  formatDurasi,
  formatTenggat,
  hariIniWib,
  judulTampil,
  labelAlasanTutup,
  labelJeda,
  labelMode,
  labelStatusKandidat,
  labelStatusPermintaan,
  labelTahap,
  MAKS_KANDIDAT_TAMPIL,
  persenKuota,
  platformPunyaIkon,
  platformTampil,
  potongUrl,
  ringkasGalat,
  tenggatMendesak,
  teksKuota,
  tugasTerbaru,
  urlAman,
  urutkanKandidat,
  urutkanPermintaan,
  warnaStatusKandidat,
  warnaTahap,
} from "./tugas-bot-murni";

/** Kunci "sedang diproses": aksi cari, atau ambil permintaan tertentu. */
const KUNCI_CARI = "cari_sekarang";
const kunciAmbil = (id: number) => `ambil:${id}`;

// ---------- Hook data ----------

type DataTugasBot = {
  data: TugasBotSaya | null;
  galat: string;
  muat: () => Promise<void>;
  /** Kunci aksi yang sedang berjalan ("" = tidak ada). */
  sibuk: string;
  jalankan: (kunci: string, aksi: AksiTugasBot, judulSukses: string, isiSukses: string) => Promise<boolean>;
};

function useTugasBot(): DataTugasBot {
  const [data, setData] = useState<TugasBotSaya | null>(null);
  const [galat, setGalat] = useState("");
  const [sibuk, setSibuk] = useState("");
  const hidupRef = useRef(true);
  /** Nomor muatan terbaru; hasil bernomor lebih kecil dibuang. */
  const nomorRef = useRef(0);
  /** Penjaga klik ganda yang tidak menunggu render ulang. */
  const sibukRef = useRef("");

  useEffect(() => {
    hidupRef.current = true;
    return () => {
      hidupRef.current = false;
    };
  }, []);

  const muat = useCallback(async (): Promise<void> => {
    const nomor = ++nomorRef.current;
    try {
      const d = await getTugasBotSaya();
      if (!hidupRef.current || nomor !== nomorRef.current) return;
      setData(d);
      setGalat("");
    } catch (e) {
      if (!hidupRef.current || nomor !== nomorRef.current) return;
      setGalat(e instanceof Error && e.message ? e.message : "Gagal memuat Tugas Bot");
    }
  }, []);

  // Muatan awal (ditunda satu tick: tanpa setState sinkron di effect).
  useEffect(() => {
    void Promise.resolve().then(muat);
  }, [muat]);

  // Segar otomatis ±30 dtk + tombol refresh sistem + saat aplikasi kembali dari latar.
  useSegarOtomatis(() => void muat(), 30);

  const jalankan = useCallback(
    async (kunci: string, aksi: AksiTugasBot, judulSukses: string, isiSukses: string): Promise<boolean> => {
      if (sibukRef.current) return false; // cegah klik ganda
      sibukRef.current = kunci;
      setSibuk(kunci);
      let ok = false;
      try {
        await kirimAksiTugasBot(aksi);
        ok = true;
        toast("sukses", judulSukses, isiSukses);
      } catch (e) {
        // Pesan server (termasuk 409) ditampilkan apa adanya.
        const pesan = e instanceof Error && e.message ? e.message : "Server menolak permintaan ini.";
        toast("error", "Aksi gagal", pesan);
      } finally {
        sibukRef.current = "";
        if (hidupRef.current) setSibuk("");
      }
      // Sukses atau gagal, samakan dengan server (permintaan bisa sudah diambil bot lain).
      await muat();
      return ok;
    },
    [muat],
  );

  return { data, galat, muat, sibuk, jalankan };
}

// ---------- Potongan tampilan ----------

function JudulBagian({ judul, ikon: Ikon, aksi }: { judul: string; ikon: typeof Bot; aksi?: React.ReactNode }) {
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-2">
      <h3 className="flex min-w-0 items-center gap-2 font-heading text-[14px] font-bold text-teks-utama">
        <Ikon className="h-4 w-4 shrink-0 text-pri" aria-hidden="true" />
        <span className="truncate">{judul}</span>
      </h3>
      {aksi}
    </div>
  );
}

function IkonPlatform({ platform }: { platform: string }) {
  return platformPunyaIkon(platform) ? (
    <PlatformIcon platform={platform} size={16} />
  ) : (
    <Globe className="h-4 w-4 text-teks-sekunder" aria-hidden="true" />
  );
}

function BarisKosong({ teks }: { teks: string }) {
  return <p className="px-2 py-5 text-center text-[12px] leading-relaxed text-teks-sekunder">{teks}</p>;
}

// ---------- (a) Ringkasan bot ----------

function KartuBot({ d }: { d: TugasBotSaya }) {
  const bot = d.bot;
  if (!bot) return null;
  const jeda = labelJeda(bot.jeda, d.jeda_global);
  const persen = persenKuota(bot.post_hari_ini, bot.kuota_harian);
  const alasan = d.bisa_mulai ? "" : labelAlasanTutup(d.alasan_tutup, { mulai: bot.jam_mulai, selesai: bot.jam_selesai });
  const runnerTeks = d.runner.online
    ? `Runner online · denyut ${waktuRelatif(d.runner.terakhir_denyut)}`
    : d.runner.terakhir_denyut
      ? `Runner mati · denyut terakhir ${waktuRelatif(d.runner.terakhir_denyut)}`
      : "Runner mati · belum pernah berdenyut";

  return (
    <GlassCard className="p-4" ariaLabel="Ringkasan bot">
      <div className="flex items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
          style={{ background: bot.warna || "#DC2626" }}
          aria-hidden="true"
        >
          <Bot className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-[15px] font-bold text-teks-utama">{bot.nama}</p>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-teks-sekunder">
            <IkonPlatform platform={bot.platform} />
            <span className="truncate">
              {tampilkanHandle(bot.platform, bot.handle)} · {bot.platform}
            </span>
          </p>
        </div>
        <StatusBadge label={labelMode(bot.mode)} warna={bot.mode === "otomatis" ? "biru" : "kuning"} className="shrink-0" />
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between gap-2 text-[12px]">
          <span className="font-semibold text-teks-utama">Kuota video</span>
          <span className="angka-tab text-teks-sekunder">{teksKuota(bot.post_hari_ini, bot.kuota_harian)}</span>
        </div>
        <div
          className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10"
          role="progressbar"
          aria-label="Kuota video bot hari ini"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={persen}
        >
          <div className="h-full rounded-full bg-pri transition-[width] duration-500" style={{ width: `${persen}%` }} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <StatusBadge label={jeda.label} warna={jeda.jeda ? "kuning" : "hijau"} />
        <StatusBadge label={runnerTeks} warna={d.runner.online ? "hijau" : "merah"} berkedip={d.runner.online} />
        <StatusBadge label={`${bot.akun_tertaut} akun sosmed tertaut`} warna={bot.akun_tertaut > 0 ? "netral" : "kuning"} />
      </div>

      <div
        className={cn(
          "mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-[12px] leading-relaxed",
          d.bisa_mulai
            ? "border-sukses/30 bg-sukses/10 text-teks-utama"
            : "border-amber-400/40 bg-amber-400/10 text-teks-utama",
        )}
        role="status"
      >
        {d.bisa_mulai ? <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> : <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />}
        <span className="min-w-0">{d.bisa_mulai ? "Bot siap memulai tugas baru." : alasan || "Bot belum bisa memulai tugas baru saat ini."}</span>
      </div>
    </GlassCard>
  );
}

// ---------- (b) Permintaan Video Wajib ----------

function BarisPermintaan({
  p,
  botBisaMulai,
  alasan,
  konfirmasi,
  sibuk,
  sibukLain,
  onMinta,
  onBatal,
  hariIni,
}: {
  p: PermintaanWajibRingkas;
  botBisaMulai: boolean;
  alasan: string;
  konfirmasi: boolean;
  sibuk: boolean;
  sibukLain: boolean;
  onMinta: () => void;
  onBatal: () => void;
  hariIni: string;
}) {
  const bisa = bisaAmbilPermintaan(p, botBisaMulai);
  const mendesak = tenggatMendesak(p.batas_waktu, hariIni);
  const terbuka = p.status === "terbuka";
  return (
    <li className="rounded-2xl border border-black/10 bg-black/[0.03] p-3 dark:border-white/10 dark:bg-white/[0.04]">
      <p className="break-words text-[13px] font-bold leading-snug text-teks-utama">{judulTampil(p.judul)}</p>
      {p.keterangan.trim() !== "" && (
        <p className="mt-1 line-clamp-2 break-words text-[12px] leading-relaxed text-teks-sekunder">{p.keterangan.trim()}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {p.kategori.trim() !== "" && <StatusBadge label={p.kategori.trim()} warna="pri" />}
        <StatusBadge label={formatTenggat(p.batas_waktu)} warna={mendesak ? "merah" : "netral"} />
        <StatusBadge label={labelStatusPermintaan(p.status)} warna={terbuka ? "kuning" : "biru"} />
      </div>
      {terbuka && (
        <div className="mt-3">
          {konfirmasi && bisa ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onMinta}
                disabled={sibuk || sibukLain}
                aria-label={`Konfirmasi: bot mulai membuat video "${judulTampil(p.judul)}"`}
                className="btn-tekan flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-center text-[12.5px] font-bold leading-tight text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #DC2626, #F59E0B)" }}
              >
                {sibuk && <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />}
                Yakin? Bot akan mulai membuat video ini
              </button>
              <button
                type="button"
                onClick={onBatal}
                disabled={sibuk}
                className="glass btn-tekan flex min-h-[44px] items-center justify-center rounded-xl px-4 py-2 text-[12.5px] font-bold text-teks-utama disabled:opacity-60"
              >
                Batal
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onMinta}
              disabled={!bisa || sibukLain}
              aria-label={`Ambil permintaan "${judulTampil(p.judul)}" sekarang`}
              aria-describedby={bisa ? undefined : "alasan-tutup-tugas-bot"}
              title={bisa ? undefined : alasan}
              className="btn-tekan flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-50 sm:w-auto sm:px-5"
              style={{ background: "linear-gradient(135deg, #DC2626, #F59E0B)" }}
            >
              <Zap className="h-4 w-4" aria-hidden="true" />
              Ambil sekarang
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function BagianPermintaan({
  d,
  konfirmasiId,
  setKonfirmasiId,
  sibuk,
  jalankan,
}: {
  d: TugasBotSaya;
  konfirmasiId: number | null;
  setKonfirmasiId: (id: number | null) => void;
  sibuk: string;
  jalankan: DataTugasBot["jalankan"];
}) {
  const daftar = urutkanPermintaan(d.permintaan_wajib);
  const hariIni = hariIniWib();
  const alasan = d.bot ? labelAlasanTutup(d.alasan_tutup, { mulai: d.bot.jam_mulai, selesai: d.bot.jam_selesai }) : "";
  const adaTerbuka = daftar.some((p) => p.status === "terbuka");

  async function ambil(p: PermintaanWajibRingkas) {
    if (!bisaAmbilPermintaan(p, d.bisa_mulai)) return;
    if (konfirmasiId !== p.id) {
      setKonfirmasiId(p.id); // klik pertama: minta konfirmasi di halaman
      return;
    }
    await jalankan(
      kunciAmbil(p.id),
      { aksi: "ambil_permintaan", id: p.id },
      "Permintaan diambil",
      "Bot akan mulai membuat video ini pada siklus berikutnya.",
    );
    // Berhasil atau ditolak server, konfirmasi ditutup (data sudah dimuat ulang).
    setKonfirmasiId(null);
  }

  return (
    <section aria-label="Permintaan Video Wajib dari Pimred">
      <JudulBagian judul="Permintaan Video Wajib dari Pimred" ikon={CalendarClock} />
      <GlassCard className="p-3">
        {adaTerbuka && !d.bisa_mulai && (
          <p
            id="alasan-tutup-tugas-bot"
            className="mb-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[12px] leading-relaxed text-teks-utama"
          >
            Belum bisa diambil: {alasan || "Bot belum bisa memulai tugas baru saat ini."}
          </p>
        )}
        {daftar.length === 0 ? (
          <BarisKosong teks="Tidak ada permintaan Video Wajib yang aktif saat ini." />
        ) : (
          <ul className="flex flex-col gap-2">
            {daftar.map((p) => (
              <BarisPermintaan
                key={p.id}
                p={p}
                botBisaMulai={d.bisa_mulai}
                alasan={alasan}
                konfirmasi={konfirmasiId === p.id}
                sibuk={sibuk === kunciAmbil(p.id)}
                sibukLain={sibuk !== ""}
                onMinta={() => void ambil(p)}
                onBatal={() => setKonfirmasiId(null)}
                hariIni={hariIni}
              />
            ))}
          </ul>
        )}
      </GlassCard>
    </section>
  );
}

// ---------- (c) Kandidat video ----------

function BarisKandidat({ k }: { k: KandidatBotRingkas }) {
  const platform = platformTampil(k.platform, k.url);
  const tautan = urlAman(k.url);
  const isi = (
    <>
      <span className="block break-words text-[12.5px] font-semibold leading-snug text-teks-utama">{judulTampil(k.judul, potongUrl(k.url) || "(tanpa judul)")}</span>
      <span className="mt-0.5 block truncate text-[11px] text-teks-sekunder">{potongUrl(k.url)}</span>
    </>
  );
  return (
    <li className="rounded-2xl border border-black/10 bg-black/[0.03] p-3 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0">
          <IkonPlatform platform={platform} />
        </span>
        <div className="min-w-0 flex-1">
          {tautan ? (
            <a
              href={tautan}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Buka video sumber di ${platform} (tab baru)`}
              className="block min-w-0"
            >
              {isi}
            </a>
          ) : (
            <div className="min-w-0">{isi}</div>
          )}
          <p className="angka-tab mt-1 text-[11px] text-teks-sekunder">
            {platform} · {formatDurasi(k.durasi_detik)} · {formatAngkaRingkas(k.tayangan)} tayangan · terbit {waktuRelatif(k.waktu_terbit)}
          </p>
          <div className="mt-1.5">
            <StatusBadge label={labelStatusKandidat(k.status)} warna={warnaStatusKandidat(k.status)} />
          </div>
        </div>
        {tautan && <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-teks-sekunder" aria-hidden="true" />}
      </div>
    </li>
  );
}

function BagianKandidat({ d, sibuk, jalankan }: { d: TugasBotSaya; sibuk: string; jalankan: DataTugasBot["jalankan"] }) {
  const tampil = urutkanKandidat(d.kandidat, MAKS_KANDIDAT_TAMPIL);
  const sedangCari = sibuk === KUNCI_CARI;
  const adaSumberAktif = d.sumber.some((s) => s.aktif);
  return (
    <section aria-label="Kandidat video dari sumber">
      <JudulBagian
        judul="Kandidat video dari sumber"
        ikon={Search}
        aksi={
          <button
            type="button"
            onClick={() =>
              void jalankan(KUNCI_CARI, { aksi: "cari_sekarang" }, "Pencarian dijadwalkan", "Sumber aktif ditandai; hasilnya muncul beberapa menit lagi.")
            }
            disabled={sibuk !== "" || !adaSumberAktif}
            aria-label="Cari kandidat video sekarang"
            className="btn-tekan flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-[12.5px] font-bold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #DC2626, #F59E0B)" }}
          >
            {sedangCari ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
            Cari sekarang
          </button>
        }
      />
      <GlassCard className="p-3">
        <p className="mb-3 text-[11.5px] leading-relaxed text-teks-sekunder">
          Menandai semua sumber aktif agar dipanen pada siklus berikutnya; hasilnya muncul beberapa menit lagi.
          {!adaSumberAktif && " Belum ada sumber aktif untuk bot ini, jadi tombol dinonaktifkan."}
        </p>
        {tampil.length === 0 ? (
          <BarisKosong teks="Belum ada kandidat video. Tekan Cari sekarang atau tunggu siklus panen berikutnya." />
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {tampil.map((k) => (
                <BarisKandidat key={k.id} k={k} />
              ))}
            </ul>
            {d.kandidat.length > tampil.length && (
              <p className="mt-2 text-center text-[11px] text-teks-sekunder">
                Menampilkan {tampil.length} dari {d.kandidat.length} kandidat.
              </p>
            )}
          </>
        )}
      </GlassCard>
    </section>
  );
}

// ---------- (d) Tugas bot ----------

function BarisTugas({ t }: { t: TugasBotRingkas }) {
  const gagal = t.tahap === "gagal";
  const galat = gagal ? ringkasGalat(t.galat) : "";
  return (
    <li className="rounded-2xl border border-black/10 bg-black/[0.03] p-3 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 break-words text-[12.5px] font-semibold leading-snug text-teks-utama">{judulTampil(t.judul)}</p>
        <StatusBadge label={labelTahap(t.tahap)} warna={warnaTahap(t.tahap)} className="shrink-0" />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {t.dari_video_wajib && <StatusBadge label="Dari Video Wajib" warna="pri" />}
        {t.kategori.trim() !== "" && <span className="text-[11px] text-teks-sekunder">{t.kategori.trim()}</span>}
        <span className="text-[11px] text-teks-sekunder">
          · dibuat {waktuRelatif(t.dibuat_pada)}
          {t.selesai_pada ? ` · selesai ${waktuRelatif(t.selesai_pada)}` : ""}
        </span>
      </div>
      {gagal && (
        <p className="mt-1.5 break-words rounded-lg bg-gagal/10 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-red-600 dark:text-red-400">
          {galat || "Tugas gagal tanpa keterangan galat."}
        </p>
      )}
    </li>
  );
}

function BagianTugas({ d }: { d: TugasBotSaya }) {
  const daftar = tugasTerbaru(d.tugas);
  return (
    <section aria-label="Tugas bot ini">
      <JudulBagian judul="Tugas bot ini" ikon={Bot} />
      <GlassCard className="p-3">
        {daftar.length === 0 ? (
          <BarisKosong teks="Bot ini belum punya tugas. Tugas muncul setelah bot mulai bekerja." />
        ) : (
          <ul className="flex flex-col gap-2">
            {daftar.map((t) => (
              <BarisTugas key={t.id} t={t} />
            ))}
          </ul>
        )}
      </GlassCard>
    </section>
  );
}

// ---------- Panel ----------

export function TugasBotTvr() {
  const { data, galat, muat, sibuk, jalankan } = useTugasBot();
  const [konfirmasiId, setKonfirmasiId] = useState<number | null>(null);
  const [menyegarkan, setMenyegarkan] = useState(false);
  const hidupRef = useRef(true);
  useEffect(() => {
    hidupRef.current = true;
    return () => {
      hidupRef.current = false;
    };
  }, []);

  async function muatUlang() {
    if (menyegarkan) return;
    setMenyegarkan(true);
    try {
      await muat();
    } finally {
      if (hidupRef.current) setMenyegarkan(false);
    }
  }

  const tombolMuat = (
    <button
      type="button"
      onClick={() => void muatUlang()}
      disabled={menyegarkan}
      aria-label="Muat ulang Tugas Bot"
      className="glass btn-tekan flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-teks-utama disabled:opacity-60"
    >
      <RefreshCw className={cn("h-4 w-4", menyegarkan && "animate-spin")} aria-hidden="true" />
    </button>
  );

  let isi: React.ReactNode;
  if (!data) {
    isi = galat ? (
      <GlassCard className="p-4">
        <p className="text-[13px] font-bold text-teks-utama">Tugas Bot gagal dimuat</p>
        <p className="mt-1 break-words text-[12px] leading-relaxed text-teks-sekunder">{galat}</p>
        <button
          type="button"
          onClick={() => void muatUlang()}
          disabled={menyegarkan}
          className="btn-tekan mt-3 flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 text-[12.5px] font-bold text-white disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #DC2626, #F59E0B)" }}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Coba lagi
        </button>
      </GlassCard>
    ) : (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Memuat Tugas Bot">
        <GlassSkeleton className="h-44 rounded-2xl" />
        <GlassSkeleton className="h-32 rounded-2xl" />
      </div>
    );
  } else if (!data.tabel_ada) {
    isi = (
      <GlassCard>
        <EmptyState ikon={Database} judul="Bot belum diaktifkan" keterangan="Bot belum diaktifkan (migrasi belum dijalankan). Hubungi master." />
      </GlassCard>
    );
  } else if (!data.bot) {
    isi = (
      <GlassCard>
        <EmptyState ikon={Bot} judul="Akun ini belum terdaftar sebagai bot" keterangan="Akun ini belum punya data bot redaksi. Hubungi master untuk mendaftarkannya." />
      </GlassCard>
    );
  } else {
    isi = (
      <div className="flex flex-col gap-4">
        {galat && (
          <p className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[12px] leading-relaxed text-teks-utama" role="status">
            Gagal menyegarkan, menampilkan data terakhir. {galat}
          </p>
        )}
        <KartuBot d={data} />
        <BagianPermintaan d={data} konfirmasiId={konfirmasiId} setKonfirmasiId={setKonfirmasiId} sibuk={sibuk} jalankan={jalankan} />
        <BagianKandidat d={data} sibuk={sibuk} jalankan={jalankan} />
        <BagianTugas d={data} />
      </div>
    );
  }

  return (
    <section className="mt-1 min-w-0" aria-label="Tugas Bot">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="min-w-0 text-[12px] leading-relaxed text-teks-sekunder">
          Permintaan Pimred, kandidat video, dan tugas bot ini. Diperbarui otomatis tiap 30 detik.
        </p>
        {tombolMuat}
      </div>
      {isi}
    </section>
  );
}

"use client";

// ============================================================
// PetScreen (3 Sep 2026, terbuka untuk semua) — modul PET ROBOT ala POU, v3.
//   • Belum punya robot → pilih pria (biru-hitam) / wanita (pink-putih) + nama.
//   • Punya robot → panggung robot (animasi mengikuti energi & kenyang),
//     4 kebutuhan, XP/level, rawat (makan DARI INVENTORI, main, mandi, tidur),
//     TOKO tiga bagian (aksesoris / makanan / sparepart), LEMARI (aksesoris &
//     sparepart), ganti nama, ganti jenis, mulai ulang.
// Semua aturan angka ada di lib/pet.ts; server (/api/pet) yang memutuskan.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BatteryCharging,
  Check,
  Cog,
  Crown,
  Droplets,
  Gamepad2,
  Lock,
  Moon,
  Palette,
  Pencil,
  RefreshCw,
  Shirt,
  ShoppingBag,
  Smile,
  Sparkles,
  Sun,
  Utensils,
  X,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton, ScreenHeader, StatusBadge } from "@/components/pri-ui";
import { KoinChip } from "@/components/koin-chip";
import { toast } from "@/hooks/use-app-store";
import { getPet, petAksi, type PetState } from "@/services";
import {
  BAGIAN_LABEL,
  EFEK_PERAWATAN,
  HADIAH_HARIAN_KOIN,
  KATALOG_AKSESORIS,
  KATALOG_MAKANAN,
  KATALOG_SKIN,
  KATALOG_SPAREPART,
  HARGA_WARNA_CUSTOM,
  KODE_WARNA_CUSTOM,
  labelMusimSkin,
  LABEL_SUASANA,
  LABEL_VITALITAS,
  makananDariKode,
  NAMA_MAKS,
  PALET,
  PRESET_WARNA,
  skinTersedia,
  SLOT_LABEL,
  XP_MAKAN,
  type BagianSparepart,
  type JenisRobot,
  type Perawatan,
  type SlotAksesoris,
} from "@/lib/pet";
import { cn } from "@/lib/utils";
import { RobotSvg } from "./robot-svg";

const MERAH = "linear-gradient(135deg, #DC2626, #B91C1C)";
const SEGAR_MS = 60_000;
const SLOT_URUT: SlotAksesoris[] = [
  "kepala",
  "mata",
  "leher",
  "badan",
  "tangan",
  "punggung",
  "aura",
];
const BAGIAN_URUT: BagianSparepart[] = [
  "kepala",
  "mata",
  "tubuh",
  "kaki",
  "tangan",
];

function warnaNilai(n: number): string {
  if (n < 25) return "#DC2626";
  if (n < 50) return "#F59E0B";
  return "#10B981";
}

function BarKebutuhan({
  label,
  nilai,
  Ikon,
}: {
  label: string;
  nilai: number;
  Ikon: typeof Utensils;
}) {
  return (
    <div className="glass-soft rounded-xl p-2.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11.5px] font-bold text-teks-utama">
          <Ikon className="h-3.5 w-3.5" style={{ color: warnaNilai(nilai) }} />{" "}
          {label}
        </span>
        <span
          className="angka-tab text-[11.5px] font-extrabold"
          style={{ color: warnaNilai(nilai) }}
        >
          {nilai}
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${nilai}%`, background: warnaNilai(nilai) }}
        />
      </div>
    </div>
  );
}

function latarJenis(jenis: JenisRobot): string {
  return jenis === "pria"
    ? "linear-gradient(160deg, rgba(59,130,246,0.22), rgba(17,24,39,0.30))"
    : "linear-gradient(160deg, rgba(236,72,153,0.22), rgba(255,255,255,0.35))";
}

function teksEfek(e: {
  kenyang?: number;
  energi?: number;
  senang?: number;
}): string {
  return Object.entries(e)
    .filter(([, v]) => v)
    .map(([k, v]) => `${(v as number) > 0 ? "+" : ""}${v} ${k}`)
    .join(" · ");
}

// ------------------------------------------------------------
// Pemilihan robot (adopsi)
// ------------------------------------------------------------
function PilihRobot({
  onSelesai,
}: {
  onSelesai: (st: PetState, pesan?: string) => void;
}) {
  const [jenis, setJenis] = useState<JenisRobot>("pria");
  const [nama, setNama] = useState("");
  const [sibuk, setSibuk] = useState(false);

  async function adopsi() {
    if (sibuk) return;
    setSibuk(true);
    try {
      const r = await petAksi("pilih", { jenis, nama: nama.trim() });
      onSelesai(r, r.pesan);
    } catch (e) {
      toast("error", "Gagal mengadopsi", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <GlassCard className="p-4">
      <p className="text-[13px] font-bold text-teks-utama">
        Pilih robot peliharaan Anda
      </p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-teks-sekunder">
        Rawat robotnya setiap hari: beri makanan dari toko, ajak main, mandikan,
        dan biarkan tidur. Robot yang bahagia naik level, dan Anda bisa
        mendandaninya dengan aksesoris & sparepart memakai koin.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {(["pria", "wanita"] as JenisRobot[]).map((j) => {
          const aktif = jenis === j;
          return (
            <button
              key={j}
              type="button"
              onClick={() => setJenis(j)}
              aria-pressed={aktif}
              className={cn(
                "btn-tekan flex flex-col items-center rounded-2xl border-2 p-3 transition-colors",
                aktif ? "border-pri" : "border-transparent",
              )}
              style={{ background: latarJenis(j) }}
            >
              <RobotSvg
                jenis={j}
                suasana="senang"
                vitalitas="semangat"
                ukuran={120}
              />
              <span className="mt-1 text-[12.5px] font-extrabold text-teks-utama">
                {j === "pria" ? "Robot Pria" : "Robot Wanita"}
              </span>
              <span className="text-[10.5px] text-teks-sekunder">
                {j === "pria" ? "aksen biru–hitam" : "aksen pink–putih"}
              </span>
              {aktif ? <StatusBadge label="dipilih" warna="hijau" /> : null}
            </button>
          );
        })}
      </div>
      <input
        value={nama}
        onChange={(e) => setNama(e.target.value)}
        maxLength={NAMA_MAKS}
        placeholder={
          jenis === "pria"
            ? "Nama robot (bawaan: Robi)"
            : "Nama robot (bawaan: Rina)"
        }
        className="glass-input mt-3 h-11 w-full rounded-xl px-3 text-[13px] text-teks-utama"
      />
      <button
        type="button"
        onClick={() => void adopsi()}
        disabled={sibuk}
        className="btn-tekan mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[13.5px] font-bold text-white disabled:opacity-50"
        style={{ background: MERAH }}
      >
        <Sparkles className="h-4 w-4" /> Adopsi robot ini
      </button>
    </GlassCard>
  );
}

// ------------------------------------------------------------
// Layar utama
// ------------------------------------------------------------
export function PetScreen({
  onKembali,
  onBerubah,
}: {
  onKembali: () => void;
  onBerubah?: () => void;
}) {
  const [st, setSt] = useState<PetState | null>(null);
  const [tab, setTab] = useState<"rawat" | "toko" | "lemari">("rawat");
  const [toko, setToko] = useState<
    "aksesoris" | "makanan" | "sparepart" | "eksklusif"
  >("aksesoris");
  // Warna yang sedang dipilih di panel Warna Custom ("" = ikut warna tersimpan).
  const [warnaPilih, setWarnaPilih] = useState("");
  const [lemari, setLemari] = useState<"aksesoris" | "sparepart">("aksesoris");
  const [sibuk, setSibuk] = useState("");
  const [editNama, setEditNama] = useState(false);
  const [namaBaru, setNamaBaru] = useState("");
  const [pilihMakanan, setPilihMakanan] = useState(false);
  // Animasi makan: emoji terbang ke mulut + mulut mengunyah ±1,4 dtk.
  const [emojiMakan, setEmojiMakan] = useState<string | null>(null);
  const timerMakan = useRef<ReturnType<typeof setTimeout> | null>(null);

  function terima(d: PetState, pesan?: string) {
    setSt(d);
    if (pesan) toast("sukses", pesan);
    onBerubah?.();
  }

  useEffect(() => {
    let hidup = true;
    const muat = () =>
      getPet()
        .then((d) => hidup && setSt(d))
        .catch(
          (e) =>
            hidup &&
            toast(
              "error",
              "Gagal memuat robot",
              e instanceof Error ? e.message : "",
            ),
        );
    void muat();
    const t = setInterval(() => void muat(), SEGAR_MS);
    return () => {
      hidup = false;
      clearInterval(t);
      if (timerMakan.current) clearTimeout(timerMakan.current);
    };
  }, []);

  async function jalankan(
    kunci: string,
    aksi: string,
    data: Record<string, unknown> = {},
  ) {
    if (sibuk) return null;
    setSibuk(kunci);
    try {
      const r = await petAksi(aksi, data);
      terima(r, r.pesan);
      return r;
    } catch (e) {
      toast("peringatan", "Tidak bisa", e instanceof Error ? e.message : "");
      return null;
    } finally {
      setSibuk("");
    }
  }

  async function beriMakan(kode: string) {
    const item = makananDariKode(kode);
    if (!item) return;
    setPilihMakanan(false);
    const r = await jalankan(`makan:${kode}`, "makan", { kode });
    if (!r) return;
    setEmojiMakan(item.emoji);
    if (timerMakan.current) clearTimeout(timerMakan.current);
    timerMakan.current = setTimeout(() => setEmojiMakan(null), 1400);
  }

  if (!st) {
    return (
      <div className="kolom-aplikasi px-4 pb-32">
        <ScreenHeader judul="Pet Robot" onKembali={onKembali} />
        <GlassSkeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!st.ada || !st.jenis) {
    return (
      <div className="kolom-aplikasi px-4 pb-32">
        <ScreenHeader judul="Pet Robot" onKembali={onKembali} />
        <p className="mb-3 text-[11px] text-teks-sekunder">
          Robot peliharaan Anda sendiri.
        </p>
        <PilihRobot onSelesai={(d, pesan) => terima(d, pesan)} />
      </div>
    );
  }

  const jenis = st.jenis;
  const p = PALET[jenis];
  const tidur = st.tidur;
  const dimiliki = new Set(st.dimiliki);
  const spDimiliki = new Set(st.sparepart_dimiliki);
  const skinDimiliki = new Set(st.skin_dimiliki);
  const warnaTampil = warnaPilih || st.warna_custom || PALET[jenis].utama;
  const persenXp = Math.round((100 * st.xp_di_level) / st.xp_berikut);
  const inventori = Object.entries(st.makanan).filter(([, n]) => n > 0);
  const totalMakanan = inventori.reduce((a, [, n]) => a + n, 0);

  return (
    <div className="kolom-aplikasi px-4 pb-32">
      <ScreenHeader judul="Pet Robot" onKembali={onKembali} />

      {/* Panggung robot */}
      <GlassCard className="overflow-hidden p-0">
        <div
          className="relative flex flex-col items-center px-4 pt-4 pb-3"
          style={{ background: latarJenis(jenis) }}
        >
          <div className="flex w-full items-center justify-between gap-2">
            <div className="min-w-0">
              {editNama ? (
                <div className="flex items-center gap-1.5">
                  <input
                    value={namaBaru}
                    onChange={(e) => setNamaBaru(e.target.value)}
                    maxLength={NAMA_MAKS}
                    autoFocus
                    className="glass-input h-9 w-36 rounded-lg px-2 text-[13px] font-bold text-teks-utama"
                    aria-label="Nama robot baru"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setEditNama(false);
                      void jalankan("nama", "nama", { nama: namaBaru });
                    }}
                    aria-label="Simpan nama"
                    className="glass btn-tekan flex h-9 w-9 items-center justify-center rounded-lg text-sukses"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditNama(false)}
                    aria-label="Batal"
                    className="glass btn-tekan flex h-9 w-9 items-center justify-center rounded-lg text-teks-sekunder"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setNamaBaru(st.nama);
                    setEditNama(true);
                  }}
                  className="btn-tekan flex items-center gap-1.5 text-left"
                  aria-label="Ganti nama robot"
                >
                  <span className="font-heading text-[18px] font-extrabold text-teks-utama">
                    {st.nama}
                  </span>
                  <Pencil className="h-3.5 w-3.5 text-teks-sekunder" />
                </button>
              )}
              <p className="text-[10.5px] text-teks-sekunder">{p.label}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <KoinChip saldo={st.saldo_koin} />
              <span
                className="rounded-full px-2.5 py-0.5 text-[10.5px] font-extrabold text-white"
                style={{ background: p.utama }}
              >
                Level {st.level}
              </span>
            </div>
          </div>

          {/* Gelembung suasana + kondisi */}
          <motion.div
            key={`${st.suasana}-${st.vitalitas}`}
            initial={{ opacity: 0, y: 6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="glass-strong mt-3 rounded-2xl px-3 py-1.5 text-center text-[12px] font-bold text-teks-utama"
          >
            {LABEL_SUASANA[st.suasana]}
            <span className="block text-[10px] font-semibold text-teks-sekunder">
              kondisi: {LABEL_VITALITAS[st.vitalitas]}
            </span>
          </motion.div>

          <div className="relative mt-1">
            <RobotSvg
              jenis={jenis}
              skin={st.skin_terpasang}
              warna={st.warna_custom}
              suasana={st.suasana}
              vitalitas={st.vitalitas}
              terpasang={st.terpasang}
              sparepart={st.sparepart_terpasang}
              ukuran={200}
              makan={Boolean(emojiMakan)}
            />
            <AnimatePresence>
              {emojiMakan ? (
                <motion.span
                  key={emojiMakan + String(Date.now())}
                  initial={{
                    opacity: 0,
                    y: 120,
                    x: -10,
                    scale: 0.6,
                    rotate: -20,
                  }}
                  animate={{
                    opacity: [0, 1, 1, 0],
                    y: [120, 40, 60, 62],
                    x: [-10, -6, 0, 0],
                    scale: [0.6, 1.1, 0.9, 0.2],
                    rotate: [-20, 0, 8, 0],
                  }}
                  transition={{
                    duration: 1.3,
                    times: [0, 0.4, 0.8, 1],
                    ease: "easeInOut",
                  }}
                  className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 text-[40px] leading-none drop-shadow"
                  aria-hidden="true"
                >
                  {emojiMakan}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>

          {/* XP */}
          <div className="mt-1 w-full">
            <div className="flex items-center justify-between text-[10.5px] text-teks-sekunder">
              <span>
                XP {st.xp_di_level}/{st.xp_berikut}
              </span>
              <span>
                {persenXp}% menuju level {st.level + 1}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${persenXp}%`, background: p.utama }}
              />
            </div>
          </div>
        </div>

        {/* Kebutuhan */}
        <div className="grid grid-cols-2 gap-2 p-3">
          <BarKebutuhan
            label="Kenyang"
            nilai={st.kebutuhan.kenyang}
            Ikon={Utensils}
          />
          <BarKebutuhan
            label="Energi"
            nilai={st.kebutuhan.energi}
            Ikon={BatteryCharging}
          />
          <BarKebutuhan
            label="Senang"
            nilai={st.kebutuhan.senang}
            Ikon={Smile}
          />
          <BarKebutuhan
            label="Bersih"
            nilai={st.kebutuhan.bersih}
            Ikon={Droplets}
          />
        </div>
      </GlassCard>

      {/* Tab utama */}
      <div className="glass mt-3 grid grid-cols-3 rounded-xl p-1">
        {(
          [
            ["rawat", "Rawat", Sparkles],
            ["toko", "Toko", ShoppingBag],
            ["lemari", "Lemari", Shirt],
          ] as const
        ).map(([k, label, Ikon]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            aria-pressed={tab === k}
            className={cn(
              "btn-tekan flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-bold",
              tab === k ? "text-white" : "text-teks-sekunder",
            )}
            style={tab === k ? { background: MERAH } : undefined}
          >
            <Ikon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* ===== RAWAT ===== */}
      {tab === "rawat" ? (
        <GlassCard className="mt-3 p-4">
          <p className="text-[12.5px] font-bold text-teks-utama">
            Rawat {st.nama}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-teks-sekunder">
            Kebutuhan turun perlahan seiring waktu; energi turun lebih cepat
            bila robot banyak beraktivitas (hari ini{" "}
            <b className="text-teks-utama">{st.aktivitas_hari_ini}</b>{" "}
            aktivitas). Perawatan pertama tiap hari memberi{" "}
            <b className="text-teks-utama">+{HADIAH_HARIAN_KOIN} koin</b>
            {st.hadiah_hari_ini
              ? " — sudah diambil hari ini."
              : " — belum diambil hari ini!"}
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPilihMakanan((v) => !v)}
              disabled={Boolean(sibuk) || tidur}
              aria-expanded={pilihMakanan}
              className={cn(
                "btn-tekan flex flex-col items-start rounded-xl px-3 py-2.5 text-left disabled:opacity-50",
                pilihMakanan ? "bg-pri/12" : "glass",
              )}
            >
              <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-teks-utama">
                <Utensils className="h-4 w-4 text-pri" /> Beri makan
              </span>
              <span className="text-[10.5px] text-teks-sekunder">
                {totalMakanan > 0
                  ? `${totalMakanan} makanan di inventori · +${XP_MAKAN} XP`
                  : "inventori kosong — beli di Toko Makanan"}
              </span>
            </button>
            {(
              [
                ["main", Gamepad2, "+25 senang · −12 energi"],
                ["mandi", Droplets, "+40 bersih"],
              ] as [Perawatan, typeof Utensils, string][]
            ).map(([k, Ikon, ket]) => (
              <button
                key={k}
                type="button"
                onClick={() => void jalankan(k, "rawat", { jenis: k })}
                disabled={Boolean(sibuk) || tidur}
                className="glass btn-tekan flex flex-col items-start rounded-xl px-3 py-2.5 text-left disabled:opacity-50"
              >
                <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-teks-utama">
                  <Ikon className="h-4 w-4 text-pri" />{" "}
                  {EFEK_PERAWATAN[k].label}
                </span>
                <span className="text-[10.5px] text-teks-sekunder">
                  {ket} · +{EFEK_PERAWATAN[k].xp} XP
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => void jalankan("tidur", tidur ? "bangun" : "tidur")}
              disabled={Boolean(sibuk)}
              className="btn-tekan flex flex-col items-start rounded-xl px-3 py-2.5 text-left text-white disabled:opacity-50"
              style={{
                background: tidur
                  ? "linear-gradient(135deg, #F59E0B, #D97706)"
                  : "linear-gradient(135deg, #4F46E5, #312E81)",
              }}
            >
              <span className="flex items-center gap-1.5 text-[12.5px] font-bold">
                {tidur ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}{" "}
                {tidur ? "Bangunkan" : "Tidurkan"}
              </span>
              <span className="text-[10.5px] opacity-85">
                {tidur ? "energi pulih +15/jam saat tidur" : "isi ulang energi"}
              </span>
            </button>
          </div>

          {/* Pemilih makanan dari inventori */}
          <AnimatePresence>
            {pilihMakanan && !tidur ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-2 rounded-xl border border-pri/30 bg-pri/5 p-2.5">
                  <p className="text-[11px] font-bold text-teks-utama">
                    Pilih makanan dari inventori:
                  </p>
                  {inventori.length === 0 ? (
                    <p className="mt-1 text-[11px] text-teks-sekunder">
                      Kosong. Buka <b>Toko → Makanan</b> untuk membeli.
                    </p>
                  ) : (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {inventori.map(([kode, n]) => {
                        const m = makananDariKode(kode);
                        if (!m) return null;
                        return (
                          <button
                            key={kode}
                            type="button"
                            onClick={() => void beriMakan(kode)}
                            disabled={Boolean(sibuk)}
                            title={teksEfek(m.efek)}
                            className="glass btn-tekan flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-bold text-teks-utama disabled:opacity-50"
                          >
                            <span className="text-[16px] leading-none">
                              {m.emoji}
                            </span>
                            {m.nama}
                            <span className="rounded-full bg-pri/15 px-1.5 text-[10px] text-pri">
                              ×{n}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
          {tidur ? (
            <p className="mt-2 text-[11px] text-teks-sekunder">
              Saat tidur, {st.nama} tidak bisa dirawat — bangunkan dulu.
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                void jalankan("ganti", "ganti_jenis", {
                  jenis: jenis === "pria" ? "wanita" : "pria",
                })
              }
              disabled={Boolean(sibuk)}
              className="glass btn-tekan flex h-9 items-center gap-1.5 rounded-lg px-3 text-[11.5px] font-bold text-teks-utama disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Ganti ke robot{" "}
              {jenis === "pria" ? "wanita" : "pria"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    `Lepas ${st.nama}? Level, aksesoris, sparepart, dan makanannya hilang; koin yang sudah dibelanjakan tidak kembali.`,
                  )
                ) {
                  void jalankan("reset", "reset");
                }
              }}
              disabled={Boolean(sibuk)}
              className="btn-tekan flex h-9 items-center gap-1.5 rounded-lg bg-gagal/12 px-3 text-[11.5px] font-bold text-gagal disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" /> Mulai ulang
            </button>
          </div>
        </GlassCard>
      ) : null}

      {/* ===== TOKO ===== */}
      {tab === "toko" ? (
        <GlassCard className="mt-3 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] font-bold text-teks-utama">Toko</p>
            <KoinChip saldo={st.saldo_koin} />
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/10">
            {(
              [
                ["aksesoris", "Aksesoris", Shirt],
                ["makanan", "Makanan", Utensils],
                ["sparepart", "Sparepart", Cog],
                ["eksklusif", "Eksklusif", Crown],
              ] as const
            ).map(([k, label, Ikon]) => (
              <button
                key={k}
                type="button"
                onClick={() => setToko(k)}
                aria-pressed={toko === k}
                className={cn(
                  "btn-tekan flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11.5px] font-bold",
                  toko === k
                    ? "bg-white text-teks-utama shadow-sm dark:bg-white/15"
                    : "text-teks-sekunder",
                )}
              >
                <Ikon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>

          {toko === "aksesoris" ? (
            <>
              <p className="mt-2 text-[11px] text-teks-sekunder">
                30 aksesoris · dibeli sekali, langsung dipasang · satu per slot.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {KATALOG_AKSESORIS.map((a) => {
                  const punya = dimiliki.has(a.kode);
                  const mampu = st.saldo_koin >= a.harga;
                  return (
                    <div
                      key={a.kode}
                      className="glass-soft flex flex-col items-center rounded-xl p-2.5 text-center"
                    >
                      <RobotSvg
                        jenis={jenis}
                        skin={st.skin_terpasang}
                        warna={st.warna_custom}
                        suasana="senang"
                        terpasang={{ [a.slot]: a.kode }}
                        sparepart={st.sparepart_terpasang}
                        ukuran={72}
                        animasi={false}
                      />
                      <p className="mt-1 text-[11.5px] font-bold leading-tight text-teks-utama">
                        {a.nama}
                      </p>
                      <p className="text-[9.5px] text-teks-sekunder">
                        {SLOT_LABEL[a.slot]}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] font-extrabold text-teks-utama">
                        <img
                          src="/KMP.svg"
                          alt=""
                          aria-hidden="true"
                          className="h-3.5 w-3.5"
                        />{" "}
                        {a.harga}
                      </p>
                      {punya ? (
                        <StatusBadge label="dimiliki" warna="hijau" />
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            void jalankan(`beli:${a.kode}`, "beli", {
                              kode: a.kode,
                            })
                          }
                          disabled={Boolean(sibuk) || !mampu}
                          title={
                            mampu
                              ? a.keterangan
                              : `Kurang ${a.harga - st.saldo_koin} koin`
                          }
                          className="btn-tekan mt-1 h-8 w-full rounded-lg text-[11px] font-bold text-white disabled:opacity-40"
                          style={{ background: MERAH }}
                        >
                          {sibuk === `beli:${a.kode}`
                            ? "…"
                            : mampu
                              ? "Beli"
                              : "Koin kurang"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {toko === "makanan" ? (
            <>
              <p className="mt-2 text-[11px] text-teks-sekunder">
                30 makanan · masuk inventori, boleh beli berkali-kali · dimakan
                lewat Rawat → Beri makan.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {KATALOG_MAKANAN.map((m) => {
                  const punya = st.makanan[m.kode] ?? 0;
                  const mampu = st.saldo_koin >= m.harga;
                  return (
                    <div
                      key={m.kode}
                      className="glass-soft flex flex-col items-center rounded-xl p-2.5 text-center"
                    >
                      <span
                        className="text-[34px] leading-none"
                        aria-hidden="true"
                      >
                        {m.emoji}
                      </span>
                      <p className="mt-1 text-[11.5px] font-bold leading-tight text-teks-utama">
                        {m.nama}
                      </p>
                      <p className="text-[9.5px] text-teks-sekunder">
                        {teksEfek(m.efek)}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] font-extrabold text-teks-utama">
                        <img
                          src="/KMP.svg"
                          alt=""
                          aria-hidden="true"
                          className="h-3.5 w-3.5"
                        />{" "}
                        {m.harga}
                        {punya > 0 ? (
                          <span className="ml-1 rounded-full bg-pri/15 px-1.5 text-[10px] text-pri">
                            punya ×{punya}
                          </span>
                        ) : null}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          void jalankan(`beli:${m.kode}`, "beli", {
                            kode: m.kode,
                          })
                        }
                        disabled={Boolean(sibuk) || !mampu}
                        title={
                          mampu
                            ? m.keterangan
                            : `Kurang ${m.harga - st.saldo_koin} koin`
                        }
                        className="btn-tekan mt-1 h-8 w-full rounded-lg text-[11px] font-bold text-white disabled:opacity-40"
                        style={{
                          background:
                            "linear-gradient(135deg, #10B981, #059669)",
                        }}
                      >
                        {sibuk === `beli:${m.kode}`
                          ? "…"
                          : mampu
                            ? "Beli"
                            : "Koin kurang"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {toko === "sparepart" ? (
            <>
              <p className="mt-2 text-[11px] text-teks-sekunder">
                30 sparepart · mengubah bentuk kepala, mata, tubuh, kaki, tangan
                · dibeli sekali, langsung dipasang.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {KATALOG_SPAREPART.map((s) => {
                  const punya = spDimiliki.has(s.kode);
                  const mampu = st.saldo_koin >= s.harga;
                  return (
                    <div
                      key={s.kode}
                      className="glass-soft flex flex-col items-center rounded-xl p-2.5 text-center"
                    >
                      <RobotSvg
                        jenis={jenis}
                        skin={st.skin_terpasang}
                        warna={st.warna_custom}
                        suasana="senang"
                        sparepart={{
                          ...st.sparepart_terpasang,
                          [s.bagian]: s.kode,
                        }}
                        ukuran={72}
                        animasi={false}
                      />
                      <p className="mt-1 text-[11.5px] font-bold leading-tight text-teks-utama">
                        {s.nama}
                      </p>
                      <p className="text-[9.5px] text-teks-sekunder">
                        {BAGIAN_LABEL[s.bagian]}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] font-extrabold text-teks-utama">
                        <img
                          src="/KMP.svg"
                          alt=""
                          aria-hidden="true"
                          className="h-3.5 w-3.5"
                        />{" "}
                        {s.harga}
                      </p>
                      {punya ? (
                        <StatusBadge label="dimiliki" warna="hijau" />
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            void jalankan(`beli:${s.kode}`, "beli", {
                              kode: s.kode,
                            })
                          }
                          disabled={Boolean(sibuk) || !mampu}
                          title={
                            mampu
                              ? s.keterangan
                              : `Kurang ${s.harga - st.saldo_koin} koin`
                          }
                          className="btn-tekan mt-1 h-8 w-full rounded-lg text-[11px] font-bold text-white disabled:opacity-40"
                          style={{
                            background:
                              "linear-gradient(135deg, #7C3AED, #4F46E5)",
                          }}
                        >
                          {sibuk === `beli:${s.kode}`
                            ? "…"
                            : mampu
                              ? "Beli"
                              : "Koin kurang"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {toko === "eksklusif" ? (
            <>
              <p className="mt-2 text-[11px] text-teks-sekunder">
                5 skin eksklusif seasonal · hanya bisa dibeli saat musimnya
                (WIB), lalu jadi milik Anda selamanya · skin menggantikan slot
                kepala, badan, punggung & tangan.
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {KATALOG_SKIN.map((sk) => {
                  const punya = skinDimiliki.has(sk.kode);
                  const dipakai = st.skin_terpasang === sk.kode;
                  const musimAktif = skinTersedia(sk);
                  const mampu = st.saldo_koin >= sk.harga;
                  return (
                    <div
                      key={sk.kode}
                      className="glass-soft relative flex gap-3 overflow-hidden rounded-xl p-3"
                    >
                      <div
                        className="shrink-0 self-center rounded-xl"
                        style={{
                          background: `radial-gradient(circle at 50% 40%, ${sk.warnaUtama}40, transparent 72%)`,
                        }}
                      >
                        <RobotSvg
                          skin={sk.kode}
                          warna={st.warna_custom}
                          jenis={jenis}
                          suasana="senang"
                          terpasang={st.terpasang}
                          sparepart={st.sparepart_terpasang}
                          ukuran={86}
                          animasi={dipakai}
                          vitalitas={dipakai ? "semangat" : "normal"}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 pr-16">
                          <Crown
                            className="h-3.5 w-3.5 shrink-0"
                            style={{ color: sk.warnaUtama }}
                          />
                          <p className="truncate text-[12.5px] font-extrabold text-teks-utama">
                            {sk.nama}
                          </p>
                        </div>
                        <p
                          className="text-[10px] font-bold"
                          style={{ color: sk.warnaUtama }}
                        >
                          {sk.musim} · {labelMusimSkin(sk)}
                        </p>
                        <ul className="mt-1 space-y-0.5 text-[10px] leading-tight text-teks-sekunder">
                          {sk.fitur.map((f) => (
                            <li key={f}>• {f}</li>
                          ))}
                        </ul>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <p className="flex items-center gap-1 text-[11px] font-extrabold text-teks-utama">
                            <img
                              src="/KMP.svg"
                              alt=""
                              aria-hidden="true"
                              className="h-3.5 w-3.5"
                            />{" "}
                            {sk.harga}
                          </p>
                          {punya ? (
                            dipakai ? (
                              <button
                                type="button"
                                onClick={() =>
                                  void jalankan("lepas_skin", "lepas_skin")
                                }
                                disabled={Boolean(sibuk)}
                                className="btn-tekan h-8 rounded-lg bg-black/5 px-3 text-[11px] font-bold text-teks-sekunder disabled:opacity-40 dark:bg-white/10"
                              >
                                {sibuk === "lepas_skin" ? "…" : "Lepas"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  void jalankan(
                                    `pasang_skin:${sk.kode}`,
                                    "pasang_skin",
                                    { kode: sk.kode },
                                  )
                                }
                                disabled={Boolean(sibuk)}
                                className="btn-tekan h-8 rounded-lg px-3 text-[11px] font-bold text-white disabled:opacity-40"
                                style={{ background: sk.warnaUtama }}
                              >
                                {sibuk === `pasang_skin:${sk.kode}`
                                  ? "…"
                                  : "Pakai"}
                              </button>
                            )
                          ) : musimAktif ? (
                            <button
                              type="button"
                              onClick={() =>
                                void jalankan(`beli:${sk.kode}`, "beli", {
                                  kode: sk.kode,
                                })
                              }
                              disabled={Boolean(sibuk) || !mampu}
                              title={
                                mampu
                                  ? sk.keterangan
                                  : `Kurang ${sk.harga - st.saldo_koin} koin`
                              }
                              className="btn-tekan h-8 rounded-lg px-3 text-[11px] font-bold text-white disabled:opacity-40"
                              style={{
                                background: `linear-gradient(135deg, ${sk.warnaUtama}, #111827)`,
                              }}
                            >
                              {sibuk === `beli:${sk.kode}`
                                ? "…"
                                : mampu
                                  ? "Beli"
                                  : "Koin kurang"}
                            </button>
                          ) : (
                            <span className="flex items-center gap-1 rounded-lg bg-black/5 px-2 py-1.5 text-[10.5px] font-bold text-teks-sekunder dark:bg-white/10">
                              <Lock className="h-3 w-3" /> Tersedia{" "}
                              {labelMusimSkin(sk)}
                            </span>
                          )}
                        </div>
                      </div>
                      {punya ? (
                        <span className="absolute top-2 right-2">
                          <StatusBadge
                            label={dipakai ? "dipakai" : "dimiliki"}
                            warna="hijau"
                          />
                        </span>
                      ) : musimAktif ? (
                        <span className="absolute top-2 right-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[9.5px] font-extrabold text-white">
                          MUSIM INI
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {/* Warna custom: dibuka sekali (300 koin), lalu bebas ganti */}
              <div className="glass-soft mt-3 rounded-xl p-3">
                <div className="flex items-center gap-1.5">
                  <Palette className="h-4 w-4 text-pri" />
                  <p className="text-[12.5px] font-extrabold text-teks-utama">
                    Warna Custom
                  </p>
                  {!st.warna_terbuka ? (
                    <span className="ml-auto flex items-center gap-1 text-[11px] font-extrabold text-teks-utama">
                      <img
                        src="/KMP.svg"
                        alt=""
                        aria-hidden="true"
                        className="h-3.5 w-3.5"
                      />{" "}
                      {HARGA_WARNA_CUSTOM}
                    </span>
                  ) : (
                    <span className="ml-auto">
                      <StatusBadge label="terbuka" warna="hijau" />
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[10.5px] text-teks-sekunder">
                  Buka sekali seharga {HARGA_WARNA_CUSTOM} koin, lalu warna
                  utama robot bebas diganti kapan saja — ikut tampil di Ludo,
                  robot melayang, dan profil chat.
                </p>
                {!st.warna_terbuka ? (
                  <button
                    type="button"
                    onClick={() =>
                      void jalankan(`beli:${KODE_WARNA_CUSTOM}`, "beli", {
                        kode: KODE_WARNA_CUSTOM,
                      })
                    }
                    disabled={
                      Boolean(sibuk) || st.saldo_koin < HARGA_WARNA_CUSTOM
                    }
                    title={
                      st.saldo_koin >= HARGA_WARNA_CUSTOM
                        ? "Buka fitur warna custom"
                        : `Kurang ${HARGA_WARNA_CUSTOM - st.saldo_koin} koin`
                    }
                    className="btn-tekan mt-2 h-9 w-full rounded-lg text-[11.5px] font-bold text-white disabled:opacity-40"
                    style={{
                      background:
                        "linear-gradient(90deg, #EF4444, #F59E0B, #22C55E, #3B82F6, #A855F7)",
                    }}
                  >
                    {sibuk === `beli:${KODE_WARNA_CUSTOM}`
                      ? "…"
                      : st.saldo_koin >= HARGA_WARNA_CUSTOM
                        ? `Buka Warna Custom (${HARGA_WARNA_CUSTOM} koin)`
                        : `Koin kurang (butuh ${HARGA_WARNA_CUSTOM})`}
                  </button>
                ) : (
                  <div className="mt-2 flex gap-3">
                    <div className="shrink-0 self-center">
                      <RobotSvg
                        skin={st.skin_terpasang}
                        warna={warnaTampil}
                        jenis={jenis}
                        suasana="senang"
                        terpasang={st.terpasang}
                        sparepart={st.sparepart_terpasang}
                        ukuran={86}
                        animasi={false}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="grid grid-cols-8 gap-1.5">
                        {PRESET_WARNA.map((w) => (
                          <button
                            key={w.hex}
                            type="button"
                            onClick={() => setWarnaPilih(w.hex)}
                            aria-label={w.nama}
                            aria-pressed={warnaTampil === w.hex}
                            title={w.nama}
                            className={cn(
                              "btn-tekan h-6 w-6 rounded-full border-2",
                              warnaTampil === w.hex
                                ? "border-teks-utama scale-110"
                                : "border-white/70",
                            )}
                            style={{ background: w.hex }}
                          />
                        ))}
                      </div>
                      <label className="mt-2 flex items-center gap-2 text-[10.5px] font-bold text-teks-sekunder">
                        Warna bebas
                        <input
                          type="color"
                          value={warnaTampil.toLowerCase()}
                          onChange={(e) =>
                            setWarnaPilih(e.target.value.toUpperCase())
                          }
                          aria-label="Pilih warna bebas"
                          className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                        />
                        <span className="font-mono text-teks-utama">
                          {warnaTampil}
                        </span>
                      </label>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void jalankan("warna", "warna", {
                              warna: warnaTampil,
                            })
                          }
                          disabled={
                            Boolean(sibuk) ||
                            warnaTampil === (st.warna_custom ?? "")
                          }
                          className="btn-tekan h-8 flex-1 rounded-lg text-[11px] font-bold text-white disabled:opacity-40"
                          style={{ background: warnaTampil }}
                        >
                          {sibuk === "warna"
                            ? "…"
                            : warnaTampil === (st.warna_custom ?? "")
                              ? "Warna ini dipakai"
                              : "Terapkan warna"}
                        </button>
                        {st.warna_custom ? (
                          <button
                            type="button"
                            onClick={() => {
                              setWarnaPilih("");
                              void jalankan("warna", "warna", { warna: null });
                            }}
                            disabled={Boolean(sibuk)}
                            className="btn-tekan h-8 rounded-lg bg-black/5 px-3 text-[11px] font-bold text-teks-sekunder disabled:opacity-40 dark:bg-white/10"
                          >
                            Bawaan
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </GlassCard>
      ) : null}

      {/* ===== LEMARI ===== */}
      {tab === "lemari" ? (
        <GlassCard className="mt-3 p-4">
          <p className="text-[12.5px] font-bold text-teks-utama">
            Lemari {st.nama}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/10">
            {(
              [
                ["aksesoris", "Aksesoris", Shirt],
                ["sparepart", "Sparepart", Cog],
              ] as const
            ).map(([k, label, Ikon]) => (
              <button
                key={k}
                type="button"
                onClick={() => setLemari(k)}
                aria-pressed={lemari === k}
                className={cn(
                  "btn-tekan flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11.5px] font-bold",
                  lemari === k
                    ? "bg-white text-teks-utama shadow-sm dark:bg-white/15"
                    : "text-teks-sekunder",
                )}
              >
                <Ikon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>

          {lemari === "aksesoris" ? (
            st.dimiliki.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-teks-sekunder/30 py-4 text-center text-[11.5px] text-teks-sekunder">
                Belum ada aksesoris. Kunjungi Toko → Aksesoris.
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-2.5">
                {SLOT_URUT.map((slot) => {
                  const milik = KATALOG_AKSESORIS.filter(
                    (a) => a.slot === slot && dimiliki.has(a.kode),
                  );
                  if (milik.length === 0) return null;
                  const terpasang = st.terpasang[slot];
                  return (
                    <div key={slot}>
                      <div className="flex items-center justify-between">
                        <p className="text-[10.5px] font-bold tracking-wide text-teks-sekunder uppercase">
                          {SLOT_LABEL[slot]}
                        </p>
                        {terpasang ? (
                          <button
                            type="button"
                            onClick={() =>
                              void jalankan(`lepas:${slot}`, "lepas", { slot })
                            }
                            disabled={Boolean(sibuk)}
                            className="btn-tekan text-[10.5px] font-bold text-gagal disabled:opacity-50"
                          >
                            Lepas
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {milik.map((a) => {
                          const aktif = terpasang === a.kode;
                          return (
                            <button
                              key={a.kode}
                              type="button"
                              onClick={() =>
                                aktif
                                  ? void jalankan(`lepas:${slot}`, "lepas", {
                                      slot,
                                    })
                                  : void jalankan(
                                      `pasang:${a.kode}`,
                                      "pasang",
                                      { kode: a.kode },
                                    )
                              }
                              disabled={Boolean(sibuk)}
                              aria-pressed={aktif}
                              className={cn(
                                "btn-tekan rounded-full px-3 py-1.5 text-[11px] font-bold disabled:opacity-50",
                                aktif ? "text-white" : "glass text-teks-utama",
                              )}
                              style={aktif ? { background: MERAH } : undefined}
                            >
                              {aktif ? "✓ " : ""}
                              {a.nama}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : st.sparepart_dimiliki.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-teks-sekunder/30 py-4 text-center text-[11.5px] text-teks-sekunder">
              Belum ada sparepart. Kunjungi Toko → Sparepart.
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-2.5">
              {BAGIAN_URUT.map((bagian) => {
                const milik = KATALOG_SPAREPART.filter(
                  (s) => s.bagian === bagian && spDimiliki.has(s.kode),
                );
                if (milik.length === 0) return null;
                const terpasang = st.sparepart_terpasang[bagian];
                return (
                  <div key={bagian}>
                    <p className="text-[10.5px] font-bold tracking-wide text-teks-sekunder uppercase">
                      {BAGIAN_LABEL[bagian]}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          void jalankan(
                            `lepas_sp:${bagian}`,
                            "lepas_sparepart",
                            { bagian },
                          )
                        }
                        disabled={Boolean(sibuk) || !terpasang}
                        aria-pressed={!terpasang}
                        className={cn(
                          "btn-tekan rounded-full px-3 py-1.5 text-[11px] font-bold disabled:opacity-60",
                          !terpasang ? "text-white" : "glass text-teks-utama",
                        )}
                        style={
                          !terpasang
                            ? {
                                background:
                                  "linear-gradient(135deg, #6B7280, #374151)",
                              }
                            : undefined
                        }
                      >
                        {!terpasang ? "✓ " : ""}Bawaan
                      </button>
                      {milik.map((s) => {
                        const aktif = terpasang === s.kode;
                        return (
                          <button
                            key={s.kode}
                            type="button"
                            onClick={() =>
                              aktif
                                ? void jalankan(
                                    `lepas_sp:${bagian}`,
                                    "lepas_sparepart",
                                    { bagian },
                                  )
                                : void jalankan(
                                    `pasang_sp:${s.kode}`,
                                    "pasang_sparepart",
                                    { kode: s.kode },
                                  )
                            }
                            disabled={Boolean(sibuk)}
                            aria-pressed={aktif}
                            className={cn(
                              "btn-tekan rounded-full px-3 py-1.5 text-[11px] font-bold disabled:opacity-50",
                              aktif ? "text-white" : "glass text-teks-utama",
                            )}
                            style={
                              aktif
                                ? {
                                    background:
                                      "linear-gradient(135deg, #7C3AED, #4F46E5)",
                                  }
                                : undefined
                            }
                          >
                            {aktif ? "✓ " : ""}
                            {s.nama}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>
      ) : null}
    </div>
  );
}

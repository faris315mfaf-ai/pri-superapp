"use client";

// ============================================================
// PetScreen (percobaan master, 3 Sep 2026) — modul PET ROBOT ala POU.
//   • Belum punya robot → pilih pria (biru-hitam) / wanita (pink-putih) + nama.
//   • Punya robot → panggung robot + suasana hati, 4 kebutuhan, XP/level,
//     tombol rawat (makan, main, mandi, tidur), toko aksesoris (koin),
//     lemari (pasang/lepas), ganti nama, ganti jenis, mulai ulang.
// Semua aturan angka ada di lib/pet.ts; server (/api/pet) yang memutuskan.
// ============================================================

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BatteryCharging,
  Check,
  Droplets,
  Gamepad2,
  Moon,
  Pencil,
  RefreshCw,
  ShoppingBag,
  Shirt,
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
  EFEK_PERAWATAN,
  HADIAH_HARIAN_KOIN,
  KATALOG_AKSESORIS,
  LABEL_SUASANA,
  NAMA_MAKS,
  PALET,
  SLOT_LABEL,
  type JenisRobot,
  type Perawatan,
  type SlotAksesoris,
} from "@/lib/pet";
import { cn } from "@/lib/utils";
import { RobotSvg } from "./robot-svg";

const MERAH = "linear-gradient(135deg, #DC2626, #B91C1C)";
const SEGAR_MS = 60_000;
const SLOT_URUT: SlotAksesoris[] = ["kepala", "mata", "leher", "badan", "tangan", "punggung", "aura"];

function warnaNilai(n: number): string {
  if (n < 25) return "#DC2626";
  if (n < 50) return "#F59E0B";
  return "#10B981";
}

function BarKebutuhan({ label, nilai, Ikon }: { label: string; nilai: number; Ikon: typeof Utensils }) {
  return (
    <div className="glass-soft rounded-xl p-2.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11.5px] font-bold text-teks-utama">
          <Ikon className="h-3.5 w-3.5" style={{ color: warnaNilai(nilai) }} /> {label}
        </span>
        <span className="angka-tab text-[11.5px] font-extrabold" style={{ color: warnaNilai(nilai) }}>
          {nilai}
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${nilai}%`, background: warnaNilai(nilai) }} />
      </div>
    </div>
  );
}

function latarJenis(jenis: JenisRobot): string {
  return jenis === "pria"
    ? "linear-gradient(160deg, rgba(59,130,246,0.22), rgba(17,24,39,0.30))"
    : "linear-gradient(160deg, rgba(236,72,153,0.22), rgba(255,255,255,0.35))";
}

// ------------------------------------------------------------
// Pemilihan robot (adopsi)
// ------------------------------------------------------------
function PilihRobot({ onSelesai }: { onSelesai: (st: PetState, pesan?: string) => void }) {
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
    <>
      <GlassCard className="p-4">
        <p className="text-[13px] font-bold text-teks-utama">Pilih robot peliharaan Anda</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-teks-sekunder">
          Rawat robotnya setiap hari: beri makan, ajak main, mandikan, dan biarkan tidur. Robot yang bahagia naik level,
          dan Anda bisa mendandaninya dengan aksesoris dari toko memakai koin.
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
                <RobotSvg jenis={j} suasana="senang" ukuran={120} />
                <span className="mt-1 text-[12.5px] font-extrabold text-teks-utama">{j === "pria" ? "Robot Pria" : "Robot Wanita"}</span>
                <span className="text-[10.5px] text-teks-sekunder">{j === "pria" ? "aksen biru–hitam" : "aksen pink–putih"}</span>
                {aktif ? <StatusBadge label="dipilih" warna="hijau" /> : null}
              </button>
            );
          })}
        </div>
        <input
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          maxLength={NAMA_MAKS}
          placeholder={jenis === "pria" ? "Nama robot (bawaan: Robi)" : "Nama robot (bawaan: Rina)"}
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
    </>
  );
}

// ------------------------------------------------------------
// Layar utama
// ------------------------------------------------------------
export function PetScreen({ onKembali, onBerubah }: { onKembali: () => void; onBerubah?: () => void }) {
  const [st, setSt] = useState<PetState | null>(null);
  const [tab, setTab] = useState<"rawat" | "toko" | "lemari">("rawat");
  const [sibuk, setSibuk] = useState("");
  const [editNama, setEditNama] = useState(false);
  const [namaBaru, setNamaBaru] = useState("");

  function terima(d: PetState, pesan?: string, jenisToast: "sukses" | "info" = "sukses") {
    setSt(d);
    if (pesan) toast(jenisToast, pesan);
    onBerubah?.();
  }

  useEffect(() => {
    let hidup = true;
    const muat = () =>
      getPet()
        .then((d) => hidup && setSt(d))
        .catch((e) => hidup && toast("error", "Gagal memuat robot", e instanceof Error ? e.message : ""));
    void muat();
    const t = setInterval(() => void muat(), SEGAR_MS);
    return () => {
      hidup = false;
      clearInterval(t);
    };
  }, []);

  async function jalankan(kunci: string, aksi: string, data: Record<string, unknown> = {}) {
    if (sibuk) return;
    setSibuk(kunci);
    try {
      const r = await petAksi(aksi, data);
      terima(r, r.pesan);
    } catch (e) {
      toast("peringatan", "Tidak bisa", e instanceof Error ? e.message : "");
    } finally {
      setSibuk("");
    }
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
        <p className="mb-3 text-[11px] text-teks-sekunder">Modul percobaan — khusus master.</p>
        <PilihRobot onSelesai={(d, pesan) => terima(d, pesan)} />
      </div>
    );
  }

  const jenis = st.jenis;
  const p = PALET[jenis];
  const tidur = st.tidur;
  const dimiliki = new Set(st.dimiliki);
  const persenXp = Math.round((100 * st.xp_di_level) / st.xp_berikut);

  return (
    <div className="kolom-aplikasi px-4 pb-32">
      <ScreenHeader judul="Pet Robot" onKembali={onKembali} />

      {/* Panggung robot */}
      <GlassCard className="overflow-hidden p-0">
        <div className="relative flex flex-col items-center px-4 pt-4 pb-3" style={{ background: latarJenis(jenis) }}>
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
                  <button type="button" onClick={() => setEditNama(false)} aria-label="Batal" className="glass btn-tekan flex h-9 w-9 items-center justify-center rounded-lg text-teks-sekunder">
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
                  <span className="font-heading text-[18px] font-extrabold text-teks-utama">{st.nama}</span>
                  <Pencil className="h-3.5 w-3.5 text-teks-sekunder" />
                </button>
              )}
              <p className="text-[10.5px] text-teks-sekunder">{p.label}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <KoinChip saldo={st.saldo_koin} />
              <span className="rounded-full px-2.5 py-0.5 text-[10.5px] font-extrabold text-white" style={{ background: p.utama }}>
                Level {st.level}
              </span>
            </div>
          </div>

          {/* Gelembung suasana */}
          <motion.div
            key={st.suasana}
            initial={{ opacity: 0, y: 6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="glass-strong mt-3 rounded-2xl px-3 py-1.5 text-[12px] font-bold text-teks-utama"
          >
            {LABEL_SUASANA[st.suasana]}
          </motion.div>
          <RobotSvg jenis={jenis} suasana={st.suasana} terpasang={st.terpasang} ukuran={200} className="mt-1" />

          {/* XP */}
          <div className="mt-1 w-full">
            <div className="flex items-center justify-between text-[10.5px] text-teks-sekunder">
              <span>
                XP {st.xp_di_level}/{st.xp_berikut}
              </span>
              <span>{persenXp}% menuju level {st.level + 1}</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${persenXp}%`, background: p.utama }} />
            </div>
          </div>
        </div>

        {/* Kebutuhan */}
        <div className="grid grid-cols-2 gap-2 p-3">
          <BarKebutuhan label="Kenyang" nilai={st.kebutuhan.kenyang} Ikon={Utensils} />
          <BarKebutuhan label="Energi" nilai={st.kebutuhan.energi} Ikon={BatteryCharging} />
          <BarKebutuhan label="Senang" nilai={st.kebutuhan.senang} Ikon={Smile} />
          <BarKebutuhan label="Bersih" nilai={st.kebutuhan.bersih} Ikon={Droplets} />
        </div>
      </GlassCard>

      {/* Tab */}
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
            className={cn("btn-tekan flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-bold", tab === k ? "text-white" : "text-teks-sekunder")}
            style={tab === k ? { background: MERAH } : undefined}
          >
            <Ikon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* ===== RAWAT ===== */}
      {tab === "rawat" ? (
        <GlassCard className="mt-3 p-4">
          <p className="text-[12.5px] font-bold text-teks-utama">Rawat {st.nama}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-teks-sekunder">
            Kebutuhan turun perlahan seiring waktu. Perawatan pertama tiap hari memberi hadiah{" "}
            <b className="text-teks-utama">+{HADIAH_HARIAN_KOIN} koin</b>
            {st.hadiah_hari_ini ? " — sudah diambil hari ini." : " — belum diambil hari ini!"}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(
              [
                ["makan", Utensils, "+30 kenyang"],
                ["main", Gamepad2, "+25 senang · −10 energi"],
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
                  <Ikon className="h-4 w-4 text-pri" /> {EFEK_PERAWATAN[k].label}
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
              style={{ background: tidur ? "linear-gradient(135deg, #F59E0B, #D97706)" : "linear-gradient(135deg, #4F46E5, #312E81)" }}
            >
              <span className="flex items-center gap-1.5 text-[12.5px] font-bold">
                {tidur ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} {tidur ? "Bangunkan" : "Tidurkan"}
              </span>
              <span className="text-[10.5px] opacity-85">{tidur ? "energi pulih +15/jam saat tidur" : "isi ulang energi"}</span>
            </button>
          </div>
          {tidur ? <p className="mt-2 text-[11px] text-teks-sekunder">Saat tidur, {st.nama} tidak bisa dirawat — bangunkan dulu.</p> : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void jalankan("ganti", "ganti_jenis", { jenis: jenis === "pria" ? "wanita" : "pria" })}
              disabled={Boolean(sibuk)}
              className="glass btn-tekan flex h-9 items-center gap-1.5 rounded-lg px-3 text-[11.5px] font-bold text-teks-utama disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Ganti ke robot {jenis === "pria" ? "wanita" : "pria"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Lepas ${st.nama}? Level dan semua aksesorisnya hilang; koin yang sudah dibelanjakan tidak kembali.`)) {
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
            <p className="text-[12.5px] font-bold text-teks-utama">Toko aksesoris</p>
            <KoinChip saldo={st.saldo_koin} />
          </div>
          <p className="mt-1 text-[11px] text-teks-sekunder">Dibeli dengan koin, langsung dipasang. Satu aksesoris per slot.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {KATALOG_AKSESORIS.map((a) => {
              const punya = dimiliki.has(a.kode);
              const mampu = st.saldo_koin >= a.harga;
              return (
                <div key={a.kode} className="glass-soft flex flex-col items-center rounded-xl p-2.5 text-center">
                  <RobotSvg jenis={jenis} suasana="senang" terpasang={{ [a.slot]: a.kode }} ukuran={76} animasi={false} />
                  <p className="mt-1 text-[11.5px] font-bold leading-tight text-teks-utama">{a.nama}</p>
                  <p className="text-[9.5px] text-teks-sekunder">{SLOT_LABEL[a.slot]}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] font-extrabold text-teks-utama">
                    <img src="/KMP.svg" alt="" aria-hidden="true" className="h-3.5 w-3.5" /> {a.harga}
                  </p>
                  {punya ? (
                    <StatusBadge label="dimiliki" warna="hijau" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => void jalankan(`beli:${a.kode}`, "beli", { kode: a.kode })}
                      disabled={Boolean(sibuk) || !mampu}
                      title={mampu ? a.keterangan : `Kurang ${a.harga - st.saldo_koin} koin`}
                      className="btn-tekan mt-1 h-8 w-full rounded-lg text-[11px] font-bold text-white disabled:opacity-40"
                      style={{ background: MERAH }}
                    >
                      {sibuk === `beli:${a.kode}` ? "…" : mampu ? "Beli" : "Koin kurang"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </GlassCard>
      ) : null}

      {/* ===== LEMARI ===== */}
      {tab === "lemari" ? (
        <GlassCard className="mt-3 p-4">
          <p className="text-[12.5px] font-bold text-teks-utama">Lemari {st.nama}</p>
          <p className="mt-1 text-[11px] text-teks-sekunder">Pasang atau lepas aksesoris yang sudah dimiliki, per slot.</p>
          {st.dimiliki.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-teks-sekunder/30 py-4 text-center text-[11.5px] text-teks-sekunder">
              Belum ada aksesoris. Kunjungi Toko dulu.
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-2.5">
              {SLOT_URUT.map((slot) => {
                const milik = KATALOG_AKSESORIS.filter((a) => a.slot === slot && dimiliki.has(a.kode));
                if (milik.length === 0) return null;
                const terpasang = st.terpasang[slot];
                return (
                  <div key={slot}>
                    <div className="flex items-center justify-between">
                      <p className="text-[10.5px] font-bold tracking-wide text-teks-sekunder uppercase">{SLOT_LABEL[slot]}</p>
                      {terpasang ? (
                        <button
                          type="button"
                          onClick={() => void jalankan(`lepas:${slot}`, "lepas", { slot })}
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
                            onClick={() => (aktif ? void jalankan(`lepas:${slot}`, "lepas", { slot }) : void jalankan(`pasang:${a.kode}`, "pasang", { kode: a.kode }))}
                            disabled={Boolean(sibuk)}
                            aria-pressed={aktif}
                            className={cn("btn-tekan rounded-full px-3 py-1.5 text-[11px] font-bold disabled:opacity-50", aktif ? "text-white" : "glass text-teks-utama")}
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
          )}
        </GlassCard>
      ) : null}
    </div>
  );
}

"use client";

// ============================================================
// SumberKuotaView (Oktober 2026) — tampilan "Sumber & Kuota" Ruang Bot.
//
// Komponen PRESENTASIONAL terkontrol: daftar sumber, daftar blokir, kuota,
// dan jeda darurat dimiliki cangkang layar (masuk lewat props + callback).
// Yang lokal di sini hanya isian form, pesan galat, serta jam aktif dan
// saklar "berhenti otomatis" yang belum tersambung ke server.
// Mode NYATA (prop `nyata`): saklar jeda darurat, stepper kuota (berlaku untuk
// SEMUA bot), daftar sumber, dan daftar blokir bekerja lewat API server
// (prop `kendaliSumber`; daftar datang dari server, bukan dari state lokal).
// Yang masih contoh: jam aktif, mode awal, berhenti otomatis, kapasitas layanan.
// Validasi form memakai fungsi murni lib/bot-sumber (sama dengan server).
// Sumber visual: docs/mockups/pri-ruang-bot.html (renderSumber).
// ============================================================

import { useEffect, useRef, useState, type FormEvent } from "react";
import { GlassCard } from "@/components/glass-card";
import { cocokBlokir, normalkanBlokir, normalkanSumber, pesanGalatSumber, PLATFORM_SUMBER, samaTanpaHuruf, tampilkanHandle } from "@/lib/bot-sumber";
import { KUOTA_BOT_MAKS, KUOTA_BOT_MIN } from "@/lib/bot-tipe";
import { cn } from "@/lib/utils";
import { kunciAksiSumber } from "./peta-nyata";
import type { BotContoh, KendaliSumberNyata, SumberContoh } from "./tipe";

export type SumberKuotaViewProps = {
  bots: BotContoh[];
  sumber: SumberContoh[];
  onSumber: (next: SumberContoh[]) => void;
  blokir: string[];
  onBlokir: (next: string[]) => void;
  maksKuota: number;
  onMaksKuota: (n: number) => void;
  jedaGlobal: boolean;
  onJedaGlobal: (v: boolean) => void;
  /** Jumlah render bot yang sedang berjalan (tahap Edit). */
  renderBerjalan: number;
  /** Mode data nyata: jeda darurat & kuota diteruskan ke server (kuota berlaku untuk semua bot). */
  nyata?: boolean;
  /** Kunci kontrol yang sedang memproses aksi ke server (lihat kunciAksi / kunciAksiSumber). */
  sibuk?: ReadonlySet<string>;
  /**
   * Mode nyata: aksi sumber & blokir ke server. Bila ada, `sumber`/`blokir` adalah daftar
   * dari server dan `onSumber`/`onBlokir` tidak dipakai.
   */
  kendaliSumber?: KendaliSumberNyata;
};

const KUOTA_MIN = KUOTA_BOT_MIN;
const KUOTA_MAKS = KUOTA_BOT_MAKS;
/** Slot render serentak milik semua anggota. */
const SLOT_RENDER_MAKS = 10;
/** Perkiraan slot yang dipakai anggota (contoh) di luar render bot. */
const SLOT_ANGGOTA_CONTOH = 2;

/** Pilihan platform mode contoh (lama) dan mode nyata (nilai kanonik server). */
const PILIHAN_PLATFORM_CONTOH = ["Instagram", "TikTok", "YouTube (feed RSS)"];
const PILIHAN_PLATFORM_NYATA: readonly string[] = PLATFORM_SUMBER;
const PILIHAN_KATEGORI: SumberContoh["kategori"][] = ["NEWS", "HIBURAN", "SHOWBIZ"];

// ------------------------------------------------------------
// Pembantu tampilan
// ------------------------------------------------------------

const KELAS_ISIAN =
  "glass-input min-h-11 min-w-0 rounded-xl px-3 text-base text-teks-utama sm:min-h-10 sm:text-[13px]";
const KELAS_TOMBOL =
  "btn-tekan min-h-11 rounded-xl border border-glass-border px-3.5 text-[13px] font-bold text-teks-utama hover:bg-black/5 disabled:cursor-wait disabled:opacity-50 sm:min-h-10 dark:hover:bg-white/10";

function Judul({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={cn("m-0 mb-2.5 font-heading text-[11px] font-bold uppercase tracking-[0.08em] text-teks-sekunder", className)}>
      {children}
    </h3>
  );
}

/** Saklar dengan area sentuh 44px; trek visualnya tetap ramping. */
function Saklar({
  aktif,
  onUbah,
  label,
  id,
  disabled = false,
}: {
  aktif: boolean;
  onUbah: (v: boolean) => void;
  label: string;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={aktif}
      aria-label={label}
      aria-busy={disabled}
      disabled={disabled}
      onClick={() => onUbah(!aktif)}
      className="group flex h-11 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-pri disabled:cursor-wait disabled:opacity-50"
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative block h-6 w-11 rounded-full border transition-colors duration-200 motion-reduce:transition-none",
          aktif ? "border-sukses bg-sukses" : "border-black/10 bg-black/10 dark:border-white/15 dark:bg-white/10",
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 motion-reduce:transition-none",
            aktif && "translate-x-5",
          )}
        />
      </span>
    </button>
  );
}

function Baris({ judul, ket, children }: { judul: string; ket: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-glass-border py-2.5 last:border-b-0">
      <p className="m-0 min-w-0 flex-1 basis-48 text-[12.5px] text-teks-sekunder">
        <b className="block text-[13.5px] text-teks-utama">{judul}</b>
        {ket}
      </p>
      {children}
    </div>
  );
}

function Meter({ label, nilaiTeks, nilai, maks, warna }: { label: string; nilaiTeks: string; nilai: number; maks: number; warna: string }) {
  const persen = Math.min(100, Math.max(0, (nilai / maks) * 100));
  return (
    <div className="my-2.5">
      <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
        <span className="text-teks-utama">{label}</span>
        <b className="angka-tab shrink-0 text-teks-utama">{nilaiTeks}</b>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={maks}
        aria-valuenow={Math.min(nilai, maks)}
        aria-valuetext={nilaiTeks}
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10"
      >
        <div className="h-full rounded-full" style={{ width: `${persen}%`, background: warna }} />
      </div>
    </div>
  );
}

type Pesan = { jenis: "galat" | "ok"; teks: string } | null;

// ------------------------------------------------------------
// Tampilan utama
// ------------------------------------------------------------

export function SumberKuotaView(p: SumberKuotaViewProps) {
  const { bots, sumber, onSumber, blokir, onBlokir, maksKuota, onMaksKuota, jedaGlobal, onJedaGlobal, renderBerjalan, nyata = false, sibuk, kendaliSumber } = p;
  /** Daftar sumber/blokir benar-benar dari server (CRUD lewat kendaliSumber). */
  const daftarNyata = nyata && !!kendaliSumber;
  const pilihanPlatform = daftarNyata ? PILIHAN_PLATFORM_NYATA : PILIHAN_PLATFORM_CONTOH;
  const sibukTambahSumber = !!sibuk?.has("sumber:tambah");
  const sibukTambahBlokir = !!sibuk?.has("blokir:tambah");

  // Penjaga setState setelah unmount (tab ditutup saat permintaan masih terbang).
  const hidupRef = useRef(true);
  useEffect(() => {
    hidupRef.current = true;
    return () => {
      hidupRef.current = false;
    };
  }, []);
  const sibukJeda = !!sibuk?.has("jeda_global");
  const sibukKuota = !!sibuk?.has("kuota");
  // Mode nyata: bot bisa punya kuota berbeda-beda; stepper menyamakan semuanya.
  const kuotaBeragam = nyata && bots.some((b) => b.kuotaHarian !== bots[0]?.kuotaHarian);

  // Pengaturan yang belum tersambung ke server (lokal, hilang saat layar ditutup).
  const [jamMulai, setJamMulai] = useState("08:00");
  const [jamSelesai, setJamSelesai] = useState("20:00");
  const [berhentiOtomatis, setBerhentiOtomatis] = useState(true);

  // Form tambah sumber.
  const [akun, setAkun] = useState("");
  const [platform, setPlatform] = useState(pilihanPlatform[0]);
  const [kategori, setKategori] = useState<SumberContoh["kategori"]>("NEWS");
  const [botPilihan, setBotPilihan] = useState("");
  const [pesanSumber, setPesanSumber] = useState<Pesan>(null);

  // Form daftar blokir.
  const [isianBlokir, setIsianBlokir] = useState("");
  const [pesanBlokir, setPesanBlokir] = useState<Pesan>(null);

  const botId = botPilihan || bots[0]?.id || "";
  const slotTerpakai = renderBerjalan + SLOT_ANGGOTA_CONTOH;

  /** Tambah sumber mode nyata: validasi murni di klien, lalu server (yang memvalidasi ulang). */
  const tambahSumberNyata = async (k: KendaliSumberNyata) => {
    if (sibukTambahSumber) return;
    const sah = normalkanSumber({ platform, handle: akun });
    if (!sah.ok) {
      setPesanSumber({ jenis: "galat", teks: pesanGalatSumber(sah.kode) });
      return;
    }
    const cocok = cocokBlokir(sah.handle, blokir);
    if (cocok) {
      setPesanSumber({ jenis: "galat", teks: `Akun ini cocok dengan daftar blokir (“${cocok}”).` });
      return;
    }
    const idBot = Number(botId);
    if (!Number.isInteger(idBot) || idBot <= 0) {
      setPesanSumber({ jenis: "galat", teks: "Belum ada bot yang bisa memakai sumber ini." });
      return;
    }
    const tampil = tampilkanHandle(sah.platform, sah.handle);
    if (sumber.some((s) => s.botId === String(idBot) && s.platform === sah.platform && s.akun === tampil)) {
      setPesanSumber({ jenis: "galat", teks: "Sumber ini sudah ada untuk bot dan platform yang sama." });
      return;
    }
    const hasil = await k.tambah({ botId: idBot, platform: sah.platform, handle: sah.handle, kategori });
    if (!hidupRef.current) return;
    if (hasil.ok) {
      setAkun("");
      setPesanSumber({ jenis: "ok", teks: `Sumber ditambahkan: ${tampil}` });
    } else {
      setPesanSumber({ jenis: "galat", teks: hasil.pesan });
    }
  };

  const tambahSumber = (e: FormEvent) => {
    e.preventDefault();
    if (kendaliSumber && nyata) {
      void tambahSumberNyata(kendaliSumber);
      return;
    }
    const nama = akun.trim();
    if (nama.length < 3) {
      setPesanSumber({ jenis: "galat", teks: "Isi nama akun atau tautan kanal minimal 3 karakter." });
      return;
    }
    if (blokir.some((t) => nama.toLowerCase().includes(t.toLowerCase()))) {
      setPesanSumber({ jenis: "galat", teks: "Akun ini ada di daftar blokir." });
      return;
    }
    if (sumber.some((s) => s.akun.toLowerCase() === nama.toLowerCase() && s.platform === platform)) {
      setPesanSumber({ jenis: "galat", teks: "Sumber ini sudah ada untuk platform yang sama." });
      return;
    }
    if (!botId) {
      setPesanSumber({ jenis: "galat", teks: "Belum ada bot yang bisa memakai sumber ini." });
      return;
    }
    onSumber([...sumber, { akun: nama, platform, kategori, botId, kandidat24Jam: 0, terakhirAmbil: "belum", aktif: true }]);
    setAkun("");
    setPesanSumber({ jenis: "ok", teks: `Sumber ditambahkan: ${nama}` });
  };

  /** Tambah blokir mode nyata. */
  const tambahBlokirNyata = async (k: KendaliSumberNyata) => {
    if (sibukTambahBlokir) return;
    const sah = normalkanBlokir(isianBlokir);
    if (!sah.ok) {
      setPesanBlokir({ jenis: "galat", teks: pesanGalatSumber(sah.kode) });
      return;
    }
    if (blokir.some((t) => samaTanpaHuruf(t, sah.kata))) {
      setPesanBlokir({ jenis: "galat", teks: "Sudah ada di daftar blokir." });
      return;
    }
    const hasil = await k.tambahBlokir(sah.kata);
    if (!hidupRef.current) return;
    if (hasil.ok) {
      setIsianBlokir("");
      setPesanBlokir({ jenis: "ok", teks: `Ditambahkan ke daftar blokir: ${sah.kata}` });
    } else {
      setPesanBlokir({ jenis: "galat", teks: hasil.pesan });
    }
  };

  const tambahBlokir = (e: FormEvent) => {
    e.preventDefault();
    if (kendaliSumber && nyata) {
      void tambahBlokirNyata(kendaliSumber);
      return;
    }
    const kata = isianBlokir.trim();
    if (kata.length < 2) {
      setPesanBlokir({ jenis: "galat", teks: "Isi minimal 2 karakter." });
      return;
    }
    if (blokir.some((t) => t.toLowerCase() === kata.toLowerCase())) {
      setPesanBlokir({ jenis: "galat", teks: "Sudah ada di daftar blokir." });
      return;
    }
    onBlokir([...blokir, kata]);
    setIsianBlokir("");
    setPesanBlokir({ jenis: "ok", teks: `Ditambahkan ke daftar blokir: ${kata}` });
  };

  const kelasPesan = (m: Pesan) =>
    cn("m-0 mt-2 min-h-[1.25rem] text-xs", m?.jenis === "galat" ? "font-semibold text-red-600 dark:text-red-400" : "text-teks-sekunder");

  return (
    <div className="space-y-3.5">
      <div className="grid gap-3.5 lg:grid-cols-2">
        <GlassCard className="p-3.5">
          <Judul>Saklar &amp; batas harian</Judul>
          {nyata && (
            <p className="m-0 mb-1 text-[11px] text-teks-sekunder">
              Jeda darurat dan kuota harian di bawah sudah nyata (tersimpan di server).
            </p>
          )}
          <Baris judul="Jeda darurat semua bot" ket="Semua bot berhenti dan kembali ke sofa.">
            <Saklar id="saklar-jeda-darurat" aktif={jedaGlobal} onUbah={onJedaGlobal} label="Jeda darurat semua bot" disabled={sibukJeda} />
          </Baris>
          <Baris
            judul="Kuota post per bot per hari"
            ket={
              nyata
                ? `Berlaku untuk semua bot. Bot berhenti saat kuota habis.${kuotaBeragam ? " Kuota tiap bot kini berbeda; mengubahnya menyamakan semuanya." : ""}`
                : "Bot berhenti saat kuota habis."
            }
          >
            <div role="group" aria-label="Kuota post per bot per hari" className="inline-flex items-center overflow-hidden rounded-xl border border-glass-border">
              <button
                id="kuota-kurang"
                type="button"
                aria-label="Kurangi kuota"
                disabled={sibukKuota || maksKuota <= KUOTA_MIN}
                onClick={() => onMaksKuota(Math.max(KUOTA_MIN, maksKuota - 1))}
                className="h-11 w-11 text-lg font-bold text-teks-utama hover:bg-black/5 disabled:opacity-40 sm:h-9 sm:w-9 dark:hover:bg-white/10"
              >
                −
              </button>
              <output aria-live="polite" className="angka-tab min-w-9 text-center font-mono text-[13px] font-bold text-teks-utama">
                {maksKuota}
              </output>
              <button
                id="kuota-tambah"
                type="button"
                aria-label="Tambah kuota"
                disabled={sibukKuota || maksKuota >= KUOTA_MAKS}
                onClick={() => onMaksKuota(Math.min(KUOTA_MAKS, maksKuota + 1))}
                className="h-11 w-11 text-lg font-bold text-teks-utama hover:bg-black/5 disabled:opacity-40 sm:h-9 sm:w-9 dark:hover:bg-white/10"
              >
                +
              </button>
            </div>
          </Baris>
          <Baris judul="Jam aktif (WIB)" ket="Di luar jam ini bot tidak memulai tugas.">
            <div className="flex items-center gap-2">
              <input
                id="jam-aktif-mulai"
                type="time"
                value={jamMulai}
                onChange={(e) => setJamMulai(e.target.value)}
                aria-label="Jam aktif mulai"
                className={KELAS_ISIAN}
              />
              <span aria-hidden="true" className="text-teks-sekunder">–</span>
              <input
                id="jam-aktif-selesai"
                type="time"
                value={jamSelesai}
                onChange={(e) => setJamSelesai(e.target.value)}
                aria-label="Jam aktif selesai"
                className={KELAS_ISIAN}
              />
            </div>
          </Baris>
          <Baris judul="Mode awal bot baru" ket="Disarankan ACC sampai terbukti baik.">
            <span className="rounded-full bg-emas/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">Perlu ACC</span>
          </Baris>
          <Baris judul="Berhenti otomatis bila gagal 3× berturut" ket="Pimred dikabari lewat notifikasi.">
            <Saklar id="saklar-berhenti-otomatis" aktif={berhentiOtomatis} onUbah={setBerhentiOtomatis} label="Berhenti otomatis bila gagal 3 kali berturut" />
          </Baris>
          <p className="m-0 mt-2 text-[11px] text-teks-sekunder">
            Jam aktif, mode awal, dan berhenti otomatis belum tersimpan ke server (data contoh).
          </p>
        </GlassCard>

        <GlassCard className="p-3.5">
          <Judul>Kapasitas layanan (contoh angka)</Judul>
          <Meter label="TikHub · permintaan hari ini" nilaiTeks="412 / 1.000" nilai={412} maks={1000} warna="#38bdf8" />
          <Meter label="upload-post · profil terpakai" nilaiTeks="3 / 225" nilai={3} maks={225} warna="#34d399" />
          <Meter
            label="Slot render serentak (milik semua anggota)"
            nilaiTeks={`${slotTerpakai} / ${SLOT_RENDER_MAKS}`}
            nilai={slotTerpakai}
            maks={SLOT_RENDER_MAKS}
            warna="#a78bfa"
          />
          <Meter label="Stok mesin · akun bot" nilaiTeks="9 / 150 video" nilai={9} maks={150} warna="#fbbf24" />
          <p className="m-0 mt-2.5 text-xs text-teks-sekunder">
            Bot berprioritas render rendah dan hanya 1 job aktif per bot, agar tidak mengganggu antrean anggota.
          </p>
        </GlassCard>
      </div>

      <GlassCard className="p-3.5">
        <Judul>Sumber video yang diizinkan</Judul>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
            <caption className="sr-only">Sumber video yang diizinkan untuk tiap bot</caption>
            <thead>
              <tr>
                {["Akun sumber", "Platform", "Kategori", "Dipakai bot", "Kandidat 24 jam", "Terakhir ambil", "Aktif", ""].map((h, i) => (
                  <th
                    key={`${h}-${i}`}
                    scope="col"
                    className="border-b border-glass-border px-2 py-1.5 text-left font-heading text-[10.5px] font-bold uppercase tracking-[0.06em] text-teks-sekunder"
                  >
                    {h || <span className="sr-only">Aksi</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sumber.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-2 py-5 text-center text-teks-sekunder">
                    Belum ada sumber. Tambahkan di bawah.
                  </td>
                </tr>
              )}
              {sumber.map((s, i) => {
                const b = bots.find((x) => x.id === s.botId);
                const nama = `${s.akun} (${s.platform})`;
                // Mode nyata: baris sementara (id negatif) atau yang sedang diproses tidak bisa diubah.
                const idNyata = daftarNyata && s.id !== undefined ? s.id : null;
                const terkunci = daftarNyata && (idNyata === null || idNyata < 0 || !!sibuk?.has(kunciAksiSumber({ aksi: "hapus", id: idNyata })));
                return (
                  <tr key={idNyata ?? `${s.akun}-${s.platform}-${i}`} className={cn(!s.aktif && "text-teks-sekunder")}>
                    <td className="border-b border-dashed border-glass-border px-2 py-1 font-bold text-teks-utama">{s.akun}</td>
                    <td className="border-b border-dashed border-glass-border px-2 py-1 text-teks-utama">{s.platform}</td>
                    <td className="border-b border-dashed border-glass-border px-2 py-1 text-teks-utama">{s.kategori}</td>
                    <td className="border-b border-dashed border-glass-border px-2 py-1">
                      <span className="inline-flex items-center gap-1.5 font-bold text-teks-utama">
                        {b && <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: b.warna }} />}
                        {b?.nama ?? s.botId}
                      </span>
                    </td>
                    <td className="angka-tab border-b border-dashed border-glass-border px-2 py-1 text-teks-utama">{s.kandidat24Jam}</td>
                    <td className="border-b border-dashed border-glass-border px-2 py-1 text-teks-sekunder">{s.terakhirAmbil}</td>
                    <td className="border-b border-dashed border-glass-border px-1 py-0">
                      <Saklar
                        aktif={s.aktif}
                        label={`Aktifkan ${nama}`}
                        disabled={terkunci}
                        onUbah={(v) => {
                          if (kendaliSumber && daftarNyata) {
                            if (idNyata !== null) void kendaliSumber.aktif(idNyata, v);
                            return;
                          }
                          onSumber(sumber.map((x, j) => (j === i ? { ...x, aktif: v } : x)));
                        }}
                      />
                    </td>
                    <td className="border-b border-dashed border-glass-border px-2 py-1">
                      <button
                        type="button"
                        aria-label={`Hapus ${nama}`}
                        disabled={terkunci}
                        onClick={() => {
                          if (kendaliSumber && daftarNyata) {
                            if (idNyata !== null) void kendaliSumber.hapus(idNyata);
                            return;
                          }
                          onSumber(sumber.filter((_, j) => j !== i));
                        }}
                        className={cn(KELAS_TOMBOL, "px-3 text-xs")}
                      >
                        Hapus
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="m-0 mt-1.5 text-[11px] text-teks-sekunder">
          {daftarNyata
            ? "Kandidat 24 jam = video sumber ini yang ditemukan pemanen dalam 24 jam terakhir; tetap 0 dan “belum pernah” sampai runner mulai memanen."
            : "Data contoh: kandidat 24 jam dan waktu ambil terakhir belum dari server."}
        </p>

        <form onSubmit={tambahSumber} autoComplete="off" noValidate className="mt-3 flex flex-wrap gap-2">
          <input
            id="sumber-akun"
            value={akun}
            onChange={(e) => setAkun(e.target.value)}
            placeholder={daftarNyata ? "@handle akun (bukan tautan)" : "@akun atau tautan kanal"}
            maxLength={daftarNyata ? 80 : undefined}
            aria-label="Akun sumber"
            aria-invalid={pesanSumber?.jenis === "galat"}
            aria-describedby="sumber-pesan"
            className={cn(KELAS_ISIAN, "flex-[1_1_200px]")}
          />
          <select id="sumber-platform" value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Platform" className={KELAS_ISIAN}>
            {pilihanPlatform.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
          <select
            id="sumber-kategori"
            value={kategori}
            onChange={(e) => setKategori(e.target.value as SumberContoh["kategori"])}
            aria-label="Kategori"
            className={KELAS_ISIAN}
          >
            {PILIHAN_KATEGORI.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
          <select id="sumber-bot" value={botId} onChange={(e) => setBotPilihan(e.target.value)} aria-label="Bot pemakai" className={KELAS_ISIAN}>
            {bots.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nama}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={sibukTambahSumber}
            aria-busy={sibukTambahSumber}
            className={cn(KELAS_TOMBOL, "border-sukses/50 bg-sukses/10 text-emerald-700 dark:text-emerald-300")}
          >
            {sibukTambahSumber ? "Menyimpan…" : "Tambah sumber"}
          </button>
        </form>
        <p id="sumber-pesan" aria-live="polite" className={kelasPesan(pesanSumber)}>
          {pesanSumber?.teks}
        </p>
      </GlassCard>

      <GlassCard className="p-3.5">
        <Judul>Daftar blokir</Judul>
        {blokir.length === 0 ? (
          <p className="m-0 text-xs text-teks-sekunder">Belum ada kata kunci atau akun yang diblokir.</p>
        ) : (
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {blokir.map((t, i) => (
              <li
                key={daftarNyata ? t.toLowerCase() : `${t}-${i}`}
                className="flex items-center rounded-full border border-glass-border bg-black/[0.04] pl-3 text-xs text-teks-utama dark:bg-white/[0.06]"
              >
                <span className="break-all">{t}</span>
                <button
                  type="button"
                  aria-label={`Hapus ${t} dari daftar blokir`}
                  disabled={daftarNyata && !!sibuk?.has(kunciAksiSumber({ aksi: "blokir_hapus", kata: t }))}
                  onClick={() => {
                    if (kendaliSumber && daftarNyata) {
                      void kendaliSumber.hapusBlokir(t);
                      return;
                    }
                    onBlokir(blokir.filter((_, j) => j !== i));
                  }}
                  className="-my-2 flex h-11 w-10 items-center justify-center rounded-full text-base text-teks-sekunder hover:text-teks-utama disabled:cursor-wait disabled:opacity-50"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={tambahBlokir} autoComplete="off" noValidate className="mt-3 flex flex-wrap gap-2">
          <input
            id="blokir-isian"
            value={isianBlokir}
            onChange={(e) => setIsianBlokir(e.target.value)}
            placeholder="kata kunci atau akun yang tidak boleh diambil"
            aria-label="Tambah blokir"
            maxLength={daftarNyata ? 120 : undefined}
            aria-invalid={pesanBlokir?.jenis === "galat"}
            aria-describedby="blokir-pesan"
            className={cn(KELAS_ISIAN, "flex-[1_1_260px]")}
          />
          <button type="submit" disabled={sibukTambahBlokir} aria-busy={sibukTambahBlokir} className={KELAS_TOMBOL}>
            {sibukTambahBlokir ? "Menyimpan…" : "Blokir"}
          </button>
        </form>
        <p id="blokir-pesan" aria-live="polite" className={kelasPesan(pesanBlokir)}>
          {pesanBlokir?.teks}
        </p>
      </GlassCard>

      <GlassCard className="p-3.5 text-[12.5px] leading-relaxed text-teks-sekunder">
        <b className="text-teks-utama">Tentang sumber.</b>{" "}
        {daftarNyata ? (
          <>
            Daftar ini tersimpan di server dan akan dipakai pemanen di mesin; sampai runner terpasang, daftar hanya tersimpan. Akun yang cocok dengan
            daftar blokir ditolak saat ditambahkan, tetapi blokir yang ditambahkan belakangan tidak menghapus sumber yang sudah ada. Menghapus sumber
            tidak menghapus kandidat videonya. Hak cipta konten sumber tetap tanggung jawab pemilik: caption selalu memuat kredit sumber.
          </>
        ) : (
          <>
            Instagram dan TikTok diambil lewat TikHub (berbayar, berkuota). Feed YouTube/NTV belum ada di sistem dan dibangun pada tahap pencarian. Hak
            cipta konten sumber tetap tanggung jawab pemilik: caption selalu memuat kredit sumber.
          </>
        )}
      </GlassCard>
    </div>
  );
}

"use client";

// ============================================================
// TabelAnggotaScreen — Database Anggota versi TABEL (spek 1.18/2.2)
// + tombol WhatsApp langsung per baris (spek 2.3).
//
// Kolom: No, Nama, Panggilan, Username, Divisi, Zona, Aksi.
// - Cari real-time (nama/username), sort per kolom, pagination
//   10/20/50 per halaman.
// - "Ganti Password": modal sandi baru + konfirmasi (min 8, harus
//   cocok); server mencabut semua sesi target & menulis JEJAK AUDIT.
// - Tombol WA: buka wa.me/62xxx di tab baru; tanpa nomor = disabled
//   bertooltip. Akses layar: HR, Super Admin, Master.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpDown,
  KeyRound,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, GlassSkeleton } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { WhatsAppIcon } from "@/features/qc-konten/whatsapp-icon";
import { toast } from "@/hooks/use-app-store";
import {
  getPengguna,
  getZona,
  tambahZona,
  tetapkanZonaAnggota,
  ubahPengguna,
  type PenggunaAdmin,
  type Zona,
} from "@/services";
import { cn } from "@/lib/utils";

type KolomSort = "nama" | "username" | "divisi" | "zona";

function namaZona(u: PenggunaAdmin): string {
  const z = Array.isArray(u.zona) ? u.zona[0] : u.zona;
  return z?.nama ?? "";
}

/** Nomor WA internasional 62xxx tanpa + / spasi (spek 2.3). */
function nomorWaInternasional(nomor: string | null): string {
  const bersih = (nomor ?? "").replace(/\D/g, "");
  if (!bersih) return "";
  if (bersih.startsWith("62")) return bersih;
  if (bersih.startsWith("0")) return `62${bersih.slice(1)}`;
  return bersih;
}

export function TabelAnggotaScreen({ onKembali }: { onKembali: () => void }) {
  const [daftar, setDaftar] = useState<PenggunaAdmin[] | null>(null);
  const [cari, setCari] = useState("");
  const [sortKolom, setSortKolom] = useState<KolomSort>("nama");
  const [sortNaik, setSortNaik] = useState(true);
  const [perHalaman, setPerHalaman] = useState(20);
  const [halaman, setHalaman] = useState(1);
  const [gantiUntuk, setGantiUntuk] = useState<PenggunaAdmin | null>(null);
  // Zona (spek 2.6): daftar utk penetapan per anggota
  const [zonaList, setZonaList] = useState<Zona[]>([]);
  const [zonaUntuk, setZonaUntuk] = useState<PenggunaAdmin | null>(null);
  const [muatUlang, setMuatUlang] = useState(0);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const [hasil, zonaSemua] = await Promise.all([
          getPengguna(),
          getZona().catch(() => []),
        ]);
        if (!hidup) return;
        setDaftar(hasil.data.filter((u) => u.status === "aktif"));
        setZonaList(zonaSemua);
      } catch (e) {
        if (hidup) {
          setDaftar([]);
          toast("error", "Gagal memuat anggota", e instanceof Error ? e.message : "");
        }
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muatUlang]);

  const tersaring = useMemo(() => {
    const kunci = cari.trim().toLowerCase();
    const dasar = (daftar ?? []).filter(
      (u) =>
        !kunci ||
        u.nama.toLowerCase().includes(kunci) ||
        (u.username ?? "").toLowerCase().includes(kunci),
    );
    const nilai = (u: PenggunaAdmin): string => {
      if (sortKolom === "username") return u.username ?? "";
      if (sortKolom === "divisi") return u.divisi ?? "";
      if (sortKolom === "zona") return namaZona(u);
      return u.nama;
    };
    return [...dasar].sort((a, b) => {
      const banding = nilai(a).localeCompare(nilai(b), "id");
      return sortNaik ? banding : -banding;
    });
  }, [daftar, cari, sortKolom, sortNaik]);

  const totalHalaman = Math.max(1, Math.ceil(tersaring.length / perHalaman));
  const halamanAman = Math.min(halaman, totalHalaman);
  const tampil = tersaring.slice((halamanAman - 1) * perHalaman, halamanAman * perHalaman);

  function sortir(kolom: KolomSort) {
    if (sortKolom === kolom) setSortNaik((v) => !v);
    else {
      setSortKolom(kolom);
      setSortNaik(true);
    }
  }

  const JUDUL_KOLOM: { id: KolomSort; label: string }[] = [
    { id: "nama", label: "Nama" },
    { id: "username", label: "Username" },
    { id: "divisi", label: "Divisi" },
    { id: "zona", label: "Zona" },
  ];

  return (
    <div className="kolom-aplikasi px-4 pb-32">
      <header className="flex items-center gap-3 pt-5">
        <button
          type="button"
          onClick={onKembali}
          aria-label="Kembali"
          className="glass btn-tekan flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-teks-utama"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="font-heading truncate text-xl font-extrabold tracking-tight text-teks-utama">
            Database Anggota
          </h1>
          <p className="text-xs text-teks-sekunder">
            {daftar ? `${tersaring.length} anggota` : "Memuat…"} · ganti sandi & chat WA
          </p>
        </div>
      </header>

      {/* Cari + per halaman */}
      <div className="mt-4 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-teks-sekunder"
            aria-hidden="true"
          />
          <input
            value={cari}
            onChange={(e) => {
              setCari(e.target.value);
              setHalaman(1);
            }}
            placeholder="Cari nama / username…"
            aria-label="Cari anggota"
            className="glass h-11 w-full rounded-xl pr-3 pl-10 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
          />
        </div>
        <select
          value={perHalaman}
          onChange={(e) => {
            setPerHalaman(Number(e.target.value));
            setHalaman(1);
          }}
          aria-label="Jumlah per halaman"
          className="glass-input h-11 rounded-xl px-2.5 text-sm text-teks-utama outline-none"
        >
          {[10, 20, 50].map((n) => (
            <option key={n} value={n}>
              {n}/hal
            </option>
          ))}
        </select>
      </div>

      {/* Kepala kolom sortir */}
      <div className="scrollbar-tipis mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {JUDUL_KOLOM.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => sortir(k.id)}
            aria-pressed={sortKolom === k.id}
            className={cn(
              "btn-tekan flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11.5px] font-semibold",
              sortKolom === k.id ? "text-white" : "glass-soft text-teks-sekunder",
            )}
            style={
              sortKolom === k.id
                ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                : undefined
            }
          >
            {k.label}
            <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
            {sortKolom === k.id && (sortNaik ? "↑" : "↓")}
          </button>
        ))}
      </div>

      {/* Tabel (baris kartu — rapi di HP maupun desktop) */}
      {daftar === null ? (
        <GlassSkeleton className="mt-2 h-40 rounded-2xl" />
      ) : (
        <div className="mt-2 flex flex-col gap-1.5">
          {tampil.map((u, i) => {
            const nomorWa = nomorWaInternasional(u.nomor_wa);
            return (
              <GlassCard key={u.id} className="flex items-center gap-2.5 p-2.5">
                <span className="angka-tab w-6 shrink-0 text-center text-[10.5px] font-bold text-teks-sekunder">
                  {(halamanAman - 1) * perHalaman + i + 1}
                </span>
                {u.avatar_url ? (
                  <FotoBulat src={u.avatar_url} ukuran={32} />
                ) : (
                  <AvatarInisial nama={u.nama} ukuran={32} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-bold text-teks-utama">
                    {u.nama}
                    {u.nama_panggilan && (
                      <span className="ml-1 font-normal text-teks-sekunder">
                        “{u.nama_panggilan}”
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[10.5px] text-teks-sekunder">
                    @{u.username ?? "-"} · {u.divisi || "Tanpa divisi"}
                    {namaZona(u) && ` · ${namaZona(u)}`}
                  </p>
                </div>

                {/* WA langsung (spek 2.3) */}
                {nomorWa ? (
                  <a
                    href={`https://wa.me/${nomorWa}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Chat WhatsApp ${u.nama}`}
                    className="btn-tekan flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "#10B98122", color: "#10B981" }}
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                  </a>
                ) : (
                  <span
                    title="Nomor WA tidak terdaftar"
                    aria-label="Nomor WA tidak terdaftar"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teks-sekunder/10 text-teks-sekunder/40"
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                  </span>
                )}

                {/* Tetapkan zona (spek 2.6) */}
                <button
                  type="button"
                  onClick={() => setZonaUntuk(u)}
                  aria-label={`Tetapkan zona ${u.nama}`}
                  className="glass btn-tekan flex h-8 shrink-0 items-center rounded-lg px-2 text-[10.5px] font-bold text-teks-utama"
                >
                  {namaZona(u) || "Zona?"}
                </button>

                {/* Ganti Password (spek 2.2) */}
                <button
                  type="button"
                  onClick={() => setGantiUntuk(u)}
                  aria-label={`Ganti password ${u.nama}`}
                  className="glass btn-tekan flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[10.5px] font-bold text-teks-utama"
                >
                  <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                  Sandi
                </button>
              </GlassCard>
            );
          })}
          {tampil.length === 0 && (
            <p className="py-8 text-center text-xs text-teks-sekunder">
              Tidak ada anggota yang cocok.
            </p>
          )}

          {/* Pagination */}
          {totalHalaman > 1 && (
            <div className="mt-1 flex items-center justify-center gap-2">
              <button
                type="button"
                disabled={halamanAman <= 1}
                onClick={() => setHalaman((h) => h - 1)}
                className="glass btn-tekan rounded-lg px-3 py-1.5 text-[12px] font-bold text-teks-utama disabled:opacity-40"
              >
                ‹
              </button>
              <span className="angka-tab text-[11.5px] text-teks-sekunder">
                {halamanAman} / {totalHalaman}
              </span>
              <button
                type="button"
                disabled={halamanAman >= totalHalaman}
                onClick={() => setHalaman((h) => h + 1)}
                className="glass btn-tekan rounded-lg px-3 py-1.5 text-[12px] font-bold text-teks-utama disabled:opacity-40"
              >
                ›
              </button>
            </div>
          )}
        </div>
      )}

      {gantiUntuk && (
        <ModalGantiSandi target={gantiUntuk} onTutup={() => setGantiUntuk(null)} />
      )}
      {zonaUntuk && (
        <ModalZona
          target={zonaUntuk}
          zonaList={zonaList}
          onTutup={() => setZonaUntuk(null)}
          onBerubah={() => {
            setZonaUntuk(null);
            setMuatUlang((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// ModalGantiSandi — sandi baru + konfirmasi (spek 2.2). Server
// mencabut semua sesi target & menulis jejak audit.
// ------------------------------------------------------------

function ModalGantiSandi({
  target,
  onTutup,
}: {
  target: PenggunaAdmin;
  onTutup: () => void;
}) {
  const [sandi, setSandi] = useState("");
  const [konfirmasi, setKonfirmasi] = useState("");
  const [sedang, setSedang] = useState(false);

  const cocok = sandi.length >= 8 && sandi === konfirmasi;

  async function simpan() {
    if (!cocok || sedang) return;
    setSedang(true);
    try {
      // Sandi baru dititipkan lewat parameter role (kontrak PATCH).
      await ubahPengguna(target.id, "ganti_sandi", sandi);
      toast(
        "sukses",
        `Sandi ${target.nama.split(" ")[0]} diganti`,
        "Semua sesinya dicabut; tercatat di jejak audit.",
      );
      onTutup();
    } catch (e) {
      toast("error", "Gagal mengganti sandi", e instanceof Error ? e.message : "");
    } finally {
      setSedang(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center px-8"
      role="dialog"
      aria-modal="true"
      aria-label={`Ganti password ${target.nama}`}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onTutup} />
      <div className="glass-strong relative w-full max-w-[320px] rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-teks-utama">Ganti password {target.nama}</p>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            className="btn-tekan p-1 text-teks-sekunder"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <input
          type="password"
          value={sandi}
          onChange={(e) => setSandi(e.target.value)}
          placeholder="Password baru (min 8)…"
          aria-label="Password baru"
          className="glass mt-3 h-11 w-full rounded-xl px-3.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
        />
        <input
          type="password"
          value={konfirmasi}
          onChange={(e) => setKonfirmasi(e.target.value)}
          placeholder="Konfirmasi password baru…"
          aria-label="Konfirmasi password baru"
          className="glass mt-2 h-11 w-full rounded-xl px-3.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
        />
        {konfirmasi.length > 0 && sandi !== konfirmasi && (
          <p className="mt-1.5 text-[11px] font-semibold text-gagal">
            Kedua password belum cocok.
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onTutup}
            className="glass btn-tekan flex-1 rounded-xl py-2.5 text-sm font-semibold text-teks-utama"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!cocok || sedang}
            onClick={() => void simpan()}
            className="btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            {sedang ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <KeyRound className="h-4 w-4" aria-hidden="true" />
            )}
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// ModalZona — tetapkan zona seorang anggota + tambah zona baru
// (berjenjang lewat pilihan zona induk) — spek 1.18/2.6.
// ------------------------------------------------------------

function ModalZona({
  target,
  zonaList,
  onTutup,
  onBerubah,
}: {
  target: PenggunaAdmin;
  zonaList: Zona[];
  onTutup: () => void;
  onBerubah: () => void;
}) {
  const [pilih, setPilih] = useState<string>(String(target.zona_id ?? ""));
  const [namaBaru, setNamaBaru] = useState("");
  const [indukBaru, setIndukBaru] = useState("");
  const [sedang, setSedang] = useState(false);

  async function simpan() {
    if (sedang) return;
    setSedang(true);
    try {
      await tetapkanZonaAnggota(target.id, pilih || null);
      toast("sukses", `Zona ${target.nama.split(" ")[0]} ditetapkan`);
      onBerubah();
    } catch (e) {
      toast("error", "Gagal menetapkan zona", e instanceof Error ? e.message : "");
    } finally {
      setSedang(false);
    }
  }

  async function tambah() {
    const nama = namaBaru.trim();
    if (nama.length < 2 || sedang) return;
    setSedang(true);
    try {
      await tambahZona(nama, indukBaru || undefined);
      toast("sukses", `Zona "${nama}" ditambahkan`);
      setNamaBaru("");
      onBerubah();
    } catch (e) {
      toast("error", "Gagal menambah zona", e instanceof Error ? e.message : "");
    } finally {
      setSedang(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center px-8"
      role="dialog"
      aria-modal="true"
      aria-label={`Zona ${target.nama}`}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onTutup} />
      <div className="glass-strong relative w-full max-w-[320px] rounded-2xl p-5">
        <p className="text-sm font-bold text-teks-utama">Zona {target.nama}</p>
        <select
          value={pilih}
          onChange={(e) => setPilih(e.target.value)}
          aria-label="Pilih zona"
          className="glass-input mt-3 h-11 w-full rounded-xl px-3 text-sm text-teks-utama outline-none"
        >
          <option value="">Tanpa zona</option>
          {zonaList.map((z) => (
            <option key={z.id} value={z.id}>
              {z.nama}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={sedang}
          onClick={() => void simpan()}
          className="btn-tekan mt-2.5 w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
        >
          Simpan Zona
        </button>

        {/* Tambah zona baru (berjenjang) */}
        <p className="mt-4 text-[10.5px] font-bold tracking-wide text-teks-sekunder uppercase">
          Tambah zona baru
        </p>
        <input
          value={namaBaru}
          onChange={(e) => setNamaBaru(e.target.value.slice(0, 60))}
          placeholder="Nama zona (mis. Jakarta Selatan)…"
          className="glass mt-1.5 h-10 w-full rounded-xl px-3.5 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
        />
        <select
          value={indukBaru}
          onChange={(e) => setIndukBaru(e.target.value)}
          aria-label="Zona induk (yang menaungi)"
          className="glass-input mt-1.5 h-10 w-full rounded-xl px-3 text-[12.5px] text-teks-utama outline-none"
        >
          <option value="">Tanpa induk (zona utama)</option>
          {zonaList.map((z) => (
            <option key={`i-${z.id}`} value={z.id}>
              dinaungi: {z.nama}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={namaBaru.trim().length < 2 || sedang}
          onClick={() => void tambah()}
          className="glass btn-tekan mt-2 w-full rounded-xl py-2 text-[12.5px] font-bold text-teks-utama disabled:opacity-50"
        >
          + Tambah Zona
        </button>
      </div>
    </div>
  );
}
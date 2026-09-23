"use client";

// ============================================================
// TabelAnggotaScreen — Database Anggota versi TABEL (spek 1.18/2.2)
// + tombol WhatsApp langsung per baris (spek 2.3).
//
// Kolom: No, Nama, Panggilan, Username, Divisi, Zona, Aksi.
// - Cari real-time (nama/username/WA), saring divisi, sort per kolom,
//   pagination 10/20/50 per halaman.
// - "Ganti Password": modal sandi baru + konfirmasi (min 8, harus
//   cocok); server mencabut semua sesi target & menulis JEJAK AUDIT.
// - Tombol WA: buka wa.me/62xxx di tab baru; tanpa nomor = disabled
//   bertooltip. Akses layar: HR, Super Admin, Master.
//
// DIGABUNG DENGAN KELOLA PENGGUNA (23 Sep 2026): persetujuan pendaftar,
// peran, jabatan, struktur, nonaktif/aktifkan, dan hapus kini ada di
// sini juga — satu layar untuk seluruh urusan anggota. Bagian kelola
// hanya tampil bila `bolehKelola`; server tetap memeriksa ulang tiap
// tindakan, jadi tombol yang tersembunyi bukan satu-satunya pagar.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useVersiSegar } from "@/hooks/use-segar-otomatis";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowUpDown,
  Briefcase,
  Building2,
  Check,
  CheckCheck,
  ChevronRight,
  KeyRound,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  UserX,
  X,
} from "lucide-react";
import { PencocokanSadarScreen } from "./pencocokan-sadar-screen";
import {
  KonfirmasiHapus,
  labelPeran,
  PilihDivisi,
  PilihJabatan,
  PilihPeran,
} from "./kelola-anggota-dialog";
import type { NilaiStruktur } from "./pilih-struktur";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, GlassSkeleton } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { WhatsAppIcon } from "@/features/qc-konten/whatsapp-icon";
import { toast } from "@/hooks/use-app-store";
import {
  getPencocokanSadar,
  getPengguna,
  getZona,
  setujuiSemuaPendaftar,
  tambahZona,
  tetapkanZonaAnggota,
  ubahPengguna,
  type AnggotaPencocokan,
  type PenggunaAdmin,
  type Zona,
} from "@/services";
import { DIVISI, DIVISI_SAYAP, gelarSayap } from "@/lib/struktur";
import { JABATAN_TVR_NASIONAL, jabatanLengkap } from "@/lib/jabatan";
import { cn } from "@/lib/utils";

type KolomSort = "nama" | "username" | "divisi" | "zona";
type Saringan = "aktif" | "menunggu" | "semua";
type Tindakan = "setujui" | "tolak" | "ubah_peran" | "nonaktifkan" | "aktifkan" | "hapus" | "ubah_jabatan";

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

/** Struktur utama saja (divisi/sayap) — jabatan DPP punya baris sendiri. */
function ringkasStruktur(u: PenggunaAdmin): string {
  const divisi = (u.divisi ?? "").trim();
  if (!divisi) return "Belum diatur";
  const gelar = divisi === DIVISI_SAYAP ? gelarSayap(u.sub_divisi ?? "", u.jabatan_sayap) : "";
  if (gelar) return gelar;
  const posisi = u.posisi_divisi === "kepala" ? "Kepala" : "Anggota";
  const sub = (u.sub_divisi ?? "").trim();
  const tambahan = (u.struktur_lain ?? []).length;
  return `${posisi} ${divisi}${sub ? ` · ${sub}` : ""}${tambahan ? ` (+${tambahan} struktur lain)` : ""}`;
}

function namaDepan(u: PenggunaAdmin): string {
  return u.nama.split(" ")[0];
}

export function TabelAnggotaScreen({
  onKembali,
  bolehKelola = false,
  utamakanPendaftar = false,
}: {
  onKembali: () => void;
  /** Tampilkan persetujuan, peran, jabatan, struktur, hapus (HR/master). */
  bolehKelola?: boolean;
  /** Dibuka dari kartu pendaftar: langsung ke saringan Menunggu bila ada. */
  utamakanPendaftar?: boolean;
}) {
  const [daftar, setDaftar] = useState<PenggunaAdmin[] | null>(null);
  const [ringkasan, setRingkasan] = useState<Record<string, number>>({});
  const [saringan, setSaringan] = useState<Saringan>("aktif");
  const [divisiPilih, setDivisiPilih] = useState("semua");
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
  const versiSegar = useVersiSegar();
  // Pencocokan SADAR (14 Sep 2026): lencana per baris + layar pemasangan.
  const [layarSadar, setLayarSadar] = useState(false);
  const [sadarPer, setSadarPer] = useState<Map<string, AnggotaPencocokan["cara"]> | null>(null);
  // --- Bagian kelola (dari layar Kelola Pengguna lama) ---
  const [kelolaUntuk, setKelolaUntuk] = useState<PenggunaAdmin | null>(null);
  const [memilihPeran, setMemilihPeran] = useState<PenggunaAdmin | null>(null);
  const [memilihJabatan, setMemilihJabatan] = useState<PenggunaAdmin | null>(null);
  const [memilihDivisi, setMemilihDivisi] = useState<PenggunaAdmin | null>(null);
  // Penghapusan tidak bisa dibatalkan, jadi selalu lewat konfirmasi.
  const [konfirmasiHapus, setKonfirmasiHapus] = useState<PenggunaAdmin | null>(null);
  const [sedangProses, setSedangProses] = useState<string | null>(null);
  const [sedangSemua, setSedangSemua] = useState(false);
  // Arahkan ke "Menunggu" cukup sekali — segar otomatis tidak boleh
  // menarik pengguna kembali ke saringan itu saat ia sedang di tempat lain.
  const sudahDiarahkan = useRef(false);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const [hasil, zonaSemua, cocok] = await Promise.all([
          getPengguna(),
          getZona().catch(() => []),
          getPencocokanSadar().catch(() => null),
        ]);
        if (!hidup) return;
        // Tanpa hak kelola, layar ini tetap buku anggota AKTIF seperti dulu.
        setDaftar(bolehKelola ? hasil.data : hasil.data.filter((u) => u.status === "aktif"));
        setRingkasan(hasil.ringkasan ?? {});
        setZonaList(zonaSemua);
        setSadarPer(cocok ? new Map(cocok.anggota.map((a) => [a.id, a.cara])) : null);
        if (bolehKelola && utamakanPendaftar && !sudahDiarahkan.current) {
          sudahDiarahkan.current = true;
          if ((hasil.ringkasan?.menunggu ?? 0) > 0) setSaringan("menunggu");
        }
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
  }, [muatUlang, versiSegar, layarSadar, bolehKelola, utamakanPendaftar]);

  const tersaring = useMemo(() => {
    const kunci = cari.trim().toLowerCase();
    const dasar = (daftar ?? []).filter((u) => {
      if (bolehKelola && saringan !== "semua" && u.status !== saringan) return false;
      // "tanpa" = belum punya divisi sama sekali (perlu ditindaklanjuti HR).
      if (divisiPilih !== "semua" && (divisiPilih === "tanpa" ? Boolean(u.divisi) : u.divisi !== divisiPilih)) {
        return false;
      }
      return (
        !kunci ||
        u.nama.toLowerCase().includes(kunci) ||
        (u.username ?? "").toLowerCase().includes(kunci) ||
        (u.nomor_wa ?? "").includes(kunci)
      );
    });
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
  }, [daftar, cari, sortKolom, sortNaik, saringan, divisiPilih, bolehKelola]);

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

  async function jalankan(
    u: PenggunaAdmin,
    tindakan: Tindakan,
    role?: string,
    pesanSukses?: string,
    jabatan?: string,
    bidang?: string,
    jabatanTvr?: string,
  ) {
    if (sedangProses) return;
    setSedangProses(u.id);
    try {
      await ubahPengguna(u.id, tindakan, role, jabatan, bidang, undefined, jabatanTvr);
      toast("sukses", pesanSukses ?? "Perubahan tersimpan");
      setMemilihPeran(null);
      setMemilihJabatan(null);
      setMuatUlang((n) => n + 1);
    } catch (err) {
      toast("error", "Gagal menyimpan", err instanceof Error ? err.message : "Coba lagi sebentar.");
    } finally {
      setSedangProses(null);
    }
  }

  async function simpanDivisi(
    u: PenggunaAdmin,
    info: { divisi: string; sub_divisi: string; posisi_divisi: string; jabatan_sayap?: string; struktur_lain?: NilaiStruktur[] },
  ) {
    if (sedangProses) return;
    setSedangProses(u.id);
    try {
      await ubahPengguna(u.id, "ubah_divisi", undefined, undefined, undefined, info);
      const gelar = gelarSayap(info.sub_divisi, info.jabatan_sayap);
      toast(
        "sukses",
        info.divisi
          ? gelar
            ? `${namaDepan(u)} kini ${gelar}`
            : `${namaDepan(u)} kini ${info.posisi_divisi === "kepala" ? "Kepala" : "Anggota"} ${info.divisi}`
          : "Struktur dikosongkan",
      );
      setMemilihDivisi(null);
      setMuatUlang((n) => n + 1);
    } catch (err) {
      toast("error", "Gagal menyimpan", err instanceof Error ? err.message : "");
    } finally {
      setSedangProses(null);
    }
  }

  async function setujuiSemua() {
    if (sedangSemua) return;
    setSedangSemua(true);
    try {
      const jml = await setujuiSemuaPendaftar();
      toast("sukses", `${jml} pendaftar disetujui`, "Semua kini berperan Anggota.");
      setMuatUlang((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal menyetujui semua", e instanceof Error ? e.message : "");
    } finally {
      setSedangSemua(false);
    }
  }

  const JUDUL_KOLOM: { id: KolomSort; label: string }[] = [
    { id: "nama", label: "Nama" },
    { id: "username", label: "Username" },
    { id: "divisi", label: "Divisi" },
    { id: "zona", label: "Zona" },
  ];

  const CHIP: { id: Saringan; label: string; jumlah?: number }[] = [
    { id: "aktif", label: "Aktif", jumlah: ringkasan.aktif },
    { id: "menunggu", label: "Menunggu", jumlah: ringkasan.menunggu },
    { id: "semua", label: "Semua", jumlah: daftar?.length },
  ];

  if (layarSadar) return <PencocokanSadarScreen onKembali={() => setLayarSadar(false)} />;

  const belumCocok = sadarPer ? Array.from(sadarPer.values()).filter((c) => c === "belum").length : 0;
  const jumlahMenunggu = ringkasan.menunggu ?? 0;

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
        <div className="min-w-0 flex-1">
          <h1 className="font-heading truncate text-xl font-extrabold tracking-tight text-teks-utama">
            Database Anggota
          </h1>
          <p className="truncate text-xs text-teks-sekunder">
            {daftar ? `${tersaring.length} orang` : "Memuat…"}
            {bolehKelola ? " · persetujuan, peran, jabatan & struktur" : " · ganti sandi & chat WA"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setLayarSadar(true)}
          className="glass btn-tekan flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[11.5px] font-bold text-teks-utama"
          aria-label="Pencocokan SADAR"
        >
          <ShieldCheck className="h-4 w-4 text-pri" aria-hidden="true" />
          SADAR
          {belumCocok > 0 && (
            <span className="rounded-full bg-gagal px-1.5 text-[10px] font-bold text-white">{belumCocok}</span>
          )}
        </button>
      </header>

      {/* Pendaftar baru — penanda supaya tidak menunggu berhari-hari
          tanpa ada yang sadar (dulu tugas kartu Kelola Pengguna). */}
      {bolehKelola && jumlahMenunggu > 0 && saringan !== "menunggu" && (
        <button
          type="button"
          onClick={() => {
            setSaringan("menunggu");
            setHalaman(1);
          }}
          className="btn-tekan mt-4 flex w-full items-center gap-2.5 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-left"
        >
          <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[12px] font-extrabold text-white">
            {jumlahMenunggu}
          </span>
          <span className="min-w-0 flex-1 text-[12.5px] font-semibold text-teks-utama">
            Pendaftar baru menunggu persetujuan
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-teks-sekunder" aria-hidden="true" />
        </button>
      )}

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
            placeholder="Cari nama / username / WA…"
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

      {/* Saringan status (khusus pengelola) + divisi */}
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        {bolehKelola && (
          <div className="scrollbar-tipis flex gap-2 overflow-x-auto pb-1 sm:flex-1">
            {CHIP.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSaringan(c.id);
                  setHalaman(1);
                }}
                aria-pressed={saringan === c.id}
                className={cn(
                  "btn-tekan shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold",
                  saringan === c.id ? "text-white" : "glass-soft text-teks-sekunder",
                )}
                style={saringan === c.id ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" } : undefined}
              >
                {c.label}
                {typeof c.jumlah === "number" && c.jumlah > 0 && <span className="ml-1.5 opacity-80">{c.jumlah}</span>}
              </button>
            ))}
          </div>
        )}
        <select
          value={divisiPilih}
          onChange={(e) => {
            setDivisiPilih(e.target.value);
            setHalaman(1);
          }}
          aria-label="Saring berdasarkan divisi"
          className="glass-input h-10 rounded-xl px-3 text-[13px] text-teks-utama outline-none sm:ml-auto sm:w-52"
        >
          <option value="semua">Semua divisi</option>
          <option value="tanpa">Belum ada divisi</option>
          {DIVISI.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {/* Setujui semua — hanya saat menyaring "Menunggu" & ada isinya.
          Semua yang disetujui menjadi anggota; peran istimewa tetap
          ditetapkan satu per satu. */}
      {bolehKelola && saringan === "menunggu" && jumlahMenunggu > 0 && (
        <button
          type="button"
          disabled={sedangSemua}
          onClick={() => void setujuiSemua()}
          className="btn-tekan mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold text-white disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
        >
          {sedangSemua ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <CheckCheck className="h-4 w-4" aria-hidden="true" />
          )}
          Setujui semua {jumlahMenunggu} pendaftar sebagai Anggota
        </button>
      )}

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
            const menunggu = u.status === "menunggu";
            const proses = sedangProses === u.id;
            const statusLabel = menunggu
              ? { teks: "Menunggu", kelas: "text-amber-500" }
              : u.status === "ditolak"
                ? { teks: "Ditolak", kelas: "text-gagal" }
                : !u.aktif
                  ? { teks: "Nonaktif", kelas: "text-teks-sekunder" }
                  : null;
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
                    {/* Status di baris kedua: di layar 375px lencana di samping
                        nama menghabiskan tempat sampai namanya tak terbaca. */}
                    {statusLabel && <span className={cn("mr-1 font-bold", statusLabel.kelas)}>{statusLabel.teks} ·</span>}
                    {menunggu && u.nomor_wa ? `+${u.nomor_wa}` : `@${u.username ?? "-"}`} · {u.divisi || "Tanpa divisi"}
                    {namaZona(u) && ` · ${namaZona(u)}`}
                    {sadarPer && !menunggu && (
                      <span
                        className={cn(
                          "ml-1 font-bold",
                          sadarPer.get(u.id) === "belum" ? "text-gagal" : "text-sukses",
                        )}
                      >
                        · SADAR {sadarPer.get(u.id) === "belum" ? "belum cocok" : sadarPer.get(u.id) === "manual" ? "manual" : "cocok"}
                      </span>
                    )}
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

                {proses ? (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center" aria-label="Menyimpan…">
                    <Loader2 className="h-4 w-4 animate-spin text-teks-sekunder" aria-hidden="true" />
                  </span>
                ) : bolehKelola && menunggu ? (
                  <>
                    {/* Pendaftar: setujui (pilih peran) atau tolak langsung. */}
                    <button
                      type="button"
                      onClick={() => setMemilihPeran(u)}
                      aria-label={`Setujui ${u.nama}`}
                      className="btn-tekan flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[10.5px] font-bold text-white"
                      style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      Setujui
                    </button>
                    <button
                      type="button"
                      onClick={() => void jalankan(u, "tolak", undefined, "Pendaftaran ditolak")}
                      aria-label={`Tolak ${u.nama}`}
                      className="btn-tekan flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gagal/40 bg-gagal/5 text-gagal"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </>
                ) : (
                  <>
                    {/* Tetapkan zona (spek 2.6) */}
                    <button
                      type="button"
                      onClick={() => setZonaUntuk(u)}
                      aria-label={`Tetapkan zona ${u.nama}`}
                      // Pengelola: di layar sempit zona pindah ke lembar Kelola
                      // supaya baris tidak berdesakan.
                      className={cn(
                        "glass btn-tekan h-8 shrink-0 items-center rounded-lg px-2 text-[10.5px] font-bold text-teks-utama",
                        bolehKelola ? "hidden min-[400px]:flex" : "flex",
                      )}
                    >
                      {namaZona(u) || "Zona?"}
                    </button>
                    {bolehKelola ? (
                      <button
                        type="button"
                        onClick={() => setKelolaUntuk(u)}
                        aria-label={`Kelola ${u.nama}`}
                        className="glass btn-tekan flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[10.5px] font-bold text-teks-utama"
                      >
                        <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
                        Kelola
                      </button>
                    ) : (
                      // Ganti Password (spek 2.2)
                      <button
                        type="button"
                        onClick={() => setGantiUntuk(u)}
                        aria-label={`Ganti password ${u.nama}`}
                        className="glass btn-tekan flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[10.5px] font-bold text-teks-utama"
                      >
                        <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                        Sandi
                      </button>
                    )}
                  </>
                )}
              </GlassCard>
            );
          })}
          {tampil.length === 0 && (
            <p className="py-8 text-center text-xs text-teks-sekunder">
              {bolehKelola && saringan === "menunggu" && !cari.trim() && divisiPilih === "semua"
                ? "Tidak ada pendaftar baru — semua pendaftaran sudah ditindaklanjuti."
                : "Tidak ada anggota yang cocok."}
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

      {/* Lembar tindakan per anggota — pintu ke semua dialog kelola. */}
      <AnimatePresence>
        {kelolaUntuk && (
          <LembarKelola
            pengguna={kelolaUntuk}
            onTutup={() => setKelolaUntuk(null)}
            onPilih={(aksi) => {
              const u = kelolaUntuk;
              setKelolaUntuk(null);
              if (aksi === "peran") setMemilihPeran(u);
              else if (aksi === "jabatan") setMemilihJabatan(u);
              else if (aksi === "struktur") setMemilihDivisi(u);
              else if (aksi === "zona") setZonaUntuk(u);
              else if (aksi === "sandi") setGantiUntuk(u);
              else if (aksi === "hapus") setKonfirmasiHapus(u);
              else if (aksi === "nonaktifkan") void jalankan(u, "nonaktifkan", undefined, "Akun dinonaktifkan");
              else void jalankan(u, "aktifkan", undefined, "Akun diaktifkan");
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {konfirmasiHapus && (
          <KonfirmasiHapus
            pengguna={konfirmasiHapus}
            sedangProses={sedangProses === konfirmasiHapus.id}
            onBatal={() => setKonfirmasiHapus(null)}
            onHapus={() => {
              const u = konfirmasiHapus;
              setKonfirmasiHapus(null);
              void jalankan(u, "hapus", undefined, `${u.nama} dihapus dari keanggotaan`);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {memilihJabatan && (
          <PilihJabatan
            pengguna={memilihJabatan}
            sedangProses={sedangProses === memilihJabatan.id}
            onTutup={() => setMemilihJabatan(null)}
            onPilih={(jabatan, bidang, tvrNasional) =>
              void jalankan(
                memilihJabatan,
                "ubah_jabatan",
                undefined,
                jabatan
                  ? `Jabatan ${namaDepan(memilihJabatan)} kini ${jabatanLengkap(jabatan, bidang)}`
                  : tvrNasional
                    ? `${namaDepan(memilihJabatan)} kini ${JABATAN_TVR_NASIONAL}`
                    : "Jabatan dikosongkan",
                jabatan,
                bidang,
                tvrNasional ? JABATAN_TVR_NASIONAL : "",
              )
            }
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {memilihDivisi && (
          <PilihDivisi
            pengguna={memilihDivisi}
            sedangProses={sedangProses === memilihDivisi.id}
            onTutup={() => setMemilihDivisi(null)}
            onSimpan={(info) => void simpanDivisi(memilihDivisi, info)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {memilihPeran && (
          <PilihPeran
            pengguna={memilihPeran}
            sedangProses={sedangProses === memilihPeran.id}
            onTutup={() => setMemilihPeran(null)}
            onPilih={(role) =>
              void jalankan(
                memilihPeran,
                memilihPeran.status === "aktif" ? "ubah_peran" : "setujui",
                role,
                memilihPeran.status === "aktif"
                  ? `Peran diubah menjadi ${labelPeran(role)}`
                  : `${memilihPeran.nama} disetujui sebagai ${labelPeran(role)}`,
              )
            }
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ------------------------------------------------------------
// LembarKelola — daftar tindakan untuk satu anggota (peran, jabatan,
// struktur, zona, sandi, nonaktif/aktifkan, hapus). Setiap baris
// menyebut keadaan sekarang supaya HR tahu apa yang akan diubah.
// ------------------------------------------------------------

type AksiKelola = "peran" | "jabatan" | "struktur" | "zona" | "sandi" | "nonaktifkan" | "aktifkan" | "hapus";

function LembarKelola({
  pengguna: u,
  onPilih,
  onTutup,
}: {
  pengguna: PenggunaAdmin;
  onPilih: (aksi: AksiKelola) => void;
  onTutup: () => void;
}) {
  const diSayap = u.divisi === DIVISI_SAYAP;
  const disetujui = u.status === "aktif";
  const baris: {
    aksi: AksiKelola;
    label: string;
    keterangan: string;
    ikon: typeof UserCog;
    bahaya?: boolean;
    mati?: boolean;
  }[] = [
    {
      aksi: "peran",
      label: disetujui ? "Ubah Peran" : "Setujui & Beri Peran",
      keterangan: disetujui ? `Sekarang: ${labelPeran(u.role)}` : "Pendaftaran ini belum disetujui",
      ikon: disetujui ? UserCog : Check,
    },
    {
      aksi: "jabatan",
      label: "Jabatan",
      keterangan: diSayap
        ? "Anggota Sayap Partai memakai jabatan sayap (lewat Struktur)"
        : u.jabatan
          ? jabatanLengkap(u.jabatan, u.bidang_jabatan)
          : "Belum ada jabatan",
      ikon: Briefcase,
      mati: diSayap,
    },
    {
      aksi: "struktur",
      label: "Struktur",
      keterangan: ringkasStruktur(u),
      ikon: Building2,
    },
    { aksi: "zona", label: "Zona", keterangan: namaZona(u) || "Belum ada zona", ikon: MapPin },
    { aksi: "sandi", label: "Ganti Sandi", keterangan: "Semua sesinya dicabut; tercatat di jejak audit", ikon: KeyRound },
    u.aktif
      ? { aksi: "nonaktifkan", label: "Nonaktifkan", keterangan: "Cabut akses sementara — data tetap tersimpan", ikon: UserX, bahaya: true }
      : { aksi: "aktifkan", label: "Aktifkan", keterangan: "Pulihkan akses akun ini", ikon: Check },
    { aksi: "hapus", label: "Hapus Keanggotaan", keterangan: "Permanen, tidak bisa dibatalkan", ikon: Trash2, bahaya: true },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[70] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Kelola ${u.nama}`}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-md" onClick={onTutup} />
      <motion.div
        initial={{ y: "102%" }}
        animate={{ y: 0 }}
        exit={{ y: "102%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        className="glass-strong relative mx-auto flex max-h-[88dvh] w-full max-w-[440px] flex-col rounded-t-[2rem] px-5 pt-3 pb-8"
      >
        <div className="mb-3 flex shrink-0 justify-center">
          <span className="h-1.5 w-12 rounded-full bg-teks-sekunder/40" aria-hidden="true" />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {u.avatar_url ? <FotoBulat src={u.avatar_url} ukuran={44} /> : <AvatarInisial nama={u.nama} ukuran={44} />}
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-heading text-lg font-bold text-teks-utama">{u.nama}</h2>
            <p className="truncate text-[12px] text-teks-sekunder">
              {u.username ? `@${u.username}` : u.email}
              {u.nomor_wa ? ` · +${u.nomor_wa}` : ""}
            </p>
          </div>
          <button type="button" onClick={onTutup} aria-label="Tutup" className="btn-tekan p-1.5 text-teks-sekunder">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="scrollbar-tipis mt-4 flex flex-col gap-2 overflow-y-auto">
          {baris.map((b) => (
            <button
              key={b.aksi}
              type="button"
              disabled={b.mati}
              onClick={() => onPilih(b.aksi)}
              className="glass-soft btn-tekan flex items-center gap-3 rounded-2xl p-3 text-left disabled:opacity-50"
            >
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                  b.bahaya ? "bg-gagal/10 text-gagal" : "bg-pri/10 text-pri",
                )}
              >
                <b.ikon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm font-bold", b.bahaya ? "text-gagal" : "text-teks-utama")}>
                  {b.label}
                </span>
                <span className="block truncate text-[11.5px] leading-snug text-teks-sekunder">{b.keterangan}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-teks-sekunder" aria-hidden="true" />
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
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
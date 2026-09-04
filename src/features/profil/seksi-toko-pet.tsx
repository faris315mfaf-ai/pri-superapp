"use client";

// ============================================================
// Panel Master → TOKO PET: master sebagai PEDAGANG (5 Sep 2026).
// • Menetapkan HARGA per item (menimpa harga katalog; kosongkan = harga
//   katalog). Berlaku untuk semua item: aksesoris (4 kategori + jaket +
//   langka), sparepart, skin robot, gerakan, hewan, makanan, skin hewan,
//   warna custom.
// • Membuka/menutup EVENT item langka (50 item): hanya saat event terbuka
//   anggota bisa membelinya; boleh diberi batas waktu.
// Data disimpan di pengaturan_sistem `pet_toko` (lib/pet-toko).
// ============================================================

import { useMemo, useState } from "react";
import { Search, Store } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { SectionTitle, StatusBadge } from "@/components/pri-ui";
import { SwitchKaca } from "./switch-kaca";
import { toast } from "@/hooks/use-app-store";
import { aksiMaster } from "@/services";
import {
  HARGA_WARNA_CUSTOM,
  KATALOG_AKSESORIS,
  KATALOG_GERAKAN,
  KATALOG_HEWAN,
  KATALOG_MAKANAN,
  KATALOG_MAKANAN_HEWAN,
  KATALOG_SKIN,
  KATALOG_SPAREPART,
  KODE_WARNA_CUSTOM,
} from "@/lib/pet";
import { adalahJaket, eventAktif, KATALOG_SKIN_HEWAN, KATEGORI_LABEL, kategoriDariSlot, tokoDariJson } from "@/lib/pet-katalog-v5";
import { cn } from "@/lib/utils";

type Baris = { kode: string; nama: string; kelompok: string; harga: number; langka: boolean };

const KELOMPOK: readonly [kunci: string, label: string][] = [
  ["semua", "Semua"],
  ["langka", "Item langka (event)"],
  ["jaket", "Jaket PRI / TV Rakyat"],
  ["kepala", "Aksesoris kepala"],
  ["tangan", "Aksesoris tangan"],
  ["tubuh", "Aksesoris tubuh"],
  ["kaki", "Aksesoris kaki"],
  ["sparepart", "Sparepart"],
  ["skin", "Skin eksklusif robot"],
  ["hewan", "Hewan & makanannya"],
  ["skin_hewan", "Skin hewan"],
  ["gerakan", "Gerakan"],
  ["makanan", "Makanan robot"],
];

function semuaBaris(): Baris[] {
  const b: Baris[] = [];
  for (const a of KATALOG_AKSESORIS) {
    b.push({ kode: a.kode, nama: a.nama, kelompok: a.langka ? "langka" : adalahJaket(a) ? "jaket" : kategoriDariSlot(a.slot), harga: a.harga, langka: Boolean(a.langka) });
  }
  for (const s of KATALOG_SPAREPART) b.push({ kode: s.kode, nama: s.nama, kelompok: "sparepart", harga: s.harga, langka: false });
  for (const s of KATALOG_SKIN) b.push({ kode: s.kode, nama: s.nama, kelompok: "skin", harga: s.harga, langka: false });
  for (const h of KATALOG_HEWAN) b.push({ kode: h.kode, nama: h.nama, kelompok: "hewan", harga: h.harga, langka: false });
  for (const m of KATALOG_MAKANAN_HEWAN) b.push({ kode: m.kode, nama: `${m.emoji} ${m.nama}`, kelompok: "hewan", harga: m.harga, langka: false });
  for (const s of KATALOG_SKIN_HEWAN) b.push({ kode: s.kode, nama: `${s.nama} (${s.hewan})`, kelompok: "skin_hewan", harga: s.harga, langka: false });
  for (const g of KATALOG_GERAKAN) b.push({ kode: g.kode, nama: `${g.emoji} ${g.nama}`, kelompok: "gerakan", harga: g.harga, langka: false });
  for (const m of KATALOG_MAKANAN) b.push({ kode: m.kode, nama: `${m.emoji} ${m.nama}`, kelompok: "makanan", harga: m.harga, langka: false });
  b.push({ kode: KODE_WARNA_CUSTOM, nama: "Warna Custom (fitur)", kelompok: "skin", harga: HARGA_WARNA_CUSTOM, langka: false });
  return b;
}

export function SeksiTokoPet({
  pengaturan,
  sedangProses,
  onSelesai,
}: {
  pengaturan: Record<string, string>;
  sedangProses: boolean;
  onSelesai: () => void;
}) {
  const toko = useMemo(() => tokoDariJson(pengaturan.pet_toko ?? ""), [pengaturan.pet_toko]);
  const semua = useMemo(() => semuaBaris(), []);
  const [cari, setCari] = useState("");
  const [kelompok, setKelompok] = useState("langka");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [sampai, setSampai] = useState<Record<string, string>>({});
  const [sibuk, setSibuk] = useState("");

  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return semua.filter((b) => (kelompok === "semua" || b.kelompok === kelompok) && (!q || b.nama.toLowerCase().includes(q) || b.kode.includes(q)));
  }, [semua, cari, kelompok]);
  const jumlahOverride = Object.keys(toko.harga).length;
  const jumlahEvent = Object.keys(toko.event).filter((k) => eventAktif(k, toko)).length;

  async function simpanHarga(kode: string) {
    if (sibuk) return;
    setSibuk(`harga:${kode}`);
    try {
      const nilai = (draft[kode] ?? "").trim();
      await aksiMaster("pet_toko_harga", { kode, nilai });
      toast("sukses", nilai === "" ? "Harga kembali ke katalog" : `Harga ${kode} → ${nilai} koin`);
      setDraft((d) => {
        const n = { ...d };
        delete n[kode];
        return n;
      });
      onSelesai();
    } catch (e) {
      toast("error", "Gagal menyimpan harga", e instanceof Error ? e.message : "");
    } finally {
      setSibuk("");
    }
  }

  async function ubahEvent(kode: string, nyala: boolean) {
    if (sibuk) return;
    setSibuk(`event:${kode}`);
    try {
      await aksiMaster("pet_toko_event", { kode, nilai: nyala, sampai: nyala ? (sampai[kode] ?? "") : "" });
      toast("sukses", nyala ? "Event dibuka — item bisa dibeli anggota" : "Event ditutup");
      onSelesai();
    } catch (e) {
      toast("error", "Gagal mengubah event", e instanceof Error ? e.message : "");
    } finally {
      setSibuk("");
    }
  }

  return (
    <div className="mt-6">
      <SectionTitle judul="Toko Pet (Pedagang)" />
      <GlassCard className="mt-2.5 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <Store className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-teks-utama">Harga & event item</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-teks-sekunder">
              Tetapkan harga koin tiap item (kosong = harga katalog) dan buka event item langka. {jumlahOverride} harga khusus · {jumlahEvent} event terbuka · {semua.length} item.
            </p>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <label className="glass-input flex h-10 flex-1 items-center gap-2 rounded-xl px-3">
            <Search className="h-4 w-4 shrink-0 text-teks-sekunder" aria-hidden="true" />
            <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama / kode item" className="min-w-0 flex-1 bg-transparent text-[12.5px] text-teks-utama outline-none" aria-label="Cari item toko pet" />
          </label>
          <select value={kelompok} onChange={(e) => setKelompok(e.target.value)} aria-label="Kelompok item" className="glass-input h-10 max-w-[46%] rounded-xl px-2 text-[12px] text-teks-utama">
            {KELOMPOK.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <p className="mt-2 text-[10.5px] text-teks-sekunder">{tampil.length} item ditampilkan{tampil.length > 80 ? " (80 pertama; persempit dengan pencarian)" : ""}.</p>
        <div className="mt-1.5 flex max-h-[520px] flex-col gap-1.5 overflow-y-auto pr-0.5">
          {tampil.slice(0, 80).map((b) => {
            const override = toko.harga[b.kode];
            const nilaiDraft = draft[b.kode] ?? (override != null ? String(override) : "");
            const aktif = b.langka && eventAktif(b.kode, toko);
            return (
              <div key={b.kode} className={cn("rounded-xl border px-2.5 py-2", aktif ? "border-emerald-400/40 bg-emerald-400/8" : "border-black/5 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.04]")}>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-bold text-teks-utama">
                      {b.nama}
                      {b.langka ? <span className="ml-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-extrabold text-amber-700 dark:text-amber-300">LANGKA</span> : null}
                    </p>
                    <p className="truncate text-[10px] text-teks-sekunder">
                      {b.kode} · katalog {b.harga} koin{override != null ? ` · ditetapkan ${override}` : ""} · {KATEGORI_LABEL[b.kelompok as keyof typeof KATEGORI_LABEL] ?? b.kelompok}
                    </p>
                  </div>
                  <input
                    value={nilaiDraft}
                    onChange={(e) => setDraft((d) => ({ ...d, [b.kode]: e.target.value.replace(/[^0-9]/g, "") }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void simpanHarga(b.kode);
                    }}
                    inputMode="numeric"
                    placeholder={String(b.harga)}
                    aria-label={`Harga ${b.nama}`}
                    className="glass-input h-9 w-[76px] rounded-lg px-2 text-right text-[12px] font-bold text-teks-utama"
                  />
                  <button
                    type="button"
                    onClick={() => void simpanHarga(b.kode)}
                    disabled={sedangProses || Boolean(sibuk) || nilaiDraft === (override != null ? String(override) : "")}
                    className="btn-tekan h-9 shrink-0 rounded-lg px-2.5 text-[11px] font-bold text-white disabled:opacity-40"
                    style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
                  >
                    {sibuk === `harga:${b.kode}` ? "…" : "Simpan"}
                  </button>
                </div>
                {b.langka ? (
                  <div className="mt-1.5 flex items-center gap-2">
                    <StatusBadge label={aktif ? "event terbuka" : "tertutup"} warna={aktif ? "hijau" : "netral"} />
                    <input
                      type="datetime-local"
                      value={sampai[b.kode] ?? (toko.event[b.kode] ? toko.event[b.kode]!.slice(0, 16) : "")}
                      onChange={(e) => setSampai((s) => ({ ...s, [b.kode]: e.target.value }))}
                      aria-label={`Batas event ${b.nama}`}
                      title="Batas waktu event (kosong = tanpa batas)"
                      className="glass-input h-8 min-w-0 flex-1 rounded-lg px-2 text-[11px] text-teks-utama"
                    />
                    <SwitchKaca aktif={aktif} disabled={sedangProses || Boolean(sibuk)} onUbah={() => void ubahEvent(b.kode, !aktif)} labelAria={`Event ${b.nama}`} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}

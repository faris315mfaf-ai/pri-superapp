"use client";
// ============================================================
// PilihStruktur (10 Sep 2026) — pemilih struktur organisasi DUA LANGKAH:
//   1. pilih kategori: Zona · Sayap · Divisi
//   2. pilih isinya (zona / sayap / divisi kerja)
//
// Nilainya tetap pasangan `divisi` + `sub_divisi` seperti di database
// (Zona & Sayap = "divisi" dengan sub), sehingga dipakai di tiga tempat
// tanpa migrasi data: pendaftaran (anggota memilih sendiri), Kelola
// Pengguna (HR), dan Panel Master (buat akun).
//
// Daftar Sayap diambil dari /api/sayap (bawaan + tambahan). Pengelola
// (Divisi HR / superadmin / master) bisa menambah sayap baru di tempat.
// ============================================================
import { useEffect, useState } from "react";
import { Building2, Check, Feather, Loader2, MapPinned, Plus, X } from "lucide-react";
import { toast } from "@/hooks/use-app-store";
import {
  DIVISI_BIASA,
  DIVISI_SAYAP,
  DIVISI_ZONA,
  JABATAN_SAYAP,
  KATEGORI_STRUKTUR,
  gelarSayap,
  SUB_SAYAP,
  SUB_ZONA,
  kategoriStruktur,
  type KategoriStruktur,
} from "@/lib/struktur";
import { cn } from "@/lib/utils";
import { getSayap, tambahSayap, type SayapPartai } from "@/services";
import type { KomponenIkon } from "@/types";

export type NilaiStruktur = {
  divisi: string;
  sub_divisi: string;
  /** Jabatan di sayap (10 Sep 2026); hanya berlaku untuk Sayap Partai. */
  jabatan_sayap?: string;
};

const IKON: Record<KategoriStruktur, KomponenIkon> = {
  zona: MapPinned,
  sayap: Feather,
  divisi: Building2,
};

export function PilihStruktur({
  nilai,
  onUbah,
  disabled = false,
  besar = false,
  bolehKosong = false,
  bolehJabatanSayap = false,
}: {
  nilai: NilaiStruktur;
  onUbah: (baru: NilaiStruktur) => void;
  disabled?: boolean;
  /** true = ukuran isian pendaftaran (h-12, teks 15px). */
  besar?: boolean;
  /** true = ada pilihan "Tanpa struktur" (Kelola Pengguna / Panel Master). */
  bolehKosong?: boolean;
  /**
   * true = ikut memilih JABATAN DI SAYAP (Ketua Umum dst.). Hanya untuk
   * layar pengurus; anggota tidak menetapkan jabatannya sendiri.
   */
  bolehJabatanSayap?: boolean;
}) {
  // Kategori DITURUNKAN dari nilai tersimpan; hanya "divisi" yang bisa
  // dipilih lebih dulu sebelum divisinya ditentukan (nilai masih kosong),
  // karena itu ada cadangan lokal — tanpa effect penyelaras.
  const [kategoriLokal, setKategoriLokal] = useState<KategoriStruktur | null>(null);
  const kategori: KategoriStruktur | null = kategoriStruktur(nilai.divisi) ?? kategoriLokal;
  const [sayap, setSayap] = useState<SayapPartai[] | null>(null);
  const [bolehTambah, setBolehTambah] = useState(false);
  const [formTambah, setFormTambah] = useState(false);
  const [singkatan, setSingkatan] = useState("");
  const [namaPanjang, setNamaPanjang] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);

  useEffect(() => {
    if (kategori !== "sayap" || sayap !== null) return;
    let hidup = true;
    getSayap()
      .then((r) => {
        if (!hidup) return;
        setSayap(r.data);
        setBolehTambah(r.boleh_kelola);
      })
      .catch(() => {
        // Tanpa server pun sayap bawaan tetap bisa dipilih.
        if (hidup) setSayap(SUB_SAYAP.map((s) => ({ id: null, nilai: s.nilai, label: s.label, bawaan: true, aktif: true })));
      });
    return () => {
      hidup = false;
    };
  }, [kategori, sayap]);

  function pilihKategori(k: KategoriStruktur) {
    setKategoriLokal(k);
    setFormTambah(false);
    if (k === "zona") onUbah({ divisi: DIVISI_ZONA, sub_divisi: "", jabatan_sayap: "" });
    else if (k === "sayap") onUbah({ divisi: DIVISI_SAYAP, sub_divisi: "", jabatan_sayap: nilai.jabatan_sayap ?? "" });
    else onUbah({ divisi: "", sub_divisi: "", jabatan_sayap: "" });
  }

  async function simpanSayapBaru() {
    if (menyimpan) return;
    setMenyimpan(true);
    try {
      const baru = await tambahSayap(singkatan, namaPanjang);
      const segar = await getSayap();
      setSayap(segar.data);
      onUbah({ divisi: DIVISI_SAYAP, sub_divisi: baru.nilai, jabatan_sayap: nilai.jabatan_sayap ?? "" });
      setFormTambah(false);
      setSingkatan("");
      setNamaPanjang("");
      toast("sukses", "Sayap ditambahkan", baru.label);
    } catch (e) {
      toast("error", "Gagal menambah sayap", e instanceof Error ? e.message : "");
    } finally {
      setMenyimpan(false);
    }
  }

  const kelasSelect = cn(
    "glass-soft w-full rounded-xl px-3 text-teks-utama outline-none focus:ring-2 focus:ring-pri/50 disabled:opacity-60",
    besar ? "h-12 text-[15px]" : "h-11 text-sm",
  );

  const pilihanZona = SUB_ZONA;
  const pilihanSayap = (sayap ?? SUB_SAYAP.map((s) => ({ id: null, nilai: s.nilai, label: s.label, bawaan: true, aktif: true }))).filter(
    (s) => s.aktif || s.nilai === nilai.sub_divisi,
  );

  return (
    <div className="flex flex-col gap-2.5">
      {/* Langkah 1: kategori */}
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Kategori struktur">
        {KATEGORI_STRUKTUR.map((k) => {
          const Ikon = IKON[k.kunci];
          const aktif = kategori === k.kunci;
          return (
            <button
              key={k.kunci}
              type="button"
              disabled={disabled}
              onClick={() => pilihKategori(k.kunci)}
              aria-pressed={aktif}
              className={cn(
                "btn-tekan flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[12px] font-bold disabled:opacity-60",
                aktif ? "text-white" : "glass text-teks-sekunder",
              )}
              style={aktif ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)", boxShadow: "0 8px 18px rgba(220,38,38,0.3)" } : undefined}
            >
              <Ikon className="h-4.5 w-4.5" aria-hidden="true" />
              {k.label}
              {aktif && <Check className="h-3 w-3" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      {bolehKosong && kategori && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setKategoriLokal(null);
            setFormTambah(false);
            onUbah({ divisi: "", sub_divisi: "" });
          }}
          className="btn-tekan self-start text-[11.5px] font-semibold text-teks-sekunder underline-offset-2 hover:underline"
        >
          Kosongkan struktur
        </button>
      )}

      {/* Langkah 2: isi */}
      {kategori === "zona" && (
        <select
          value={nilai.sub_divisi}
          disabled={disabled}
          onChange={(e) => onUbah({ divisi: DIVISI_ZONA, sub_divisi: e.target.value, jabatan_sayap: "" })}
          aria-label="Zona"
          className={kelasSelect}
        >
          <option value="">— Pilih zona —</option>
          {pilihanZona.map((z) => (
            <option key={z.nilai} value={z.nilai}>
              {z.label}
            </option>
          ))}
        </select>
      )}
      {kategori === "sayap" && (
        <>
          <select
            value={nilai.sub_divisi}
            disabled={disabled || sayap === null}
            onChange={(e) => onUbah({ divisi: DIVISI_SAYAP, sub_divisi: e.target.value, jabatan_sayap: nilai.jabatan_sayap ?? "" })}
            aria-label="Sayap partai"
            className={kelasSelect}
          >
            <option value="">{sayap === null ? "Memuat daftar sayap…" : "— Pilih sayap —"}</option>
            {pilihanSayap.map((s) => (
              <option key={s.nilai} value={s.nilai}>
                {s.label}
              </option>
            ))}
          </select>
          {/* Jabatan DI SAYAP (10 Sep 2026): kepengurusan sayap sendiri —
              tidak berpengaruh apa pun di DPP, tetapi membuka Dashboard. */}
          {bolehJabatanSayap && nilai.sub_divisi && (
            <div>
              <label className="mb-1 block text-[11.5px] font-semibold text-teks-sekunder" htmlFor="jabatan-sayap">
                Jabatan di sayap
              </label>
              <select
                id="jabatan-sayap"
                value={nilai.jabatan_sayap ?? ""}
                disabled={disabled}
                onChange={(e) => onUbah({ divisi: DIVISI_SAYAP, sub_divisi: nilai.sub_divisi, jabatan_sayap: e.target.value })}
                className={kelasSelect}
              >
                <option value="">— Anggota biasa —</option>
                {JABATAN_SAYAP.map((j) => (
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </select>
              {nilai.jabatan_sayap ? (
                <p className="mt-1 text-[11px] font-semibold text-pri">
                  {gelarSayap(nilai.sub_divisi, nilai.jabatan_sayap)}
                </p>
              ) : null}
            </div>
          )}
          {bolehTambah && !formTambah && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setFormTambah(true)}
              className="btn-tekan flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-[11.5px] font-bold text-pri"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Tambah sayap baru
            </button>
          )}
          {bolehTambah && formTambah && (
            <div className="glass-soft flex flex-col gap-2 rounded-xl p-3" role="group" aria-label="Tambah sayap baru">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-bold text-teks-utama">Sayap baru</p>
                <button
                  type="button"
                  onClick={() => setFormTambah(false)}
                  aria-label="Batal tambah sayap"
                  className="btn-tekan p-1 text-teks-sekunder"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <input
                value={singkatan}
                onChange={(e) => setSingkatan(e.target.value.toUpperCase())}
                placeholder="Singkatan, mis. PERI"
                maxLength={30}
                aria-label="Singkatan sayap"
                className="glass-input h-10 w-full rounded-xl px-3 text-sm text-teks-utama"
              />
              <input
                value={namaPanjang}
                onChange={(e) => setNamaPanjang(e.target.value)}
                placeholder="Nama panjang, mis. Perempuan Rakyat Indonesia"
                maxLength={120}
                aria-label="Nama panjang sayap"
                className="glass-input h-10 w-full rounded-xl px-3 text-sm text-teks-utama"
              />
              <button
                type="button"
                disabled={menyimpan || singkatan.trim().length < 2 || namaPanjang.trim().length < 3}
                onClick={() => void simpanSayapBaru()}
                className="btn-tekan flex h-10 items-center justify-center gap-2 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
              >
                {menyimpan ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                Simpan sayap
              </button>
            </div>
          )}
        </>
      )}
      {kategori === "divisi" && (
        <select
          value={nilai.divisi}
          disabled={disabled}
          onChange={(e) => onUbah({ divisi: e.target.value, sub_divisi: "", jabatan_sayap: "" })}
          aria-label="Divisi"
          className={kelasSelect}
        >
          <option value="">— Pilih divisi —</option>
          {DIVISI_BIASA.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

"use client";

// ============================================================
// PENCARI VIDEO ASLI (Lacak Sumber, 15 Okt 2026) — Profil → Kelola Bot → Lacak Sumber (master).
//
// Koleksi = daftar akun pembuat konten asli yang videonya dipanen dan
// disimpan sidiknya; makin lengkap koleksinya, makin cepat & murah pelacakan.
// Layar ini: statistik, tambah akun, tabel akun (aktif, jenis, hapus dengan
// konfirmasi di baris), pengaturan pelacak (ambang + sakelar), dan kuota
// cari balik gambar (SerpAPI) bulan ini.
// ============================================================

import { useState } from "react";
import { Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import { cn } from "@/lib/utils";
import { waktuRelatif } from "@/features/ruang-bot/peta-nyata";
import type { AkunKoleksi, JenisAkunKoleksi, PengaturanLacak, StatistikLacak } from "@/lib/lacak-tipe";
import { LABEL_JENIS, PILIHAN_PLATFORM, angka, koma, namaPlatform, urlProfil, type PlatformKoleksi } from "./format";
import { useKoleksiLacak, usePengaturanLacak } from "./use-lacak";

const DAFTAR_JENIS = Object.entries(LABEL_JENIS) as [JenisAkunKoleksi, string][];
const KELAS_INPUT = "glass-input h-11 w-full rounded-xl px-3 text-[13px] text-teks-utama";
const KELAS_SELECT = "glass-input h-11 rounded-xl px-2.5 text-[13px] text-teks-utama";

/** Saklar dengan area sentuh 44px; trek visualnya tetap ramping (pola Sumber & Kuota). */
function Saklar({
  aktif,
  onUbah,
  label,
  disabled = false,
}: {
  aktif: boolean;
  onUbah: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={aktif}
      aria-label={label}
      disabled={disabled}
      onClick={() => onUbah(!aktif)}
      className="flex h-11 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-pri disabled:cursor-wait disabled:opacity-50"
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
            "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 motion-reduce:transition-none",
            aktif && "translate-x-5",
          )}
        />
      </span>
    </button>
  );
}

// ------------------------------------------------------------ statistik

function KotakStatistik({ s }: { s: StatistikLacak }) {
  const kotak: { label: string; nilai: string; ket?: string }[] = [
    { label: "Akun di koleksi", nilai: angka(s.akun) },
    { label: "Video tersimpan sidiknya", nilai: angka(s.video) },
    { label: "Sidik gambar terindeks", nilai: angka(s.vektor) },
    { label: "Ditemukan (30 hari)", nilai: `${angka(s.ditemukan_30h)} / ${angka(s.total_30h)}` },
    {
      label: "Disetujui master",
      nilai: s.diputus_30h > 0 ? `${Math.round((s.disetujui_30h / s.diputus_30h) * 100)}%` : "—",
      ket: `${angka(s.disetujui_30h)} dari ${angka(s.diputus_30h)} keputusan`,
    },
  ];
  return (
    <ul aria-label="Statistik pelacak" className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 sm:grid-cols-3 lg:grid-cols-5">
      {kotak.map((k) => (
        <li key={k.label} className="glass rounded-2xl px-3.5 py-3">
          <span className="block text-[11.5px] font-bold text-teks-sekunder">{k.label}</span>
          <b className="font-mono text-[21px] text-teks-utama">{k.nilai}</b>
          {k.ket && <span className="block text-[10.5px] text-teks-sekunder">{k.ket}</span>}
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------ tambah akun

function FormTambahAkun({ onTambah }: { onTambah: (url: string, jenis: JenisAkunKoleksi) => Promise<string | null> }) {
  const [isian, setIsian] = useState("");
  const [platform, setPlatform] = useState<PlatformKoleksi>("tiktok");
  const [jenis, setJenis] = useState<JenisAkunKoleksi>("media_resmi");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");
  const linkUtuh = /^https:\/\//i.test(isian.trim());

  async function kirim() {
    const url = urlProfil(isian, platform);
    if (!url) {
      setGalat("Tulis @namaakun (huruf, angka, titik, garis bawah) atau tempel link profil yang diawali https://");
      return;
    }
    setSibuk(true);
    setGalat("");
    const g = await onTambah(url, jenis);
    setSibuk(false);
    if (g) {
      setGalat(g);
      return;
    }
    setIsian("");
    toast("sukses", "Akun ditambahkan", "Videonya ikut dipanen pada putaran berikutnya.");
  }

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!sibuk && isian.trim()) void kirim();
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-[1_1_220px] flex-col gap-1 text-[11.5px] font-bold text-teks-sekunder">
          Tambah akun pembuat konten
          <input
            value={isian}
            onChange={(e) => setIsian(e.target.value)}
            placeholder="@namaakun atau link profil"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={500}
            disabled={sibuk}
            aria-invalid={galat ? true : undefined}
            aria-describedby={galat ? "koleksi-galat-tambah" : undefined}
            className={cn(KELAS_INPUT, "font-normal")}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] font-bold text-teks-sekunder">
          Platform
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as PlatformKoleksi)}
            disabled={sibuk || linkUtuh}
            title={linkUtuh ? "Platform dibaca dari link" : undefined}
            className={cn(KELAS_SELECT, "font-normal disabled:opacity-50")}
          >
            {PILIHAN_PLATFORM.map((p) => (
              <option key={p.kunci} value={p.kunci}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] font-bold text-teks-sekunder">
          Jenis
          <select value={jenis} onChange={(e) => setJenis(e.target.value as JenisAkunKoleksi)} disabled={sibuk} className={cn(KELAS_SELECT, "font-normal")}>
            {DAFTAR_JENIS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={sibuk || !isian.trim()}
          className="btn-tekan flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-stone-900 px-4 text-[13px] font-extrabold text-white disabled:opacity-50 dark:bg-white dark:text-stone-900"
        >
          {sibuk ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
          Tambah
        </button>
      </div>
      {galat && (
        <p id="koleksi-galat-tambah" role="alert" className="m-0 text-[12px] text-gagal">
          {galat}
        </p>
      )}
    </form>
  );
}

// ------------------------------------------------------------ tabel akun

function TabelAkun({
  akun,
  sibuk,
  onUbah,
  onHapus,
}: {
  akun: AkunKoleksi[];
  sibuk: ReadonlySet<number>;
  onUbah: (id: number, patch: { aktif?: boolean; jenis?: JenisAkunKoleksi }) => Promise<string | null>;
  onHapus: (id: number) => Promise<string | null>;
}) {
  const [hapusId, setHapusId] = useState<number | null>(null);
  const [galat, setGalat] = useState("");

  async function ubah(id: number, patch: { aktif?: boolean; jenis?: JenisAkunKoleksi }) {
    setGalat("");
    const g = await onUbah(id, patch);
    if (g) setGalat(g);
  }

  async function hapus(a: AkunKoleksi) {
    setGalat("");
    const g = await onHapus(a.id);
    setHapusId(null);
    if (g) setGalat(g);
    else toast("sukses", "Akun dihapus dari koleksi", a.handle);
  }

  if (akun.length === 0) {
    return <p className="m-0 text-[12.5px] text-teks-sekunder">Koleksi masih kosong. Tambahkan akun media resmi atau kreator lokal yang sering disadur.</p>;
  }

  const kepala = "border-b border-glass-border px-2 py-2 text-left text-[10.5px] font-bold uppercase tracking-[0.05em] text-teks-sekunder";
  const sel = "border-b border-glass-border px-2 py-1.5 align-middle";
  return (
    <>
      {galat && (
        <p role="alert" className="m-0 rounded-xl border border-gagal/30 bg-gagal/10 px-3 py-2 text-[12px] text-teks-utama">
          {galat}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-[12.5px] text-teks-utama">
          <caption className="sr-only">Akun di koleksi sumber</caption>
          <thead>
            <tr>
              <th scope="col" className={kepala}>
                Akun
              </th>
              <th scope="col" className={kepala}>
                Jenis
              </th>
              <th scope="col" className={cn(kepala, "text-right")}>
                Video
              </th>
              <th scope="col" className={cn(kepala, "text-right")}>
                Jadi sumber
              </th>
              <th scope="col" className={kepala}>
                Dipanen
              </th>
              <th scope="col" className={cn(kepala, "text-right")}>
                Aktif
              </th>
              <th scope="col" className={cn(kepala, "text-right")}>
                <span className="sr-only">Hapus</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {akun.map((a) => {
              const proses = sibuk.has(a.id);
              const konfirmasi = hapusId === a.id;
              return (
                <tr key={a.id}>
                  <th scope="row" className={cn(sel, "max-w-[240px] text-left font-normal")}>
                    <b className="block truncate text-teks-utama">{a.handle}</b>
                    <span className="block text-[11px] text-teks-sekunder">{namaPlatform(a.platform)}</span>
                    {a.galat_panen && (
                      <span role="note" className="mt-0.5 block text-[11px] leading-snug text-gagal">
                        Panen gagal: {a.galat_panen}
                      </span>
                    )}
                  </th>
                  <td className={sel}>
                    <select
                      value={a.jenis}
                      onChange={(e) => void ubah(a.id, { jenis: e.target.value as JenisAkunKoleksi })}
                      disabled={proses}
                      aria-label={`Jenis akun ${a.handle}`}
                      className={cn(KELAS_SELECT, "text-[12.5px] disabled:opacity-50")}
                    >
                      {DAFTAR_JENIS.map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={cn(sel, "text-right font-mono")}>{angka(a.video)}</td>
                  <td className={cn(sel, "text-right font-mono")}>{angka(a.jadi_sumber)}</td>
                  <td className={cn(sel, "whitespace-nowrap text-teks-sekunder")}>{a.aktif ? waktuRelatif(a.terakhir_panen) : "dijeda"}</td>
                  <td className={cn(sel, "text-right")}>
                    <span className="inline-flex justify-end">
                      <Saklar aktif={a.aktif} onUbah={(v) => void ubah(a.id, { aktif: v })} label={`Aktifkan panen ${a.handle}`} disabled={proses} />
                    </span>
                  </td>
                  <td className={cn(sel, "text-right")}>
                    {konfirmasi ? (
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap" role="group" aria-label={`Konfirmasi hapus ${a.handle}`}>
                        <span className="text-[11.5px] font-bold text-teks-utama">Hapus?</span>
                        <button
                          type="button"
                          onClick={() => void hapus(a)}
                          disabled={proses}
                          className="btn-tekan flex min-h-11 items-center gap-1 rounded-xl bg-gagal px-3 text-[12px] font-bold text-white disabled:opacity-50"
                        >
                          {proses && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                          Ya, hapus
                        </button>
                        <button
                          type="button"
                          onClick={() => setHapusId(null)}
                          disabled={proses}
                          className="glass btn-tekan flex min-h-11 items-center rounded-xl px-3 text-[12px] font-bold text-teks-utama"
                        >
                          Batal
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setHapusId(a.id)}
                        disabled={proses}
                        aria-label={`Hapus ${a.handle} dari koleksi`}
                        className="btn-tekan inline-flex h-11 w-11 items-center justify-center rounded-xl text-gagal hover:bg-gagal/10 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ------------------------------------------------------------ pengaturan

const SAKELAR: { kunci: "lacak_bot" | "tombol_pengguna" | "cari_lens" | "simpan_ke_koleksi"; nama: string; ket: string }[] = [
  { kunci: "lacak_bot", nama: "Lacak otomatis untuk bot", ket: "Setiap video panenan bot dilacak sebelum masuk Antrean ACC." },
  { kunci: "tombol_pengguna", nama: "Tombol Cari video asli di TVR Saya", ket: "Muncul di bawah kolom link pada Edit Otomatis." },
  { kunci: "cari_lens", nama: "Cari balik gambar (berbayar)", ket: "Dipakai hanya bila koleksi & pencarian platform kosong." },
  { kunci: "simpan_ke_koleksi", nama: "Tambahkan sumber yang ditemukan ke koleksi", ket: "Akun asli baru otomatis ikut dipanen." },
];

/** Batas penggeser (perseratus). Ambang yakin selalu ≥ ambang ACC + 0,05. */
const YAKIN_MIN = 70;
const YAKIN_MAKS = 98;
const ACC_MIN = 40;
const ACC_MAKS = 80;
const JARAK = 5;

const keRatus = (x: number) => Math.round(x * 100);

function PanelPengaturan({
  awal,
  menyimpan,
  onSimpan,
}: {
  awal: PengaturanLacak;
  menyimpan: boolean;
  onSimpan: (p: PengaturanLacak) => Promise<string | null>;
}) {
  const [yakin, setYakin] = useState(() => Math.min(YAKIN_MAKS, Math.max(YAKIN_MIN, keRatus(awal.ambang_yakin))));
  const [acc, setAcc] = useState(() => Math.min(ACC_MAKS, Math.max(ACC_MIN, keRatus(awal.ambang_acc))));
  const [sakelar, setSakelar] = useState(() => ({
    lacak_bot: awal.lacak_bot,
    tombol_pengguna: awal.tombol_pengguna,
    cari_lens: awal.cari_lens,
    simpan_ke_koleksi: awal.simpan_ke_koleksi,
  }));
  const [galat, setGalat] = useState("");

  const ubahYakin = (v: number) => {
    setYakin(v);
    setAcc((a) => Math.min(a, v - JARAK));
  };
  const ubahAcc = (v: number) => {
    setAcc(v);
    setYakin((y) => Math.max(y, v + JARAK));
  };

  const berubah =
    yakin !== keRatus(awal.ambang_yakin) ||
    acc !== keRatus(awal.ambang_acc) ||
    SAKELAR.some((s) => sakelar[s.kunci] !== awal[s.kunci]);

  async function simpan() {
    setGalat("");
    const g = await onSimpan({ ambang_yakin: yakin / 100, ambang_acc: acc / 100, ...sakelar });
    if (g) setGalat(g);
    else toast("sukses", "Pengaturan pelacak disimpan");
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="flex items-baseline justify-between gap-2 text-[13px] font-bold text-teks-utama">
          Ambang &quot;yakin&quot; (dipakai otomatis)
          <b className="font-mono text-emerald-700 dark:text-emerald-300">{koma(yakin / 100)}</b>
        </span>
        <input
          type="range"
          min={YAKIN_MIN}
          max={YAKIN_MAKS}
          step={1}
          value={yakin}
          onChange={(e) => ubahYakin(Number(e.target.value))}
          aria-valuetext={koma(yakin / 100)}
          className="h-11 w-full accent-emerald-600"
        />
        <span className="text-[11.5px] text-teks-sekunder">Makin tinggi, makin sedikit yang otomatis dan makin banyak yang masuk ACC.</span>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="flex items-baseline justify-between gap-2 text-[13px] font-bold text-teks-utama">
          Ambang &quot;perlu ACC&quot;
          <b className="font-mono text-amber-700 dark:text-amber-300">{koma(acc / 100)}</b>
        </span>
        <input
          type="range"
          min={ACC_MIN}
          max={ACC_MAKS}
          step={1}
          value={acc}
          onChange={(e) => ubahAcc(Number(e.target.value))}
          aria-valuetext={koma(acc / 100)}
          className="h-11 w-full accent-amber-600"
        />
        <span className="text-[11.5px] text-teks-sekunder">Di bawah angka ini kandidat dianggap bukan sumber.</span>
      </label>

      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {SAKELAR.map((s) => (
          <li key={s.kunci} className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <b className="block text-[13px] text-teks-utama">{s.nama}</b>
              <span className="text-[11.5px] text-teks-sekunder">{s.ket}</span>
            </span>
            <Saklar aktif={sakelar[s.kunci]} onUbah={(v) => setSakelar((x) => ({ ...x, [s.kunci]: v }))} label={s.nama} disabled={menyimpan} />
          </li>
        ))}
      </ul>

      {galat && (
        <p role="alert" className="m-0 text-[12px] text-gagal">
          {galat}
        </p>
      )}
      <button
        type="button"
        onClick={() => void simpan()}
        disabled={!berubah || menyimpan}
        className="btn-tekan flex h-11 items-center justify-center gap-2 rounded-xl text-[13px] font-extrabold text-white disabled:opacity-50"
        style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
      >
        {menyimpan && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {berubah ? "Simpan pengaturan" : "Tersimpan"}
      </button>
    </div>
  );
}

function KuotaLens({ s }: { s: StatistikLacak }) {
  if (s.lens_kuota <= 0) {
    return (
      <p role="note" className="m-0 rounded-xl bg-amber-500/10 px-3 py-2.5 text-[12px] leading-relaxed text-amber-800 dark:text-amber-200">
        <b>Cari balik gambar belum aktif.</b> Kunci SerpAPI belum dipasang di VPS mesin.
      </p>
    );
  }
  const rasio = Math.min(1, Math.max(0, s.lens_bulan_ini / s.lens_kuota));
  return (
    <div className="glass-soft flex flex-col gap-1.5 rounded-xl p-3">
      <span className="flex items-baseline justify-between gap-2 text-[12.5px] font-bold text-teks-utama">
        Kuota cari balik gambar bulan ini
        <b className="font-mono">
          {angka(s.lens_bulan_ini)} / {angka(s.lens_kuota)}
        </b>
      </span>
      <span
        role="progressbar"
        aria-label="Pemakaian kuota cari balik gambar"
        aria-valuemin={0}
        aria-valuemax={s.lens_kuota}
        aria-valuenow={s.lens_bulan_ini}
        className="block h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10"
      >
        <span className={cn("block h-full rounded-full", rasio >= 0.9 ? "bg-gagal" : "bg-info")} style={{ width: `${Math.max(2, rasio * 100)}%` }} />
      </span>
      <span className="text-[11px] text-teks-sekunder">Kunci API SerpAPI dipasang di VPS mesin dan tidak pernah tampil di sini.</span>
    </div>
  );
}

// ------------------------------------------------------------ layar

export function KoleksiLacakView() {
  const koleksi = useKoleksiLacak();
  const pengaturan = usePengaturanLacak();
  const statistik = koleksi.data?.statistik ?? null;

  return (
    <section className="flex flex-col gap-3.5">
      <GlassCard className="p-4">
        <h2 className="m-0 text-[16px] font-extrabold text-teks-utama">Koleksi sumber &amp; pengaturan</h2>
        <p className="mt-1 mb-0 text-[12.5px] leading-relaxed text-teks-sekunder">
          Koleksi adalah daftar akun pembuat konten asli yang videonya disimpan sidiknya. Makin lengkap koleksinya, makin cepat dan murah pelacakan.
          Pelacakan per video ada di <b className="text-teks-utama">Ruang Bot → Lacak Sumber</b>.
        </p>
      </GlassCard>

      {koleksi.galat && (
        <div role="alert" className="flex items-center justify-between gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2 text-[12px] text-amber-800 dark:text-amber-200">
          <span className="min-w-0">{koleksi.galat}</span>
          <button
            type="button"
            onClick={koleksi.muatUlang}
            className="btn-tekan flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-pri/15 px-3.5 text-[11.5px] font-bold text-pri"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Coba lagi
          </button>
        </div>
      )}

      {statistik ? <KotakStatistik s={statistik} /> : !koleksi.galat && <GlassSkeleton className="h-20 rounded-2xl" />}

      <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">
        <GlassCard className="flex min-w-0 flex-col gap-3 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="m-0 text-[14.5px] font-extrabold text-teks-utama">Akun di koleksi</h3>
            <span className="text-[11.5px] text-teks-sekunder">Dipanen berkala; video lama dibuang dari indeks</span>
          </div>
          <FormTambahAkun onTambah={koleksi.tambah} />
          {koleksi.data ? (
            <TabelAkun akun={koleksi.data.akun} sibuk={koleksi.sibuk} onUbah={koleksi.ubah} onHapus={koleksi.hapus} />
          ) : (
            !koleksi.galat && <GlassSkeleton className="h-40 rounded-2xl" />
          )}
        </GlassCard>

        <GlassCard className="flex min-w-0 flex-col gap-4 p-4">
          <h3 className="m-0 text-[14.5px] font-extrabold text-teks-utama">Pengaturan pelacak</h3>
          {pengaturan.data ? (
            <PanelPengaturan
              key={JSON.stringify(pengaturan.data)}
              awal={pengaturan.data}
              menyimpan={pengaturan.menyimpan}
              onSimpan={pengaturan.simpan}
            />
          ) : pengaturan.galat ? (
            <div role="alert" className="flex flex-col items-start gap-2 text-[12px] text-gagal">
              {pengaturan.galat}
              <button
                type="button"
                onClick={pengaturan.muatUlang}
                className="glass btn-tekan flex min-h-11 items-center gap-1.5 rounded-xl px-3.5 text-[12px] font-bold text-teks-utama"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Coba lagi
              </button>
            </div>
          ) : (
            <GlassSkeleton className="h-60 rounded-2xl" />
          )}
          {statistik && <KuotaLens s={statistik} />}
        </GlassCard>
      </div>
    </section>
  );
}

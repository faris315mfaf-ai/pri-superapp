"use client";

// ============================================================
// KelolaTimPanel — Pimpinan Redaksi menambah/mengeluarkan anggota
// tim TV Rakyat dan menunjuk siapa yang boleh ACC video & upload.
//
// Anggota yang ditambahkan otomatis mendapat modul TV Rakyat.
// ============================================================

import { useEffect, useState } from "react";
import { Search, UserPlus, X, ShieldCheck, Upload, Users2 } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import {
  AvatarInisial,
  FadeInUp,
  GlassSkeleton,
  SectionTitle,
} from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { SwitchKaca } from "@/features/profil/switch-kaca";
import { toast } from "@/hooks/use-app-store";
import { cn } from "@/lib/utils";
import {
  aturWewenangTv,
  getKelolaTimTv,
  keluarkanAnggotaTv,
  setPengaturanTv,
  tambahAnggotaTv,
  type AnggotaTv,
  type KandidatTv,
  setAutoBroadcastTv,
  setVideoBaruTampilTv,
} from "@/services";

export function KelolaTimPanel() {
  const [tim, setTim] = useState<AnggotaTv[] | null>(null);
  const [kandidat, setKandidat] = useState<KandidatTv[]>([]);
  const [cari, setCari] = useState("");
  // Siaran otomatis upload -> ruang chat (spek 1.18/1.3)
  const [siaran, setSiaran] = useState(true);
  const [sedangSiaran, setSedangSiaran] = useState(false);
  // Tampilkan kartu "Video Baru TV Rakyat" di modul Konten (fitur 1.22.x/2)
  const [videoBaru, setVideoBaru] = useState(false);
  const [sedangVideoBaru, setSedangVideoBaru] = useState(false);
  // Pengaturan angka Pimred (fitur 1.20/6 & 8)
  const [batasMb, setBatasMb] = useState("100");
  const [retensiJam, setRetensiJam] = useState("24");
  const [sedangSimpanAngka, setSedangSimpanAngka] = useState(false);
  const [tambahBuka, setTambahBuka] = useState(false);
  const [sibuk, setSibuk] = useState<string | null>(null);

  async function muat() {
    try {
      const hasil = await getKelolaTimTv();
      setSiaran(hasil.auto_broadcast);
      setVideoBaru(hasil.video_baru_tampil);
      setTim(hasil.tim);
      setKandidat(hasil.kandidat);
      setBatasMb(String(hasil.maks_upload_mb));
      setRetensiJam(String(hasil.retensi_jam));
    } catch (e) {
      setTim([]);
      toast("error", "Gagal memuat tim TV", e instanceof Error ? e.message : "");
    }
  }

  useEffect(() => {
    // Microtask sebelum setState pertama: aturan lint proyek melarang
    // setState sinkron di badan effect (memicu render beruntun).
    let hidup = true;
    void (async () => {
      await Promise.resolve();
      if (hidup) await muat();
    })();
    return () => {
      hidup = false;
    };
  }, []);

  async function tambah(k: KandidatTv) {
    setSibuk(k.id);
    try {
      await tambahAnggotaTv(k.id);
      toast("sukses", "Ditambahkan ke Tim TV", `${k.nama.split(" ")[0]} kini punya modul TV Rakyat.`);
      await muat();
    } catch (e) {
      toast("error", "Gagal menambahkan", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(null);
    }
  }

  async function keluarkan(a: AnggotaTv) {
    setSibuk(a.user_id);
    try {
      await keluarkanAnggotaTv(a.user_id);
      await muat();
    } catch (e) {
      toast("error", "Gagal mengeluarkan", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(null);
    }
  }

  /**
   * Divisi wewenang (31 Agu 2026, pengganti dua toggle): satu pilihan
   * memetakan KEDUA kolom sekaligus —
   *   Setujui         → acc=true,  upload=false
   *   Upload          → acc=false, upload=true
   *   Setujui+Upload  → acc=true,  upload=true
   * Menekan pilihan yang SEDANG aktif mencabut keduanya (tanpa wewenang).
   */
  async function pilihDivisi(a: AnggotaTv, acc: boolean, upload: boolean) {
    const aktifSekarang = a.boleh_acc === acc && a.boleh_upload === upload;
    const tuju = aktifSekarang ? { boleh_acc: false, boleh_upload: false } : { boleh_acc: acc, boleh_upload: upload };
    // Optimis di layar; server menyimpan.
    setTim((lama) =>
      (lama ?? []).map((t) => (t.user_id === a.user_id ? { ...t, ...tuju } : t)),
    );
    try {
      await aturWewenangTv(a.user_id, tuju);
    } catch (e) {
      toast("error", "Gagal menyimpan wewenang", e instanceof Error ? e.message : "");
      await muat();
    }
  }

  const kunci = cari.trim().toLowerCase();
  const kandidatTampil = kandidat.filter((k) => k.nama.toLowerCase().includes(kunci));

  return (
    <FadeInUp delay={0.06} className="mt-4">
      <SectionTitle judul="Tim TV Rakyat" />

      {/* Toggle siaran otomatis (spek 1.18/1.3) — khusus Pimred */}
      <GlassCard className="mb-3 flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-teks-utama">
            Kirim notifikasi upload video ke ruangan chat
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-teks-sekunder">
            Setiap video tayang, tautannya otomatis disiarkan ke grup chat
            Divisi TV Rakyat atas nama TV Rakyat Official.
          </p>
        </div>
        <SwitchKaca
          aktif={siaran}
          onUbah={() => {
            if (sedangSiaran) return;
            setSedangSiaran(true);
            const baru = !siaran;
            void setAutoBroadcastTv(baru)
              .then(() => {
                setSiaran(baru);
                toast(
                  "sukses",
                  baru ? "Siaran otomatis MENYALA" : "Siaran otomatis DIMATIKAN",
                );
              })
              .catch((e) =>
                toast("error", "Gagal menyimpan", e instanceof Error ? e.message : ""),
              )
              .finally(() => setSedangSiaran(false));
          }}
          labelAria="Siaran otomatis upload ke ruang chat"
        />
      </GlassCard>

      {/* Tampilkan kartu "Video Baru TV Rakyat" di modul Konten
          (fitur 1.22.x/2) — bawaan tersembunyi; Pimred menyalakannya. */}
      <GlassCard className="mb-3 flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-teks-utama">
            Tampilkan &ldquo;Video Baru TV Rakyat&rdquo; di modul Konten
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-teks-sekunder">
            Bila MENYALA, kartu kewajiban komentar &amp; share video baru muncul di
            modul Konten semua anggota. Bawaan tersembunyi.
          </p>
        </div>
        <SwitchKaca
          aktif={videoBaru}
          onUbah={() => {
            if (sedangVideoBaru) return;
            setSedangVideoBaru(true);
            const baru = !videoBaru;
            void setVideoBaruTampilTv(baru)
              .then(() => {
                setVideoBaru(baru);
                toast(
                  "sukses",
                  baru ? "Video Baru DITAMPILKAN" : "Video Baru DISEMBUNYIKAN",
                  baru
                    ? "Kartunya kini muncul di modul Konten semua anggota."
                    : "Kartunya kini tersembunyi dari modul Konten.",
                );
              })
              .catch((e) =>
                toast("error", "Gagal menyimpan", e instanceof Error ? e.message : ""),
              )
              .finally(() => setSedangVideoBaru(false));
          }}
          labelAria="Tampilkan video baru TV Rakyat di modul Konten"
        />
      </GlassCard>

      {/* Pengaturan unggahan (fitur 1.20/6 & 8) — khusus Pimred */}
      <GlassCard className="mb-3 p-4">
        <p className="text-sm font-bold text-teks-utama">Pengaturan Unggahan</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-teks-sekunder">
              Ukuran video maksimal (1–200 MB)
            </span>
            <input
              type="number"
              min={1}
              max={200}
              value={batasMb}
              onChange={(e) => setBatasMb(e.target.value)}
              onBlur={() => {
                const n = Math.floor(Number(batasMb));
                if (!Number.isFinite(n) || n < 1 || n > 200) {
                  toast("peringatan", "Batas ukuran harus 1–200 MB");
                  return;
                }
                if (sedangSimpanAngka) return;
                setSedangSimpanAngka(true);
                void setPengaturanTv("maks_upload", n)
                  .then(() => toast("sukses", `Batas ukuran video: ${n} MB`))
                  .catch((e2) =>
                    toast("error", "Gagal menyimpan", e2 instanceof Error ? e2.message : ""),
                  )
                  .finally(() => setSedangSimpanAngka(false));
              }}
              aria-label="Ukuran video maksimal dalam MB"
              className="glass-input h-10 w-full rounded-xl px-3 text-sm text-teks-utama"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-teks-sekunder">
              Video tampil di aplikasi selama (1–24 jam)
            </span>
            <input
              type="number"
              min={1}
              max={24}
              value={retensiJam}
              onChange={(e) => setRetensiJam(e.target.value)}
              onBlur={() => {
                const n = Math.floor(Number(retensiJam));
                if (!Number.isFinite(n) || n < 1 || n > 24) {
                  toast("peringatan", "Umur tayang harus 1–24 jam");
                  return;
                }
                if (sedangSimpanAngka) return;
                setSedangSimpanAngka(true);
                void setPengaturanTv("retensi", n)
                  .then(() => toast("sukses", `Umur tayang video: ${n} jam`))
                  .catch((e2) =>
                    toast("error", "Gagal menyimpan", e2 instanceof Error ? e2.message : ""),
                  )
                  .finally(() => setSedangSimpanAngka(false));
              }}
              aria-label="Umur tayang video dalam jam"
              className="glass-input h-10 w-full rounded-xl px-3 text-sm text-teks-utama"
            />
          </label>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-teks-sekunder">
          Lewat umur tayang, video hilang dari Konten & Beranda dan berkasnya
          dibersihkan dari penyimpanan. Postingan yang sudah naik di sosmed
          tidak disentuh; riwayat & statistik tetap utuh.
        </p>
      </GlassCard>

      <GlassCard className="p-4">
        <div className="flex items-center gap-2">
          <Users2 className="h-4 w-4 text-pri" aria-hidden="true" />
          <p className="text-[12.5px] font-bold text-teks-utama">
            {tim === null ? "Memuat…" : `${tim.length} anggota ditunjuk`}
          </p>
          <button
            type="button"
            onClick={() => setTambahBuka((v) => !v)}
            className="btn-tekan ml-auto flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold text-white"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
            {tambahBuka ? "Tutup" : "Tambah"}
          </button>
        </div>

        {/* Pemilih kandidat */}
        {tambahBuka && (
          <div className="mt-3 rounded-xl border border-glass-border p-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-teks-sekunder" />
              <input
                value={cari}
                onChange={(e) => setCari(e.target.value)}
                placeholder="Cari anggota untuk ditambahkan…"
                aria-label="Cari anggota"
                className="glass-input h-10 w-full rounded-lg pr-3 pl-9 text-sm text-teks-utama outline-none"
              />
            </div>
            <div className="scrollbar-tipis mt-2 max-h-56 overflow-y-auto">
              {kandidatTampil.length === 0 ? (
                <p className="py-4 text-center text-[11.5px] text-teks-sekunder">
                  Tidak ada anggota yang cocok.
                </p>
              ) : (
                kandidatTampil.slice(0, 30).map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    disabled={sibuk === k.id}
                    onClick={() => void tambah(k)}
                    className="btn-tekan flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left disabled:opacity-50"
                  >
                    {k.avatar_url ? (
                      <FotoBulat src={k.avatar_url} ukuran={32} />
                    ) : (
                      <AvatarInisial nama={k.nama} ukuran={32} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-teks-utama">
                        {k.nama}
                      </span>
                      <span className="block truncate text-[10.5px] text-teks-sekunder">
                        {k.jabatan || k.divisi || "Anggota"}
                      </span>
                    </span>
                    <UserPlus className="h-4 w-4 shrink-0 text-pri" aria-hidden="true" />
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Daftar anggota tim + wewenang */}
        {tim === null ? (
          <GlassSkeleton className="mt-3 h-24 rounded-xl" />
        ) : tim.length === 0 ? (
          <p className="mt-3 text-center text-[11.5px] text-teks-sekunder">
            Belum ada anggota. Tambahkan orang untuk membuka modul TV Rakyat bagi mereka.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {tim.map((a) => (
              <div key={a.user_id} className="glass-soft rounded-xl p-2.5">
                <div className="flex items-center gap-2.5">
                  {a.avatar_url ? (
                    <FotoBulat src={a.avatar_url} ukuran={36} />
                  ) : (
                    <AvatarInisial nama={a.nama} ukuran={36} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-bold text-teks-utama">{a.nama}</p>
                    <p className="truncate text-[10.5px] text-teks-sekunder">
                      {a.jabatan || "Anggota tim TV"}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={sibuk === a.user_id}
                    onClick={() => void keluarkan(a)}
                    aria-label={`Keluarkan ${a.nama}`}
                    className="btn-tekan shrink-0 rounded-lg p-1.5 text-gagal disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {/* Divisi wewenang (pengganti toggle, 31 Agu 2026):
                    satu dari tiga pilihan; ketuk yang aktif = cabut. */}
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { label: "Setujui", Ikon: ShieldCheck, acc: true, upload: false },
                      { label: "Upload", Ikon: Upload, acc: false, upload: true },
                      { label: "Setujui+Upload", Ikon: ShieldCheck, acc: true, upload: true },
                    ] as const
                  ).map((d) => {
                    const aktif = a.boleh_acc === d.acc && a.boleh_upload === d.upload;
                    return (
                      <button
                        key={d.label}
                        type="button"
                        onClick={() => void pilihDivisi(a, d.acc, d.upload)}
                        aria-pressed={aktif}
                        title={aktif ? "Ketuk lagi untuk mencabut wewenang" : `Jadikan divisi ${d.label}`}
                        className={cn(
                          "btn-tekan flex items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-[10.5px] font-bold",
                          aktif
                            ? "text-white"
                            : "bg-black/5 text-teks-sekunder dark:bg-white/5",
                        )}
                        style={
                          aktif
                            ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                            : undefined
                        }
                      >
                        <d.Ikon className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">{d.label}</span>
                      </button>
                    );
                  })}
                </div>
                {!a.boleh_acc && !a.boleh_upload && (
                  <p className="mt-1 text-[10px] text-teks-sekunder">
                    Belum diberi divisi — pilih salah satu di atas.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </FadeInUp>
  );
}

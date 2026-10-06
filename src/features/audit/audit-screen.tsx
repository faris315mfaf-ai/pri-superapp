"use client";

// ============================================================
// AuditScreen (6 Okt 2026) — modul Audit untuk superadmin & master.
//
// Daftar: siapa saja yang aktif pada tanggal terpilih (WIB) — lama
// aplikasinya menyala, jam pertama–terakhir, jumlah login, dan alat yang
// dipakai (Edit Otomatis, Kompres, Blur, Hapus Latar, unggah, dst.).
// Ketuk satu orang → rincian: pita sesi 24 jam, lama per layar,
// linimasa peristiwa, dan video yang diunggah hari itu.
//
// Data: GET /api/audit (lib/audit + sql/60). Waktu aktif diukur dari
// detak aplikasi — tab tersembunyi/aplikasi ditutup tidak terhitung.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  LogIn,
  MonitorSmartphone,
  RefreshCw,
  Search,
  ShieldAlert,
  UploadCloud,
  Users,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, EmptyState, GlassSkeleton, ScreenHeader } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { PlatformIcon } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import {
  getRincianAudit,
  getRingkasanAudit,
  type BarisAuditRingkas,
  type PeristiwaAudit,
  type RincianAudit,
  type RingkasanAudit,
} from "@/services";
import {
  JENIS_AUDIT,
  kelompokJenisAudit,
  labelJenisAudit,
  labelLayarAudit,
  type KelompokAudit,
} from "@/lib/audit-jenis";
import { tanggalIndonesia, tanggalWibHariIni } from "@/lib/format";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------
// Pembantu tampilan
// ------------------------------------------------------------

/** "3j 05m", "12m", "<1m" */
function durasi(detik: number): string {
  if (detik < 60) return detik > 0 ? "<1m" : "0m";
  const j = Math.floor(detik / 3600);
  const m = Math.floor((detik % 3600) / 60);
  return j > 0 ? `${j}j ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** Jam WIB "HH.MM" dari ISO / detik epoch — tak bergantung zona perangkat. */
function jam(waktu: string | number | null | undefined): string {
  if (waktu == null) return "–";
  const ms = typeof waktu === "number" ? waktu * 1000 : Date.parse(waktu);
  if (!Number.isFinite(ms)) return "–";
  const d = new Date(ms + 7 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}.${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function geserTanggal(tanggal: string, hari: number): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + hari);
  return d.toISOString().slice(0, 10);
}

const IKON_KELOMPOK: Record<KelompokAudit, LucideIcon> = {
  akses: LogIn,
  video: Wand2,
  unggah: UploadCloud,
};

const WARNA_KELOMPOK: Record<KelompokAudit, string> = {
  akses: "bg-info/12 text-blue-600 dark:text-blue-400",
  video: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
  unggah: "bg-sukses/12 text-emerald-600 dark:text-emerald-400",
};

/** Urutan chip hitungan di kartu daftar. */
const URUTAN_JENIS = Object.keys(JENIS_AUDIT);

function Foto({ nama, src, ukuran }: { nama: string; src?: string | null; ukuran: number }) {
  return src ? <FotoBulat src={src} ukuran={ukuran} /> : <AvatarInisial nama={nama} ukuran={ukuran} />;
}

function KartuAngka({ ikon: Ikon, label, nilai }: { ikon: LucideIcon; label: string; nilai: string }) {
  return (
    <GlassCard className="flex items-center gap-2.5 p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pri/10 text-pri">
        <Ikon className="h-4.5 w-4.5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="angka-tab block font-heading text-lg font-extrabold leading-tight text-teks-utama">{nilai}</span>
        <span className="block truncate text-[10.5px] text-teks-sekunder">{label}</span>
      </span>
    </GlassCard>
  );
}

function ChipJenis({ jenis, jumlah }: { jenis: string; jumlah: number }) {
  const k = kelompokJenisAudit(jenis) ?? "akses";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-bold", WARNA_KELOMPOK[k])}>
      {labelJenisAudit(jenis)} {jumlah}
    </span>
  );
}

function PemilihTanggal({ tanggal, onUbah }: { tanggal: string; onUbah: (t: string) => void }) {
  const hariIni = tanggalWibHariIni();
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onUbah(geserTanggal(tanggal, -1))}
        aria-label="Hari sebelumnya"
        className="glass btn-tekan flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-teks-utama"
      >
        <ChevronLeft className="h-4.5 w-4.5" />
      </button>
      <input
        type="date"
        value={tanggal}
        max={hariIni}
        onChange={(e) => e.target.value && onUbah(e.target.value)}
        aria-label="Tanggal audit"
        className="glass h-10 min-w-0 flex-1 rounded-xl px-3 text-[13px] font-bold text-teks-utama"
      />
      <button
        type="button"
        onClick={() => onUbah(geserTanggal(tanggal, 1))}
        disabled={tanggal >= hariIni}
        aria-label="Hari berikutnya"
        className="glass btn-tekan flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-teks-utama disabled:opacity-40"
      >
        <ChevronRight className="h-4.5 w-4.5" />
      </button>
    </div>
  );
}

function BannerBelumSiap() {
  return (
    <GlassCard className="flex gap-2.5 border border-amber-500/30 bg-amber-500/10 p-3">
      <ShieldAlert className="mt-0.5 h-4.5 w-4.5 shrink-0 text-amber-500" aria-hidden="true" />
      <p className="text-[11.5px] leading-relaxed text-teks-utama">
        Tabel audit belum dibuat. Jalankan <b>sql/60_audit_aktivitas.sql</b> di server (pri-sql). Sampai itu
        dijalankan, yang tampil hanya unggahan TVR Saya dan orang yang sedang online.
      </p>
    </GlassCard>
  );
}

// ------------------------------------------------------------
// Rincian satu orang
// ------------------------------------------------------------

/** Pita 24 jam: rentang sesi aplikasi menyala (WIB). */
function PitaSesi({ tanggal, sesi }: { tanggal: string; sesi: [number, number][] }) {
  const awal = Date.parse(`${tanggal}T00:00:00+07:00`) / 1000;
  return (
    <div>
      <div className="relative h-7 overflow-hidden rounded-lg bg-black/5 dark:bg-white/10">
        {sesi.map(([a, b], i) => {
          const kiri = Math.max(0, (a - awal) / 864);
          const lebar = Math.max(0.35, (b - a) / 864);
          return (
            <span
              key={i}
              title={`${jam(a)}–${jam(b)}`}
              className="absolute top-0 h-full rounded-sm bg-pri/80"
              style={{ left: `${Math.min(kiri, 99.6)}%`, width: `${Math.min(lebar, 100 - kiri)}%` }}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[9.5px] text-teks-sekunder">
        {["00", "06", "12", "18", "24"].map((j) => (
          <span key={j}>{j}</span>
        ))}
      </div>
    </div>
  );
}

function IsiDetail({ p }: { p: PeristiwaAudit }) {
  const d = (p.detail ?? {}) as Record<string, unknown>;
  const baris: string[] = [];
  if (typeof d.tulisan === "string" && d.tulisan) baris.push(`Tulisan: ${d.tulisan}`);
  if (typeof d.kategori === "string" && d.kategori) baris.push(`Kategori: ${d.kategori}`);
  if (typeof d.sumber_kredit === "string" && d.sumber_kredit) baris.push(`Kredit: ${d.sumber_kredit}`);
  if (Array.isArray(d.platforms) && d.platforms.length) baris.push(`Sosmed: ${d.platforms.join(", ")}`);
  if (Array.isArray(d.gagal) && d.gagal.length) baris.push(`Gagal: ${d.gagal.join(", ")}`);
  if (typeof d.jadwal === "string" && d.jadwal) baris.push(`Dijadwalkan ${jam(d.jadwal)}`);
  if (Array.isArray(d.profil) && d.profil.length) baris.push(`${d.profil.length} profil tujuan`);
  if (typeof d.jumlah_template === "number") baris.push(`${d.jumlah_template} template`);
  if (d.tim === true) baris.push("Lewat akun TIM TV Rakyat");
  const tautan = typeof d.tautan === "string" ? d.tautan : null;
  const perangkat = [p.perangkat, p.ip].filter(Boolean).join(" · ");
  if (!baris.length && !tautan && !perangkat) return null;
  return (
    <div className="mt-1 space-y-0.5 text-[10.5px] leading-snug text-teks-sekunder">
      {baris.map((b) => (
        <p key={b} className="line-clamp-2 break-words">
          {b}
        </p>
      ))}
      {tautan && (
        <a href={tautan} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 truncate text-info">
          <ExternalLink className="h-3 w-3 shrink-0" /> <span className="truncate">{tautan}</span>
        </a>
      )}
      {perangkat && (
        <p className="flex items-center gap-1">
          <MonitorSmartphone className="h-3 w-3 shrink-0" /> {perangkat}
        </p>
      )}
    </div>
  );
}

function RincianPengguna({
  tanggal,
  userId,
  onKembali,
}: {
  tanggal: string;
  userId: string;
  onKembali: () => void;
}) {
  const [data, setData] = useState<RincianAudit | null>(null);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    let hidup = true;
    getRincianAudit(tanggal, userId)
      .then((d) => {
        if (hidup) setData(d);
      })
      .catch((e) => {
        if (hidup) setGalat(e instanceof Error ? e.message : "Gagal memuat rincian");
      });
    return () => {
      hidup = false;
    };
  }, [tanggal, userId]);

  if (galat) {
    return (
      <GlassCard className="p-1">
        <EmptyState ikon={ShieldAlert} judul="Rincian gagal dimuat" keterangan={galat} labelAksi="Kembali" onAksi={onKembali} />
      </GlassCard>
    );
  }
  if (!data) {
    return (
      <div className="flex flex-col gap-3">
        <GlassSkeleton className="h-24 rounded-2xl" />
        <GlassSkeleton className="h-40 rounded-2xl" />
        <GlassSkeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const { pengguna: u, harian, aktivitas, unggahan } = data;
  const layar = Object.entries(harian?.layar ?? {}).sort((a, b) => b[1] - a[1]);
  const totalLayar = layar.reduce((n, [, d]) => n + d, 0) || 1;
  const login = aktivitas.filter((a) => a.jenis === "login");

  return (
    <div className="flex flex-col gap-3">
      {data.belum_siap && <BannerBelumSiap />}
      <GlassCard className="flex items-center gap-3 p-3.5">
        <span className="relative">
          <Foto nama={u.nama} src={u.avatar_url} ukuran={48} />
          {u.online && <span className="absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-white bg-sukses" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold text-teks-utama">{u.nama}</span>
          <span className="block truncate text-[11px] text-teks-sekunder">
            {[u.username ? `@${u.username}` : "", u.jabatan, u.divisi].filter(Boolean).join(" · ")}
          </span>
        </span>
      </GlassCard>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <KartuAngka ikon={Clock} label="Aplikasi menyala" nilai={durasi(harian?.detik_aktif ?? 0)} />
        <KartuAngka ikon={LogIn} label="Login" nilai={String(login.length)} />
        <KartuAngka ikon={MonitorSmartphone} label={`Sesi · ${jam(harian?.pertama)}–${jam(harian?.terakhir)}`} nilai={String(harian?.sesi.length ?? 0)} />
        <KartuAngka ikon={UploadCloud} label="Video diunggah" nilai={String(unggahan.length)} />
      </div>

      <GlassCard className="p-3.5">
        <p className="mb-2 text-[12.5px] font-bold text-teks-utama">Kapan aplikasinya menyala (WIB)</p>
        {harian && harian.sesi.length > 0 ? (
          <>
            <PitaSesi tanggal={tanggal} sesi={harian.sesi} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {harian.sesi.map(([a, b], i) => (
                <span key={i} className="rounded-md bg-black/5 px-1.5 py-0.5 text-[10.5px] font-semibold text-teks-utama dark:bg-white/10">
                  {jam(a)}–{jam(b)}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="text-[11.5px] text-teks-sekunder">Tidak ada catatan aplikasi menyala.</p>
        )}
      </GlassCard>

      {layar.length > 0 && (
        <GlassCard className="p-3.5">
          <p className="mb-2 text-[12.5px] font-bold text-teks-utama">Layar yang dipakai</p>
          <div className="flex flex-col gap-1.5">
            {layar.map(([k, d]) => (
              <div key={k}>
                <div className="flex justify-between text-[11px]">
                  <span className="font-semibold text-teks-utama">{labelLayarAudit(k)}</span>
                  <span className="angka-tab text-teks-sekunder">{durasi(d)}</span>
                </div>
                <div className="mt-0.5 h-1.5 rounded-full bg-black/5 dark:bg-white/10">
                  <div className="h-full rounded-full bg-pri/70" style={{ width: `${(100 * d) / totalLayar}%` }} />
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      <GlassCard className="p-3.5">
        <p className="mb-2 text-[12.5px] font-bold text-teks-utama">Linimasa aktivitas</p>
        {aktivitas.length === 0 ? (
          <p className="text-[11.5px] text-teks-sekunder">Belum ada aktivitas tercatat.</p>
        ) : (
          <ol className="flex flex-col">
            {aktivitas.map((p) => {
              const k = kelompokJenisAudit(p.jenis) ?? "akses";
              const Ikon = IKON_KELOMPOK[k];
              return (
                <li key={p.id} className="flex gap-2.5 border-b border-black/5 py-2 last:border-0 dark:border-white/5">
                  <span className="angka-tab w-10 shrink-0 pt-0.5 text-[11px] font-bold text-teks-sekunder">{jam(p.dibuat_pada)}</span>
                  <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", WARNA_KELOMPOK[k])}>
                    <Ikon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-bold text-teks-utama">{labelJenisAudit(p.jenis)}</span>
                    <span className="block text-[11px] text-teks-utama/85">{p.ringkasan}</span>
                    <IsiDetail p={p} />
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </GlassCard>

      <GlassCard className="p-3.5">
        <p className="mb-2 text-[12.5px] font-bold text-teks-utama">Video yang diunggah (TVR Saya)</p>
        {unggahan.length === 0 ? (
          <p className="text-[11.5px] text-teks-sekunder">Tidak ada unggahan hari ini.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {unggahan.map((v) => (
              <div key={v.id} className="rounded-xl bg-black/[0.03] p-2.5 dark:bg-white/5">
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 text-[12px] font-bold text-teks-utama">{v.judul}</p>
                  <span className="angka-tab shrink-0 text-[10.5px] text-teks-sekunder">
                    {jam(v.dibuat_pada)}
                    {v.jadwal ? ` → ${jam(v.jadwal)}` : ""}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {(v.platforms ?? []).map((pf) =>
                    v.tautan[pf] ? (
                      <a key={pf} href={v.tautan[pf]} target="_blank" rel="noopener noreferrer" aria-label={`Buka di ${pf}`} className="btn-tekan">
                        <PlatformIcon platform={pf} size={18} denganWadah />
                      </a>
                    ) : (
                      <span key={pf} className="opacity-45" title="Tautan belum tercatat">
                        <PlatformIcon platform={pf} size={18} denganWadah />
                      </span>
                    ),
                  )}
                  {v.video_url && (
                    <a
                      href={v.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto flex items-center gap-1 text-[10.5px] font-bold text-info"
                    >
                      <ExternalLink className="h-3 w-3" /> Berkas video
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}

// ------------------------------------------------------------
// Layar utama
// ------------------------------------------------------------

type Saring = "semua" | "online" | "video" | "unggah";

export function AuditScreen({ onKembali }: { onKembali: () => void }) {
  const [tanggal, setTanggal] = useState(tanggalWibHariIni);
  const [data, setData] = useState<RingkasanAudit | null>(null);
  const [muatUlang, setMuatUlang] = useState(0);
  // Permintaan mana yang sudah selesai — "memuat" diturunkan darinya
  // (tanpa setState sinkron di dalam effect).
  const kunciMuat = `${tanggal}:${muatUlang}`;
  const [selesaiUntuk, setSelesaiUntuk] = useState("");
  const memuat = selesaiUntuk !== kunciMuat;
  const [cari, setCari] = useState("");
  const [saring, setSaring] = useState<Saring>("semua");
  const [dipilih, setDipilih] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    const kunci = `${tanggal}:${muatUlang}`;
    getRingkasanAudit(tanggal)
      .then((d) => {
        if (hidup) setData(d);
      })
      .catch((e) => {
        if (hidup) toast("error", "Gagal memuat audit", e instanceof Error ? e.message : "");
      })
      .finally(() => {
        if (hidup) setSelesaiUntuk(kunci);
      });
    return () => {
      hidup = false;
    };
  }, [tanggal, muatUlang]);

  const baris = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return (data?.data ?? []).filter((b) => {
      if (q && !`${b.nama} ${b.username ?? ""} ${b.divisi} ${b.jabatan}`.toLowerCase().includes(q)) return false;
      if (saring === "online") return b.online;
      const kelompok = Object.keys(b.hitung).map(kelompokJenisAudit);
      if (saring === "video") return kelompok.includes("video");
      if (saring === "unggah") return b.unggahan > 0 || kelompok.includes("unggah");
      return true;
    });
  }, [data, cari, saring]);

  const total = useMemo(() => {
    const d = data?.data ?? [];
    let detik = 0;
    let video = 0;
    let unggah = 0;
    for (const b of d) {
      detik += b.detik_aktif;
      unggah += b.unggahan;
      for (const [j, n] of Object.entries(b.hitung)) if (kelompokJenisAudit(j) === "video") video += n;
    }
    return { aktif: d.length, detik, video, unggah };
  }, [data]);

  const namaDipilih = data?.data.find((b) => b.id === dipilih)?.nama;

  return (
    <div className="kolom-aplikasi px-4 pb-32">
      <ScreenHeader
        judul={dipilih ? `Audit · ${namaDipilih ?? "Pengguna"}` : "Audit Aktivitas"}
        onKembali={dipilih ? () => setDipilih(null) : onKembali}
        kanan={
          <button
            type="button"
            onClick={() => setMuatUlang((n) => n + 1)}
            aria-label="Muat ulang"
            className="glass btn-tekan flex h-10 w-10 items-center justify-center rounded-full text-teks-utama"
          >
            <RefreshCw className={cn("h-4.5 w-4.5", memuat && "animate-spin")} />
          </button>
        }
      />

      <div className="flex flex-col gap-3">
        <PemilihTanggal
          tanggal={tanggal}
          onUbah={(t) => {
            setTanggal(t);
          }}
        />
        <p className="-mt-1 text-center text-[11px] text-teks-sekunder">{tanggalIndonesia(`${tanggal}T12:00:00+07:00`)}</p>

        {dipilih ? (
          <RincianPengguna key={`${tanggal}-${dipilih}-${muatUlang}`} tanggal={tanggal} userId={dipilih} onKembali={() => setDipilih(null)} />
        ) : (
          <>
            {data?.belum_siap && <BannerBelumSiap />}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <KartuAngka ikon={Users} label={`Pengguna aktif · ${data?.online ?? 0} online`} nilai={String(total.aktif)} />
              <KartuAngka ikon={Clock} label="Total aplikasi menyala" nilai={durasi(total.detik)} />
              <KartuAngka ikon={Wand2} label="Pemakaian alat video" nilai={String(total.video)} />
              <KartuAngka ikon={UploadCloud} label="Video diunggah" nilai={String(total.unggah)} />
            </div>

            <label className="glass flex h-10 items-center gap-2 rounded-xl px-3">
              <Search className="h-4 w-4 shrink-0 text-teks-sekunder" aria-hidden="true" />
              <input
                value={cari}
                onChange={(e) => setCari(e.target.value)}
                placeholder="Cari nama, username, divisi…"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-teks-utama outline-none placeholder:text-teks-sekunder"
              />
            </label>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {(
                [
                  ["semua", "Semua"],
                  ["online", "Sedang online"],
                  ["video", "Pakai alat video"],
                  ["unggah", "Mengunggah"],
                ] as [Saring, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSaring(k)}
                  aria-pressed={saring === k}
                  className={cn(
                    "btn-tekan shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-bold",
                    saring === k ? "bg-pri text-white" : "glass text-teks-sekunder",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {memuat && !data ? (
              Array.from({ length: 5 }, (_, i) => <GlassSkeleton key={i} className="h-20 rounded-2xl" />)
            ) : baris.length === 0 ? (
              <GlassCard className="p-1">
                <EmptyState ikon={Users} judul="Tidak ada aktivitas" keterangan="Belum ada pengguna yang cocok untuk tanggal & saringan ini." />
              </GlassCard>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] text-teks-sekunder">{baris.length} pengguna · urut dari yang paling lama menyala</p>
                {baris.map((b) => (
                  <KartuPengguna key={b.id} b={b} onBuka={() => setDipilih(b.id)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function KartuPengguna({ b, onBuka }: { b: BarisAuditRingkas; onBuka: () => void }) {
  const chip = Object.entries(b.hitung).sort((x, y) => URUTAN_JENIS.indexOf(x[0]) - URUTAN_JENIS.indexOf(y[0]));
  return (
    <button type="button" onClick={onBuka} className="glass btn-tekan flex w-full flex-col gap-2 rounded-2xl p-3 text-left">
      <span className="flex w-full items-center gap-2.5">
        <span className="relative shrink-0">
          <Foto nama={b.nama} src={b.avatar_url} ukuran={38} />
          {b.online && <span className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-sukses" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold text-teks-utama">{b.nama}</span>
          <span className="block truncate text-[10.5px] text-teks-sekunder">
            {[b.jabatan, b.divisi].filter(Boolean).join(" · ") || (b.username ? `@${b.username}` : "")}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="angka-tab block font-heading text-[15px] font-extrabold text-teks-utama">{durasi(b.detik_aktif)}</span>
          <span className="angka-tab block text-[10px] text-teks-sekunder">
            {b.pertama ? `${jam(b.pertama)}–${jam(b.terakhir)}` : "tanpa waktu aktif"}
          </span>
        </span>
      </span>
      {(chip.length > 0 || b.unggahan > 0) && (
        <span className="flex flex-wrap gap-1">
          {chip.map(([j, n]) => (
            <ChipJenis key={j} jenis={j} jumlah={n} />
          ))}
          {b.unggahan > 0 && !b.hitung.unggah_sosmed && (
            <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-bold", WARNA_KELOMPOK.unggah)}>
              Unggahan TVR {b.unggahan}
            </span>
          )}
        </span>
      )}
    </button>
  );
}

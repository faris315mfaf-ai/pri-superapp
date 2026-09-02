"use client";

// ============================================================
// SiaranSerentak (3 Sep 2026) — master/Ketua Umum: satu video, sekali
// klik, terkirim ke banyak profil upload-post sekaligus (mis. 14 profil
// TV Jakarta). Alur: pilih video → judul/caption → centang platform →
// centang profil → kirim sekarang / jadwalkan. Server mengantre satu
// item per profil dan memprosesnya di latar; layar ini memantau status
// tiap profil (menunggu → terkirim/gagal) tiap 10 detik.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Check, Loader2, Radio, Search, Send, UploadCloud, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { PlatformIcon, labelPlatform } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import {
  batalSiaran,
  buatSiaran,
  getSiaran,
  getTvAnggotaDashboard,
  siapkanUnggahTvrku,
  type ProfilTvAnggota,
  type Siaran,
} from "@/services";
import { jamWIB } from "@/lib/format";
import { cn } from "@/lib/utils";

const PLATFORM6 = ["instagram", "tiktok", "youtube", "facebook", "threads", "twitter"] as const;
const MAKS_MB = 50;

type ProfilPilihan = { profil: string; nama: string; akun: Record<string, string> };

export function SiaranSerentak() {
  const [profilSemua, setProfilSemua] = useState<ProfilPilihan[] | null>(null);
  const [cari, setCari] = useState("");
  const [pilihProfil, setPilihProfil] = useState<Set<string>>(new Set());
  const [platform, setPlatform] = useState<Set<string>>(new Set(PLATFORM6));
  const [berkas, setBerkas] = useState<File | null>(null);
  const [judul, setJudul] = useState("");
  const [caption, setCaption] = useState("");
  const [pakaiJadwal, setPakaiJadwal] = useState(false);
  const [jadwal, setJadwal] = useState("");
  const [tahap, setTahap] = useState<"" | "unggah" | "kirim">("");
  const [persen, setPersen] = useState(0);
  const [daftar, setDaftar] = useState<Siaran[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Profil tujuan = semua profil upload-post yang dikenal aplikasi (+ akun tertaut).
  useEffect(() => {
    let hidup = true;
    getTvAnggotaDashboard()
      .then((d) => {
        if (!hidup) return;
        const dikenal: ProfilPilihan[] = (d.profil as ProfilTvAnggota[]).map((p) => ({
          profil: p.profil,
          nama: p.nama,
          akun: p.akun,
        }));
        const luar: ProfilPilihan[] = (d.belum_tertaut ?? []).map((p) => ({
          profil: p.profil,
          nama: "",
          akun: p.akun,
        }));
        setProfilSemua([...dikenal, ...luar].sort((a, b) => a.profil.localeCompare(b.profil)));
      })
      .catch(() => hidup && setProfilSemua([]));
    return () => {
      hidup = false;
    };
  }, []);

  function muatDaftar() {
    return getSiaran()
      .then(setDaftar)
      .catch(() => {});
  }
  useEffect(() => {
    let hidup = true;
    getSiaran()
      .then((d) => hidup && setDaftar(d))
      .catch(() => hidup && setDaftar([]));
    return () => {
      hidup = false;
    };
  }, []);
  // Pantau tiap 10 dtk selama masih ada item yang belum beres — tiap
  // panggilan GET juga melanjutkan pemrosesan di server.
  const adaBerjalan = (daftar ?? []).some((s) => s.ringkas.menunggu > 0);
  useEffect(() => {
    if (!adaBerjalan) return;
    const t = setInterval(() => {
      void muatDaftar();
    }, 10_000);
    return () => clearInterval(t);
  }, [adaBerjalan]);

  const tersaring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    const d = profilSemua ?? [];
    return q
      ? d.filter((p) => p.profil.toLowerCase().includes(q) || p.nama.toLowerCase().includes(q))
      : d;
  }, [profilSemua, cari]);

  function togglePlatform(p: string) {
    setPlatform((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  }
  function toggleProfil(p: string) {
    setPilihProfil((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  }
  function pilihSemuaTampil() {
    setPilihProfil((s) => {
      const n = new Set(s);
      const semuaDipilih = tersaring.every((p) => n.has(p.profil));
      for (const p of tersaring) {
        if (semuaDipilih) n.delete(p.profil);
        else n.add(p.profil);
      }
      return n;
    });
  }

  function pilihBerkas(f: File | null) {
    if (f && f.size > MAKS_MB * 1024 * 1024) {
      toast("peringatan", `Video ${Math.round(f.size / 1_048_576)} MB — maksimal ${MAKS_MB} MB`, "Kompres dulu.");
      if (inputRef.current) inputRef.current.value = "";
      setBerkas(null);
      return;
    }
    setBerkas(f);
  }

  const siapKirim =
    Boolean(berkas) && judul.trim().length >= 3 && platform.size > 0 && pilihProfil.size > 0 && !tahap;

  async function kirim() {
    if (!berkas || !siapKirim) return;
    try {
      setTahap("unggah");
      setPersen(0);
      const siap = await siapkanUnggahTvrku(berkas.name, berkas.size);
      await new Promise<void>((selesai, gagal) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", siap.url);
        xhr.setRequestHeader("content-type", berkas.type || "video/mp4");
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setPersen(Math.round((100 * ev.loaded) / ev.total));
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? selesai()
            : gagal(new Error("Penyimpanan video menolak berkas ini. Coba lagi."));
        xhr.onerror = () => gagal(new Error("Koneksi terputus saat mengunggah video. Coba lagi."));
        xhr.send(berkas);
      });

      setTahap("kirim");
      const r = await buatSiaran({
        ...(siap.cara === "r2" ? { r2_key: siap.r2_key } : { path: siap.path }),
        ukuran: berkas.size,
        judul: judul.trim(),
        caption: caption.trim() || undefined,
        platforms: [...platform],
        profil: [...pilihProfil],
        jadwal: pakaiJadwal && jadwal ? new Date(jadwal).toISOString() : undefined,
      });
      toast(
        "sukses",
        r.terjadwal ? "Siaran terjadwal" : "Siaran dimulai",
        `${r.jumlah - r.langsung_gagal} profil diantre${r.langsung_gagal ? `, ${r.langsung_gagal} langsung gagal (platform tak tertaut)` : ""}. Status per profil tampil di bawah.`,
      );
      setBerkas(null);
      setJudul("");
      setCaption("");
      setPakaiJadwal(false);
      setJadwal("");
      if (inputRef.current) inputRef.current.value = "";
      await muatDaftar();
    } catch (e) {
      toast("error", "Siaran gagal dibuat", e instanceof Error ? e.message : "");
    } finally {
      setTahap("");
      setPersen(0);
    }
  }

  async function batal(s: Siaran) {
    try {
      const r = await batalSiaran(s.id);
      toast("sukses", "Siaran dibatalkan", `${r.dibatalkan} profil yang belum terkirim dibatalkan.`);
      await muatDaftar();
    } catch (e) {
      toast("error", "Gagal membatalkan", e instanceof Error ? e.message : "");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <GlassCard className="p-4">
        <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-teks-utama">
          <Radio className="h-4 w-4 text-pri" /> Siaran Serentak
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-teks-sekunder">
          Satu video terkirim ke semua profil yang dicentang, masing-masing ke sosmed yang
          sudah tertaut di profil itu. Diproses berurutan di latar — beberapa menit untuk belasan
          profil; statusnya tampil per profil.
        </p>

        {/* Berkas */}
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          className="hidden"
          onChange={(e) => pilihBerkas(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={Boolean(tahap)}
          className="glass btn-tekan mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-5 text-[13px] font-bold text-teks-utama disabled:opacity-60"
        >
          <UploadCloud className="h-5 w-5 text-pri" />
          {berkas ? `${berkas.name} (${Math.round(berkas.size / 1_048_576)} MB)` : "Pilih Video"}
        </button>
        <p className="mt-1 text-[10.5px] text-teks-sekunder">Maksimal {MAKS_MB} MB (MP4/MOV/WebM).</p>

        <input
          value={judul}
          onChange={(e) => setJudul(e.target.value)}
          maxLength={100}
          placeholder="Judul video (wajib)"
          disabled={Boolean(tahap)}
          className="glass-input mt-3 h-11 w-full rounded-xl px-3 text-sm text-teks-utama"
        />
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={3}
          maxLength={2200}
          placeholder="Caption (opsional) — dipakai di semua profil"
          disabled={Boolean(tahap)}
          className="glass-input mt-2 w-full rounded-xl px-3 py-2 text-sm text-teks-utama"
        />

        {/* Platform */}
        <p className="mt-3 text-[11px] font-semibold text-teks-sekunder">Sosmed tujuan:</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {PLATFORM6.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => togglePlatform(p)}
              aria-pressed={platform.has(p)}
              disabled={Boolean(tahap)}
              className={cn(
                "btn-tekan flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold",
                platform.has(p) ? "text-white" : "glass text-teks-sekunder",
              )}
              style={platform.has(p) ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" } : undefined}
            >
              <PlatformIcon platform={p} size={12} />
              {labelPlatform(p)}
            </button>
          ))}
        </div>

        {/* Profil tujuan */}
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold text-teks-sekunder">
            Profil tujuan ({pilihProfil.size} dipilih):
          </p>
          <button
            type="button"
            onClick={pilihSemuaTampil}
            disabled={Boolean(tahap) || tersaring.length === 0}
            className="btn-tekan text-[11px] font-bold text-pri"
          >
            {tersaring.length > 0 && tersaring.every((p) => pilihProfil.has(p.profil))
              ? "Batal pilih yang tampil"
              : `Pilih semua yang tampil (${tersaring.length})`}
          </button>
        </div>
        <div className="glass-input mt-1.5 flex h-10 items-center gap-2 rounded-xl px-3">
          <Search className="h-4 w-4 text-teks-sekunder" aria-hidden="true" />
          <input
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Saring: mis. tvjakarta"
            className="h-full w-full bg-transparent text-sm text-teks-utama outline-none"
          />
        </div>
        {profilSemua === null ? (
          <GlassSkeleton className="mt-2 h-24 rounded-xl" />
        ) : (
          <div className="scrollbar-tipis mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto">
            {tersaring.map((p) => {
              const aktif = pilihProfil.has(p.profil);
              const cocok = [...platform].filter((x) => p.akun[x]).length;
              return (
                <button
                  key={p.profil}
                  type="button"
                  onClick={() => toggleProfil(p.profil)}
                  aria-pressed={aktif}
                  disabled={Boolean(tahap)}
                  className={cn(
                    "btn-tekan flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left",
                    aktif ? "bg-pri/10" : "hover:bg-black/[0.03] dark:hover:bg-white/[0.05]",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                      aktif ? "border-pri bg-pri text-white" : "border-black/20 dark:border-white/25",
                    )}
                  >
                    {aktif && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-teks-utama">{p.profil}</span>
                    <span className="mt-0.5 flex items-center gap-1">
                      {PLATFORM6.map((pf) => (
                        <PlatformIcon
                          key={pf}
                          platform={pf}
                          className={cn("h-3 w-3", p.akun[pf] ? "text-emerald-500" : "text-teks-sekunder/30")}
                        />
                      ))}
                      {p.nama ? <span className="ml-1 truncate text-[10px] text-teks-sekunder">{p.nama}</span> : null}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "angka-tab shrink-0 text-[10.5px] font-bold",
                      cocok > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-gagal",
                    )}
                  >
                    {cocok} tujuan
                  </span>
                </button>
              );
            })}
            {tersaring.length === 0 && (
              <p className="px-2 py-3 text-center text-[11px] text-teks-sekunder">Tidak ada profil cocok.</p>
            )}
          </div>
        )}

        {/* Jadwal */}
        <label className="mt-3 flex items-center gap-2 text-[12px] text-teks-utama">
          <input
            type="checkbox"
            checked={pakaiJadwal}
            onChange={(e) => setPakaiJadwal(e.target.checked)}
            disabled={Boolean(tahap)}
            className="h-4 w-4 accent-[#DC2626]"
          />
          <CalendarClock className="h-4 w-4 text-pri" />
          Jadwalkan (minimal 5 menit dari sekarang, maksimal 7 hari)
        </label>
        {pakaiJadwal && (
          <input
            type="datetime-local"
            value={jadwal}
            onChange={(e) => setJadwal(e.target.value)}
            disabled={Boolean(tahap)}
            className="glass-input mt-2 h-11 w-full rounded-xl px-3 text-sm text-teks-utama"
          />
        )}

        <button
          type="button"
          onClick={() => void kirim()}
          disabled={!siapKirim}
          className="btn-tekan mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[13.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
        >
          {tahap ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {tahap === "unggah"
            ? `Mengunggah video… ${persen}%`
            : tahap === "kirim"
              ? "Mengantre ke profil…"
              : pakaiJadwal
                ? `Jadwalkan ke ${pilihProfil.size} profil`
                : `Kirim sekarang ke ${pilihProfil.size} profil`}
        </button>
      </GlassCard>

      {/* Riwayat siaran + status per profil */}
      {daftar === null ? (
        <GlassSkeleton className="h-20 rounded-2xl" />
      ) : daftar.length > 0 ? (
        <div className="flex flex-col gap-2">
          {daftar.map((s) => (
            <GlassCard key={s.id} className="p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-bold text-teks-utama">{s.judul}</p>
                  <p className="mt-0.5 text-[10.5px] text-teks-sekunder">
                    {jamWIB(s.dibuat_pada)}
                    {s.jadwal ? ` · jadwal ${jamWIB(s.jadwal)}` : ""} · {s.ringkas.terkirim}/{s.ringkas.total} terkirim
                    {s.ringkas.gagal ? ` · ${s.ringkas.gagal} gagal` : ""}
                    {s.ringkas.menunggu ? ` · ${s.ringkas.menunggu} menunggu` : ""}
                  </p>
                </div>
                {s.ringkas.menunggu > 0 ? (
                  <button
                    type="button"
                    onClick={() => void batal(s)}
                    className="btn-tekan flex items-center gap-1 rounded-full bg-gagal/12 px-2.5 py-1 text-[10.5px] font-bold text-gagal"
                  >
                    <X className="h-3 w-3" /> Batalkan sisanya
                  </button>
                ) : (
                  <StatusBadge
                    label={s.status === "dibatalkan" ? "dibatalkan" : s.ringkas.gagal > 0 ? "selesai, ada gagal" : "selesai"}
                    warna={s.status === "dibatalkan" ? "netral" : s.ringkas.gagal > 0 ? "kuning" : "hijau"}
                  />
                )}
              </div>
              <div className="mt-2 flex flex-col gap-1">
                {s.item.map((it) => (
                  <div key={it.id} className="flex items-center gap-2 rounded-lg bg-black/[0.03] px-2 py-1.5 dark:bg-white/[0.05]">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px] font-semibold text-teks-utama">
                        {it.profil}
                        {it.nama ? <span className="font-normal text-teks-sekunder"> · {it.nama}</span> : null}
                      </span>
                      <span className="flex items-center gap-1">
                        {it.platforms.map((pf) => (
                          <PlatformIcon key={pf} platform={pf} className="h-3 w-3 text-teks-sekunder" />
                        ))}
                        {it.pesan && it.status !== "terkirim" ? (
                          <span className="ml-1 truncate text-[10px] text-gagal">{it.pesan}</span>
                        ) : null}
                      </span>
                    </span>
                    <StatusBadge
                      label={
                        it.status === "terkirim"
                          ? it.pesan === "Terjadwal"
                            ? "terjadwal"
                            : "terkirim"
                          : it.status === "diproses"
                            ? "mengirim…"
                            : it.status
                      }
                      warna={
                        it.status === "terkirim"
                          ? "hijau"
                          : it.status === "gagal"
                            ? "merah"
                            : it.status === "dibatalkan"
                              ? "netral"
                              : "kuning"
                      }
                      berkedip={it.status === "diproses"}
                    />
                  </div>
                ))}
              </div>
            </GlassCard>
          ))}
        </div>
      ) : null}
    </div>
  );
}

"use client";

// ============================================================
// Stok Video TVR Saya (5 Okt 2026) — dipisah dari Edit Otomatis dan
// terbuka untuk SEMUA akun TVR Saya.
//
// Cara posting baru: video jadi DITAHAN dulu di stok, baru dikirim ke sosmed.
//   • Isi stok: hasil Edit Otomatis (masuk sendiri) atau "Tambah Video"
//     dari perangkat (video jadi, tanpa diedit).
//   • Tiap item: Lihat, Upload (form upload-post), Unduh, Hapus. Yang sudah
//     terkirim diberi tanda centang, tidak dihapus.
//   • Disimpan sementara (umur_simpan_jam, bawaan 48 jam) lalu terhapus
//     sendiri; jumlah & kuota per akun dibatasi mesin.
// Datanya dari layanan TVR di mesin video (/api/tvr/stok lewat gerbang
// /api/autoedit), jalur yang terbuka untuk semua akun TVR Saya.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  Clock,
  Download,
  Eye,
  Film,
  HardDrive,
  Loader2,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  UploadCloud,
  Wand2,
  X,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import { useRefTabAktif } from "@/hooks/use-tab-aktif";
import { cn } from "@/lib/utils";
import { bacaJson, pesanGalat } from "@/features/auto-edit/api";
import { useApiAutoEdit } from "@/features/auto-edit/tim";
import { UnggahSosmedSaya } from "./unggah-sosmed-saya";
import {
  STATUS_AKTIF,
  akhiranBerkas,
  tanggalRingkas,
  ukuranMb,
  type BatasTvr,
  type JobTvr,
  type RingkasTvr,
  type StokTvr,
} from "./edit-otomatis-tipe";

/** Peristiwa global: Edit Otomatis meminta Stok memuat ulang (video baru dikirim / selesai). */
export const PERISTIWA_STOK_SEGAR = "pri:stok-tvr-segar";

export function segarkanStokTvr(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(PERISTIWA_STOK_SEGAR));
}

type KeadaanStok = {
  stok: StokTvr[];
  job: JobTvr | null;
  maks_stok?: number;
  kuota?: RingkasTvr["kuota"];
};

const MAKS_STOK_BAWAAN = 50;

export function StokVideoTvr({
  onKirimOfficial,
}: {
  /** Stok Video Tim: kirim item ke antrean TV Rakyat Official (pratinjau unggah). */
  onKirimOfficial?: (item: StokTvr) => Promise<void>;
} = {}) {
  const api = useApiAutoEdit();
  const [batas, setBatas] = useState<BatasTvr | null>(null);
  const [data, setData] = useState<KeadaanStok | null>(null);
  const [galatMuat, setGalatMuat] = useState("");
  const [muatUlang, setMuatUlang] = useState(0);
  const [pesan, setPesan] = useState("");
  const [hapusId, setHapusId] = useState("");
  const [unduhId, setUnduhId] = useState("");
  const [persenStok, setPersenStok] = useState<number | null>(null);
  // Item yang sedang dilanjutkan ke upload-post (video diambil sebagai blob).
  const [unggahItem, setUnggahItem] = useState<{ id: string; judul: string; file: File } | null>(null);
  // id item yang videonya sedang ditarik (untuk lihat/upload); menahan aksi ganda.
  const [menyiapkan, setMenyiapkan] = useState("");
  const [lihat, setLihat] = useState<{ item: StokTvr; url: string } | null>(null);
  const tabAktifRef = useRefTabAktif();
  const inputStokRef = useRef<HTMLInputElement>(null);

  const terapkan = useCallback((d: Record<string, unknown>) => {
    setData((lama) => ({
      stok: (d.stok as StokTvr[]) ?? lama?.stok ?? [],
      job: (d.job as JobTvr | null) ?? null,
      maks_stok: (d.maks_stok as number | undefined) ?? lama?.maks_stok,
      kuota: (d.kuota as RingkasTvr["kuota"]) ?? lama?.kuota,
    }));
  }, []);

  // Muat awal: ringkasan sekali (batas berkas + stok + job).
  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const res = await api.fetch("/api/tvr/ringkas", { cache: "no-store" });
        const d = await bacaJson(res);
        if (!res.ok) throw new Error(pesanGalat(res.status, d, "Stok video gagal dimuat."));
        if (!hidup) return;
        setBatas((d as RingkasTvr).batas);
        terapkan(d);
        setGalatMuat("");
      } catch (e) {
        if (hidup) setGalatMuat(e instanceof Error ? e.message : "Stok video gagal dimuat.");
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muatUlang, terapkan]);

  const segarStok = useCallback(async () => {
    try {
      const res = await api.fetch("/api/tvr/stok", { cache: "no-store" });
      if (!res.ok) return;
      terapkan(await bacaJson(res));
    } catch {
      // Jaringan putus sesaat — dicoba lagi pada pemicu berikutnya.
    }
  }, [terapkan]);

  // Edit Otomatis memberi tahu ada video baru diantrekan / selesai.
  useEffect(() => {
    const segar = () => void segarStok();
    window.addEventListener(PERISTIWA_STOK_SEGAR, segar);
    return () => window.removeEventListener(PERISTIWA_STOK_SEGAR, segar);
  }, [segarStok]);

  // Selama ada video yang sedang diedit, stok dipantau tiap 4 detik supaya
  // hasilnya muncul sendiri begitu jadi.
  const jobAktif = data?.job && STATUS_AKTIF.includes(data.job.status) ? data.job.job_id : null;
  useEffect(() => {
    if (!jobAktif) return;
    let sedang = false;
    const t = window.setInterval(async () => {
      if (sedang || document.visibilityState !== "visible" || !tabAktifRef.current) return;
      sedang = true;
      await segarStok();
      sedang = false;
    }, 4000);
    return () => window.clearInterval(t);
  }, [jobAktif, segarStok, tabAktifRef]);

  if (galatMuat && !data) {
    return (
      <GlassCard className="p-4" dataTur={api.tim ? undefined : "tvr-stok"}>
        <p className="text-[12.5px] text-teks-utama">{galatMuat}</p>
        <button
          type="button"
          onClick={() => setMuatUlang((n) => n + 1)}
          className="glass btn-tekan mt-2 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-bold text-teks-utama"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Coba lagi
        </button>
      </GlassCard>
    );
  }
  if (!data || !batas) return <GlassSkeleton className="h-40 rounded-2xl" />;

  const { stok } = data;
  const maksStok = data.maks_stok ?? MAKS_STOK_BAWAAN;
  const umurHari = Math.max(1, Math.round(batas.umur_simpan_jam / 24));

  async function tambahStok(file: File | null) {
    if (!file || persenStok !== null || !batas) return;
    if (!batas.jenis_sumber.includes(akhiranBerkas(file.name))) {
      setPesan(`Video harus ${batas.jenis_sumber.map((j) => j.slice(1).toUpperCase()).join(", ")}.`);
      return;
    }
    if (file.size > batas.maks_sumber_mb * 1024 * 1024) {
      setPesan(`Video melebihi ${batas.maks_sumber_mb} MB.`);
      return;
    }
    setPesan("");
    setPersenStok(0);
    try {
      const { ok, status, data: d } = await api.unggah("/api/tvr/stok", file, setPersenStok);
      if (!ok) throw new Error(pesanGalat(status, d, "Gagal menambah ke stok."));
      terapkan(d);
      toast("sukses", "Masuk stok", api.tim ? "Video tersimpan di Stok Video Tim." : "Ketuk videonya lalu pilih Upload untuk memposting.");
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Gagal menambah ke stok.");
    } finally {
      setPersenStok(null);
    }
  }

  /** Tarik video penuh satu item (blob → File). */
  async function ambilBerkas(item: StokTvr): Promise<File> {
    const res = await api.fetch(`/api/tvr/stok/${item.id}/berkas`, { cache: "no-store" });
    if (!res.ok) throw new Error(pesanGalat(res.status, await bacaJson(res), "Video gagal diambil."));
    const blob = await res.blob();
    return new File([blob], `${item.judul || "video"}.mp4`, { type: "video/mp4" });
  }

  async function lihatPreview(item: StokTvr) {
    if (menyiapkan) return;
    setMenyiapkan(item.id);
    setPesan("");
    try {
      const file = await ambilBerkas(item);
      setLihat({ item, url: URL.createObjectURL(file) });
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Video gagal diambil.");
    } finally {
      setMenyiapkan("");
    }
  }

  function tutupLihat() {
    setLihat((l) => {
      if (l) URL.revokeObjectURL(l.url);
      return null;
    });
  }

  async function unggahDari(item: StokTvr) {
    if (menyiapkan) return;
    setMenyiapkan(item.id);
    setPesan("");
    try {
      const file = await ambilBerkas(item);
      setUnggahItem({ id: item.id, judul: item.judul, file });
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Video gagal diambil.");
    } finally {
      setMenyiapkan("");
    }
  }

  async function kirimOfficial(item: StokTvr) {
    if (!onKirimOfficial || menyiapkan) return;
    setMenyiapkan(item.id);
    setPesan("");
    try {
      await onKirimOfficial(item);
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Video gagal dikirim ke akun Official.");
    } finally {
      setMenyiapkan("");
    }
  }

  async function unduhDari(item: StokTvr) {
    if (unduhId) return;
    setUnduhId(item.id);
    setPesan("");
    try {
      const file = await ambilBerkas(item);
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Video gagal diunduh.");
    } finally {
      setUnduhId("");
    }
  }

  async function hapusStok(id: string) {
    if (hapusId) return;
    setHapusId(id);
    try {
      const res = await api.fetch(`/api/tvr/stok/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(pesanGalat(res.status, await bacaJson(res), "Gagal menghapus."));
      setData((d) => (d ? { ...d, stok: d.stok.filter((s) => s.id !== id) } : d));
      if (lihat?.item.id === id) tutupLihat();
      void segarStok(); // kuota terpakai ikut turun
    } catch (e) {
      toast("error", "Gagal", e instanceof Error ? e.message : "Coba lagi.");
    } finally {
      setHapusId("");
    }
  }

  /** Tandai item sudah dikirim ke sosmed (TIDAK dihapus — tetap di stok). */
  async function tandaiTerunggah(id: string) {
    try {
      const res = await api.fetch(`/api/tvr/stok/${id}/terunggah`, { method: "POST" });
      if (!res.ok) throw new Error(pesanGalat(res.status, await bacaJson(res), "Gagal menandai."));
      terapkan(await bacaJson(res));
    } catch {
      // Tanda gagal tersimpan bukan hal kritis; status upload-post sudah aman.
    }
  }

  const kepala = (
    <div className="flex items-center gap-3">
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
        style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
        aria-hidden="true"
      >
        <Film className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-heading text-[14px] font-bold text-teks-utama">{api.tim ? "Stok Video Tim" : "Stok Video"}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-teks-sekunder">
          {api.tim
            ? "Dipakai bersama seluruh tim TV Rakyat Official. Ketuk video lalu Official untuk mengunggahnya ke akun TV Rakyat Official."
            : "Video jadi ditahan di sini dulu, lalu diposting ke sosmed dari sini."}
        </p>
      </div>
    </div>
  );

  // Form upload-post untuk satu item stok.
  if (unggahItem) {
    return (
      <GlassCard className="p-4" dataTur={api.tim ? undefined : "tvr-stok"}>
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setUnggahItem(null)}
            className="glass btn-tekan flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-teks-sekunder"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Kembali
          </button>
          <p className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-teks-utama">Upload: {unggahItem.judul}</p>
        </div>
        <UnggahSosmedSaya
          key={unggahItem.id}
          berkasAwal={unggahItem.file}
          hanyaForm
          onTerkirim={() => {
            // Terkirim ke sosmed: DIBERI TANDA, tidak dihapus dari stok.
            const id = unggahItem.id;
            setUnggahItem(null);
            void tandaiTerunggah(id);
          }}
        />
      </GlassCard>
    );
  }

  const kuota = data.kuota;
  const persenKuota =
    kuota && kuota.dipakai_mb !== null && kuota.batas_mb > 0 ? Math.min(100, Math.round((100 * kuota.dipakai_mb) / kuota.batas_mb)) : null;

  return (
    <GlassCard className="p-4" dataTur={api.tim ? undefined : "tvr-stok"}>
      {kepala}

      {/* Aturan penyimpanan — ringkas, selalu terlihat */}
      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center" data-tur="tvr-stok-aturan">
        <InfoAturan ikon={<Film className="h-3.5 w-3.5" />} nilai={`${stok.length}/${maksStok}`} label="video" />
        <InfoAturan ikon={<Clock className="h-3.5 w-3.5" />} nilai={`${umurHari} hari`} label="lalu terhapus" />
        <InfoAturan ikon={<UploadCloud className="h-3.5 w-3.5" />} nilai={`${batas.maks_sumber_mb} MB`} label="maks per video" />
      </div>
      {kuota && (
        <div className="mt-2">
          <p className="flex items-center gap-1.5 text-[10.5px] text-teks-sekunder">
            <HardDrive className="h-3 w-3" />
            Penyimpanan terpakai {kuota.dipakai_mb ?? "…"} MB dari{" "}
            {kuota.batas_mb >= 1024 ? `${Math.round((kuota.batas_mb / 1024) * 10) / 10} GB` : `${kuota.batas_mb} MB`}
          </p>
          {persenKuota !== null && (
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div
                className={cn("h-full rounded-full", persenKuota >= 90 ? "bg-gagal" : persenKuota >= 70 ? "bg-amber-500" : "bg-sukses")}
                style={{ width: `${Math.max(2, persenKuota)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {jobAktif && (
        <p className="mt-3 flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 p-2.5 text-[11.5px] text-teks-utama">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-500" />
          Satu video sedang diedit otomatis — begitu jadi, ia masuk ke stok ini sendiri.
        </p>
      )}

      <input
        ref={inputStokRef}
        type="file"
        accept={batas.jenis_sumber.join(",")}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = "";
          void tambahStok(f);
        }}
      />
      <button
        type="button"
        data-tur={api.tim ? undefined : "tvr-stok-tambah"}
        onClick={() => inputStokRef.current?.click()}
        disabled={persenStok !== null || stok.length >= maksStok}
        className="btn-tekan mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-bold text-white disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
      >
        {persenStok !== null ? (
          <>
            <Loader2 className="h-4.5 w-4.5 animate-spin" /> Mengunggah ke stok… {persenStok}%
          </>
        ) : (
          <>
            <Plus className="h-4.5 w-4.5" /> Tambah Video dari Perangkat
          </>
        )}
      </button>
      {stok.length >= maksStok && (
        <p className="mt-1.5 text-center text-[10.5px] text-gagal">Stok penuh. Hapus video yang sudah tidak dipakai dulu.</p>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
        <Film className="h-3.5 w-3.5" /> Daftar stok ({stok.length})
      </p>
      {stok.length === 0 ? (
        <p className="mt-2 text-[11.5px] leading-relaxed text-teks-sekunder">
          Belum ada video. Tambah video jadi dari perangkat, atau hasil Edit Otomatis akan masuk ke sini sendiri.
          Video disimpan {batas.umur_simpan_jam} jam ({umurHari} hari) lalu terhapus otomatis.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {stok.map((it, i) => (
            <StokItem
              key={it.id}
              item={it}
              tandaTur={i === 0 && !api.tim ? "tvr-stok-item" : undefined}
              bolehUpload={!api.tim || Boolean(onKirimOfficial)}
              labelUpload={api.tim ? "Official" : "Upload"}
              menyiapkan={menyiapkan}
              hapusId={hapusId}
              unduhId={unduhId}
              onLihat={(x) => void lihatPreview(x)}
              onUpload={(x) => void (api.tim ? kirimOfficial(x) : unggahDari(x))}
              onUnduh={(x) => void unduhDari(x)}
              onHapus={(id) => void hapusStok(id)}
            />
          ))}
        </ul>
      )}

      {pesan && (
        <p className="mt-3 rounded-xl border border-gagal/30 bg-gagal/10 p-2.5 text-[11.5px] text-teks-utama" role="alert">
          {pesan}
        </p>
      )}

      {/* Pratinjau BESAR — di-portal ke body: GlassCard pakai backdrop-filter
          yang membuat position:fixed relatif ke kartu, bukan layar. */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {lihat && (
              <motion.div
                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                onClick={tutupLihat}
              >
                <motion.div
                  className="relative w-full max-w-[340px]"
                  initial={{ scale: 0.86, opacity: 0, y: 12 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 8 }}
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <video
                    src={lihat.url}
                    controls
                    autoPlay
                    playsInline
                    className="aspect-[9/16] max-h-[80vh] w-full rounded-2xl bg-black shadow-2xl"
                  />
                  <p className="mt-2 truncate text-center text-[12px] font-bold text-white/90">{lihat.item.judul}</p>
                  <button
                    type="button"
                    onClick={tutupLihat}
                    aria-label="Tutup"
                    className="btn-tekan absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-teks-utama shadow-lg"
                  >
                    <X className="h-4.5 w-4.5" />
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </GlassCard>
  );
}

function InfoAturan({ ikon, nilai, label }: { ikon: React.ReactNode; nilai: string; label: string }) {
  return (
    <div className="glass-soft rounded-xl px-1.5 py-2">
      <p className="flex items-center justify-center gap-1 text-[12.5px] font-extrabold text-teks-utama">
        <span className="text-pri">{ikon}</span>
        {nilai}
      </p>
      <p className="mt-0.5 text-[9.5px] leading-tight text-teks-sekunder">{label}</p>
    </div>
  );
}

// Satu item stok: thumbnail (ditarik sendiri), klik baris -> opsi mengembang.
type StokItemProps = {
  item: StokTvr;
  /** Tampilkan tombol kirim (Upload pribadi / Official untuk tim). */
  bolehUpload: boolean;
  labelUpload: string;
  tandaTur?: string;
  menyiapkan: string;
  hapusId: string;
  unduhId: string;
  onLihat: (it: StokTvr) => void;
  onUpload: (it: StokTvr) => void;
  onUnduh: (it: StokTvr) => void;
  onHapus: (id: string) => void;
};

function StokItem(q: StokItemProps) {
  const api = useApiAutoEdit();
  const { item } = q;
  const [thumb, setThumb] = useState("");
  const [terbuka, setTerbuka] = useState(false);
  const [konfirmHapus, setKonfirmHapus] = useState(false);

  // Thumbnail butuh token (lewat gerbang), jadi diambil sebagai blob.
  useEffect(() => {
    let hidup = true;
    let url = "";
    void (async () => {
      try {
        const res = await api.fetch(`/api/tvr/stok/${item.id}/thumb`, { cache: "no-store" });
        if (!res.ok) return;
        const blob = await res.blob();
        if (!hidup) return;
        url = URL.createObjectURL(blob);
        setThumb(url);
      } catch {
        // thumbnail opsional - jatuh ke ikon bawaan
      }
    })();
    return () => {
      hidup = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [item.id]);

  const sibuk = q.menyiapkan === item.id; // sedang menarik video (lihat/upload)
  const mengunduh = q.unduhId === item.id;
  const menghapus = q.hapusId === item.id;

  return (
    <li className="glass-soft overflow-hidden rounded-xl" data-tur={q.tandaTur}>
      <button
        type="button"
        onClick={() => setTerbuka((v) => !v)}
        className="btn-tekan flex w-full items-center gap-2.5 p-2.5 text-left"
      >
        <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-black/80">
          {thumb ? (
            <img src={thumb} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-white/60">
              {item.sumber === "unggah" ? <UploadCloud className="h-4 w-4" /> : <Wand2 className="h-4 w-4" />}
            </span>
          )}
          {item.terunggah && (
            <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-sukses text-white shadow">
              <Check className="h-2.5 w-2.5" />
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-bold text-teks-utama">{item.judul}</p>
          <p className="text-[10.5px] text-teks-sekunder">
            {[
              item.terunggah
                ? "Terunggah"
                : item.sumber === "kompres"
                  ? item.hemat_persen && item.hemat_persen > 0
                    ? `Hasil kompres · hemat ${item.hemat_persen}%`
                    : "Hasil kompres · sudah efisien"
                  : item.sumber === "blur"
                    ? "Hasil blur watermark"
                    : item.sumber === "unggah"
                      ? "Dari perangkat"
                      : "Hasil Edit Otomatis",
              tanggalRingkas(item.tanggal),
              item.durasi ? `${Math.round(item.durasi)} dtk` : "",
              ukuranMb(item.size),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-teks-sekunder transition-transform", terbuka && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {terbuka && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 480, damping: 40, mass: 0.7 }}
            className="overflow-hidden"
          >
            <div className="px-2.5 pb-2.5">
              {konfirmHapus ? (
                <div className="rounded-xl border border-gagal/30 bg-gagal/10 p-2.5">
                  <p className="text-[11.5px] font-bold text-teks-utama">Hapus video ini dari stok?</p>
                  <p className="mt-0.5 text-[10.5px] text-teks-sekunder">Tindakan ini tidak bisa dibatalkan.</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setKonfirmHapus(false)}
                      disabled={menghapus}
                      className="glass btn-tekan flex-1 rounded-lg py-1.5 text-[11.5px] font-bold text-teks-utama disabled:opacity-50"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={() => q.onHapus(item.id)}
                      disabled={menghapus}
                      className="btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gagal py-1.5 text-[11.5px] font-bold text-white disabled:opacity-50"
                    >
                      {menghapus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Hapus
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={cn("grid gap-1.5", q.bolehUpload ? "grid-cols-4" : "grid-cols-3")}
                  data-tur={q.tandaTur ? "tvr-stok-aksi" : undefined}
                >
                  <AksiStok ikon={<Eye className="h-4 w-4" />} label="Lihat" onClick={() => q.onLihat(item)} loading={sibuk} />
                  {q.bolehUpload && (
                    <AksiStok ikon={<Send className="h-4 w-4" />} label={q.labelUpload} onClick={() => q.onUpload(item)} loading={sibuk} utama />
                  )}
                  <AksiStok ikon={<Download className="h-4 w-4" />} label="Unduh" onClick={() => q.onUnduh(item)} loading={mengunduh} />
                  <AksiStok ikon={<Trash2 className="h-4 w-4" />} label="Hapus" onClick={() => setKonfirmHapus(true)} danger />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function AksiStok({
  ikon,
  label,
  onClick,
  loading,
  utama,
  danger,
}: {
  ikon: React.ReactNode;
  label: string;
  onClick: () => void;
  loading?: boolean;
  utama?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={cn(
        "btn-tekan flex h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10.5px] font-bold disabled:opacity-50",
        utama ? "text-white" : danger ? "glass text-gagal" : "glass text-teks-utama",
      )}
      style={utama ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" } : undefined}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : ikon}
      {label}
    </button>
  );
}

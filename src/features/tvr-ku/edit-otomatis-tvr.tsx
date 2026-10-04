"use client";

// ============================================================
// Edit Otomatis TVR Saya — dua sub fitur: TEMPLATE dan BUAT VIDEO.
//
//   1. Template: tombol + (belum punya) / pensil (sudah ada). Satu akun satu
//      template; bahan baru menggantikan yang lama. Buat Video baru muncul
//      setelah template ditetapkan.
//   2. Buat Video: sumber (unggah sendiri / link) + tulisan berita + kategori
//      (badge NEWS/HIBURAN, per video). Template terpasang otomatis. Satu
//      render per akun; sisanya mengantre.
//   3. Stok: begitu video jadi, ia masuk Stok (disimpan ~2 hari lalu terhapus
//      sendiri). Stok juga bisa diisi UNGGAH MANUAL (video jadi, tanpa diedit).
//      Tiap item: judul, tanggal, durasi, ukuran. Dari sini video dikirim ke
//      sosmed (upload-post) atau dihapus.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronLeft,
  Clapperboard,
  Download,
  Film,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
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
import { apiFetch, apiUnggah, bacaJson, pesanGalat } from "@/features/auto-edit/api";
import { TemplateTvrModal } from "./template-tvr-modal";
import { UnggahSosmedSaya } from "./unggah-sosmed-saya";
import {
  STATUS_AKTIF,
  akhiranBerkas,
  perkiraanWaktu,
  tanggalRingkas,
  ukuranMb,
  type JobTvr,
  type KeadaanTemplateTvr,
  type RingkasTvr,
  type StokTvr,
} from "./edit-otomatis-tipe";

type Unggahan = { url: string; name: string; size?: number; duration?: number | null };

export function EditOtomatisTvr() {
  const [data, setData] = useState<RingkasTvr | null>(null);
  const [galatMuat, setGalatMuat] = useState("");
  const [muatUlang, setMuatUlang] = useState(0);
  const [bukaTemplate, setBukaTemplate] = useState(false);

  // Form Buat Video
  const [modeSumber, setModeSumber] = useState<"unggah" | "link">("unggah");
  const [link, setLink] = useState("");
  const [unggahan, setUnggahan] = useState<Unggahan | null>(null);
  const [persenSumber, setPersenSumber] = useState<number | null>(null);
  const [hook, setHook] = useState("");
  const [teksSumber, setTeksSumber] = useState("");
  const [kategori, setKategori] = useState("");
  const [naskah, setNaskah] = useState("");
  const [bukaNaskah, setBukaNaskah] = useState(false);
  const [membuatHook, setMembuatHook] = useState(false);
  const [mengirim, setMengirim] = useState(false);
  const [pesan, setPesan] = useState("");

  // Stok
  const [membatalkan, setMembatalkan] = useState(false);
  const [hapusId, setHapusId] = useState("");
  const [persenStok, setPersenStok] = useState<number | null>(null);
  // Item yang sedang dilanjutkan ke upload-post (video diambil sebagai blob).
  const [unggahItem, setUnggahItem] = useState<{ id: string; judul: string; file: File } | null>(null);
  const [menyiapkan, setMenyiapkan] = useState("");
  // Item stok yang detailnya dibuka (panel samping) + videonya (blob) untuk
  // pratinjau/unduh/upload — diambil sekali saat dibuka.
  const [bukaItem, setBukaItem] = useState<StokTvr | null>(null);
  const [preview, setPreview] = useState<{ id: string; url: string; file: File } | null>(null);
  const [mengunduh, setMengunduh] = useState(false);
  const tabAktifRef = useRefTabAktif();

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const res = await apiFetch("/api/tvr/ringkas", { cache: "no-store" });
        const d = await bacaJson(res);
        if (!res.ok) throw new Error(pesanGalat(res.status, d, "Edit Otomatis gagal dimuat."));
        if (!hidup) return;
        setData(d as RingkasTvr);
        setGalatMuat("");
      } catch (e) {
        if (hidup) setGalatMuat(e instanceof Error ? e.message : "Edit Otomatis gagal dimuat.");
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muatUlang]);

  const job = data?.job ?? null;
  const idAktif = job !== null && STATUS_AKTIF.includes(job.status) ? job.job_id : null;

  // Pantau selama ada render berjalan: job/antrean/stok disegarkan tiap 2 detik
  // selama tab terlihat. Satu permintaan pada satu waktu.
  useEffect(() => {
    if (!idAktif) return;
    let hidup = true;
    let sedang = false;
    const t = window.setInterval(async () => {
      if (sedang || document.visibilityState !== "visible" || !tabAktifRef.current) return;
      sedang = true;
      try {
        const res = await apiFetch("/api/tvr/jobs/saya", { cache: "no-store" });
        if (!res.ok) return;
        const d = await bacaJson(res);
        if (!hidup) return;
        setData((lama) =>
          lama ? { ...lama, job: (d.job as JobTvr | null) ?? null, antrean: d.antrean ?? null, stok: (d.stok as StokTvr[]) ?? [] } : lama,
        );
      } catch {
        // Jaringan putus sesaat — dicoba lagi pada detik berikutnya.
      } finally {
        sedang = false;
      }
    }, 2000);
    return () => {
      hidup = false;
      window.clearInterval(t);
    };
  }, [idAktif, tabAktifRef]);

  if (galatMuat && !data) {
    return (
      <GlassCard className="p-4">
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
  if (!data) return <GlassSkeleton className="h-32 rounded-2xl" />;

  const { template, batas, antrean, stok } = data;
  const aktif = job !== null && STATUS_AKTIF.includes(job.status);
  const gagal = job && (job.status === "error" || job.status === "dibatalkan") ? job : null;

  function segarkan() {
    setMuatUlang((n) => n + 1);
  }

  // ===== Form =====
  async function pilihSumber(file: File | null) {
    if (!file || persenSumber !== null) return;
    if (!batas.jenis_sumber.includes(akhiranBerkas(file.name))) {
      setPesan(`Video sumber harus ${batas.jenis_sumber.map((j) => j.slice(1).toUpperCase()).join(", ")}.`);
      return;
    }
    if (file.size > batas.maks_sumber_mb * 1024 * 1024) {
      setPesan(`Video sumber melebihi ${batas.maks_sumber_mb} MB.`);
      return;
    }
    setPesan("");
    setPersenSumber(0);
    try {
      const { ok, status, data: d } = await apiUnggah("/api/tvr/sumber", file, setPersenSumber);
      if (!ok) throw new Error(pesanGalat(status, d, "Video sumber gagal diunggah."));
      setUnggahan({ url: String(d.url), name: file.name, size: Number(d.size) || file.size, duration: d.duration ?? null });
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Video sumber gagal diunggah.");
    } finally {
      setPersenSumber(null);
    }
  }

  async function buatHook() {
    if (!naskah.trim() || membuatHook) return;
    setMembuatHook(true);
    setPesan("");
    try {
      const res = await apiFetch("/api/tvr/hook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ naskah: naskah.trim().slice(0, 5000) }),
      });
      const d = await bacaJson(res);
      if (!res.ok) throw new Error(pesanGalat(res.status, d, "Tulisan gagal dibuat."));
      setHook(String(d.hook || "").slice(0, batas.maks_hook));
      setBukaNaskah(false);
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Tulisan gagal dibuat.");
    } finally {
      setMembuatHook(false);
    }
  }

  const alamatSumber = modeSumber === "unggah" ? (unggahan?.url ?? "") : link.trim();
  const kurang: string[] = [];
  if (modeSumber === "unggah" && !unggahan) kurang.push("video sumber");
  if (modeSumber === "link" && !/^https:\/\/\S+$/i.test(link.trim())) kurang.push("link video (diawali https://)");
  if (!hook.trim()) kurang.push("tulisan berita");

  async function kirim() {
    if (kurang.length > 0 || mengirim || persenSumber !== null) return;
    setMengirim(true);
    setPesan("");
    try {
      const res = await apiFetch("/api/tvr/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: alamatSumber, hook: hook.trim(), sumber: teksSumber.trim(), kategori: kategori.trim() }),
      });
      const d = await bacaJson(res);
      if (!res.ok) {
        if (res.status === 409) segarkan();
        throw new Error(pesanGalat(res.status, d, "Video gagal dikirim ke antrean."));
      }
      setData((lama) =>
        lama ? { ...lama, job: (d.job as JobTvr | null) ?? null, antrean: d.antrean ?? null, stok: (d.stok as StokTvr[]) ?? lama.stok } : lama,
      );
      // Bahan sumber dilepas; tulisan/kategori dibiarkan supaya mudah bikin lagi.
      setUnggahan(null);
      setLink("");
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Video gagal dikirim ke antrean.");
    } finally {
      setMengirim(false);
    }
  }

  async function batalkan() {
    if (membatalkan) return;
    setMembatalkan(true);
    try {
      const res = await apiFetch("/api/tvr/jobs/saya?hapus_sumber=false", { method: "DELETE" });
      if (!res.ok) throw new Error(pesanGalat(res.status, await bacaJson(res), "Gagal. Coba lagi."));
      const lama = job;
      setData((d) => (d ? { ...d, job: null, antrean: null } : d));
      // Bahan & tulisan job yang gagal/dibatalkan dikembalikan ke form.
      if (lama) {
        setHook(lama.texts?.hook ?? "");
        setTeksSumber(lama.texts?.sumber ?? "");
        setKategori(lama.texts?.kategori ?? "");
      }
    } catch (e) {
      toast("error", "Gagal", e instanceof Error ? e.message : "Coba lagi sebentar.");
    } finally {
      setMembatalkan(false);
    }
  }

  // ===== Stok =====
  async function tambahStok(file: File | null) {
    if (!file || persenStok !== null) return;
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
      const { ok, status, data: d } = await apiUnggah("/api/tvr/stok", file, setPersenStok);
      if (!ok) throw new Error(pesanGalat(status, d, "Gagal menambah ke stok."));
      setData((lama) => (lama ? { ...lama, stok: (d.stok as StokTvr[]) ?? lama.stok } : lama));
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Gagal menambah ke stok.");
    } finally {
      setPersenStok(null);
    }
  }

  function lepasPreview() {
    setPreview((lama) => {
      if (lama) URL.revokeObjectURL(lama.url);
      return null;
    });
  }

  // Buka panel detail satu item: ambil videonya sekali (blob) untuk pratinjau,
  // unduh, dan upload — supaya tak berulang-ulang menarik dari server.
  async function bukaDetail(item: StokTvr) {
    if (menyiapkan) return;
    setBukaItem(item);
    setUnggahItem(null);
    setPesan("");
    if (preview?.id === item.id) return;
    lepasPreview();
    setMenyiapkan(item.id);
    try {
      const res = await apiFetch(`/api/tvr/stok/${item.id}/berkas`, { cache: "no-store" });
      if (!res.ok) throw new Error(pesanGalat(res.status, await bacaJson(res), "Video gagal diambil."));
      const blob = await res.blob();
      const file = new File([blob], `${item.judul || "video"}.mp4`, { type: "video/mp4" });
      setPreview({ id: item.id, url: URL.createObjectURL(blob), file });
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Video gagal diambil.");
    } finally {
      setMenyiapkan("");
    }
  }

  function tutupDetail() {
    setBukaItem(null);
    setUnggahItem(null);
    lepasPreview();
  }

  function unduh() {
    if (!preview || mengunduh) return;
    setMengunduh(true);
    try {
      const a = document.createElement("a");
      a.href = preview.url;
      a.download = preview.file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setMengunduh(false);
    }
  }

  async function hapusStok(id: string) {
    if (hapusId) return;
    setHapusId(id);
    try {
      const res = await apiFetch(`/api/tvr/stok/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(pesanGalat(res.status, await bacaJson(res), "Gagal menghapus."));
      setData((d) => (d ? { ...d, stok: d.stok.filter((s) => s.id !== id) } : d));
      if (bukaItem?.id === id) tutupDetail();
    } catch (e) {
      toast("error", "Gagal", e instanceof Error ? e.message : "Coba lagi.");
    } finally {
      setHapusId("");
    }
  }

  /** Tandai item sudah dikirim ke sosmed (TIDAK dihapus — tetap di stok). */
  async function tandaiTerunggah(id: string) {
    try {
      const res = await apiFetch(`/api/tvr/stok/${id}/terunggah`, { method: "POST" });
      if (!res.ok) throw new Error(pesanGalat(res.status, await bacaJson(res), "Gagal menandai."));
      const d = await bacaJson(res);
      setData((lama) => (lama ? { ...lama, stok: (d.stok as StokTvr[]) ?? lama.stok } : lama));
    } catch {
      // Tanda gagal tersimpan bukan hal kritis; status upload-post sudah aman.
    }
  }

  function mulaiUnggah() {
    if (!preview || !bukaItem) return;
    setUnggahItem({ id: bukaItem.id, judul: bukaItem.judul, file: preview.file });
  }

  function templateTersimpan(t: KeadaanTemplateTvr) {
    setData((d) => (d ? { ...d, template: t } : d));
    setBukaTemplate(false);
  }

  // ===== Tampilan =====
  const kepala = (
    <div className="flex items-center gap-3">
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
        style={{ background: "linear-gradient(135deg, #0EA5E9, #2563EB)" }}
        aria-hidden="true"
      >
        <Wand2 className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-heading text-[14px] font-bold text-teks-utama">Edit Otomatis</p>
        <p className="mt-0.5 text-[11px] leading-snug text-teks-sekunder">
          {template.siap ? "Template terpasang otomatis di setiap video." : "Buat template dulu, lalu buat video otomatis."}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setBukaTemplate(true)}
        aria-label={template.siap ? "Edit template" : "Buat template"}
        title={template.siap ? "Edit template" : "Buat template"}
        className="btn-tekan flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pri/15 text-pri"
      >
        {template.siap ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
      </button>
    </div>
  );

  return (
    <GlassCard className="p-4">
      {kepala}

      {!template.siap ? (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-[12px] leading-relaxed text-teks-sekunder">
          <li>Tekan tombol <b className="text-teks-utama">+</b> di kanan atas.</li>
          <li>Unggah kotak monas &amp; bingkai teratas (PNG), boom like share dan video penutup (opsional).</li>
          <li>Tandai posisi tulisan, lalu <b className="text-teks-utama">Simpan &amp; Tetapkan</b>.</li>
        </ol>
      ) : aktif && job ? (
        <PanelAktif job={job} antrean={antrean} membatalkan={membatalkan} onBatal={() => void batalkan()} />
      ) : (
        <>
          {gagal && (
            <div className="mt-3 rounded-xl border border-gagal/30 bg-gagal/10 p-3" role="alert">
              <p className="text-[12.5px] font-bold text-teks-utama">
                {gagal.status === "dibatalkan" ? "Video dibatalkan" : "Video gagal dibuat"}
              </p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-teks-sekunder">{gagal.error || gagal.message || "Coba lagi."}</p>
              <button
                type="button"
                onClick={() => void batalkan()}
                disabled={membatalkan}
                className="glass btn-tekan mt-2 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-bold text-teks-utama disabled:opacity-50"
              >
                {membatalkan ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Ubah &amp; coba lagi
              </button>
            </div>
          )}
          <FormBuatVideo
            batas={batas}
            modeSumber={modeSumber}
            setModeSumber={setModeSumber}
            link={link}
            setLink={setLink}
            unggahan={unggahan}
            persenSumber={persenSumber}
            pilihSumber={pilihSumber}
            hook={hook}
            setHook={setHook}
            teksSumber={teksSumber}
            setTeksSumber={setTeksSumber}
            kategori={kategori}
            setKategori={setKategori}
            naskah={naskah}
            setNaskah={setNaskah}
            bukaNaskah={bukaNaskah}
            setBukaNaskah={setBukaNaskah}
            membuatHook={membuatHook}
            buatHook={() => void buatHook()}
            mengirim={mengirim}
            kurang={kurang}
            kirim={() => void kirim()}
          />
        </>
      )}

      {template.siap && (
        <SeksiStok
          stok={stok}
          umurJam={batas.umur_simpan_jam}
          persenStok={persenStok}
          hapusId={hapusId}
          menyiapkan={menyiapkan}
          mengunduh={mengunduh}
          jenisSumber={batas.jenis_sumber}
          tambahStok={tambahStok}
          bukaItem={bukaItem}
          preview={preview}
          onBuka={(it) => void bukaDetail(it)}
          onTutupDetail={tutupDetail}
          onUnduh={unduh}
          onUpload={mulaiUnggah}
          onHapus={(id) => void hapusStok(id)}
          unggahItem={unggahItem}
          onTutupUnggah={() => setUnggahItem(null)}
          onTerkirim={() => {
            // Terkirim ke sosmed: DIBERI TANDA, tidak dihapus dari stok.
            const id = unggahItem?.id ?? "";
            setUnggahItem(null);
            if (id) void tandaiTerunggah(id);
          }}
        />
      )}

      {pesan && (
        <p className="mt-3 rounded-xl border border-gagal/30 bg-gagal/10 p-2.5 text-[11.5px] text-teks-utama" role="alert">
          {pesan}
        </p>
      )}
      {bukaTemplate && (
        <TemplateTvrModal
          awal={template}
          batas={batas}
          onTutup={() => {
            setBukaTemplate(false);
            segarkan();
          }}
          onTersimpan={templateTersimpan}
        />
      )}
    </GlassCard>
  );
}

// ------------------------------------------------------------ panel render aktif
function PanelAktif({
  job,
  antrean,
  membatalkan,
  onBatal,
}: {
  job: JobTvr;
  antrean: RingkasTvr["antrean"];
  membatalkan: boolean;
  onBatal: () => void;
}) {
  const sedang = job.status !== "queued";
  return (
    <div className="mt-3 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-3.5" aria-live="polite">
      {sedang ? (
        <>
          <p className="flex items-center gap-2 text-[13px] font-bold text-teks-utama">
            <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
            {job.status === "downloading" ? "Mengambil video sumber…" : `Sedang diedit · ${job.progress ?? 0}%`}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-sky-500 transition-[width] duration-500"
              style={{ width: `${job.status === "downloading" ? 3 : Math.max(3, job.progress ?? 0)}%` }}
            />
          </div>
        </>
      ) : (
        <>
          <p className="text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">Nomor antrean</p>
          <p className="angka-tab font-heading text-3xl font-extrabold text-teks-utama">{antrean?.posisi ?? "…"}</p>
          <p className="text-[11.5px] text-teks-sekunder">
            {antrean ? (antrean.di_depan > 0 ? `${antrean.di_depan} video di depanmu` : "Berikutnya dikerjakan") : "Menunggu giliran"}
          </p>
        </>
      )}
      {antrean && (
        <p className="mt-2 text-[11.5px] text-teks-utama">
          Perkiraan selesai: <b>{perkiraanWaktu(antrean.perkiraan_detik)}</b>
        </p>
      )}
      <p className="mt-1 text-[10.5px] leading-relaxed text-teks-sekunder">
        Boleh tinggalkan halaman ini — videonya tetap diproses lalu masuk Stok di bawah.
      </p>
      <button
        type="button"
        onClick={onBatal}
        disabled={membatalkan}
        className="glass btn-tekan mt-2.5 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-bold text-teks-utama disabled:opacity-50"
      >
        {membatalkan ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
        Batalkan
      </button>
    </div>
  );
}

// ------------------------------------------------------------ form buat video
type FormProps = {
  batas: RingkasTvr["batas"];
  modeSumber: "unggah" | "link";
  setModeSumber: (m: "unggah" | "link") => void;
  link: string;
  setLink: (s: string) => void;
  unggahan: Unggahan | null;
  persenSumber: number | null;
  pilihSumber: (f: File | null) => void;
  hook: string;
  setHook: (s: string) => void;
  teksSumber: string;
  setTeksSumber: (s: string) => void;
  kategori: string;
  setKategori: (s: string) => void;
  naskah: string;
  setNaskah: (s: string) => void;
  bukaNaskah: boolean;
  setBukaNaskah: (f: (b: boolean) => boolean) => void;
  membuatHook: boolean;
  buatHook: () => void;
  mengirim: boolean;
  kurang: string[];
  kirim: () => void;
};

function FormBuatVideo(p: FormProps) {
  const { batas } = p;
  const inputSumberRef = useRef<HTMLInputElement>(null);
  return (
    <div className="mt-3">
      <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
        <Clapperboard className="h-3.5 w-3.5" /> Buat video
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {(["unggah", "link"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => p.setModeSumber(m)}
            disabled={p.mengirim || p.persenSumber !== null}
            aria-pressed={p.modeSumber === m}
            className={cn(
              "btn-tekan flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-bold",
              p.modeSumber === m ? "bg-pri/15 text-pri" : "glass text-teks-sekunder",
            )}
          >
            {m === "unggah" ? <UploadCloud className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
            {m === "unggah" ? "Unggah Sendiri" : "Pakai Link"}
          </button>
        ))}
      </div>

      {p.modeSumber === "unggah" ? (
        <>
          <input
            ref={inputSumberRef}
            type="file"
            accept={batas.jenis_sumber.join(",")}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = "";
              p.pilihSumber(f);
            }}
          />
          <button
            type="button"
            onClick={() => inputSumberRef.current?.click()}
            disabled={p.mengirim || p.persenSumber !== null}
            className="glass btn-tekan mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-5 text-[13px] font-bold text-teks-utama disabled:opacity-60"
          >
            {p.persenSumber !== null ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-pri" /> Mengunggah… {p.persenSumber}%
              </>
            ) : (
              <>
                <UploadCloud className="h-5 w-5 text-pri" />
                <span className="truncate">{p.unggahan ? p.unggahan.name : "Pilih Video"}</span>
              </>
            )}
          </button>
        </>
      ) : (
        <input
          value={p.link}
          onChange={(e) => p.setLink(e.target.value)}
          placeholder="https://… link TikTok / Instagram / Facebook"
          inputMode="url"
          disabled={p.mengirim}
          className="glass-input mt-2 h-11 w-full rounded-xl px-3 text-sm text-teks-utama"
        />
      )}
      <p className="mt-1.5 text-[10.5px] leading-relaxed text-teks-sekunder">
        Maksimal {batas.maks_sumber_mb} MB; video di atas {Math.round(batas.maks_durasi_detik / 60)} menit dipotong.
        {p.modeSumber === "link" && " Link YouTube belum bisa dipakai dari server."}
      </p>

      <div className="mt-3 flex items-center gap-2">
        <p className="flex-1 text-[12px] font-bold text-teks-utama">Tulisan berita</p>
        <button
          type="button"
          onClick={() => p.setBukaNaskah((b) => !b)}
          disabled={p.mengirim}
          className="glass btn-tekan flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10.5px] font-bold text-teks-sekunder"
        >
          <Sparkles className="h-3 w-3" /> Buat dari caption
        </button>
      </div>
      {p.bukaNaskah && (
        <div className="glass-soft mt-2 rounded-xl p-2.5">
          <textarea
            value={p.naskah}
            onChange={(e) => p.setNaskah(e.target.value)}
            rows={4}
            maxLength={5000}
            placeholder="Tempel caption / naskah berita di sini"
            className="glass-input w-full rounded-lg p-2 text-[12.5px] text-teks-utama"
          />
          <button
            type="button"
            onClick={p.buatHook}
            disabled={!p.naskah.trim() || p.membuatHook}
            className="btn-tekan mt-1.5 flex items-center gap-1.5 rounded-lg bg-pri/15 px-3 py-1.5 text-[11.5px] font-bold text-pri disabled:opacity-50"
          >
            {p.membuatHook ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Jadikan tulisan
          </button>
        </div>
      )}
      <textarea
        value={p.hook}
        onChange={(e) => p.setHook(e.target.value.slice(0, batas.maks_hook))}
        rows={3}
        placeholder="VIRAL! Tulis beritanya di sini — kata pertama berwarna merah"
        disabled={p.mengirim}
        className="glass-input mt-2 w-full rounded-xl p-3 text-[13px] text-teks-utama"
      />
      <p className="mt-0.5 text-right text-[10px] text-teks-sekunder">
        {p.hook.length}/{batas.maks_hook}
      </p>
      <input
        value={p.teksSumber}
        onChange={(e) => p.setTeksSumber(e.target.value.slice(0, batas.maks_sumber_teks))}
        placeholder="Kredit sumber (opsional), mis. SUMBER: @akun"
        disabled={p.mengirim}
        className="glass-input mt-1 h-10 w-full rounded-xl px-3 text-[12.5px] text-teks-utama"
      />
      <div className="mt-2 flex items-center gap-2">
        <label htmlFor="tvr-kategori-video" className="shrink-0 text-[12px] font-bold text-teks-utama">
          Kategori
        </label>
        <input
          id="tvr-kategori-video"
          value={p.kategori}
          onChange={(e) => p.setKategori(e.target.value.toUpperCase().slice(0, batas.maks_kategori))}
          placeholder="NEWS (opsional — kosong = tanpa badge)"
          disabled={p.mengirim}
          className="glass-input h-10 min-w-0 flex-1 rounded-xl px-3 text-[12.5px] font-bold tracking-wide text-teks-utama uppercase"
        />
      </div>

      <button
        type="button"
        onClick={p.kirim}
        disabled={p.mengirim || p.persenSumber !== null || p.kurang.length > 0}
        className="btn-tekan mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[13.5px] font-bold text-white disabled:opacity-50"
        style={{ background: "linear-gradient(135deg, #0EA5E9, #2563EB)" }}
      >
        {p.mengirim ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Wand2 className="h-4.5 w-4.5" />}
        Buat Video
      </button>
      {p.kurang.length > 0 && !p.mengirim && (
        <p className="mt-1.5 text-center text-[10.5px] text-teks-sekunder">Lengkapi: {p.kurang.join(", ")}.</p>
      )}
    </div>
  );
}

// ------------------------------------------------------------ seksi stok
type SeksiStokProps = {
  stok: StokTvr[];
  umurJam: number;
  persenStok: number | null;
  hapusId: string;
  menyiapkan: string;
  mengunduh: boolean;
  jenisSumber: string[];
  tambahStok: (f: File | null) => void;
  bukaItem: StokTvr | null;
  preview: { id: string; url: string; file: File } | null;
  onBuka: (it: StokTvr) => void;
  onTutupDetail: () => void;
  onUnduh: () => void;
  onUpload: () => void;
  onHapus: (id: string) => void;
  unggahItem: { id: string; judul: string; file: File } | null;
  onTutupUnggah: () => void;
  onTerkirim: () => void;
};

// Geseran lateral ala iOS: tampilan masuk dari kanan, keluar ke kiri, dengan
// pegas ringan. prefers-reduced-motion dihormati otomatis oleh Framer Motion.
const SLIDE = {
  awal: { opacity: 0, x: 28 },
  masuk: { opacity: 1, x: 0 },
  keluar: { opacity: 0, x: -28 },
  transisi: { type: "spring" as const, stiffness: 520, damping: 42, mass: 0.8 },
};

function SeksiStok(p: SeksiStokProps) {
  const inputStokRef = useRef<HTMLInputElement>(null);
  const mode = p.unggahItem ? "upload" : p.bukaItem ? "detail" : "daftar";

  return (
    <div className="mt-4 overflow-hidden border-t border-black/5 pt-3 dark:border-white/10">
      <AnimatePresence mode="wait" initial={false}>
        {mode === "upload" && p.unggahItem ? (
          <motion.div
            key="upload"
            initial={SLIDE.awal}
            animate={SLIDE.masuk}
            exit={SLIDE.keluar}
            transition={SLIDE.transisi}
          >
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                onClick={p.onTutupUnggah}
                className="glass btn-tekan flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-teks-sekunder"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Kembali
              </button>
              <p className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-teks-utama">Upload: {p.unggahItem.judul}</p>
            </div>
            <UnggahSosmedSaya key={p.unggahItem.id} berkasAwal={p.unggahItem.file} hanyaForm onTerkirim={p.onTerkirim} />
          </motion.div>
        ) : mode === "detail" && p.bukaItem ? (
          <motion.div
            key="detail"
            initial={SLIDE.awal}
            animate={SLIDE.masuk}
            exit={SLIDE.keluar}
            transition={SLIDE.transisi}
          >
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                onClick={p.onTutupDetail}
                className="glass btn-tekan flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-teks-sekunder"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Stok
              </button>
              <p className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-teks-utama">{p.bukaItem.judul}</p>
              {p.bukaItem.terunggah && (
                <span className="flex items-center gap-1 rounded-full bg-sukses/15 px-2 py-0.5 text-[10px] font-bold text-sukses">
                  <Check className="h-3 w-3" /> Terunggah
                </span>
              )}
            </div>

            {p.preview && p.preview.id === p.bukaItem.id ? (
              <video
                src={p.preview.url}
                controls
                playsInline
                preload="metadata"
                className="mx-auto aspect-[9/16] max-h-[52vh] w-full max-w-[280px] rounded-2xl bg-black"
              />
            ) : (
              <div className="mx-auto flex aspect-[9/16] max-h-[52vh] w-full max-w-[280px] items-center justify-center rounded-2xl bg-black/80">
                <Loader2 className="h-6 w-6 animate-spin text-white/70" />
              </div>
            )}
            <p className="mt-1.5 text-center text-[10.5px] text-teks-sekunder">
              {[tanggalRingkas(p.bukaItem.tanggal), p.bukaItem.durasi ? `${Math.round(p.bukaItem.durasi)} dtk` : "", ukuranMb(p.bukaItem.size)]
                .filter(Boolean)
                .join(" · ")}
            </p>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={p.onUnduh}
                disabled={!p.preview || p.mengunduh}
                className="glass btn-tekan flex h-11 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold text-teks-utama disabled:opacity-50"
              >
                <Download className="h-4 w-4" /> Unduh
              </button>
              <button
                type="button"
                onClick={p.onUpload}
                disabled={!p.preview}
                className="btn-tekan flex h-11 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
              >
                <Send className="h-4 w-4" /> Upload
              </button>
              <button
                type="button"
                onClick={() => p.onHapus(p.bukaItem!.id)}
                disabled={p.hapusId !== ""}
                className="glass btn-tekan flex h-11 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold text-gagal disabled:opacity-50"
              >
                {p.hapusId === p.bukaItem.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Hapus
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="daftar"
            initial={SLIDE.awal}
            animate={SLIDE.masuk}
            exit={SLIDE.keluar}
            transition={SLIDE.transisi}
          >
            <div className="flex items-center gap-2">
              <p className="flex flex-1 items-center gap-1.5 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
                <Film className="h-3.5 w-3.5" /> Stok video ({p.stok.length})
              </p>
              <input
                ref={inputStokRef}
                type="file"
                accept={p.jenisSumber.join(",")}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  e.target.value = "";
                  p.tambahStok(f);
                }}
              />
              <button
                type="button"
                onClick={() => inputStokRef.current?.click()}
                disabled={p.persenStok !== null}
                className="glass btn-tekan flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10.5px] font-bold text-teks-utama disabled:opacity-60"
              >
                {p.persenStok !== null ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" /> {p.persenStok}%
                  </>
                ) : (
                  <>
                    <Plus className="h-3 w-3" /> Tambah dari internal
                  </>
                )}
              </button>
            </div>

            {p.stok.length === 0 ? (
              <p className="mt-2 text-[11.5px] leading-relaxed text-teks-sekunder">
                Belum ada video jadi. Hasil edit otomatis muncul di sini, atau tambah video jadi dari perangkatmu. Disimpan ~{p.umurJam} jam.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {p.stok.map((it) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => p.onBuka(it)}
                      disabled={p.menyiapkan !== ""}
                      className="glass-soft btn-tekan flex w-full items-center gap-2.5 rounded-xl p-2.5 text-left disabled:opacity-60"
                    >
                      <span
                        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-pri/15 text-pri"
                        aria-hidden="true"
                      >
                        {it.sumber === "unggah" ? <UploadCloud className="h-4 w-4" /> : <Wand2 className="h-4 w-4" />}
                        {it.terunggah && (
                          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-sukses text-white">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-bold text-teks-utama">{it.judul}</p>
                        <p className="text-[10.5px] text-teks-sekunder">
                          {[
                            it.terunggah ? "Terunggah" : "",
                            tanggalRingkas(it.tanggal),
                            it.durasi ? `${Math.round(it.durasi)} dtk` : "",
                            ukuranMb(it.size),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      {p.menyiapkan === it.id ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-teks-sekunder" />
                      ) : (
                        <ChevronLeft className="h-4 w-4 shrink-0 rotate-180 text-teks-sekunder" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

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
//   3. Hasilnya masuk STOK VIDEO — sejak 5 Okt 2026 seksi tersendiri yang
//      terbuka untuk semua akun TVR Saya (stok-video-tvr.tsx). Edit Otomatis
//      sendiri terbuka untuk semua akun sejak 6 Okt 2026 (lib/peran).
// ============================================================

import { useEffect, useRef, useState } from "react";
import {
  Clapperboard,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  UploadCloud,
  Wand2,
  X,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton } from "@/components/pri-ui";
import { toast, useAppStore } from "@/hooks/use-app-store";
import { useRefTabAktif } from "@/hooks/use-tab-aktif";
import { cn } from "@/lib/utils";
import { bacaJson, pesanGalat } from "@/features/auto-edit/api";
import { useApiAutoEdit } from "@/features/auto-edit/tim";
import { bolehAlatVideo } from "@/lib/peran";
import { TemplateTvrModal } from "./template-tvr-modal";
import { segarkanStokTvr } from "./stok-video-tvr";
import {
  STATUS_AKTIF,
  akhiranBerkas,
  perkiraanWaktu,
  type JobTimTvr,
  type JobTvr,
  type KeadaanTemplateTvr,
  type RingkasTvr,
  type StokTvr,
} from "./edit-otomatis-tipe";

type Unggahan = { url: string; name: string; size?: number; duration?: number | null };

export function EditOtomatisTvr() {
  const api = useApiAutoEdit();
  const [data, setData] = useState<RingkasTvr | null>(null);
  const [galatMuat, setGalatMuat] = useState("");
  const [muatUlang, setMuatUlang] = useState(0);
  const [bukaTemplate, setBukaTemplate] = useState(false);
  const [menghapusTemplate, setMenghapusTemplate] = useState(false);

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

  const [membatalkan, setMembatalkan] = useState(false);
  const tabAktifRef = useRefTabAktif();

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const res = await api.fetch("/api/tvr/ringkas", { cache: "no-store" });
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
  // Akun TIM (TV Rakyat Official): antrean bersama seluruh tim.
  const modeTim = Boolean(api.tim);
  const idSaya = useAppStore((s) => String(s.user?.id ?? ""));
  const bolehHapusLatar = useAppStore((s) => bolehAlatVideo(s.user, "hapuslatar"));
  // Template tim dipakai bersama — hanya master yang boleh menghapusnya.
  const bolehHapusTemplate = useAppStore((s) => !modeTim || s.user?.role === "master");
  // Semua akun boleh mengantre banyak video sekaligus (6 Okt 2026).
  const jobsAntre: JobTimTvr[] = data?.jobs ?? [];
  const adaJob = jobsAntre.length > 0;
  // Video MILIK SAYA yang sedang mengantre (akun tim: buatan anggota ini).
  const idSayaAktif = jobsAntre
    .filter((j) => !modeTim || String(j.anggota ?? "") === idSaya)
    .map((j) => j.job_id)
    .sort()
    .join(",");
  const [membatalkanId, setMembatalkanId] = useState("");

  // Pantau selama ada render berjalan: job/antrean/stok disegarkan tiap 2 detik
  // selama tab terlihat. Satu permintaan pada satu waktu.
  useEffect(() => {
    if (!adaJob) return;
    let hidup = true;
    let sedang = false;
    const t = window.setInterval(async () => {
      if (sedang || document.visibilityState !== "visible" || !tabAktifRef.current) return;
      sedang = true;
      try {
        const res = await api.fetch("/api/tvr/jobs/saya", { cache: "no-store" });
        if (!res.ok) return;
        const d = await bacaJson(res);
        if (!hidup) return;
        setData((lama) =>
          lama
            ? {
                ...lama,
                job: (d.job as JobTvr | null) ?? null,
                antrean: d.antrean ?? null,
                jobs: (d.jobs as JobTimTvr[] | undefined) ?? lama.jobs,
                stok: (d.stok as StokTvr[]) ?? [],
              }
            : lama,
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
  }, [adaJob, tabAktifRef, api]);

  // Video MILIK SAYA yang lenyap dari antrean = sudah jadi (atau dibatalkan).
  const idSayaSebelumnyaRef = useRef("");
  useEffect(() => {
    const lama = idSayaSebelumnyaRef.current ? idSayaSebelumnyaRef.current.split(",") : [];
    const kini = new Set(idSayaAktif ? idSayaAktif.split(",") : []);
    idSayaSebelumnyaRef.current = idSayaAktif;
    if (lama.some((id) => !kini.has(id))) {
      toast(
        "sukses",
        "Video selesai diproses",
        modeTim ? "Cek Stok Video Tim di bawah." : "Sudah masuk Stok Video — ketuk videonya lalu Upload.",
      );
      segarkanStokTvr();
    }
  }, [modeTim, idSayaAktif]);

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

  const { template, batas } = data;
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
      const { ok, status, data: d } = await api.unggah("/api/tvr/sumber", file, setPersenSumber);
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
      const res = await api.fetch("/api/tvr/hook", {
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
      const res = await api.fetch("/api/tvr/jobs", {
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
        lama
          ? {
              ...lama,
              job: (d.job as JobTvr | null) ?? null,
              antrean: d.antrean ?? null,
              jobs: (d.jobs as JobTimTvr[] | undefined) ?? lama.jobs,
              stok: (d.stok as StokTvr[]) ?? lama.stok,
            }
          : lama,
      );
      toast("sukses", modeTim ? "Masuk antrean tim" : "Masuk antrean", "Anda bisa langsung membuat video berikutnya.");
      // Bahan sumber dilepas; tulisan/kategori dibiarkan supaya mudah bikin lagi.
      setUnggahan(null);
      setLink("");
      segarkanStokTvr(); // Stok Video menampilkan "sedang diedit"
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Video gagal dikirim ke antrean.");
    } finally {
      setMengirim(false);
    }
  }

  /** Batalkan SATU video di antrean (akun tim: hanya milik sendiri). */
  async function batalkanJob(id: string) {
    if (membatalkanId) return;
    setMembatalkanId(id);
    try {
      const res = await api.fetch(`/api/tvr/jobs/${id}`, { method: "DELETE" });
      const d = await bacaJson(res);
      if (!res.ok) throw new Error(pesanGalat(res.status, d, "Gagal membatalkan."));
      setData((lama) => (lama ? { ...lama, jobs: (d.jobs as JobTimTvr[] | undefined) ?? lama.jobs } : lama));
    } catch (e) {
      toast("error", "Gagal", e instanceof Error ? e.message : "Coba lagi.");
    } finally {
      setMembatalkanId("");
    }
  }

  async function batalkan() {
    if (membatalkan) return;
    setMembatalkan(true);
    try {
      const res = await api.fetch("/api/tvr/jobs/saya?hapus_sumber=false", { method: "DELETE" });
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

  /** Hapus template seluruhnya (6 Okt 2026) — setelah konfirmasi. */
  async function hapusTemplate() {
    if (menghapusTemplate) return;
    if (!window.confirm("Hapus template ini? Semua bahan (kotak monas, bingkai, boom, penutup) dan posisi tulisan ikut terhapus.")) return;
    setMenghapusTemplate(true);
    try {
      const res = await api.fetch("/api/tvr/template", { method: "DELETE" });
      const d = await bacaJson(res);
      if (!res.ok) throw new Error(pesanGalat(res.status, d, "Template gagal dihapus."));
      setData((lama) => (lama ? { ...lama, template: d.template as KeadaanTemplateTvr } : lama));
      toast("sukses", "Template dihapus", "Tekan + untuk membuat template baru.");
    } catch (e) {
      toast("error", "Gagal menghapus template", e instanceof Error ? e.message : "Coba lagi.");
    } finally {
      setMenghapusTemplate(false);
    }
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
        <p className="font-heading text-[14px] font-bold text-teks-utama">{api.tim ? "Edit Otomatis Tim" : "Edit Otomatis"}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-teks-sekunder">
          {template.siap ? "Template terpasang otomatis di setiap video." : "Buat template dulu, lalu buat video otomatis."}
          {api.tim && " Template & antrean dipakai bersama seluruh tim — satu video diproses bergantian."}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setBukaTemplate(true)}
        data-tur={api.tim ? undefined : "tvr-tombol-template"}
        aria-label={template.siap ? "Edit template" : "Buat template"}
        title={template.siap ? "Edit template" : "Buat template"}
        className="btn-tekan flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pri/15 text-pri"
      >
        {template.siap ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
      </button>
      {template.ada && bolehHapusTemplate && (
        <button
          type="button"
          onClick={() => void hapusTemplate()}
          disabled={menghapusTemplate}
          aria-label="Hapus template"
          title="Hapus template"
          className="btn-tekan flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gagal/10 text-gagal disabled:opacity-50"
        >
          {menghapusTemplate ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
        </button>
      )}
    </div>
  );

  return (
    <GlassCard className="p-4" dataTur={api.tim ? undefined : "tvr-edit-otomatis"}>
      {kepala}

      {!template.siap ? (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-[12px] leading-relaxed text-teks-sekunder">
          <li>Tekan tombol <b className="text-teks-utama">+</b> di kanan atas.</li>
          <li>Unggah kotak monas &amp; bingkai teratas (PNG), boom like share dan video penutup (opsional).</li>
          <li>Tandai posisi tulisan, lalu <b className="text-teks-utama">Simpan &amp; Tetapkan</b>.</li>
        </ol>
      ) : (
        <>
          {adaJob && (
            <DaftarAntrean
              jobs={jobsAntre}
              tim={modeTim}
              idSaya={idSaya}
              membatalkanId={membatalkanId}
              onBatal={(id) => void batalkanJob(id)}
            />
          )}
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
          bolehHapusLatar={bolehHapusLatar}
        />
      )}

    </GlassCard>
  );
}

// ------------------------------------------------------------ daftar antrean
function DaftarAntrean({
  jobs,
  tim,
  idSaya,
  membatalkanId,
  onBatal,
}: {
  jobs: JobTimTvr[];
  /** Akun tim: antrean bersama — tandai milik sendiri, hanya itu yang bisa dibatalkan. */
  tim: boolean;
  idSaya: string;
  membatalkanId: string;
  onBatal: (id: string) => void;
}) {
  // Urut sesuai antrean: yang sedang dikerjakan dulu, lalu nomor antrean.
  const urut = [...jobs].sort((x, y) => (x.antrean?.posisi ?? 999) - (y.antrean?.posisi ?? 999));
  return (
    <div className="mt-3 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-3" aria-live="polite">
      <p className="text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
        {tim ? "Antrean tim" : "Antrean video Anda"} ({jobs.length})
      </p>
      <ul className="mt-2 space-y-2">
        {urut.map((j) => {
          const milikSaya = !tim || String(j.anggota ?? "") === idSaya;
          const jalan = j.status !== "queued";
          return (
            <li key={j.job_id} className="glass-soft rounded-xl p-2.5">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-[12px] font-bold text-teks-utama">
                  {(j.texts?.hook || "Video").slice(0, 70)}
                </p>
                {tim && milikSaya && (
                  <span className="shrink-0 rounded-full bg-pri/15 px-1.5 py-0.5 text-[9.5px] font-bold text-pri">Milik Anda</span>
                )}
              </div>
              <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-teks-sekunder">
                {jalan && <Loader2 className="h-3 w-3 animate-spin text-sky-500" />}
                {j.status === "downloading"
                  ? "Mengambil video sumber…"
                  : j.status === "rendering"
                    ? `Sedang diedit · ${j.progress ?? 0}%`
                    : j.antrean
                      ? `Antrean #${j.antrean.posisi} · ${j.antrean.di_depan > 0 ? `${j.antrean.di_depan} di depan` : "berikutnya"} · selesai ${perkiraanWaktu(j.antrean.perkiraan_detik)}`
                      : "Menunggu giliran"}
              </p>
              {j.status === "rendering" && (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div className="h-full rounded-full bg-sky-500 transition-[width] duration-500" style={{ width: `${Math.max(3, j.progress ?? 0)}%` }} />
                </div>
              )}
              {milikSaya && (
                <button
                  type="button"
                  onClick={() => onBatal(j.job_id)}
                  disabled={membatalkanId === j.job_id}
                  className="glass btn-tekan mt-1.5 flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10.5px] font-bold text-teks-utama disabled:opacity-50"
                >
                  {membatalkanId === j.job_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                  Batalkan
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[10.5px] leading-relaxed text-teks-sekunder">
        Video yang jadi masuk {tim ? "Stok Video Tim" : "Stok Video"}. Boleh tinggalkan halaman ini — dan boleh
        langsung membuat video berikutnya di bawah.
      </p>
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
    <div className="mt-3" data-tur="tvr-form-buat-video">
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

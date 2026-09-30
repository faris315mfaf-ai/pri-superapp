"use client";

// ============================================================
// Edit Otomatis TVR Saya (30 Sep 2026) — seksi di TVR Saya untuk akun yang
// modulnya dibuka master (lihat bolehEditOtomatisTvr).
//
//   1. Template: tombol + (belum punya) / pensil (sudah ditetapkan) membuka
//      editor. Satu akun satu template; bahan baru menggantikan yang lama.
//   2. Edit: video sumber (unggah sendiri / link) + tulisan berita. Template
//      yang ditetapkan otomatis terpasang.
//   3. Antrean: satu video per akun; nomor antrean & perkiraan waktu
//      dipantau tiap 2 detik selama tab terlihat.
//   4-5. Hasil disimpan sementara di server; lanjut ke upload-post (form
//      unggah biasa, videonya sudah terpasang) atau edit ulang (hasil dihapus,
//      bahan dan tulisan dipertahankan supaya tinggal diubah).
// ============================================================

import { useEffect, useRef, useState } from "react";
import {
  Clapperboard,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
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
  type JobTvr,
  type KeadaanTemplateTvr,
  type RingkasTvr,
} from "./edit-otomatis-tipe";

type Unggahan = { url: string; name: string; size?: number; duration?: number | null };

const AWALAN_UNGGAHAN = "upload://";

export function EditOtomatisTvr() {
  const [data, setData] = useState<RingkasTvr | null>(null);
  const [galatMuat, setGalatMuat] = useState("");
  const [muatUlang, setMuatUlang] = useState(0);
  const [bukaTemplate, setBukaTemplate] = useState(false);

  // Form edit
  const [modeSumber, setModeSumber] = useState<"unggah" | "link">("unggah");
  const [link, setLink] = useState("");
  const [unggahan, setUnggahan] = useState<Unggahan | null>(null);
  const [persenSumber, setPersenSumber] = useState<number | null>(null);
  const [hook, setHook] = useState("");
  const [teksSumber, setTeksSumber] = useState("");
  const [naskah, setNaskah] = useState("");
  const [bukaNaskah, setBukaNaskah] = useState(false);
  const [membuatHook, setMembuatHook] = useState(false);
  const [mengirim, setMengirim] = useState(false);
  const [melepas, setMelepas] = useState(false);
  const [pesan, setPesan] = useState("");
  const inputSumberRef = useRef<HTMLInputElement>(null);

  // Hasil
  const [hasil, setHasil] = useState<{ jobId: string; url: string; file: File } | null>(null);
  const [galatHasil, setGalatHasil] = useState("");
  const [ambilUlang, setAmbilUlang] = useState(0);
  const [lanjutUnggah, setLanjutUnggah] = useState(false);
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
  const aktif = job !== null && STATUS_AKTIF.includes(job.status);
  const idAktif = aktif ? job.job_id : null;

  // Antrean realtime: dipantau tiap 2 detik selama job belum selesai, tab
  // peramban terlihat, dan tab TVR Saya yang dibuka. Satu permintaan pada
  // satu waktu.
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
        setData((lama) => (lama ? { ...lama, job: (d.job as JobTvr | null) ?? null, antrean: d.antrean ?? null } : lama));
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

  // Video jadi diambil sekali (butuh token, jadi lewat fetch → blob).
  const idSelesai = job?.status === "done" ? job.job_id : null;
  useEffect(() => {
    if (!idSelesai) return;
    let hidup = true;
    let alamat = "";
    void (async () => {
      try {
        const res = await apiFetch("/api/tvr/jobs/saya/berkas", { cache: "no-store" });
        if (!res.ok) throw new Error(pesanGalat(res.status, await bacaJson(res), "Video hasil gagal diambil."));
        const blob = await res.blob();
        if (!hidup) return;
        alamat = URL.createObjectURL(blob);
        const file = new File([blob], `edit-otomatis-${idSelesai}.mp4`, { type: "video/mp4" });
        setHasil({ jobId: idSelesai, url: alamat, file });
        setGalatHasil("");
      } catch (e) {
        if (hidup) setGalatHasil(e instanceof Error ? e.message : "Video hasil gagal diambil.");
      }
    })();
    return () => {
      hidup = false;
      if (alamat) URL.revokeObjectURL(alamat);
    };
  }, [idSelesai, ambilUlang]);

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

  const { template, batas, antrean } = data;
  const hasilIni = hasil && hasil.jobId === idSelesai ? hasil : null;

  // ===== Form =====
  async function pilihSumber(file: File | null) {
    if (inputSumberRef.current) inputSumberRef.current.value = "";
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
        body: JSON.stringify({ url: alamatSumber, hook: hook.trim(), sumber: teksSumber.trim() }),
      });
      const d = await bacaJson(res);
      if (!res.ok) {
        // Server menolak karena masih ada video lain milik akun ini (mis.
        // dikirim dari perangkat lain): segarkan supaya keadaannya terlihat.
        if (res.status === 409) setMuatUlang((n) => n + 1);
        throw new Error(pesanGalat(res.status, d, "Video gagal dikirim ke antrean."));
      }
      setData((lama) => (lama ? { ...lama, job: (d.job as JobTvr | null) ?? null, antrean: d.antrean ?? null } : lama));
      setLanjutUnggah(false);
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Video gagal dikirim ke antrean.");
    } finally {
      setMengirim(false);
    }
  }

  /**
   * Lepas video yang sedang dipegang: batal, edit ulang, atau sesudah
   * diunggah. ``isiUlang`` mengembalikan bahan & tulisannya ke form.
   */
  async function lepas(hapusSumber: boolean, isiUlang: boolean): Promise<boolean> {
    if (melepas) return false;
    setMelepas(true);
    const lama = job;
    try {
      const res = await apiFetch(`/api/tvr/jobs/saya?hapus_sumber=${hapusSumber ? "true" : "false"}`, { method: "DELETE" });
      if (!res.ok) throw new Error(pesanGalat(res.status, await bacaJson(res), "Gagal. Coba lagi."));
      setData((d) => (d ? { ...d, job: null, antrean: null } : d));
      setLanjutUnggah(false);
      setHasil(null);
      if (hapusSumber) {
        setUnggahan(null);
        setLink("");
        setHook("");
        setTeksSumber("");
        setNaskah("");
      } else if (isiUlang && lama) {
        setHook(lama.texts?.hook ?? "");
        setTeksSumber(lama.texts?.sumber ?? "");
        const asal = lama.sumber_url ?? "";
        if (asal.startsWith(AWALAN_UNGGAHAN)) {
          setModeSumber("unggah");
          setUnggahan((u) => (u && u.url === asal ? u : { url: asal, name: "Video yang diunggah sebelumnya" }));
        } else if (asal) {
          setModeSumber("link");
          setLink(asal);
        }
      }
      return true;
    } catch (e) {
      toast("error", "Gagal", e instanceof Error ? e.message : "Coba lagi sebentar.");
      return false;
    } finally {
      setMelepas(false);
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
        <p className="font-heading text-[14px] font-bold text-teks-utama">Edit Otomatis</p>
        <p className="mt-0.5 text-[11px] leading-snug text-teks-sekunder">
          {template.siap ? "Template terpasang otomatis di setiap video." : "Buat template dulu, lalu edit video otomatis."}
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

  let isi: React.ReactNode;
  if (!template.siap) {
    isi = (
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-[12px] leading-relaxed text-teks-sekunder">
        <li>Tekan tombol <b className="text-teks-utama">+</b> di kanan atas.</li>
        <li>Unggah kotak monas &amp; bingkai teratas (PNG), boom like share dan video penutup (opsional).</li>
        <li>Tandai posisi tulisan, lalu <b className="text-teks-utama">Simpan &amp; Tetapkan</b>.</li>
      </ol>
    );
  } else if (job && STATUS_AKTIF.includes(job.status)) {
    const sedang = job.status !== "queued";
    isi = (
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
              {antrean
                ? antrean.di_depan > 0
                  ? `${antrean.di_depan} video di depanmu`
                  : "Berikutnya dikerjakan"
                : "Menunggu giliran"}
            </p>
          </>
        )}
        {antrean && (
          <p className="mt-2 text-[11.5px] text-teks-utama">
            Perkiraan selesai: <b>{perkiraanWaktu(antrean.perkiraan_detik)}</b>
          </p>
        )}
        <p className="mt-1 text-[10.5px] leading-relaxed text-teks-sekunder">
          Boleh tinggalkan halaman ini — videonya tetap diproses dan menunggu di sini.
        </p>
        <button
          type="button"
          onClick={() => void lepas(false, true)}
          disabled={melepas}
          className="glass btn-tekan mt-2.5 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-bold text-teks-utama disabled:opacity-50"
        >
          {melepas ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          Batalkan
        </button>
      </div>
    );
  } else if (job && job.status === "done") {
    isi = (
      <div className="mt-3">
        {hasilIni ? (
          <video
            src={hasilIni.url}
            controls
            playsInline
            preload="metadata"
            className="mx-auto aspect-[9/16] max-h-[60vh] w-full max-w-[300px] rounded-2xl bg-black"
          />
        ) : galatHasil ? (
          <div className="glass-soft rounded-xl p-3 text-[12px] text-teks-utama">
            {galatHasil}
            <button
              type="button"
              onClick={() => setAmbilUlang((n) => n + 1)}
              className="glass btn-tekan mt-2 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-bold"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Ambil lagi
            </button>
          </div>
        ) : (
          <GlassSkeleton className="mx-auto aspect-[9/16] max-h-[60vh] w-full max-w-[300px] rounded-2xl" />
        )}
        <p className="mt-2 text-center text-[10.5px] text-teks-sekunder">
          Video jadi{job.durasi ? ` · ${Math.round(job.durasi)} detik` : ""}
          {job.size ? ` · ${Math.max(1, Math.round(job.size / 1_048_576))} MB` : ""} · disimpan sementara{" "}
          {batas.umur_simpan_jam} jam
        </p>
        {!lanjutUnggah ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setLanjutUnggah(true)}
              disabled={!hasilIni || melepas}
              className="btn-tekan flex h-11 items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-bold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
            >
              <Send className="h-4 w-4" /> Upload ke Sosmed
            </button>
            <button
              type="button"
              onClick={() => void lepas(false, true)}
              disabled={melepas}
              className="glass btn-tekan flex h-11 items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-bold text-teks-utama disabled:opacity-50"
            >
              {melepas ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Edit Ulang
            </button>
          </div>
        ) : (
          hasilIni && (
            <div className="mt-3">
              <div className="mb-2 flex items-center gap-2">
                <p className="flex-1 text-[12.5px] font-bold text-teks-utama">Upload ke sosmed</p>
                <button
                  type="button"
                  onClick={() => setLanjutUnggah(false)}
                  className="glass btn-tekan rounded-lg px-2.5 py-1 text-[11px] font-bold text-teks-sekunder"
                >
                  Kembali
                </button>
              </div>
              <UnggahSosmedSaya
                key={hasilIni.jobId}
                berkasAwal={hasilIni.file}
                hanyaForm
                onTerkirim={() => {
                  // Sudah di penyimpanan upload-post: salinan di server edit
                  // (hasil + video sumber) tidak diperlukan lagi.
                  void lepas(true, false);
                }}
              />
            </div>
          )
        )}
      </div>
    );
  } else {
    // Belum ada video, atau yang terakhir gagal/dibatalkan.
    const gagal = job && (job.status === "error" || job.status === "dibatalkan") ? job : null;
    isi = (
      <div className="mt-3">
        {gagal ? (
          <div className="mb-3 rounded-xl border border-gagal/30 bg-gagal/10 p-3" role="alert">
            <p className="text-[12.5px] font-bold text-teks-utama">
              {gagal.status === "dibatalkan" ? "Video dibatalkan" : "Video gagal dibuat"}
            </p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-teks-sekunder">
              {gagal.error || gagal.message || "Coba lagi."}
            </p>
            <button
              type="button"
              onClick={() => void lepas(false, true)}
              disabled={melepas}
              className="glass btn-tekan mt-2 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-bold text-teks-utama disabled:opacity-50"
            >
              {melepas ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Ubah &amp; coba lagi
            </button>
          </div>
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
              <Clapperboard className="h-3.5 w-3.5" /> Mulai edit otomatis
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["unggah", "link"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModeSumber(m)}
                  disabled={mengirim || persenSumber !== null}
                  aria-pressed={modeSumber === m}
                  className={cn(
                    "btn-tekan flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-bold",
                    modeSumber === m ? "bg-pri/15 text-pri" : "glass text-teks-sekunder",
                  )}
                >
                  {m === "unggah" ? <UploadCloud className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
                  {m === "unggah" ? "Unggah Sendiri" : "Pakai Link"}
                </button>
              ))}
            </div>

            {modeSumber === "unggah" ? (
              <>
                <input
                  ref={inputSumberRef}
                  type="file"
                  accept={batas.jenis_sumber.join(",")}
                  className="hidden"
                  onChange={(e) => void pilihSumber(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => inputSumberRef.current?.click()}
                  disabled={mengirim || persenSumber !== null}
                  className="glass btn-tekan mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-5 text-[13px] font-bold text-teks-utama disabled:opacity-60"
                >
                  {persenSumber !== null ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin text-pri" /> Mengunggah… {persenSumber}%
                    </>
                  ) : (
                    <>
                      <UploadCloud className="h-5 w-5 text-pri" />
                      <span className="truncate">{unggahan ? unggahan.name : "Pilih Video"}</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://… link TikTok / Instagram / Facebook"
                inputMode="url"
                disabled={mengirim}
                className="glass-input mt-2 h-11 w-full rounded-xl px-3 text-sm text-teks-utama"
              />
            )}
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-teks-sekunder">
              Maksimal {batas.maks_sumber_mb} MB; video di atas {Math.round(batas.maks_durasi_detik / 60)} menit dipotong.
              {modeSumber === "link" && " Link YouTube belum bisa dipakai dari server."}
            </p>

            <div className="mt-3 flex items-center gap-2">
              <p className="flex-1 text-[12px] font-bold text-teks-utama">Tulisan berita</p>
              <button
                type="button"
                onClick={() => setBukaNaskah((b) => !b)}
                disabled={mengirim}
                className="glass btn-tekan flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10.5px] font-bold text-teks-sekunder"
              >
                <Sparkles className="h-3 w-3" /> Buat dari caption
              </button>
            </div>
            {bukaNaskah && (
              <div className="glass-soft mt-2 rounded-xl p-2.5">
                <textarea
                  value={naskah}
                  onChange={(e) => setNaskah(e.target.value)}
                  rows={4}
                  maxLength={5000}
                  placeholder="Tempel caption / naskah berita di sini"
                  className="glass-input w-full rounded-lg p-2 text-[12.5px] text-teks-utama"
                />
                <button
                  type="button"
                  onClick={() => void buatHook()}
                  disabled={!naskah.trim() || membuatHook}
                  className="btn-tekan mt-1.5 flex items-center gap-1.5 rounded-lg bg-pri/15 px-3 py-1.5 text-[11.5px] font-bold text-pri disabled:opacity-50"
                >
                  {membuatHook ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Jadikan tulisan
                </button>
              </div>
            )}
            <textarea
              value={hook}
              onChange={(e) => setHook(e.target.value.slice(0, batas.maks_hook))}
              rows={3}
              placeholder="VIRAL! Tulis beritanya di sini — kata pertama berwarna merah"
              disabled={mengirim}
              className="glass-input mt-2 w-full rounded-xl p-3 text-[13px] text-teks-utama"
            />
            <p className="mt-0.5 text-right text-[10px] text-teks-sekunder">
              {hook.length}/{batas.maks_hook}
            </p>
            <input
              value={teksSumber}
              onChange={(e) => setTeksSumber(e.target.value.slice(0, batas.maks_sumber_teks))}
              placeholder="Kredit sumber (opsional), mis. SUMBER: @akun"
              disabled={mengirim}
              className="glass-input mt-1 h-10 w-full rounded-xl px-3 text-[12.5px] text-teks-utama"
            />

            <button
              type="button"
              onClick={() => void kirim()}
              disabled={mengirim || persenSumber !== null || kurang.length > 0}
              className="btn-tekan mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[13.5px] font-bold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #0EA5E9, #2563EB)" }}
            >
              {mengirim ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Wand2 className="h-4.5 w-4.5" />}
              Buat Video
            </button>
            {kurang.length > 0 && !mengirim && (
              <p className="mt-1.5 text-center text-[10.5px] text-teks-sekunder">Lengkapi: {kurang.join(", ")}.</p>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <GlassCard className="p-4">
      {kepala}
      {isi}
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
            setMuatUlang((n) => n + 1);
          }}
          onTersimpan={templateTersimpan}
        />
      )}
    </GlassCard>
  );
}

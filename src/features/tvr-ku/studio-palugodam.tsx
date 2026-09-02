"use client";

// ============================================================
// StudioPalugodam (3 Sep 2026) — meja kerja Admin PALUGODAM:
//   1. Sumber   : link TikTok/Instagram (diambil otomatis) atau unggah berkas
//   2. Review   : tonton video + caption asli
//   3. Teks     : caption inti + penjelasan → pilih profil → DeepSeek
//                 membuat judul, highlight, dan caption BERBEDA per profil
//   4. Render   : Creatomate merender satu versi per profil (template
//                 masing-masing)
//   5. Siaran   : sekali klik, tiap profil mengunggah versinya ke semua
//                 sosmed yang tertaut (Siaran Serentak)
// Tab "Template": peta profil ↔ ID template Creatomate + nama elemen.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Clapperboard,
  ExternalLink,
  Link2,
  Loader2,
  Radio,
  RefreshCw,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  UploadCloud,
  Wand2,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { PlatformIcon, labelPlatform } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import {
  getStudioPengaturan,
  getStudioProyek,
  getStudioProyekList,
  siapkanUnggahTvrku,
  studioPost,
  type StudioProfil,
  type StudioProyek,
  type StudioProyekRingkas,
  type StudioSiap,
} from "@/services";
import { jamWIB } from "@/lib/format";
import { cn } from "@/lib/utils";

const PLATFORM6 = ["instagram", "tiktok", "youtube", "facebook", "threads", "twitter"] as const;
const MAKS_MB = 50;

type Draft = Record<string, { judul: string; highlight: string; caption: string }>;

function KartuSiap({ siap }: { siap: StudioSiap | null }) {
  if (!siap) return null;
  const baris: [string, boolean, string][] = [
    ["DeepSeek", siap.deepseek, "DEEPSEEK_API_KEY"],
    ["Creatomate", siap.creatomate, "CREATOMATE_API_KEY"],
    ["upload-post", siap.uploadpost, "UPLOAD_POST_API_KEY"],
    ["Penyimpanan R2", siap.r2, "R2_*"],
  ];
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      {baris.map(([nama, ok, env]) => (
        <div key={nama} className={cn("rounded-xl px-2.5 py-2 text-[11px]", ok ? "bg-sukses/12" : "bg-gagal/10")}>
          <p className={cn("font-bold", ok ? "text-emerald-600 dark:text-emerald-400" : "text-gagal")}>
            {ok ? "✓" : "✗"} {nama}
          </p>
          <p className="text-[9.5px] text-teks-sekunder">{ok ? "siap" : `isi ${env}`}</p>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------
// Tab TEMPLATE
// ------------------------------------------------------------
function TabTemplate() {
  const [siap, setSiap] = useState<StudioSiap | null>(null);
  const [profil, setProfil] = useState<StudioProfil[] | null>(null);
  const [edit, setEdit] = useState<Record<string, { template_id: string; label: string; elemen_video: string; elemen_judul: string; elemen_highlight: string }>>({});
  const [sibuk, setSibuk] = useState("");

  function muat() {
    return getStudioPengaturan()
      .then((d) => {
        setSiap(d.siap);
        setProfil(d.profil);
        const e: typeof edit = {};
        for (const p of d.profil) {
          e[p.profil] = {
            template_id: p.template?.template_id ?? "",
            label: p.template?.label ?? "",
            elemen_video: p.template?.elemen_video ?? "Video",
            elemen_judul: p.template?.elemen_judul ?? "Judul",
            elemen_highlight: p.template?.elemen_highlight ?? "Highlight",
          };
        }
        setEdit(e);
      })
      .catch((e) => toast("error", "Gagal memuat pengaturan", e instanceof Error ? e.message : ""));
  }
  useEffect(() => {
    void muat();
  }, []);

  async function simpan(p: string) {
    const d = edit[p];
    if (!d?.template_id.trim()) {
      toast("peringatan", "Isi ID template Creatomate dulu");
      return;
    }
    setSibuk(p);
    try {
      await studioPost("template_simpan", { profil: p, ...d, aktif: true });
      toast("sukses", "Template tersimpan", p);
      await muat();
    } catch (e) {
      toast("error", "Gagal", e instanceof Error ? e.message : "");
    } finally {
      setSibuk("");
    }
  }
  async function hapus(p: string) {
    setSibuk(p);
    try {
      await studioPost("template_hapus", { profil: p });
      toast("sukses", "Template dilepas", p);
      await muat();
    } catch (e) {
      toast("error", "Gagal", e instanceof Error ? e.message : "");
    } finally {
      setSibuk("");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <KartuSiap siap={siap} />
      <GlassCard className="p-4">
        <p className="text-[12.5px] font-bold text-teks-utama">Peta profil ↔ template Creatomate</p>
        <p className="mt-1 text-[11px] leading-relaxed text-teks-sekunder">
          Tiap profil upload-post punya template Creatomate sendiri. Tempel <b>ID template</b> dari
          Creatomate, dan pastikan nama elemen di template sama dengan yang tertulis (bawaan:{" "}
          <b>Video</b> untuk klip, <b>Judul</b> dan <b>Highlight</b> untuk teks). Profil tanpa
          template tidak bisa dirender.
        </p>
        {profil === null ? (
          <GlassSkeleton className="mt-3 h-24 rounded-xl" />
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {profil.map((p) => {
              const d = edit[p.profil];
              if (!d) return null;
              return (
                <div key={p.profil} className="glass-soft rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-bold text-teks-utama">{p.profil}</span>
                      <span className="flex items-center gap-1">
                        {PLATFORM6.map((pf) => (
                          <PlatformIcon key={pf} platform={pf} className={cn("h-3 w-3", p.akun[pf] ? "text-emerald-500" : "text-teks-sekunder/30")} />
                        ))}
                        {p.nama ? <span className="ml-1 truncate text-[10px] text-teks-sekunder">{p.nama}</span> : null}
                      </span>
                    </span>
                    {p.template ? <StatusBadge label="ada template" warna="hijau" /> : <StatusBadge label="belum" warna="kuning" />}
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    <input
                      value={d.template_id}
                      onChange={(e) => setEdit((s) => ({ ...s, [p.profil]: { ...d, template_id: e.target.value } }))}
                      placeholder="ID template Creatomate"
                      className="glass-input h-10 rounded-xl px-3 text-[12px] text-teks-utama"
                    />
                    <input
                      value={d.label}
                      onChange={(e) => setEdit((s) => ({ ...s, [p.profil]: { ...d, label: e.target.value } }))}
                      placeholder="Label (opsional)"
                      className="glass-input h-10 rounded-xl px-3 text-[12px] text-teks-utama"
                    />
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                    {(
                      [
                        ["elemen_video", "Elemen video"],
                        ["elemen_judul", "Elemen judul"],
                        ["elemen_highlight", "Elemen highlight"],
                      ] as const
                    ).map(([k, ph]) => (
                      <input
                        key={k}
                        value={d[k]}
                        onChange={(e) => setEdit((s) => ({ ...s, [p.profil]: { ...d, [k]: e.target.value } }))}
                        placeholder={ph}
                        className="glass-input h-9 rounded-xl px-2 text-[11px] text-teks-utama"
                      />
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void simpan(p.profil)}
                      disabled={Boolean(sibuk)}
                      className="btn-tekan flex flex-1 items-center justify-center gap-1 rounded-xl py-2 text-[12px] font-bold text-white disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
                    >
                      {sibuk === p.profil ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Simpan
                    </button>
                    {p.template ? (
                      <button
                        type="button"
                        onClick={() => void hapus(p.profil)}
                        disabled={Boolean(sibuk)}
                        className="btn-tekan rounded-xl bg-gagal/12 px-3 text-[12px] font-bold text-gagal disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {profil.length === 0 && <p className="text-[12px] text-teks-sekunder">Belum ada profil upload-post.</p>}
          </div>
        )}
      </GlassCard>
    </div>
  );
}

// ------------------------------------------------------------
// Editor satu proyek
// ------------------------------------------------------------
function EditorProyek({ id, profilSemua, onTutup }: { id: string; profilSemua: StudioProfil[]; onTutup: () => void }) {
  const [data, setData] = useState<StudioProyek | null>(null);
  const [captionInti, setCaptionInti] = useState("");
  const [penjelasan, setPenjelasan] = useState("");
  const [pilih, setPilih] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Draft>({});
  const [platform, setPlatform] = useState<Set<string>>(new Set(PLATFORM6));
  const [pakaiJadwal, setPakaiJadwal] = useState(false);
  const [jadwal, setJadwal] = useState("");
  const [sibuk, setSibuk] = useState("");
  const terisi = useRef(false);

  function muat() {
    return getStudioProyek(id)
      .then((d) => {
        setData(d);
        // Draft teks per profil mengikuti server (setelah generate/simpan).
        const dr: Draft = {};
        for (const it of d.item) dr[it.profil] = { judul: it.judul, highlight: it.highlight, caption: it.caption };
        setDraft(dr);
        if (!terisi.current) {
          terisi.current = true;
          setCaptionInti(d.proyek.caption_inti || d.proyek.sumber_caption);
          setPenjelasan(d.proyek.penjelasan);
          const awal = d.item.length > 0
            ? d.item.map((i) => i.profil)
            : profilSemua.filter((p) => p.template?.aktif).map((p) => p.profil);
          setPilih(new Set(awal));
        }
      })
      .catch((e) => toast("error", "Gagal memuat proyek", e instanceof Error ? e.message : ""));
  }
  useEffect(() => {
    void muat();
  }, [id]);
  const adaRendering = (data?.item ?? []).some((i) => i.render_status === "rendering");
  const adaSiaranMenunggu = (data?.siaran?.ringkas.menunggu ?? 0) > 0;
  useEffect(() => {
    if (!adaRendering && !adaSiaranMenunggu) return;
    const t = setInterval(() => {
      void muat();
    }, 8_000);
    return () => clearInterval(t);
  }, [adaRendering, adaSiaranMenunggu]);

  const profilTampil = useMemo(() => profilSemua, [profilSemua]);
  const jumlahSukses = (data?.item ?? []).filter((i) => i.render_status === "sukses").length;

  async function jalankan(label: string, aksi: string, body: Record<string, unknown>, pesanSukses?: string) {
    if (sibuk) return;
    setSibuk(label);
    try {
      const r = await studioPost(aksi, { proyek_id: id, ...body });
      if (pesanSukses) toast("sukses", pesanSukses);
      await muat();
      return r;
    } catch (e) {
      toast("error", `Gagal: ${label}`, e instanceof Error ? e.message : "");
    } finally {
      setSibuk("");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {!data ? (
        <GlassSkeleton className="h-40 rounded-2xl" />
      ) : (
        <>
          {/* 2. Review */}
          <GlassCard className="p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12.5px] font-bold text-teks-utama">1 · Review video sumber</p>
              <button type="button" onClick={onTutup} className="btn-tekan text-[11px] font-bold text-pri">
                ← Daftar proyek
              </button>
            </div>
            {data.proyek.sumber_url ? (
              <video src={data.proyek.sumber_url} controls playsInline className="mt-2 max-h-72 w-full rounded-xl bg-black" />
            ) : (
              <p className="mt-2 text-[11px] text-gagal">Berkas sumber sudah disapu (umur 3 hari).</p>
            )}
            {data.proyek.sumber_link ? (
              <a href={data.proyek.sumber_link} target="_blank" rel="noopener noreferrer" className="mt-1.5 flex items-center gap-1 text-[10.5px] text-teks-sekunder">
                <ExternalLink className="h-3 w-3" /> {data.proyek.sumber_link}
              </a>
            ) : null}
            {data.proyek.sumber_caption ? (
              <p className="mt-2 rounded-xl bg-black/5 px-3 py-2 text-[11px] leading-relaxed text-teks-utama dark:bg-white/10">
                <span className="font-bold">Caption asli: </span>
                {data.proyek.sumber_caption}
              </p>
            ) : null}
          </GlassCard>

          {/* 3. Teks & profil */}
          <GlassCard className="p-4">
            <p className="text-[12.5px] font-bold text-teks-utama">2 · Caption inti, penjelasan & profil tujuan</p>
            <textarea
              value={captionInti}
              onChange={(e) => setCaptionInti(e.target.value)}
              rows={3}
              maxLength={2200}
              placeholder="Caption inti (dasar semua caption & judul)"
              className="glass-input mt-2 w-full rounded-xl px-3 py-2 text-[12.5px] text-teks-utama"
            />
            <textarea
              value={penjelasan}
              onChange={(e) => setPenjelasan(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="Penjelasan singkat: ini video tentang apa? (membantu DeepSeek membuat judul)"
              className="glass-input mt-2 w-full rounded-xl px-3 py-2 text-[12.5px] text-teks-utama"
            />
            <div className="mt-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold text-teks-sekunder">Profil tujuan ({pilih.size}):</p>
              <button
                type="button"
                onClick={() => setPilih(new Set(profilTampil.filter((p) => p.template?.aktif).map((p) => p.profil)))}
                className="btn-tekan text-[11px] font-bold text-pri"
              >
                Pilih semua yang punya template
              </button>
            </div>
            <div className="scrollbar-tipis mt-1.5 flex max-h-56 flex-col gap-1 overflow-y-auto">
              {profilTampil.map((p) => {
                const aktif = pilih.has(p.profil);
                return (
                  <button
                    key={p.profil}
                    type="button"
                    onClick={() =>
                      setPilih((s) => {
                        const n = new Set(s);
                        if (n.has(p.profil)) n.delete(p.profil);
                        else n.add(p.profil);
                        return n;
                      })
                    }
                    className={cn("btn-tekan flex items-center gap-2 rounded-xl px-2 py-1.5 text-left", aktif ? "bg-pri/10" : "")}
                  >
                    <span className={cn("flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md border", aktif ? "border-pri bg-pri text-white" : "border-black/20 dark:border-white/25")}>
                      {aktif && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-teks-utama">{p.profil}</span>
                    {p.template ? <span className="text-[9.5px] text-emerald-600 dark:text-emerald-400">template ✓</span> : <span className="text-[9.5px] text-gagal">tanpa template</span>}
                    <span className="angka-tab text-[10px] text-teks-sekunder">{p.tertaut}/6</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => void jalankan("simpan", "teks_simpan", { caption_inti: captionInti, penjelasan, profil: [...pilih] }, "Teks & profil tersimpan")}
              disabled={Boolean(sibuk) || pilih.size === 0}
              className="glass btn-tekan mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl text-[12.5px] font-bold text-teks-utama disabled:opacity-50"
            >
              {sibuk === "simpan" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-pri" />}
              Simpan & siapkan {pilih.size} profil
            </button>
          </GlassCard>

          {/* 4. Generate + tabel per profil */}
          {data.item.length > 0 && (
            <GlassCard className="p-4">
              <p className="text-[12.5px] font-bold text-teks-utama">3 · Judul, highlight & caption per profil (DeepSeek)</p>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {(
                  [
                    ["judul", "Generate judul"],
                    ["highlight", "Generate highlight"],
                    ["caption", "Generate caption"],
                  ] as const
                ).map(([jenis, label]) => (
                  <button
                    key={jenis}
                    type="button"
                    onClick={() => void jalankan(label, "generate", { jenis }, `${label} selesai untuk ${data.item.length} profil`)}
                    disabled={Boolean(sibuk)}
                    className="btn-tekan flex items-center justify-center gap-1 rounded-xl bg-pri/12 py-2 text-[11px] font-bold text-pri disabled:opacity-50"
                  >
                    {sibuk === label ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {data.item.map((it) => {
                  const d = draft[it.profil] ?? { judul: "", highlight: "", caption: "" };
                  return (
                    <div key={it.id} className="glass-soft rounded-xl p-2.5">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-[12px] font-bold text-teks-utama">
                          {it.profil}
                          {it.nama ? <span className="font-normal text-teks-sekunder"> · {it.nama}</span> : null}
                        </p>
                        <StatusBadge
                          label={it.render_status === "sukses" ? "render ✓" : it.render_status === "rendering" ? "merender…" : it.render_status === "gagal" ? "render gagal" : "belum render"}
                          warna={it.render_status === "sukses" ? "hijau" : it.render_status === "rendering" ? "kuning" : it.render_status === "gagal" ? "merah" : "netral"}
                          berkedip={it.render_status === "rendering"}
                        />
                      </div>
                      <input
                        value={d.judul}
                        onChange={(e) => setDraft((s) => ({ ...s, [it.profil]: { ...d, judul: e.target.value } }))}
                        maxLength={100}
                        placeholder="Judul overlay"
                        className="glass-input mt-1.5 h-9 w-full rounded-xl px-2.5 text-[12px] text-teks-utama"
                      />
                      <input
                        value={d.highlight}
                        onChange={(e) => setDraft((s) => ({ ...s, [it.profil]: { ...d, highlight: e.target.value.toUpperCase() } }))}
                        maxLength={40}
                        placeholder="HIGHLIGHT (mis. VIRAL, HARU)"
                        className="glass-input mt-1.5 h-9 w-full rounded-xl px-2.5 text-[12px] text-teks-utama"
                      />
                      <textarea
                        value={d.caption}
                        onChange={(e) => setDraft((s) => ({ ...s, [it.profil]: { ...d, caption: e.target.value } }))}
                        rows={2}
                        maxLength={2200}
                        placeholder="Caption untuk profil ini"
                        className="glass-input mt-1.5 w-full rounded-xl px-2.5 py-1.5 text-[12px] text-teks-utama"
                      />
                      {it.pesan && it.render_status === "gagal" ? <p className="mt-1 text-[10.5px] text-gagal">{it.pesan}</p> : null}
                      {it.render_url ? (
                        <a href={it.render_url} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 text-[10.5px] font-bold text-pri">
                          <ExternalLink className="h-3 w-3" /> Lihat hasil render
                        </a>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() =>
                  void jalankan("simpan teks", "item_simpan", { item: Object.entries(draft).map(([profil, d]) => ({ profil, ...d })) }, "Teks per profil tersimpan")
                }
                disabled={Boolean(sibuk)}
                className="glass btn-tekan mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl text-[12.5px] font-bold text-teks-utama disabled:opacity-50"
              >
                {sibuk === "simpan teks" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-pri" />}
                Simpan teks per profil
              </button>
            </GlassCard>
          )}

          {/* 5. Render */}
          {data.item.length > 0 && (
            <GlassCard className="p-4">
              <p className="text-[12.5px] font-bold text-teks-utama">4 · Render Creatomate</p>
              <p className="mt-1 text-[11px] text-teks-sekunder">
                Satu versi per profil memakai template masing-masing. Simpan teks dulu — yang dipakai adalah teks tersimpan.
                Status diperbarui otomatis tiap 8 detik.
              </p>
              <button
                type="button"
                onClick={() =>
                  void jalankan("render", "render", {}).then((r) => {
                    const g = (r?.gagal as { profil: string; pesan: string }[] | undefined) ?? [];
                    if (r) toast(g.length ? "peringatan" : "sukses", `${r.dimulai ?? 0} render dimulai`, g.length ? `${g.length} gagal: ${g.map((x) => x.profil).join(", ")}` : "");
                  })
                }
                disabled={Boolean(sibuk) || adaRendering}
                className="btn-tekan mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #7C3AED, #4F46E5)" }}
              >
                {sibuk === "render" || adaRendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
                {adaRendering ? "Sedang merender…" : `Render ${data.item.filter((i) => i.render_status !== "sukses").length} versi`}
              </button>
              <p className="mt-2 text-center text-[10.5px] text-teks-sekunder">{jumlahSukses}/{data.item.length} versi siap</p>
            </GlassCard>
          )}

          {/* 6. Siaran */}
          {jumlahSukses > 0 && (
            <GlassCard className="p-4">
              <p className="text-[12.5px] font-bold text-teks-utama">5 · Siaran ke semua profil</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PLATFORM6.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() =>
                      setPlatform((s) => {
                        const n = new Set(s);
                        if (n.has(p)) n.delete(p);
                        else n.add(p);
                        return n;
                      })
                    }
                    aria-pressed={platform.has(p)}
                    className={cn("btn-tekan flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold", platform.has(p) ? "text-white" : "glass text-teks-sekunder")}
                    style={platform.has(p) ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" } : undefined}
                  >
                    <PlatformIcon platform={p} size={12} />
                    {labelPlatform(p)}
                  </button>
                ))}
              </div>
              <label className="mt-3 flex items-center gap-2 text-[12px] text-teks-utama">
                <input type="checkbox" checked={pakaiJadwal} onChange={(e) => setPakaiJadwal(e.target.checked)} className="h-4 w-4 accent-[#DC2626]" />
                Jadwalkan (5 menit – 7 hari)
              </label>
              {pakaiJadwal && (
                <input type="datetime-local" value={jadwal} onChange={(e) => setJadwal(e.target.value)} className="glass-input mt-2 h-11 w-full rounded-xl px-3 text-sm text-teks-utama" />
              )}
              {data.siaran ? (
                <div className="mt-3">
                  <p className="text-[11px] text-teks-sekunder">
                    Siaran #{data.siaran.id}: {data.siaran.ringkas.terkirim}/{data.siaran.ringkas.total} terkirim
                    {data.siaran.ringkas.gagal ? ` · ${data.siaran.ringkas.gagal} gagal` : ""}
                    {data.siaran.ringkas.menunggu ? ` · ${data.siaran.ringkas.menunggu} menunggu` : ""}
                  </p>
                  <div className="mt-1.5 flex flex-col gap-1">
                    {data.siaran.item.map((it) => (
                      <div key={it.id} className="flex items-center gap-2 rounded-lg bg-black/[0.03] px-2 py-1.5 dark:bg-white/[0.05]">
                        <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-teks-utama">{it.profil}</span>
                        {it.pesan && it.status !== "terkirim" ? <span className="truncate text-[10px] text-gagal">{it.pesan}</span> : null}
                        <StatusBadge
                          label={it.status === "diproses" ? "mengirim…" : it.status}
                          warna={it.status === "terkirim" ? "hijau" : it.status === "gagal" ? "merah" : it.status === "dibatalkan" ? "netral" : "kuning"}
                          berkedip={it.status === "diproses"}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  void jalankan("siaran", "siaran", { platforms: [...platform], jadwal: pakaiJadwal && jadwal ? new Date(jadwal).toISOString() : undefined }, "Siaran dimulai — status per profil di bawah")
                }
                disabled={Boolean(sibuk) || platform.size === 0 || Boolean(data.siaran && data.siaran.ringkas.menunggu > 0)}
                className="btn-tekan mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[13.5px] font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
              >
                {sibuk === "siaran" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {data.siaran ? "Kirim ulang ke semua profil" : `Upload ke ${jumlahSukses} profil × sosmed tertaut`}
              </button>
            </GlassCard>
          )}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Tab PROYEK: daftar + sumber baru
// ------------------------------------------------------------
function TabProyek({ profilSemua, siap }: { profilSemua: StudioProfil[]; siap: StudioSiap | null }) {
  const [daftar, setDaftar] = useState<StudioProyekRingkas[] | null>(null);
  const [buka, setBuka] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [berkas, setBerkas] = useState<File | null>(null);
  const [tahap, setTahap] = useState<"" | "link" | "unggah">("");
  const [persen, setPersen] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  function muat() {
    return getStudioProyekList()
      .then((d) => setDaftar(d.data))
      .catch(() => setDaftar([]));
  }
  useEffect(() => {
    void muat();
  }, []);

  async function dariLink() {
    if (!link.trim() || tahap) return;
    setTahap("link");
    try {
      const r = await studioPost("sumber_link", { link: link.trim() });
      toast("sukses", "Video diambil", "Tonton dulu, lalu isi caption inti.");
      setLink("");
      await muat();
      setBuka(String(r.id));
    } catch (e) {
      toast("error", "Gagal mengambil video", e instanceof Error ? e.message : "");
    } finally {
      setTahap("");
    }
  }

  async function dariBerkas() {
    if (!berkas || tahap) return;
    if (berkas.size > MAKS_MB * 1024 * 1024) {
      toast("peringatan", `Maksimal ${MAKS_MB} MB`);
      return;
    }
    setTahap("unggah");
    setPersen(0);
    try {
      const siapU = await siapkanUnggahTvrku(berkas.name, berkas.size);
      await new Promise<void>((selesai, gagal) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", siapU.url);
        xhr.setRequestHeader("content-type", berkas.type || "video/mp4");
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setPersen(Math.round((100 * ev.loaded) / ev.total));
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? selesai() : gagal(new Error("Penyimpanan menolak berkas.")));
        xhr.onerror = () => gagal(new Error("Koneksi terputus saat mengunggah."));
        xhr.send(berkas);
      });
      const r = await studioPost("sumber_berkas", {
        ...(siapU.cara === "r2" ? { r2_key: siapU.r2_key } : { path: siapU.path }),
        ukuran: berkas.size,
      });
      toast("sukses", "Berkas tersimpan");
      setBerkas(null);
      if (inputRef.current) inputRef.current.value = "";
      await muat();
      setBuka(String(r.id));
    } catch (e) {
      toast("error", "Gagal mengunggah", e instanceof Error ? e.message : "");
    } finally {
      setTahap("");
    }
  }

  async function hapus(id: string) {
    try {
      await studioPost("hapus", { proyek_id: id });
      toast("sukses", "Proyek dihapus");
      await muat();
    } catch (e) {
      toast("error", "Gagal menghapus", e instanceof Error ? e.message : "");
    }
  }

  if (buka) return <EditorProyek id={buka} profilSemua={profilSemua} onTutup={() => { setBuka(null); void muat(); }} />;

  return (
    <div className="flex flex-col gap-3">
      <KartuSiap siap={siap} />
      <GlassCard className="p-4">
        <p className="text-[12.5px] font-bold text-teks-utama">Proyek baru · sumber video</p>
        <div className="glass-input mt-2 flex h-11 items-center gap-2 rounded-xl px-3">
          <Link2 className="h-4 w-4 text-teks-sekunder" />
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Link video TikTok / Instagram"
            inputMode="url"
            disabled={Boolean(tahap)}
            className="h-full w-full bg-transparent text-sm text-teks-utama outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => void dariLink()}
          disabled={!link.trim() || Boolean(tahap)}
          className="btn-tekan mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
        >
          {tahap === "link" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {tahap === "link" ? "Mengambil video…" : "Ambil video dari link"}
        </button>
        <p className="my-2 text-center text-[10.5px] text-teks-sekunder">— atau —</p>
        <input ref={inputRef} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={(e) => setBerkas(e.target.files?.[0] ?? null)} />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={Boolean(tahap)}
            className="glass btn-tekan flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-[12px] font-bold text-teks-utama disabled:opacity-60"
          >
            <UploadCloud className="h-4 w-4 text-pri" />
            {berkas ? `${berkas.name} (${Math.round(berkas.size / 1_048_576)} MB)` : "Pilih berkas video"}
          </button>
          <button
            type="button"
            onClick={() => void dariBerkas()}
            disabled={!berkas || Boolean(tahap)}
            className="btn-tekan rounded-xl bg-pri/12 px-4 text-[12px] font-bold text-pri disabled:opacity-50"
          >
            {tahap === "unggah" ? `${persen}%` : "Unggah"}
          </button>
        </div>
      </GlassCard>

      {daftar === null ? (
        <GlassSkeleton className="h-20 rounded-2xl" />
      ) : daftar.length > 0 ? (
        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] font-bold text-teks-utama">Proyek terakhir</p>
            <button type="button" onClick={() => void muat()} aria-label="Segarkan" className="btn-tekan p-1 text-teks-sekunder">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 flex flex-col gap-1.5">
            {daftar.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-black/[0.03] dark:hover:bg-white/[0.05]">
                <button type="button" onClick={() => setBuka(p.id)} className="btn-tekan min-w-0 flex-1 text-left">
                  <span className="block truncate text-[12px] font-semibold text-teks-utama">{p.ringkas}</span>
                  <span className="block text-[10px] text-teks-sekunder">
                    {jamWIB(p.dibuat_pada)} · {p.sumber_platform || "?"} · {p.jumlah_item} profil · {p.status}
                  </span>
                </button>
                <button type="button" onClick={() => void hapus(p.id)} aria-label="Hapus proyek" className="btn-tekan p-1.5 text-teks-sekunder/70">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </GlassCard>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------
export function StudioPalugodam() {
  const [tab, setTab] = useState<"proyek" | "template">("proyek");
  const [pengaturan, setPengaturan] = useState<{ siap: StudioSiap; profil: StudioProfil[] } | null>(null);

  useEffect(() => {
    let hidup = true;
    getStudioPengaturan()
      .then((d) => hidup && setPengaturan({ siap: d.siap, profil: d.profil }))
      .catch((e) => hidup && toast("error", "Studio gagal dimuat", e instanceof Error ? e.message : ""));
    return () => {
      hidup = false;
    };
  }, [tab]);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/10">
        {(
          [
            ["proyek", "Proyek", Radio],
            ["template", "Template Creatomate", Settings2],
          ] as const
        ).map(([k, label, Ikon]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            aria-pressed={tab === k}
            className={cn("btn-tekan flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-bold", tab === k ? "bg-white text-teks-utama shadow-sm dark:bg-white/15" : "text-teks-sekunder")}
          >
            <Ikon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
      {tab === "template" ? (
        <TabTemplate />
      ) : pengaturan ? (
        <TabProyek profilSemua={pengaturan.profil} siap={pengaturan.siap} />
      ) : (
        <GlassSkeleton className="h-40 rounded-2xl" />
      )}
    </div>
  );
}

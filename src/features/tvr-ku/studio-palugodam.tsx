"use client";

// ============================================================
// StudioPalugodam (3 Sep 2026) — meja kerja Admin PALUGODAM, tiga FASE:
//   1 UNGGAH  : link TikTok/Instagram (diambil otomatis) atau berkas → review
//   2 RENDER  : caption inti + penjelasan → pilih profil PALUGODAM → DeepSeek
//               membuat judul/highlight/caption BERBEDA per profil →
//               Creatomate merender satu versi per profil (template masing-masing)
//   3 SIARAN  : sekali klik, tiap profil mengunggah versinya ke semua sosmed
//               yang tertaut (Siaran Serentak)
// Profil yang tampil HANYA milik anggota Divisi PALUGODAM (server juga
// menolak profil lain). Tab "Template": peta profil ↔ ID template Creatomate.
//
// SATU KLIK (3 Sep 2026):
//   AUTO EDIT   → server memilih SEMUA profil PALUGODAM bertemplate, DeepSeek
//                 membuat teksnya, Creatomate merender semuanya.
//   AUTO UPLOAD → server menunggu render selesai lalu menyiarkan ke semua
//                 sosmed tertaut tiap profil, langsung.
//   Sakelar "lanjut otomatis": begitu render selesai, AUTO UPLOAD dipicu sendiri.
// ============================================================

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  Clapperboard,
  ExternalLink,
  Link2,
  Loader2,
  Radio,
  RefreshCw,
  Rocket,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  UploadCloud,
  Users,
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
import { TabAnggota } from "./studio-anggota";
import { StudioPerAkun } from "./studio-per-akun";
import { cn } from "@/lib/utils";

const PLATFORM6 = [
  "instagram",
  "tiktok",
  "youtube",
  "facebook",
  "threads",
  "twitter",
] as const;
const MAKS_MB = 75;
const MERAH = "linear-gradient(135deg, #DC2626, #B91C1C)";
const UNGU = "linear-gradient(135deg, #7C3AED, #4F46E5)";

type Fase = 1 | 2 | 3;
type Draft = Record<
  string,
  { judul: string; highlight: string; caption: string }
>;

// ------------------------------------------------------------
// Kesiapan layanan (hanya tampil bila ada yang belum siap)
// ------------------------------------------------------------
function KartuSiap({ siap }: { siap: StudioSiap | null }) {
  if (!siap) return null;
  const baris: [string, boolean, string][] = [
    ["DeepSeek", siap.deepseek, "DEEPSEEK_API_KEY"],
    ["Creatomate", siap.creatomate, "CREATOMATE_API_KEY"],
    ["upload-post", siap.uploadpost, "UPLOAD_POST_API_KEY"],
    ["Penyimpanan", siap.r2, "R2_*"],
  ];
  if (baris.every(([, ok]) => ok)) return null;
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      {baris.map(([nama, ok, env]) => (
        <div
          key={nama}
          className={cn(
            "rounded-xl px-2.5 py-2 text-[11px]",
            ok ? "bg-sukses/12" : "bg-gagal/10",
          )}
        >
          <p
            className={cn(
              "font-bold",
              ok ? "text-emerald-600 dark:text-emerald-400" : "text-gagal",
            )}
          >
            {ok ? "✓" : "✗"} {nama}
          </p>
          <p className="text-[9.5px] text-teks-sekunder">
            {ok ? "siap" : `isi ${env}`}
          </p>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------
// Penunjuk fase
// ------------------------------------------------------------
function PenunjukFase({
  fase,
  bolehKe,
  onPilih,
}: {
  fase: Fase;
  bolehKe: (f: Fase) => boolean;
  onPilih: (f: Fase) => void;
}) {
  const daftar: [Fase, string, typeof UploadCloud][] = [
    [1, "Unggah", UploadCloud],
    [2, "Render", Clapperboard],
    [3, "Siaran", Radio],
  ];
  return (
    <div className="flex items-center gap-1">
      {daftar.map(([f, label, Ikon], i) => {
        const aktif = fase === f;
        const lewat = fase > f;
        const boleh = bolehKe(f);
        return (
          <div key={f} className="flex flex-1 items-center gap-1">
            <button
              type="button"
              onClick={() => boleh && onPilih(f)}
              disabled={!boleh}
              aria-current={aktif ? "step" : undefined}
              className={cn(
                "btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[11.5px] font-bold disabled:cursor-not-allowed disabled:opacity-40",
                aktif
                  ? "text-white"
                  : lewat
                    ? "bg-sukses/12 text-emerald-600 dark:text-emerald-400"
                    : "glass text-teks-sekunder",
              )}
              style={aktif ? { background: MERAH } : undefined}
            >
              {lewat ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Ikon className="h-3.5 w-3.5" />
              )}
              {f} · {label}
            </button>
            {i < daftar.length - 1 && (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-teks-sekunder/50" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------
// FASE 1 — Unggah (sumber baru)
// ------------------------------------------------------------
function FormSumber({ onSelesai }: { onSelesai: (id: string) => void }) {
  const [link, setLink] = useState("");
  const [berkas, setBerkas] = useState<File | null>(null);
  const [tahap, setTahap] = useState<"" | "link" | "unggah">("");
  const [persen, setPersen] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  async function dariLink() {
    if (!link.trim() || tahap) return;
    setTahap("link");
    try {
      const r = await studioPost("sumber_link", { link: link.trim() });
      toast(
        "sukses",
        "Video diambil",
        "Tonton dulu, lalu lanjut ke fase Render.",
      );
      setLink("");
      onSelesai(String(r.id));
    } catch (e) {
      toast(
        "error",
        "Gagal mengambil video",
        e instanceof Error ? e.message : "",
      );
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
          if (ev.lengthComputable)
            setPersen(Math.round((100 * ev.loaded) / ev.total));
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? selesai()
            : gagal(new Error("Penyimpanan menolak berkas."));
        xhr.onerror = () =>
          gagal(new Error("Koneksi terputus saat mengunggah."));
        xhr.send(berkas);
      });
      const r = await studioPost("sumber_berkas", {
        ...(siapU.cara === "r2"
          ? { r2_key: siapU.r2_key }
          : { path: siapU.path }),
        ukuran: berkas.size,
      });
      toast("sukses", "Berkas tersimpan");
      setBerkas(null);
      if (inputRef.current) inputRef.current.value = "";
      onSelesai(String(r.id));
    } catch (e) {
      toast("error", "Gagal mengunggah", e instanceof Error ? e.message : "");
    } finally {
      setTahap("");
    }
  }

  return (
    <GlassCard className="p-4">
      <p className="text-[12.5px] font-bold text-teks-utama">
        Fase 1 · Unggah video sumber
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-teks-sekunder">
        Tempel link video (TikTok/Instagram) — video asli diambil otomatis tanpa
        watermark beserta caption aslinya — atau unggah berkas video sendiri
        (maks {MAKS_MB} MB).
      </p>
      <div className="glass-input mt-3 flex h-11 items-center gap-2 rounded-xl px-3">
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
        style={{ background: MERAH }}
      >
        {tahap === "link" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Wand2 className="h-4 w-4" />
        )}
        {tahap === "link" ? "Mengambil video…" : "Ambil video dari link"}
      </button>
      <p className="my-2 text-center text-[10.5px] text-teks-sekunder">
        — atau —
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        className="hidden"
        onChange={(e) => setBerkas(e.target.files?.[0] ?? null)}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={Boolean(tahap)}
          className="glass btn-tekan flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-[12px] font-bold text-teks-utama disabled:opacity-60"
        >
          <UploadCloud className="h-4 w-4 text-pri" />
          {berkas
            ? `${berkas.name} (${Math.round(berkas.size / 1_048_576)} MB)`
            : "Pilih berkas video"}
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
  );
}

// ------------------------------------------------------------
// Editor proyek (fase 1 review → 2 render → 3 siaran)
// ------------------------------------------------------------
function EditorProyek({
  id,
  profilSemua,
  onTutup,
}: {
  id: string;
  profilSemua: StudioProfil[];
  onTutup: () => void;
}) {
  const [data, setData] = useState<StudioProyek | null>(null);
  const [fase, setFase] = useState<Fase>(1);
  const [captionInti, setCaptionInti] = useState("");
  const [penjelasan, setPenjelasan] = useState("");
  const [sumberAkun, setSumberAkun] = useState("");
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
        const dr: Draft = {};
        for (const it of d.item)
          dr[it.profil] = {
            judul: it.judul,
            highlight: it.highlight,
            caption: it.caption,
          };
        setDraft(dr);
        if (!terisi.current) {
          terisi.current = true;
          setCaptionInti(d.proyek.caption_inti || d.proyek.sumber_caption);
          setPenjelasan(d.proyek.penjelasan);
          setSumberAkun(d.proyek.sumber_akun);
          const awal =
            d.item.length > 0
              ? d.item.map((i) => i.profil)
              : profilSemua
                  .filter((p) => p.template?.aktif)
                  .map((p) => p.profil);
          setPilih(new Set(awal));
          // Fase awal mengikuti kemajuan proyek.
          setFase(
            d.proyek.status === "siaran"
              ? 3
              : d.proyek.status === "sumber"
                ? 1
                : 2,
          );
        }
      })
      .catch((e) =>
        toast(
          "error",
          "Gagal memuat proyek",
          e instanceof Error ? e.message : "",
        ),
      );
  }
  useEffect(() => {
    void muat();
  }, [id]);

  const item = data?.item ?? [];
  const adaRendering = item.some((i) => i.render_status === "rendering");
  const jumlahSukses = item.filter((i) => i.render_status === "sukses").length;
  const adaSiaranMenunggu = (data?.siaran?.ringkas.menunggu ?? 0) > 0;
  useEffect(() => {
    if (!adaRendering && !adaSiaranMenunggu) return;
    const t = setInterval(() => {
      void muat();
    }, 8_000);
    return () => clearInterval(t);
  }, [adaRendering, adaSiaranMenunggu]);

  async function jalankan(
    label: string,
    aksi: string,
    body: Record<string, unknown>,
    pesanSukses?: string,
  ) {
    if (sibuk) return null;
    setSibuk(label);
    try {
      const r = await studioPost(aksi, { proyek_id: id, ...body });
      if (pesanSukses) toast("sukses", pesanSukses);
      await muat();
      return r;
    } catch (e) {
      toast("error", `Gagal: ${label}`, e instanceof Error ? e.message : "");
      return null;
    } finally {
      setSibuk("");
    }
  }

  function bolehKe(f: Fase): boolean {
    if (f === 1) return true;
    // Mode per akun: video ada di tiap baris akun, bukan di induk proyek.
    if (f === 2)
      return (
        data?.proyek.mode === "per_akun" || Boolean(data?.proyek.sumber_url)
      );
    return jumlahSukses > 0;
  }

  // ---- SATU KLIK: auto edit / auto upload (3 Sep 2026) ----
  const [autoLanjut, setAutoLanjut] = useState(false);
  // true hanya setelah AUTO EDIT ditekan di sesi ini — supaya sakelar
  // "lanjut otomatis" tidak pernah mengunggah proyek lama tanpa sengaja.
  const autoEditBaruSajaRef = useRef(false);

  async function autoEdit() {
    autoEditBaruSajaRef.current = true;
    const r = await jalankan("auto edit", "auto_edit", {
      caption_inti: captionInti,
      penjelasan,
      sumber_akun: sumberAkun,
    });
    if (!r) {
      autoEditBaruSajaRef.current = false;
      return;
    }
    const g =
      (r.gagal as { profil: string; pesan: string }[] | undefined) ?? [];
    const tanpa = (r.tanpa_template as string[] | undefined) ?? [];
    toast(
      g.length ? "peringatan" : "sukses",
      `Auto edit: ${r.dimulai ?? 0} video dirender untuk ${r.profil ?? 0} profil PALUGODAM`,
      [
        g.length
          ? `${g.length} gagal: ${g.map((x) => x.profil).join(", ")}`
          : "",
        tanpa.length
          ? `${tanpa.length} profil dilewati (tanpa template): ${tanpa.slice(0, 4).join(", ")}${tanpa.length > 4 ? "…" : ""}`
          : "",
        "Status render diperbarui tiap 8 detik.",
      ]
        .filter(Boolean)
        .join(" · "),
    );
    setFase(2);
  }

  async function autoUpload() {
    const r = await jalankan("auto upload", "auto_upload", {});
    if (!r) return;
    toast(
      "sukses",
      `Auto upload: ${r.jumlah ?? 0} profil`,
      "Tiap profil mengunggah versinya ke semua sosmed yang tertaut. Status per profil di fase Siaran.",
    );
    setFase(3);
  }

  const bolehAutoUpload =
    jumlahSukses > 0 && !adaRendering && !adaSiaranMenunggu && !sibuk;
  // Lanjut otomatis: render baru saja selesai (setelah AUTO EDIT) → AUTO UPLOAD.
  useEffect(() => {
    if (!autoLanjut || !autoEditBaruSajaRef.current) return;
    if (adaRendering || jumlahSukses === 0 || sibuk || data?.siaran) return;
    autoEditBaruSajaRef.current = false;
    // Ditunda satu tick supaya tidak mengubah state langsung di dalam effect.
    const t = setTimeout(() => void autoUpload(), 0);
    return () => clearTimeout(t);
  }, [autoLanjut, adaRendering, jumlahSukses, sibuk, data?.siaran]);

  if (!data) return <GlassSkeleton className="h-40 rounded-2xl" />;

  const tombolAutoEdit = (
    <>
      <button
        type="button"
        onClick={() => void autoEdit()}
        disabled={!bolehKe(2) || Boolean(sibuk) || adaRendering}
        className="btn-tekan mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[13.5px] font-bold text-white disabled:opacity-50"
        style={{ background: UNGU }}
      >
        {sibuk === "auto edit" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Wand2 className="h-4 w-4" />
        )}
        AUTO EDIT · 1 klik untuk seluruh profil PALUGODAM
      </button>
      <label className="mt-2 flex items-center gap-2 text-[11.5px] text-teks-utama">
        <input
          type="checkbox"
          checked={autoLanjut}
          onChange={(e) => setAutoLanjut(e.target.checked)}
          className="h-4 w-4 accent-[#7C3AED]"
        />
        Setelah render selesai, langsung AUTO UPLOAD ke semua sosmed
      </label>
      <p className="mt-1 text-[10.5px] leading-relaxed text-teks-sekunder">
        Semua profil anggota Divisi PALUGODAM yang punya template dipilih
        otomatis; DeepSeek membuat judul, highlight & caption berbeda untuk tiap
        profil; Creatomate merender semuanya. Butuh sekitar 1 menit.
      </p>
    </>
  );

  const tombolAutoUpload = (
    <button
      type="button"
      onClick={() => void autoUpload()}
      disabled={!bolehAutoUpload}
      className="btn-tekan mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[13.5px] font-bold text-white disabled:opacity-50"
      style={{ background: MERAH }}
    >
      {sibuk === "auto upload" ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Rocket className="h-4 w-4" />
      )}
      AUTO UPLOAD · 1 klik ke {jumlahSukses} profil × semua sosmed tertaut
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onTutup}
          className="btn-tekan text-[11px] font-bold text-pri"
        >
          ← Daftar proyek
        </button>
        <p className="truncate text-[10.5px] text-teks-sekunder">
          Proyek #{data.proyek.id} · {jamWIB(data.proyek.dibuat_pada)}
        </p>
      </div>
      <PenunjukFase fase={fase} bolehKe={bolehKe} onPilih={setFase} />

      {/* ===== MODE PER AKUN (4 Sep 2026): tiap akun punya link & teksnya sendiri ===== */}
      {data.proyek.mode === "per_akun" && (fase === 1 || fase === 2) && (
        <StudioPerAkun
          data={data}
          sibuk={sibuk}
          setSibuk={setSibuk}
          onSegarkan={() => void muat()}
          onRender={async () => {
            const r = await jalankan("render", "render", {});
            if (!r) return;
            const g =
              (r.gagal as { profil: string; pesan: string }[] | undefined) ??
              [];
            toast(
              g.length ? "peringatan" : "sukses",
              `${r.dimulai ?? 0} video mulai dirender`,
              g.length
                ? `${g.length} gagal: ${g.map((x) => x.profil).join(", ")}`
                : "Status diperbarui otomatis tiap 8 detik.",
            );
            setFase(2);
          }}
        />
      )}

      {/* ===== FASE 1: review sumber (mode bersama) ===== */}
      {fase === 1 && data.proyek.mode !== "per_akun" && (
        <GlassCard className="p-4">
          <p className="text-[12.5px] font-bold text-teks-utama">
            Fase 1 · Video sumber
          </p>
          {data.proyek.sumber_url ? (
            <video
              src={data.proyek.sumber_url}
              controls
              playsInline
              className="mt-2 max-h-80 w-full rounded-xl bg-black"
            />
          ) : (
            <p className="mt-2 text-[11px] text-gagal">
              Berkas sumber sudah disapu (umur 3 hari). Buat proyek baru.
            </p>
          )}
          {data.proyek.sumber_link ? (
            <a
              href={data.proyek.sumber_link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 flex items-center gap-1 text-[10.5px] text-teks-sekunder"
            >
              <ExternalLink className="h-3 w-3" /> {data.proyek.sumber_link}
            </a>
          ) : null}
          {data.proyek.sumber_caption ? (
            <p className="mt-2 rounded-xl bg-black/5 px-3 py-2 text-[11px] leading-relaxed text-teks-utama dark:bg-white/10">
              <span className="font-bold">Caption asli: </span>
              {data.proyek.sumber_caption}
            </p>
          ) : null}
          {tombolAutoEdit}
          <button
            type="button"
            onClick={() => setFase(2)}
            disabled={!bolehKe(2)}
            className="glass btn-tekan mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-bold text-teks-utama disabled:opacity-50"
          >
            Atau atur manual di fase Render <ChevronRight className="h-4 w-4" />
          </button>
        </GlassCard>
      )}

      {/* ===== FASE 2: teks per profil + render (mode bersama) ===== */}
      {fase === 2 && data.proyek.mode !== "per_akun" && (
        <>
          <GlassCard className="p-4">
            <p className="text-[12.5px] font-bold text-teks-utama">
              Fase 2 · Bahan teks & profil PALUGODAM
            </p>
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
            <input
              value={sumberAkun}
              onChange={(e) => setSumberAkun(e.target.value)}
              maxLength={80}
              placeholder="Sumber video (tampil di video sebagai 'Sumber: @akun')"
              className="glass-input mt-2 h-10 w-full rounded-xl px-3 text-[12.5px] text-teks-utama"
            />
            <div className="mt-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold text-teks-sekunder">
                Profil PALUGODAM tujuan ({pilih.size}):
              </p>
              <button
                type="button"
                onClick={() =>
                  setPilih(
                    new Set(
                      profilSemua
                        .filter((p) => p.template?.aktif)
                        .map((p) => p.profil),
                    ),
                  )
                }
                className="btn-tekan text-[11px] font-bold text-pri"
              >
                Pilih semua yang punya template
              </button>
            </div>
            <div className="scrollbar-tipis mt-1.5 flex max-h-56 flex-col gap-1 overflow-y-auto">
              {profilSemua.map((p) => {
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
                    className={cn(
                      "btn-tekan flex items-center gap-2 rounded-xl px-2 py-1.5 text-left",
                      aktif ? "bg-pri/10" : "",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md border",
                        aktif
                          ? "border-pri bg-pri text-white"
                          : "border-black/20 dark:border-white/25",
                      )}
                    >
                      {aktif && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-semibold text-teks-utama">
                        {p.profil}
                      </span>
                      <span className="block truncate text-[10px] text-teks-sekunder">
                        {p.nama || "belum ditautkan ke anggota"}
                      </span>
                    </span>
                    {p.template ? (
                      <span className="text-[9.5px] text-emerald-600 dark:text-emerald-400">
                        template ✓
                      </span>
                    ) : (
                      <span className="text-[9.5px] text-gagal">
                        tanpa template
                      </span>
                    )}
                    <span className="angka-tab text-[10px] text-teks-sekunder">
                      {p.tertaut}/6
                    </span>
                  </button>
                );
              })}
              {profilSemua.length === 0 && (
                <p className="px-2 py-3 text-[11px] text-teks-sekunder">
                  Belum ada profil milik anggota Divisi PALUGODAM.
                </p>
              )}
            </div>
            {tombolAutoEdit}
            <button
              type="button"
              onClick={() =>
                void jalankan(
                  "simpan",
                  "teks_simpan",
                  {
                    caption_inti: captionInti,
                    penjelasan,
                    sumber_akun: sumberAkun,
                    profil: [...pilih],
                  },
                  "Bahan & profil tersimpan",
                )
              }
              disabled={Boolean(sibuk) || pilih.size === 0}
              className="glass btn-tekan mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl text-[12.5px] font-bold text-teks-utama disabled:opacity-50"
            >
              {sibuk === "simpan" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4 text-pri" />
              )}
              Manual: simpan bahan & {pilih.size} profil
            </button>
          </GlassCard>

          {item.length > 0 && (
            <GlassCard className="p-4">
              <p className="text-[12.5px] font-bold text-teks-utama">
                Judul, highlight & caption per profil
              </p>
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
                    onClick={() =>
                      void jalankan(
                        label,
                        "generate",
                        { jenis },
                        `${label}: ${item.length} profil`,
                      )
                    }
                    disabled={Boolean(sibuk)}
                    className="btn-tekan flex items-center justify-center gap-1 rounded-xl bg-pri/12 py-2 text-[11px] font-bold text-pri disabled:opacity-50"
                  >
                    {sibuk === label ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {item.map((it) => {
                  const d = draft[it.profil] ?? {
                    judul: "",
                    highlight: "",
                    caption: "",
                  };
                  return (
                    <div key={it.id} className="glass-soft rounded-xl p-2.5">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-[12px] font-bold text-teks-utama">
                          {it.profil}
                          {it.nama ? (
                            <span className="font-normal text-teks-sekunder">
                              {" "}
                              · {it.nama}
                            </span>
                          ) : null}
                        </p>
                        <StatusBadge
                          label={
                            it.render_status === "sukses"
                              ? "render ✓"
                              : it.render_status === "rendering"
                                ? "merender…"
                                : it.render_status === "gagal"
                                  ? "render gagal"
                                  : "belum render"
                          }
                          warna={
                            it.render_status === "sukses"
                              ? "hijau"
                              : it.render_status === "rendering"
                                ? "kuning"
                                : it.render_status === "gagal"
                                  ? "merah"
                                  : "netral"
                          }
                          berkedip={it.render_status === "rendering"}
                        />
                      </div>
                      <input
                        value={d.judul}
                        onChange={(e) =>
                          setDraft((s) => ({
                            ...s,
                            [it.profil]: { ...d, judul: e.target.value },
                          }))
                        }
                        maxLength={100}
                        placeholder="Judul overlay"
                        className="glass-input mt-1.5 h-9 w-full rounded-xl px-2.5 text-[12px] text-teks-utama"
                      />
                      <input
                        value={d.highlight}
                        onChange={(e) =>
                          setDraft((s) => ({
                            ...s,
                            [it.profil]: {
                              ...d,
                              highlight: e.target.value.toUpperCase(),
                            },
                          }))
                        }
                        maxLength={40}
                        placeholder="HIGHLIGHT (mis. VIRAL, HARU)"
                        className="glass-input mt-1.5 h-9 w-full rounded-xl px-2.5 text-[12px] text-teks-utama"
                      />
                      <textarea
                        value={d.caption}
                        onChange={(e) =>
                          setDraft((s) => ({
                            ...s,
                            [it.profil]: { ...d, caption: e.target.value },
                          }))
                        }
                        rows={2}
                        maxLength={2200}
                        placeholder="Caption untuk profil ini"
                        className="glass-input mt-1.5 w-full rounded-xl px-2.5 py-1.5 text-[12px] text-teks-utama"
                      />
                      {it.pesan && it.render_status === "gagal" ? (
                        <p className="mt-1 text-[10.5px] text-gagal">
                          {it.pesan}
                        </p>
                      ) : null}
                      {it.render_url ? (
                        <a
                          href={it.render_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 flex items-center gap-1 text-[10.5px] font-bold text-pri"
                        >
                          <ExternalLink className="h-3 w-3" /> Lihat hasil
                          render
                        </a>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() =>
                  void jalankan(
                    "simpan teks",
                    "item_simpan",
                    {
                      item: Object.entries(draft).map(([profil, d]) => ({
                        profil,
                        ...d,
                      })),
                    },
                    "Teks per profil tersimpan",
                  )
                }
                disabled={Boolean(sibuk)}
                className="glass btn-tekan mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl text-[12.5px] font-bold text-teks-utama disabled:opacity-50"
              >
                {sibuk === "simpan teks" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 text-pri" />
                )}
                Simpan teks per profil
              </button>
              <button
                type="button"
                onClick={() =>
                  void jalankan("simpan teks", "item_simpan", {
                    item: Object.entries(draft).map(([profil, d]) => ({
                      profil,
                      ...d,
                    })),
                  }).then(async (ok) => {
                    if (!ok) return;
                    const r = await jalankan("render", "render", {});
                    if (!r) return;
                    const g =
                      (r.gagal as
                        { profil: string; pesan: string }[] | undefined) ?? [];
                    toast(
                      g.length ? "peringatan" : "sukses",
                      `${r.dimulai ?? 0} render dimulai`,
                      g.length
                        ? `${g.length} gagal: ${g.map((x) => x.profil).join(", ")}`
                        : "Status diperbarui otomatis tiap 8 detik.",
                    );
                  })
                }
                disabled={Boolean(sibuk) || adaRendering}
                className="btn-tekan mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[13.5px] font-bold text-white disabled:opacity-50"
                style={{ background: UNGU }}
              >
                {sibuk === "render" || adaRendering ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Clapperboard className="h-4 w-4" />
                )}
                {adaRendering
                  ? "Sedang merender…"
                  : `Render ${item.filter((i) => i.render_status !== "sukses").length} versi video`}
              </button>
              <p className="mt-2 text-center text-[10.5px] text-teks-sekunder">
                {jumlahSukses}/{item.length} versi siap
              </p>
              {tombolAutoUpload}
              <button
                type="button"
                onClick={() => setFase(3)}
                disabled={jumlahSukses === 0}
                className="glass btn-tekan mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-bold text-teks-utama disabled:opacity-50"
              >
                Atau atur sosmed & jadwal di fase Siaran{" "}
                <ChevronRight className="h-4 w-4" />
              </button>
            </GlassCard>
          )}
        </>
      )}

      {/* ===== FASE 3: siaran ===== */}
      {fase === 3 && (
        <GlassCard className="p-4">
          <p className="text-[12.5px] font-bold text-teks-utama">
            Fase 3 · Siaran ke {jumlahSukses} profil
          </p>
          <p className="mt-1 text-[11px] text-teks-sekunder">
            Tiap profil mengunggah versinya sendiri ke sosmed yang tertaut di
            profil itu.
          </p>
          {!data.siaran ? tombolAutoUpload : null}
          <p className="mt-3 text-[11px] font-semibold text-teks-sekunder">
            Atau atur manual: pilih sosmed & jadwal
          </p>
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
                className={cn(
                  "btn-tekan flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold",
                  platform.has(p) ? "text-white" : "glass text-teks-sekunder",
                )}
                style={platform.has(p) ? { background: MERAH } : undefined}
              >
                <PlatformIcon platform={p} size={12} />
                {labelPlatform(p)}
              </button>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-[12px] text-teks-utama">
            <input
              type="checkbox"
              checked={pakaiJadwal}
              onChange={(e) => setPakaiJadwal(e.target.checked)}
              className="h-4 w-4 accent-[#DC2626]"
            />
            Jadwalkan (5 menit – 7 hari)
          </label>
          {pakaiJadwal && (
            <input
              type="datetime-local"
              value={jadwal}
              onChange={(e) => setJadwal(e.target.value)}
              className="glass-input mt-2 h-11 w-full rounded-xl px-3 text-sm text-teks-utama"
            />
          )}
          <div className="mt-3 flex flex-col gap-1">
            {item
              .filter((i) => i.render_status === "sukses")
              .map((i) => (
                <div
                  key={i.id}
                  className="flex items-center gap-2 rounded-lg bg-black/[0.03] px-2 py-1.5 dark:bg-white/[0.05]"
                >
                  <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-teks-utama">
                    {i.profil}
                  </span>
                  <a
                    href={i.render_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10.5px] font-bold text-pri"
                  >
                    tonton
                  </a>
                </div>
              ))}
          </div>
          {data.siaran ? (
            <div className="mt-3">
              <p className="text-[11px] font-semibold text-teks-sekunder">
                Siaran #{data.siaran.id}: {data.siaran.ringkas.terkirim}/
                {data.siaran.ringkas.total} terkirim
                {data.siaran.ringkas.gagal
                  ? ` · ${data.siaran.ringkas.gagal} gagal`
                  : ""}
                {data.siaran.ringkas.menunggu
                  ? ` · ${data.siaran.ringkas.menunggu} menunggu`
                  : ""}
              </p>
              <div className="mt-1.5 flex flex-col gap-1">
                {data.siaran.item.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center gap-2 rounded-lg bg-black/[0.03] px-2 py-1.5 dark:bg-white/[0.05]"
                  >
                    <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-teks-utama">
                      {it.profil}
                    </span>
                    {it.pesan && it.status !== "terkirim" ? (
                      <span className="truncate text-[10px] text-gagal">
                        {it.pesan}
                      </span>
                    ) : null}
                    <StatusBadge
                      label={it.status === "diproses" ? "mengirim…" : it.status}
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
            </div>
          ) : null}
          <button
            type="button"
            onClick={() =>
              void jalankan(
                "siaran",
                "siaran",
                {
                  platforms: [...platform],
                  jadwal:
                    pakaiJadwal && jadwal
                      ? new Date(jadwal).toISOString()
                      : undefined,
                },
                "Siaran dimulai — status per profil di bawah",
              )
            }
            disabled={
              Boolean(sibuk) || platform.size === 0 || adaSiaranMenunggu
            }
            className="btn-tekan mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[13.5px] font-bold text-white disabled:opacity-50"
            style={{ background: MERAH }}
          >
            {sibuk === "siaran" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {data.siaran
              ? "Kirim ulang ke semua profil"
              : `Upload ke ${jumlahSukses} profil × sosmed tertaut`}
          </button>
        </GlassCard>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Tab PROYEK: fase 1 (sumber baru) + daftar proyek
// ------------------------------------------------------------
function TabProyek({
  profilSemua,
  siap,
}: {
  profilSemua: StudioProfil[];
  siap: StudioSiap | null;
}) {
  const [daftar, setDaftar] = useState<StudioProyekRingkas[] | null>(null);
  const [buka, setBuka] = useState<string | null>(null);
  const [sibukCepat, setSibukCepat] = useState("");

  function muat() {
    return getStudioProyekList()
      .then((d) => setDaftar(d.data))
      .catch(() => setDaftar([]));
  }
  useEffect(() => {
    void muat();
  }, []);

  /** Satu klik dari daftar proyek, tanpa membuka editor dulu. */
  async function cepat(id: string, aksi: "auto_edit" | "auto_upload") {
    if (sibukCepat) return;
    setSibukCepat(`${id}:${aksi}`);
    try {
      const r = await studioPost(aksi, { proyek_id: id });
      if (aksi === "auto_edit") {
        toast(
          "sukses",
          `Auto edit: ${r.dimulai ?? 0} video dirender untuk ${r.profil ?? 0} profil PALUGODAM`,
          "Pantau status render di proyek ini.",
        );
      } else {
        toast(
          "sukses",
          `Auto upload: ${r.jumlah ?? 0} profil`,
          "Status per profil ada di fase Siaran.",
        );
      }
      setBuka(id);
    } catch (e) {
      toast(
        "error",
        aksi === "auto_edit" ? "Auto edit gagal" : "Auto upload gagal",
        e instanceof Error ? e.message : "",
      );
    } finally {
      setSibukCepat("");
    }
  }

  /** Proyek mode per akun: langsung berisi semua akun PALUGODAM yang siap. */
  async function buatPerAkun() {
    if (sibukCepat) return;
    setSibukCepat("per-akun");
    try {
      const r = await studioPost("proyek_per_akun", {});
      const tanpa = (r.tanpa_template as string[] | undefined) ?? [];
      toast(
        "sukses",
        `Proyek per akun dibuat · ${r.akun ?? 0} akun`,
        tanpa.length
          ? `${tanpa.length} profil dilewati (tanpa template aktif)`
          : "Isi link tiap akun, lalu render.",
      );
      await muat();
      setBuka(String(r.id));
    } catch (e) {
      toast(
        "error",
        "Gagal membuat proyek per akun",
        e instanceof Error ? e.message : "",
      );
    } finally {
      setSibukCepat("");
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

  if (buka) {
    return (
      <EditorProyek
        id={buka}
        profilSemua={profilSemua}
        onTutup={() => {
          setBuka(null);
          void muat();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <KartuSiap siap={siap} />
      <PenunjukFase fase={1} bolehKe={(f) => f === 1} onPilih={() => {}} />
      <FormSumber
        onSelesai={(id) => {
          void muat();
          setBuka(id);
        }}
      />
      {/* Proyek MODE PER AKUN (4 Sep 2026): tiap akun punya link, caption,
          judul & highlight sendiri; render menunggu semuanya lengkap. */}
      <GlassCard className="p-4">
        <p className="text-[12.5px] font-bold text-teks-utama">
          Atau: satu akun satu video
        </p>
        <p className="mt-1 text-[10.5px] leading-relaxed text-teks-sekunder">
          Tiap akun PALUGODAM mengisi link videonya sendiri, plus caption,
          judul, dan highlight sendiri. Render jalan setelah semua akun lengkap.
        </p>
        <button
          type="button"
          onClick={() => void buatPerAkun()}
          disabled={Boolean(sibukCepat)}
          className="btn-tekan mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[12.5px] font-bold text-white disabled:opacity-50"
          style={{ background: UNGU }}
        >
          {sibukCepat === "per-akun" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Users className="h-4 w-4" />
          )}
          Buat proyek per akun
        </button>
      </GlassCard>
      {daftar === null ? (
        <GlassSkeleton className="h-20 rounded-2xl" />
      ) : daftar.length > 0 ? (
        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] font-bold text-teks-utama">
              Proyek terakhir
            </p>
            <button
              type="button"
              onClick={() => void muat()}
              aria-label="Segarkan"
              className="btn-tekan p-1 text-teks-sekunder"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 flex flex-col gap-1.5">
            {daftar.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
              >
                <button
                  type="button"
                  onClick={() => setBuka(p.id)}
                  className="btn-tekan min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-[12px] font-semibold text-teks-utama">
                    {p.ringkas}
                  </span>
                  <span className="block text-[10px] text-teks-sekunder">
                    {jamWIB(p.dibuat_pada)} ·{" "}
                    {p.sumber_platform === "per-akun"
                      ? "per akun"
                      : p.sumber_platform || "?"}{" "}
                    · {p.jumlah_item} profil · fase{" "}
                    {p.status === "siaran"
                      ? "3 siaran"
                      : p.status === "sumber"
                        ? "1 unggah"
                        : "2 render"}
                  </span>
                </button>
                {/* Satu klik langsung dari daftar (3 Sep 2026) */}
                {p.status === "sumber" || p.status === "teks" ? (
                  <button
                    type="button"
                    onClick={() => void cepat(p.id, "auto_edit")}
                    disabled={Boolean(sibukCepat)}
                    className="btn-tekan flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[10.5px] font-bold text-white disabled:opacity-50"
                    style={{ background: UNGU }}
                  >
                    {sibukCepat === `${p.id}:auto_edit` ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Wand2 className="h-3 w-3" />
                    )}
                    Auto edit
                  </button>
                ) : p.status === "render" ? (
                  <button
                    type="button"
                    onClick={() => void cepat(p.id, "auto_upload")}
                    disabled={Boolean(sibukCepat)}
                    className="btn-tekan flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[10.5px] font-bold text-white disabled:opacity-50"
                    style={{ background: MERAH }}
                  >
                    {sibukCepat === `${p.id}:auto_upload` ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Rocket className="h-3 w-3" />
                    )}
                    Auto upload
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void hapus(p.id)}
                  aria-label="Hapus proyek"
                  className="btn-tekan p-1.5 text-teks-sekunder/70"
                >
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
  const [pengaturan, setPengaturan] = useState<{
    siap: StudioSiap;
    profil: StudioProfil[];
  } | null>(null);

  useEffect(() => {
    let hidup = true;
    getStudioPengaturan()
      .then((d) => hidup && setPengaturan({ siap: d.siap, profil: d.profil }))
      .catch(
        (e) =>
          hidup &&
          toast(
            "error",
            "Studio gagal dimuat",
            e instanceof Error ? e.message : "",
          ),
      );
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
            ["template", "Anggota & Template", Settings2],
          ] as const
        ).map(([k, label, Ikon]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            aria-pressed={tab === k}
            className={cn(
              "btn-tekan flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-bold",
              tab === k
                ? "bg-white text-teks-utama shadow-sm dark:bg-white/15"
                : "text-teks-sekunder",
            )}
          >
            <Ikon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
      {tab === "template" ? (
        <TabAnggota />
      ) : pengaturan ? (
        <TabProyek profilSemua={pengaturan.profil} siap={pengaturan.siap} />
      ) : (
        <GlassSkeleton className="h-40 rounded-2xl" />
      )}
    </div>
  );
}

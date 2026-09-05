"use client";

// ============================================================
// UnggahSosmedSaya — unggah video ke SOSMED PRIBADI anggota lewat
// profil upload-post miliknya (rombakan TVR Saya, 31 Agu 2026).
// Cermin fitur unggah TV Rakyat Official: pilih video → judul +
// caption → centang platform tertaut → post sekarang ATAU jadwalkan.
// Berkas video otomatis dihapus dari penyimpanan 2 jam setelah tayang
// (postingan di sosmednya TETAP).
//
// Video BESAR naik LANGSUNG peramban→penyimpanan lewat URL bertanda
// tangan dari server: utama CLOUDFLARE R2 (bandwidth keluar gratis —
// Cloudinary menagih bandwidth dan sudah 140% kuota), cadangan bucket
// Supabase. Server lalu menyerahkan tautan bertanda tangan itu ke
// upload-post; berkasnya dihapus otomatis 2 jam setelah tayang.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { CalendarClock, Check, Link2, Loader2, Send, Share2, UploadCloud, Wand2, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton } from "@/components/pri-ui";
import { toast, useAppStore } from "@/hooks/use-app-store";
import { adalahPalugodam } from "@/lib/struktur";
import { ModalEditOtomatis } from "./modal-edit-otomatis";
import {
  batalkanJadwalTvrku,
  getJadwalTvrku,
  getRiwayatTvrkuPost,
  postTvrku,
  sinkronSosmedTvr,
  type JadwalTvrku,
  type TvrkuPost,
} from "@/services";
import { PlatformIcon, labelPlatform } from "@/components/platform-icon";
import { KOMPRES_MB, unggahVideoTvrku } from "@/lib/unggah-video-klien";
import { cn } from "@/lib/utils";

const LABEL: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YT Short",
  facebook: "Facebook",
  threads: "Threads",
  twitter: "X",
};

/** Batas berkas (5 Sep 2026): 100 MB = batas Cloudinary; > 50 MB dikompres otomatis. */
const MAKS_MB = 100;

function jamWib(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t + 7 * 3600_000);
  const dua = (n: number) => String(n).padStart(2, "0");
  return `${dua(d.getUTCDate())}/${dua(d.getUTCMonth() + 1)} ${dua(d.getUTCHours())}:${dua(d.getUTCMinutes())} WIB`;
}

export function UnggahSosmedSaya() {
  const [tertaut, setTertaut] = useState<string[] | null>(null);
  const [riwayat, setRiwayat] = useState<TvrkuPost[] | null>(null);
  // TOMBOL BAGIKAN (3 Sep 2026): setelah unggah, URL postingan per platform
  // terbit beberapa saat kemudian → riwayat dipantau tiap 15 dtk (maks 4 mnt)
  // sampai tautannya ada, lalu tombol Bagikan muncul di riwayat.
  const [pantauSejak, setPantauSejak] = useState<number | null>(null);
  useEffect(() => {
    if (pantauSejak === null) return;
    let hidup = true;
    const t = setInterval(() => {
      if (Date.now() - pantauSejak > 4 * 60_000) {
        setPantauSejak(null);
        return;
      }
      getRiwayatTvrkuPost()
        .then((posts) => {
          if (!hidup) return;
          setRiwayat(posts);
          const terbaru = posts[0];
          if (terbaru && Object.keys(terbaru.tautan ?? {}).length >= terbaru.platforms.length) {
            setPantauSejak(null);
            toast("sukses", "Tautan siap dibagikan", "Tekan Bagikan di Riwayat Post Saya.");
          }
        })
        .catch(() => {
          // coba lagi pada detik berikutnya
        });
    }, 15_000);
    return () => {
      hidup = false;
      clearInterval(t);
    };
  }, [pantauSejak]);

  async function bagikan(r: TvrkuPost) {
    const entri = Object.entries(r.tautan ?? {});
    if (entri.length === 0) return;
    const teks = `${r.judul}\n` + entri.map(([p, u]) => `${labelPlatform(p)}: ${u}`).join("\n");
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: r.judul, text: teks });
        return;
      }
      await navigator.clipboard.writeText(teks);
      toast("sukses", "Tautan disalin", `${entri.length} tautan siap ditempel ke mana saja.`);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      toast("peringatan", "Tidak bisa membagikan otomatis", "Salin tautannya dari daftar di bawah judul.");
    }
  }

  const [berkas, setBerkas] = useState<File | null>(null);
  // Berkas yang ditolak karena > MAKS_MB — dipakai kartu arahan kompres.
  const [terlaluBesar, setTerlaluBesar] = useState<{ nama: string; mb: number } | null>(null);

  function pilihBerkas(f: File | null) {
    if (f && f.size > MAKS_MB * 1024 * 1024) {
      setBerkas(null);
      setTerlaluBesar({ nama: f.name, mb: Math.round(f.size / 1_048_576) });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setTerlaluBesar(null);
    setBerkas(f);
  }
  const [judul, setJudul] = useState("");
  const [caption, setCaption] = useState("");
  const [pilih, setPilih] = useState<Set<string>>(() => new Set());
  const [pakaiJadwal, setPakaiJadwal] = useState(false);
  const [jadwal, setJadwal] = useState("");
  const [tahap, setTahap] = useState<"" | "unggah" | "kompres" | "post">("");
  // Persentase unggah (progres XHR nyata).
  const [persen, setPersen] = useState(0);
  // PALUGODAM (2 Sep 2026): boleh mengirim video cukup lewat TAUTAN
  // hasil editannya sendiri — tanpa unggah berkas sama sekali.
  const user = useAppStore((st) => st.user);
  const bolehLink = adalahPalugodam({ role: user?.role, divisi: user?.divisi });
  const [modeLink, setModeLink] = useState(false);
  const [tautan, setTautan] = useState("");
  // Antrean posting terjadwal (2 Sep 2026) — dari upload-post.
  const [jadwalAntre, setJadwalAntre] = useState<JadwalTvrku[] | null>(null);
  const [sedangBatal, setSedangBatal] = useState("");
  // PALUGODAM: pop-up gabungan edit otomatis + upload otomatis.
  const [bukaEditOtomatis, setBukaEditOtomatis] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        // Sumber kebenaran = upload-post LANGSUNG (bukan tabel lokal):
        // begitu satu platform di-login, toggle-nya langsung terbuka di
        // sini. Ini juga yang memperbaiki bug "Insight sudah membaca
        // YouTube tapi menu unggah bilang belum ada akun tertaut".
        const [sinkron, posts, antre] = await Promise.all([
          sinkronSosmedTvr(),
          getRiwayatTvrkuPost(),
          getJadwalTvrku().catch(() => [] as JadwalTvrku[]),
        ]);
        if (!hidup) return;
        setJadwalAntre(antre);
        const t = sinkron.terhubung
          .map((a) => a.platform)
          .filter((p) => p !== "website");
        setTertaut([...new Set(t)]);
        setRiwayat(posts);
      } catch {
        if (hidup) {
          setTertaut([]);
          setRiwayat([]);
        }
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  async function batalkanJadwal(job: JadwalTvrku) {
    if (sedangBatal) return;
    setSedangBatal(job.job_id);
    try {
      const r = await batalkanJadwalTvrku(job.job_id);
      toast("sukses", "Jadwal dibatalkan", r.pesan);
      setJadwalAntre(await getJadwalTvrku().catch(() => jadwalAntre ?? []));
    } catch (e) {
      toast("error", "Gagal membatalkan", e instanceof Error ? e.message : "Coba lagi.");
    } finally {
      setSedangBatal("");
    }
  }

  function togglePlatform(p: string) {
    setPilih((lama) => {
      const baru = new Set(lama);
      if (baru.has(p)) baru.delete(p);
      else baru.add(p);
      return baru;
    });
  }

  const adaVideo = modeLink ? tautan.trim().startsWith("https://") : Boolean(berkas);
  const sah =
    adaVideo &&
    judul.trim().length >= 3 &&
    pilih.size > 0 &&
    (!pakaiJadwal || Boolean(jadwal));

  async function kirim() {
    if (!sah || tahap) return;
    try {
      // PALUGODAM: kiriman TAUTAN langsung ke langkah post — tidak ada
      // berkas yang diunggah, jadi nol penyimpanan & nol lalu-lintas.
      if (modeLink) {
        setTahap("post");
        const h = await postTvrku({
          video_link: tautan.trim(),
          judul: judul.trim(),
          caption: caption.trim() || undefined,
          platforms: [...pilih],
          jadwal: pakaiJadwal && jadwal ? new Date(jadwal).toISOString() : undefined,
        });
        if (h.terjadwal) {
          toast("sukses", "Terjadwal", "Video akan diposting otomatis pada waktunya.");
        } else if (h.sukses) {
          toast("sukses", "Video terkirim", `Diposting ke ${pilih.size} platform Anda.`);
        } else {
          toast("peringatan", "Sebagian gagal", "Cek rincian di riwayat.");
        }
        setTautan("");
        setJudul("");
        setCaption("");
        setPilih(new Set());
        setPakaiJadwal(false);
        setJadwal("");
        setRiwayat(await getRiwayatTvrkuPost().catch(() => riwayat ?? []));
        setJadwalAntre(await getJadwalTvrku().catch(() => jadwalAntre ?? []));
        return;
      }

      if (!berkas) return;
      // 1. Berkas naik LANGSUNG peramban → penyimpanan sementara lewat
      //    URL bertanda tangan dari server (utama: Cloudflare R2 —
      //    bandwidth keluar gratis; cadangan: bucket Supabase). Berkas
      //    dihapus otomatis 2 jam setelah tayang.
      setTahap("unggah");
      setPersen(0);
      const hasilUnggah = await unggahVideoTvrku(berkas, { onProgres: setPersen, onTahap: setTahap });

      // 2. Server menyerahkan tautan videonya ke upload-post.
      setTahap("post");
      const hasil = await postTvrku({
        ...(hasilUnggah.cara === "r2" ? { r2_key: hasilUnggah.r2_key } : { path: hasilUnggah.path }),
        ukuran: hasilUnggah.ukuran,
        judul: judul.trim(),
        caption: caption.trim() || undefined,
        platforms: [...pilih],
        jadwal: pakaiJadwal && jadwal ? new Date(jadwal).toISOString() : undefined,
      });

      if (hasil.terjadwal) {
        toast("sukses", "Terjadwal", "Video akan diposting otomatis pada waktunya.");
      } else if (hasil.sukses) {
        toast("sukses", "Video terkirim", `Diposting ke ${pilih.size} platform Anda.`);
      } else {
        toast(
          "peringatan",
          "Sebagian gagal",
          "Cek rincian di riwayat — platform yang gagal bisa dicoba lagi.",
        );
      }
      setBerkas(null);
      setJudul("");
      setCaption("");
      setPilih(new Set());
      setPakaiJadwal(false);
      setJadwal("");
      if (inputRef.current) inputRef.current.value = "";
      setRiwayat(await getRiwayatTvrkuPost().catch(() => riwayat ?? []));
      setJadwalAntre(await getJadwalTvrku().catch(() => jadwalAntre ?? []));
      // Tautan hasil terbit beberapa saat lagi → pantau supaya tombol Bagikan muncul.
      if (!hasil.terjadwal) setPantauSejak(Date.now());
    } catch (e) {
      toast("error", "Gagal", e instanceof Error ? e.message : "Coba lagi sebentar.");
    } finally {
      setTahap("");
    }
  }

  if (tertaut === null) return <GlassSkeleton className="h-40 rounded-2xl" />;

  if (tertaut.length === 0) {
    return (
      <GlassCard className="p-4">
        <p className="text-[13px] leading-relaxed text-teks-sekunder">
          Belum ada akun sosmed yang tertaut. Tekan <b>Hubungkan Sosmed (Login)</b> di
          seksi Akun TV Rakyat Saya dulu — setelah login, platformnya muncul di sini
          dan Anda bisa memposting langsung dari aplikasi. Cukup login satu platform
          pun sudah bisa dipakai; platform lain menyusul saat Anda login.
        </p>
      </GlassCard>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* PALUGODAM: satu pintu untuk edit + upload otomatis */}
      {bolehLink && (
        <button
          type="button"
          onClick={() => setBukaEditOtomatis(true)}
          className="btn-tekan w-full text-left"
          aria-label="Buka Edit & Upload Otomatis"
        >
          <GlassCard className="flex items-center gap-3 p-4">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
              style={{ background: "linear-gradient(135deg, #7C3AED, #4C1D95)" }}
              aria-hidden="true"
            >
              <Wand2 className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-heading text-[14px] font-bold text-teks-utama">
                Edit &amp; Upload Otomatis
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-teks-sekunder">
                Khusus PALUGODAM — tempel link, isi HIGHLIGHT &amp; judul, sistem
                merender lalu memposting sendiri.
              </span>
            </span>
          </GlassCard>
        </button>
      )}

      {bukaEditOtomatis && (
        <ModalEditOtomatis
          tertaut={tertaut}
          onTutup={() => setBukaEditOtomatis(false)}
          onSelesai={() => {
            void getRiwayatTvrkuPost().then(setRiwayat).catch(() => {});
          }}
        />
      )}

      <GlassCard className="p-4">
        {/* PALUGODAM: pilih cara kirim — unggah berkas atau tempel tautan */}
        {bolehLink && (
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setModeLink(false)}
              disabled={Boolean(tahap)}
              aria-pressed={!modeLink}
              className={cn(
                "btn-tekan flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-bold",
                !modeLink ? "bg-pri/15 text-pri" : "glass text-teks-sekunder",
              )}
            >
              <UploadCloud className="h-3.5 w-3.5" />
              Unggah Berkas
            </button>
            <button
              type="button"
              onClick={() => setModeLink(true)}
              disabled={Boolean(tahap)}
              aria-pressed={modeLink}
              className={cn(
                "btn-tekan flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-bold",
                modeLink ? "bg-pri/15 text-pri" : "glass text-teks-sekunder",
              )}
            >
              <Link2 className="h-3.5 w-3.5" />
              Kirim Tautan
            </button>
          </div>
        )}

        {modeLink ? (
          <>
            <input
              value={tautan}
              onChange={(e) => setTautan(e.target.value)}
              placeholder="https://... tautan video hasil editan Anda"
              inputMode="url"
              disabled={Boolean(tahap)}
              className="glass-input h-11 w-full rounded-xl px-3 text-sm text-teks-utama"
            />
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-teks-sekunder">
              Khusus Divisi PALUGODAM. Tautan harus https dan bisa diakses publik
              (bukan Google Drive privat) — video diambil langsung dari sana, jadi
              tidak memakai penyimpanan aplikasi sama sekali.
            </p>
          </>
        ) : (
        <>
        {/* Pilih berkas */}
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
          className="glass btn-tekan flex w-full items-center justify-center gap-2 rounded-xl py-6 text-[13px] font-bold text-teks-utama disabled:opacity-60"
        >
          <UploadCloud className="h-5 w-5 text-pri" />
          {berkas ? `${berkas.name} (${Math.round(berkas.size / 1_048_576)} MB)` : "Pilih Video"}
        </button>
        <p className="mt-1.5 text-[10.5px] text-teks-sekunder">
          Maksimal {MAKS_MB} MB per video (MP4/MOV/WebM). Di atas {KOMPRES_MB} MB dikompres
          otomatis sampai {KOMPRES_MB} MB — resolusi &amp; kualitas tampak dijaga.
        </p>
        {terlaluBesar && (
          <div className="mt-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-[11.5px] leading-relaxed text-teks-utama">
            <p className="font-bold">
              Video {terlaluBesar.mb} MB — melebihi batas {MAKS_MB} MB
            </p>
            <p className="mt-0.5 text-teks-sekunder">
              Cloudinary hanya menerima berkas sampai {MAKS_MB} MB. Kecilkan dulu sampai di bawah{" "}
              {MAKS_MB} MB (1080p, bitrate 4–6 Mbps), lalu pilih ulang — sisanya dikompres otomatis.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <a
                href="https://www.freeconvert.com/video-compressor"
                target="_blank"
                rel="noopener noreferrer"
                className="glass btn-tekan rounded-lg px-3 py-1.5 text-[11px] font-bold text-teks-utama"
              >
                Kompres online (FreeConvert)
              </a>
              <a
                href="https://play.google.com/store/search?q=video%20compressor&c=apps"
                target="_blank"
                rel="noopener noreferrer"
                className="glass btn-tekan rounded-lg px-3 py-1.5 text-[11px] font-bold text-teks-utama"
              >
                Aplikasi Android
              </a>
              <a
                href="https://apps.apple.com/search?term=video%20compressor"
                target="_blank"
                rel="noopener noreferrer"
                className="glass btn-tekan rounded-lg px-3 py-1.5 text-[11px] font-bold text-teks-utama"
              >
                Aplikasi iPhone
              </a>
            </div>
          </div>
        )}
        </>
        )}

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
          maxLength={2200}
          rows={3}
          placeholder="Caption (opsional)…"
          disabled={Boolean(tahap)}
          className="glass-input mt-2 w-full rounded-xl px-3 py-2.5 text-sm text-teks-utama"
        />

        {/* Platform tertaut */}
        <p className="mt-3 text-[11.5px] font-semibold text-teks-sekunder">
          Kirim ke ({pilih.size} dipilih):
        </p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {tertaut.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => togglePlatform(p)}
              disabled={Boolean(tahap)}
              aria-pressed={pilih.has(p)}
              className={cn(
                "btn-tekan flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold",
                pilih.has(p) ? "text-white" : "glass text-teks-sekunder",
              )}
              style={
                pilih.has(p)
                  ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                  : undefined
              }
            >
              <PlatformIcon platform={p} className="h-3.5 w-3.5" />
              {LABEL[p] ?? p}
              {pilih.has(p) && <Check className="h-3 w-3" />}
            </button>
          ))}
        </div>

        {/* Mode kirim: dua pilihan jelas (permintaan 1 Sep 2026) —
            Upload Sekarang ATAU Jadwalkan Upload. */}
        <p className="mt-3 text-[11.5px] font-semibold text-teks-sekunder">Waktu kirim:</p>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPakaiJadwal(false)}
            disabled={Boolean(tahap)}
            aria-pressed={!pakaiJadwal}
            className={cn(
              "btn-tekan flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-bold",
              !pakaiJadwal ? "text-white" : "glass text-teks-sekunder",
            )}
            style={
              !pakaiJadwal
                ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                : undefined
            }
          >
            <Send className="h-3.5 w-3.5" />
            Upload Sekarang
          </button>
          <button
            type="button"
            onClick={() => setPakaiJadwal(true)}
            disabled={Boolean(tahap)}
            aria-pressed={pakaiJadwal}
            className={cn(
              "btn-tekan flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-bold",
              pakaiJadwal ? "text-white" : "glass text-teks-sekunder",
            )}
            style={
              pakaiJadwal
                ? { background: "linear-gradient(135deg, #7C3AED, #5B21B6)" }
                : undefined
            }
          >
            <CalendarClock className="h-3.5 w-3.5" />
            Jadwalkan Upload
          </button>
        </div>
        {pakaiJadwal && (
          <div className="mt-2">
            <input
              type="datetime-local"
              value={jadwal}
              onChange={(e) => setJadwal(e.target.value)}
              disabled={Boolean(tahap)}
              aria-label="Waktu jadwal upload"
              className="glass-input h-10 w-full rounded-xl px-2.5 text-[12px] text-teks-utama"
            />
            <p className="mt-1 text-[10.5px] text-teks-sekunder">
              Minimal 5 menit dari sekarang, maksimal 7 hari ke depan. Video
              diposting otomatis pada waktunya.
            </p>
          </div>
        )}
        <p className="mt-2 text-[10.5px] leading-relaxed text-teks-sekunder">
          Video diunggah ke penyimpanan sementara dan dihapus otomatis 2 jam
          setelah tayang — postingan di sosmed Anda tetap ada.
        </p>
        <p className="mt-1 text-[10.5px] leading-relaxed text-emerald-600 dark:text-emerald-400">
          ✓ Video yang diunggah dari sini otomatis menambah KPI Anda — tak perlu
          melapor link lagi. Tiap platform tujuan dihitung 1 video.
        </p>

        <button
          type="button"
          onClick={() => void kirim()}
          disabled={!sah || Boolean(tahap)}
          className="btn-tekan mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[13.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
        >
          {tahap ? (
            <>
              <Loader2 className="h-4.5 w-4.5 animate-spin" />
              {tahap === "unggah" ? `Mengunggah video… ${persen}%` : tahap === "kompres" ? "Mengompres di Cloudinary (kualitas dijaga)…" : "Memposting…"}
            </>
          ) : (
            <>
              <Send className="h-4.5 w-4.5" />
              {pakaiJadwal ? "Jadwalkan Post" : "Post Sekarang"}
            </>
          )}
        </button>
      </GlassCard>

      {/* Antrean terjadwal (2 Sep 2026) — belum tayang, bisa dibatalkan */}
      {jadwalAntre !== null && jadwalAntre.length > 0 && (
        <GlassCard className="p-4">
          <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-teks-utama">
            <CalendarClock className="h-3.5 w-3.5 text-pri" />
            Menunggu Tayang ({jadwalAntre.length})
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {jadwalAntre.map((j) => (
              <div key={j.job_id} className="glass-soft rounded-xl p-2.5">
                <p className="line-clamp-2 text-[12px] font-semibold text-teks-utama">
                  {j.judul || "(tanpa judul)"}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="angka-tab text-[10.5px] text-teks-sekunder">
                    {jamWib(j.scheduled_date.endsWith("Z") ? j.scheduled_date : `${j.scheduled_date}Z`)}
                  </span>
                  {j.bisa_batal ? (
                    <button
                      type="button"
                      onClick={() => void batalkanJadwal(j)}
                      disabled={Boolean(sedangBatal)}
                      className="btn-tekan ml-auto rounded-full bg-gagal/12 px-2.5 py-1 text-[10.5px] font-bold text-gagal disabled:opacity-50"
                    >
                      {sedangBatal === j.job_id ? "Membatalkan…" : "Batalkan"}
                    </button>
                  ) : (
                    <span className="ml-auto text-[10px] text-teks-sekunder">
                      kiriman tautan — cabut di sumbernya
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-teks-sekunder">
            Membatalkan bekerja dengan menghapus berkas videonya, sehingga saat
            waktunya tiba postingan itu tidak jadi terbit.
          </p>
        </GlassCard>
      )}

      {/* Riwayat */}
      {riwayat !== null && riwayat.length > 0 && (
        <GlassCard className="p-4">
          <p className="text-[12.5px] font-bold text-teks-utama">Riwayat Post Saya</p>
          <div className="mt-2 flex flex-col gap-2">
            {riwayat.slice(0, 8).map((r) => (
              <div key={r.id} className="glass-soft rounded-xl p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[12.5px] font-semibold text-teks-utama">
                    {r.judul}
                  </p>
                  {r.jadwal && Date.parse(r.jadwal) > Date.now() ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-emas/15 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                      <CalendarClock className="h-3 w-3" /> {jamWib(r.jadwal)}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[10px] text-teks-sekunder">
                      {jamWib(r.dibuat_pada)}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  {r.platforms.map((p) => (
                    <PlatformIcon key={p} platform={p} className="h-3.5 w-3.5 text-teks-sekunder" />
                  ))}
                  {r.hasil && (r.hasil as { success?: boolean }).success === false && (
                    <span className="flex items-center gap-0.5 text-[10px] font-bold text-gagal">
                      <X className="h-3 w-3" /> sebagian gagal
                    </span>
                  )}
                </div>
                {/* Tautan hasil per platform + tombol Bagikan (3 Sep 2026) */}
                {Object.keys(r.tautan ?? {}).length > 0 ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {Object.entries(r.tautan).map(([p, u]) => (
                      <a
                        key={p}
                        href={u}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="glass btn-tekan flex items-center gap-1 rounded-full px-2 py-1 text-[10.5px] font-bold text-teks-utama"
                      >
                        <PlatformIcon platform={p} className="h-3 w-3" />
                        {labelPlatform(p)}
                      </a>
                    ))}
                    <button
                      type="button"
                      onClick={() => void bagikan(r)}
                      className="btn-tekan ml-auto flex h-8 items-center gap-1 rounded-lg px-2.5 text-[11px] font-bold text-white"
                      style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
                    >
                      <Share2 className="h-3.5 w-3.5" /> Bagikan
                    </button>
                  </div>
                ) : pantauSejak !== null && r.id === riwayat[0]?.id ? (
                  <p className="mt-1.5 flex items-center gap-1 text-[10.5px] text-teks-sekunder">
                    <Loader2 className="h-3 w-3 animate-spin" /> menunggu tautan postingan terbit…
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}

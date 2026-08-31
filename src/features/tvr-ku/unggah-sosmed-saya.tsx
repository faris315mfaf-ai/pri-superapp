"use client";

// ============================================================
// UnggahSosmedSaya — unggah video ke SOSMED PRIBADI anggota lewat
// profil upload-post miliknya (rombakan TVR Saya, 31 Agu 2026).
// Cermin fitur unggah TV Rakyat Official: pilih video → judul +
// caption → centang platform tertaut → post sekarang ATAU jadwalkan.
// Berkas video otomatis dihapus dari penyimpanan 2 jam setelah tayang
// (postingan di sosmednya TETAP).
//
// Video BESAR naik langsung peramban→CLOUDINARY (unsigned preset,
// pola sama dengan kirim-video-manual yang terbukti jalan; 1 Sep 2026 —
// jalur storage lama diblokir CSP di sebagian klien), lalu server
// menyerahkan URL Cloudinary-nya ke upload-post. Berkas dihapus
// otomatis dari Cloudinary 2 jam setelah tayang.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { CalendarClock, Check, Loader2, Send, UploadCloud, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import {
  getKonfigUploadVideo,
  getRiwayatTvrkuPost,
  postTvrku,
  sinkronSosmedTvr,
  type TvrkuPost,
} from "@/services";
import { PlatformIcon } from "@/components/platform-icon";
import { cn } from "@/lib/utils";

const LABEL: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YT Short",
  facebook: "Facebook",
  threads: "Threads",
  twitter: "X",
};

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

  const [berkas, setBerkas] = useState<File | null>(null);
  const [judul, setJudul] = useState("");
  const [caption, setCaption] = useState("");
  const [pilih, setPilih] = useState<Set<string>>(() => new Set());
  const [pakaiJadwal, setPakaiJadwal] = useState(false);
  const [jadwal, setJadwal] = useState("");
  const [tahap, setTahap] = useState<"" | "unggah" | "post">("");
  // Persentase unggah ke Cloudinary (progres XHR nyata).
  const [persen, setPersen] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        // Sumber kebenaran = upload-post LANGSUNG (bukan tabel lokal):
        // begitu satu platform di-login, toggle-nya langsung terbuka di
        // sini. Ini juga yang memperbaiki bug "Insight sudah membaca
        // YouTube tapi menu unggah bilang belum ada akun tertaut".
        const [sinkron, posts] = await Promise.all([
          sinkronSosmedTvr(),
          getRiwayatTvrkuPost(),
        ]);
        if (!hidup) return;
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

  function togglePlatform(p: string) {
    setPilih((lama) => {
      const baru = new Set(lama);
      if (baru.has(p)) baru.delete(p);
      else baru.add(p);
      return baru;
    });
  }

  const sah =
    Boolean(berkas) &&
    judul.trim().length >= 3 &&
    pilih.size > 0 &&
    (!pakaiJadwal || Boolean(jadwal));

  async function kirim() {
    if (!sah || tahap || !berkas) return;
    try {
      // 1. Berkas naik LANGSUNG peramban → Cloudinary (pola persis
      //    kirim-video-manual yang sudah terbukti jalan di produksi;
      //    server cuma memberi cloud name + unsigned preset). Berkas
      //    dihapus otomatis dari Cloudinary 2 jam setelah tayang.
      setTahap("unggah");
      setPersen(0);
      const konfig = await getKonfigUploadVideo();
      if (konfig.maks_upload_mb && berkas.size > konfig.maks_upload_mb * 1024 * 1024) {
        throw new Error(
          `Video terlalu besar (${Math.round(berkas.size / 1_048_576)} MB). Batasnya ${konfig.maks_upload_mb} MB.`,
        );
      }
      const hasilUpload = await new Promise<{ secure_url: string; public_id: string }>(
        (selesai, gagal) => {
          const bentuk = new FormData();
          bentuk.append("file", berkas);
          bentuk.append("upload_preset", konfig.uploadPreset);
          bentuk.append("resource_type", "video");
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `https://api.cloudinary.com/v1_1/${konfig.cloudName}/video/upload`);
          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) setPersen(Math.round((100 * ev.loaded) / ev.total));
          };
          xhr.onload = () => {
            try {
              const json = JSON.parse(xhr.responseText) as {
                secure_url?: string;
                public_id?: string;
                error?: { message?: string };
              };
              if (xhr.status >= 200 && xhr.status < 300 && json.secure_url && json.public_id) {
                selesai({ secure_url: json.secure_url, public_id: json.public_id });
              } else {
                gagal(new Error(json.error?.message ?? "Penyimpanan video menolak berkas ini."));
              }
            } catch {
              gagal(new Error("Balasan penyimpanan video tidak terbaca."));
            }
          };
          xhr.onerror = () =>
            gagal(new Error("Koneksi terputus saat mengunggah video. Coba lagi."));
          xhr.send(bentuk);
        },
      );

      // 2. Server menyerahkan URL Cloudinary-nya ke upload-post.
      setTahap("post");
      const hasil = await postTvrku({
        video_url: hasilUpload.secure_url,
        public_id: hasilUpload.public_id,
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
      <GlassCard className="p-4">
        {/* Pilih berkas */}
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          className="hidden"
          onChange={(e) => setBerkas(e.target.files?.[0] ?? null)}
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
              Minimal 5 menit dari sekarang, maksimal 30 hari ke depan. Video
              diposting otomatis pada waktunya.
            </p>
          </div>
        )}
        <p className="mt-2 text-[10.5px] leading-relaxed text-teks-sekunder">
          Video diunggah ke penyimpanan sementara (Cloudinary) dan dihapus otomatis
          2 jam setelah tayang — postingan di sosmed Anda tetap ada.
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
              {tahap === "unggah" ? `Mengunggah video… ${persen}%` : "Memposting…"}
            </>
          ) : (
            <>
              <Send className="h-4.5 w-4.5" />
              {pakaiJadwal ? "Jadwalkan Post" : "Post Sekarang"}
            </>
          )}
        </button>
      </GlassCard>

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
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}

"use client";

// ============================================================
// JadwalPostingPanel (fitur 1.22.x/3) — komposer JADWAL POSTING
// TV Rakyat Official. Susun caption + media + platform tujuan +
// waktu tayang; Ayrshare yang menerbitkan pada waktunya (tanpa cron
// di aplikasi). Menampilkan pula daftar jadwal + tombol batal.
//
// Media diunggah langsung peramban → Cloudinary (unsigned preset),
// sama seperti Upload Manual, lalu URL publiknya dikirim ke Ayrshare.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, ImagePlus, Loader2, Send, Trash2, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { EmptyState, GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { PlatformIcon, labelPlatform } from "@/components/platform-icon";
import {
  batalkanJadwalPosting,
  getInsightSosmed,
  getJadwalPosting,
  getKonfigUploadVideo,
  jadwalkanPosting,
  type JadwalPosting,
} from "@/services";
import { toast } from "@/hooks/use-app-store";
import { cn } from "@/lib/utils";

// Batas caption per platform (sama dengan yang dijaga server).
const BATAS_CAPTION: Record<string, number> = {
  instagram: 2200,
  tiktok: 2200,
  youtube: 5000,
  facebook: 63206,
  twitter: 25000,
  threads: 500,
};

type WarnaBadge = "hijau" | "biru" | "kuning" | "merah" | "netral";
const BADGE_STATUS: Record<JadwalPosting["status"], { label: string; warna: WarnaBadge }> = {
  terjadwal: { label: "Terjadwal", warna: "biru" },
  terkirim: { label: "Terkirim", warna: "hijau" },
  gagal: { label: "Gagal", warna: "merah" },
  dibatalkan: { label: "Dibatalkan", warna: "netral" },
};

/** "Sen, 1 Sep 2026 14:30 WIB" dari ISO string. */
function waktuWib(iso: string): string {
  try {
    return (
      new Intl.DateTimeFormat("id-ID", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
      }).format(new Date(iso)) + " WIB"
    );
  } catch {
    return iso;
  }
}

type Media = { url: string; publicId: string; isVideo: boolean };

export function JadwalPostingPanel() {
  const [platformAktif, setPlatformAktif] = useState<string[]>([]);
  const [terpilih, setTerpilih] = useState<Set<string>>(new Set());
  const [caption, setCaption] = useState("");
  const [judulYt, setJudulYt] = useState("");
  const [jadwalLocal, setJadwalLocal] = useState("");
  const [media, setMedia] = useState<Media | null>(null);
  const [persen, setPersen] = useState<number | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [daftar, setDaftar] = useState<JadwalPosting[] | null>(null);
  const [muatUlang, setMuatUlang] = useState(0);
  const berkasRef = useRef<HTMLInputElement>(null);

  // Platform yang benar-benar tertaut di Ayrshare — hanya itu yang boleh
  // jadi tujuan (server juga menyaring ulang).
  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const info = await getInsightSosmed();
        if (hidup) setPlatformAktif(info.akun?.platformAktif ?? []);
      } catch {
        if (hidup) setPlatformAktif([]);
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const d = await getJadwalPosting();
        if (hidup) setDaftar(d);
      } catch (e) {
        if (hidup) {
          setDaftar([]);
          toast("error", "Gagal memuat jadwal", e instanceof Error ? e.message : "");
        }
      }
    })();
    return () => {
      hidup = false;
    };
  }, [muatUlang]);

  const batasCaption =
    terpilih.size > 0 ? Math.min(...[...terpilih].map((p) => BATAS_CAPTION[p] ?? 2200)) : 2200;

  async function pilihMedia(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const isVideo = f.type.startsWith("video");
    setPersen(0);
    try {
      const konfig = await getKonfigUploadVideo();
      if (konfig.maks_upload_mb && f.size > konfig.maks_upload_mb * 1024 * 1024) {
        throw new Error(`Berkas melebihi batas ${konfig.maks_upload_mb} MB.`);
      }
      const hasil = await new Promise<{ secure_url: string; public_id: string }>(
        (selesai, gagal) => {
          const bentuk = new FormData();
          bentuk.append("file", f);
          bentuk.append("upload_preset", konfig.uploadPreset);
          bentuk.append("resource_type", isVideo ? "video" : "image");
          const xhr = new XMLHttpRequest();
          xhr.open(
            "POST",
            `https://api.cloudinary.com/v1_1/${konfig.cloudName}/${isVideo ? "video" : "image"}/upload`,
          );
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
                gagal(new Error(json.error?.message ?? "Penyimpanan menolak berkas ini."));
              }
            } catch {
              gagal(new Error("Balasan penyimpanan tidak terbaca."));
            }
          };
          xhr.onerror = () => gagal(new Error("Koneksi terputus saat mengunggah."));
          xhr.send(bentuk);
        },
      );
      setMedia({ url: hasil.secure_url, publicId: hasil.public_id, isVideo });
      toast("sukses", "Media terunggah", isVideo ? "Video siap dijadwalkan." : "Foto siap dijadwalkan.");
    } catch (err) {
      toast("error", "Gagal mengunggah media", err instanceof Error ? err.message : "");
    } finally {
      setPersen(null);
      if (berkasRef.current) berkasRef.current.value = "";
    }
  }

  function togglePlatform(p: string) {
    setTerpilih((set) => {
      const baru = new Set(set);
      if (baru.has(p)) baru.delete(p);
      else baru.add(p);
      return baru;
    });
  }

  async function kirim() {
    if (sibuk) return;
    if (!media) {
      toast("peringatan", "Unggah media dulu", "Foto atau video wajib untuk posting sosmed.");
      return;
    }
    if (terpilih.size === 0) {
      toast("peringatan", "Pilih platform tujuan");
      return;
    }
    if (!jadwalLocal) {
      toast("peringatan", "Tentukan waktu tayang");
      return;
    }
    const jadwalIso = new Date(jadwalLocal);
    if (Number.isNaN(jadwalIso.getTime())) {
      toast("peringatan", "Waktu jadwal tidak sah");
      return;
    }
    if (jadwalIso.getTime() < Date.now() + 5 * 60 * 1000) {
      toast("peringatan", "Jadwal minimal 5 menit dari sekarang");
      return;
    }
    if (caption.length > batasCaption) {
      toast("peringatan", `Caption melebihi ${batasCaption} karakter`);
      return;
    }
    setSibuk(true);
    try {
      await jadwalkanPosting({
        caption: caption.trim(),
        media_url: media.url,
        media_public_id: media.publicId,
        is_video: media.isVideo,
        platforms: [...terpilih],
        judul_youtube: terpilih.has("youtube") ? judulYt.trim() || undefined : undefined,
        jadwal_pada: jadwalIso.toISOString(),
      });
      toast("sukses", "Posting dijadwalkan", `Tayang ${waktuWib(jadwalIso.toISOString())}.`);
      setCaption("");
      setJudulYt("");
      setJadwalLocal("");
      setMedia(null);
      setTerpilih(new Set());
      setMuatUlang((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal menjadwalkan", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(false);
    }
  }

  async function batalkan(id: string) {
    try {
      await batalkanJadwalPosting(id);
      toast("info", "Jadwal dibatalkan", "Postingan tidak akan tayang.");
      setMuatUlang((n) => n + 1);
    } catch (e) {
      toast("error", "Gagal membatalkan", e instanceof Error ? e.message : "");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Komposer */}
      <GlassCard className="p-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4.5 w-4.5 text-pri" aria-hidden="true" />
          <p className="font-heading text-sm font-bold text-teks-utama">Jadwalkan Posting</p>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-teks-sekunder">
          Susun postingan resmi TV Rakyat untuk tayang otomatis di waktu yang Anda
          tentukan. Ayrshare yang menerbitkannya.
        </p>

        {/* Media */}
        <div className="mt-3">
          {media ? (
            <div className="glass-soft flex items-center gap-3 rounded-xl p-2.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sukses/15 text-sukses">
                <ImagePlus className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-teks-utama">
                {media.isVideo ? "Video" : "Foto"} siap · {media.url.split("/").pop()}
              </span>
              <button
                type="button"
                onClick={() => setMedia(null)}
                aria-label="Hapus media"
                className="btn-tekan p-1 text-teks-sekunder hover:text-gagal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => berkasRef.current?.click()}
              disabled={persen !== null}
              className="glass btn-tekan flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-semibold text-teks-utama disabled:opacity-60"
            >
              {persen !== null ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Mengunggah… {persen}%
                </>
              ) : (
                <>
                  <ImagePlus className="h-4.5 w-4.5" /> Unggah Foto / Video
                </>
              )}
            </button>
          )}
          <input
            ref={berkasRef}
            type="file"
            accept="image/*,video/*"
            onChange={pilihMedia}
            className="hidden"
          />
        </div>

        {/* Caption */}
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Tulis caption postingan…"
          rows={3}
          className="glass-soft mt-2 w-full resize-none rounded-xl px-3 py-2.5 text-[13px] text-teks-utama outline-none placeholder:text-teks-sekunder/60 focus:ring-2 focus:ring-pri/50"
        />
        <p
          className={cn(
            "mt-0.5 text-right text-[10.5px]",
            caption.length > batasCaption ? "text-gagal" : "text-teks-sekunder",
          )}
        >
          {caption.length}/{batasCaption}
        </p>

        {/* Platform tujuan (hanya yang tertaut) */}
        <p className="mt-1 text-[11px] font-semibold text-teks-sekunder">Tayang di:</p>
        {platformAktif.length === 0 ? (
          <p className="mt-1 rounded-lg border border-dashed border-teks-sekunder/30 px-3 py-2 text-[11px] leading-snug text-teks-sekunder">
            Belum ada akun resmi tertaut di Ayrshare. Tautkan dulu di panel Insight/profil.
          </p>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {platformAktif.map((p) => {
              const aktif = terpilih.has(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePlatform(p)}
                  aria-pressed={aktif}
                  className={cn(
                    "btn-tekan flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold",
                    aktif ? "text-white" : "glass text-teks-sekunder",
                  )}
                  style={aktif ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" } : undefined}
                >
                  <PlatformIcon platform={p} size={13} />
                  {labelPlatform(p)}
                </button>
              );
            })}
          </div>
        )}

        {/* Judul YouTube (wajib bila YouTube dipilih) */}
        {terpilih.has("youtube") && (
          <input
            value={judulYt}
            onChange={(e) => setJudulYt(e.target.value)}
            placeholder="Judul untuk YouTube (maks. 100)"
            maxLength={100}
            className="glass-soft mt-2 h-10 w-full rounded-xl px-3 text-[13px] text-teks-utama outline-none placeholder:text-teks-sekunder/60 focus:ring-2 focus:ring-pri/50"
          />
        )}

        {/* Waktu tayang */}
        <label className="mt-2 block text-[11px] font-semibold text-teks-sekunder">
          Waktu tayang (waktu perangkat Anda)
        </label>
        <input
          type="datetime-local"
          value={jadwalLocal}
          onChange={(e) => setJadwalLocal(e.target.value)}
          className="glass-soft mt-1 h-11 w-full rounded-xl px-3 text-[13px] text-teks-utama outline-none focus:ring-2 focus:ring-pri/50"
        />

        <button
          type="button"
          onClick={() => void kirim()}
          disabled={sibuk}
          className="btn-tekan mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-bold text-white disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
        >
          {sibuk ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Jadwalkan Posting
        </button>
      </GlassCard>

      {/* Daftar jadwal */}
      <div>
        <p className="mb-2 px-1 text-[12px] font-bold text-teks-sekunder">Jadwal & Riwayat</p>
        {daftar === null ? (
          <GlassSkeleton className="h-20 rounded-2xl" />
        ) : daftar.length === 0 ? (
          <EmptyState
            ikon={CalendarClock}
            judul="Belum ada jadwal"
            keterangan="Posting yang Anda jadwalkan akan muncul di sini."
            className="py-8"
          />
        ) : (
          <div className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {daftar.map((j) => {
                const badge = BADGE_STATUS[j.status];
                return (
                  <motion.div
                    key={j.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <GlassCard className="flex items-start gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge label={badge.label} warna={badge.warna} />
                          <span className="text-[11px] text-teks-sekunder">
                            {waktuWib(j.jadwal_pada)}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[12.5px] text-teks-utama">
                          {j.caption || <span className="text-teks-sekunder italic">(tanpa caption)</span>}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {j.platforms.map((p) => (
                            <PlatformIcon key={p} platform={p} size={13} denganWadah />
                          ))}
                          <span className="ml-1 text-[10.5px] text-teks-sekunder">oleh {j.oleh}</span>
                        </div>
                        {j.error && (
                          <p className="mt-1 text-[10.5px] leading-snug text-gagal">{j.error}</p>
                        )}
                      </div>
                      {j.status === "terjadwal" && (
                        <button
                          type="button"
                          onClick={() => void batalkan(j.id)}
                          aria-label="Batalkan jadwal"
                          className="btn-tekan flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gagal/40 bg-gagal/5 text-gagal"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </GlassCard>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

// ============================================================
// ModalEditOtomatis (2 Sep 2026) — SATU pop-up untuk anggota Divisi
// PALUGODAM, menggabungkan dua pekerjaan yang selama ini terpisah:
//
//   BAGIAN 1 — EDIT OTOMATIS (template Creatomate lewat n8n):
//     link video sumber + HIGHLIGHT (satu kata) + Judul Video
//     (yang tampil di video) + Sumber video.
//   BAGIAN 2 — UPLOAD OTOMATIS (upload-post ke sosmed pribadi):
//     caption umum, caption khusus per sosmed, sakelar tiap akun
//     yang terhubung, dan jadwal terbit.
//
// Videonya dirender dulu; begitu selesai, sistem memposting sendiri
// tanpa anggota perlu membuka aplikasi lagi.
// ============================================================

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, Loader2, Sparkles, Wand2, X } from "lucide-react";
import { PlatformIcon } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import { kirimEditOtomatis } from "@/services";
import { cn } from "@/lib/utils";

const LABEL: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YT Short",
  facebook: "Facebook",
  threads: "Threads",
  twitter: "X",
};

/** Contoh kata highlight — memandu tanpa memaksa. */
const CONTOH_HIGHLIGHT = ["BOMBASTIS", "VIRAL", "KAGET", "MENGEJUTKAN", "HEBOH"];

export function ModalEditOtomatis({
  tertaut,
  onTutup,
  onSelesai,
}: {
  /** Platform sosmed pribadi yang sudah terhubung. */
  tertaut: string[];
  onTutup: () => void;
  onSelesai: () => void;
}) {
  // Bagian 1 — edit
  const [link, setLink] = useState("");
  const [highlight, setHighlight] = useState("");
  const [judulOverlay, setJudulOverlay] = useState("");
  const [sumber, setSumber] = useState("");
  // Bagian 2 — upload
  const [captionUmum, setCaptionUmum] = useState("");
  const [pilih, setPilih] = useState<Set<string>>(() => new Set(tertaut));
  const [captionPer, setCaptionPer] = useState<Record<string, string>>({});
  const [bukaCaptionPer, setBukaCaptionPer] = useState(false);
  const [pakaiJadwal, setPakaiJadwal] = useState(false);
  const [jadwal, setJadwal] = useState("");
  const [kirim, setKirim] = useState(false);

  const sah =
    link.trim().length > 5 &&
    highlight.trim().length > 0 &&
    !/\s/.test(highlight.trim()) &&
    judulOverlay.trim().length >= 3 &&
    pilih.size > 0 &&
    (!pakaiJadwal || Boolean(jadwal));

  function togglePlatform(p: string) {
    setPilih((lama) => {
      const baru = new Set(lama);
      if (baru.has(p)) baru.delete(p);
      else baru.add(p);
      return baru;
    });
  }

  async function jalankan() {
    if (!sah || kirim) return;
    setKirim(true);
    try {
      const r = await kirimEditOtomatis({
        link: link.trim(),
        highlight: highlight.trim().toUpperCase(),
        judul_overlay: judulOverlay.trim(),
        sumber_akun: sumber.trim() || undefined,
        caption_umum: captionUmum.trim() || undefined,
        caption_platform: Object.fromEntries(
          Object.entries(captionPer).filter(([k, v]) => pilih.has(k) && v.trim()),
        ),
        platforms: [...pilih],
        jadwal: pakaiJadwal && jadwal ? new Date(jadwal).toISOString() : undefined,
      });
      toast("sukses", "Video diproses", r.pesan);
      onSelesai();
      onTutup();
    } catch (e) {
      toast("error", "Gagal", e instanceof Error ? e.message : "Coba lagi sebentar.");
    } finally {
      setKirim(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label="Edit & Upload Otomatis"
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onTutup} />
        <motion.div
          initial={{ y: 32, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 32, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="glass relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl"
        >
          {/* Kepala */}
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <Wand2 className="h-5 w-5 text-pri" />
            <p className="font-heading text-[15px] font-extrabold text-teks-utama">
              Edit &amp; Upload Otomatis
            </p>
            <button
              type="button"
              onClick={onTutup}
              aria-label="Tutup"
              className="glass btn-tekan ml-auto flex h-9 w-9 items-center justify-center rounded-xl text-teks-utama"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="scrollbar-tipis flex-1 overflow-y-auto px-4 pb-5">
            {/* ================= BAGIAN 1: EDIT ================= */}
            <p className="mt-1 flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
              <Sparkles className="h-3 w-3" /> 1. Edit Video Otomatis
            </p>

            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Link video TikTok / Instagram"
              inputMode="url"
              disabled={kirim}
              className="glass-input mt-2 h-11 w-full rounded-xl px-3 text-sm text-teks-utama"
            />

            <input
              value={highlight}
              onChange={(e) => setHighlight(e.target.value.replace(/\s/g, ""))}
              placeholder="HIGHLIGHT — satu kata"
              maxLength={20}
              disabled={kirim}
              className="glass-input mt-2 h-11 w-full rounded-xl px-3 text-sm font-bold tracking-wide text-teks-utama uppercase"
            />
            <div className="tanpa-scrollbar -mx-4 mt-1.5 flex gap-1.5 overflow-x-auto px-4">
              {CONTOH_HIGHLIGHT.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setHighlight(c)}
                  disabled={kirim}
                  className="glass btn-tekan shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold text-teks-sekunder"
                >
                  {c}
                </button>
              ))}
            </div>

            <input
              value={judulOverlay}
              onChange={(e) => setJudulOverlay(e.target.value)}
              placeholder="Judul yang tampil di video"
              maxLength={120}
              disabled={kirim}
              className="glass-input mt-2 h-11 w-full rounded-xl px-3 text-sm text-teks-utama"
            />

            <input
              value={sumber}
              onChange={(e) => setSumber(e.target.value)}
              placeholder="Sumber video (mis. @akun_asal)"
              maxLength={100}
              disabled={kirim}
              className="glass-input mt-2 h-11 w-full rounded-xl px-3 text-sm text-teks-utama"
            />

            {/* ================= BAGIAN 2: UPLOAD ================= */}
            <p className="mt-5 flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
              <CalendarClock className="h-3 w-3" /> 2. Upload Otomatis
            </p>

            <textarea
              value={captionUmum}
              onChange={(e) => setCaptionUmum(e.target.value)}
              rows={3}
              maxLength={2200}
              placeholder="Caption untuk semua sosmed…"
              disabled={kirim}
              className="glass-input mt-2 w-full rounded-xl px-3 py-2.5 text-sm text-teks-utama"
            />

            {/* Sakelar tiap akun yang terhubung */}
            <p className="mt-3 text-[11.5px] font-semibold text-teks-sekunder">
              Kirim ke ({pilih.size} dipilih):
            </p>
            {tertaut.length === 0 ? (
              <p className="mt-1 text-[11.5px] text-teks-sekunder">
                Belum ada akun sosmed tertaut — hubungkan dulu di Akun TV Rakyat Saya.
              </p>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-2">
                {tertaut.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p)}
                    disabled={kirim}
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
                    <PlatformIcon platform={p} size={12} />
                    {LABEL[p] ?? p}
                  </button>
                ))}
              </div>
            )}

            {/* Caption khusus per sosmed */}
            {pilih.size > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setBukaCaptionPer((v) => !v)}
                  disabled={kirim}
                  className="glass btn-tekan mt-3 w-full rounded-xl py-2 text-[11.5px] font-bold text-teks-utama"
                >
                  {bukaCaptionPer ? "Sembunyikan" : "Sesuaikan"} caption per sosmed
                </button>
                {bukaCaptionPer && (
                  <div className="mt-2 flex flex-col gap-2">
                    {[...pilih].map((p) => (
                      <div key={p}>
                        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-teks-sekunder">
                          <PlatformIcon platform={p} size={11} />
                          {LABEL[p] ?? p}
                        </p>
                        <textarea
                          value={captionPer[p] ?? ""}
                          onChange={(e) =>
                            setCaptionPer((c) => ({ ...c, [p]: e.target.value }))
                          }
                          rows={2}
                          maxLength={2200}
                          placeholder="Kosongkan = pakai caption umum"
                          disabled={kirim}
                          className="glass-input w-full rounded-xl px-3 py-2 text-[12.5px] text-teks-utama"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Jadwal */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPakaiJadwal(false)}
                disabled={kirim}
                aria-pressed={!pakaiJadwal}
                className={cn(
                  "btn-tekan rounded-xl py-2.5 text-[12px] font-bold",
                  !pakaiJadwal ? "bg-pri/15 text-pri" : "glass text-teks-sekunder",
                )}
              >
                Posting Otomatis
              </button>
              <button
                type="button"
                onClick={() => setPakaiJadwal(true)}
                disabled={kirim}
                aria-pressed={pakaiJadwal}
                className={cn(
                  "btn-tekan rounded-xl py-2.5 text-[12px] font-bold",
                  pakaiJadwal ? "bg-pri/15 text-pri" : "glass text-teks-sekunder",
                )}
              >
                Jadwalkan
              </button>
            </div>
            {pakaiJadwal && (
              <input
                type="datetime-local"
                value={jadwal}
                onChange={(e) => setJadwal(e.target.value)}
                disabled={kirim}
                aria-label="Waktu jadwal terbit"
                className="glass-input mt-2 h-10 w-full rounded-xl px-2.5 text-[12px] text-teks-utama"
              />
            )}

            <p className="mt-3 text-[10.5px] leading-relaxed text-teks-sekunder">
              Video dirender dulu memakai template (20–120 detik). Begitu selesai,
              sistem memposting sendiri — Anda tidak perlu menunggu di layar ini.
            </p>

            <button
              type="button"
              onClick={() => void jalankan()}
              disabled={!sah || kirim}
              className="btn-tekan mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[13.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
            >
              {kirim ? (
                <>
                  <Loader2 className="h-4.5 w-4.5 animate-spin" /> Mengirim…
                </>
              ) : (
                <>
                  <Wand2 className="h-4.5 w-4.5" /> Proses &amp; Posting
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

"use client";

// ============================================================
// AsistenScreen (fitur 1.20/3) — chatbot data internal partai.
//
// - Mode TEKS: tanya-jawab dengan Gemini yang membaca data Supabase
//   lewat alat daftar-putih di server (absensi, KPI, kepatuhan,
//   statistik TV, cari anggota).
// - Mode SUARA: percakapan 2 arah realtime (Gemini Live) — tekan
//   tombol mik, bicara, dan asisten menjawab dengan suara; bisa
//   disela kapan saja.
//
// Akses per jabatan diatur master/super (chatbot_access); layar ini
// hanya tampil bila server bilang boleh.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Mic, Send, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton, ThemeToggle } from "@/components/pri-ui";
import { TombolLonceng } from "@/components/tombol-lonceng";
import { getStatusAsisten, tanyaAsisten, type PesanAsisten } from "@/services";
import { LayarSuara } from "./layar-suara";
import { cn } from "@/lib/utils";

const CONTOH_TANYA = [
  "Berapa yang sudah absen hari ini?",
  "Bagaimana capaian KPI video hari ini?",
  "Berapa kader yang belum penuh komentarnya?",
  "Statistik TV Rakyat seminggu terakhir?",
];

export function AsistenScreen({
  onBukaNotifikasi,
}: {
  onBukaNotifikasi?: () => void;
}) {
  const [status, setStatus] = useState<{ boleh: boolean; siap: boolean } | null>(null);
  const [riwayat, setRiwayat] = useState<PesanAsisten[]>([]);
  const [pesan, setPesan] = useState("");
  const [berpikir, setBerpikir] = useState(false);
  // Mode suara ala Gemini (fitur 1.20.1) — layar penuh terpisah.
  const [suaraBuka, setSuaraBuka] = useState(false);
  const ujungRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      const s = await getStatusAsisten();
      if (hidup) setStatus(s);
    })();
    return () => {
      hidup = false;
    };
  }, []);

  useEffect(() => {
    ujungRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [riwayat, berpikir]);

  async function kirim(teks?: string) {
    const isi = (teks ?? pesan).trim();
    if (!isi || berpikir) return;
    setPesan("");
    setRiwayat((r) => [...r, { peran: "pengguna", teks: isi }]);
    setBerpikir(true);
    try {
      const jawaban = await tanyaAsisten(isi, riwayat);
      setRiwayat((r) => [...r, { peran: "asisten", teks: jawaban }]);
    } catch (e) {
      setRiwayat((r) => [
        ...r,
        {
          peran: "asisten",
          teks: e instanceof Error ? e.message : "Maaf, terjadi gangguan. Coba lagi.",
        },
      ]);
    } finally {
      setBerpikir(false);
    }
  }

  if (status === null) {
    return (
      <div className="kolom-aplikasi px-4 pt-5 pb-32">
        <GlassSkeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="kolom-aplikasi flex min-h-dvh flex-col px-4 pt-5 pb-32">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
            style={{
              background: "linear-gradient(135deg, #8B5CF6, #6D28D9)",
              boxShadow: "0 10px 24px rgba(139, 92, 246, 0.35)",
            }}
            aria-hidden="true"
          >
            <Bot className="h-5.5 w-5.5" />
          </span>
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-extrabold tracking-tight text-teks-utama">
              Asisten
            </h1>
            <p className="truncate text-xs text-teks-sekunder">
              Tanya data partai — teks atau suara
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <TombolLonceng onBuka={onBukaNotifikasi} />
          <ThemeToggle />
        </div>
      </header>

      {!status.siap && (
        <GlassCard className="mt-4 border-emas/40 bg-emas/[0.06] p-3.5">
          <p className="text-xs leading-relaxed text-teks-utama">
            Asisten AI belum diatur pengelola (kunci Gemini belum terpasang).
            Layar ini akan hidup begitu kuncinya dipasang.
          </p>
        </GlassCard>
      )}

      {/* Riwayat percakapan */}
      <div className="mt-4 flex-1">
        {riwayat.length === 0 ? (
          <GlassCard className="p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-pri" aria-hidden="true" />
              <p className="text-sm font-bold text-teks-utama">Coba tanyakan</p>
            </div>
            <div className="mt-2.5 flex flex-col gap-1.5">
              {CONTOH_TANYA.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={!status.siap || berpikir}
                  onClick={() => void kirim(c)}
                  className="glass-soft btn-tekan rounded-xl px-3 py-2.5 text-left text-[12.5px] font-semibold text-teks-utama disabled:opacity-50"
                >
                  {c}
                </button>
              ))}
            </div>
          </GlassCard>
        ) : (
          <div className="flex flex-col gap-2.5">
            {riwayat.map((r, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap",
                  r.peran === "pengguna"
                    ? "self-end rounded-br-md text-white"
                    : "glass self-start rounded-bl-md text-teks-utama",
                )}
                style={
                  r.peran === "pengguna"
                    ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }
                    : undefined
                }
              >
                {r.teks}
              </div>
            ))}
            {berpikir && (
              <div className="glass flex items-center gap-2 self-start rounded-2xl rounded-bl-md px-3.5 py-2.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-pri" aria-hidden="true" />
                <span className="text-[12px] text-teks-sekunder">Membaca data…</span>
              </div>
            )}
            <div ref={ujungRef} />
          </div>
        )}
      </div>

      {/* Bilah masukan + tombol suara */}
      <div className="sticky bottom-24 mt-4 lg:bottom-4">
        <GlassCard className="flex items-center gap-2 p-2">
          <button
            type="button"
            onClick={() => setSuaraBuka(true)}
            disabled={!status.siap}
            aria-label="Mulai mode suara"
            className="btn-tekan flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #8B5CF6, #6D28D9)" }}
          >
            <Mic className="h-5 w-5" />
          </button>
          <input
            value={pesan}
            onChange={(e) => setPesan(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void kirim();
            }}
            placeholder="Tanya data partai…"
            disabled={!status.siap || berpikir}
            aria-label="Pesan untuk Asisten"
            className="h-11 min-w-0 flex-1 bg-transparent px-2 text-sm text-teks-utama placeholder:text-teks-sekunder/70 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void kirim()}
            disabled={!status.siap || berpikir || !pesan.trim()}
            aria-label="Kirim pertanyaan"
            className="btn-tekan flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            <Send className="h-4.5 w-4.5" />
          </button>
        </GlassCard>
      </div>

      {/* Layar suara penuh ala Gemini (fitur 1.20.1) */}
      {suaraBuka && <LayarSuara onTutup={() => setSuaraBuka(false)} />}
    </div>
  );
}

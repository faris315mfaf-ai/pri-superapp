"use client";

// ============================================================
// ChatBotView (13 Okt 2026) — room chat bersama agen bot (HANYA mode nyata, master).
//
// Sebut agen dengan @nama (mis. "@Raka sudah sampai mana?") atau @semua agar mereka menjawab dengan
// otak dan kepribadiannya masing-masing. Agen hanya BERBICARA: tidak bisa memulai tugas dari sini.
// Agen tanpa API key dijawab catatan sistem yang menunjuk ke TVR Saya → Otak Bot.
// Segar otomatis 10 dtk; setelah mengirim, polling cepat (3 dtk, maks ±45 dtk) menunggu jawaban.
// Anti-balapan: muatan bernomor; hasil lama dibuang; unmount aman.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import { useSegarOtomatis } from "@/hooks/use-segar-otomatis";
import { getChatBot, kirimChatBot } from "@/services";
import { PESAN_MAKS, normalkanPesan, type PesanChat, type StatusChat } from "@/lib/bot-chat-murni";
import { cn } from "@/lib/utils";

const jam = (iso: string): string => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t + 7 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

function Gelembung({ p }: { p: PesanChat }) {
  const saya = p.pengirim === "master";
  const sistem = p.pengirim === "sistem";
  return (
    <li className={cn("flex", saya ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[88%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed",
          saya ? "bg-pri/15 text-teks-utama" : sistem ? "border border-dashed border-glass-border text-teks-sekunder" : "glass text-teks-utama",
        )}
      >
        <span className="mb-0.5 flex items-center gap-1.5 text-[11px] font-bold text-teks-sekunder">
          {p.warna && <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: p.warna }} />}
          {p.nama}
          <span className="font-normal">{jam(p.dibuat_pada)}</span>
        </span>
        <span className="block whitespace-pre-wrap break-words">{p.teks}</span>
      </div>
    </li>
  );
}

export function ChatBotView() {
  const [status, setStatus] = useState<StatusChat | null>(null);
  const [galat, setGalat] = useState("");
  const [teks, setTeks] = useState("");
  const [kirim, setKirim] = useState(false);
  const [menunggu, setMenunggu] = useState(false);
  const nomor = useRef(0);
  const hidup = useRef(true);
  const daftar = useRef<HTMLUListElement | null>(null);
  const batasMenunggu = useRef(0);

  const muat = useCallback(async () => {
    const ini = ++nomor.current;
    try {
      const d = await getChatBot();
      if (ini !== nomor.current || !hidup.current) return;
      setStatus(d);
      setGalat("");
    } catch (e) {
      if (ini !== nomor.current || !hidup.current) return;
      setGalat(e instanceof Error ? e.message : "Gagal memuat chat.");
    }
  }, []);

  useEffect(() => {
    hidup.current = true;
    return () => {
      hidup.current = false;
    };
  }, []);
  useEffect(() => {
    void Promise.resolve().then(muat);
  }, [muat]);
  useSegarOtomatis(() => void muat(), 10);

  // Jawaban lengkap = semua agen yang disebut di pesan master terakhir sudah menjawab (atau dicatat sistem).
  const lengkap = (() => {
    if (!status) return false;
    const akhir = [...status.pesan].reverse().find((p) => p.pengirim === "master");
    if (!akhir) return false;
    const sudah = status.pesan.filter((p) => p.id > akhir.id && (p.pengirim === "bot" || p.pengirim === "sistem")).length;
    return sudah >= Math.max(1, akhir.menyebut.length);
  })();
  const lengkapRef = useRef(false);
  useEffect(() => {
    lengkapRef.current = lengkap;
  }, [lengkap]);
  const tampilMenunggu = menunggu && !lengkap;

  // Polling cepat sementara menunggu jawaban agen.
  useEffect(() => {
    if (!menunggu) return;
    const t = setInterval(() => {
      if (Date.now() > batasMenunggu.current || lengkapRef.current) {
        setMenunggu(false);
        return;
      }
      void muat();
    }, 3000);
    return () => clearInterval(t);
  }, [menunggu, muat]);

  // Gulir ke pesan terbaru saat jumlah pesan bertambah.
  const jumlah = status?.pesan.length ?? 0;
  useEffect(() => {
    const el = daftar.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [jumlah]);


  const sah = normalkanPesan(teks);
  const kirimPesan = async () => {
    if (!sah.ok || kirim) return;
    setKirim(true);
    try {
      const r = await kirimChatBot(sah.teks);
      setTeks("");
      if (r.menyebut.length > 0) {
        batasMenunggu.current = Date.now() + 45_000;
        setMenunggu(true);
      }
      await muat();
    } catch (e) {
      toast("error", "Pesan gagal dikirim", e instanceof Error ? e.message : "");
    } finally {
      setKirim(false);
    }
  };

  if (status === null) {
    return galat ? <GlassCard className="p-6 text-center text-sm text-teks-sekunder">Chat gagal dimuat: {galat}</GlassCard> : <GlassSkeleton className="h-64 rounded-2xl" />;
  }
  if (!status.tabel_ada) {
    return <GlassCard className="p-6 text-center text-sm text-teks-sekunder">Migrasi room chat (sql/73) belum dijalankan.</GlassCard>;
  }
  const tanpaOtak = status.bots.filter((b) => !b.punya_otak);

  return (
    <div className="space-y-3">
      <GlassCard className="p-3.5">
        <p className="m-0 text-[11.5px] leading-relaxed text-teks-sekunder">
          Sebut agen dengan <b className="text-teks-utama">@nama</b> (atau <b className="text-teks-utama">@semua</b>) supaya ia menjawab dengan otak dan
          kepribadiannya sendiri. Agen hanya berbicara; membagi tugas lewat chat menyusul bersama koordinator.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {status.bots.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setTeks((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}@${b.nama} `)}
              className={cn("btn-tekan inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-bold", b.punya_otak ? "border-glass-border text-teks-utama" : "border-amber-500/40 text-amber-700 dark:text-amber-300")}
              aria-label={`Sebut ${b.nama}${b.punya_otak ? "" : " (belum punya API key)"}`}
            >
              <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: b.warna || "currentColor" }} />@{b.nama}
              {!b.punya_otak && <span className="font-normal">· tanpa key</span>}
            </button>
          ))}
        </div>
        {tanpaOtak.length > 0 && (
          <p className="m-0 mt-2 text-[10.5px] text-amber-700 dark:text-amber-300">
            {tanpaOtak.map((b) => b.nama).join(", ")} belum punya API key — pasang di TVR Saya → Otak Bot agar bisa menjawab.
          </p>
        )}
      </GlassCard>

      <GlassCard className="p-3">
        <ul ref={daftar} className="m-0 flex max-h-[52dvh] min-h-40 list-none flex-col gap-2 overflow-y-auto p-0" aria-live="polite" aria-label="Percakapan room bot">
          {status.pesan.length === 0 ? (
            <li className="m-auto py-8 text-center text-[12.5px] text-teks-sekunder">Belum ada percakapan. Mulai dengan menyapa, mis. “@Raka sudah sampai mana?”.</li>
          ) : (
            status.pesan.map((p) => <Gelembung key={p.id} p={p} />)
          )}
          {tampilMenunggu && (
            <li className="flex items-center gap-1.5 text-[11.5px] text-teks-sekunder">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> agen sedang menulis…
            </li>
          )}
        </ul>
        {galat && <p className="m-0 mt-2 text-[11px] text-red-600 dark:text-red-400">Pembaruan terakhir gagal: {galat}</p>}
        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void kirimPesan();
          }}
        >
          <label htmlFor="rb-chat-teks" className="sr-only">
            Pesan untuk agen
          </label>
          <textarea
            id="rb-chat-teks"
            value={teks}
            onChange={(e) => setTeks(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void kirimPesan();
              }
            }}
            rows={2}
            maxLength={PESAN_MAKS}
            placeholder="Tulis pesan… (@Raka, @Sinta, @Dimas atau @semua)"
            disabled={kirim}
            className="glass-input min-h-[44px] flex-1 resize-none rounded-xl px-3 py-2 text-base text-teks-utama sm:text-[13px]"
          />
          <button
            type="submit"
            disabled={!sah.ok || kirim}
            aria-label="Kirim pesan"
            className="btn-tekan flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pri text-white disabled:opacity-50"
          >
            {kirim ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </GlassCard>
    </div>
  );
}

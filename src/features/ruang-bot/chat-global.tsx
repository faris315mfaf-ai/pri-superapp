"use client";

// ============================================================
// ChatGlobal (14 Okt 2026) — satu room untuk semua anggota yang login, di layar Ruang Bot.
// Teks saja (maks 500 karakter), 5 pesan / 30 dtk per orang, kata kasar disamarkan di server.
// Master: tombol Moderasi per pesan (hapus, bisukan 15 mnt / 1 jam / 24 jam, buka bisu).
// State dimiliki pemanggil (useChatGlobal) supaya gelembung di kanvas ikut pesan yang sama.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { GlassCard } from "@/components/glass-card";
import { MAKS_KARAKTER_CHAT, type PesanGlobal } from "@/lib/chat-global-murni";
import { cn } from "@/lib/utils";
import { PotretKarakter } from "./potret-karakter";
import type { ChatGlobalKlien } from "./use-chat-global";

const PILIHAN_BISU: { menit: number; label: string }[] = [
  { menit: 15, label: "Bisukan 15 mnt" },
  { menit: 60, label: "1 jam" },
  { menit: 1440, label: "24 jam" },
];

function jamWib(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "--:--";
  const d = new Date(ms + 7 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function Moderasi({ pesan, sayaId, aksi, onGalat }: { pesan: PesanGlobal; sayaId: number; aksi: ChatGlobalKlien["aksi"]; onGalat: (g: string) => void }) {
  const [buka, setBuka] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const jalankan = async (a: Parameters<ChatGlobalKlien["aksi"]>[0]) => {
    setSibuk(true);
    const g = await aksi(a);
    setSibuk(false);
    onGalat(g);
    if (!g) setBuka(false);
  };
  const tombol =
    "rounded-full border px-2.5 text-[11px] font-bold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-pri disabled:opacity-50 max-md:min-h-10 md:py-0.5";
  if (!buka) {
    return (
      <button
        type="button"
        onClick={() => setBuka(true)}
        aria-label={`Moderasi pesan ${pesan.nama}`}
        className="rounded px-1 text-[10.5px] font-semibold text-teks-sekunder underline decoration-dotted underline-offset-2 focus-visible:outline-2 focus-visible:outline-pri max-md:min-h-10"
      >
        Moderasi
      </button>
    );
  }
  const orangLain = pesan.user_id !== sayaId;
  return (
    <span role="group" aria-label={`Moderasi pesan ${pesan.nama}`} className="mt-1 flex flex-wrap items-center gap-1.5">
      <button type="button" disabled={sibuk} onClick={() => void jalankan({ aksi: "hapus", id: pesan.id })} className={cn(tombol, "border-gagal/50 text-gagal")}>
        Hapus pesan
      </button>
      {orangLain &&
        PILIHAN_BISU.map((b) => (
          <button
            key={b.menit}
            type="button"
            disabled={sibuk}
            onClick={() => void jalankan({ aksi: "bisukan", user_id: pesan.user_id, menit: b.menit })}
            className={cn(tombol, "border-amber-500/50 text-amber-700 dark:text-amber-300")}
          >
            {b.label}
          </button>
        ))}
      {orangLain && (
        <button type="button" disabled={sibuk} onClick={() => void jalankan({ aksi: "buka_bisu", user_id: pesan.user_id })} className={cn(tombol, "border-black/15 text-teks-sekunder dark:border-white/15")}>
          Buka bisu
        </button>
      )}
      <button type="button" onClick={() => setBuka(false)} className={cn(tombol, "border-transparent text-teks-sekunder")}>
        Tutup
      </button>
    </span>
  );
}

export function ChatGlobal({
  chat,
  sayaId,
  className,
  tinggiDaftar = "max-h-[360px]",
}: {
  chat: ChatGlobalKlien;
  sayaId: number;
  className?: string;
  /** Kelas tinggi daftar pesan (ponsel memakai tinggi lentur). */
  tinggiDaftar?: string;
}) {
  const { status } = chat;
  const [teks, setTeks] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatAksi, setGalatAksi] = useState("");
  const daftarRef = useRef<HTMLOListElement>(null);
  const nempelBawahRef = useRef(true);
  const pesan = status?.pesan ?? [];
  const idTerakhir = pesan.length ? pesan[pesan.length - 1].id : 0;

  // Gulir ke bawah saat pesan baru tiba, kecuali pengguna sedang membaca riwayat di atas.
  useEffect(() => {
    const el = daftarRef.current;
    if (el && nempelBawahRef.current) el.scrollTop = el.scrollHeight;
  }, [idTerakhir]);

  const bisuSampai = status?.bisu_sampai ?? null;
  const bisu = !!bisuSampai && Date.parse(bisuSampai) > Date.now();
  const belumAktif = status !== null && !status.tabel_ada;
  const bolehKirim = !!status && !belumAktif && !bisu && !mengirim && teks.trim().length > 0;

  const kirim = async () => {
    if (!bolehKirim) return;
    setMengirim(true);
    nempelBawahRef.current = true;
    const g = await chat.aksi({ aksi: "kirim", teks });
    setMengirim(false);
    setGalatAksi(g);
    if (!g) setTeks("");
  };

  return (
    <GlassCard className={cn("flex flex-col p-3.5", className)}>
      <h3 className="mb-1 flex items-center justify-between font-mono text-[11px] font-bold uppercase tracking-wider text-teks-sekunder">
        <span>Chat global</span>
        {status?.saya_master && <span className="rounded-full bg-amber-500/15 px-2 py-px text-[10px] text-amber-700 dark:text-amber-300">Moderator</span>}
      </h3>
      <p className="mb-2 text-[11px] text-teks-sekunder">Semua anggota yang login · teks saja · riwayat 7 hari</p>

      <ol
        ref={daftarRef}
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Pesan chat global"
        onScroll={(e) => {
          const el = e.currentTarget;
          nempelBawahRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        className={cn("scrollbar-tipis flex min-h-[120px] flex-col gap-2.5 overflow-y-auto pr-1", tinggiDaftar)}
      >
        {!status && !chat.galat && <li className="text-[12px] text-teks-sekunder">Memuat chat…</li>}
        {chat.galat && pesan.length === 0 && <li className="text-[12px] text-amber-700 dark:text-amber-300">Chat gagal dimuat: {chat.galat}</li>}
        {belumAktif && <li className="text-[12px] text-amber-700 dark:text-amber-300">Chat global belum aktif. Master perlu menjalankan migrasi sql/75.</li>}
        {status && !belumAktif && pesan.length === 0 && <li className="text-[12px] text-teks-sekunder">Belum ada pesan. Sapa yang sedang online.</li>}
        {pesan.map((p) => {
          const saya = p.user_id === sayaId;
          return (
            <li key={p.id} className={cn("flex gap-2", saya && "flex-row-reverse")}>
              <PotretKarakter userId={p.user_id} sayaId={sayaId} ukuran={30} className="mt-0.5" />
              <div className={cn("min-w-0 max-w-[85%]", saya && "text-right")}>
                <div className={cn("flex flex-wrap items-baseline gap-x-1.5", saya && "justify-end")}>
                  <b className="text-[12.5px] text-teks-utama">{saya ? "Anda" : p.nama}</b>
                  {p.master && <span className="rounded-full bg-amber-500/15 px-1.5 text-[9.5px] font-extrabold text-amber-700 dark:text-amber-300">MASTER</span>}
                  <time dateTime={p.dibuat_pada} className="angka-tab text-[10.5px] text-teks-sekunder">
                    {jamWib(p.dibuat_pada)}
                  </time>
                </div>
                <p
                  className={cn(
                    "mt-0.5 inline-block whitespace-pre-wrap break-words rounded-xl px-2.5 py-1.5 text-left text-[13px] leading-snug text-teks-utama",
                    saya ? "rounded-tr-sm bg-pri/12" : "rounded-tl-sm bg-black/[0.04] dark:bg-white/[0.07]",
                  )}
                >
                  {p.teks}
                </p>
                {status?.saya_master && (
                  <div className={cn(saya && "flex justify-end")}>
                    <Moderasi pesan={p} sayaId={sayaId} aksi={chat.aksi} onGalat={setGalatAksi} />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {bisu && bisuSampai && (
        <p role="status" className="mt-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11.5px] text-amber-800 dark:text-amber-200">
          Anda dibisukan master sampai pukul {jamWib(bisuSampai)} WIB. Anda tetap bisa membaca chat.
        </p>
      )}
      {galatAksi && (
        <p role="alert" className="mt-2 text-[11.5px] text-gagal">
          {galatAksi}
        </p>
      )}
      <form
        className="mt-2.5 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void kirim();
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">Tulis pesan chat global</span>
          <textarea
            value={teks}
            onChange={(e) => setTeks(e.target.value.slice(0, MAKS_KARAKTER_CHAT))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void kirim();
              }
            }}
            rows={1}
            maxLength={MAKS_KARAKTER_CHAT}
            disabled={!status || belumAktif || bisu}
            placeholder={bisu ? "Sedang dibisukan" : "Tulis pesan…"}
            className="block max-h-28 min-h-11 w-full resize-none rounded-xl border border-black/10 bg-white/70 px-3 py-2.5 text-[14px] text-teks-utama outline-none placeholder:text-teks-sekunder focus-visible:border-pri focus-visible:ring-2 focus-visible:ring-pri/30 disabled:opacity-60 dark:border-white/10 dark:bg-white/5"
          />
          {teks.length > MAKS_KARAKTER_CHAT - 100 && (
            <span className="angka-tab mt-0.5 block text-right text-[10.5px] text-teks-sekunder">
              {teks.length}/{MAKS_KARAKTER_CHAT}
            </span>
          )}
        </label>
        <button
          type="submit"
          disabled={!bolehKirim}
          aria-busy={mengirim}
          className="btn-tekan min-h-11 shrink-0 rounded-xl bg-pri px-4 text-[13px] font-extrabold text-white disabled:opacity-50"
        >
          {mengirim ? "Mengirim…" : "Kirim"}
        </button>
      </form>
    </GlassCard>
  );
}

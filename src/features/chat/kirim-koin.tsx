"use client";

// ============================================================
// Kirim koin lewat chat (28 Sep 2026) — dialog milik MASTER dan kartu
// koin yang tampil di percakapan kedua pihak.
//
// Pengaman dari sisi layar (server tetap memeriksa semuanya):
// - dua langkah: pilih jumlah → konfirmasi "Ya, kirim N koin ke X";
// - satu KUNCI per dialog: ketukan ganda atau kirim ulang setelah sinyal
//   putus tidak membayar dua kali;
// - jumlah dibatasi 1 … 100.000 per kiriman.
// ============================================================

import { useState } from "react";
import { CheckCheck, Coins, Loader2, X } from "lucide-react";
import { toast } from "@/hooks/use-app-store";
import { kirimKoinChat } from "@/services";
import {
  MAKS_CATATAN_KOIN,
  PILIHAN_KOIN,
  periksaJumlahKoin,
  teksAngkaKoin,
} from "@/lib/koin-chat";
import { cn } from "@/lib/utils";

const EMAS = "linear-gradient(135deg, #F59E0B, #D97706)";

/** Kunci anti-dobel: cocok dengan kunciKirimanSah di server. */
function buatKunci(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function namaDepan(nama: string): string {
  return nama.trim().split(/\s+/)[0] || nama;
}

export type HasilKirimKoin = { id: string; dibuat_pada: string; isi: string };

export function DialogKirimKoin({
  kontakId,
  namaPenerima,
  onTutup,
  onTerkirim,
}: {
  kontakId: string;
  namaPenerima: string;
  onTutup: () => void;
  onTerkirim: (hasil: HasilKirimKoin) => void;
}) {
  const [kunci] = useState(buatKunci);
  const [teksJumlah, setTeksJumlah] = useState("100");
  const [catatan, setCatatan] = useState("");
  const [yakin, setYakin] = useState(false);
  const [sibuk, setSibuk] = useState(false);

  const cek = periksaJumlahKoin(teksJumlah);
  const jumlah = "jumlah" in cek ? cek.jumlah : null;
  const depan = namaDepan(namaPenerima);

  async function kirim() {
    if (jumlah === null || sibuk) return;
    setSibuk(true);
    try {
      const h = await kirimKoinChat(kontakId, jumlah, catatan, kunci);
      if (h.duplikat) {
        toast("info", "Kiriman ini sudah tercatat", "Koin tidak dikirim dua kali.");
      } else {
        toast(
          "sukses",
          `${teksAngkaKoin(jumlah)} koin terkirim ke ${depan}`,
          h.saldo_penerima !== null ? `Saldo ${depan} kini ${teksAngkaKoin(h.saldo_penerima)} koin.` : "",
        );
        if (h.id) onTerkirim({ id: h.id, dibuat_pada: h.dibuat_pada, isi: h.isi });
      }
      onTutup();
    } catch (e) {
      toast("error", "Koin gagal dikirim", e instanceof Error ? e.message : "");
      setYakin(false);
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center sm:px-6" role="dialog" aria-modal="true" aria-label="Kirim koin">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => !sibuk && onTutup()} />
      <div
        className="glass-strong relative w-full max-w-[380px] rounded-t-3xl p-5 sm:rounded-3xl"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-start gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-md"
            style={{ background: EMAS }}
            aria-hidden="true"
          >
            <Coins className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-heading text-base font-bold text-teks-utama">Kirim koin</p>
            <p className="truncate text-[12px] text-teks-sekunder">ke {namaPenerima}</p>
          </div>
          <button
            type="button"
            onClick={onTutup}
            disabled={sibuk}
            aria-label="Tutup"
            className="btn-tekan -mt-1 -mr-1 flex h-9 w-9 items-center justify-center rounded-full text-teks-sekunder disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {yakin && jumlah !== null ? (
          <div className="mt-5 text-center">
            <p className="text-[12px] font-semibold text-teks-sekunder">Yakin kirim</p>
            <p className="mt-1 font-heading text-3xl font-extrabold text-amber-500">
              🪙 {teksAngkaKoin(jumlah)} <span className="text-base font-bold">koin</span>
            </p>
            <p className="mt-1 text-[13px] font-semibold text-teks-utama">ke {namaPenerima}?</p>
            {catatan.trim() && (
              <p className="mt-2 text-[12px] italic text-teks-sekunder">&ldquo;{catatan.trim()}&rdquo;</p>
            )}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setYakin(false)}
                disabled={sibuk}
                className="glass btn-tekan h-11 flex-1 rounded-xl text-sm font-semibold text-teks-utama disabled:opacity-50"
              >
                Ubah
              </button>
              <button
                type="button"
                onClick={() => void kirim()}
                disabled={sibuk}
                className="btn-tekan flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-bold text-white disabled:opacity-60"
                style={{ background: EMAS }}
              >
                {sibuk ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
                Ya, kirim
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-4 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">Jumlah</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {PILIHAN_KOIN.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setTeksJumlah(String(n))}
                  aria-pressed={jumlah === n}
                  className={cn(
                    "btn-tekan rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors",
                    jumlah === n ? "text-white" : "glass text-teks-utama",
                  )}
                  style={jumlah === n ? { background: EMAS } : undefined}
                >
                  {teksAngkaKoin(n)}
                </button>
              ))}
            </div>
            <label className="mt-3 block">
              <span className="sr-only">Jumlah koin</span>
              <input
                value={teksJumlah}
                onChange={(e) => setTeksJumlah(e.target.value.replace(/[^\d]/g, "").slice(0, 7))}
                inputMode="numeric"
                placeholder="Jumlah lain"
                className="glass h-11 w-full rounded-xl px-4 text-base font-bold text-teks-utama placeholder:font-normal placeholder:text-teks-sekunder/60 focus:outline-none"
              />
            </label>
            {"galat" in cek && teksJumlah !== "" && (
              <p className="mt-1 text-[11px] font-semibold text-gagal">{cek.galat}</p>
            )}
            <label className="mt-3 block">
              <span className="text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">Catatan (opsional)</span>
              <input
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                maxLength={MAKS_CATATAN_KOIN}
                placeholder="mis. Terima kasih atas kerja kerasnya"
                className="glass mt-1.5 h-11 w-full rounded-xl px-4 text-sm text-teks-utama placeholder:text-teks-sekunder/60 focus:outline-none"
              />
            </label>
            <p className="mt-3 text-[11px] leading-snug text-teks-sekunder">
              Koin langsung masuk ke saldo {depan} dan tampil sebagai kartu di chat ini. Saldo Anda tidak berkurang.
            </p>
            <button
              type="button"
              onClick={() => setYakin(true)}
              disabled={jumlah === null}
              className="btn-tekan mt-4 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
              style={{ background: EMAS }}
            >
              <Coins className="h-4 w-4" />
              {jumlah !== null ? `Kirim ${teksAngkaKoin(jumlah)} koin` : "Kirim koin"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Kartu kiriman koin di dalam percakapan. */
export function KartuKoin({
  jumlah,
  catatan,
  milikku,
  namaLawan,
  jam,
  dibaca,
}: {
  jumlah: number;
  catatan: string;
  milikku: boolean;
  namaLawan: string;
  jam: string;
  dibaca: boolean;
}) {
  const depan = namaDepan(namaLawan);
  return (
    <div
      role="group"
      aria-label={`Kiriman ${teksAngkaKoin(jumlah)} koin`}
      className={cn(
        "w-[230px] max-w-[80%] overflow-hidden rounded-2xl text-white shadow-md select-none",
        milikku ? "rounded-br-md" : "rounded-bl-md",
      )}
      style={{ background: EMAS }}
    >
      <div className="flex items-center gap-3 px-3.5 pt-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-xl" aria-hidden="true">
          🪙
        </span>
        <div className="min-w-0">
          <p className="font-heading text-xl leading-tight font-extrabold">
            +{teksAngkaKoin(jumlah)} <span className="text-sm font-bold">koin</span>
          </p>
          <p className="truncate text-[11px] font-semibold text-white/85">
            {milikku ? `Terkirim ke ${depan}` : `Hadiah koin dari ${depan}`}
          </p>
        </div>
      </div>
      {catatan && <p className="px-3.5 pt-2 text-[12.5px] leading-snug break-words italic">&ldquo;{catatan}&rdquo;</p>}
      <p className="flex items-center justify-end gap-1 px-3.5 pt-1 pb-2 text-[9px] text-white/75">
        {jam}
        {milikku && <CheckCheck className={cn("h-3.5 w-3.5", dibaca && "text-sky-200")} aria-label={dibaca ? "Sudah dibaca" : "Terkirim"} />}
      </p>
    </div>
  );
}

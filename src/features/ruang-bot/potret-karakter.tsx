"use client";

// ============================================================
// POTRET KARAKTER (16 Okt 2026) — wajah pixel art tiap akun di panel Online &
// chat global, dirakit dari rupa Karakter Saya (rakitPotret, karakter-sprite).
//
// Rupa tiap akun disimpan di satu peta bersama halaman:
//   • diisi dari status dunia (PenghuniDunia.rupa) — yang online tak perlu diminta;
//   • akun lain (pengirim chat yang tidak online) diminta berkelompok ke
//     GET /api/ruang/karakter?ids=… (maks 60 per permintaan, sekali per akun);
//   • akun sendiri mengikuti rupa yang baru disimpan (rupa-saya.ts).
// Akun tanpa rupa tersimpan memakai rupa bawaan stabil (konfigBawaan).
// ============================================================

import { useEffect, useState, useSyncExternalStore } from "react";
import { MAKS_ID_RUPA, bacaKonfig, konfigBawaan, type KonfigKarakter } from "@/lib/karakter-murni";
import { cn } from "@/lib/utils";
import { getRupaBanyak } from "@/services";
import { rakitPotret } from "./karakter-sprite";
import { useRupaSaya } from "./rupa-saya";

// ---------- peta rupa bersama ----------

/** id -> rupa tersimpan, atau null = pasti tanpa rupa (pakai bawaan). Tidak ada = belum diketahui. */
const rupa = new Map<number, KonfigKarakter | null>();
const diminta = new Set<number>();
const antre = new Set<number>();
const pendengar = new Set<() => void>();
let versi = 0;
let jadwal: ReturnType<typeof setTimeout> | null = null;

function kabari() {
  versi += 1;
  for (const f of pendengar) f();
}

/** Isi dari status dunia: yang tercantum pasti diketahui (rupa ada / tidak ada). */
export function isiRupaDariDaftar(daftar: readonly { id: number; rupa?: KonfigKarakter | null }[]): void {
  let berubah = false;
  for (const p of daftar) {
    const baru = p.rupa ? bacaKonfig(p.rupa) : null;
    const lama = rupa.get(p.id);
    if (lama === undefined || JSON.stringify(lama) !== JSON.stringify(baru)) {
      rupa.set(p.id, baru);
      berubah = true;
    }
  }
  if (berubah) kabari();
}

function minta(id: number) {
  if (rupa.has(id) || diminta.has(id)) return;
  diminta.add(id);
  antre.add(id);
  if (jadwal) return;
  jadwal = setTimeout(async () => {
    jadwal = null;
    const ids = [...antre];
    antre.clear();
    for (let i = 0; i < ids.length; i += MAKS_ID_RUPA) {
      const kelompok = ids.slice(i, i + MAKS_ID_RUPA);
      try {
        const hasil = await getRupaBanyak(kelompok);
        for (const id of kelompok) rupa.set(id, bacaKonfig(hasil[String(id)]));
      } catch {
        // gagal: tetap rupa bawaan; boleh diminta lagi di kunjungan berikutnya
        for (const id of kelompok) diminta.delete(id);
      }
    }
    kabari();
  }, 60);
}

function langgan(f: () => void) {
  pendengar.add(f);
  return () => {
    pendengar.delete(f);
  };
}

/** Rupa yang dipakai untuk akun ini (tersimpan, atau bawaan bila tidak ada / belum diketahui). */
export function useRupaAkun(id: number, sayaId?: number): { konfig: KonfigKarakter; pasti: boolean } {
  useSyncExternalStore(langgan, () => versi, () => 0);
  const rupaSaya = useRupaSaya();
  useEffect(() => {
    minta(id);
  }, [id]);
  if (sayaId !== undefined && id === sayaId && rupaSaya) return { konfig: rupaSaya, pasti: true };
  const ada = rupa.get(id);
  return { konfig: ada ?? konfigBawaan(id), pasti: ada !== undefined };
}

// ---------- gambar potret ----------

const kunciKonfig = (k: KonfigKarakter) => `${k.kulit}|${k.rambut}|${k.warnaRambut}|${k.atasan}|${k.warnaAtasan}|${k.warnaCelana}|${k.warnaSepatu}`;
const cachePotret = new Map<string, Promise<string>>();

function urlPotret(k: KonfigKarakter): Promise<string> {
  const kunci = kunciKonfig(k);
  let janji = cachePotret.get(kunci);
  if (!janji) {
    janji = rakitPotret(k, 2).then((c) => c.toDataURL("image/png"));
    janji.catch(() => cachePotret.delete(kunci));
    if (cachePotret.size > 400) cachePotret.delete(cachePotret.keys().next().value!);
    cachePotret.set(kunci, janji);
  }
  return janji;
}

type Props = {
  userId: number;
  /** Akun sendiri: rupa yang baru disimpan langsung terlihat. */
  sayaId?: number;
  ukuran?: number;
  className?: string;
};

/** Potret bulat (wajah + rambut) karakter akun ini. Dekoratif: nama selalu ditulis di sebelahnya. */
export function PotretKarakter({ userId, sayaId, ukuran = 28, className }: Props) {
  const { konfig, pasti } = useRupaAkun(userId, sayaId);
  const kunci = kunciKonfig(konfig);
  const [gambar, setGambar] = useState<{ kunci: string; url: string } | null>(null);

  useEffect(() => {
    // Tunggu rupa pasti (sebentar) supaya tidak berkedip dari bawaan ke rupa tersimpan.
    if (!pasti) return;
    let hidup = true;
    urlPotret(konfig)
      .then((url) => {
        if (hidup) setGambar({ kunci, url });
      })
      .catch(() => undefined);
    return () => {
      hidup = false;
    };
    // konfig diwakili kunci
  }, [kunci, pasti]);

  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e8dcc8] ring-1 ring-black/10 dark:bg-[#3a3346] dark:ring-white/15", className)}
      style={{ width: ukuran, height: ukuran }}
    >
      {gambar && gambar.kunci === kunci ? (
        <img src={gambar.url} alt="" width={ukuran} height={ukuran} className="h-full w-full" style={{ imageRendering: "pixelated" }} />
      ) : (
        <span className="h-1/2 w-1/2 animate-pulse rounded-full bg-black/10 dark:bg-white/10" />
      )}
    </span>
  );
}

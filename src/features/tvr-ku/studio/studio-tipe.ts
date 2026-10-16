"use client";

// ============================================================
// STUDIO TEMPLATE — tipe jawaban layanan & pemuat gambar aset (16 Okt 2026).
// Gambar aset butuh token, jadi diambil sebagai blob lalu jadi URL objek.
// ============================================================

import { useEffect, useRef, useState } from "react";
import type { DokStudio } from "@/mesin-video/studio-model";

export type AsetStudio = {
  ref: string;
  jenis: "gambar" | "gif" | "video";
  nama: string;
  size: number;
  w: number;
  h: number;
  durasi?: number;
  alpha?: boolean;
};

export type RingkasPratinjau = {
  id: string;
  status: "queued" | "downloading" | "rendering" | "done" | "error" | "dibatalkan";
  progress: number;
  error: string | null;
  log: string | null;
  durasi: number | null;
  dibuat: number | null;
  sumber: string | null;
  antrean: number | null;
};

export type DataStudio = {
  dok: DokStudio;
  studio_tersimpan: boolean;
  siap: boolean;
  aset: AsetStudio[];
  pratinjau: RingkasPratinjau | null;
  batas: {
    maks_aset_mb: number;
    maks_gif_mb: number;
    maks_animasi_detik: number;
    maks_elemen: number;
    maks_pernak: number;
    jenis_aset: Record<"gambar" | "boom" | "outro", string[]>;
  };
};

export const PRATINJAU_AKTIF = ["queued", "downloading", "rendering"];

type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;

/** URL objek gambar tiap aset (dimuat sekali, dilepas saat Studio ditutup). */
export function useGambarAset(fetchApi: ApiFetch, refs: readonly string[]): Record<string, string> {
  const [peta, setPeta] = useState<Record<string, string>>({});
  const dimuat = useRef(new Set<string>());
  const semua = useRef<string[]>([]);
  const kunci = [...new Set(refs)].sort().join("|");

  const hidup = useRef(true);

  useEffect(() => {
    for (const ref of kunci ? kunci.split("|") : []) {
      if (dimuat.current.has(ref)) continue;
      dimuat.current.add(ref);
      void (async () => {
        try {
          const res = await fetchApi(`/api/tvr/studio/aset/gambar?ref=${encodeURIComponent(ref)}`, { cache: "no-store" });
          if (!res.ok) throw new Error(String(res.status));
          const url = URL.createObjectURL(await res.blob());
          if (!hidup.current) {
            URL.revokeObjectURL(url);
            return;
          }
          semua.current.push(url);
          setPeta((p) => ({ ...p, [ref]: url }));
        } catch {
          dimuat.current.delete(ref);
        }
      })();
    }
  }, [kunci, fetchApi]);

  useEffect(() => {
    hidup.current = true;
    const daftar = semua.current;
    return () => {
      hidup.current = false;
      for (const u of daftar) URL.revokeObjectURL(u);
    };
  }, []);

  return peta;
}

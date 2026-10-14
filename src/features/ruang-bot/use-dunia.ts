"use client";

// ============================================================
// useDunia (14 Okt 2026) — daftar pengguna online + aksi mereka untuk Ruang Bot (master).
//
// Memuat GET /api/bot/dunia saat dibuka, lalu menyegarkan: siaran Realtime topik "dunia-ruang"
// (muat ulang 400 ms setelah pesan) + polling 8 dtk saat tab terlihat (presence berubah di
// detak, bukan di siaran). Hasil lama yang tiba terlambat dibuang (nomor permintaan).
// Galat sesaat tidak mengosongkan dunia: data terakhir dipertahankan.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { EVENT_DUNIA, TOPIK_DUNIA, type StatusDunia } from "@/lib/dunia-murni";
import { kanalLangsung } from "@/lib/realtime-klien";
import { getDunia } from "@/services";

const POLLING_MS = 8000;

export type DuniaKlien = {
  status: StatusDunia | null;
  /** Pesan galat muatan terakhir ("" bila sehat). */
  galat: string;
  muatUlang: () => Promise<void>;
};

export function useDunia(): DuniaKlien {
  const [status, setStatus] = useState<StatusDunia | null>(null);
  const [galat, setGalat] = useState("");
  const nomorRef = useRef(0);
  const hidupRef = useRef(true);

  useEffect(() => {
    hidupRef.current = true;
    return () => {
      hidupRef.current = false;
    };
  }, []);

  const muat = useCallback(async () => {
    const nomor = ++nomorRef.current;
    try {
      const d = await getDunia();
      if (!hidupRef.current || nomor !== nomorRef.current) return;
      setStatus(d);
      setGalat("");
    } catch (e) {
      if (!hidupRef.current || nomor !== nomorRef.current) return;
      setGalat(e instanceof Error && e.message ? e.message : "Gagal memuat pengguna online");
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(muat);
  }, [muat]);

  useEffect(() => {
    let batal = false;
    let stop: (() => void) | null = null;
    let jeda: ReturnType<typeof setTimeout> | null = null;
    kanalLangsung(TOPIK_DUNIA, {
      event: EVENT_DUNIA,
      onPesan: () => {
        if (jeda) clearTimeout(jeda);
        jeda = setTimeout(() => void muat(), 400);
      },
      onStatus: () => undefined,
    })
      .then((f) => {
        if (batal) f();
        else stop = f;
      })
      .catch(() => undefined);
    return () => {
      batal = true;
      if (jeda) clearTimeout(jeda);
      stop?.();
    };
  }, [muat]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void muat();
    }, POLLING_MS);
    return () => window.clearInterval(id);
  }, [muat]);

  return { status, galat, muatUlang: muat };
}

"use client";

// ============================================================
// useChatGlobal (14 Okt 2026) — chat global Ruang Bot untuk semua anggota yang login.
//
// Memuat GET /api/ruang/chat saat dibuka, lalu menyegarkan lewat siaran Realtime topik "ruang-chat"
// (muat ulang 300 ms setelah pesan) + polling 10 dtk saat tab terlihat (cadangan bila Realtime putus).
// Pesan yang BARU tiba setelah muatan pertama dilaporkan ke `onPesanBaru` (gelembung di atas karakter).
// Hasil lama yang tiba terlambat dibuang (nomor permintaan). Galat sesaat tidak mengosongkan riwayat.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { EVENT_CHAT_GLOBAL, TOPIK_CHAT_GLOBAL, type AksiChatGlobal, type PesanGlobal, type StatusChatGlobal } from "@/lib/chat-global-murni";
import { kanalLangsung } from "@/lib/realtime-klien";
import { getChatGlobal, kirimAksiChatGlobal } from "@/services";

const POLLING_MS = 10_000;

export type ChatGlobalKlien = {
  status: StatusChatGlobal | null;
  galat: string;
  /** Kirim atau moderasi. Mengembalikan pesan galat ("" bila berhasil). */
  aksi: (a: AksiChatGlobal) => Promise<string>;
  muatUlang: () => Promise<void>;
};

const pesanGalat = (e: unknown, cadangan: string) => (e instanceof Error && e.message ? e.message : cadangan);

export function useChatGlobal(onPesanBaru?: (baru: PesanGlobal[]) => void): ChatGlobalKlien {
  const [status, setStatus] = useState<StatusChatGlobal | null>(null);
  const [galat, setGalat] = useState("");
  const nomorRef = useRef(0);
  const hidupRef = useRef(true);
  /** id pesan terbesar yang sudah dilihat; null = muatan pertama belum tiba. */
  const terakhirRef = useRef<number | null>(null);
  const onBaruRef = useRef(onPesanBaru);

  useEffect(() => {
    onBaruRef.current = onPesanBaru;
  }, [onPesanBaru]);

  useEffect(() => {
    hidupRef.current = true;
    return () => {
      hidupRef.current = false;
    };
  }, []);

  const muat = useCallback(async () => {
    const nomor = ++nomorRef.current;
    try {
      const d = await getChatGlobal();
      if (!hidupRef.current || nomor !== nomorRef.current) return;
      const maks = d.pesan.reduce((m, p) => Math.max(m, p.id), 0);
      const batas = terakhirRef.current;
      if (batas !== null) {
        const baru = d.pesan.filter((p) => p.id > batas);
        if (baru.length > 0) onBaruRef.current?.(baru);
      }
      terakhirRef.current = Math.max(batas ?? 0, maks);
      setStatus(d);
      setGalat("");
    } catch (e) {
      if (!hidupRef.current || nomor !== nomorRef.current) return;
      setGalat(pesanGalat(e, "Chat gagal dimuat"));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(muat);
  }, [muat]);

  useEffect(() => {
    let batal = false;
    let stop: (() => void) | null = null;
    let jeda: ReturnType<typeof setTimeout> | null = null;
    kanalLangsung(TOPIK_CHAT_GLOBAL, {
      event: EVENT_CHAT_GLOBAL,
      onPesan: () => {
        if (jeda) clearTimeout(jeda);
        jeda = setTimeout(() => void muat(), 300);
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

  const aksi = useCallback(
    async (a: AksiChatGlobal) => {
      try {
        await kirimAksiChatGlobal(a);
        await muat();
        return "";
      } catch (e) {
        return pesanGalat(e, "Gagal. Coba lagi.");
      }
    },
    [muat],
  );

  return { status, galat, aksi, muatUlang: muat };
}

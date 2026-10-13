"use client";

// ============================================================
// useStatusBot (13 Okt 2026) — sambungan layar Ruang Bot ke server.
//
// • Memuat GET /api/bot/status (getStatusBot) saat dibuka, lalu menyegarkan:
//   useSegarOtomatis (60 dtk, hanya saat tab terlihat) + siaran Realtime
//   topik "bot-ruang" (muat ulang 900 ms setelah pesan) + polling cadangan
//   (20 dtk saat Realtime putus, 90 dtk saat tersambung). Pola sama dengan
//   tv-rakyat/tim-langsung.tsx.
// • Kendali (POST /api/bot/kendali) memakai PEMBARUAN OPTIMIS: status lokal
//   langsung berubah, lalu dikembalikan (rollback) bila server menolak.
// • Anti-balapan: tiap permintaan bernomor; hasil lama atau hasil yang tiba
//   saat ada aksi kendali berjalan DIBUANG supaya tidak menimpa perubahan
//   optimis. Selesai aksi → status dimuat ulang dari server.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/hooks/use-app-store";
import { useSegarOtomatis } from "@/hooks/use-segar-otomatis";
import type { AksiKendaliBot, StatusBot } from "@/lib/bot-tipe";
import { kanalLangsung } from "@/lib/realtime-klien";
import { getStatusBot, kirimKendaliBot } from "@/services";
import { aksiBalik, galatDilarang, kunciAksi, labelSukses, terapkanAksi } from "./peta-nyata";

/** Topik & event siaran Realtime — harus sama dengan string yang dipakai server. */
export const TOPIK_BOT = "bot-ruang";
export const EVENT_BOT = "berubah";

export type SambunganLangsung = "menyambung" | "tersambung" | "gagal";

export type StatusBotKlien = {
  /** Status terakhir dari server (null = belum pernah berhasil dimuat). */
  data: StatusBot | null;
  /** true selama muatan pertama belum selesai (dan belum gagal). */
  memuat: boolean;
  /** Pesan galat muatan terakhir ("" bila sehat). */
  galat: string;
  /** true bila server menolak karena akun bukan master. */
  dilarang: boolean;
  /** Kunci kontrol yang sedang memproses aksi (lihat kunciAksi). */
  sibuk: ReadonlySet<string>;
  langsung: SambunganLangsung;
  muatUlang: () => Promise<void>;
  /**
   * Terapkan satu/beberapa aksi (satu kontrol) dengan pembaruan optimis.
   * Mengembalikan true bila SEMUA sukses.
   */
  kendali: (aksi: AksiKendaliBot[]) => Promise<boolean>;
};

const KOSONG: ReadonlySet<string> = new Set();

export function useStatusBot(): StatusBotKlien {
  const [data, setData] = useState<StatusBot | null>(null);
  const [galat, setGalat] = useState("");
  const [dilarang, setDilarang] = useState(false);
  const [sibuk, setSibuk] = useState<ReadonlySet<string>>(KOSONG);
  const [langsung, setLangsung] = useState<SambunganLangsung>("menyambung");

  const dataRef = useRef<StatusBot | null>(null);
  const hidupRef = useRef(true);
  /** Nomor permintaan terbaru; naik tiap muat baru DAN tiap aksi kendali dimulai. */
  const nomorRef = useRef(0);
  const aksiRef = useRef(0);
  const sibukRef = useRef<Set<string>>(new Set());
  /** Muatan yang sedang terbang (digabung bila nomornya masih yang terbaru). */
  const terbangRef = useRef<{ nomor: number; janji: Promise<void> } | null>(null);
  /** Pesan galat yang sudah ditoastkan, supaya polling gagal tidak membanjiri toast. */
  const galatToastRef = useRef("");

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    hidupRef.current = true;
    return () => {
      hidupRef.current = false;
    };
  }, []);

  const muat = useCallback((): Promise<void> => {
    // Ada aksi kendali berjalan: hasil muatan akan dibuang, jadi jangan menarik.
    // (Setelah aksi terakhir selesai, kendali() memuat ulang sendiri.)
    if (aksiRef.current > 0) return Promise.resolve();
    const terbang = terbangRef.current;
    if (terbang && terbang.nomor === nomorRef.current) return terbang.janji;

    const nomor = ++nomorRef.current;
    const janji = (async () => {
      try {
        const s = await getStatusBot();
        // Dibuang bila sudah ada permintaan/aksi yang lebih baru atau layar ditutup.
        if (!hidupRef.current || nomor !== nomorRef.current || aksiRef.current > 0) return;
        setData(s);
        setGalat("");
        setDilarang(false);
        galatToastRef.current = "";
      } catch (e) {
        if (!hidupRef.current || nomor !== nomorRef.current || aksiRef.current > 0) return;
        const pesan = e instanceof Error && e.message ? e.message : "Gagal memuat status bot";
        if (galatDilarang(pesan)) {
          setDilarang(true);
          return;
        }
        setGalat(pesan);
        // Data terakhir dipertahankan; toast hanya sekali per jenis galat.
        if (galatToastRef.current !== pesan) {
          galatToastRef.current = pesan;
          toast("error", "Ruang Bot gagal dimuat", pesan);
        }
      } finally {
        if (terbangRef.current?.nomor === nomor) terbangRef.current = null;
      }
    })();
    terbangRef.current = { nomor, janji };
    return janji;
  }, []);

  // Muatan awal.
  useEffect(() => {
    void Promise.resolve().then(muat);
  }, [muat]);

  // Segar otomatis 60 dtk (hanya saat tab terlihat) + tombol refresh sistem.
  useSegarOtomatis(() => void muat(), 60);

  // Kanal Realtime: siaran "berubah" dari server → muat ulang setelah 900 ms.
  useEffect(() => {
    let batal = false;
    let stop: (() => void) | null = null;
    let jedaMuat: ReturnType<typeof setTimeout> | null = null;
    kanalLangsung(TOPIK_BOT, {
      event: EVENT_BOT,
      onPesan: () => {
        if (jedaMuat) clearTimeout(jedaMuat);
        jedaMuat = setTimeout(() => void muat(), 900);
      },
      onStatus: (s) => {
        if (!batal) setLangsung(s);
      },
    })
      .then((f) => {
        if (batal) f();
        else stop = f;
      })
      .catch(() => {
        if (!batal) setLangsung("gagal");
      });
    return () => {
      batal = true;
      if (jedaMuat) clearTimeout(jedaMuat);
      stop?.();
    };
  }, [muat]);

  // Polling cadangan: 20 dtk saat Realtime putus, 90 dtk saat tersambung.
  useEffect(() => {
    const id = window.setInterval(
      () => {
        if (document.visibilityState === "visible") void muat();
      },
      langsung === "tersambung" ? 90_000 : 20_000,
    );
    return () => window.clearInterval(id);
  }, [langsung, muat]);

  const kendali = useCallback(
    async (aksi: AksiKendaliBot[]): Promise<boolean> => {
      const awal = dataRef.current;
      if (!awal || aksi.length === 0) return false;
      const kunci = kunciAksi(aksi[0]);
      if (sibukRef.current.has(kunci)) return false; // cegah klik ganda

      // Rencana: tiap aksi dipasangkan dengan aksi pembalik (nilai lama).
      const rencana: { aksi: AksiKendaliBot; balik: AksiKendaliBot }[] = [];
      for (const a of aksi) {
        const balik = aksiBalik(awal, a);
        if (balik) rencana.push({ aksi: a, balik });
      }
      if (rencana.length === 0) return false;

      // Mulai: tandai sibuk, batalkan muatan yang sedang terbang, ubah optimis.
      aksiRef.current += 1;
      nomorRef.current += 1;
      sibukRef.current = new Set(sibukRef.current).add(kunci);
      setSibuk(sibukRef.current);
      setData((prev) => (prev ? rencana.reduce((s, r) => terapkanAksi(s, r.aksi), prev) : prev));

      let semuaSukses = false;
      try {
        const hasil = await Promise.allSettled(rencana.map((r) => kirimKendaliBot(r.aksi)));
        const gagal = rencana.filter((_, i) => hasil[i].status === "rejected");
        semuaSukses = gagal.length === 0;

        if (gagal.length > 0 && hidupRef.current) {
          // Rollback hanya aksi yang ditolak server.
          setData((prev) => (prev ? gagal.reduce((s, r) => terapkanAksi(s, r.balik), prev) : prev));
        }
        if (semuaSukses) {
          toast("sukses", labelSukses(awal, rencana[0].aksi));
        } else {
          const pertama = hasil.find((h): h is PromiseRejectedResult => h.status === "rejected");
          const alasan = pertama?.reason instanceof Error ? pertama.reason.message : "";
          toast("error", "Perubahan dibatalkan", alasan || "Server menolak perubahan bot.");
        }
      } finally {
        aksiRef.current -= 1;
        const baru = new Set(sibukRef.current);
        baru.delete(kunci);
        sibukRef.current = baru;
        if (hidupRef.current) setSibuk(baru);
        // Aksi terakhir selesai → samakan dengan server (juga bila ada yang gagal).
        if (aksiRef.current === 0) void muat();
      }
      return semuaSukses;
    },
    [muat],
  );

  return {
    data,
    memuat: data === null && galat === "" && !dilarang,
    galat,
    dilarang,
    sibuk,
    langsung,
    muatUlang: muat,
    kendali,
  };
}

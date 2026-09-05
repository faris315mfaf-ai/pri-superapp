"use client";

// ============================================================
// lobi-realtime.ts — pembungkus Supabase Realtime untuk LOBI ROBOT (5 Sep 2026).
//
// Satu kanal broadcast+presence per lobi:
//   • presence  : siapa yang hadir + RUPA robot + posisi terakhir saat diam
//                 (pendatang baru langsung melihat semua orang di tempatnya).
//   • "gerak"   : {id,x,y,vx,vy,arah,t} dikirim maks 5×/detik HANYA saat
//                 bergerak (+1 pesan saat berhenti). Penerima memprediksi
//                 posisi dari kecepatan (dead reckoning) → terasa realtime
//                 meski pesan jarang.
//   • "pesan"   : gelembung teks singkat.
//   • "ping"    : diterima kembali oleh pengirim (self: true) → latensi bolak-balik.
// supabase-js dimuat DINAMIS hanya di halaman lobi (bundel utama tetap ringan).
// Tanpa kunci / gagal tersambung → pemanggil beralih ke polling database.
// ============================================================

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export type MetaRobot = {
  id: string;
  nama_pemilik: string;
  nama_robot: string;
  jenis: "pria" | "wanita";
  level: number;
  skin: string | null;
  warna: string | null;
  terpasang: Record<string, string>;
  sparepart: Record<string, string>;
  tradable: { kode: string; jenis: "aksesoris" | "sparepart" | "skin"; nama: string }[];
  x: number;
  y: number;
  arah: "kiri" | "kanan";
  pesan: string;
};

export type PaketGerak = { id: string; x: number; y: number; vx: number; vy: number; arah: "kiri" | "kanan"; t: number };

export type StatusKanal = "menyambung" | "tersambung" | "gagal" | "tutup";

export type SambunganLobi = {
  kirimGerak: (p: Omit<PaketGerak, "id" | "t">) => void;
  kirimPesan: (teks: string) => void;
  perbaruiMeta: (sebagian: Partial<MetaRobot>) => Promise<void>;
  tutup: () => Promise<void>;
};

export async function hubungkanLobi(o: {
  url: string;
  key: string;
  kanal: string;
  meta: MetaRobot;
  onStatus: (s: StatusKanal) => void;
  onHadir: (peers: Record<string, MetaRobot>) => void;
  onGerak: (p: PaketGerak) => void;
  onPesan: (id: string, teks: string) => void;
  onLatensi: (ms: number) => void;
}): Promise<SambunganLobi> {
  const { createClient } = await import("@supabase/supabase-js");
  const klien: SupabaseClient = createClient(o.url, o.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  let meta: MetaRobot = { ...o.meta };
  const saya = meta.id;
  let timerPing: ReturnType<typeof setInterval> | null = null;

  const ch: RealtimeChannel = klien.channel(o.kanal, {
    config: { broadcast: { self: true, ack: false }, presence: { key: saya } },
  });

  const sinkron = () => {
    const state = ch.presenceState<MetaRobot>();
    const peers: Record<string, MetaRobot> = {};
    for (const [kunci, daftar] of Object.entries(state)) {
      if (kunci === saya) continue;
      const m = daftar[daftar.length - 1];
      if (m && typeof m.id === "string") peers[kunci] = m;
    }
    o.onHadir(peers);
  };

  ch.on("presence", { event: "sync" }, sinkron);
  ch.on("broadcast", { event: "gerak" }, ({ payload }) => {
    const p = payload as PaketGerak;
    if (!p || p.id === saya) return;
    o.onGerak(p);
  });
  ch.on("broadcast", { event: "pesan" }, ({ payload }) => {
    const p = payload as { id: string; teks: string };
    if (!p || p.id === saya) return;
    o.onPesan(p.id, String(p.teks ?? "").slice(0, 60));
  });
  ch.on("broadcast", { event: "ping" }, ({ payload }) => {
    const p = payload as { id: string; t: number };
    if (p?.id === saya && typeof p.t === "number") o.onLatensi(Math.max(0, Date.now() - p.t));
  });

  o.onStatus("menyambung");
  await new Promise<void>((selesai) => {
    let sudah = false;
    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track(meta);
        o.onStatus("tersambung");
        if (!sudah) {
          sudah = true;
          selesai();
        }
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        o.onStatus("gagal");
        if (!sudah) {
          sudah = true;
          selesai();
        }
      } else if (status === "CLOSED") {
        o.onStatus("tutup");
      }
    });
    // Jangan menggantung selamanya bila server tidak menjawab.
    setTimeout(() => {
      if (!sudah) {
        sudah = true;
        o.onStatus("gagal");
        selesai();
      }
    }, 8000);
  });

  timerPing = setInterval(() => {
    void ch.send({ type: "broadcast", event: "ping", payload: { id: saya, t: Date.now() } });
  }, 5000);
  void ch.send({ type: "broadcast", event: "ping", payload: { id: saya, t: Date.now() } });

  return {
    kirimGerak: (p) => {
      void ch.send({ type: "broadcast", event: "gerak", payload: { ...p, id: saya, t: Date.now() } });
    },
    kirimPesan: (teks) => {
      void ch.send({ type: "broadcast", event: "pesan", payload: { id: saya, teks: teks.slice(0, 60) } });
    },
    perbaruiMeta: async (sebagian) => {
      meta = { ...meta, ...sebagian };
      await ch.track(meta);
    },
    tutup: async () => {
      if (timerPing) clearInterval(timerPing);
      try {
        await ch.untrack();
      } catch {
        // sudah terputus
      }
      await klien.removeChannel(ch);
    },
  };
}

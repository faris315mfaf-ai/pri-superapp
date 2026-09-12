// ============================================================
// Sambungan realtime LOBI ROBOT — Supabase Realtime (presence + broadcast).
//
// DITULIS ULANG 12 Sep 2026 supaya TIDAK PERNAH MENYERAH.
//
// Versi lama menyambung SEKALI. Begitu kanal putus — ponsel tidur,
// pindah dari Wi-Fi ke seluler, server realtime dimulai ulang — statusnya
// jadi "gagal", pemanggil beralih ke polling database, dan tidak ada
// yang pernah mencoba kembali. Yang dilihat pemain: lencana "Realtime"
// berubah jadi "Polling 2 dtk" dan robot lain tersendat selamanya.
//
// Sekarang sambungan diawasi terus-menerus:
//   • Putus dengan alasan apa pun → sambung ulang sendiri, jeda bertahap
//     1 → 2 → 4 → 8 → 15 detik (lalu tetap 15 detik), tanpa batas.
//   • Layar kembali aktif / jaringan kembali "online" → coba SEKETIKA,
//     tidak menunggu jeda.
//   • Pengawas gema ping: kalau ping sendiri tidak menggema > 20 detik
//     padahal status "tersambung", sambungannya dianggap zombie (soket
//     terbuka tapi mati) dan dipasang ulang.
//
// Status "gagal" kini bersifat SEMENTARA — pemanggil boleh memakai
// polling selama itu, tapi harus kembali ke realtime begitu status
// "tersambung" datang lagi.
//
// Tanpa kunci / tidak pernah tersambung → pemanggil tetap bisa polling.
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

/** Jeda sambung-ulang ke-n (detik): 1, 2, 4, 8, lalu tetap 15. */
export function jedaSambungUlangMs(percobaan: number): number {
  const dasar = Math.min(15_000, 1000 * 2 ** Math.min(Math.max(0, percobaan), 4));
  return Math.min(15_000, dasar);
}

/** Batas diam gema ping sebelum sambungan dianggap zombie. */
export const BATAS_GEMA_MS = 20_000;
const PING_MS = 5_000;
const TUNGGU_AWAL_MS = 8_000;

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

  let ch: RealtimeChannel | null = null;
  let ditutup = false;
  let tersambung = false;
  let percobaan = 0;
  let gemaTerakhir = Date.now();
  let timerUlang: ReturnType<typeof setTimeout> | null = null;
  let timerPing: ReturnType<typeof setInterval> | null = null;
  let statusTerakhir: StatusKanal | null = null;

  const lapor = (s: StatusKanal) => {
    // Status yang sama tidak diulang — pemanggil menyetel state React
    // di sini, dan render ulang tanpa perubahan hanya membuang tenaga.
    if (s === statusTerakhir) return;
    statusTerakhir = s;
    o.onStatus(s);
  };

  const sinkron = (kanal: RealtimeChannel) => {
    const state = kanal.presenceState<MetaRobot>();
    const peers: Record<string, MetaRobot> = {};
    for (const [kunci, daftar] of Object.entries(state)) {
      if (kunci === saya) continue;
      const m = daftar[daftar.length - 1];
      if (m && typeof m.id === "string") peers[kunci] = m;
    }
    o.onHadir(peers);
  };

  const buangKanal = (kanal: RealtimeChannel | null) => {
    if (!kanal) return;
    void klien.removeChannel(kanal).catch(() => {
      // sudah lepas sendiri — tidak apa-apa
    });
  };

  const jadwalkanUlang = () => {
    if (ditutup || timerUlang) return;
    const jeda = jedaSambungUlangMs(percobaan) + Math.floor(Math.random() * 400);
    percobaan += 1;
    timerUlang = setTimeout(() => {
      timerUlang = null;
      if (!ditutup) pasangKanal();
    }, jeda);
  };

  /** Coba sekarang juga, tanpa menunggu jeda (layar aktif / online). */
  const sambungSekarang = () => {
    if (ditutup || tersambung) return;
    if (timerUlang) {
      clearTimeout(timerUlang);
      timerUlang = null;
    }
    percobaan = 0;
    pasangKanal();
  };

  const pasangKanal = () => {
    if (ditutup) return;
    const lama = ch;
    ch = null;
    tersambung = false;
    buangKanal(lama);
    lapor("menyambung");

    const baru = klien.channel(o.kanal, {
      config: { broadcast: { self: true, ack: false }, presence: { key: saya } },
    });
    ch = baru;

    baru.on("presence", { event: "sync" }, () => {
      if (baru === ch) sinkron(baru);
    });
    baru.on("broadcast", { event: "gerak" }, ({ payload }) => {
      const p = payload as PaketGerak;
      if (!p || p.id === saya) return;
      o.onGerak(p);
    });
    baru.on("broadcast", { event: "pesan" }, ({ payload }) => {
      const p = payload as { id: string; teks: string };
      if (!p || p.id === saya) return;
      o.onPesan(p.id, String(p.teks ?? "").slice(0, 60));
    });
    baru.on("broadcast", { event: "ping" }, ({ payload }) => {
      const p = payload as { id: string; t: number };
      if (p?.id === saya && typeof p.t === "number") {
        gemaTerakhir = Date.now();
        o.onLatensi(Math.max(0, Date.now() - p.t));
      }
    });

    baru.subscribe(async (status) => {
      // Kanal usang (sudah diganti yang lebih baru) tidak boleh mengubah
      // apa pun — inilah yang membuat sambung-ulang tidak saling tumpang.
      if (baru !== ch || ditutup) return;
      if (status === "SUBSCRIBED") {
        percobaan = 0;
        tersambung = true;
        gemaTerakhir = Date.now();
        try {
          await baru.track(meta);
        } catch {
          // presence gagal ditulis: bukan alasan menganggap putus
        }
        lapor("tersambung");
        void baru.send({ type: "broadcast", event: "ping", payload: { id: saya, t: Date.now() } });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        tersambung = false;
        lapor("gagal");
        jadwalkanUlang();
      }
    });
  };

  // --- Pemicu sambung-ulang seketika ---------------------------------
  const saatTerlihat = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") sambungSekarang();
  };
  const saatOnline = () => sambungSekarang();
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", saatTerlihat);
  if (typeof window !== "undefined") window.addEventListener("online", saatOnline);

  // --- Ping berkala + pengawas zombie ---------------------------------
  timerPing = setInterval(() => {
    if (ditutup || !ch || !tersambung) return;
    void ch.send({ type: "broadcast", event: "ping", payload: { id: saya, t: Date.now() } });
    if (Date.now() - gemaTerakhir > BATAS_GEMA_MS) {
      // Soket mengaku hidup tapi tidak ada satu pun gema — pasang ulang.
      tersambung = false;
      lapor("gagal");
      pasangKanal();
    }
  }, PING_MS);

  // --- Sambungan pertama: tunggu hasil awal, tapi jangan menggantung ---
  pasangKanal();
  await new Promise<void>((selesai) => {
    const mulai = Date.now();
    const cek = setInterval(() => {
      if (tersambung || statusTerakhir === "gagal" || Date.now() - mulai > TUNGGU_AWAL_MS) {
        clearInterval(cek);
        if (!tersambung && statusTerakhir !== "gagal") lapor("gagal"); // biar pemanggil mulai polling
        selesai();
      }
    }, 100);
  });

  return {
    kirimGerak: (p) => {
      if (!ch || !tersambung) return;
      void ch.send({ type: "broadcast", event: "gerak", payload: { ...p, id: saya, t: Date.now() } });
    },
    kirimPesan: (teks) => {
      if (!ch || !tersambung) return;
      void ch.send({ type: "broadcast", event: "pesan", payload: { id: saya, teks: teks.slice(0, 60) } });
    },
    perbaruiMeta: async (sebagian) => {
      meta = { ...meta, ...sebagian };
      if (!ch || !tersambung) return; // dikirim ulang otomatis saat tersambung (track di SUBSCRIBED)
      try {
        await ch.track(meta);
      } catch {
        // akan dikirim lagi setelah sambung ulang
      }
    },
    tutup: async () => {
      ditutup = true;
      if (timerUlang) clearTimeout(timerUlang);
      if (timerPing) clearInterval(timerPing);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", saatTerlihat);
      if (typeof window !== "undefined") window.removeEventListener("online", saatOnline);
      const kanal = ch;
      ch = null;
      if (kanal) {
        try {
          await kanal.untrack();
        } catch {
          // sudah terputus
        }
        await klien.removeChannel(kanal).catch(() => {});
      }
      lapor("tutup");
    },
  };
}

"use client";

// ============================================================
// Pendengar Supabase Realtime di PERAMBAN (5 Sep 2026) — untuk siaran
// "ada yang berubah" dari server (lib/realtime-server). Satu klien
// supabase-js dibuat malas (dynamic import) dan dipakai bersama; tiap
// pemanggil mendapat kanal sendiri dan fungsi berhenti.
// Tanpa kunci / gagal → tidak melempar; pemanggil tetap punya polling.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { getRealtimeKonfig } from "@/services";

let klienPromise: Promise<SupabaseClient | null> | null = null;

async function klien(): Promise<SupabaseClient | null> {
  if (!klienPromise) {
    klienPromise = (async () => {
      try {
        const k = await getRealtimeKonfig();
        if (!k.realtime) return null;
        const { createClient } = await import("@supabase/supabase-js");
        return createClient(k.url, k.key, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          realtime: { params: { eventsPerSecond: 5 } },
        });
      } catch {
        return null;
      }
    })();
  }
  return klienPromise;
}

/**
 * Dengarkan satu event pada satu topik. Mengembalikan fungsi berhenti.
 * `onStatus` opsional: "tersambung" bila kanal aktif, "gagal" bila tidak.
 */
export async function dengarkanRealtime(
  topic: string,
  event: string,
  onPesan: (payload: Record<string, unknown>) => void,
  onStatus?: (s: "tersambung" | "gagal") => void,
): Promise<() => void> {
  const k = await klien();
  if (!k) {
    onStatus?.("gagal");
    return () => {};
  }
  const ch = k.channel(topic, { config: { broadcast: { self: false } } });
  ch.on("broadcast", { event }, ({ payload }) => onPesan((payload ?? {}) as Record<string, unknown>));
  ch.subscribe((status) => {
    if (status === "SUBSCRIBED") onStatus?.("tersambung");
    else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") onStatus?.("gagal");
  });
  return () => {
    void k.removeChannel(ch);
  };
}

/**
 * Kanal LANGSUNG (7 Okt 2026, modul bersama TV Official): siaran + kehadiran
 * (presence) dalam satu kanal, dan TIDAK menyerah — putus apa pun → sambung
 * ulang bertahap (2, 4, 8, lalu 15 detik), layar kembali aktif / jaringan
 * kembali → seketika. Presence hanya membawa `kunciHadir` (id), bukan nama.
 */
export async function kanalLangsung(
  topic: string,
  opsi: {
    event: string;
    onPesan: (payload: Record<string, unknown>) => void;
    kunciHadir?: string;
    onHadir?: (kunci: string[]) => void;
    onStatus?: (s: "tersambung" | "gagal") => void;
  },
): Promise<() => void> {
  const k = await klien();
  if (!k) {
    opsi.onStatus?.("gagal");
    return () => {};
  }
  let berhenti = false;
  let ch: ReturnType<SupabaseClient["channel"]> | null = null;
  let tersambung = false;
  let percobaan = 0;
  let pengatur: ReturnType<typeof setTimeout> | null = null;

  const pasang = () => {
    if (berhenti) return;
    if (ch) void k.removeChannel(ch);
    tersambung = false;
    const kanal = k.channel(topic, {
      config: { broadcast: { self: false }, ...(opsi.kunciHadir ? { presence: { key: opsi.kunciHadir } } : {}) },
    });
    ch = kanal;
    kanal.on("broadcast", { event: opsi.event }, ({ payload }) => opsi.onPesan((payload ?? {}) as Record<string, unknown>));
    if (opsi.kunciHadir) {
      kanal.on("presence", { event: "sync" }, () => opsi.onHadir?.(Object.keys(kanal.presenceState())));
    }
    kanal.subscribe((status) => {
      if (berhenti || ch !== kanal) return;
      if (status === "SUBSCRIBED") {
        tersambung = true;
        percobaan = 0;
        opsi.onStatus?.("tersambung");
        if (opsi.kunciHadir) void kanal.track({ t: Date.now() });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        tersambung = false;
        opsi.onStatus?.("gagal");
        jadwalkan();
      }
    });
  };

  const jadwalkan = (segera = false) => {
    if (berhenti || pengatur) return;
    const jeda = segera ? 0 : Math.min(15_000, 2000 * 2 ** Math.min(percobaan, 3));
    percobaan += 1;
    pengatur = setTimeout(() => {
      pengatur = null;
      pasang();
    }, jeda);
  };

  const pulih = () => {
    if (!tersambung && document.visibilityState === "visible") jadwalkan(true);
  };
  document.addEventListener("visibilitychange", pulih);
  window.addEventListener("online", pulih);
  pasang();

  return () => {
    berhenti = true;
    if (pengatur) clearTimeout(pengatur);
    document.removeEventListener("visibilitychange", pulih);
    window.removeEventListener("online", pulih);
    if (ch) void k.removeChannel(ch);
  };
}

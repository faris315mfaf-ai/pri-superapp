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

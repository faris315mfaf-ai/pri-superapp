// Setelan sambungan keluar (29 Sep 2026) — lihat lib/jaringan-keluar:
// sambungan dipakai ulang lebih lama & batas membuka sambungan 3 dtk,
// untuk SEMUA fetch server (Supabase, upload-post, Ayrshare, …).
// Dimuat sekali oleh instrumentation.ts, hanya di runtime Node.
//
// Memakai undici BAWAAN Node, bukan paket npm "undici": kelas Agent diambil
// dari dispatcher global yang dibuat Node sendiri, jadi versinya selalu
// cocok (Node 22 = undici 6, Node 24 = undici 7) dan build di VPS tidak
// perlu mengunduh paket baru — unduhan npm itulah yang gagal saat jaringan
// IPv4 VPS rusak (deploy 22c8d5c, 29 Sep). Simbol "undici.globalDispatcher.1"
// adalah titik temu resmi lintas versi undici.
import { SETELAN_SAMBUNGAN } from "@/lib/jaringan-keluar";

const SIMBOL = Symbol.for("undici.globalDispatcher.1");

type KelasAgent = new (opsi: Record<string, unknown>) => unknown;

async function pasang() {
  // Muat undici bawaan (fetch data: tanpa jaringan) supaya dispatcher
  // global bawaannya tercipta.
  await fetch("data:text/plain,ok")
    .then((r) => r.text())
    .catch(() => "");
  const wadah = globalThis as unknown as Record<symbol, unknown>;
  const Agent = (wadah[SIMBOL] as { constructor?: unknown } | undefined)?.constructor as KelasAgent | undefined;
  if (typeof Agent !== "function" || Agent.name !== "Agent") {
    console.warn(`[jaringan] setelan sambungan dilewati: dispatcher bawaan tidak dikenali (undici ${process.versions.undici})`);
    return;
  }
  wadah[SIMBOL] = new Agent({
    connect: { timeout: SETELAN_SAMBUNGAN.connectTimeoutMs },
    keepAliveTimeout: SETELAN_SAMBUNGAN.keepAliveTimeoutMs,
    keepAliveMaxTimeout: SETELAN_SAMBUNGAN.keepAliveMaxTimeoutMs,
  });
  console.log(`[jaringan] setelan sambungan aktif (undici ${process.versions.undici}, sambung ≤ ${SETELAN_SAMBUNGAN.connectTimeoutMs} ms)`);
}

await pasang().catch((e: unknown) => {
  console.warn("[jaringan] setelan sambungan gagal dipasang:", e instanceof Error ? e.message : e);
});

// Setelan sambungan keluar (29 Sep 2026) — lihat lib/jaringan-keluar:
// sambungan dipakai ulang lebih lama & batas membuka sambungan 3 dtk,
// untuk SEMUA fetch server (Supabase, upload-post, Ayrshare, …).
// Dimuat sekali oleh instrumentation.ts, hanya di runtime Node.
import { Agent, setGlobalDispatcher } from "undici";
import paketUndici from "undici/package.json";
import { SETELAN_SAMBUNGAN } from "@/lib/jaringan-keluar";

function pasang() {
  // Dispatcher paket undici hanya dipasang bila versi mayornya sama dengan
  // undici bawaan Node (produksi: Node 22 = undici 6). Beda mayor = antarmuka
  // handler berbeda → biarkan bawaan daripada fetch rusak.
  const bawaan = Number(String(process.versions.undici ?? "").split(".")[0]);
  const paket = Number(String(paketUndici.version ?? "").split(".")[0]);
  if (!bawaan || bawaan !== paket) {
    console.warn(`[jaringan] setelan sambungan dilewati: undici bawaan ${process.versions.undici}, paket ${paketUndici.version}`);
    return;
  }
  setGlobalDispatcher(
    new Agent({
      connect: { timeout: SETELAN_SAMBUNGAN.connectTimeoutMs },
      keepAliveTimeout: SETELAN_SAMBUNGAN.keepAliveTimeoutMs,
      keepAliveMaxTimeout: SETELAN_SAMBUNGAN.keepAliveMaxTimeoutMs,
    }),
  );
  console.log(`[jaringan] setelan sambungan aktif (undici ${process.versions.undici}, sambung ≤ ${SETELAN_SAMBUNGAN.connectTimeoutMs} ms)`);
}

try {
  pasang();
} catch (e) {
  console.warn("[jaringan] setelan sambungan gagal dipasang:", e instanceof Error ? e.message : e);
}

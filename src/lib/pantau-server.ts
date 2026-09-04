// ============================================================
// PEMANTAU SERVER (4 Sep 2026) — KHUSUS SISI SERVER, dijalankan cron
// /api/cron/pantau-server tiap 10 menit.
//
// Membaca tanda-tanda server akan tumbang: CPU/RAM/disk/beban Supabase
// tinggi, database lambat menjawab, galat klien melonjak, antrean siaran
// macet. Bila ada anomali:
//   1. MODE HEMAT dinyalakan otomatis (bila `hemat_otomatis` belum dimatikan
//      master) → Ludo, robot melayang, efek juara, asisten AI berhenti
//      membebani server;
//   2. semua MASTER diberi notifikasi (baris notifikasi + push).
// Notifikasi tidak dikirim berulang untuk anomali yang sama dalam 30 menit,
// dan sekali lagi saat keadaan PULIH.
// ============================================================
import { supabase } from "@/lib/supabase";
import { kirimKabar } from "@/lib/notifikasi";
import { bacaMetrikServer, type RingkasServer } from "@/lib/metrik-server";
import { bacaSakelar, simpanSakelar } from "@/lib/sakelar";

/** Ambang anomali — sengaja agak longgar supaya tidak berisik. */
export const AMBANG = {
  cpu_persen: 85,
  ram_persen: 90,
  disk_persen: 92,
  beban_per_inti: 2.0,
  db_ms: 4000,
  galat_klien_10m: 25,
  siaran_macet: 3,
} as const;

const KUNCI_KEADAAN = "pantau_server";
const JEDA_ULANG_MS = 30 * 60_000;

type Keadaan = { sidik: string; pada: string; anomali: boolean };

export type HasilPantau = {
  anomali: string[];
  metrik: RingkasServer | null;
  galat_metrik: string;
  db_ms: number | null;
  galat_klien: number;
  siaran_macet: number;
  hemat_dinyalakan: boolean;
  notif_dikirim: "anomali" | "pulih" | "tidak";
  diperiksa_pada: string;
};

async function bacaKeadaan(): Promise<Keadaan | null> {
  try {
    const { data } = await supabase().from("pengaturan_sistem").select("nilai").eq("kunci", KUNCI_KEADAAN).maybeSingle();
    if (!data?.nilai) return null;
    const j = JSON.parse(String(data.nilai)) as Keadaan;
    return j && typeof j === "object" ? j : null;
  } catch {
    return null;
  }
}

async function simpanKeadaan(k: Keadaan): Promise<void> {
  await supabase()
    .from("pengaturan_sistem")
    .upsert({ kunci: KUNCI_KEADAAN, nilai: JSON.stringify(k), diubah_pada: new Date().toISOString() }, { onConflict: "kunci" });
}

async function idMaster(): Promise<number[]> {
  const { data } = await supabase().from("app_user").select("id").eq("role", "master").eq("aktif", true);
  return (data ?? []).map((u) => Number(u.id));
}

function mb(n: number | null): string {
  return n == null ? "?" : `${Math.round(n / 1024 / 1024)} MB`;
}

export async function pantauServer(): Promise<HasilPantau> {
  const db = supabase();
  const anomali: string[] = [];

  // 1) Metrik Supabase
  const { server, galat } = await bacaMetrikServer();
  if (server) {
    if (server.cpu_persen != null && server.cpu_persen >= AMBANG.cpu_persen) anomali.push(`CPU ${server.cpu_persen}%`);
    if (server.ram_persen != null && server.ram_persen >= AMBANG.ram_persen) anomali.push(`RAM ${server.ram_persen}% (${mb(server.ram_terpakai)}/${mb(server.ram_total)})`);
    if (server.disk_persen != null && server.disk_persen >= AMBANG.disk_persen) anomali.push(`Disk ${server.disk_persen}%`);
    if (server.beban_1m != null && server.cpu_inti > 0 && server.beban_1m >= AMBANG.beban_per_inti * server.cpu_inti) {
      anomali.push(`Beban 1 mnt ${server.beban_1m.toFixed(2)} (${server.cpu_inti} inti)`);
    }
  }

  // 2) Database lambat?
  let dbMs: number | null = null;
  try {
    const t0 = Date.now();
    await db.from("app_user").select("id").limit(1);
    dbMs = Date.now() - t0;
    if (dbMs >= AMBANG.db_ms) anomali.push(`Database lambat: ${dbMs} ms`);
  } catch {
    anomali.push("Database tidak menjawab");
  }

  // 3) Galat klien 10 menit terakhir
  let galatKlien = 0;
  try {
    const sejak = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count } = await db.from("log_klien").select("id", { count: "exact", head: true }).gte("waktu", sejak);
    galatKlien = count ?? 0;
    if (galatKlien >= AMBANG.galat_klien_10m) anomali.push(`Galat klien melonjak: ${galatKlien} dalam 10 mnt`);
  } catch {
    // tabel/kolom tidak sesuai → abaikan sinyal ini
  }

  // 4) Antrean siaran macet (diproses > 20 menit)
  let siaranMacet = 0;
  try {
    const batas = new Date(Date.now() - 20 * 60_000).toISOString();
    const { count } = await db.from("tvr_siaran_item").select("id", { count: "exact", head: true }).eq("status", "diproses").lt("diproses_pada", batas);
    siaranMacet = count ?? 0;
    if (siaranMacet >= AMBANG.siaran_macet) anomali.push(`Antrean siaran macet: ${siaranMacet} item > 20 mnt`);
  } catch {
    // abaikan
  }

  // 5) Keputusan: mode hemat otomatis + notifikasi (anti-spam 30 mnt, plus kabar pulih)
  const sakelar = await bacaSakelar(true);
  const sebelumnya = await bacaKeadaan();
  const kini = new Date().toISOString();
  const sidik = anomali.map((a) => a.replace(/[0-9.,]+/g, "#")).sort().join("|");
  let hematDinyalakan = false;
  let notif: HasilPantau["notif_dikirim"] = "tidak";
  const master = await idMaster();

  if (anomali.length > 0) {
    if (sakelar.hemat_otomatis && !sakelar.hemat) {
      await simpanSakelar("mode_hemat", true);
      hematDinyalakan = true;
    }
    const sama = sebelumnya?.anomali && sebelumnya.sidik === sidik && Date.now() - Date.parse(sebelumnya.pada) < JEDA_ULANG_MS;
    if (!sama && master.length > 0) {
      await kirimKabar({
        judul: "⚠️ Server anomali — pertanda akan down",
        isi:
          anomali.join(" · ") +
          (hematDinyalakan
            ? ". MODE HEMAT dinyalakan otomatis (Ludo, robot melayang, efek juara, asisten AI dimatikan sementara). Nyalakan lagi di Panel Master bila sudah aman."
            : sakelar.hemat
              ? ". Mode hemat sudah menyala."
              : ". Mode hemat otomatis dimatikan — pertimbangkan menyalakan mode hemat di Panel Master."),
        kategori: "peringatan",
        jenis_peristiwa: "server",
        untukUserIds: master,
      });
      notif = "anomali";
    }
    await simpanKeadaan({ sidik, pada: sama && sebelumnya ? sebelumnya.pada : kini, anomali: true });
  } else {
    if (sebelumnya?.anomali && master.length > 0) {
      await kirimKabar({
        judul: "✅ Server pulih",
        isi: `Tidak ada lagi anomali (CPU ${server?.cpu_persen ?? "?"}%, RAM ${server?.ram_persen ?? "?"}%, DB ${dbMs ?? "?"} ms).${sakelar.hemat ? " Mode hemat masih menyala — matikan di Panel Master bila fitur berat mau dibuka lagi." : ""}`,
        kategori: "info",
        jenis_peristiwa: "server",
        untukUserIds: master,
      });
      notif = "pulih";
    }
    if (sebelumnya?.anomali) await simpanKeadaan({ sidik: "", pada: kini, anomali: false });
  }

  return {
    anomali,
    metrik: server,
    galat_metrik: galat,
    db_ms: dbMs,
    galat_klien: galatKlien,
    siaran_macet: siaranMacet,
    hemat_dinyalakan: hematDinyalakan,
    notif_dikirim: notif,
    diperiksa_pada: kini,
  };
}

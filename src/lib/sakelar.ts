// ============================================================
// SAKELAR FITUR BERAT (4 Sep 2026) — KHUSUS SISI SERVER.
//
// Master bisa mematikan fitur yang membebani server (Ludo, robot melayang,
// efek juara, asisten AI) lewat Panel Master, satu per satu atau sekaligus
// lewat MODE HEMAT. Pemantau server (lib/pantau-server) juga bisa menyalakan
// mode hemat OTOMATIS saat ada tanda-tanda server akan tumbang.
//
// Disimpan di pengaturan_sistem:
//   fitur_<kunci>   'false' = mati (bawaan nyala)
//   mode_hemat      'true'  = semua fitur berat mati sekaligus
//   hemat_otomatis  'false' = pemantau TIDAK boleh menyalakan mode hemat
//   tur_aktif       'false' = tutorial interaktif mati
// Dibaca dengan cache 60 detik per instans server.
// ============================================================
import { supabase } from "@/lib/supabase";

export const DAFTAR_FITUR_BERAT = [
  {
    kunci: "ludo",
    label: "Ludo Robot",
    keterangan: "Permainan multipemain — tiap pemain menanyakan keadaan ruang ke server 1,5 detik sekali.",
  },
  {
    kunci: "pet_beranda",
    label: "Robot & hewan melayang di beranda",
    keterangan: "Dua komponen animasi + pemuatan data pet setiap kali beranda dibuka.",
  },
  {
    kunci: "juara_efek",
    label: "Running text & kembang api juara",
    keterangan: "Kanvas kembang api dan kueri juara komentar di beranda semua pengguna.",
  },
  {
    kunci: "asisten",
    label: "Asisten AI",
    keterangan: "Panggilan model AI — paling mahal dan lambat saat server sibuk.",
  },
] as const;

export type KunciFiturBerat = (typeof DAFTAR_FITUR_BERAT)[number]["kunci"];

export type PetaSakelar = {
  /** Keadaan EFEKTIF tiap fitur (sudah memperhitungkan mode hemat). */
  fitur: Record<KunciFiturBerat, boolean>;
  /** Pilihan mentah tiap fitur (tanpa mode hemat) — untuk tampilan sakelar di panel. */
  pilihan: Record<KunciFiturBerat, boolean>;
  hemat: boolean;
  hemat_otomatis: boolean;
  tur: boolean;
  diperbarui: string;
};

const KUNCI_TAMBAHAN = ["mode_hemat", "hemat_otomatis", "tur_aktif"] as const;
const TTL_MS = 60_000;
let cache: { peta: PetaSakelar; pada: number } | null = null;

export function resetCacheSakelar(): void {
  cache = null;
}

export async function bacaSakelar(segar = false): Promise<PetaSakelar> {
  if (!segar && cache && Date.now() - cache.pada < TTL_MS) return cache.peta;
  const kunci = [...DAFTAR_FITUR_BERAT.map((f) => `fitur_${f.kunci}`), ...KUNCI_TAMBAHAN];
  let peta: Map<string, string> = new Map();
  try {
    const { data } = await supabase().from("pengaturan_sistem").select("kunci, nilai").in("kunci", kunci);
    peta = new Map((data ?? []).map((r) => [String(r.kunci), String(r.nilai ?? "")]));
  } catch {
    // Gagal membaca = anggap semua nyala (jangan mematikan fitur karena galat sesaat).
  }
  const hemat = peta.get("mode_hemat") === "true";
  const pilihan = {} as Record<KunciFiturBerat, boolean>;
  const fitur = {} as Record<KunciFiturBerat, boolean>;
  for (const f of DAFTAR_FITUR_BERAT) {
    pilihan[f.kunci] = peta.get(`fitur_${f.kunci}`) !== "false";
    fitur[f.kunci] = !hemat && pilihan[f.kunci];
  }
  const hasil: PetaSakelar = {
    fitur,
    pilihan,
    hemat,
    hemat_otomatis: peta.get("hemat_otomatis") !== "false",
    tur: peta.get("tur_aktif") !== "false",
    diperbarui: new Date().toISOString(),
  };
  cache = { peta: hasil, pada: Date.now() };
  return hasil;
}

/** Fitur berat ini sedang boleh dipakai? (memperhitungkan mode hemat) */
export async function fiturBeratAktif(kunci: KunciFiturBerat): Promise<boolean> {
  return (await bacaSakelar()).fitur[kunci];
}

/** Simpan satu kunci sakelar ('true'/'false') lalu buang cache. */
export async function simpanSakelar(kunci: string, nyala: boolean): Promise<void> {
  const { error } = await supabase()
    .from("pengaturan_sistem")
    .upsert({ kunci, nilai: nyala ? "true" : "false", diubah_pada: new Date().toISOString() }, { onConflict: "kunci" });
  if (error) throw new Error(`Gagal menyimpan pengaturan ${kunci}.`);
  resetCacheSakelar();
}

export function adalahKunciFiturBerat(k: string): k is KunciFiturBerat {
  return DAFTAR_FITUR_BERAT.some((f) => f.kunci === k);
}

/** Galat 503 seragam untuk endpoint fitur yang sedang dimatikan. */
export function galatFiturMati(label: string): never {
  throw Object.assign(
    new Error(`${label} sedang dinonaktifkan sementara oleh master (mode hemat server). Coba lagi nanti.`),
    { status: 503 },
  );
}

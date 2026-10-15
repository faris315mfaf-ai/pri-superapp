// ============================================================
// PANTAU VIDEO WAJIB (15 Okt 2026) — KHUSUS SERVER.
//
// Menjawab "siapa yang sudah memposting perintah ini?" dari catatan yang
// SUDAH ada — tanpa memanggil platform mana pun:
//   • akun_tvr_user  → siapa yang wajib (akun tersambung) dan platformnya
//   • tvrku_post     → unggahan lewat SuperApp (kolom perintah_id)
//   • laporan_video  → tautan terbit (kolom perintah_id; sumber otomatis
//                      dari unggahan, atau dimasukkan Pimred)
//
// Perintah wajib posting berlaku OTOMATIS untuk semua akun tersambung dan
// semua platform tertaut — tidak ada daftar sasaran.
//
// Kolom/tabel yang belum ada di database (sql/76 belum dijalankan) tidak
// membuat galat: fitur pantau cukup melapor "belum siap".
// ============================================================
import { supabase } from "@/lib/supabase";
import { semuaBaris } from "@/lib/semua-baris";
import { denganCache } from "@/lib/cache-bersama";
import { peranTersembunyi } from "@/lib/peran";
import { adalahBot } from "@/lib/struktur";
import {
  PENGATURAN_WAJIB_BAWAAN,
  PLATFORM_WAJIB,
  bersihkanBatasJam,
  bersihkanPola,
  geserTanggal,
  kemajuanSaya,
  persenBulat,
  susunKepatuhan,
  tanggalWibWajib,
  wilayahAnggota,
  type AkunKepatuhan,
  type BarisPantauWajib,
  type KemajuanSaya,
  type PolaWajib,
  type RingkasKepatuhan,
} from "@/lib/video-wajib-perintah";

const SAH = new Set<string>(PLATFORM_WAJIB);

function potong<T>(daftar: T[], ukuran: number): T[][] {
  const hasil: T[][] = [];
  for (let i = 0; i < daftar.length; i += ukuran) hasil.push(daftar.slice(i, i + ukuran));
  return hasil;
}

function normalPlatform(p: unknown): string {
  const s = String(p ?? "").trim().toLowerCase();
  return s === "x" ? "twitter" : s;
}

// ------------------------------------------------------------
// Perintah
// ------------------------------------------------------------

export type PerintahWajib = {
  id: string;
  judul: string;
  kategori: string;
  aktif: boolean;
  batas_waktu: string;
  dibuat_pada: string;
  wajib_posting: boolean;
  pola: PolaWajib;
  batas_jam: string;
  pengingat: boolean;
};

const KOLOM_PERINTAH = "id, judul, kategori, aktif, batas_waktu, dibuat_pada, wajib_posting, pola, batas_jam, pengingat";
const KOLOM_PERINTAH_LAMA = "id, judul, kategori, aktif, batas_waktu, dibuat_pada";

type BarisPerintah = {
  id: number | string;
  judul: string;
  kategori: string | null;
  aktif: boolean;
  batas_waktu: string | null;
  dibuat_pada: string;
  wajib_posting?: boolean | null;
  pola?: string | null;
  batas_jam?: string | null;
  pengingat?: boolean | null;
};

export function bentukPerintah(b: BarisPerintah): PerintahWajib {
  return {
    id: String(b.id),
    judul: b.judul,
    kategori: b.kategori ?? "",
    aktif: b.aktif === true,
    batas_waktu: b.batas_waktu ?? "",
    dibuat_pada: b.dibuat_pada,
    wajib_posting: b.wajib_posting === true,
    pola: bersihkanPola(b.pola),
    batas_jam: bersihkanBatasJam(b.batas_jam ?? PENGATURAN_WAJIB_BAWAAN.batas_jam),
    pengingat: b.pengingat !== false,
  };
}

/** Satu perintah, atau null bila tidak ada. Tahan kolom sql/76 yang belum ada. */
export async function muatPerintah(id: number): Promise<PerintahWajib | null> {
  const db = supabase();
  let { data, error } = await db.from("tvr_video_wajib").select(KOLOM_PERINTAH).eq("id", id).maybeSingle();
  if (error?.code === "42703") {
    ({ data, error } = await db.from("tvr_video_wajib").select(KOLOM_PERINTAH_LAMA).eq("id", id).maybeSingle());
  }
  if (error || !data) return null;
  return bentukPerintah(data as unknown as BarisPerintah);
}

/** Perintah AKTIF yang wajib posting (untuk penjadwal pengingat). */
export async function perintahWajibAktif(): Promise<PerintahWajib[]> {
  const { data, error } = await supabase()
    .from("tvr_video_wajib")
    .select(KOLOM_PERINTAH)
    .eq("aktif", true)
    .eq("wajib_posting", true)
    .limit(50);
  if (error) return []; // kolom belum ada → belum ada yang wajib posting
  return ((data ?? []) as unknown as BarisPerintah[]).map(bentukPerintah);
}

// ------------------------------------------------------------
// Roster: siapa saja yang wajib
// ------------------------------------------------------------

export type AnggotaRoster = { user_id: string; nama: string; wilayah: string; platform: string[] };

async function bacaRoster(): Promise<AnggotaRoster[]> {
  const db = supabase();
  const akun = await semuaBaris<{ user_id: number | string; platform: string }>(
    (dari, sampai) =>
      db
        .from("akun_tvr_user")
        .select("user_id, platform")
        .eq("terhubung", true)
        .order("user_id", { ascending: true })
        .range(dari, sampai) as unknown as PromiseLike<{
        data: { user_id: number | string; platform: string }[] | null;
        error: { message: string } | null;
      }>,
    30_000,
  );
  const per = new Map<string, Set<string>>();
  for (const a of akun) {
    const p = normalPlatform(a.platform);
    if (!SAH.has(p)) continue;
    const id = String(a.user_id);
    const s = per.get(id) ?? new Set<string>();
    s.add(p);
    per.set(id, s);
  }

  const idSemua = [...per.keys()].map(Number).filter((n) => Number.isFinite(n) && n > 0);
  type BarisUser = {
    id: number | string;
    nama: string | null;
    role: string | null;
    status: string | null;
    aktif: boolean | null;
    divisi: string | null;
    sub_divisi: string | null;
    zona_id: number | string | null;
  };
  const users = new Map<string, BarisUser>();
  for (const bagian of potong(idSemua, 300)) {
    const { data } = await db
      .from("app_user")
      .select("id, nama, role, status, aktif, divisi, sub_divisi, zona_id")
      .in("id", bagian);
    for (const u of (data ?? []) as unknown as BarisUser[]) users.set(String(u.id), u);
  }

  const zonaNama = new Map<string, string>();
  const { data: zonaData } = await db.from("zona").select("id, nama");
  for (const z of (zonaData ?? []) as { id: number | string; nama: string | null }[]) {
    zonaNama.set(String(z.id), String(z.nama ?? ""));
  }

  const hasil: AnggotaRoster[] = [];
  for (const [id, platform] of per) {
    const u = users.get(id);
    if (!u || u.aktif !== true || u.status !== "aktif") continue;
    if (peranTersembunyi(u.role) || adalahBot(u)) continue;
    hasil.push({
      user_id: id,
      nama: String(u.nama ?? "").trim() || `Anggota ${id}`,
      wilayah: wilayahAnggota({ zona: u.zona_id == null ? "" : (zonaNama.get(String(u.zona_id)) ?? ""), divisi: u.divisi, sub_divisi: u.sub_divisi }),
      platform: [...platform],
    });
  }
  return hasil;
}

/** Roster seluruh anggota yang wajib — disimpan 5 menit (jarang berubah). */
export function roster(): Promise<AnggotaRoster[]> {
  return denganCache("video-wajib:roster", 300, bacaRoster);
}

// ------------------------------------------------------------
// Catatan posting untuk SATU perintah
// ------------------------------------------------------------

export type CatatanPosting = { user_id: string; platform: string; tanggal: string };

/**
 * Semua (anggota, platform, tanggal WIB) yang tercatat memposting perintah
 * ini. Dari unggahan SuperApp (yang gagal terbit tidak dihitung) dan dari
 * laporan tautan. Disimpan unik; `siap=false` bila kolom perintah_id belum ada.
 */
export async function catatanPosting(perintahId: number): Promise<{ siap: boolean; catatan: CatatanPosting[] }> {
  const db = supabase();
  const unik = new Map<string, CatatanPosting>();
  const tambah = (user: unknown, platform: unknown, tanggal: string) => {
    const p = normalPlatform(platform);
    if (!SAH.has(p) || !tanggal) return;
    const u = String(user);
    unik.set(`${u}|${p}|${tanggal}`, { user_id: u, platform: p, tanggal });
  };

  type BarisPost = {
    user_id: number | string;
    platforms: string[] | null;
    hasil: Record<string, unknown> | null;
    dibuat_pada: string;
    jadwal: string | null;
  };
  const posts = await semuaBaris<BarisPost>(
    (dari, sampai) =>
      db
        .from("tvrku_post")
        .select("user_id, platforms, hasil, dibuat_pada, jadwal")
        .eq("perintah_id", perintahId)
        .order("dibuat_pada", { ascending: true })
        .range(dari, sampai) as unknown as PromiseLike<{
        data: BarisPost[] | null;
        error: { message: string } | null;
      }>,
    20_000,
  );
  for (const p of posts) {
    const gagal = new Set(
      (Array.isArray(p.hasil?.kpi_gagal) ? (p.hasil!.kpi_gagal as unknown[]) : []).map(normalPlatform),
    );
    // Terjadwal dihitung pada tanggal terbitnya, bukan tanggal membuat jadwal.
    const tanggal = tanggalWibWajib(p.jadwal ?? p.dibuat_pada);
    for (const pf of p.platforms ?? []) {
      if (!gagal.has(normalPlatform(pf))) tambah(p.user_id, pf, tanggal);
    }
  }

  // Cek kolomnya ada di laporan_video juga (galat 42703 → belum siap).
  const cek = await db.from("laporan_video").select("id").eq("perintah_id", perintahId).limit(1);
  const siap = !cek.error;
  if (siap) {
    type BarisLaporan = { user_id: number | string; platform: string; tanggal_wib: string };
    const laporan = await semuaBaris<BarisLaporan>(
      (dari, sampai) =>
        db
          .from("laporan_video")
          .select("user_id, platform, tanggal_wib")
          .eq("perintah_id", perintahId)
          .order("tanggal_wib", { ascending: true })
          .range(dari, sampai) as unknown as PromiseLike<{
          data: BarisLaporan[] | null;
          error: { message: string } | null;
        }>,
      20_000,
    );
    for (const l of laporan) tambah(l.user_id, l.platform, String(l.tanggal_wib ?? "").slice(0, 10));
  }
  return { siap, catatan: [...unik.values()] };
}

// ------------------------------------------------------------
// Kepatuhan
// ------------------------------------------------------------

/** Tanggal terbit perintah (WIB). */
export function tanggalTerbit(p: Pick<PerintahWajib, "dibuat_pada">): string {
  return tanggalWibWajib(p.dibuat_pada);
}

/** Platform yang sudah diposting satu anggota pada tanggal itu (atau sampai tanggal itu bila 'sekali'). */
export function sudahPada(
  catatan: CatatanPosting[],
  userId: string,
  tanggal: string,
  pola: PolaWajib,
  terbit: string,
): string[] {
  const hasil = new Set<string>();
  for (const c of catatan) {
    if (c.user_id !== userId) continue;
    if (pola === "sekali" ? c.tanggal >= terbit && c.tanggal <= tanggal : c.tanggal === tanggal) hasil.add(c.platform);
  }
  return [...hasil];
}

export type HasilKepatuhan = { daftar: BarisPantauWajib[]; ringkas: RingkasKepatuhan };

export function hitungKepatuhan(
  perintah: Pick<PerintahWajib, "pola" | "dibuat_pada">,
  tanggal: string,
  anggota: AnggotaRoster[],
  catatan: CatatanPosting[],
): HasilKepatuhan {
  const terbit = tanggalTerbit(perintah);
  const akun: AkunKepatuhan[] = anggota.map((a) => ({
    ...a,
    sudah: sudahPada(catatan, a.user_id, tanggal, perintah.pola, terbit),
  }));
  return susunKepatuhan(akun);
}

export type TitikHari = { tanggal: string; selesai: number; akun: number; persen: number };

/** 7 hari berakhir di `tanggalAkhir` (hari sebelum terbit tidak ikut). */
export function tujuhHari(
  perintah: Pick<PerintahWajib, "pola" | "dibuat_pada" | "batas_waktu">,
  tanggalAkhir: string,
  anggota: AnggotaRoster[],
  catatan: CatatanPosting[],
): TitikHari[] {
  const terbit = tanggalTerbit(perintah);
  const hasil: TitikHari[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const t = geserTanggal(tanggalAkhir, -i);
    if (t < terbit) continue;
    if (perintah.batas_waktu && t > perintah.batas_waktu) continue;
    const { ringkas } = hitungKepatuhan(perintah, t, anggota, catatan);
    hasil.push({ tanggal: t, selesai: ringkas.selesai, akun: ringkas.akun, persen: persenBulat(ringkas.selesai, ringkas.akun) });
  }
  return hasil;
}

/** Ringkasan hari ini untuk panel Pimred (disimpan 60 detik per perintah). */
export async function ringkasHariIni(perintah: PerintahWajib): Promise<RingkasKepatuhan> {
  const hari = tanggalWibWajib(Date.now());
  return denganCache(`video-wajib:ringkas:${perintah.id}:${hari}`, 60, async () => {
    const [anggota, { catatan }] = await Promise.all([roster(), catatanPosting(Number(perintah.id))]);
    return hitungKepatuhan(perintah, hari, anggota, catatan).ringkas;
  });
}

// ------------------------------------------------------------
// Kemajuan satu anggota (kartu anggota)
// ------------------------------------------------------------

/** Platform tertaut milik SATU anggota (tidak lewat cache roster). */
export async function platformAnggota(userId: number): Promise<string[]> {
  const { data } = await supabase().from("akun_tvr_user").select("platform").eq("user_id", userId).eq("terhubung", true);
  return [...new Set((data ?? []).map((a) => normalPlatform((a as { platform: string }).platform)).filter((p) => SAH.has(p)))];
}

/**
 * Kemajuan SATU anggota untuk beberapa perintah sekaligus (dua kueri kecil,
 * dibatasi pada anggota itu). Hanya perintah wajib posting yang aktif.
 */
export async function kemajuanPerintahSaya(
  userId: number,
  perintah: Pick<PerintahWajib, "id" | "pola" | "dibuat_pada">[],
): Promise<Map<string, KemajuanSaya>> {
  const hasil = new Map<string, KemajuanSaya>();
  if (perintah.length === 0) return hasil;
  const db = supabase();
  const platform = await platformAnggota(userId);
  const idSemua = perintah.map((p) => Number(p.id));
  const catatan = new Map<string, CatatanPosting[]>();
  const tambah = (id: unknown, platformMentah: unknown, tanggal: string) => {
    const pf = normalPlatform(platformMentah);
    if (!SAH.has(pf) || !tanggal) return;
    const k = String(id);
    const arr = catatan.get(k) ?? [];
    arr.push({ user_id: String(userId), platform: pf, tanggal });
    catatan.set(k, arr);
  };
  const { data: posts } = await db
    .from("tvrku_post")
    .select("perintah_id, platforms, hasil, dibuat_pada, jadwal")
    .eq("user_id", userId)
    .in("perintah_id", idSemua)
    .limit(2000);
  for (const p of (posts ?? []) as unknown as {
    perintah_id: number | string;
    platforms: string[] | null;
    hasil: Record<string, unknown> | null;
    dibuat_pada: string;
    jadwal: string | null;
  }[]) {
    const gagal = new Set((Array.isArray(p.hasil?.kpi_gagal) ? (p.hasil!.kpi_gagal as unknown[]) : []).map(normalPlatform));
    const tanggal = tanggalWibWajib(p.jadwal ?? p.dibuat_pada);
    for (const pf of p.platforms ?? []) if (!gagal.has(normalPlatform(pf))) tambah(p.perintah_id, pf, tanggal);
  }
  const { data: laporan } = await db
    .from("laporan_video")
    .select("perintah_id, platform, tanggal_wib")
    .eq("user_id", userId)
    .in("perintah_id", idSemua)
    .limit(2000);
  for (const l of (laporan ?? []) as unknown as { perintah_id: number | string; platform: string; tanggal_wib: string }[]) {
    tambah(l.perintah_id, l.platform, String(l.tanggal_wib ?? "").slice(0, 10));
  }
  const hari = tanggalWibWajib(Date.now());
  for (const p of perintah) {
    const sudah = sudahPada(catatan.get(p.id) ?? [], String(userId), hari, p.pola, tanggalTerbit(p));
    hasil.set(p.id, kemajuanSaya(platform, sudah));
  }
  return hasil;
}

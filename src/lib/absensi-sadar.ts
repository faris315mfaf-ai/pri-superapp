// ============================================================
// SINKRON ABSENSI SADAR → SUPERAPP (14 Sep 2026) — sisi server.
//
// Satu tanggal per panggilan: tarik dari SADAR, simpan mentahnya ke
// absensi_sadar (semua orang, cocok atau tidak), lalu cerminkan yang
// cocok (email = email akun) ke tabel `absensi` sebagai baris
// masuk/pulang — bentuk yang sudah dibaca semua layar.
//
// Pengekangan supaya SADAR tidak dibanjiri: hari ini paling cepat tiap
// 60 dtk (denganCache: memori + Redis, single-flight), tanggal lampau
// dianggap segar 6 jam (absensi_sinkron.pada). Koin & streak absen tetap
// diberikan — saat baris MASUK seseorang pertama kali muncul di sini.
// ============================================================
import { supabase } from "@/lib/supabase";
import { denganCache } from "@/lib/cache-bersama";
import { ambilAbsensiSadar, sadarSiap, waktuWibKeIso, type BarisSadar } from "@/lib/sadar";
import { beriKoin } from "@/lib/koin";
import { catatTugasStreak } from "@/lib/streak";
import { tanggalWibHariIni } from "@/lib/format";

const JEDA_HARI_INI_DETIK = 60;
const SEGAR_LAMPAU_JAM = 6;

export type HasilSinkron = {
  tanggal: string;
  jalan: boolean;
  jumlah: number;
  cocok: number;
  tidak_cocok: number;
  baru_masuk: number;
  galat?: string;
};

/** Cocokkan email SADAR → id akun SuperApp (huruf kecil). */
async function petaEmailKeUser(email: string[]): Promise<Map<string, number>> {
  const peta = new Map<string, number>();
  const unik = Array.from(new Set(email.filter(Boolean)));
  if (unik.length === 0) return peta;
  const db = supabase();
  // .in() dengan ratusan email aman (PostgREST memakai POST bila panjang).
  for (let i = 0; i < unik.length; i += 200) {
    const potong = unik.slice(i, i + 200);
    const { data } = await db.from("app_user").select("id, email").in("email", potong);
    for (const u of data ?? []) peta.set(String(u.email).toLowerCase(), Number(u.id));
  }
  // Email di app_user bisa saja tersimpan dengan huruf besar: cocokkan
  // lagi tanpa peduli huruf untuk yang belum ketemu.
  const belum = unik.filter((e) => !peta.has(e));
  if (belum.length > 0 && belum.length <= 50) {
    for (const e of belum) {
      const { data } = await db.from("app_user").select("id, email").ilike("email", e).limit(1).maybeSingle();
      if (data) peta.set(e, Number(data.id));
    }
  }
  return peta;
}

/** Tarik & cerminkan satu tanggal. Tidak pernah melempar. */
export async function sinkronAbsensiTanggal(tanggal: string): Promise<HasilSinkron> {
  const hasil: HasilSinkron = { tanggal, jalan: false, jumlah: 0, cocok: 0, tidak_cocok: 0, baru_masuk: 0 };
  if (!sadarSiap()) return { ...hasil, galat: "SADAR_API_TOKEN belum diatur." };
  const hariIni = tanggalWibHariIni();
  let baris: BarisSadar[];
  try {
    const r = await ambilAbsensiSadar(tanggal === hariIni ? undefined : tanggal);
    baris = r.baris.filter((b) => b.tanggal === tanggal);
  } catch (e) {
    return { ...hasil, galat: e instanceof Error ? e.message : "Gagal menghubungi SADAR." };
  }
  hasil.jalan = true;
  hasil.jumlah = baris.length;

  const db = supabase();
  const peta = await petaEmailKeUser(baris.map((b) => b.email));

  // 1. Cermin mentah — semua orang, cocok atau belum.
  if (baris.length > 0) {
    const { error } = await db.from("absensi_sadar").upsert(
      baris.map((b) => ({
        kode_pegawai: b.kode,
        tanggal: b.tanggal,
        email: b.email,
        nama: b.nama,
        user_id: peta.get(b.email) ?? null,
        hadir: b.hadir,
        status: b.status,
        tipe: b.tipe,
        jam_masuk: b.jamMasuk || null,
        jam_pulang: b.jamPulang || null,
        verifikasi: b.verifikasi,
        mentah: b.mentah,
        disinkron_pada: new Date().toISOString(),
      })),
      { onConflict: "kode_pegawai,tanggal" },
    );
    if (error) {
      console.error("[absensi-sadar] cermin mentah:", error.message);
      return { ...hasil, jalan: false, galat: "Gagal menyimpan data SADAR (sql/53 sudah dijalankan?)." };
    }
  }

  // 2. Cermin ke `absensi` (masuk/pulang) untuk yang cocok.
  const cocok = baris.filter((b) => peta.has(b.email));
  hasil.cocok = cocok.length;
  hasil.tidak_cocok = baris.length - cocok.length;

  const { data: sudahMasuk } = await db
    .from("absensi")
    .select("user_id")
    .eq("tanggal_wib", tanggal)
    .eq("jenis", "masuk");
  const adaMasuk = new Set((sudahMasuk ?? []).map((r) => Number(r.user_id)));

  type BarisAbsensi = {
    user_id: number;
    jenis: "masuk" | "pulang";
    waktu: string;
    tanggal_wib: string;
    sumber: "sadar";
    kode_pegawai: string;
    status_sadar: string;
    tipe_sadar: string;
    verifikasi_sadar: string;
  };
  const cermin: BarisAbsensi[] = [];
  const baruMasuk: number[] = [];
  for (const b of cocok) {
    const uid = peta.get(b.email)!;
    const dasar = {
      user_id: uid,
      tanggal_wib: b.tanggal,
      sumber: "sadar" as const,
      kode_pegawai: b.kode,
      status_sadar: b.status,
      tipe_sadar: b.tipe,
      verifikasi_sadar: b.verifikasi,
    };
    const masuk = b.jamMasuk ? waktuWibKeIso(b.tanggal, b.jamMasuk) : null;
    const pulang = b.jamPulang ? waktuWibKeIso(b.tanggal, b.jamPulang) : null;
    if (masuk) {
      cermin.push({ ...dasar, jenis: "masuk", waktu: masuk });
      if (!adaMasuk.has(uid)) baruMasuk.push(uid);
    }
    if (pulang) cermin.push({ ...dasar, jenis: "pulang", waktu: pulang });
  }
  if (cermin.length > 0) {
    const { error } = await db.from("absensi").upsert(cermin, { onConflict: "user_id,tanggal_wib,jenis" });
    if (error) {
      console.error("[absensi-sadar] cermin absensi:", error.message);
      return { ...hasil, jalan: false, galat: "Gagal mencerminkan absensi (sql/53 sudah dijalankan?)." };
    }
  }
  hasil.baru_masuk = baruMasuk.length;

  // 3. Koin & streak untuk absen masuk yang baru tercatat (idempoten:
  //    referensi koin = tanggal; streak hanya untuk hari ini).
  for (const uid of baruMasuk) {
    try {
      await beriKoin(uid, "absen", tanggal);
      if (tanggal === hariIni) await catatTugasStreak(uid);
    } catch (e) {
      console.error("[absensi-sadar] koin/streak:", e);
    }
  }

  await db.from("absensi_sinkron").upsert(
    { tanggal, pada: new Date().toISOString(), jumlah: hasil.jumlah, cocok: hasil.cocok, tidak_cocok: hasil.tidak_cocok },
    { onConflict: "tanggal" },
  );
  return hasil;
}

/** Hari ini — paling cepat sekali per 60 dtk untuk seluruh proses. */
export async function sinkronAbsensiHariIni(): Promise<HasilSinkron> {
  const tanggal = tanggalWibHariIni();
  return denganCache(`sadar:sinkron:${tanggal}`, JEDA_HARI_INI_DETIK, () => sinkronAbsensiTanggal(tanggal));
}

/**
 * Pastikan rentang tanggal sudah ditarik (untuk tren/peringkat/rekap).
 * Tanggal yang sudah segar dilewati; paling banyak `maks` tanggal
 * ditarik dalam satu panggilan supaya permintaan layar tidak menunggu
 * puluhan panggilan SADAR — sisanya dilengkapi cron & panggilan berikut.
 */
export async function sinkronAbsensiRentang(dari: string, sampai: string, maks = 6): Promise<HasilSinkron[]> {
  if (!sadarSiap()) return [];
  const hariIni = tanggalWibHariIni();
  const db = supabase();
  const { data: sudah } = await db
    .from("absensi_sinkron")
    .select("tanggal, pada")
    .gte("tanggal", dari)
    .lte("tanggal", sampai);
  const segar = new Map((sudah ?? []).map((s) => [String(s.tanggal), Date.parse(String(s.pada))]));
  const batasSegar = Date.now() - SEGAR_LAMPAU_JAM * 3600_000;

  const hasil: HasilSinkron[] = [];
  // Terbaru dulu: tanggal dekat lebih sering dilihat.
  for (let t = Date.parse(`${sampai}T00:00:00Z`); t >= Date.parse(`${dari}T00:00:00Z`); t -= 86_400_000) {
    if (hasil.length >= maks) break;
    const tanggal = new Date(t).toISOString().slice(0, 10);
    if (tanggal > hariIni) continue;
    if (tanggal === hariIni) {
      hasil.push(await sinkronAbsensiHariIni());
      continue;
    }
    const pada = segar.get(tanggal);
    if (pada !== undefined && pada > batasSegar) continue;
    hasil.push(await sinkronAbsensiTanggal(tanggal));
  }
  return hasil;
}

/** Berapa orang SADAR pada tanggal itu yang belum punya akun SuperApp. */
export async function jumlahTidakCocok(tanggal: string): Promise<number> {
  const { count } = await supabase()
    .from("absensi_sadar")
    .select("id", { count: "exact", head: true })
    .eq("tanggal", tanggal)
    .is("user_id", null);
  return count ?? 0;
}

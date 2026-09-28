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
import { denganCache, hapusCacheBersama } from "@/lib/cache-bersama";
import { ambilAbsensiSadar, sadarSiap, waktuWibKeIso, type BarisSadar } from "@/lib/sadar";
import { beriKoin } from "@/lib/koin";
import { catatTugasStreak } from "@/lib/streak";
import { tanggalWibHariIni } from "@/lib/format";
import { semuaPemetaan } from "@/lib/sadar-pemetaan";

const JEDA_HARI_INI_DETIK = 60;
const SEGAR_LAMPAU_JAM = 6;

// ------------------------------------------------------------
// JALUR LANGSUNG (24 Sep 2026): database cloud belum punya tabel cermin
// SADAR (sql/53). Sampai migrasi itu dijalankan, sinkron dilewati dan
// layar yang butuh data HARI INI membacanya langsung dari API SADAR
// (dikekang 60 dtk lewat cache bersama). Riwayat hari lampau baru
// tersedia setelah sql/53 dijalankan.
// ------------------------------------------------------------

export const PESAN_TANPA_TABEL =
  "Tabel cermin SADAR belum dibuat (sql/53) — data hari ini dibaca langsung dari SADAR.";

let cekTabel: { ada: boolean; pada: number } | null = null;

/** Tabel cermin SADAR (sql/53) sudah ada? Dicek ulang tiap 5 menit per proses. */
export async function tabelSadarAda(): Promise<boolean> {
  if (cekTabel && Date.now() - cekTabel.pada < 300_000) return cekTabel.ada;
  const { error } = await supabase().from("absensi_sadar").select("id").limit(1);
  // PGRST205 (PostgREST) / 42P01 (Postgres) = tabel belum ada. Galat lain
  // (jaringan) dianggap ADA supaya jalur normal yang memutuskan.
  const ada = !(error && (error.code === "PGRST205" || error.code === "42P01"));
  cekTabel = { ada, pada: Date.now() };
  return ada;
}

/** Absensi SADAR satu tanggal langsung dari API (tanpa tabel). Tidak pernah melempar. */
export async function sadarLangsung(tanggal: string): Promise<{ baris: BarisSadar[]; galat: string }> {
  if (!sadarSiap()) return { baris: [], galat: "SADAR_API_TOKEN belum diatur." };
  const hariIni = tanggalWibHariIni();
  const ttl = tanggal === hariIni ? JEDA_HARI_INI_DETIK : SEGAR_LAMPAU_JAM * 3600;
  return denganCache(`sadar:langsung:${tanggal}`, ttl, async () => {
    try {
      const r = await ambilAbsensiSadar(tanggal === hariIni ? undefined : tanggal);
      // `mentah` dibuang: tidak dipakai jalur ini dan hanya membengkakkan cache.
      const baris = r.baris.filter((b) => b.tanggal === tanggal).map((b) => ({ ...b, mentah: {} }));
      return { baris, galat: "" };
    } catch (e) {
      return { baris: [] as BarisSadar[], galat: e instanceof Error ? e.message : "Gagal menghubungi SADAR." };
    }
  });
}

export type HasilSinkron = {
  tanggal: string;
  jalan: boolean;
  jumlah: number;
  cocok: number;
  tidak_cocok: number;
  baru_masuk: number;
  galat?: string;
};

/**
 * Kode pegawai SADAR → id akun SuperApp. Pemetaan MANUAL (dipasang HR
 * dari Database Anggota — tabel sadar_pemetaan atau, bila belum ada,
 * pengaturan_sistem; lib/sadar-pemetaan) menang; sisanya lewat email.
 */
export async function petaKodeKeUser(baris: Pick<BarisSadar, "kode" | "email">[]): Promise<Map<string, number>> {
  const hasil = new Map<string, number>();
  const kode = new Set(baris.map((b) => b.kode).filter(Boolean));
  if (kode.size === 0) return hasil;
  // Akun yang sudah dipasang manual (ke kode mana pun) tidak boleh diambil
  // lagi lewat email — satu akun satu pegawai.
  const dipetakan = new Set<number>();
  for (const m of await semuaPemetaan()) {
    dipetakan.add(m.user_id);
    if (kode.has(m.kode_pegawai)) hasil.set(m.kode_pegawai, m.user_id);
  }
  const sisa = baris.filter((b) => !hasil.has(b.kode));
  const lewatEmail = await petaEmailKeUser(sisa.map((b) => b.email));
  for (const b of sisa) {
    const uid = lewatEmail.get(b.email);
    // Akun yang sudah dipetakan manual ke kode lain tidak boleh diambil
    // lagi lewat email — satu akun satu pegawai.
    if (uid !== undefined && !dipetakan.has(uid)) hasil.set(b.kode, uid);
  }
  return hasil;
}

/** Cocokkan email SADAR → id akun SuperApp (huruf kecil). */
export async function petaEmailKeUser(email: string[]): Promise<Map<string, number>> {
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
  // Tanpa tabel cermin tidak ada yang bisa ditulis — jangan panggil SADAR sia-sia.
  if (!(await tabelSadarAda())) return { ...hasil, galat: PESAN_TANPA_TABEL };
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
  const peta = await petaKodeKeUser(baris);

  // 1. Cermin mentah — semua orang, cocok atau belum.
  if (baris.length > 0) {
    const { error } = await db.from("absensi_sadar").upsert(
      baris.map((b) => ({
        kode_pegawai: b.kode,
        tanggal: b.tanggal,
        email: b.email,
        nama: b.nama,
        user_id: peta.get(b.kode) ?? null,
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
  const cocok = baris.filter((b) => peta.has(b.kode));
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
    const uid = peta.get(b.kode)!;
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
  if (!(await tabelSadarAda())) return [];
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

/**
 * Setelah HR memasang/melepas pemetaan: tulis ulang user_id pada cermin
 * mentah kode itu (60 hari) dan cermin `absensi`-nya — tanpa menunggu
 * tarikan berikutnya. userId null = lepas: baris absensi dari kode itu
 * dibuang, mentahnya tetap (bukan milik siapa-siapa lagi).
 */
export async function cerminkanUlangKode(kode: string, userId: number | null): Promise<void> {
  // Tanpa tabel cermin (sql/53) tidak ada yang perlu ditulis ulang: layar
  // membaca SADAR langsung dan memakai pemetaan terbaru saat itu juga.
  if (!(await tabelSadarAda())) return;
  const db = supabase();
  const awal = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  const { data: mentah } = await db
    .from("absensi_sadar")
    .select("tanggal, status, tipe, verifikasi, jam_masuk, jam_pulang, user_id")
    .eq("kode_pegawai", kode)
    .gte("tanggal", awal);
  // Baris absensi milik pemilik lama (bila kode ini pindah orang) dibuang.
  await db.from("absensi").delete().eq("sumber", "sadar").eq("kode_pegawai", kode);
  await db.from("absensi_sadar").update({ user_id: userId }).eq("kode_pegawai", kode);
  if (userId !== null && mentah && mentah.length > 0) {
    const cermin: {
      user_id: number;
      tanggal_wib: string;
      sumber: "sadar";
      kode_pegawai: string;
      status_sadar: string;
      tipe_sadar: string;
      verifikasi_sadar: string;
      jenis: "masuk" | "pulang";
      waktu: string;
    }[] = [];
    for (const m of mentah) {
      const dasar = {
        user_id: userId,
        tanggal_wib: String(m.tanggal),
        sumber: "sadar" as const,
        kode_pegawai: kode,
        status_sadar: String(m.status ?? ""),
        tipe_sadar: String(m.tipe ?? ""),
        verifikasi_sadar: String(m.verifikasi ?? ""),
      };
      const masuk = m.jam_masuk ? waktuWibKeIso(String(m.tanggal), String(m.jam_masuk)) : null;
      const pulang = m.jam_pulang ? waktuWibKeIso(String(m.tanggal), String(m.jam_pulang)) : null;
      if (masuk) cermin.push({ ...dasar, jenis: "masuk" as const, waktu: masuk });
      if (pulang) cermin.push({ ...dasar, jenis: "pulang" as const, waktu: pulang });
    }
    if (cermin.length > 0) {
      const { error } = await db.from("absensi").upsert(cermin, { onConflict: "user_id,tanggal_wib,jenis" });
      if (error) console.error("[absensi-sadar] cermin ulang:", error.message);
    }
  }
  // Tarikan hari ini berikutnya harus menghitung ulang, bukan memakai cache.
  await hapusCacheBersama(`sadar:sinkron:${tanggalWibHariIni()}`);
}

export type PegawaiSadar = { kode: string; nama: string; email: string; terakhir: string };

/** Berapa hari ke belakang daftar pegawai SADAR disusun (jalur langsung). */
const HARI_DAFTAR_PEGAWAI = 14;

/**
 * Pegawai SADAR yang muncul belakangan ini (unik per kode, data terbaru).
 * Dengan tabel cermin: 31 hari dari absensi_sadar. Tanpa tabel (cloud
 * saat ini): gabungan 14 hari langsung dari API SADAR — dulu HANYA hari
 * ini, sehingga pegawai yang libur/tidak absen hari itu tidak bisa
 * dipasangkan sama sekali (28 Sep 2026).
 */
export async function daftarPegawaiSadar(): Promise<Map<string, PegawaiSadar>> {
  const peta = new Map<string, PegawaiSadar>();
  if (!(await tabelSadarAda())) {
    const hariIni = tanggalWibHariIni();
    const tanggal = Array.from({ length: HARI_DAFTAR_PEGAWAI }, (_, i) =>
      new Date(Date.parse(`${hariIni}T00:00:00Z`) - i * 86_400_000).toISOString().slice(0, 10),
    );
    // Terbaru dulu: nama/email terakhir yang dipakai menang. 4 bersamaan,
    // hari lampau di-cache 6 jam, jadi hanya pembukaan pertama yang lambat.
    for (let i = 0; i < tanggal.length; i += 4) {
      const hasil = await Promise.all(tanggal.slice(i, i + 4).map((t) => sadarLangsung(t)));
      for (const { baris } of hasil) {
        for (const b of baris) {
          if (!b.kode || peta.has(b.kode)) continue;
          peta.set(b.kode, { kode: b.kode, nama: b.nama, email: String(b.email ?? "").toLowerCase(), terakhir: b.tanggal });
        }
      }
    }
    return peta;
  }
  const awal = new Date(Date.now() - 31 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await supabase()
    .from("absensi_sadar")
    .select("kode_pegawai, nama, email, tanggal")
    .gte("tanggal", awal)
    .order("tanggal", { ascending: false })
    .limit(10000);
  for (const r of data ?? []) {
    const kode = String(r.kode_pegawai);
    if (!peta.has(kode)) {
      peta.set(kode, { kode, nama: String(r.nama ?? ""), email: String(r.email ?? "").toLowerCase(), terakhir: String(r.tanggal) });
    }
  }
  return peta;
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

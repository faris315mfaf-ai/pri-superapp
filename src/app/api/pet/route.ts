// /api/pet — MODUL PET ROBOT (percobaan, KHUSUS MASTER; 3 Sep 2026).
// Terinspirasi POU: satu robot per pengguna yang dirawat (makan, main,
// mandi, tidur), naik level dari XP, dan didandani dengan aksesoris yang
// dibeli memakai koin. Aturan permainannya ada di lib/pet.ts (dipakai klien
// juga); di sini hanya penyimpanan, validasi, dan buku besar koin.
//
// GET                       → state robot (kebutuhan sudah dikurangi seiring waktu)
// POST { aksi, ... }        → pilih | nama | rawat | tidur | bangun | beli |
//                             pasang | lepas | ganti_jenis | reset
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { saldoKoin } from "@/lib/koin";
import {
  aksesorisDariKode,
  EFEK_PERAWATAN,
  HADIAH_HARIAN_KOIN,
  hitungPenurunan,
  levelDariXp,
  NAMA_MAKS,
  suasanaDari,
  terapkanPerawatan,
  type JenisRobot,
  type Kebutuhan,
  type Perawatan,
  type PetState,
  type SlotAksesoris,
} from "@/lib/pet";

export const dynamic = "force-dynamic";

type Baris = {
  user_id: number;
  jenis: JenisRobot;
  nama: string;
  kenyang: number;
  energi: number;
  senang: number;
  bersih: number;
  tidur: boolean;
  xp: number;
  aksesoris_dimiliki: string[] | null;
  aksesoris_terpasang: Record<string, string> | null;
  hadiah_terakhir: string | null;
  terakhir_dihitung: string;
  dibuat_pada: string;
};

const KOLOM = "user_id, jenis, nama, kenyang, energi, senang, bersih, tidur, xp, aksesoris_dimiliki, aksesoris_terpasang, hadiah_terakhir, terakhir_dihitung, dibuat_pada";
const SLOT_SAH = new Set<string>(["kepala", "mata", "leher", "badan", "punggung", "tangan", "aura"]);

function galat(pesan: string, status = 400): never {
  throw Object.assign(new Error(pesan), { status });
}

function tanggalWib(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

async function pastikanMaster(request: Request) {
  const user = await pastikanMasuk(request);
  if (user.role !== "master") galat("Modul Pet Robot masih percobaan — khusus master.", 403);
  return user;
}

function bersihkanNama(mentah: unknown, jenis: JenisRobot): string {
  const n = String(mentah ?? "").replace(/\s+/g, " ").trim().slice(0, NAMA_MAKS);
  return n || (jenis === "pria" ? "Robi" : "Rina");
}

function kebutuhanDari(b: Baris): Kebutuhan {
  return { kenyang: b.kenyang, energi: b.energi, senang: b.senang, bersih: b.bersih };
}

async function bacaBaris(db: ReturnType<typeof supabase>, userId: number): Promise<Baris | null> {
  const { data } = await db.from("pet_robot").select(KOLOM).eq("user_id", userId).maybeSingle();
  return (data as Baris | null) ?? null;
}

/** Kurangi kebutuhan sesuai waktu berlalu; simpan bila ≥ 1 menit sejak terakhir. */
async function segarkan(db: ReturnType<typeof supabase>, b: Baris): Promise<Baris> {
  const jam = (Date.now() - Date.parse(b.terakhir_dihitung)) / 3600_000;
  if (!Number.isFinite(jam) || jam < 1 / 60) return b;
  const k = hitungPenurunan(kebutuhanDari(b), b.tidur, jam);
  // Energi penuh saat tidur → bangun sendiri.
  const tidur = b.tidur && k.energi < 100;
  const kini = new Date().toISOString();
  await db
    .from("pet_robot")
    .update({ ...k, tidur, terakhir_dihitung: kini, diperbarui_pada: kini })
    .eq("user_id", b.user_id);
  return { ...b, ...k, tidur, terakhir_dihitung: kini };
}

function keState(b: Baris | null, saldo: number): PetState {
  if (!b) {
    return {
      ada: false,
      jenis: null,
      nama: "",
      kebutuhan: { kenyang: 0, energi: 0, senang: 0, bersih: 0 },
      tidur: false,
      suasana: "biasa",
      xp: 0,
      level: 1,
      xp_di_level: 0,
      xp_berikut: 100,
      dimiliki: [],
      terpasang: {},
      saldo_koin: saldo,
      hadiah_hari_ini: false,
      dibuat_pada: null,
    };
  }
  const k = kebutuhanDari(b);
  const lv = levelDariXp(b.xp);
  const terpasang: Partial<Record<SlotAksesoris, string>> = {};
  for (const [slot, kode] of Object.entries(b.aksesoris_terpasang ?? {})) {
    if (SLOT_SAH.has(slot) && aksesorisDariKode(String(kode))) terpasang[slot as SlotAksesoris] = String(kode);
  }
  return {
    ada: true,
    jenis: b.jenis,
    nama: b.nama,
    kebutuhan: k,
    tidur: b.tidur,
    suasana: suasanaDari(k, b.tidur),
    xp: b.xp,
    level: lv.level,
    xp_di_level: lv.xpDiLevel,
    xp_berikut: lv.xpBerikut,
    dimiliki: (b.aksesoris_dimiliki ?? []).filter((k) => aksesorisDariKode(k)),
    terpasang,
    saldo_koin: saldo,
    hadiah_hari_ini: b.hadiah_terakhir === tanggalWib(),
    dibuat_pada: b.dibuat_pada,
  };
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMaster(request);
    const db = supabase();
    const uid = Number(user.id);
    let b = await bacaBaris(db, uid);
    if (b) b = await segarkan(db, b);
    return keState(b, await saldoKoin(uid));
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMaster(request);
    const db = supabase();
    const uid = Number(user.id);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const aksi = String(body.aksi ?? "");
    const kini = new Date().toISOString();

    // ---------- Adopsi ----------
    if (aksi === "pilih") {
      const jenis = body.jenis === "wanita" ? "wanita" : body.jenis === "pria" ? "pria" : null;
      if (!jenis) galat("Pilih robot pria atau wanita.");
      const ada = await bacaBaris(db, uid);
      if (ada) galat("Anda sudah punya robot. Pakai 'Ganti jenis' atau 'Mulai ulang'.", 409);
      const { error } = await db.from("pet_robot").insert({
        user_id: uid,
        jenis,
        nama: bersihkanNama(body.nama, jenis),
        terakhir_dihitung: kini,
        diperbarui_pada: kini,
      });
      if (error) throw new Error("Gagal mengadopsi robot.");
      const b = await bacaBaris(db, uid);
      return { ...keState(b, await saldoKoin(uid)), pesan: `${b?.nama ?? "Robot"} resmi jadi peliharaan Anda!` };
    }

    let b = await bacaBaris(db, uid);
    if (!b) galat("Belum punya robot — adopsi dulu.", 404);
    b = await segarkan(db, b);

    if (aksi === "reset") {
      // Mulai ulang total: robot & aksesorisnya hilang (koin yang sudah dibelanjakan tidak kembali).
      const { error } = await db.from("pet_robot").delete().eq("user_id", uid);
      if (error) throw new Error("Gagal memulai ulang.");
      return { ...keState(null, await saldoKoin(uid)), pesan: "Robot dilepas. Anda bisa mengadopsi yang baru." };
    }

    if (aksi === "nama") {
      const nama = bersihkanNama(body.nama, b.jenis);
      await db.from("pet_robot").update({ nama, diperbarui_pada: kini }).eq("user_id", uid);
      b.nama = nama;
      return { ...keState(b, await saldoKoin(uid)), pesan: `Nama diganti menjadi ${nama}.` };
    }

    if (aksi === "ganti_jenis") {
      const jenis = body.jenis === "wanita" ? "wanita" : body.jenis === "pria" ? "pria" : null;
      if (!jenis) galat("Pilih robot pria atau wanita.");
      if (jenis === b.jenis) galat("Robot Anda memang jenis itu.");
      await db.from("pet_robot").update({ jenis, diperbarui_pada: kini }).eq("user_id", uid);
      b.jenis = jenis;
      return { ...keState(b, await saldoKoin(uid)), pesan: "Jenis robot diganti — aksesoris dan level tetap." };
    }

    if (aksi === "tidur" || aksi === "bangun") {
      const tidur = aksi === "tidur";
      if (tidur && b.tidur) galat(`${b.nama} sudah tidur.`);
      if (!tidur && !b.tidur) galat(`${b.nama} sedang tidak tidur.`);
      await db.from("pet_robot").update({ tidur, terakhir_dihitung: kini, diperbarui_pada: kini }).eq("user_id", uid);
      b.tidur = tidur;
      b.terakhir_dihitung = kini;
      return { ...keState(b, await saldoKoin(uid)), pesan: tidur ? `${b.nama} tidur… energinya pulih 15 per jam.` : `${b.nama} bangun!` };
    }

    if (aksi === "rawat") {
      const jenis = String(body.jenis ?? "") as Perawatan;
      if (!(jenis in EFEK_PERAWATAN)) galat("Perawatan tidak dikenal.");
      if (b.tidur) galat(`${b.nama} sedang tidur — bangunkan dulu.`);
      const k = kebutuhanDari(b);
      if (jenis === "main" && k.energi < 15) galat(`Energi ${b.nama} kurang untuk bermain — biarkan tidur dulu.`);
      if (jenis === "makan" && k.kenyang >= 100) galat(`${b.nama} sudah kenyang.`);
      if (jenis === "mandi" && k.bersih >= 100) galat(`${b.nama} sudah bersih berkilau.`);
      const baru = terapkanPerawatan(k, jenis);
      const xp = b.xp + EFEK_PERAWATAN[jenis].xp;
      // Hadiah koin harian: perawatan pertama tiap hari WIB (idempoten lewat referensi tanggal).
      const hariIni = tanggalWib();
      let dapatHadiah = false;
      if (b.hadiah_terakhir !== hariIni) {
        const { error: eKoin } = await db
          .from("koin_transaksi")
          .upsert({ user_id: uid, jumlah: HADIAH_HARIAN_KOIN, aktivitas: "pet_harian", referensi: hariIni }, { onConflict: "user_id,aktivitas,referensi", ignoreDuplicates: true });
        if (!eKoin) dapatHadiah = true;
      }
      const { error } = await db
        .from("pet_robot")
        .update({ ...baru, xp, terakhir_dihitung: kini, diperbarui_pada: kini, ...(dapatHadiah ? { hadiah_terakhir: hariIni } : {}) })
        .eq("user_id", uid);
      if (error) throw new Error("Gagal menyimpan perawatan.");
      const sesudah = { ...b, ...baru, xp, terakhir_dihitung: kini, hadiah_terakhir: dapatHadiah ? hariIni : b.hadiah_terakhir };
      const naikLevel = levelDariXp(xp).level > levelDariXp(b.xp).level;
      const pesan =
        `${EFEK_PERAWATAN[jenis].label}: +${EFEK_PERAWATAN[jenis].xp} XP` +
        (naikLevel ? ` · NAIK ke level ${levelDariXp(xp).level}!` : "") +
        (dapatHadiah ? ` · hadiah harian +${HADIAH_HARIAN_KOIN} koin` : "");
      return { ...keState(sesudah, await saldoKoin(uid)), pesan };
    }

    if (aksi === "beli") {
      const item = aksesorisDariKode(String(body.kode ?? ""));
      if (!item) galat("Aksesoris tidak ada di toko.");
      const dimiliki = b.aksesoris_dimiliki ?? [];
      if (dimiliki.includes(item.kode)) galat(`${item.nama} sudah Anda miliki.`, 409);
      const saldo = await saldoKoin(uid);
      if (saldo < item.harga) galat(`Koin kurang: butuh ${item.harga}, saldo ${saldo}.`);
      // Buku besar koin: baris negatif, unik per (user, aktivitas, referensi) → tak bisa dobel.
      const { error: eKoin } = await db
        .from("koin_transaksi")
        .insert({ user_id: uid, jumlah: -item.harga, aktivitas: "pet_beli", referensi: item.kode });
      if (eKoin) {
        if (eKoin.code === "23505") galat(`${item.nama} sudah pernah dibeli.`, 409);
        throw new Error("Gagal memotong koin.");
      }
      const terpasang = { ...(b.aksesoris_terpasang ?? {}), [item.slot]: item.kode };
      const { error } = await db
        .from("pet_robot")
        .update({ aksesoris_dimiliki: [...dimiliki, item.kode], aksesoris_terpasang: terpasang, diperbarui_pada: kini })
        .eq("user_id", uid);
      if (error) throw new Error("Gagal menyimpan aksesoris.");
      const sesudah = { ...b, aksesoris_dimiliki: [...dimiliki, item.kode], aksesoris_terpasang: terpasang };
      return { ...keState(sesudah, await saldoKoin(uid)), pesan: `${item.nama} dibeli (−${item.harga} koin) dan langsung dipasang.` };
    }

    if (aksi === "pasang") {
      const item = aksesorisDariKode(String(body.kode ?? ""));
      if (!item) galat("Aksesoris tidak dikenal.");
      if (!(b.aksesoris_dimiliki ?? []).includes(item.kode)) galat(`${item.nama} belum dimiliki — beli dulu di toko.`);
      const terpasang = { ...(b.aksesoris_terpasang ?? {}), [item.slot]: item.kode };
      await db.from("pet_robot").update({ aksesoris_terpasang: terpasang, diperbarui_pada: kini }).eq("user_id", uid);
      return { ...keState({ ...b, aksesoris_terpasang: terpasang }, await saldoKoin(uid)), pesan: `${item.nama} dipasang.` };
    }

    if (aksi === "lepas") {
      const slot = String(body.slot ?? "");
      if (!SLOT_SAH.has(slot)) galat("Slot tidak dikenal.");
      const terpasang = { ...(b.aksesoris_terpasang ?? {}) };
      delete terpasang[slot];
      await db.from("pet_robot").update({ aksesoris_terpasang: terpasang, diperbarui_pada: kini }).eq("user_id", uid);
      return { ...keState({ ...b, aksesoris_terpasang: terpasang }, await saldoKoin(uid)), pesan: "Aksesoris dilepas." };
    }

    galat("aksi tidak dikenal.");
  });
}

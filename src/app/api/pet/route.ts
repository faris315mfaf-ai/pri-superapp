// /api/pet — MODUL PET ROBOT (3 Sep 2026; TERBUKA untuk semua pengguna yang login).
// Terinspirasi POU: satu robot per pengguna yang dirawat (makan dari inventori,
// main, mandi, tidur), naik level dari XP, dan didandani dengan aksesoris /
// sparepart yang dibeli memakai koin. Aturan permainannya ada di lib/pet.ts
// (dipakai klien juga); di sini hanya penyimpanan, validasi, buku besar koin.
//
// GET                  → state robot saya (kebutuhan sudah dikurangi seiring waktu)
// GET ?user_id=<id>    → robot orang lain untuk ditampilkan (siapa pun yang login;
//                        tanpa saldo/inventori) — dipakai profil publik di chat.
// POST { aksi, ... }   → pilih | nama | rawat | makan | tidur | bangun | beli |
//                        pasang | lepas | pasang_sparepart | lepas_sparepart |
//                        pasang_skin | lepas_skin | warna | ganti_jenis | reset
// v3 (3 Sep 2026): SKIN EKSKLUSIF SEASONAL (beli hanya saat musimnya, dimiliki
// selamanya) & WARNA CUSTOM (dibuka sekali 300 koin, lalu warna bebas diganti).
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { saldoKoin } from "@/lib/koin";
import {
  aksesorisDariKode,
  EFEK_PERAWATAN,
  HADIAH_HARIAN_KOIN,
  HARGA_WARNA_CUSTOM,
  hitungPenurunan,
  KODE_WARNA_CUSTOM,
  labelMusimSkin,
  levelDariXp,
  makananDariKode,
  NAMA_MAKS,
  skinDariKode,
  skinTersedia,
  sparepartDariKode,
  suasanaDari,
  terapkanEfek,
  vitalitasDari,
  warnaSah,
  XP_MAKAN,
  type BagianSparepart,
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
  sparepart_dimiliki: string[] | null;
  sparepart_terpasang: Record<string, string> | null;
  makanan: Record<string, number> | null;
  skin_dimiliki: string[] | null;
  skin_terpasang: string | null;
  warna_terbuka: boolean | null;
  warna_custom: string | null;
  aktivitas_hari_ini: number | null;
  aktivitas_tanggal: string | null;
  hadiah_terakhir: string | null;
  terakhir_dihitung: string;
  dibuat_pada: string;
};

const KOLOM =
  "user_id, jenis, nama, kenyang, energi, senang, bersih, tidur, xp, aksesoris_dimiliki, aksesoris_terpasang, sparepart_dimiliki, sparepart_terpasang, makanan, skin_dimiliki, skin_terpasang, warna_terbuka, warna_custom, aktivitas_hari_ini, aktivitas_tanggal, hadiah_terakhir, terakhir_dihitung, dibuat_pada";
const SLOT_SAH = new Set<string>([
  "kepala",
  "mata",
  "leher",
  "badan",
  "punggung",
  "tangan",
  "aura",
]);
const BAGIAN_SAH = new Set<string>([
  "kepala",
  "mata",
  "tubuh",
  "kaki",
  "tangan",
]);

function galat(pesan: string, status = 400): never {
  throw Object.assign(new Error(pesan), { status });
}

function tanggalWib(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

function bersihkanNama(mentah: unknown, jenis: JenisRobot): string {
  const n = String(mentah ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAMA_MAKS);
  return n || (jenis === "pria" ? "Robi" : "Rina");
}

function kebutuhanDari(b: Baris): Kebutuhan {
  return {
    kenyang: b.kenyang,
    energi: b.energi,
    senang: b.senang,
    bersih: b.bersih,
  };
}

/** Aktivitas hari ini (WIB); reset otomatis bila tanggalnya sudah lewat. */
function aktivitasHariIni(b: Baris): number {
  return b.aktivitas_tanggal === tanggalWib()
    ? Number(b.aktivitas_hari_ini ?? 0)
    : 0;
}

async function bacaBaris(
  db: ReturnType<typeof supabase>,
  userId: number,
): Promise<Baris | null> {
  const { data } = await db
    .from("pet_robot")
    .select(KOLOM)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as Baris | null) ?? null;
}

/** Kurangi kebutuhan sesuai waktu berlalu; simpan bila ≥ 1 menit sejak terakhir. */
async function segarkan(
  db: ReturnType<typeof supabase>,
  b: Baris,
): Promise<Baris> {
  const jam = (Date.now() - Date.parse(b.terakhir_dihitung)) / 3600_000;
  if (!Number.isFinite(jam) || jam < 1 / 60) return b;
  const k = hitungPenurunan(
    kebutuhanDari(b),
    b.tidur,
    jam,
    aktivitasHariIni(b),
  );
  // Energi penuh saat tidur → bangun sendiri.
  const tidur = b.tidur && k.energi < 100;
  const kini = new Date().toISOString();
  await db
    .from("pet_robot")
    .update({ ...k, tidur, terakhir_dihitung: kini, diperbarui_pada: kini })
    .eq("user_id", b.user_id);
  return { ...b, ...k, tidur, terakhir_dihitung: kini };
}

function keState(
  b: Baris | null,
  saldo: number,
  pemilik = "",
  publik = false,
): PetState {
  const kosong: Kebutuhan = { kenyang: 0, energi: 0, senang: 0, bersih: 0 };
  if (!b) {
    return {
      ada: false,
      jenis: null,
      nama: "",
      pemilik,
      kebutuhan: kosong,
      tidur: false,
      suasana: "biasa",
      vitalitas: "normal",
      xp: 0,
      level: 1,
      xp_di_level: 0,
      xp_berikut: 100,
      dimiliki: [],
      terpasang: {},
      sparepart_dimiliki: [],
      sparepart_terpasang: {},
      makanan: {},
      skin_dimiliki: [],
      skin_terpasang: null,
      warna_terbuka: false,
      warna_custom: null,
      aktivitas_hari_ini: 0,
      saldo_koin: saldo,
      hadiah_hari_ini: false,
      dibuat_pada: null,
    };
  }
  const k = kebutuhanDari(b);
  const lv = levelDariXp(b.xp);
  const terpasang: Partial<Record<SlotAksesoris, string>> = {};
  for (const [slot, kode] of Object.entries(b.aksesoris_terpasang ?? {})) {
    if (SLOT_SAH.has(slot) && aksesorisDariKode(String(kode)))
      terpasang[slot as SlotAksesoris] = String(kode);
  }
  const sparepartTerpasang: Partial<Record<BagianSparepart, string>> = {};
  for (const [bagian, kode] of Object.entries(b.sparepart_terpasang ?? {})) {
    if (BAGIAN_SAH.has(bagian) && sparepartDariKode(String(kode)))
      sparepartTerpasang[bagian as BagianSparepart] = String(kode);
  }
  const makanan: Record<string, number> = {};
  if (!publik) {
    for (const [kode, n] of Object.entries(b.makanan ?? {})) {
      if (makananDariKode(kode) && Number(n) > 0)
        makanan[kode] = Math.floor(Number(n));
    }
  }
  return {
    ada: true,
    jenis: b.jenis,
    nama: b.nama,
    pemilik,
    kebutuhan: k,
    tidur: b.tidur,
    suasana: suasanaDari(k, b.tidur),
    vitalitas: vitalitasDari(k, b.tidur),
    xp: b.xp,
    level: lv.level,
    xp_di_level: lv.xpDiLevel,
    xp_berikut: lv.xpBerikut,
    dimiliki: publik
      ? []
      : (b.aksesoris_dimiliki ?? []).filter((x) => aksesorisDariKode(x)),
    terpasang,
    sparepart_dimiliki: publik
      ? []
      : (b.sparepart_dimiliki ?? []).filter((x) => sparepartDariKode(x)),
    sparepart_terpasang: sparepartTerpasang,
    makanan,
    skin_dimiliki: publik
      ? []
      : (b.skin_dimiliki ?? []).filter((x) => skinDariKode(x)),
    skin_terpasang:
      b.skin_terpasang && skinDariKode(b.skin_terpasang)
        ? b.skin_terpasang
        : null,
    warna_terbuka: publik ? false : Boolean(b.warna_terbuka),
    warna_custom: warnaSah(b.warna_custom),
    aktivitas_hari_ini: aktivitasHariIni(b),
    saldo_koin: publik ? 0 : saldo,
    hadiah_hari_ini: b.hadiah_terakhir === tanggalWib(),
    dibuat_pada: b.dibuat_pada,
  };
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const db = supabase();
    const lihat = Number(new URL(request.url).searchParams.get("user_id") ?? 0);

    // Robot orang lain — tampilan saja (profil publik di chat).
    if (lihat > 0 && lihat !== Number(user.id)) {
      const [b, { data: orang }] = await Promise.all([
        bacaBaris(db, lihat),
        db.from("app_user").select("nama").eq("id", lihat).maybeSingle(),
      ]);
      const segar = b ? await segarkan(db, b) : null;
      return keState(segar, 0, String(orang?.nama ?? ""), true);
    }

    const uid = Number(user.id);
    let b = await bacaBaris(db, uid);
    if (b) b = await segarkan(db, b);
    return keState(b, await saldoKoin(uid), user.nama);
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const db = supabase();
    const uid = Number(user.id);
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const aksi = String(body.aksi ?? "");
    const kini = new Date().toISOString();
    const hariIni = tanggalWib();
    const balas = async (b: Baris | null, pesan: string) => ({
      ...keState(b, await saldoKoin(uid), user.nama),
      pesan,
    });

    // ---------- Adopsi ----------
    if (aksi === "pilih") {
      const jenis =
        body.jenis === "wanita"
          ? "wanita"
          : body.jenis === "pria"
            ? "pria"
            : null;
      if (!jenis) galat("Pilih robot pria atau wanita.");
      const ada = await bacaBaris(db, uid);
      if (ada)
        galat(
          "Anda sudah punya robot. Pakai 'Ganti jenis' atau 'Mulai ulang'.",
          409,
        );
      const { error } = await db.from("pet_robot").insert({
        user_id: uid,
        jenis,
        nama: bersihkanNama(body.nama, jenis),
        terakhir_dihitung: kini,
        diperbarui_pada: kini,
      });
      if (error) throw new Error("Gagal mengadopsi robot.");
      const b = await bacaBaris(db, uid);
      return balas(b, `${b?.nama ?? "Robot"} resmi jadi peliharaan Anda!`);
    }

    let b = await bacaBaris(db, uid);
    if (!b) galat("Belum punya robot — adopsi dulu.", 404);
    b = await segarkan(db, b);

    if (aksi === "reset") {
      const { error } = await db.from("pet_robot").delete().eq("user_id", uid);
      if (error) throw new Error("Gagal memulai ulang.");
      return balas(null, "Robot dilepas. Anda bisa mengadopsi yang baru.");
    }

    if (aksi === "nama") {
      const nama = bersihkanNama(body.nama, b.jenis);
      await db
        .from("pet_robot")
        .update({ nama, diperbarui_pada: kini })
        .eq("user_id", uid);
      return balas({ ...b, nama }, `Nama diganti menjadi ${nama}.`);
    }

    if (aksi === "ganti_jenis") {
      const jenis =
        body.jenis === "wanita"
          ? "wanita"
          : body.jenis === "pria"
            ? "pria"
            : null;
      if (!jenis) galat("Pilih robot pria atau wanita.");
      if (jenis === b.jenis) galat("Robot Anda memang jenis itu.");
      await db
        .from("pet_robot")
        .update({ jenis, diperbarui_pada: kini })
        .eq("user_id", uid);
      return balas(
        { ...b, jenis },
        "Jenis robot diganti — aksesoris, sparepart, dan level tetap.",
      );
    }

    if (aksi === "tidur" || aksi === "bangun") {
      const tidur = aksi === "tidur";
      if (tidur && b.tidur) galat(`${b.nama} sudah tidur.`);
      if (!tidur && !b.tidur) galat(`${b.nama} sedang tidak tidur.`);
      await db
        .from("pet_robot")
        .update({ tidur, terakhir_dihitung: kini, diperbarui_pada: kini })
        .eq("user_id", uid);
      return balas(
        { ...b, tidur, terakhir_dihitung: kini },
        tidur
          ? `${b.nama} tidur… energinya pulih 15 per jam.`
          : `${b.nama} bangun!`,
      );
    }

    // Hadiah koin harian: aktivitas pertama tiap hari WIB (idempoten lewat referensi tanggal).
    async function hadiahHarian(): Promise<boolean> {
      if (!b || b.hadiah_terakhir === hariIni) return false;
      const { error } = await db.from("koin_transaksi").upsert(
        {
          user_id: uid,
          jumlah: HADIAH_HARIAN_KOIN,
          aktivitas: "pet_harian",
          referensi: hariIni,
        },
        { onConflict: "user_id,aktivitas,referensi", ignoreDuplicates: true },
      );
      return !error;
    }
    const aktivitasBaru = aktivitasHariIni(b) + 1;

    if (aksi === "makan") {
      const item = makananDariKode(String(body.kode ?? ""));
      if (!item) galat("Makanan tidak dikenal.");
      if (b.tidur) galat(`${b.nama} sedang tidur — bangunkan dulu.`);
      const inv = { ...(b.makanan ?? {}) };
      const sisa = Math.floor(Number(inv[item.kode] ?? 0));
      if (sisa <= 0)
        galat(
          `${item.nama} tidak ada di inventori — beli dulu di Toko Makanan.`,
        );
      const k = kebutuhanDari(b);
      if (
        k.kenyang >= 100 &&
        (item.efek.kenyang ?? 0) > 0 &&
        !item.efek.energi &&
        !item.efek.senang
      )
        galat(`${b.nama} sudah kenyang.`);
      const baru = terapkanEfek(k, item.efek);
      if (sisa - 1 > 0) inv[item.kode] = sisa - 1;
      else delete inv[item.kode];
      const xp = b.xp + XP_MAKAN;
      const dapatHadiah = await hadiahHarian();
      const { error } = await db
        .from("pet_robot")
        .update({
          ...baru,
          xp,
          makanan: inv,
          aktivitas_hari_ini: aktivitasBaru,
          aktivitas_tanggal: hariIni,
          terakhir_dihitung: kini,
          diperbarui_pada: kini,
          ...(dapatHadiah ? { hadiah_terakhir: hariIni } : {}),
        })
        .eq("user_id", uid);
      if (error) throw new Error("Gagal menyimpan makan.");
      const sesudah: Baris = {
        ...b,
        ...baru,
        xp,
        makanan: inv,
        aktivitas_hari_ini: aktivitasBaru,
        aktivitas_tanggal: hariIni,
        terakhir_dihitung: kini,
        hadiah_terakhir: dapatHadiah ? hariIni : b.hadiah_terakhir,
      };
      const efek = Object.entries(item.efek)
        .map(([n, v]) => `${v > 0 ? "+" : ""}${v} ${n}`)
        .join(", ");
      return balas(
        sesudah,
        `${b.nama} makan ${item.nama} ${item.emoji} (${efek}) · +${XP_MAKAN} XP` +
          (levelDariXp(xp).level > levelDariXp(b.xp).level
            ? ` · NAIK ke level ${levelDariXp(xp).level}!`
            : "") +
          (dapatHadiah ? ` · hadiah harian +${HADIAH_HARIAN_KOIN} koin` : ""),
      );
    }

    if (aksi === "rawat") {
      const jenis = String(body.jenis ?? "") as Perawatan;
      if (!(jenis in EFEK_PERAWATAN)) galat("Perawatan tidak dikenal.");
      if (b.tidur) galat(`${b.nama} sedang tidur — bangunkan dulu.`);
      const k = kebutuhanDari(b);
      if (jenis === "main" && k.energi < 15)
        galat(
          `Energi ${b.nama} kurang untuk bermain — beri minuman berenergi atau biarkan tidur dulu.`,
        );
      if (jenis === "mandi" && k.bersih >= 100)
        galat(`${b.nama} sudah bersih berkilau.`);
      const baru = terapkanEfek(k, EFEK_PERAWATAN[jenis].efek);
      const xp = b.xp + EFEK_PERAWATAN[jenis].xp;
      const dapatHadiah = await hadiahHarian();
      const { error } = await db
        .from("pet_robot")
        .update({
          ...baru,
          xp,
          aktivitas_hari_ini: aktivitasBaru,
          aktivitas_tanggal: hariIni,
          terakhir_dihitung: kini,
          diperbarui_pada: kini,
          ...(dapatHadiah ? { hadiah_terakhir: hariIni } : {}),
        })
        .eq("user_id", uid);
      if (error) throw new Error("Gagal menyimpan perawatan.");
      const sesudah: Baris = {
        ...b,
        ...baru,
        xp,
        aktivitas_hari_ini: aktivitasBaru,
        aktivitas_tanggal: hariIni,
        terakhir_dihitung: kini,
        hadiah_terakhir: dapatHadiah ? hariIni : b.hadiah_terakhir,
      };
      return balas(
        sesudah,
        `${EFEK_PERAWATAN[jenis].label}: +${EFEK_PERAWATAN[jenis].xp} XP` +
          (levelDariXp(xp).level > levelDariXp(b.xp).level
            ? ` · NAIK ke level ${levelDariXp(xp).level}!`
            : "") +
          (dapatHadiah ? ` · hadiah harian +${HADIAH_HARIAN_KOIN} koin` : ""),
      );
    }

    if (aksi === "beli") {
      const kode = String(body.kode ?? "");
      const aks = aksesorisDariKode(kode);
      const mkn = makananDariKode(kode);
      const spr = sparepartDariKode(kode);
      const skn = skinDariKode(kode);
      const fiturWarna = kode === KODE_WARNA_CUSTOM;
      const item =
        aks ??
        mkn ??
        spr ??
        (skn
          ? { nama: skn.nama, harga: skn.harga }
          : fiturWarna
            ? { nama: "Warna Custom", harga: HARGA_WARNA_CUSTOM }
            : undefined);
      if (!item) galat("Barang tidak ada di toko.");
      if (aks && (b.aksesoris_dimiliki ?? []).includes(kode))
        galat(`${aks.nama} sudah Anda miliki.`, 409);
      if (spr && (b.sparepart_dimiliki ?? []).includes(kode))
        galat(`${spr.nama} sudah Anda miliki.`, 409);
      if (skn && (b.skin_dimiliki ?? []).includes(kode))
        galat(`${skn.nama} sudah Anda miliki.`, 409);
      // Skin eksklusif: hanya bisa dibeli saat musimnya (bulan WIB); setelah dimiliki tetap selamanya.
      if (skn && !skinTersedia(skn))
        galat(
          `${skn.nama} hanya bisa didapat saat ${skn.musim} (${labelMusimSkin(skn)}).`,
          409,
        );
      if (fiturWarna && b.warna_terbuka)
        galat(
          "Warna custom sudah terbuka — pilih warnanya di Toko → Eksklusif.",
          409,
        );
      const saldo = await saldoKoin(uid);
      if (saldo < item.harga)
        galat(`Koin kurang: butuh ${item.harga}, saldo ${saldo}.`);
      // Buku besar koin: baris negatif. Aksesoris/sparepart/skin/warna unik per kode
      // (anti dobel); makanan boleh berkali-kali → referensi memuat waktu.
      const referensi = mkn ? `${kode}-${Date.now()}` : kode;
      const { error: eKoin } = await db.from("koin_transaksi").insert({
        user_id: uid,
        jumlah: -item.harga,
        aktivitas: "pet_beli",
        referensi,
      });
      if (eKoin) {
        if (eKoin.code === "23505")
          galat(`${item.nama} sudah pernah dibeli.`, 409);
        throw new Error("Gagal memotong koin.");
      }
      let kolom: Record<string, unknown>;
      let sesudah: Baris;
      let pesan: string;
      if (aks) {
        const dimiliki = [...(b.aksesoris_dimiliki ?? []), kode];
        const terpasang = {
          ...(b.aksesoris_terpasang ?? {}),
          [aks.slot]: kode,
        };
        kolom = {
          aksesoris_dimiliki: dimiliki,
          aksesoris_terpasang: terpasang,
        };
        sesudah = {
          ...b,
          aksesoris_dimiliki: dimiliki,
          aksesoris_terpasang: terpasang,
        };
        pesan = `${aks.nama} dibeli (−${aks.harga} koin) dan langsung dipasang.`;
      } else if (spr) {
        const dimiliki = [...(b.sparepart_dimiliki ?? []), kode];
        const terpasang = {
          ...(b.sparepart_terpasang ?? {}),
          [spr.bagian]: kode,
        };
        kolom = {
          sparepart_dimiliki: dimiliki,
          sparepart_terpasang: terpasang,
        };
        sesudah = {
          ...b,
          sparepart_dimiliki: dimiliki,
          sparepart_terpasang: terpasang,
        };
        pesan = `${spr.nama} dipasang (−${spr.harga} koin).`;
      } else if (skn) {
        const dimiliki = [...(b.skin_dimiliki ?? []), kode];
        kolom = { skin_dimiliki: dimiliki, skin_terpasang: kode };
        sesudah = { ...b, skin_dimiliki: dimiliki, skin_terpasang: kode };
        pesan = `Skin eksklusif ${skn.nama} kini milik Anda selamanya (−${skn.harga} koin) dan langsung dipakai!`;
      } else if (fiturWarna) {
        kolom = { warna_terbuka: true };
        sesudah = { ...b, warna_terbuka: true };
        pesan = `Warna custom terbuka (−${HARGA_WARNA_CUSTOM} koin). Pilih warna favorit Anda — bisa diganti kapan saja.`;
      } else {
        const inv = { ...(b.makanan ?? {}) };
        inv[kode] = Math.floor(Number(inv[kode] ?? 0)) + 1;
        kolom = { makanan: inv };
        sesudah = { ...b, makanan: inv };
        pesan = `${mkn!.nama} ${mkn!.emoji} masuk inventori (−${mkn!.harga} koin). Sekarang ${inv[kode]}.`;
      }
      const { error } = await db
        .from("pet_robot")
        .update({ ...kolom, diperbarui_pada: kini })
        .eq("user_id", uid);
      if (error) throw new Error("Gagal menyimpan pembelian.");
      return balas(sesudah, pesan);
    }

    if (aksi === "pasang") {
      const item = aksesorisDariKode(String(body.kode ?? ""));
      if (!item) galat("Aksesoris tidak dikenal.");
      if (!(b.aksesoris_dimiliki ?? []).includes(item.kode))
        galat(`${item.nama} belum dimiliki — beli dulu di toko.`);
      const terpasang = {
        ...(b.aksesoris_terpasang ?? {}),
        [item.slot]: item.kode,
      };
      await db
        .from("pet_robot")
        .update({ aksesoris_terpasang: terpasang, diperbarui_pada: kini })
        .eq("user_id", uid);
      return balas(
        { ...b, aksesoris_terpasang: terpasang },
        `${item.nama} dipasang.`,
      );
    }

    if (aksi === "lepas") {
      const slot = String(body.slot ?? "");
      if (!SLOT_SAH.has(slot)) galat("Slot tidak dikenal.");
      const terpasang = { ...(b.aksesoris_terpasang ?? {}) };
      delete terpasang[slot];
      await db
        .from("pet_robot")
        .update({ aksesoris_terpasang: terpasang, diperbarui_pada: kini })
        .eq("user_id", uid);
      return balas(
        { ...b, aksesoris_terpasang: terpasang },
        "Aksesoris dilepas.",
      );
    }

    if (aksi === "pasang_sparepart") {
      const item = sparepartDariKode(String(body.kode ?? ""));
      if (!item) galat("Sparepart tidak dikenal.");
      if (!(b.sparepart_dimiliki ?? []).includes(item.kode))
        galat(`${item.nama} belum dimiliki — beli dulu di Toko Sparepart.`);
      const terpasang = {
        ...(b.sparepart_terpasang ?? {}),
        [item.bagian]: item.kode,
      };
      await db
        .from("pet_robot")
        .update({ sparepart_terpasang: terpasang, diperbarui_pada: kini })
        .eq("user_id", uid);
      return balas(
        { ...b, sparepart_terpasang: terpasang },
        `${item.nama} dipasang.`,
      );
    }

    if (aksi === "lepas_sparepart") {
      const bagian = String(body.bagian ?? "");
      if (!BAGIAN_SAH.has(bagian)) galat("Bagian tidak dikenal.");
      const terpasang = { ...(b.sparepart_terpasang ?? {}) };
      delete terpasang[bagian];
      await db
        .from("pet_robot")
        .update({ sparepart_terpasang: terpasang, diperbarui_pada: kini })
        .eq("user_id", uid);
      return balas(
        { ...b, sparepart_terpasang: terpasang },
        "Kembali ke bagian bawaan.",
      );
    }

    if (aksi === "pasang_skin") {
      const skn = skinDariKode(String(body.kode ?? ""));
      if (!skn) galat("Skin tidak dikenal.");
      if (!(b.skin_dimiliki ?? []).includes(skn.kode))
        galat(
          `${skn.nama} belum dimiliki — hanya bisa dibeli saat ${skn.musim}.`,
        );
      await db
        .from("pet_robot")
        .update({ skin_terpasang: skn.kode, diperbarui_pada: kini })
        .eq("user_id", uid);
      return balas(
        { ...b, skin_terpasang: skn.kode },
        `${b.nama} memakai skin ${skn.nama}.`,
      );
    }

    if (aksi === "lepas_skin") {
      await db
        .from("pet_robot")
        .update({ skin_terpasang: null, diperbarui_pada: kini })
        .eq("user_id", uid);
      return balas(
        { ...b, skin_terpasang: null },
        "Skin dilepas — kembali ke tampilan biasa.",
      );
    }

    if (aksi === "warna") {
      if (!b.warna_terbuka)
        galat(
          `Fitur warna custom belum dibuka — buka dulu di Toko → Eksklusif (${HARGA_WARNA_CUSTOM} koin).`,
          403,
        );
      const kosong =
        body.warna === null || body.warna === undefined || body.warna === "";
      const w = kosong ? null : warnaSah(body.warna);
      if (!kosong && !w)
        galat("Warna harus kode heksa #RRGGBB, contoh #DC2626.");
      await db
        .from("pet_robot")
        .update({ warna_custom: w, diperbarui_pada: kini })
        .eq("user_id", uid);
      return balas(
        { ...b, warna_custom: w },
        w ? `Warna ${b.nama} diganti ke ${w}.` : "Warna kembali ke bawaan.",
      );
    }

    galat("aksi tidak dikenal.");
  });
}

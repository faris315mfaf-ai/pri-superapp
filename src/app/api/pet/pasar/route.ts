// /api/pet/pasar — PASAR TRADING & LOBI robot (5 Sep 2026).
//
// PASAR: pemilik barang (aksesoris / sparepart / skin robot) menawarkannya
// untuk KOIN atau BARANG lain — tawaran publik, atau langsung ke satu orang
// (dari lobi). Orang lain juga bisa MEMINTA barang seseorang sambil
// menawarkan koin/barang. Pihak yang tidak membuat baris yang menerima;
// penerimaan memindahkan barang (lepas dari pemilik, masuk ke pihak) dan
// koin lewat buku besar koin_transaksi (pasar_beli / pasar_jual).
//
// LOBI: ruangan 1000×600 tempat robot berjalan-jalan. Klien mengirim posisi
// paling cepat tiap 3 detik HANYA saat berada di lobi (POST lobi_posisi
// sekaligus mengembalikan robot lain) — beban server kecil; baris yang
// tidak diperbarui > 60 detik dianggap sudah keluar.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { saldoKoin } from "@/lib/koin";
import { kirimKabar } from "@/lib/notifikasi";
import { bolehPet, PESAN_PET_DIMATIKAN } from "@/lib/pet-akses";
import {
  aksesorisDariKode,
  skinDariKode,
  sparepartDariKode,
  type BagianSparepart,
  type JenisRobot,
  type SlotAksesoris,
} from "@/lib/pet";

export const dynamic = "force-dynamic";

type JenisItemPasar = "aksesoris" | "sparepart" | "skin";

const LEBAR_LOBI = 1000;
const TINGGI_LOBI = 600;
const LOBI_HIDUP_MS = 60_000;

function galat(pesan: string, status = 400): never {
  throw Object.assign(new Error(pesan), { status });
}

type BarisPet = {
  user_id: number;
  jenis: JenisRobot;
  nama: string;
  xp: number;
  aksesoris_dimiliki: string[] | null;
  aksesoris_terpasang: Record<string, string> | null;
  sparepart_dimiliki: string[] | null;
  sparepart_terpasang: Record<string, string> | null;
  skin_dimiliki: string[] | null;
  skin_terpasang: string | null;
  warna_custom: string | null;
};
const KOLOM_PET =
  "user_id, jenis, nama, xp, aksesoris_dimiliki, aksesoris_terpasang, sparepart_dimiliki, sparepart_terpasang, skin_dimiliki, skin_terpasang, warna_custom";

/** Info barang yang bisa diperdagangkan; null bila kode bukan barang tradable. */
function infoItem(kode: string): { jenis: JenisItemPasar; nama: string; harga: number; slot: string } | null {
  const a = aksesorisDariKode(kode);
  if (a) return { jenis: "aksesoris", nama: a.nama, harga: a.harga, slot: a.slot };
  const s = sparepartDariKode(kode);
  if (s) return { jenis: "sparepart", nama: s.nama, harga: s.harga, slot: s.bagian };
  const k = skinDariKode(kode);
  if (k) return { jenis: "skin", nama: k.nama, harga: k.harga, slot: "skin" };
  return null;
}

function punya(b: BarisPet, jenis: JenisItemPasar, kode: string): boolean {
  const daftar = jenis === "aksesoris" ? b.aksesoris_dimiliki : jenis === "sparepart" ? b.sparepart_dimiliki : b.skin_dimiliki;
  return (daftar ?? []).includes(kode);
}

/** Kolom pet_robot setelah barang DILEPAS dari pemilik (dan dicopot bila terpasang). */
function lepasItem(b: BarisPet, jenis: JenisItemPasar, kode: string): Partial<BarisPet> {
  if (jenis === "aksesoris") {
    const terpasang = { ...(b.aksesoris_terpasang ?? {}) };
    for (const [slot, k] of Object.entries(terpasang)) if (k === kode) delete terpasang[slot as SlotAksesoris];
    return { aksesoris_dimiliki: (b.aksesoris_dimiliki ?? []).filter((k) => k !== kode), aksesoris_terpasang: terpasang };
  }
  if (jenis === "sparepart") {
    const terpasang = { ...(b.sparepart_terpasang ?? {}) };
    for (const [bagian, k] of Object.entries(terpasang)) if (k === kode) delete terpasang[bagian as BagianSparepart];
    return { sparepart_dimiliki: (b.sparepart_dimiliki ?? []).filter((k) => k !== kode), sparepart_terpasang: terpasang };
  }
  return { skin_dimiliki: (b.skin_dimiliki ?? []).filter((k) => k !== kode), skin_terpasang: b.skin_terpasang === kode ? null : b.skin_terpasang };
}

/** Kolom pet_robot setelah barang MASUK ke penerima (tanpa dipasang otomatis). */
function tambahItem(b: BarisPet, jenis: JenisItemPasar, kode: string): Partial<BarisPet> {
  const gabung = (d: string[] | null) => (d ?? []).includes(kode) ? (d ?? []) : [...(d ?? []), kode];
  if (jenis === "aksesoris") return { aksesoris_dimiliki: gabung(b.aksesoris_dimiliki) };
  if (jenis === "sparepart") return { sparepart_dimiliki: gabung(b.sparepart_dimiliki) };
  return { skin_dimiliki: gabung(b.skin_dimiliki) };
}

async function bacaPet(uid: number): Promise<BarisPet | null> {
  const { data } = await supabase().from("pet_robot").select(KOLOM_PET).eq("user_id", uid).maybeSingle();
  return (data as BarisPet | null) ?? null;
}

async function namaOrang(ids: number[]): Promise<Map<number, { nama: string; avatar_url: string }>> {
  const peta = new Map<number, { nama: string; avatar_url: string }>();
  const unik = [...new Set(ids.filter((x) => x > 0))];
  if (unik.length === 0) return peta;
  const { data } = await supabase().from("app_user").select("id, nama, avatar_url").in("id", unik);
  for (const o of data ?? []) peta.set(Number(o.id), { nama: String(o.nama ?? ""), avatar_url: String(o.avatar_url ?? "") });
  return peta;
}

type BarisPasar = {
  id: number;
  pemilik_id: number;
  kode_item: string;
  jenis_item: JenisItemPasar;
  minta_koin: number | null;
  minta_item: string | null;
  pihak_id: number | null;
  dibuat_oleh: number;
  pesan: string;
  status: string;
  pembeli_id: number | null;
  dibuat_pada: string;
  selesai_pada: string | null;
};

function bentukTawaran(t: BarisPasar, orang: Map<number, { nama: string; avatar_url: string }>, uid: number) {
  const item = infoItem(t.kode_item);
  const mintaItem = t.minta_item ? infoItem(t.minta_item) : null;
  const pemilik = orang.get(t.pemilik_id);
  const pihak = t.pihak_id ? orang.get(t.pihak_id) : null;
  return {
    id: String(t.id),
    kode_item: t.kode_item,
    jenis_item: t.jenis_item,
    nama_item: item?.nama ?? t.kode_item,
    harga_katalog: item?.harga ?? 0,
    minta_koin: t.minta_koin,
    minta_item: t.minta_item,
    nama_minta_item: mintaItem?.nama ?? t.minta_item,
    pemilik_id: String(t.pemilik_id),
    pemilik_nama: pemilik?.nama ?? "",
    pemilik_avatar: pemilik?.avatar_url ?? "",
    pihak_id: t.pihak_id ? String(t.pihak_id) : null,
    pihak_nama: pihak?.nama ?? "",
    /** "jual" = pemilik menawarkan; "minta" = pihak meminta barang pemilik. */
    arah: t.dibuat_oleh === t.pemilik_id ? "jual" : "minta",
    saya_pemilik: t.pemilik_id === uid,
    saya_pembuat: t.dibuat_oleh === uid,
    /** Saya yang bisa MENERIMA baris ini (bukan pembuatnya, dan sasarannya saya / publik). */
    bisa_terima: t.status === "buka" && t.dibuat_oleh !== uid && (t.dibuat_oleh === t.pemilik_id ? t.pihak_id == null || t.pihak_id === uid : t.pemilik_id === uid),
    pesan: t.pesan,
    status: t.status,
    dibuat_pada: t.dibuat_pada,
    selesai_pada: t.selesai_pada,
  };
}

/** Barang saya yang bisa diperdagangkan (untuk formulir tawaran). */
function inventoriTradable(b: BarisPet | null) {
  if (!b) return [] as { kode: string; jenis: JenisItemPasar; nama: string; harga: number; terpasang: boolean }[];
  const hasil: { kode: string; jenis: JenisItemPasar; nama: string; harga: number; terpasang: boolean }[] = [];
  const aksTerpasang = new Set(Object.values(b.aksesoris_terpasang ?? {}));
  const sprTerpasang = new Set(Object.values(b.sparepart_terpasang ?? {}));
  for (const k of b.aksesoris_dimiliki ?? []) {
    const i = infoItem(k);
    if (i) hasil.push({ kode: k, jenis: "aksesoris", nama: i.nama, harga: i.harga, terpasang: aksTerpasang.has(k) });
  }
  for (const k of b.sparepart_dimiliki ?? []) {
    const i = infoItem(k);
    if (i) hasil.push({ kode: k, jenis: "sparepart", nama: i.nama, harga: i.harga, terpasang: sprTerpasang.has(k) });
  }
  for (const k of b.skin_dimiliki ?? []) {
    const i = infoItem(k);
    if (i) hasil.push({ kode: k, jenis: "skin", nama: i.nama, harga: i.harga, terpasang: b.skin_terpasang === k });
  }
  return hasil;
}

async function muatPasar(uid: number) {
  const db = supabase();
  const [{ data: publik }, { data: saya }, { data: riwayat }, pet, saldo] = await Promise.all([
    db.from("pet_pasar").select("*").eq("status", "buka").is("pihak_id", null).order("dibuat_pada", { ascending: false }).limit(100),
    db.from("pet_pasar").select("*").eq("status", "buka").or(`pemilik_id.eq.${uid},pihak_id.eq.${uid},dibuat_oleh.eq.${uid}`).order("dibuat_pada", { ascending: false }).limit(50),
    db.from("pet_pasar").select("*").neq("status", "buka").or(`pemilik_id.eq.${uid},pihak_id.eq.${uid},pembeli_id.eq.${uid}`).order("selesai_pada", { ascending: false }).limit(20),
    bacaPet(uid),
    saldoKoin(uid),
  ]);
  const semua = [...(publik ?? []), ...(saya ?? []), ...(riwayat ?? [])] as BarisPasar[];
  const orang = await namaOrang(semua.flatMap((t) => [t.pemilik_id, t.pihak_id ?? 0, t.pembeli_id ?? 0]));
  const idSaya = new Set((saya ?? []).map((t) => Number(t.id)));
  return {
    tawaran: ((publik ?? []) as BarisPasar[]).filter((t) => t.pemilik_id !== uid).map((t) => bentukTawaran(t, orang, uid)),
    saya: ((saya ?? []) as BarisPasar[]).filter((t) => idSaya.has(Number(t.id))).map((t) => bentukTawaran(t, orang, uid)),
    riwayat: ((riwayat ?? []) as BarisPasar[]).map((t) => bentukTawaran(t, orang, uid)),
    inventori: inventoriTradable(pet),
    saldo,
    punya_robot: Boolean(pet),
  };
}

async function muatLobi(uid: number) {
  const db = supabase();
  const batas = new Date(Date.now() - LOBI_HIDUP_MS).toISOString();
  const { data: hadir } = await db.from("pet_lobi").select("user_id, x, y, arah, pesan, diperbarui_pada").gte("diperbarui_pada", batas).order("diperbarui_pada", { ascending: false }).limit(60);
  const ids = (hadir ?? []).map((h) => Number(h.user_id));
  if (ids.length === 0) return { robot: [], saya_hadir: false };
  const [{ data: pets }, orang] = await Promise.all([
    db.from("pet_robot").select(KOLOM_PET).in("user_id", ids),
    namaOrang(ids),
  ]);
  const petPer = new Map<number, BarisPet>();
  for (const p of (pets ?? []) as BarisPet[]) petPer.set(Number(p.user_id), p);
  const robot = (hadir ?? [])
    .map((h) => {
      const p = petPer.get(Number(h.user_id));
      if (!p) return null;
      return {
        user_id: String(h.user_id),
        nama_pemilik: orang.get(Number(h.user_id))?.nama ?? "",
        nama_robot: p.nama,
        jenis: p.jenis,
        level: Math.max(1, Math.floor(Number(p.xp ?? 0) / 100) + 1),
        skin: p.skin_terpasang,
        warna: p.warna_custom,
        terpasang: p.aksesoris_terpasang ?? {},
        sparepart: p.sparepart_terpasang ?? {},
        // Barang yang bisa diminta orang lain (untuk panel trading di lobi).
        tradable: inventoriTradable(p).map(({ kode, jenis, nama, harga, terpasang }) => ({ kode, jenis, nama, harga, terpasang })),
        x: Number(h.x),
        y: Number(h.y),
        arah: h.arah === "kiri" ? "kiri" : "kanan",
        pesan: String(h.pesan ?? ""),
        saya: Number(h.user_id) === uid,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  return { robot, saya_hadir: robot.some((r) => r.saya) };
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!bolehPet(user)) galat(PESAN_PET_DIMATIKAN, 403);
    const uid = Number(user.id);
    const bagian = new URL(request.url).searchParams.get("bagian") ?? "pasar";
    return bagian === "lobi" ? muatLobi(uid) : muatPasar(uid);
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!bolehPet(user)) galat(PESAN_PET_DIMATIKAN, 403);
    const uid = Number(user.id);
    const db = supabase();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const aksi = String(body.aksi ?? "");
    const kini = new Date().toISOString();

    // ---------- LOBI ----------
    if (aksi === "lobi_posisi") {
      const x = Math.min(LEBAR_LOBI, Math.max(0, Number(body.x)));
      const y = Math.min(TINGGI_LOBI, Math.max(0, Number(body.y)));
      if (!Number.isFinite(x) || !Number.isFinite(y)) galat("Posisi tidak sah.");
      const pet = await bacaPet(uid);
      if (!pet) galat("Adopsi robot dulu sebelum masuk lobi.", 404);
      const pesan = String(body.pesan ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
      const { error } = await db
        .from("pet_lobi")
        .upsert({ user_id: uid, x, y, arah: body.arah === "kiri" ? "kiri" : "kanan", pesan, diperbarui_pada: kini }, { onConflict: "user_id" });
      if (error) throw new Error("Gagal memperbarui posisi lobi.");
      return muatLobi(uid);
    }
    if (aksi === "lobi_keluar") {
      await db.from("pet_lobi").delete().eq("user_id", uid);
      return { sukses: true };
    }

    // ---------- PASAR ----------
    if (aksi === "tawar" || aksi === "minta") {
      const kode = String(body.kode_item ?? "");
      const item = infoItem(kode);
      if (!item) galat("Barang itu tidak bisa diperdagangkan.");
      const mintaKoin = body.minta_koin == null || body.minta_koin === "" ? null : Math.floor(Number(body.minta_koin));
      const mintaItem = String(body.minta_item ?? "").trim() || null;
      if (mintaKoin != null && (!Number.isFinite(mintaKoin) || mintaKoin < 1 || mintaKoin > 1_000_000)) galat("Jumlah koin harus 1–1.000.000.");
      if (mintaItem && !infoItem(mintaItem)) galat("Barang penukar tidak dikenal.");
      if (mintaKoin == null && !mintaItem) galat("Tentukan imbalan: koin atau barang.");
      if (mintaKoin != null && mintaItem) galat("Pilih satu: koin ATAU barang.");
      const pesan = String(body.pesan ?? "").replace(/\s+/g, " ").trim().slice(0, 140);

      if (aksi === "tawar") {
        // Saya pemilik barang; pihak opsional (tawaran langsung dari lobi).
        const pet = await bacaPet(uid);
        if (!pet || !punya(pet, item.jenis, kode)) galat(`Anda tidak memiliki ${item.nama}.`, 409);
        const pihak = body.pihak_id == null || body.pihak_id === "" ? null : Number(body.pihak_id);
        if (pihak != null && (!Number.isFinite(pihak) || pihak <= 0 || pihak === uid)) galat("Pihak tujuan tidak sah.");
        const { count } = await db.from("pet_pasar").select("id", { count: "exact", head: true }).eq("pemilik_id", uid).eq("kode_item", kode).eq("status", "buka");
        if ((count ?? 0) > 0) galat(`${item.nama} sudah ada di pasar. Batalkan dulu tawaran lamanya.`, 409);
        const { data, error } = await db
          .from("pet_pasar")
          .insert({ pemilik_id: uid, kode_item: kode, jenis_item: item.jenis, minta_koin: mintaKoin, minta_item: mintaItem, pihak_id: pihak, dibuat_oleh: uid, pesan })
          .select("id")
          .single();
        if (error || !data) throw new Error("Gagal memasang tawaran.");
        if (pihak != null) {
          await kirimKabar({
            judul: "🤝 Tawaran trading untukmu",
            isi: `${user.nama} menawarkan ${item.nama} ${mintaKoin != null ? `seharga ${mintaKoin} koin` : `ditukar ${infoItem(mintaItem!)?.nama ?? mintaItem}`}. Buka Pet Robot → Pasar untuk menerima.`,
            kategori: "info",
            jenis_peristiwa: "pet_pasar",
            untukUserIds: [pihak],
          });
        }
        return { sukses: true, id: String(data.id), ...(await muatPasar(uid)) };
      }

      // minta: barang milik orang lain; saya menawarkan koin/barang.
      const pemilik = Number(body.pemilik_id);
      if (!Number.isFinite(pemilik) || pemilik <= 0 || pemilik === uid) galat("Pemilik tidak sah.");
      const [petPemilik, petSaya] = await Promise.all([bacaPet(pemilik), bacaPet(uid)]);
      if (!petPemilik || !punya(petPemilik, item.jenis, kode)) galat(`Orang itu tidak memiliki ${item.nama}.`, 409);
      if (!petSaya) galat("Adopsi robot dulu sebelum trading.", 404);
      if (mintaItem) {
        const mi = infoItem(mintaItem)!;
        if (!punya(petSaya, mi.jenis, mintaItem)) galat(`Anda tidak memiliki ${mi.nama} untuk ditukar.`, 409);
      } else if ((await saldoKoin(uid)) < (mintaKoin ?? 0)) galat("Koin Anda tidak cukup untuk tawaran ini.");
      const { data, error } = await db
        .from("pet_pasar")
        .insert({ pemilik_id: pemilik, kode_item: kode, jenis_item: item.jenis, minta_koin: mintaKoin, minta_item: mintaItem, pihak_id: uid, dibuat_oleh: uid, pesan })
        .select("id")
        .single();
      if (error || !data) throw new Error("Gagal mengirim permintaan.");
      await kirimKabar({
        judul: "🤝 Ada yang mau barangmu",
        isi: `${user.nama} meminta ${item.nama} dengan imbalan ${mintaKoin != null ? `${mintaKoin} koin` : infoItem(mintaItem!)?.nama ?? mintaItem}. Buka Pet Robot → Pasar untuk menerima.`,
        kategori: "info",
        jenis_peristiwa: "pet_pasar",
        untukUserIds: [pemilik],
      });
      return { sukses: true, id: String(data.id), ...(await muatPasar(uid)) };
    }

    if (aksi === "batal" || aksi === "tolak" || aksi === "terima") {
      const id = Number(body.id);
      if (!Number.isFinite(id) || id <= 0) galat("Id tawaran tidak sah.");
      const { data: t } = await db.from("pet_pasar").select("*").eq("id", id).maybeSingle();
      const row = t as BarisPasar | null;
      if (!row) galat("Tawaran tidak ditemukan.", 404);
      if (row.status !== "buka") galat("Tawaran ini sudah tidak berlaku.", 409);

      if (aksi === "batal") {
        if (row.dibuat_oleh !== uid) galat("Hanya pembuat tawaran yang bisa membatalkan.", 403);
        await db.from("pet_pasar").update({ status: "batal", selesai_pada: kini }).eq("id", id).eq("status", "buka");
        return { sukses: true, ...(await muatPasar(uid)) };
      }
      // Pihak penerima: bila pemilik yang membuat → penerima = pihak (atau siapa pun bila publik);
      // bila pihak yang meminta → penerima = pemilik.
      const bolehTerima = row.dibuat_oleh !== uid && (row.dibuat_oleh === row.pemilik_id ? row.pihak_id == null || row.pihak_id === uid : row.pemilik_id === uid);
      if (!bolehTerima) galat("Anda bukan pihak yang bisa menanggapi tawaran ini.", 403);

      if (aksi === "tolak") {
        await db.from("pet_pasar").update({ status: "ditolak", selesai_pada: kini }).eq("id", id).eq("status", "buka");
        await kirimKabar({ judul: "Tawaran trading ditolak", isi: `${user.nama} menolak tawaran ${infoItem(row.kode_item)?.nama ?? row.kode_item}.`, kategori: "info", jenis_peristiwa: "pet_pasar", untukUserIds: [row.dibuat_oleh] });
        return { sukses: true, ...(await muatPasar(uid)) };
      }

      // ---- TERIMA: pindahkan barang + koin ----
      const pemilikId = row.pemilik_id;
      const pihakId = row.dibuat_oleh === row.pemilik_id ? uid : row.pihak_id!;
      const [petPemilik, petPihak] = await Promise.all([bacaPet(pemilikId), bacaPet(pihakId)]);
      const item = infoItem(row.kode_item);
      if (!item) galat("Barang tidak dikenal lagi.");
      if (!petPemilik || !punya(petPemilik, item.jenis, row.kode_item)) galat("Pemilik sudah tidak memiliki barang itu.", 409);
      if (!petPihak) galat("Robot penerima belum ada.", 404);
      const mintaItem = row.minta_item ? infoItem(row.minta_item) : null;
      if (row.minta_item && (!mintaItem || !punya(petPihak, mintaItem.jenis, row.minta_item))) galat("Barang penukar sudah tidak dimiliki.", 409);
      if (row.minta_koin != null && (await saldoKoin(pihakId)) < row.minta_koin) galat("Koin pihak pembayar tidak cukup.", 409);

      // Klaim atomik: hanya satu yang bisa mengubah buka → selesai.
      const { data: klaim } = await db.from("pet_pasar").update({ status: "selesai", pembeli_id: pihakId, selesai_pada: kini }).eq("id", id).eq("status", "buka").select("id");
      if (!klaim || klaim.length === 0) galat("Tawaran keburu diambil orang lain.", 409);

      try {
        // Berantai: langkah kedua dihitung dari hasil langkah pertama (barter
        // sejenis menyentuh kolom yang sama, mis. aksesoris_dimiliki).
        const lepasPemilik = lepasItem(petPemilik, item.jenis, row.kode_item);
        const kolomPemilik = {
          ...lepasPemilik,
          ...(mintaItem && row.minta_item ? tambahItem({ ...petPemilik, ...lepasPemilik }, mintaItem.jenis, row.minta_item) : {}),
        };
        const tambahPihak = tambahItem(petPihak, item.jenis, row.kode_item);
        const kolomPihak = {
          ...tambahPihak,
          ...(mintaItem && row.minta_item ? lepasItem({ ...petPihak, ...tambahPihak }, mintaItem.jenis, row.minta_item) : {}),
        };
        const [r1, r2] = await Promise.all([
          db.from("pet_robot").update({ ...kolomPemilik, diperbarui_pada: kini }).eq("user_id", pemilikId),
          db.from("pet_robot").update({ ...kolomPihak, diperbarui_pada: kini }).eq("user_id", pihakId),
        ]);
        if (r1.error || r2.error) throw new Error("Gagal memindahkan barang.");
        if (row.minta_koin != null) {
          const { error: eKoin } = await db.from("koin_transaksi").insert([
            { user_id: pihakId, jumlah: -row.minta_koin, aktivitas: "pasar_beli", referensi: `pasar-${id}` },
            { user_id: pemilikId, jumlah: row.minta_koin, aktivitas: "pasar_jual", referensi: `pasar-${id}` },
          ]);
          if (eKoin) throw new Error("Gagal memindahkan koin.");
        }
        // Tawaran lain untuk barang yang sama dari pemilik otomatis batal.
        await db.from("pet_pasar").update({ status: "batal", selesai_pada: kini }).eq("pemilik_id", pemilikId).eq("kode_item", row.kode_item).eq("status", "buka");
      } catch (e) {
        await db.from("pet_pasar").update({ status: "buka", pembeli_id: null, selesai_pada: null }).eq("id", id);
        throw e;
      }
      const lawan = pemilikId === uid ? pihakId : pemilikId;
      await kirimKabar({
        judul: "✅ Trading selesai",
        isi: `${user.nama} menerima tawaran: ${item.nama} ${row.minta_koin != null ? `seharga ${row.minta_koin} koin` : `ditukar ${mintaItem?.nama ?? ""}`}. Cek Lemari robotmu.`,
        kategori: "sukses",
        jenis_peristiwa: "pet_pasar",
        untukUserIds: [lawan],
      });
      return { sukses: true, ...(await muatPasar(uid)) };
    }

    galat("aksi tidak dikenal.");
  });
}

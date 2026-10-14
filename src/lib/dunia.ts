// ============================================================
// DUNIA RUANG BOT — aktivitas langsung penghuni (14 Okt 2026). KHUSUS SERVER.
//
// Menyimpan "apa yang sedang dikerjakan siapa" untuk animasi Ruang Bot (master):
//   • mulaiAktivitas / akhiriAktivitas — aksi panjang yang lewat server (unggah stok,
//     kompres, blur, render, unggah sosmed): animasi terus berjalan selama permintaan hidup.
//   • denyutAktivitas — aksi yang baru dicatat setelah selesai (catatAudit): animasi berekor.
//   • catatLayar — layar yang sedang dibuka (menumpang detak, tanpa permintaan tambahan).
//   • bacaStatusDunia — siapa online (kehadiran detak) + layar + aktivitasnya, untuk /api/bot/dunia.
// Penyimpanan Redis (kunci berumur pendek); tanpa Redis jatuh ke memori proses. Setiap perubahan
// disiarkan ke topik Realtime `dunia-ruang` (payload {t} saja; detail lewat API berpagar master).
// Tidak ada fungsi di sini yang melempar ke pemanggil aksi — ini hanya tontonan.
// ============================================================

import { randomBytes } from "node:crypto";
import { supabase } from "@/lib/supabase";
import { klienCache } from "@/lib/redis";
import { daftarHadir } from "@/lib/kehadiran";
import { siarkanRealtime } from "@/lib/realtime-server";
import { labelJenisAudit, labelLayarAudit } from "@/lib/audit-jenis";
import {
  EVENT_DUNIA,
  TOPIK_DUNIA,
  animasiDariJenis,
  ekstrakInfo,
  layarSah,
  pilihAktivitas,
  rapikanAktivitas,
  tetapkanKarakter,
  type AktivitasDunia,
  type PenghuniDunia,
  type StatusDunia,
} from "@/lib/dunia-murni";


const UMUR_KUNCI_AKTIVITAS_DETIK = 1800;
const UMUR_KUNCI_LAYAR_DETIK = 150;
/** Paling banyak penghuni yang dikirim ke master. */
export const MAKS_PENGHUNI = 120;
/** Aksi dari klien (upload langsung ke penyimpanan awan) yang boleh dilaporkan. */
export const JENIS_KLIEN = ["upload_video", "stok_tambah", "kompres", "blur_watermark", "edit_otomatis", "unggah_sosmed"] as const;

const LABEL_TAMBAHAN: Record<string, string> = { upload_video: "Upload video" };
const labelJenis = (jenis: string): string => LABEL_TAMBAHAN[jenis] ?? labelJenisAudit(jenis);

// Catatan memori ditempel ke globalThis (satu catatan walau modul dimuat dua kali; lihat lib/kehadiran).
type Gudang = { akt: Map<string, AktivitasDunia[]>; layar: Map<string, { l: string; t: number }> };
const g = globalThis as unknown as { __priDunia?: Gudang };
const memori: Gudang = (g.__priDunia ??= { akt: new Map(), layar: new Map() });

const kunciAkt = (id: string | number) => `dunia:akt:${id}`;
const kunciLayar = (id: string | number) => `dunia:layar:${id}`;
const idSah = (id: string | number): string | null => {
  const s = String(id);
  return /^\d{1,12}$/.test(s) ? s : null;
};

async function bacaAkt(id: string): Promise<AktivitasDunia[]> {
  const r = klienCache();
  if (!r) return memori.akt.get(id) ?? [];
  try {
    const v = await r.get<AktivitasDunia[]>(kunciAkt(id));
    return Array.isArray(v) ? v : [];
  } catch {
    return memori.akt.get(id) ?? [];
  }
}

async function tulisAkt(id: string, daftar: AktivitasDunia[]): Promise<void> {
  memori.akt.set(id, daftar);
  const r = klienCache();
  if (!r) return;
  try {
    if (daftar.length === 0) await r.del(kunciAkt(id));
    else await r.set(kunciAkt(id), daftar, { ex: UMUR_KUNCI_AKTIVITAS_DETIK });
  } catch {
    // Redis tumbang: memori proses sudah menyimpan.
  }
}

// ---------- siaran (digabung supaya aksi beruntun tidak membanjiri Realtime) ----------

let siaranTerakhir = 0;
let siaranTertunda: ReturnType<typeof setTimeout> | null = null;
const JEDA_SIARAN_MS = 600;

function siarkanDunia(): void {
  const kini = Date.now();
  const kirim = () => {
    siaranTerakhir = Date.now();
    void siarkanRealtime(TOPIK_DUNIA, EVENT_DUNIA, { t: siaranTerakhir }).catch(() => false);
  };
  if (kini - siaranTerakhir >= JEDA_SIARAN_MS) return kirim();
  if (siaranTertunda) return;
  siaranTertunda = setTimeout(() => {
    siaranTertunda = null;
    kirim();
  }, JEDA_SIARAN_MS - (kini - siaranTerakhir));
}

// ---------- antrean per pengguna ----------
// Baca-ubah-tulis pada satu kunci Redis tidak atomik. Semua perubahan milik satu pengguna dijalankan
// berurutan lewat rantai janji (satu proses server), supaya "selesai" tidak tertimpa "denyut" yang membaca
// salinan lama dan dua unggahan beruntun tidak saling menghapus.
const rantai = new Map<string, Promise<unknown>>();

function berurutan<T>(id: string, kerja: () => Promise<T>): Promise<T> {
  const sebelum = rantai.get(id) ?? Promise.resolve();
  const hasil = sebelum.then(kerja, kerja);
  const ekor = hasil.catch(() => undefined);
  rantai.set(id, ekor);
  void ekor.then(() => {
    if (rantai.get(id) === ekor) rantai.delete(id);
  });
  return hasil;
}

// ---------- aktivitas ----------

type Masukan = { jenis: string; ringkasan: string; detail?: Record<string, unknown>; sewa?: boolean };

function bangun(m: Masukan, berjalan: boolean, sekarang: number): AktivitasDunia | null {
  const anim = animasiDariJenis(m.jenis);
  if (!anim) return null;
  const info = ekstrakInfo(m.ringkasan, m.detail);
  return {
    id: randomBytes(6).toString("hex"),
    jenis: m.jenis,
    anim,
    label: labelJenis(m.jenis),
    ringkasan: m.ringkasan.replace(/\s+/g, " ").trim().slice(0, 300),
    judul: info.judul,
    akun: info.akun,
    platform: info.platform,
    mulai: sekarang,
    berjalan,
    akhir: berjalan ? null : sekarang,
    ...(berjalan && m.sewa ? { diperbarui: sekarang } : {}),
  };
}

/** Isi bagian yang masih kosong dari informasi yang lebih lengkap (mis. dari catatan audit setelah selesai). */
function lengkapi(a: AktivitasDunia, m: Masukan): AktivitasDunia {
  const info = ekstrakInfo(m.ringkasan, m.detail);
  return { ...a, judul: a.judul || info.judul, akun: a.akun || info.akun, platform: a.platform || info.platform };
}

/**
 * Aksi panjang dimulai. Mengembalikan token untuk akhiriAktivitas, atau null bila aksi ini tidak
 * ditampilkan. Tidak pernah melempar.
 */
export async function mulaiAktivitas(userId: string | number, m: Masukan): Promise<string | null> {
  try {
    const id = idSah(userId);
    if (!id) return null;
    const a = bangun(m, true, Date.now());
    if (!a) return null;
    await berurutan(id, async () => {
      const lama = rapikanAktivitas(await bacaAkt(id), a.mulai);
      await tulisAkt(id, rapikanAktivitas([a, ...lama], a.mulai));
    });
    siarkanDunia();
    return a.id;
  } catch {
    return null;
  }
}

/** Aksi panjang selesai (sukses atau tidak): animasi tinggal ekornya. Tidak pernah melempar. */
export async function akhiriAktivitas(userId: string | number, token: string | null, tambahan?: Masukan): Promise<void> {
  if (!token) return;
  try {
    const id = idSah(userId);
    if (!id) return;
    await berurutan(id, async () => {
      const kini = Date.now();
      const daftar = await bacaAkt(id);
      const ubah = daftar.map((a) => {
        if (a.id !== token) return a;
        const { diperbarui: _sewa, ...tanpaSewa } = a;
        void _sewa;
        const selesai = { ...tanpaSewa, berjalan: false, akhir: kini };
        return tambahan ? lengkapi(selesai, tambahan) : selesai;
      });
      await tulisAkt(id, rapikanAktivitas(ubah, kini));
    });
    siarkanDunia();
  } catch {
    // tontonan saja
  }
}

/**
 * Aksi yang baru tercatat setelah selesai (catatAudit). Bila aksi sejenis sedang berjalan / baru
 * saja selesai lewat mulaiAktivitas, hanya melengkapi informasinya (tidak membuat ganda).
 */
export async function denyutAktivitas(userId: string | number, m: Masukan): Promise<void> {
  try {
    const id = idSah(userId);
    if (!id || !animasiDariJenis(m.jenis)) return;
    await berurutan(id, async () => {
      const kini = Date.now();
      const daftar = rapikanAktivitas(await bacaAkt(id), kini);
      const sama = daftar.find((a) => a.jenis === m.jenis && (a.berjalan || (a.akhir !== null && kini - a.akhir < 8000)));
      if (sama) {
        await tulisAkt(id, daftar.map((a) => (a === sama ? lengkapi(a, m) : a)));
      } else {
        const a = bangun(m, false, kini);
        if (!a) return;
        await tulisAkt(id, rapikanAktivitas([a, ...daftar], kini));
      }
    });
    siarkanDunia();
  } catch {
    // tontonan saja
  }
}

/** Peramban masih mengerjakan aksinya: perpanjang sewa. Tidak pernah melempar. */
export async function perbaruiAktivitas(userId: string | number, token: string): Promise<void> {
  try {
    const id = idSah(userId);
    if (!id) return;
    await berurutan(id, async () => {
      const kini = Date.now();
      const daftar = await bacaAkt(id);
      if (!daftar.some((a) => a.id === token && a.berjalan)) return;
      await tulisAkt(id, daftar.map((a) => (a.id === token && a.berjalan ? { ...a, diperbarui: kini } : a)));
    });
  } catch {
    // tontonan saja
  }
}

/** Bungkus aksi panjang: animasi jalan selama `kerja` hidup. Galat `kerja` diteruskan apa adanya. */
export async function denganAktivitas<T>(userId: string | number, m: Masukan, kerja: () => Promise<T>): Promise<T> {
  const token = await mulaiAktivitas(userId, m);
  try {
    return await kerja();
  } finally {
    void akhiriAktivitas(userId, token);
  }
}

// ---------- layar ----------

/** Catat layar yang sedang dibuka (dipanggil detak). Tidak pernah melempar. */
export async function catatLayar(userId: string | number, layarMentah: string | null | undefined): Promise<void> {
  try {
    const id = idSah(userId);
    const l = layarSah(layarMentah);
    if (!id || !l) return;
    const lama = memori.layar.get(id);
    const kini = Date.now();
    // Layar sama & baru dicatat: lewati tulis Redis (detak datang tiap 10 dtk dari ratusan perangkat).
    if (lama && lama.l === l && kini - lama.t < 60_000) return;
    memori.layar.set(id, { l, t: kini });
    const r = klienCache();
    if (r) await r.set(kunciLayar(id), { l }, { ex: UMUR_KUNCI_LAYAR_DETIK }).catch(() => undefined);
    // Pindah layar terasa di dunia; detak biasa (layar sama) tidak disiarkan.
    if (!lama || lama.l !== l) siarkanDunia();
  } catch {
    // tontonan saja
  }
}

async function bacaLayar(id: string): Promise<string> {
  const r = klienCache();
  if (r) {
    try {
      const v = await r.get<{ l: string }>(kunciLayar(id));
      if (v && typeof v.l === "string") return layarSah(v.l);
    } catch {
      // jatuh ke memori
    }
  }
  const m = memori.layar.get(id);
  return m && Date.now() - m.t < UMUR_KUNCI_LAYAR_DETIK * 1000 ? m.l : "";
}

// ---------- baca (master) ----------

type BarisOrang = { id: unknown; nama: unknown; username: unknown; avatar_url: unknown; role: unknown; divisi: unknown };

/** Semua yang online + layar + aktivitasnya. Dipanggil /api/bot/dunia (hanya master). */
export async function bacaStatusDunia(): Promise<StatusDunia> {
  const kini = Date.now();
  const idHadir = await daftarHadir().catch(() => [] as string[]);
  const nomor = idHadir.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0);
  const terpotong = nomor.length > MAKS_PENGHUNI;
  const dipakai = nomor.slice(0, MAKS_PENGHUNI);
  if (dipakai.length === 0) return { waktu: kini, jumlah: nomor.length, terpotong: false, online: [] };

  const { data, error } = await supabase()
    .from("app_user")
    .select("id, nama, username, avatar_url, role, divisi")
    .in("id", dipakai);
  if (error) throw new Error("Gagal memuat pengguna online.");
  const orang = (data ?? []) as unknown as BarisOrang[];
  const karakter = tetapkanKarakter(orang.map((o) => Number(o.id)));

  const penghuni = await Promise.all(
    orang.map(async (o): Promise<PenghuniDunia> => {
      const id = String(o.id);
      const [layar, akt] = await Promise.all([bacaLayar(id), bacaAkt(id)]);
      return {
        id: Number(o.id),
        nama: String(o.nama ?? ""),
        username: String(o.username ?? ""),
        divisi: String(o.divisi ?? ""),
        role: String(o.role ?? ""),
        avatar_url: String(o.avatar_url ?? ""),
        layar,
        layar_label: layar ? labelLayarAudit(layar) : "",
        karakter: karakter.get(Number(o.id)) ?? 0,
        aktivitas: pilihAktivitas(akt, kini),
      };
    }),
  );
  await lengkapiAkunSosmed(penghuni);
  penghuni.sort((a, b) => Number(!!b.aktivitas) - Number(!!a.aktivitas) || a.nama.localeCompare(b.nama, "id"));
  return { waktu: kini, jumlah: nomor.length, terpotong, online: penghuni };
}

/**
 * Aksi unggah sosmed: tambahkan akun sosmed milik orang itu (platform @username) dari akun_tvr_user,
 * terbatas pada platform tujuan bila disebut. Hanya mengisi yang masih kosong; gagal = dilewati.
 */
async function lengkapiAkunSosmed(penghuni: PenghuniDunia[]): Promise<void> {
  const perlu = penghuni.filter((p) => p.aktivitas?.anim === "kotak_post" && !p.aktivitas.akun);
  if (perlu.length === 0) return;
  try {
    const { data, error } = await supabase()
      .from("akun_tvr_user")
      .select("user_id, platform, username")
      .in("user_id", perlu.map((p) => p.id))
      .eq("aktif", true);
    if (error) return;
    const baris = (data ?? []) as unknown as { user_id: number; platform: string | null; username: string | null }[];
    for (const p of perlu) {
      const a = p.aktivitas;
      if (!a) continue;
      const tujuan = a.platform.toLowerCase().split(/[,\s]+/).filter(Boolean);
      const akun = baris
        .filter((b) => Number(b.user_id) === p.id && b.username && (tujuan.length === 0 || tujuan.includes(String(b.platform ?? "").toLowerCase())))
        .map((b) => `${String(b.platform ?? "")} ${String(b.username).startsWith("@") ? "" : "@"}${String(b.username)}`.trim())
        .slice(0, 6)
        .join(", ");
      if (akun) a.akun = akun.slice(0, 160);
    }
  } catch {
    // hanya pelengkap tampilan
  }
}

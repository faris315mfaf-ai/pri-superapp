// ============================================================
// AUDIT AKTIVITAS (6 Okt 2026) — KHUSUS SERVER. Lihat sql/60.
//
// Dua jenis catatan:
//
// 1) PERISTIWA (catatAudit): login, Edit Otomatis, Kompres, Blur, unggah,
//    dst. — satu baris audit_aktivitas per aksi. Ditulis di latar: gagal
//    menulis (database lambat, sql/60 belum dijalankan) TIDAK PERNAH
//    menggagalkan aksi penggunanya, hanya dicatat di log server.
//
// 2) WAKTU AKTIF (catatWaktuAktif): menumpang DETAK yang sudah dikirim tiap
//    perangkat tiap 10–30 detik selama aplikasinya terbuka & terlihat —
//    tanpa permintaan tambahan. Selisih antar-detak dijumlahkan bila
//    <= BATAS_JEDA_DETIK; lebih dari itu = sesi baru (aplikasi sempat
//    ditutup / disembunyikan). Penjumlahan di Redis (2 operasi per detak,
//    BUKAN tulis database), lalu disalin ke audit_harian paling sering
//    tiap SALIN_TIAP_DETIK per orang — ±0,7 tulis/detik untuk 200 orang
//    online, jauh di bawah beban detak itu sendiri.
// ============================================================
import { klienCache } from "@/lib/redis";
import { supabase } from "@/lib/supabase";
import { tabelBelumAda } from "@/lib/api-helper";
import { ipDari } from "@/lib/rate-limit";
import type { JenisAudit } from "@/lib/audit-jenis";

/** Jeda antar-detak terpanjang yang masih dihitung "aplikasi menyala". */
export const BATAS_JEDA_DETIK = 180;
/** Seberapa sering akumulasi Redis disalin ke audit_harian (per orang). */
const SALIN_TIAP_DETIK = 300;
/** Umur akumulasi di Redis — layar Audit membacanya untuk hari-hari terakhir. */
const TTL_AKUMULASI_DETIK = 3 * 86_400;
/** Batas rentang sesi yang disimpan per hari (yang tertua dibuang). */
const MAKS_SESI = 120;

/** sql/60 belum dijalankan → berhenti mencoba sebentar supaya log tidak banjir. */
let tabelHilangSampai = 0;

function tabelSiap(): boolean {
  return Date.now() >= tabelHilangSampai;
}

function tandaiTabelHilang(error: { code?: string; message?: string } | null): boolean {
  if (!tabelBelumAda(error)) return false;
  if (tabelSiap()) console.warn("[audit] tabel audit belum ada — jalankan sql/60_audit_aktivitas.sql");
  tabelHilangSampai = Date.now() + 10 * 60_000;
  return true;
}

/** Tanggal WIB (YYYY-MM-DD) dari detik epoch. */
export function tanggalWibDari(detik: number): string {
  return new Date((detik + 7 * 3600) * 1000).toISOString().slice(0, 10);
}

/** Ringkas nama perangkat dari User-Agent: "Android · Chrome", "iPhone · Safari". */
export function perangkatDari(request: Request | null | undefined): string {
  const ua = request?.headers.get("user-agent") ?? "";
  if (!ua) return "";
  const os = /iphone|ipad/i.test(ua)
    ? /ipad/i.test(ua) ? "iPad" : "iPhone"
    : /android/i.test(ua)
      ? "Android"
      : /windows/i.test(ua)
        ? "Windows"
        : /mac os/i.test(ua)
          ? "Mac"
          : /linux/i.test(ua)
            ? "Linux"
            : "Lainnya";
  const peramban = /edg\//i.test(ua)
    ? "Edge"
    : /samsungbrowser/i.test(ua)
      ? "Samsung Internet"
      : /chrome|crios/i.test(ua)
        ? "Chrome"
        : /firefox|fxios/i.test(ua)
          ? "Firefox"
          : /safari/i.test(ua)
            ? "Safari"
            : "";
  // Aplikasi APK (TWA) membawa penanda wv / paket sendiri di UA Chrome.
  const apk = /; wv\)/i.test(ua) ? " (APK)" : "";
  return [os, peramban].filter(Boolean).join(" · ") + apk;
}

/**
 * Catat satu peristiwa. Tidak pernah melempar dan tidak perlu di-await:
 * penulisannya berjalan di latar.
 */
export function catatAudit(
  userId: string | number,
  jenis: JenisAudit,
  ringkasan: string,
  opsi: { detail?: Record<string, unknown>; request?: Request | null } = {},
): void {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0 || !tabelSiap()) return;
  const baris = {
    user_id: id,
    jenis,
    ringkasan: ringkasan.slice(0, 300),
    detail: opsi.detail ?? {},
    ip: opsi.request ? ipDari(opsi.request).slice(0, 64) : "",
    perangkat: perangkatDari(opsi.request).slice(0, 120),
  };
  void (async () => {
    try {
      const { error } = await supabase().from("audit_aktivitas").insert(baris);
      if (error && !tandaiTabelHilang(error)) console.error("[audit] gagal mencatat:", error.message);
    } catch (e) {
      console.error("[audit] gagal mencatat:", e instanceof Error ? e.message : e);
    }
  })();
}

// ------------------------------------------------------------
// Waktu aktif
// ------------------------------------------------------------

/** Akumulasi satu orang untuk satu tanggal WIB. Waktu dalam detik epoch. */
export type AkumulasiAktif = {
  /** detak pertama */
  p: number;
  /** detak terakhir */
  t: number;
  /** total detik aktif */
  d: number;
  /** rentang sesi [mulai, akhir] */
  s: [number, number][];
  /** detik per layar */
  m: Record<string, number>;
  /** terakhir disalin ke database */
  f: number;
};

const gudang = globalThis as unknown as { __priAuditAktif?: Map<string, AkumulasiAktif> };
const memori: Map<string, AkumulasiAktif> = (gudang.__priAuditAktif ??= new Map());

const kunciAktif = (tanggal: string, userId: string) => `audit:aktif:${tanggal}:${userId}`;
const kunciHari = (tanggal: string) => `audit:hari:${tanggal}`;

async function bacaAkumulasi(tanggal: string, userId: string): Promise<AkumulasiAktif | null> {
  const r = klienCache();
  if (!r) return memori.get(kunciAktif(tanggal, userId)) ?? null;
  try {
    const v = await r.get<AkumulasiAktif | string>(kunciAktif(tanggal, userId));
    if (!v) return null;
    return typeof v === "string" ? (JSON.parse(v) as AkumulasiAktif) : v;
  } catch {
    return memori.get(kunciAktif(tanggal, userId)) ?? null;
  }
}

async function tulisAkumulasi(tanggal: string, userId: string, a: AkumulasiAktif, baru: boolean): Promise<void> {
  const r = klienCache();
  memori.set(kunciAktif(tanggal, userId), a);
  if (!r) return;
  try {
    await r.set(kunciAktif(tanggal, userId), JSON.stringify(a), { ex: TTL_AKUMULASI_DETIK });
    if (baru) {
      await r.sadd(kunciHari(tanggal), userId);
      await r.expire(kunciHari(tanggal), TTL_AKUMULASI_DETIK);
    }
    // Di Redis cukup; memori hanya cadangan saat Redis tumbang.
    memori.delete(kunciAktif(tanggal, userId));
  } catch {
    // Redis tumbang: tetap di memori proses.
  }
}

/** Salin akumulasi ke audit_harian (upsert). Tidak pernah melempar. */
async function salinKeDatabase(tanggal: string, userId: string, a: AkumulasiAktif): Promise<void> {
  if (!tabelSiap()) return;
  try {
    const { error } = await supabase()
      .from("audit_harian")
      .upsert(
        {
          user_id: Number(userId),
          tanggal,
          detik_aktif: Math.round(a.d),
          pertama: new Date(a.p * 1000).toISOString(),
          terakhir: new Date(a.t * 1000).toISOString(),
          sesi: a.s,
          layar: a.m,
          diperbarui: new Date().toISOString(),
        },
        { onConflict: "user_id,tanggal" },
      );
    if (error && !tandaiTabelHilang(error)) console.error("[audit] gagal menyalin waktu aktif:", error.message);
  } catch (e) {
    console.error("[audit] gagal menyalin waktu aktif:", e instanceof Error ? e.message : e);
  }
}

function sahLayar(layar: string | null | undefined): string {
  const l = (layar ?? "").trim().toLowerCase();
  return /^[a-z0-9-]{1,32}$/.test(l) ? l : "lain";
}

/**
 * Tambahkan satu detak ke akumulasi waktu aktif. Dipanggil /api/detak;
 * tidak pernah melempar.
 */
export async function catatWaktuAktif(userId: string | number, layarMentah?: string | null): Promise<void> {
  const id = String(userId);
  if (!/^\d{1,12}$/.test(id)) return;
  const layar = sahLayar(layarMentah);
  const kini = Math.floor(Date.now() / 1000);
  const tanggal = tanggalWibDari(kini);
  try {
    const lama = await bacaAkumulasi(tanggal, id);
    let a: AkumulasiAktif;
    let baru = false;
    if (!lama) {
      baru = true;
      a = { p: kini, t: kini, d: 0, s: [[kini, kini]], m: {}, f: 0 };
      // Hari baru: pastikan sisa kemarin (yang belum sempat disalin karena
      // aplikasinya keburu ditutup) masuk database.
      const kemarin = tanggalWibDari(kini - 86_400);
      const sisa = await bacaAkumulasi(kemarin, id);
      if (sisa && sisa.f < sisa.t) {
        await salinKeDatabase(kemarin, id, sisa);
        await tulisAkumulasi(kemarin, id, { ...sisa, f: sisa.t }, false);
      }
    } else {
      a = lama;
      const jeda = kini - a.t;
      if (jeda <= 0) return; // detak kembar (dua tab) di detik yang sama
      if (jeda <= BATAS_JEDA_DETIK) {
        a.d += jeda;
        a.m[layar] = (a.m[layar] ?? 0) + jeda;
        const akhir = a.s[a.s.length - 1];
        if (akhir) akhir[1] = kini;
        else a.s.push([kini, kini]);
      } else {
        a.s.push([kini, kini]);
        if (a.s.length > MAKS_SESI) a.s.splice(0, a.s.length - MAKS_SESI);
      }
      a.t = kini;
    }
    const perluSalin = baru || kini - a.f >= SALIN_TIAP_DETIK;
    if (perluSalin) a.f = kini;
    await tulisAkumulasi(tanggal, id, a, baru);
    if (perluSalin) await salinKeDatabase(tanggal, id, a);
  } catch (e) {
    console.error("[audit] waktu aktif:", e instanceof Error ? e.message : e);
  }
}

/**
 * Akumulasi TERKINI dari Redis untuk satu tanggal (lebih segar dari
 * audit_harian yang disalin tiap ±5 menit). Kosong bila tanpa Redis /
 * sudah kedaluwarsa — pemanggil memakai database.
 */
export async function akumulasiTanggal(tanggal: string): Promise<Map<string, AkumulasiAktif>> {
  const hasil = new Map<string, AkumulasiAktif>();
  const r = klienCache();
  let ids: string[] = [];
  if (r) {
    try {
      ids = (await r.smembers<string[]>(kunciHari(tanggal))).map(String);
    } catch {
      ids = [];
    }
  }
  const awalan = `audit:aktif:${tanggal}:`;
  for (const k of memori.keys()) if (k.startsWith(awalan)) ids.push(k.slice(awalan.length));
  const unik = [...new Set(ids)].filter((i) => /^\d{1,12}$/.test(i));
  const isi = await Promise.all(unik.map((i) => bacaAkumulasi(tanggal, i)));
  unik.forEach((i, n) => {
    const a = isi[n];
    if (a) hasil.set(i, a);
  });
  return hasil;
}

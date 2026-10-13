// ============================================================
// BOT REDAKSI — pemilihan kandidat video (13 Okt 2026).
//
// MURNI: tanpa DB/jaringan/env, jadi bisa diuji penuh. Diberi daftar kandidat
// hasil panen, daftar kata blokir, dan jam sekarang, fungsi di sini
// menentukan kandidat TERBAIK secara deterministik (hasil sama untuk masukan
// sama; urutan masukan tidak berpengaruh).
//
// Skor 0..100:
//   kebaruan  0..50  peluruhan setengah-hidup 24 jam dari waktu_terbit
//   tayangan  0..30  skala log (1 juta tayangan = penuh)
//   durasi    0..10  10..180 dtk layak; tak diketahui = 4
//   teks      0..10  judul tak kosong 5 + caption tak kosong 5
// Ditolak (tidak pernah dipilih): cocok kata blokir, sudah bentrok,
// durasi diketahui tetapi di luar 10..180 dtk, atau judul+caption kosong
// (naskah wajib tak kosong).
// ============================================================

import { BATAS_PROTOKOL } from "@/lib/bot-protokol";

export const DURASI_LAYAK = { MIN: 10, MAKS: 180 } as const;
/** Setengah-hidup skor kebaruan. */
const SETENGAH_HIDUP_JAM = 24;
/** waktu_terbit lebih dari ini di depan jam server dianggap tidak dapat dipercaya. */
const TOLERANSI_MASA_DEPAN_MS = 24 * 3600_000;

/** Bentuk minimal kandidat yang dibutuhkan pemilih (baris bot_kandidat). */
export type KandidatNilai = {
  id: number;
  url: string;
  judul: string | null;
  caption: string | null;
  durasi_detik: number | null;
  tayangan: number | null;
  /** ISO 8601 atau null. */
  waktu_terbit: string | null;
  /** Alasan kandidat dilewati (mis. "dipakai_manusia"); null/"" = bersih. */
  bentrok?: string | null;
};

export type AlasanTolak = "bentrok" | "blokir" | "durasi_tak_layak" | "tanpa_teks";

export type Peringkat<T extends KandidatNilai> = { kandidat: T; skor: number };

const adaTeks = (s: string | null | undefined): boolean => typeof s === "string" && s.trim().length > 0;

/** Normalisasi untuk pencocokan blokir: Unicode ternormalisasi, huruf kecil. */
function normal(s: string): string {
  return s.normalize("NFKC").toLowerCase();
}

/** Kata blokir yang cocok (case-insensitive, potongan kata) pada judul/caption/url; null bila bersih. */
export function kataBlokirCocok(k: Pick<KandidatNilai, "judul" | "caption" | "url">, blokir: readonly string[]): string | null {
  const jerami = normal(`${k.judul ?? ""}\n${k.caption ?? ""}\n${k.url ?? ""}`);
  for (const mentah of blokir) {
    const kata = normal(String(mentah ?? "").trim());
    if (kata.length > 0 && jerami.includes(kata)) return String(mentah).trim();
  }
  return null;
}

/** Alasan kandidat TIDAK boleh dipilih, atau null bila layak. */
export function alasanTolak(k: KandidatNilai, blokir: readonly string[]): AlasanTolak | null {
  if (typeof k.bentrok === "string" && k.bentrok.trim() !== "") return "bentrok";
  if (kataBlokirCocok(k, blokir) !== null) return "blokir";
  const d = k.durasi_detik;
  if (typeof d === "number" && Number.isFinite(d) && (d < DURASI_LAYAK.MIN || d > DURASI_LAYAK.MAKS)) return "durasi_tak_layak";
  if (!adaTeks(k.judul) && !adaTeks(k.caption)) return "tanpa_teks";
  return null;
}

const bulatkan = (n: number): number => Math.round(n * 1e6) / 1e6;

/** Skor 0..100 (tanpa memeriksa penolakan — pakai alasanTolak untuk itu). */
export function skorKandidat(k: KandidatNilai, sekarangMs: number): number {
  // Kebaruan
  let kebaruan = 10; // waktu tak diketahui/tak masuk akal → nilai netral rendah
  const t = k.waktu_terbit ? Date.parse(k.waktu_terbit) : NaN;
  if (Number.isFinite(t) && t <= sekarangMs + TOLERANSI_MASA_DEPAN_MS) {
    const umurJam = Math.max(0, sekarangMs - t) / 3600_000;
    kebaruan = 50 * Math.pow(0.5, umurJam / SETENGAH_HIDUP_JAM);
  }
  // Tayangan
  let tayangan = 0;
  if (typeof k.tayangan === "number" && Number.isFinite(k.tayangan) && k.tayangan > 0) {
    tayangan = 30 * Math.min(1, Math.log10(1 + k.tayangan) / 6);
  }
  // Durasi
  let durasi = 4;
  if (typeof k.durasi_detik === "number" && Number.isFinite(k.durasi_detik)) {
    durasi = k.durasi_detik >= DURASI_LAYAK.MIN && k.durasi_detik <= DURASI_LAYAK.MAKS ? 10 : 0;
  }
  // Teks
  const teks = (adaTeks(k.judul) ? 5 : 0) + (adaTeks(k.caption) ? 5 : 0);
  return bulatkan(kebaruan + tayangan + durasi + teks);
}

function waktuAngka(k: KandidatNilai): number {
  const t = k.waktu_terbit ? Date.parse(k.waktu_terbit) : NaN;
  return Number.isFinite(t) ? t : -Infinity;
}

/**
 * Peringkat kandidat yang layak, terbaik di depan. Pemutus seri STABIL dan
 * tidak bergantung pada urutan masukan: skor ↓, waktu_terbit ↓ (tak diketahui
 * paling akhir), tayangan ↓, id ↑.
 */
export function peringkatKandidat<T extends KandidatNilai>(kandidat: readonly T[], blokir: readonly string[], sekarangMs: number): Peringkat<T>[] {
  const layak: Peringkat<T>[] = [];
  for (const k of kandidat) {
    if (alasanTolak(k, blokir) !== null) continue;
    layak.push({ kandidat: k, skor: skorKandidat(k, sekarangMs) });
  }
  layak.sort((a, b) => {
    if (b.skor !== a.skor) return b.skor - a.skor;
    const wa = waktuAngka(a.kandidat);
    const wb = waktuAngka(b.kandidat);
    if (wb !== wa) return wb > wa ? 1 : -1;
    const ta = a.kandidat.tayangan ?? -1;
    const tb = b.kandidat.tayangan ?? -1;
    if (tb !== ta) return tb - ta;
    return a.kandidat.id - b.kandidat.id;
  });
  return layak;
}

/** Kandidat terbaik, atau null bila tak ada yang layak. */
export function pilihTerbaik<T extends KandidatNilai>(kandidat: readonly T[], blokir: readonly string[], sekarangMs: number): T | null {
  return peringkatKandidat(kandidat, blokir, sekarangMs)[0]?.kandidat ?? null;
}

// ---- Naskah & label ----

/** Rapikan spasi: semua spasi/baris baru/karakter kontrol → satu spasi, ujung dipangkas. */
function rapikan(s: string | null | undefined): string {
  return String(s ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Naskah video dari judul + caption: dirapikan, caption yang hanya mengulang
 * judul dibuang, dipotong ke BATAS_PROTOKOL.MAKS_NASKAH (di batas kata bila
 * wajar, tidak pernah memotong pasangan pengganti Unicode). Mengembalikan
 * null bila hasilnya kosong — pemanggil WAJIB menanganinya.
 */
export function buatNaskah(judul: string | null | undefined, caption: string | null | undefined): string | null {
  const j = rapikan(judul);
  let c = rapikan(caption);
  if (c !== "" && j !== "") {
    const cl = c.toLowerCase();
    const jl = j.toLowerCase();
    if (cl === jl) c = "";
    else if (cl.startsWith(jl)) c = c.slice(j.length).replace(/^[\s.:;,\-–—|]+/, "");
  }
  let hasil: string;
  if (j !== "" && c !== "") hasil = /[.!?…:]$/.test(j) ? `${j} ${c}` : `${j}. ${c}`;
  else hasil = j !== "" ? j : c;
  hasil = hasil.trim();
  if (hasil === "") return null;

  const maks = BATAS_PROTOKOL.MAKS_NASKAH;
  if (hasil.length > maks) {
    let potong = hasil.slice(0, maks);
    const spasi = potong.lastIndexOf(" ");
    if (spasi >= maks * 0.8) potong = potong.slice(0, spasi);
    // Jangan menyisakan separuh pasangan pengganti (emoji dsb.).
    const akhir = potong.charCodeAt(potong.length - 1);
    if (akhir >= 0xd800 && akhir <= 0xdbff) potong = potong.slice(0, -1);
    hasil = potong.trim();
  }
  return hasil === "" ? null : hasil;
}

const MAKS_LABEL = 60;

/** Nama akun dari URL profil: segmen "@akun" bila ada, "/channel|c|user/…" → segmen berikutnya, selain itu segmen pertama; tanpa jalur → host. */
function namaDariUrl(teks: string): string {
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(teks) ? teks : `https://${teks}`);
  } catch {
    return teks;
  }
  const s = u.pathname.split("/").filter((x) => x !== "");
  const dengan = s.find((x) => x.startsWith("@"));
  if (dengan) return dengan;
  if (["c", "channel", "user"].includes((s[0] ?? "").toLowerCase()) && s[1]) return s[1];
  if (s[0]) return s[0];
  return u.hostname.replace(/^www\./i, "");
}

/**
 * Label kredit sumber untuk video ("SUMBER: …" ditambahkan sendiri oleh
 * mesin): handle tanpa "@"; bila handle berupa URL diambil segmen terakhir;
 * kosong → nama platform. Maks 60 karakter.
 */
export function labelSumber(platform: string | null | undefined, handle: string | null | undefined): string {
  let h = rapikan(handle);
  if (h.includes("/")) h = namaDariUrl(h);
  h = h.replace(/^@+/, "").trim();
  if (h === "") {
    const p = rapikan(platform);
    h = p === "" ? "Sumber" : p;
  }
  if (h.length > MAKS_LABEL) {
    h = h.slice(0, MAKS_LABEL);
    const akhir = h.charCodeAt(h.length - 1);
    if (akhir >= 0xd800 && akhir <= 0xdbff) h = h.slice(0, -1);
    h = h.trim();
  }
  return h;
}

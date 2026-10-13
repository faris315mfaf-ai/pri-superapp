// Pustaka template bot (13 Okt 2026) — bagian MURNI: validasi nama, kode, tipe
// bersama server dan layar. Tanpa jaringan/basis data supaya teruji.
export const NAMA_TEMPLATE_MIN = 3;
export const NAMA_TEMPLATE_MAKS = 60;
/** Batas jumlah template di pustaka (menjaga disk mesin). */
export const TEMPLATE_MAKS_JUMLAH = 30;

export type TemplatePustaka = {
  id: number;
  nama: string;
  ukuran_byte: number;
  dibuat_pada: string;
  /** Nama akun tempat template dibangun ("" bila akunnya sudah tidak ada). */
  sumber: string;
};

export type KeadaanTemplateMesin = { ada: boolean; siap: boolean } | null;

export type BotTemplateBaris = {
  bot_id: number;
  user_id: number;
  nama: string;
  username: string;
  template_id: number | null;
  template_nama: string;
  dipasang_pada: string | null;
  /** Keadaan template TVR di mesin untuk akun bot ini (null = mesin tak terjangkau). */
  mesin: KeadaanTemplateMesin;
};

export type AkunSumberTemplate = {
  user_id: number;
  nama: string;
  username: string;
  jenis: "master" | "bot";
  mesin: KeadaanTemplateMesin;
};

export type StatusTemplateBot = {
  tabel_ada: boolean;
  template: TemplatePustaka[];
  bot: BotTemplateBaris[];
  akun_sumber: AkunSumberTemplate[];
};

export type AksiTemplateBot =
  | { aksi: "simpan"; nama: string; dari: number }
  | { aksi: "pasang"; template_id: number; bot_id: number | "semua" }
  | { aksi: "hapus"; template_id: number };

export type HasilPasang = { bot_id: number; nama: string; ok: boolean; pesan: string };

export function normalkanNamaTemplate(
  mentah: unknown,
): { ok: true; nama: string } | { ok: false; pesan: string } {
  if (typeof mentah !== "string") return { ok: false, pesan: "Nama template wajib diisi." };
  const nama = mentah.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (nama.length < NAMA_TEMPLATE_MIN) return { ok: false, pesan: `Nama template minimal ${NAMA_TEMPLATE_MIN} karakter.` };
  if (nama.length > NAMA_TEMPLATE_MAKS) return { ok: false, pesan: `Nama template maksimal ${NAMA_TEMPLATE_MAKS} karakter.` };
  return { ok: true, nama };
}

/** Kode folder pustaka di mesin: 12 karakter huruf kecil + angka, acak. */
export function buatKodePustaka(): string {
  const b = new Uint8Array(9);
  globalThis.crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

export const POLA_KODE_PUSTAKA = /^[a-z0-9]{6,24}$/;

/** Detail galat dari balasan mesin ({detail: string | [...]}) jadi satu kalimat. */
export function pesanDariMesin(json: unknown, cadangan: string): string {
  const d = (json as { detail?: unknown } | null)?.detail;
  if (typeof d === "string" && d.trim()) return d.trim().slice(0, 300);
  if (Array.isArray(d) && d.length > 0) {
    const m = (d[0] as { msg?: unknown } | undefined)?.msg;
    if (typeof m === "string" && m.trim()) return m.trim().slice(0, 300);
  }
  return cadangan;
}

/** Ringkas keadaan template mesin untuk label di layar. */
export function labelKeadaan(k: KeadaanTemplateMesin): { teks: string; nada: "ok" | "kurang" | "tak_tahu" } {
  if (k === null) return { teks: "mesin tak terjangkau", nada: "tak_tahu" };
  if (!k.ada) return { teks: "belum ada template", nada: "kurang" };
  if (!k.siap) return { teks: "template belum ditetapkan", nada: "kurang" };
  return { teks: "template siap", nada: "ok" };
}

export function formatUkuran(byte: number): string {
  if (!Number.isFinite(byte) || byte <= 0) return "0 MB";
  const mb = byte / 1_048_576;
  return mb < 10 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`;
}

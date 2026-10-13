// "Otak" per bot (13 Okt 2026) — bagian MURNI (tipe, validasi kunci, penyamaran).
// Dipakai server dan layar. Tidak ada rahasia di sini.

export const PENYEDIA_OTAK = ["deepseek", "gemini"] as const;
export type PenyediaOtak = (typeof PENYEDIA_OTAK)[number];

export const LABEL_PENYEDIA: Record<PenyediaOtak, string> = {
  deepseek: "DeepSeek",
  gemini: "Google Gemini",
};

export function adalahPenyedia(x: unknown): x is PenyediaOtak {
  return typeof x === "string" && (PENYEDIA_OTAK as readonly string[]).includes(x);
}

export const KUNCI_MIN = 16;
export const KUNCI_MAKS = 200;

/** Kunci tempelan: tanpa spasi/kontrol di tengah, panjang wajar. Spasi di ujung dibuang. */
export function normalkanKunciApi(mentah: unknown): { ok: true; kunci: string } | { ok: false; pesan: string } {
  if (typeof mentah !== "string") return { ok: false, pesan: "API key wajib diisi." };
  const kunci = mentah.trim();
  if (kunci.length < KUNCI_MIN) return { ok: false, pesan: `API key terlalu pendek (minimal ${KUNCI_MIN} karakter).` };
  if (kunci.length > KUNCI_MAKS) return { ok: false, pesan: `API key terlalu panjang (maksimal ${KUNCI_MAKS} karakter).` };
  if (/\s/.test(kunci) || /[\u0000-\u001f\u007f]/.test(kunci)) return { ok: false, pesan: "API key tidak boleh berisi spasi atau karakter kontrol." };
  if (!/^[\x21-\x7e]+$/.test(kunci)) return { ok: false, pesan: "API key hanya boleh berisi karakter ASCII yang tampak." };
  return { ok: true, kunci };
}

/** 4 karakter terakhir untuk tampilan. */
export const akhirKunci = (kunci: string): string => kunci.slice(-4);

/** "••••abcd" — kunci utuh tidak pernah dibentuk ulang di sisi mana pun. */
export const samarkanKunci = (akhir: string): string => (akhir ? `••••${akhir}` : "");

export type KodeGalatOtak = "tanpa_kunci" | "kunci_rusak" | "kunci_ditolak" | "kuota" | "waktu_habis" | "gagal";

export const PESAN_GALAT_OTAK: Record<KodeGalatOtak, string> = {
  tanpa_kunci: "Bot ini belum punya API key.",
  kunci_rusak: "API key tersimpan tidak bisa dibaca (kunci induk berganti?). Simpan ulang.",
  kunci_ditolak: "Penyedia menolak API key ini (salah, dicabut, atau tanpa izin).",
  kuota: "Kuota API key ini habis atau terkena batas laju.",
  waktu_habis: "Penyedia tidak menjawab tepat waktu.",
  gagal: "Penyedia AI bermasalah. Coba lagi.",
};

export function kodeDariStatusHttp(status: number): KodeGalatOtak {
  if (status === 401 || status === 403) return "kunci_ditolak";
  if (status === 402 || status === 429) return "kuota";
  return "gagal";
}

export type OtakBotRingkas = {
  bot_id: number;
  nama: string;
  username: string;
  peran: string;
  persona: string;
  penyedia: PenyediaOtak | null;
  /** "••••abcd" atau "" bila belum diatur. */
  kunci_samar: string;
  diubah_pada: string | null;
  teruji_pada: string | null;
  /** 'ok' | kode galat | null (belum diuji). */
  hasil_uji: string | null;
};

export type StatusOtakBot = {
  tabel_ada: boolean;
  /** false = BOT_KUNCI_INDUK belum diatur di server: simpan kunci ditolak. */
  induk_siap: boolean;
  bot: OtakBotRingkas[];
};

export type AksiOtakBot =
  | { aksi: "simpan"; bot_id: number; penyedia: PenyediaOtak; kunci: string }
  | { aksi: "hapus"; bot_id: number }
  | { aksi: "uji"; bot_id: number }
  | { aksi: "kepribadian"; bot_id: number; peran: string; persona: string };

/** Label hasil uji untuk layar. */
export function labelHasilUji(h: string | null): { teks: string; nada: "ok" | "kurang" | "tak_tahu" } {
  if (h === null || h === "") return { teks: "belum diuji", nada: "tak_tahu" };
  if (h === "ok") return { teks: "teruji", nada: "ok" };
  const pesan = (PESAN_GALAT_OTAK as Record<string, string>)[h];
  return { teks: pesan ? pesan.replace(/\.$/, "") : "uji gagal", nada: "kurang" };
}

// ---- Kepribadian (peran + persona) ----

export const PERAN_MAKS = 60;
export const PERSONA_MAKS = 600;

export type KepribadianBot = { nama: string; peran: string; persona: string };

/** Teks kepribadian dari masukan master: spasi dirapikan, karakter kontrol dibuang, panjang dibatasi. */
export function normalkanKepribadian(
  peran: unknown,
  persona: unknown,
): { ok: true; peran: string; persona: string } | { ok: false; pesan: string } {
  const bersih = (x: unknown) => (typeof x === "string" ? x.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() : null);
  const r = bersih(peran);
  const p = bersih(persona);
  if (r === null || p === null) return { ok: false, pesan: "Peran dan watak wajib berupa teks." };
  if (r.length > PERAN_MAKS) return { ok: false, pesan: `Peran maksimal ${PERAN_MAKS} karakter.` };
  if (p.length > PERSONA_MAKS) return { ok: false, pesan: `Watak maksimal ${PERSONA_MAKS} karakter.` };
  return { ok: true, peran: r, persona: p };
}

/**
 * Menambahkan kepribadian ke prompt sistem. Kepribadian memengaruhi GAYA (pilihan kata, kebiasaan, prioritas),
 * bukan fakta maupun aturan: blok aturan asli tetap di depan dan menang bila bertentangan.
 */
export function sistemDenganKepribadian(sistem: string, k: KepribadianBot | null): string {
  if (!k || (k.peran.trim() === "" && k.persona.trim() === "")) return sistem;
  const baris = [
    `KEPRIBADIANMU: kamu ${k.nama.trim() || "agen redaksi"}${k.peran.trim() ? `, ${k.peran.trim()}` : ""}.`,
    k.persona.trim() ? `Watak dan cara berpikirmu: ${k.persona.trim()}` : "",
    "Kepribadian ini hanya memengaruhi gaya bahasa dan prioritasmu. Aturan di atas, fakta dari bahan, dan batas keamanan TIDAK boleh dilanggar karenanya.",
  ].filter(Boolean);
  return `${sistem}\n\n${baris.join("\n")}`;
}

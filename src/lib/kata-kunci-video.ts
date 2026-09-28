// ============================================================
// Pencocok KATA KUNCI video (29 Sep 2026) — MURNI, tanpa database.
//
// "Seluruh video yang caption/hashtag/kategori dan apapun terkait
// videonya mengandung kata kunci jadi prioritas nomor 1" (permintaan
// user). Kata kuncinya = daftar keyword_wajib yang aktif.
//
// PER KATA UTUH, bukan potongan huruf. Data asli 29 Sep: pencocokan
// potongan membuat "PERI" cocok dengan "periode", "perintah", "periksa"
// (4.265 video palsu). Aturan:
//   • teks (caption / nama kategori): kata kunci muncul sebagai kata utuh
//     — tanda baca & huruf besar diabaikan ("PT.BIKE" = "pt bike").
//   • hashtag: "#reformaagraria" cocok dengan "REFORMA AGRARIA" (spasi
//     dibuang). Hashtag boleh LEBIH PANJANG dari kata kuncinya hanya bila
//     kata kuncinya cukup khas: ≥ 5 huruf boleh di awal hashtag
//     (#prabowosubianto), ≥ 7 huruf boleh di mana saja (#timprabowo).
//     Kata kunci pendek (PERI, BPJS, KSP) wajib hashtag persis.
// ============================================================

export type KataKunci = { asli: string; kata: string; rapat: string };

/** Huruf kecil, tanpa aksen, selain huruf/angka jadi spasi tunggal. */
export function normalKata(teks: string): string {
  return teks
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Siapkan daftar kata kunci (kosong / < 2 huruf dibuang, kembar disatukan). */
export function siapkanKataKunci(daftar: readonly string[]): KataKunci[] {
  const hasil = new Map<string, KataKunci>();
  for (const asli of daftar) {
    const kata = normalKata(String(asli ?? ""));
    const rapat = kata.replace(/ /g, "");
    if (rapat.length < 2 || hasil.has(kata)) continue;
    hasil.set(kata, { asli: String(asli).trim(), kata, rapat });
  }
  return [...hasil.values()];
}

function hashtagDari(teks: string): string[] {
  const hasil: string[] = [];
  for (const m of teks.matchAll(/#([\p{L}\p{N}_.]+)/gu)) {
    const h = normalKata(m[1]).replace(/ /g, "");
    if (h) hasil.push(h);
  }
  return hasil;
}

/** Kata kunci pertama yang cocok dengan teks, atau null. */
export function kataKunciCocok(teks: string | null | undefined, kunci: readonly KataKunci[]): KataKunci | null {
  if (!teks || kunci.length === 0) return null;
  const kata = ` ${normalKata(teks)} `;
  const tagar = teks.includes("#") ? hashtagDari(teks) : [];
  for (const k of kunci) {
    if (kata.includes(` ${k.kata} `)) return k;
    for (const h of tagar) {
      if (h === k.rapat) return k;
      if (k.rapat.length >= 5 && h.startsWith(k.rapat)) return k;
      if (k.rapat.length >= 7 && h.includes(k.rapat)) return k;
    }
  }
  return null;
}

/** Sidik jari daftar kata kunci — berubah = rencana putaran disusun ulang. */
export function sidikKataKunci(kunci: readonly KataKunci[]): string {
  return kunci
    .map((k) => k.kata)
    .sort()
    .join("|");
}

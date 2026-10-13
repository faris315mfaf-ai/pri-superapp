// Koordinator bot "Nara" (tahap 3, 13 Okt 2026) — bagian MURNI: kosakata aksi TERTUTUP, prompt,
// penguraian keluaran model, dan pagar usulan. Tanpa jaringan/basis data; teruji.
//
// Prinsip: teks model TIDAK PERNAH menjadi aksi. Model hanya mengusulkan (aksi dari daftar tetap +
// nama bot + parameter); KODE ini yang memvalidasi tiap bagian, menyusun judul/pagar sendiri, dan
// menolak apa pun di luar kosakata. Eksekusi baru terjadi setelah master menyetujui.
import { kunciKanonik } from "@/lib/bot-kunci";
import { KUOTA_BOT_MAKS, KUOTA_BOT_MIN } from "@/lib/bot-tipe";

export const AKSI_KOORDINATOR = ["kerjakan_url", "cari_sekarang", "ubah_kuota", "jeda", "lanjut"] as const;
export type AksiKoordinator = (typeof AKSI_KOORDINATOR)[number];

export const LABEL_AKSI: Record<AksiKoordinator, string> = {
  kerjakan_url: "Kerjakan tautan",
  cari_sekarang: "Cari sekarang",
  ubah_kuota: "Ubah kuota",
  jeda: "Jeda bot",
  lanjut: "Lanjutkan bot",
};

export const KOORDINATOR_KEBIJAKAN = {
  /** Usulan terbuka (menunggu) sekaligus. */
  TERBUKA_MAKS: 3,
  /** Usulan dari satu balasan model. */
  USULAN_PER_BALASAN: 2,
  /** Usulan menunggu lebih dari ini otomatis kedaluwarsa. */
  KEDALUWARSA_MENIT: 120,
  /** Panjang maksimal alasan/topik (dipotong). */
  ALASAN_MAKS: 300,
  TOPIK_MAKS: 300,
  BALASAN_MAKS: 700,
} as const;

export type ParamUsulan = { url?: string; topik?: string; kuota?: number };
export type TandaPagar = ["ok" | "warn" | "bad", string];

export type UsulanBaru = {
  aksi: AksiKoordinator;
  bot_id: number;
  param: ParamUsulan;
  judul: string;
  alasan: string;
};

export type UsulanApi = {
  id: number;
  aksi: AksiKoordinator;
  aksi_label: string;
  bot_id: number;
  bot_nama: string;
  param: ParamUsulan;
  judul: string;
  alasan: string;
  pagar: TandaPagar[];
  status: "menunggu" | "disetujui" | "ditolak" | "dijalankan" | "gagal" | "kedaluwarsa";
  dibuat_pada: string;
  diputus_pada: string | null;
  hasil: string;
  /** Bot sasaran sedang tidur (tanpa API key): tombol Setujui dinonaktifkan. */
  bot_tidur: boolean;
};

export type StatusKoordinator = {
  tabel_ada: boolean;
  induk_siap: boolean;
  nama: string;
  peran: string;
  persona: string;
  penyedia: "deepseek" | "gemini" | null;
  kunci_samar: string;
  diubah_pada: string | null;
  teruji_pada: string | null;
  hasil_uji: string | null;
  terbuka: UsulanApi[];
  riwayat: UsulanApi[];
};

export type AksiKoordinatorApi =
  | { aksi: "simpan"; penyedia: "deepseek" | "gemini"; kunci: string }
  | { aksi: "hapus" }
  | { aksi: "uji" }
  | { aksi: "kepribadian"; peran: string; persona: string }
  | { aksi: "setuju"; id: number }
  | { aksi: "tolak"; id: number };

/** Keadaan satu bot untuk prompt & pagar (snapshot saat usulan dibuat). */
export type KeadaanBotKoor = {
  id: number;
  nama: string;
  peran: string;
  aktif: boolean;
  jeda: boolean;
  /** Punya API key (bangun). false = tidur di kamar tidur. */
  punyaOtak: boolean;
  kuotaHarian: number;
  dibuatHariIni: number;
  tugas: { judul: string; tahap: string } | null;
  antreAcc: number;
};

const bersih = (s: unknown, maks: number): string =>
  typeof s === "string" ? s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maks) : "";

const norm = (s: string): string => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

// ---------------------------------------------------------------- prompt

export const SISTEM_KOORDINATOR =
  "Kamu koordinator redaksi TV Rakyat (media berita partai di Indonesia). Tugasmu membagi pekerjaan ke agen bot berdasarkan permintaan pemilik dan keadaan nyata mereka. " +
  "Kamu HANYA MENGUSULKAN; pemilik yang menyetujui. Kamu tidak bisa memposting, tidak bisa menjalankan apa pun sendiri. " +
  "ATURAN: gunakan hanya agen yang tercantum; jangan menugaskan agen yang berstatus TIDUR; jangan mengarang tautan, hanya pakai tautan yang ditulis pemilik; " +
  "jangan menjanjikan hasil; jelaskan alasan singkat. Maksimal 2 usulan. Aksi yang sah: kerjakan_url (butuh url dari pemilik), cari_sekarang, ubah_kuota (kuota 1-6), jeda, lanjut. " +
  'Balas HANYA JSON: {"balasan":"1-3 kalimat untuk pemilik","usulan":[{"aksi":"...","bot":"nama agen","alasan":"...","url":"opsional","topik":"opsional","kuota":opsional}]}. ' +
  "Bila tidak ada yang perlu diusulkan, usulan = [].";

export type RiwayatKoor = { nama: string; teks: string };

export function bangunPromptKoordinator(p: { pesan: string; namaPemilik: string; riwayat: readonly RiwayatKoor[]; bots: readonly KeadaanBotKoor[]; terbuka: number }): string {
  const baris = p.bots.map((b) => {
    const status = !b.punyaOtak ? "TIDUR (belum punya API key; tidak bisa ditugasi)" : !b.aktif ? "nonaktif" : b.jeda ? "dijeda" : b.tugas ? `bekerja: "${bersih(b.tugas.judul, 80)}" (${b.tugas.tahap})` : "menganggur";
    return `- ${b.nama} (${b.peran}): ${status}; kuota ${b.dibuatHariIni}/${b.kuotaHarian}; menunggu ACC ${b.antreAcc}`;
  });
  const riwayat = p.riwayat.slice(-8).map((r) => `${r.nama}: ${bersih(r.teks, 240)}`);
  return [
    "KEADAAN AGEN:",
    ...baris,
    "",
    `Usulan terbuka saat ini: ${p.terbuka} dari maksimal ${KOORDINATOR_KEBIJAKAN.TERBUKA_MAKS}.`,
    "",
    "PERCAKAPAN TERAKHIR:",
    riwayat.length ? riwayat.join("\n") : "(belum ada)",
    "",
    `PERMINTAAN dari ${p.namaPemilik}: ${bersih(p.pesan, 1000)}`,
  ].join("\n");
}

// ---------------------------------------------------------------- penguraian

export type HasilUrai = {
  balasan: string;
  usulan: UsulanBaru[];
  /** Alasan tiap butir usulan yang dibuang (untuk log/penjelasan); tidak dikirim mentah ke layar. */
  dibuang: string[];
};

const ALASAN_BUANG = {
  aksi: "aksi di luar daftar",
  bot: "agen tidak dikenal",
  url: "tautan tidak sah atau bukan dari pemilik",
  kuota: "kuota di luar 1-6",
};

/** URL yang boleh dipakai: https, platform dikenal, DAN ditulis persis oleh pemilik di pesannya (anti-karangan). */
export function urlDariPesan(url: unknown, pesanPemilik: string): string | null {
  if (typeof url !== "string") return null;
  const u = url.trim();
  if (u.length < 8 || u.length > 2048 || /\s/.test(u)) return null;
  const dengan = /^https?:\/\//i.test(u) ? u : `https://${u}`;
  const k = kunciKanonik(dengan);
  if (!k) return null;
  // Bandingkan KUNCI KANONIK, bukan potongan teks: tautan terpotong/diubah model ("…/video/7123456" dari "…/video/7123456789…")
  // menghasilkan kunci lain dan ditolak. Yang sah hanya tautan yang benar-benar ditulis pemilik.
  const dariPesan = new Set<string>();
  for (const token of pesanPemilik.split(/\s+/)) {
    const t = token.replace(/^[(\[<"']+|[)\]>"',.;!?]+$/g, "");
    if (t.length < 8) continue;
    const kk = kunciKanonik(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (kk) dariPesan.add(kk.kunci);
  }
  if (!dariPesan.has(k.kunci)) return null;
  return dengan.replace(/^http:\/\//i, "https://");
}

/**
 * Keluaran model (JSON) → balasan + usulan tervalidasi. Bentuk salah / butir di luar kosakata dibuang;
 * tidak pernah melempar. `pesanPemilik` dipakai memastikan tautan benar-benar dari pemilik.
 */
export function uraiKeluaran(jawaban: string, bots: readonly KeadaanBotKoor[], pesanPemilik: string): HasilUrai {
  let data: unknown = null;
  try {
    data = JSON.parse(jawaban);
  } catch {
    const m = /\{[\s\S]*\}/.exec(jawaban);
    if (m) {
      try {
        data = JSON.parse(m[0]);
      } catch {
        data = null;
      }
    }
  }
  const kosong: HasilUrai = { balasan: "", usulan: [], dibuang: ["keluaran bukan JSON"] };
  if (!data || typeof data !== "object" || Array.isArray(data)) return kosong;
  const o = data as Record<string, unknown>;
  const balasan = bersih(o.balasan, KOORDINATOR_KEBIJAKAN.BALASAN_MAKS).replace(/https?:\/\/\S+/gi, "").trim();
  const hasil: HasilUrai = { balasan, usulan: [], dibuang: [] };
  const daftar = Array.isArray(o.usulan) ? o.usulan : [];
  for (const butir of daftar.slice(0, KOORDINATOR_KEBIJAKAN.USULAN_PER_BALASAN + 2)) {
    if (hasil.usulan.length >= KOORDINATOR_KEBIJAKAN.USULAN_PER_BALASAN) break;
    if (!butir || typeof butir !== "object" || Array.isArray(butir)) {
      hasil.dibuang.push("butir bukan objek");
      continue;
    }
    const b = butir as Record<string, unknown>;
    const aksi = (AKSI_KOORDINATOR as readonly string[]).includes(String(b.aksi)) ? (b.aksi as AksiKoordinator) : null;
    if (!aksi) {
      hasil.dibuang.push(ALASAN_BUANG.aksi);
      continue;
    }
    const nama = typeof b.bot === "string" ? norm(b.bot) : "";
    const bot = bots.find((x) => norm(x.nama) === nama);
    if (!bot) {
      hasil.dibuang.push(ALASAN_BUANG.bot);
      continue;
    }
    const param: ParamUsulan = {};
    if (aksi === "kerjakan_url") {
      const url = urlDariPesan(b.url, pesanPemilik);
      if (!url) {
        hasil.dibuang.push(ALASAN_BUANG.url);
        continue;
      }
      param.url = url;
      const topik = bersih(typeof b.topik === "string" ? b.topik.replace(/https?:\/\/\S+/gi, " ") : "", KOORDINATOR_KEBIJAKAN.TOPIK_MAKS);
      if (topik) param.topik = topik;
    }
    if (aksi === "ubah_kuota") {
      const k = b.kuota;
      if (typeof k !== "number" || !Number.isInteger(k) || k < KUOTA_BOT_MIN || k > KUOTA_BOT_MAKS) {
        hasil.dibuang.push(ALASAN_BUANG.kuota);
        continue;
      }
      param.kuota = k;
    }
    hasil.usulan.push({ aksi, bot_id: bot.id, param, judul: judulUsulan(aksi, bot.nama, param), alasan: bersih(b.alasan, KOORDINATOR_KEBIJAKAN.ALASAN_MAKS) });
  }
  return hasil;
}

/** Judul disusun KODE (bukan model) supaya tak bisa disusupi teks. */
export function judulUsulan(aksi: AksiKoordinator, namaBot: string, param: ParamUsulan): string {
  switch (aksi) {
    case "kerjakan_url":
      return `Kerjakan tautan → ${namaBot}`;
    case "cari_sekarang":
      return `Cari video sekarang → ${namaBot}`;
    case "ubah_kuota":
      return `Kuota ${namaBot} → ${param.kuota ?? "?"} per hari`;
    case "jeda":
      return `Jeda ${namaBot}`;
    case "lanjut":
      return `Lanjutkan ${namaBot}`;
  }
}

// ---------------------------------------------------------------- pagar

/**
 * Pemeriksaan pagar untuk satu usulan terhadap keadaan bot. `boleh=false` (ada tanda "bad")
 * berarti usulan TIDAK dibuat; pesan alasannya disampaikan koordinator ke pemilik.
 */
export function pagarUsulan(u: Pick<UsulanBaru, "aksi" | "param">, b: KeadaanBotKoor): { boleh: boolean; tanda: TandaPagar[] } {
  const t: TandaPagar[] = [];
  const bad = (x: string) => t.push(["bad", x]);
  const ok = (x: string) => t.push(["ok", x]);
  const warn = (x: string) => t.push(["warn", x]);
  if (!b.aktif) bad(`${b.nama} nonaktif`);
  switch (u.aksi) {
    case "kerjakan_url":
    case "cari_sekarang": {
      if (!b.punyaOtak) bad(`${b.nama} tertidur: belum punya API key`);
      else ok("Agen bangun (punya API key)");
      if (b.jeda) bad(`${b.nama} sedang dijeda`);
      if (u.aksi === "kerjakan_url") {
        if (b.tugas) bad(`${b.nama} masih punya tugas ("${bersih(b.tugas.judul, 50)}")`);
        else ok("Tidak ada tugas berjalan");
        if (b.dibuatHariIni >= b.kuotaHarian) bad(`Kuota hari ini habis (${b.dibuatHariIni}/${b.kuotaHarian})`);
        else ok(`Kuota tersisa ${b.kuotaHarian - b.dibuatHariIni}`);
        ok("Anti-tabrakan diperiksa lagi saat dijalankan");
        warn("Hasil tetap menunggu keputusan di Antrean ACC");
      } else {
        warn("Memicu panen (beban yt-dlp di VPS mesin)");
      }
      break;
    }
    case "ubah_kuota": {
      const k = u.param.kuota;
      if (typeof k !== "number" || k < KUOTA_BOT_MIN || k > KUOTA_BOT_MAKS) bad(`Kuota harus ${KUOTA_BOT_MIN}-${KUOTA_BOT_MAKS}`);
      else if (k === b.kuotaHarian) bad(`Kuota sudah ${k}`);
      else ok(`Dalam batas ${KUOTA_BOT_MIN}-${KUOTA_BOT_MAKS}`);
      warn("Mengubah perilaku bot — wajib persetujuan");
      break;
    }
    case "jeda":
      if (b.jeda) bad(`${b.nama} sudah dijeda`);
      else {
        ok("Bot berhenti mengambil tugas baru");
        warn("Jeda berlaku sampai dilanjutkan");
      }
      break;
    case "lanjut":
      if (!b.jeda) bad(`${b.nama} tidak sedang dijeda`);
      else ok("Mencabut jeda bot");
      break;
  }
  return { boleh: !t.some((x) => x[0] === "bad"), tanda: t };
}

/** Ringkas alasan penolakan pagar untuk disampaikan ke pemilik. */
export function alasanPagar(tanda: readonly TandaPagar[]): string {
  return tanda.filter((x) => x[0] === "bad").map((x) => x[1]).join("; ");
}

export function usulanKedaluwarsa(dibuatPadaIso: string, sekarangMs: number): boolean {
  const t = Date.parse(dibuatPadaIso);
  return !Number.isFinite(t) || sekarangMs - t > KOORDINATOR_KEBIJAKAN.KEDALUWARSA_MENIT * 60_000;
}

export const PESAN_TANPA_OTAK =
  "Nara belum punya API key, jadi belum bisa berpikir. Pasang di TVR Saya → Otak Bot → Koordinator.";

export function pesanKoordinatorGagal(kode: string): string {
  switch (kode) {
    case "tanpa_kunci":
      return PESAN_TANPA_OTAK;
    case "kunci_ditolak":
      return "Nara tidak bisa berpikir: penyedia menolak API key-nya.";
    case "kuota":
      return "Nara tidak bisa berpikir: kuota API key-nya habis atau dibatasi.";
    case "waktu_habis":
      return "Nara tidak menjawab tepat waktu. Coba kirim lagi.";
    case "kunci_rusak":
      return "Nara tidak bisa berpikir: API key tersimpan tak terbaca, simpan ulang.";
    default:
      return "Nara sedang tidak bisa menjawab. Coba lagi sebentar.";
  }
}

/** Validasi badan aksi master di /api/bot/usulan & /api/bot/koordinator. */
export function validasiIdUsulan(x: unknown): number | null {
  return typeof x === "number" && Number.isSafeInteger(x) && x > 0 ? x : null;
}

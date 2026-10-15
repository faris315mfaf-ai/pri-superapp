// ============================================================
// VIDEO WAJIB BERNOMOR PERINTAH (15 Okt 2026) — bagian MURNI.
//
// Tanpa database, tanpa jaringan: aman dipakai server DAN klien, dan bisa
// diuji (tests/uji-video-wajib.mts).
//
// Aturan pokok:
//   • Kategori sebuah video ditentukan SATU-SATUNYA oleh perintah (video
//     wajib) yang dipilih Pimred — tanpa hashtag, tanpa model bahasa.
//   • Perintah "wajib posting" berlaku OTOMATIS untuk semua akun yang
//     tersambung dan semua platform yang tertaut: tidak ada daftar sasaran.
//   • Kepatuhan dihitung dari catatan unggahan/laporan yang SUDAH ada.
// ============================================================

/** Enam sosmed TVR Saya (urutan tampilan). */
export const PLATFORM_WAJIB = ["tiktok", "instagram", "youtube", "facebook", "threads", "twitter"] as const;

export const LABEL_PLATFORM_WAJIB: Record<string, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
  threads: "Threads",
  twitter: "X",
};

/** Singkatan satu huruf di daftar akun (T, I, Y, F, H, X). */
export const SINGKATAN_PLATFORM_WAJIB: Record<string, string> = {
  tiktok: "T",
  instagram: "I",
  youtube: "Y",
  facebook: "F",
  threads: "H",
  twitter: "X",
};

export type PolaWajib = "harian" | "sekali";

export type PengaturanWajib = {
  wajib_posting: boolean;
  pola: PolaWajib;
  /** 'HH:MM' WIB. */
  batas_jam: string;
  pengingat: boolean;
};

export const PENGATURAN_WAJIB_BAWAAN: PengaturanWajib = {
  wajib_posting: false,
  pola: "harian",
  batas_jam: "18:00",
  pengingat: true,
};

export function bersihkanPola(v: unknown): PolaWajib {
  return v === "sekali" ? "sekali" : "harian";
}

/** 'HH:MM' yang sah (00:00–23:59), selain itu bawaan 18:00. */
export function bersihkanBatasJam(v: unknown): string {
  const s = String(v ?? "").trim();
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s);
  if (!m) return PENGATURAN_WAJIB_BAWAAN.batas_jam;
  return `${m[1]!.padStart(2, "0")}:${m[2]}`;
}

/** "setiap hari · sebelum 18.00" / "sekali · sebelum 18.00". */
export function teksPola(p: Pick<PengaturanWajib, "pola" | "batas_jam">): string {
  return `${p.pola === "sekali" ? "sekali" : "setiap hari"} · sebelum ${p.batas_jam.replace(":", ".")}`;
}

// ------------------------------------------------------------
// Tanggal WIB
// ------------------------------------------------------------

const MS_WIB = 7 * 3600_000;

/** 'YYYY-MM-DD' menurut WIB untuk satu waktu (ms atau ISO). "" bila tidak sah. */
export function tanggalWibWajib(waktu: number | string | null | undefined): string {
  const ms = typeof waktu === "number" ? waktu : Date.parse(String(waktu ?? ""));
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + MS_WIB).toISOString().slice(0, 10);
}

/** Geser tanggal 'YYYY-MM-DD' sebanyak n hari (boleh negatif). */
export function geserTanggal(tanggal: string, hari: number): string {
  const t = Date.parse(`${tanggal}T00:00:00Z`);
  if (!Number.isFinite(t)) return tanggal;
  return new Date(t + hari * 86_400_000).toISOString().slice(0, 10);
}

/** Tanggal 'YYYY-MM-DD' yang sah, atau null. */
export function tanggalSah(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return Number.isFinite(Date.parse(`${s}T00:00:00Z`)) ? s : null;
}

/** Jam sekarang (WIB) dalam menit sejak tengah malam. */
export function menitWib(ms: number): number {
  const d = new Date(ms + MS_WIB);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** 'HH:MM' → menit sejak tengah malam. */
export function menitDariJam(jam: string): number {
  const [j, m] = bersihkanBatasJam(jam).split(":");
  return Number(j) * 60 + Number(m);
}

// ------------------------------------------------------------
// Apakah perintah berlaku pada sebuah hari?
// ------------------------------------------------------------

export type PerintahBerlaku = {
  aktif: boolean;
  /** 'YYYY-MM-DD' atau "" */
  batas_waktu: string;
  /** Tanggal WIB perintah diterbitkan. */
  dibuat_tanggal: string;
  wajib_posting: boolean;
  pola: PolaWajib;
};

/**
 * Wajib posting dihitung pada tanggal ini? Perintah harian berlaku sejak
 * hari terbit sampai batas waktu (atau selama masih aktif). Perintah
 * sekali dihitung sejak terbit sampai batas waktu: satu unggahan kapan pun
 * dalam rentang itu sudah memenuhi.
 */
export function berlakuPada(p: PerintahBerlaku, tanggal: string): boolean {
  if (!p.wajib_posting) return false;
  if (p.dibuat_tanggal && tanggal < p.dibuat_tanggal) return false;
  if (p.batas_waktu && tanggal > p.batas_waktu) return false;
  return true;
}

// ------------------------------------------------------------
// Kepatuhan (siapa yang sudah memposting)
// ------------------------------------------------------------

/** Satu akun anggota yang tersambung beserta yang sudah diposting. */
export type AkunKepatuhan = {
  user_id: string;
  nama: string;
  wilayah: string;
  /** Platform yang tertaut — SEMUANYA wajib. */
  platform: string[];
  /** Platform yang sudah diposting untuk perintah ini pada hari itu. */
  sudah: string[];
};

export type StatusKepatuhan = "selesai" | "sebagian" | "belum";

export type BarisPantauWajib = AkunKepatuhan & {
  status: StatusKepatuhan;
  /** Per platform wajib: sudah/belum, urut PLATFORM_WAJIB. */
  rinci: { platform: string; sudah: boolean }[];
};

export type RingkasKepatuhan = {
  /** Jumlah akun yang wajib (punya ≥1 platform tertaut). */
  akun: number;
  selesai: number;
  sebagian: number;
  belum: number;
  /** selesai ÷ akun, 0–100 (bulat). */
  persen: number;
  per_wilayah: { nama: string; selesai: number; akun: number; persen: number }[];
  per_platform: { platform: string; sudah: number; wajib: number }[];
};

function urutPlatform(a: string, b: string): number {
  const ia = (PLATFORM_WAJIB as readonly string[]).indexOf(a);
  const ib = (PLATFORM_WAJIB as readonly string[]).indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
}

export function statusKepatuhan(wajib: string[], sudah: string[]): StatusKepatuhan {
  if (wajib.length === 0) return "belum";
  const set = new Set(sudah);
  const dapat = wajib.filter((p) => set.has(p)).length;
  if (dapat === wajib.length) return "selesai";
  return dapat > 0 ? "sebagian" : "belum";
}

/** Persen bulat 0–100; 0 bila pembagi 0. */
export function persenBulat(bagian: number, total: number): number {
  return total > 0 ? Math.round((bagian / total) * 100) : 0;
}

/** Menyusun baris + ringkasan dari data mentah. Murni dan deterministik. */
export function susunKepatuhan(akun: AkunKepatuhan[]): { daftar: BarisPantauWajib[]; ringkas: RingkasKepatuhan } {
  const daftar: BarisPantauWajib[] = akun
    .filter((a) => a.platform.length > 0)
    .map((a) => {
      const wajib = [...new Set(a.platform)].sort(urutPlatform);
      const sudahSet = new Set(a.sudah);
      return {
        ...a,
        platform: wajib,
        status: statusKepatuhan(wajib, a.sudah),
        rinci: wajib.map((p) => ({ platform: p, sudah: sudahSet.has(p) })),
      };
    });
  // Yang belum paling atas (perlu dikejar), lalu sebagian, lalu selesai; nama sebagai pemutus.
  const bobot: Record<StatusKepatuhan, number> = { belum: 0, sebagian: 1, selesai: 2 };
  daftar.sort((x, y) => bobot[x.status] - bobot[y.status] || x.nama.localeCompare(y.nama, "id"));

  const wilayah = new Map<string, { selesai: number; akun: number }>();
  const platform = new Map<string, { sudah: number; wajib: number }>();
  let selesai = 0;
  let sebagian = 0;
  let belum = 0;
  for (const b of daftar) {
    if (b.status === "selesai") selesai += 1;
    else if (b.status === "sebagian") sebagian += 1;
    else belum += 1;
    const w = wilayah.get(b.wilayah) ?? { selesai: 0, akun: 0 };
    w.akun += 1;
    if (b.status === "selesai") w.selesai += 1;
    wilayah.set(b.wilayah, w);
    for (const r of b.rinci) {
      const p = platform.get(r.platform) ?? { sudah: 0, wajib: 0 };
      p.wajib += 1;
      if (r.sudah) p.sudah += 1;
      platform.set(r.platform, p);
    }
  }
  return {
    daftar,
    ringkas: {
      akun: daftar.length,
      selesai,
      sebagian,
      belum,
      persen: persenBulat(selesai, daftar.length),
      per_wilayah: [...wilayah.entries()]
        .map(([nama, w]) => ({ nama, selesai: w.selesai, akun: w.akun, persen: persenBulat(w.selesai, w.akun) }))
        // Yang paling tertinggal dulu — itu yang perlu dikejar.
        .sort((a, b) => a.persen - b.persen || b.akun - a.akun || a.nama.localeCompare(b.nama, "id")),
      per_platform: [...platform.entries()]
        .map(([p, v]) => ({ platform: p, sudah: v.sudah, wajib: v.wajib }))
        .sort((a, b) => urutPlatform(a.platform, b.platform)),
    },
  };
}

/** Nama wilayah dari data anggota: zona, atau nama DPD/DPC, atau "Pusat". */
export function wilayahAnggota(u: {
  zona?: string | null;
  divisi?: string | null;
  sub_divisi?: string | null;
}): string {
  const zona = (u.zona ?? "").trim();
  if (zona) return zona;
  const divisi = (u.divisi ?? "").trim();
  const sub = (u.sub_divisi ?? "").trim();
  if ((divisi === "DPD" || divisi === "DPC") && sub) return `${divisi} ${sub}`;
  if (divisi === "Divisi Sayap Partai" && sub) return `Sayap ${sub}`;
  return "Pusat";
}

// ------------------------------------------------------------
// Kemajuan SATU anggota atas sebuah perintah (kartu anggota)
// ------------------------------------------------------------

export type KemajuanSaya = {
  /** Platform tertaut milik saya (semuanya wajib). */
  platform_wajib: string[];
  /** Yang sudah saya posting untuk perintah ini pada hari ini. */
  sudah: string[];
  selesai: boolean;
  /** Belum ada akun tertaut sama sekali → belum bisa memenuhi. */
  tanpa_akun: boolean;
};

export function kemajuanSaya(platformWajib: string[], sudah: string[]): KemajuanSaya {
  const wajib = [...new Set(platformWajib)].sort(urutPlatform);
  const set = new Set(sudah);
  return {
    platform_wajib: wajib,
    sudah: wajib.filter((p) => set.has(p)),
    selesai: wajib.length > 0 && wajib.every((p) => set.has(p)),
    tanpa_akun: wajib.length === 0,
  };
}

// ------------------------------------------------------------
// Perintah yang sedang dikerjakan anggota (dibawa dari tombol "Buat
// video dari perintah ini" sampai ke formulir unggah)
// ------------------------------------------------------------

export type PerintahAktif = {
  id: string;
  judul: string;
  kategori: string;
};

/** Kunci penyimpanan lokal per pengguna. */
export function kunciPerintahAktif(userId: string): string {
  return `pri.perintah-aktif.${userId}`;
}

/** Baca ulang dari teks tersimpan; null bila rusak/tidak lengkap. */
export function uraiPerintahAktif(teks: string | null): PerintahAktif | null {
  if (!teks) return null;
  try {
    const o = JSON.parse(teks) as Record<string, unknown>;
    const id = String(o.id ?? "").trim();
    const kategori = String(o.kategori ?? "").trim();
    if (!/^\d+$/.test(id) || !kategori) return null;
    return { id, judul: String(o.judul ?? "").slice(0, 200), kategori: kategori.slice(0, 120) };
  } catch {
    return null;
  }
}

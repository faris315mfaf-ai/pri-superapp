// BOT REDAKSI 3F tahap A — asal video dari KREDIT di takarir (13 Okt 2026). MURNI.
//
// Pertanyaan yang dijawab: video sumber ini (mis. unggahan NTV) berasal dari mana, dan
// apakah itu video MILIK akun sumber sendiri atau dikutip dari pihak lain? Hanya dari teks
// (judul/takarir) — gratis, tanpa mengunduh video. Pemeriksaan visual (sidik bingkai) dan
// pencarian sumber lain adalah tahap berikutnya (docs/BOT-REDAKSI-ASAL-VIDEO.md).
//
// Kejujuran hasil: ini PETUNJUK dari tulisan orang, bukan bukti. Keyakinan dibuat rendah-sedang
// dan selalu ditampilkan ke master di Antrean ACC; bot tidak pernah "yakin" sendiri.
import { kunciKanonik } from "@/lib/bot-kunci";

export type StatusAsal =
  /** Kredit memuat tautan video yang dikenal → kunci kanonik tersedia (bisa dicek tabrakan). */
  | "kredit_url"
  /** Kredit menyebut akun/nama pihak lain, tanpa tautan. */
  | "kredit_akun"
  /** Kredit menunjuk akun sumber itu sendiri → konten milik penerbit, bukan rekaman pihak lain. */
  | "milik_penerbit"
  /** Kredit ada tetapi tak menunjuk siapa pun ("Istimewa", "netizen"). */
  | "kredit_generik"
  | "tanpa_kredit";

export type AsalVideo = {
  status: StatusAsal;
  /** 0..1, perkiraan kasar. */
  keyakinan: number;
  /** Akun asal tanpa "@" huruf kecil, atau "" bila tak ada. */
  akun: string;
  /** Platform asal ("instagram", "tiktok", ...) atau "". */
  platform: string;
  /** Tautan asal bila ada. */
  url: string;
  /** Kunci kanonik tautan asal ("tiktok:123") atau null. */
  kunci: string | null;
  /** Potongan takarir yang menjadi dasar (<= 160 karakter). */
  kutipan: string;
};

export const MAKS_KUTIPAN = 160;

const KOSONG: AsalVideo = { status: "tanpa_kredit", keyakinan: 0, akun: "", platform: "", url: "", kunci: null, kutipan: "" };

// "Sumber:", "Credit:", "cr:", "Video:", "Via:", "Dok.:", "Repost from:" ... + penanda emoji dan ©.
const POLA_PENANDA =
  /(?:^|[\s(\[|•·\-–—])(sumber|source|sources|credit|credits|kredit|cr|video|foto|dok|dokumentasi|via|courtesy|footage|repost(?:ed)?(?:\s+from)?)\s*[:：]\s*([^\n\r]{1,200})/gi;
const POLA_EMOJI = /(?:📹|🎥|📸|🎬)\s*[:：]?\s*([^\n\r]{1,120})/g;
const POLA_HAK = /(?:©|\(c\))\s*([^\n\r]{1,120})/gi;
const POLA_URL = /https?:\/\/[^\s)>\]"'<]+/gi;
const POLA_HANDLE = /@([A-Za-z0-9._]{2,40})/g;

const PETA_PLATFORM: [RegExp, string][] = [
  [/\b(instagram|ig)\b/i, "instagram"],
  [/\b(tiktok|tik\s?tok|tt)\b/i, "tiktok"],
  [/\b(youtube|yt)\b/i, "youtube"],
  [/\b(facebook|fb)\b/i, "facebook"],
  [/\b(twitter|x)\b/i, "x"],
];

const GENERIK = new Set([
  "istimewa", "ist", "pribadi", "dokpribadi", "dokumentasipribadi", "netizen", "warganet", "warga", "masyarakat",
  "medsos", "sosmed", "mediasosial", "internet", "google", "screenshot", "tangkapanlayar", "anonim", "unknown",
  "instagram", "tiktok", "youtube", "facebook", "twitter", "x", "ig", "yt", "fb", "tt",
]);

const normal = (s: string): string => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

/** "@NTVNews" / "https://instagram.com/ntvnews/" / "ntv news" → "ntvnews". */
export function normalAkun(s: string | null | undefined): string {
  let t = String(s ?? "").trim();
  if (/^https?:\/\//i.test(t)) {
    const bagian = t.replace(/^https?:\/\/[^/]+\/?/i, "").split(/[/?#]/).filter(Boolean);
    t = bagian.find((b) => !/^(reel|reels|p|tv|video|watch|shorts|@?video)$/i.test(b)) ?? "";
  }
  return normal(t.replace(/^@+/, ""));
}

function platformDariTeks(teks: string): string {
  for (const [pola, nama] of PETA_PLATFORM) if (pola.test(teks)) return nama;
  return "";
}

/** Pengguna dari URL profil/video platform (null bila tak terbaca). */
function penggunaDariUrl(url: string): string {
  try {
    const u = new URL(url);
    const bagian = u.pathname.split("/").filter(Boolean);
    const berArroba = bagian.find((b) => b.startsWith("@"));
    if (berArroba) return normal(berArroba);
    const host = u.hostname.toLowerCase();
    if (host.endsWith("instagram.com") || host.endsWith("twitter.com") || host.endsWith("x.com") || host.endsWith("facebook.com")) {
      const pertama = bagian[0] ?? "";
      if (pertama && !/^(reel|reels|p|tv|watch|share|status|stories|video|videos|i)$/i.test(pertama)) return normal(pertama);
    }
  } catch {
    /* URL rusak */
  }
  return "";
}

type Segmen = { teks: string };

function kumpulkanSegmen(teks: string): Segmen[] {
  const hasil: Segmen[] = [];
  for (const pola of [POLA_PENANDA, POLA_EMOJI, POLA_HAK]) {
    pola.lastIndex = 0;
    for (const m of teks.matchAll(pola)) {
      // POLA_PENANDA: grup 2 = isi; yang lain: grup 1.
      const isi = (pola === POLA_PENANDA ? m[2] : m[1]) ?? "";
      const potong = isi.split(/\s#|\s\|\s|\s{3,}/)[0].trim();
      if (potong) hasil.push({ teks: potong.slice(0, 160) });
    }
  }
  return hasil;
}

export type MasukanAsal = {
  judul?: string | null;
  caption?: string | null;
  /** Akun sumber tempat video ini ditemukan (handle atau URL profil). */
  sumberHandle?: string | null;
  sumberPlatform?: string | null;
  /** URL video itu sendiri (tautan ke dirinya diabaikan). */
  urlSendiri?: string | null;
};

/** Analisis kredit dari judul + takarir. Tidak pernah melempar. */
export function analisaAsal(m: MasukanAsal): AsalVideo {
  const teks = `${m.caption ?? ""}\n${m.judul ?? ""}`.replace(/\r/g, "\n");
  const segmen = kumpulkanSegmen(teks);
  if (segmen.length === 0) return { ...KOSONG };

  const diri = normalAkun(m.sumberHandle);
  const kunciDiri = m.urlSendiri ? (kunciKanonik(m.urlSendiri)?.kunci ?? null) : null;
  const samaDiri = (n: string): boolean => diri.length >= 3 && n.length >= 3 && (n === diri || n.includes(diri) || diri.includes(n));

  let terbaik: AsalVideo | null = null;
  const nilai = (a: AsalVideo): number => ({ kredit_url: 4, kredit_akun: 3, milik_penerbit: 2, kredit_generik: 1, tanpa_kredit: 0 })[a.status];
  const usul = (a: AsalVideo) => {
    if (!terbaik || nilai(a) > nilai(terbaik)) terbaik = a;
  };

  for (const { teks: seg } of segmen) {
    const kutipan = seg.slice(0, MAKS_KUTIPAN);
    const urls = [...seg.matchAll(POLA_URL)].map((x) => x[0].replace(/[.,;]+$/, ""));
    const handle = [...seg.matchAll(POLA_HANDLE)].map((x) => x[1].toLowerCase())[0] ?? "";
    const platformTeks = platformDariTeks(seg.replace(POLA_URL, " "));

    // 1) Tautan video yang dikenal.
    let dipakai = false;
    for (const u of urls) {
      const k = kunciKanonik(u);
      if (k && k.kunci !== kunciDiri) {
        const pengguna = penggunaDariUrl(u);
        if (samaDiri(pengguna)) {
          usul({ status: "milik_penerbit", keyakinan: 0.85, akun: pengguna, platform: k.platform, url: u, kunci: k.kunci, kutipan });
        } else {
          usul({ status: "kredit_url", keyakinan: 0.9, akun: pengguna || handle || "", platform: k.platform, url: u, kunci: k.kunci, kutipan });
        }
        dipakai = true;
      }
    }
    if (dipakai) continue;

    // 2) Akun/nama tanpa tautan video.
    const nama = handle || (urls[0] ? penggunaDariUrl(urls[0]) : "") || seg.replace(POLA_URL, " ").replace(/[()\[\]@]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
    const n = normalAkun(nama);
    if (n.length < 2) continue;
    if (samaDiri(n)) {
      usul({ status: "milik_penerbit", keyakinan: 0.8, akun: n, platform: platformTeks || String(m.sumberPlatform ?? "").toLowerCase(), url: "", kunci: null, kutipan });
    } else if (GENERIK.has(n)) {
      usul({ status: "kredit_generik", keyakinan: 0.3, akun: "", platform: platformTeks, url: "", kunci: null, kutipan });
    } else {
      usul({ status: "kredit_akun", keyakinan: handle ? 0.65 : 0.5, akun: handle || n, platform: platformTeks, url: urls[0] ?? "", kunci: null, kutipan });
    }
  }
  return terbaik ?? { ...KOSONG };
}

const LABEL_PLATFORM: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", facebook: "Facebook", x: "X" };

/** "@akun (TikTok)" atau "@akun". */
export function labelAkunAsal(a: AsalVideo): string {
  if (!a.akun) return "";
  const p = LABEL_PLATFORM[a.platform];
  return `@${a.akun}${p ? ` (${p})` : ""}`;
}

/** Label kredit untuk takarir: asal bila diketahui ("@akun (TikTok) via NTV"), selain itu akun tempat video ditemukan. */
export function labelKreditTakarir(a: AsalVideo, labelSumber: string): string {
  if ((a.status === "kredit_url" || a.status === "kredit_akun") && a.akun) {
    const sumber = labelSumber.trim();
    return `${labelAkunAsal(a)}${sumber ? ` via ${sumber}` : ""}`;
  }
  return labelSumber;
}

export type TandaAsal = { jenis: "ok" | "warn" | "bad"; teks: string };

/** Tanda untuk kartu Antrean ACC. */
export function tandaAsal(a: AsalVideo): TandaAsal {
  switch (a.status) {
    case "kredit_url":
      return { jenis: "ok", teks: `Asal tercatat: ${labelAkunAsal(a) || "tautan di takarir"}` };
    case "kredit_akun":
      return { jenis: "ok", teks: `Kredit ke ${labelAkunAsal(a) || a.akun}` };
    case "milik_penerbit":
      return { jenis: "warn", teks: "Kredit menunjuk akun sumber sendiri (konten milik penerbit)" };
    case "kredit_generik":
      return { jenis: "warn", teks: "Kredit generik — asal belum jelas" };
    default:
      return { jenis: "warn", teks: "Asal video tidak diketahui (tanpa kredit)" };
  }
}

/** Kolom bot_kandidat (sql/71) dari hasil analisis. */
export function kolomAsal(a: AsalVideo): { asal_status: StatusAsal; asal_akun: string; asal_url: string; asal_kunci: string | null } {
  return { asal_status: a.status, asal_akun: a.akun, asal_url: a.url.slice(0, 2048), asal_kunci: a.kunci };
}

// ============================================================
// SARAN PASANGAN akun SuperApp ↔ pegawai SADAR (28 Sep 2026). MURNI.
//
// Kenyataan data (28 Sep 2026): 176 pegawai SADAR, 212 akun aktif — 112
// akun mendaftar TANPA email (email sintetis @pri.internal), jadi hanya
// 40 yang cocok lewat email. Nama lengkap yang sama persis menambah 75;
// sisanya beda tulis ("M. Rasendri Hadianto" ↔ "Muhammad Rasendri
// Hadianto", gelar, singkatan).
//
// Berkas ini menilai kemiripan nama dan menyusun SARAN satu-lawan-satu.
// Saran tidak pernah dipasang sendiri: HR yang menyetujui (satu per satu
// atau sekaligus untuk yang "kuat"). Saran lama yang memilih pegawai
// pertama dengan KATA DEPAN sama ("Muhammad …") hampir selalu keliru.
// ============================================================

/** Gelar & sapaan yang dibuang dari nama sebelum dibandingkan. */
const GELAR = new Set([
  "dr", "drs", "dra", "ir", "h", "hj", "prof", "kh", "ust", "ustadz", "bapak", "bpk", "ibu",
  "spd", "sh", "se", "st", "skom", "ssos", "sip", "sag", "shi", "sikom", "mm", "msi", "mpd", "mh", "mt", "amd", "ssi", "skm", "sked", "ak", "ba",
]);

/** Variasi penulisan yang dianggap kata yang sama. */
const SAMA: Record<string, string> = {
  m: "muhammad", mhd: "muhammad", muh: "muhammad", moh: "muhammad", moch: "muhammad", mochamad: "muhammad",
  mochammad: "muhammad", mohamad: "muhammad", mohammad: "muhammad", muhamad: "muhammad", muhammmad: "muhammad",
  mohd: "muhammad", mukhammad: "muhammad",
  abd: "abdul", abdl: "abdul",
  nur: "nur", nurul: "nurul",
};

/** Kata-kata nama yang sudah dinormalkan (huruf kecil, tanpa gelar/tanda baca). */
export function kataNama(nama: string): string[] {
  let s = String(nama ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // Gelar di belakang koma ("Siti Aisyah, S.Pd") dibuang utuh.
  s = s.split(",")[0] ?? "";
  const mentah = s.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const kata: string[] = [];
  for (let i = 0; i < mentah.length; i++) {
    const k = mentah[i];
    const lanjut = mentah[i + 1];
    // "S. Pd" / "S.Kom" terpecah jadi dua kata → dikenali lewat daftar gelar
    // (bukan pola umum: "M. Ali" tidak boleh menjadi "mali").
    if (k.length === 1 && lanjut && lanjut.length <= 4 && GELAR.has(k + lanjut)) {
      i++;
      continue;
    }
    if (GELAR.has(k)) continue;
    kata.push(SAMA[k] ?? k);
  }
  return kata;
}

export function namaNormal(nama: string): string {
  return kataNama(nama).join(" ");
}

/** Jarak edit (Levenshtein) dengan batas: berhenti bila > maks. */
function jarak(a: string, b: string, maks: number): number {
  if (Math.abs(a.length - b.length) > maks) return maks + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let terkecil = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      terkecil = Math.min(terkecil, cur[j]);
    }
    if (terkecil > maks) return maks + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Dua kata dianggap sama: persis, inisial ("r" ↔ "rasendri"), atau salah
 * ketik 1 huruf (≥ 5 huruf, huruf TERAKHIR sama — akhiran seperti
 * putra/putri, dewa/dewi menandai orang yang berbeda, bukan salah ketik).
 */
function kataCocok(a: string, b: string): boolean {
  if (a === b) return true;
  if ((a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b))) return true;
  if (a.length >= 5 && b.length >= 5 && a[a.length - 1] === b[b.length - 1] && jarak(a, b, 1) <= 1) return true;
  return false;
}

/**
 * Kemiripan dua nama, 0–1. 1 = sama persis setelah dinormalkan.
 * Setiap kata nama yang lebih pendek dicari pasangannya di nama yang
 * lebih panjang (satu kata dipakai sekali); inisial dihitung setengah.
 */
export function skorNama(a: string, b: string): number {
  const x = kataNama(a);
  const y = kataNama(b);
  if (x.length === 0 || y.length === 0) return 0;
  if (x.join(" ") === y.join(" ")) return 1;
  // Ditulis rapat ("Destyhelmiati" ↔ "Desty Helmiati").
  if (x.join("") === y.join("")) return 0.97;
  const [pendek, panjang] = x.length <= y.length ? [x, y] : [y, x];
  const terpakai = new Set<number>();
  let nilai = 0;
  for (const k of pendek) {
    let pilih = -1;
    let bobot = 0;
    panjang.forEach((l, i) => {
      if (terpakai.has(i) || !kataCocok(k, l)) return;
      const w = k === l ? 1 : k.length === 1 || l.length === 1 ? 0.5 : 0.9;
      if (w > bobot) {
        bobot = w;
        pilih = i;
      }
    });
    if (pilih >= 0) {
      terpakai.add(pilih);
      nilai += bobot;
    }
  }
  const semuaKataPendekKetemu = terpakai.size === pendek.length;
  // Nama yang lebih pendek seluruhnya ada di nama yang lebih panjang
  // ("Rasendri Hadianto" ↔ "Muhammad Rasendri Hadianto") → cukup mirip,
  // asal lebih dari satu kata (satu kata "Muhammad" saja tidak berarti).
  const dasar = nilai / Math.max(x.length, y.length);
  if (semuaKataPendekKetemu && pendek.length >= 2) return Math.max(dasar, 0.85 * (nilai / pendek.length));
  return dasar;
}

export type CalonAkun = { id: string; nama: string; email: string; username: string };
export type CalonPegawai = { kode: string; nama: string; email: string };

export type SaranPasangan = {
  user_id: string;
  kode: string;
  skor: number;
  /** "kuat" = boleh dipasang sekaligus; "mirip" = periksa dulu. */
  keyakinan: "kuat" | "mirip";
  alasan: string;
};

/** Bagian depan email (sebelum @), huruf kecil; "" untuk email sintetis. */
function depanEmail(email: string): string {
  const e = String(email ?? "").toLowerCase().trim();
  if (!e.includes("@") || /@pri\.internal$/.test(e)) return "";
  return e.split("@")[0].replace(/[^a-z0-9]/g, "");
}

/** Skor tambahan dari email/username: sama persis = hampir pasti orang yang sama. */
function cocokIdentitas(akun: CalonAkun, pegawai: CalonPegawai): boolean {
  const depanSadar = depanEmail(pegawai.email);
  if (!depanSadar || depanSadar.length < 4) return false;
  const depanAkun = depanEmail(akun.email);
  const username = String(akun.username ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return depanSadar === depanAkun || depanSadar === username;
}

export const SKOR_MIN_SARAN = 0.6;

/**
 * Saran satu-lawan-satu untuk akun & pegawai yang BELUM terpasang.
 * Pasangan dinilai dari nama (+ email/username bila sama), diurut skor
 * tertinggi, dipilih rakus tanpa memakai akun/pegawai dua kali. "kuat"
 * hanya bila: skor ≥ 0.97 (atau identitas email/username sama plus nama
 * mirip) DAN tidak ada calon lain dengan skor setara di kedua sisi.
 */
export function susunSaran(akun: CalonAkun[], pegawai: CalonPegawai[]): SaranPasangan[] {
  type Calon = { a: CalonAkun; p: CalonPegawai; skor: number; identitas: boolean };
  const calon: Calon[] = [];
  const kataPegawai = pegawai.map((p) => ({ p, kata: new Set(kataNama(p.nama)) }));
  for (const a of akun) {
    const kataA = kataNama(a.nama);
    if (kataA.length === 0) continue;
    for (const { p, kata } of kataPegawai) {
      const identitas = cocokIdentitas(a, p);
      // Saring cepat: harus berbagi minimal satu kata (atau identitas sama).
      if (!identitas && !kataA.some((k) => kata.has(k) || [...kata].some((l) => kataCocok(k, l)))) continue;
      let skor = skorNama(a.nama, p.nama);
      if (identitas) skor = Math.max(skor, 0.9);
      if (skor >= SKOR_MIN_SARAN) calon.push({ a, p, skor, identitas });
    }
  }
  calon.sort((x, y) => y.skor - x.skor || x.a.nama.localeCompare(y.a.nama));
  // Skor terbaik tiap akun & tiap pegawai — untuk mendeteksi seri.
  const terbaikAkun = new Map<string, number[]>();
  const terbaikPegawai = new Map<string, number[]>();
  for (const c of calon) {
    terbaikAkun.set(c.a.id, [...(terbaikAkun.get(c.a.id) ?? []), c.skor]);
    terbaikPegawai.set(c.p.kode, [...(terbaikPegawai.get(c.p.kode) ?? []), c.skor]);
  }
  const seri = (daftar: number[] | undefined, skor: number) => (daftar ?? []).filter((s) => Math.abs(s - skor) < 0.02).length > 1;
  const akunDipakai = new Set<string>();
  const pegawaiDipakai = new Set<string>();
  const hasil: SaranPasangan[] = [];
  for (const c of calon) {
    if (akunDipakai.has(c.a.id) || pegawaiDipakai.has(c.p.kode)) continue;
    akunDipakai.add(c.a.id);
    pegawaiDipakai.add(c.p.kode);
    const tanpaSeri = !seri(terbaikAkun.get(c.a.id), c.skor) && !seri(terbaikPegawai.get(c.p.kode), c.skor);
    const kuat = tanpaSeri && (c.skor >= 0.97 || (c.identitas && skorNama(c.a.nama, c.p.nama) >= SKOR_MIN_SARAN));
    hasil.push({
      user_id: c.a.id,
      kode: c.p.kode,
      skor: Math.round(c.skor * 100) / 100,
      keyakinan: kuat ? "kuat" : "mirip",
      alasan: c.skor >= 0.999
        ? "nama sama persis"
        : c.identitas
          ? "email/username sama"
          : c.skor >= 0.97
            ? "nama sama (beda penulisan)"
            : `nama mirip ${Math.round(c.skor * 100)}%`,
    });
  }
  return hasil;
}

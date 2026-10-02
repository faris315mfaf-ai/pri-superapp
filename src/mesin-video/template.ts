// Penyimpanan template di disk — cermin load/save/list/duplicate/_aset di
// video_edit.py. Format template.json tidak berubah: berkas yang ditulis
// versi Python terbaca di sini dan sebaliknya.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ID_TEMPLATE_BAWAAN, PEMILIK_BAWAAN, PEMILIK_LAMA } from "./konfig";
import { aman, diDalam, templatePath, templatesDir } from "./jalur";
import { GalatVideo, type Template } from "./jenis";

export const TEMPLATE_CONTOH = {
  name: "Template Reels",
  width: 1080,
  height: 1920,
  fps: 30,
  intro: null,
  outro: null,
  overlays: [],
  texts: [],
  text_box: null,
  badge_box: null,
  kategori: "",
  teks_warna: "white",
} as const;

/** id acak 12 heksa, seperti uuid4().hex[:12] di Python. */
export function idBaru(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

/** Spasi dirapatkan: " ".join(nilai.split()) di Python. */
export function rapatkan(nilai: unknown): string {
  return String(nilai ?? "").split(/\s+/).filter(Boolean).join(" ");
}

function bacaJson(berkas: string): Record<string, unknown> | null {
  try {
    const isi = JSON.parse(fs.readFileSync(berkas, "utf8"));
    return isi && typeof isi === "object" && !Array.isArray(isi) ? isi : null;
  } catch {
    return null;
  }
}

/** Tulis JSON secara atomik (berkas sementara lalu ganti nama). */
export function tulisJsonAtomik(berkas: string, isi: unknown): void {
  const sementara = `${berkas}.baru`;
  fs.writeFileSync(sementara, JSON.stringify(isi, null, 2), "utf8");
  fs.renameSync(sementara, berkas);
}

export function loadTemplate(templateId: string): Template {
  const berkas = path.join(templatePath(templateId), "template.json");
  let mentah: string;
  try {
    mentah = fs.readFileSync(berkas, "utf8");
  } catch {
    throw new GalatVideo(`Template '${templateId}' tidak ditemukan`);
  }
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(mentah);
  } catch (e) {
    throw new GalatVideo(`Template '${templateId}' rusak: ${e instanceof Error ? e.message : e}`);
  }
  data.id = aman(templateId);
  if (!("owner" in data)) data.owner = PEMILIK_LAMA;
  data.owner = String(data.owner ?? "").trim().toLowerCase();
  return data as Template;
}

export function pemilikTemplate(t: { owner?: unknown }): string {
  return String(t.owner ?? "").trim().toLowerCase();
}

/** Template bawaan terlihat oleh semua; selain itu hanya oleh pemiliknya. */
export function bolehLihat(t: Template, username: string | null | undefined): boolean {
  const p = pemilikTemplate(t);
  return p === PEMILIK_BAWAAN || (Boolean(username) && p === username);
}

/** Hanya pemiliknya. Template bawaan tidak bisa diubah lewat API. */
export function bolehUbah(t: Template, username: string | null | undefined): boolean {
  return Boolean(username) && pemilikTemplate(t) === username;
}

function folderTemplate(): string[] {
  return fs
    .readdirSync(templatesDir(), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

/** Template milik satu akun; `semua` mengabaikan pemilik. */
export function listTemplates(owner: string | null = null, semua = false): Template[] {
  const hasil: Template[] = [];
  for (const nama of folderTemplate()) {
    let t: Template;
    try {
      t = loadTemplate(nama);
    } catch {
      continue;
    }
    if (semua || (Boolean(owner) && pemilikTemplate(t) === owner)) hasil.push(t);
  }
  return hasil;
}

function namaSetTerpakai(nama: string, kecualiId = "", owner: string | null = null): string | null {
  const target = rapatkan(nama).toLocaleLowerCase();
  if (!target) return null;
  const kecuali = kecualiId ? aman(kecualiId) : "";
  for (const folder of folderTemplate()) {
    if (folder === kecuali) continue;
    const isi = bacaJson(path.join(templatesDir(), folder, "template.json"));
    if (!isi) continue;
    if (owner !== null) {
      const pemilikLain = String(("owner" in isi ? isi.owner : PEMILIK_LAMA) ?? "").trim().toLowerCase();
      if (pemilikLain !== owner) continue;
    }
    if (rapatkan(isi.name).toLocaleLowerCase() === target) return folder;
  }
  return null;
}

/** Tambahkan nomor di belakang nama sampai tidak ada yang memakainya. */
export function namaSetUnik(nama: string, kecualiId = "", owner: string | null = null): string {
  const dasar = rapatkan(nama) || "Set layer";
  let calon = dasar;
  let urut = 2;
  while (namaSetTerpakai(calon, kecualiId, owner)) {
    calon = `${dasar} ${urut}`;
    urut += 1;
  }
  return calon;
}

/**
 * Simpan template. `owner` hanya dipakai saat membuat baru; template yang
 * sudah ada tidak pernah berpindah pemilik lewat sini.
 */
export function saveTemplate(
  data: Record<string, unknown>,
  templateId: string | null = null,
  owner: string | null = null,
): Template {
  const id = aman(templateId || (data.id as string) || idBaru());
  const folder = templatePath(id);
  fs.mkdirSync(path.join(folder, "assets"), { recursive: true });
  const lama = bacaJson(path.join(folder, "template.json")) ?? {};
  const pemilik =
    Object.keys(lama).length > 0
      ? String(("owner" in lama ? lama.owner : PEMILIK_LAMA) ?? "").trim().toLowerCase()
      : String((owner !== null ? owner : data.owner) ?? "").trim().toLowerCase();
  const nama = rapatkan(data.name);
  if (namaSetTerpakai(nama, id, pemilik)) {
    throw new GalatVideo(`Nama set layer "${nama}" sudah dipakai. Pilih nama lain supaya tidak tertukar di daftar.`);
  }
  const isi: Record<string, unknown> = { ...TEMPLATE_CONTOH, ...data, id, name: nama, owner: pemilik };
  const asetDari = "aset_dari" in data ? data.aset_dari : lama.aset_dari;
  if (asetDari) isi.aset_dari = aman(asetDari);
  else delete isi.aset_dari;
  tulisJsonAtomik(path.join(folder, "template.json"), isi);
  return isi as Template;
}

export function deleteTemplate(templateId: string): void {
  fs.rmSync(templatePath(templateId), { recursive: true, force: true });
}

/**
 * Nama aset di template → path nyata, tetap di dalam foldernya. Template
 * akun baru meminjam berkas template bawaan (aset_dari) alih-alih menyalin.
 */
export function asetTemplate(template: Template, nama: string | null | undefined): string | null {
  if (!nama) return null;
  const folder = path.resolve(templatePath(template.id));
  const jalur = path.resolve(folder, String(nama));
  if (!diDalam(folder, jalur)) throw new GalatVideo(`Aset '${nama}' berada di luar folder template`);
  if (fs.existsSync(jalur) && fs.statSync(jalur).isFile()) return jalur;
  const dari = String(template.aset_dari ?? "").trim();
  const induk = dari ? aman(dari) : "";
  if (induk && induk !== template.id) {
    const folderInduk = path.resolve(templatePath(induk));
    const jalurInduk = path.resolve(folderInduk, String(nama));
    if (diDalam(folderInduk, jalurInduk) && fs.existsSync(jalurInduk) && fs.statSync(jalurInduk).isFile()) {
      return jalurInduk;
    }
  }
  throw new GalatVideo(`Aset '${nama}' tidak ditemukan di template`);
}

/** Nama berkas aset yang masih dirujuk template ini. */
export function asetTerpakai(t: Template): Set<string> {
  const dipakai = new Set<string>();
  for (const o of t.overlays ?? []) if (o.file) dipakai.add(String(o.file));
  for (const k of ["intro", "outro"] as const) if (t[k]) dipakai.add(String(t[k]));
  return dipakai;
}

/** Hapus berkas di folder assets yang sudah tidak dirujuk template. */
export function buangAsetTakTerpakai(templateId: string, t: Template): number {
  const folder = path.join(templatePath(templateId), "assets");
  if (!fs.existsSync(folder)) return 0;
  const dipakai = new Set([...asetTerpakai(t)].map((n) => path.basename(n)));
  let dibuang = 0;
  for (const d of fs.readdirSync(folder, { withFileTypes: true })) {
    if (d.isFile() && !dipakai.has(d.name)) {
      try {
        fs.unlinkSync(path.join(folder, d.name));
        dibuang += 1;
      } catch {
        // berkas sedang dipakai/terkunci — disapu lain kali
      }
    }
  }
  return dibuang;
}

/** Salin satu set layer beserta seluruh berkas asetnya. */
export function duplicateTemplate(
  sumberId: string,
  namaBaru: string,
  idTujuan: string | null = null,
  owner: string | null = null,
): Template {
  const asal = loadTemplate(sumberId);
  const id = aman(idTujuan || idBaru());
  if (id === aman(sumberId)) throw new GalatVideo("Set layer salinan harus memakai id yang berbeda");
  const folderAsal = templatePath(sumberId);
  const folderBaru = templatePath(id);
  fs.mkdirSync(path.join(folderBaru, "assets"), { recursive: true });

  const namaAset: string[] = [];
  const dirujuk = [...(asal.overlays ?? []).map((o) => o.file), asal.intro, asal.outro];
  for (const n of dirujuk) if (n && !namaAset.includes(String(n))) namaAset.push(String(n));
  const folderAsetAsal = path.join(folderAsal, "assets");
  if (fs.existsSync(folderAsetAsal)) {
    for (const d of fs.readdirSync(folderAsetAsal, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (d.isFile() && !namaAset.includes(`assets/${d.name}`)) namaAset.push(`assets/${d.name}`);
    }
  }
  for (const n of namaAset) {
    let sumber: string | null;
    try {
      sumber = asetTemplate(asal, n);
    } catch {
      continue;
    }
    if (!sumber) continue;
    const tujuan = path.resolve(folderBaru, n);
    if (!diDalam(folderBaru, tujuan)) continue;
    fs.mkdirSync(path.dirname(tujuan), { recursive: true });
    fs.copyFileSync(sumber, tujuan);
  }

  const pemilik = owner !== null ? owner : pemilikTemplate(asal);
  const diminta = namaBaru.trim() || `${asal.name ?? "Set"} (salinan)`;
  const isi: Record<string, unknown> = { ...asal, id, name: namaSetUnik(diminta, id, pemilik) };
  if (!String(asal.aset_dari ?? "").trim()) delete isi.aset_dari;
  return saveTemplate(isi, id, pemilik);
}

/** Template pertama akun baru: meminjam berkas template bawaan. */
export function templateAwalUntuk(username: string): Template {
  const u = String(username ?? "").trim().toLowerCase();
  if (!u) throw new GalatVideo("Username kosong");
  const bawaan = loadTemplate(ID_TEMPLATE_BAWAAN);
  const id = idBaru();
  const nama = String(bawaan.name || "TV Rakyat");
  return saveTemplate({ ...bawaan, id, name: namaSetUnik(nama, id, u), aset_dari: ID_TEMPLATE_BAWAAN }, id, u);
}

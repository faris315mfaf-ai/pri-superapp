// Lokasi berkas di disk media — cermin bagian "LOKASI BERKAS" video_edit.py.
import fs from "node:fs";
import path from "node:path";
import { AWALAN_UNGGAHAN, MEDIA_DIR } from "./konfig";

/** Buang karakter yang bisa dipakai keluar dari folder media (_aman Python). */
export function aman(nama: unknown): string {
  const bersih = String(nama ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_.-]/g, "_")
    .replace(/^\.+/, "");
  return (bersih || "tanpa-nama").slice(0, 80);
}

function siapkan(folder: string): string {
  fs.mkdirSync(folder, { recursive: true });
  return folder;
}

export const templatesDir = () => siapkan(path.join(MEDIA_DIR, "templates"));
export const jobsDir = () => siapkan(path.join(MEDIA_DIR, "jobs"));
export const uploadsDir = () => siapkan(path.join(MEDIA_DIR, "uploads"));
export const cacheDir = () => siapkan(path.join(MEDIA_DIR, "cache"));
export const outroDir = () => siapkan(path.join(MEDIA_DIR, "outro"));

export function templatePath(templateId: string): string {
  return path.join(templatesDir(), aman(templateId));
}

/** Folder unggahan untuk alamat "upload://<id>"; null bila bukan unggahan. */
export function folderUnggahan(url: string): string | null {
  const u = String(url ?? "");
  if (!u.startsWith(AWALAN_UNGGAHAN)) return null;
  return path.join(uploadsDir(), aman(u.slice(AWALAN_UNGGAHAN.length)));
}

/** Pemilik video unggahan (berkas .pemilik), atau "" bila tak diketahui. */
export function pemilikUnggahan(url: string): string {
  const folder = folderUnggahan(url);
  if (!folder) return "";
  try {
    return fs.readFileSync(path.join(folder, ".pemilik"), "utf8").trim();
  } catch {
    return "";
  }
}

/** Apakah `anak` benar-benar di dalam `induk` (sesudah dinormalkan). */
export function diDalam(induk: string, anak: string): boolean {
  const relatif = path.relative(path.resolve(induk), path.resolve(anak));
  return relatif !== "" && !relatif.startsWith("..") && !path.isAbsolute(relatif);
}

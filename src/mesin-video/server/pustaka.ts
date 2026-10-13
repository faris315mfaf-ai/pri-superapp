// Pustaka template TVR untuk Bot Redaksi (13 Okt 2026).
//
// Template TVR Saya = satu folder per akun (templates/tvr-<id>: template.json +
// assets/). Bot butuh template yang dibuat master, jadi master membangunnya
// sekali di akun mana pun, lalu menyimpannya SEBAGAI SALINAN BERNAMA ke
// "pustaka" (templates/pustaka-<kode>, pemilik "pustaka" = tak terlihat oleh
// akun mana pun), dan memasangnya ke akun bot (menyalin pustaka -> tvr-<id bot>).
//
// KEAMANAN: rute ini membaca/menulis template akun lain, jadi HANYA boleh
// dipanggil server SuperApp lewat jalur internalnya. Dijaga dua lapis:
//  1. header X-Autoedit-Pustaka: 1 wajib — proxy /api/autoedit TIDAK
//     meneruskannya (daftar putih header masuk), jadi anggota tidak bisa
//     menyetelnya; tanpa header -> 404 seolah rute tidak ada.
//  2. proxy menolak jalur tvr/pustaka/* (lib/autoedit.ts).
// Siapa yang boleh memanggil (master) diperiksa di SuperApp.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";
import { aman, templatePath, templatesDir } from "../jalur";
import { GalatVideo, type Template } from "../jenis";
import { lupakan } from "../kuota";
import { denganKunci } from "../kunci";
import { loadTemplate, tulisJsonAtomik } from "../template";
import { STATUS_AKTIF_JOB, daftarJob } from "../job";
import { bacaJson, GalatHttp, identitas, type Permintaan, type Router } from "./dasar";
import { pastikanKuota, type Pengguna } from "./bantu";

const KODE = /^[a-z0-9]{6,24}$/;
const Body = z.object({ kode: z.string().regex(KODE) });

const idPustaka = (kode: string) => `pustaka-${kode}`;
const idTemplateAkun = (p: Pengguna) => `tvr-${p.user_id}`;
const akunDari = (p: Pengguna) => String(p.username).trim().toLowerCase();

function gerbang(pm: Permintaan): Pengguna {
  if (pm.req.headers["x-autoedit-pustaka"] !== "1") throw new GalatHttp(404, "Not Found");
  return identitas(pm);
}

function ukuran(folder: string): number {
  let total = 0;
  let isi: fs.Dirent[];
  try {
    isi = fs.readdirSync(folder, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const d of isi) {
    const p = path.join(folder, d.name);
    if (d.isDirectory()) total += ukuran(p);
    else if (d.isFile()) total += fs.statSync(p).size;
  }
  return total;
}

/**
 * Salin satu folder template ke folder template lain (diganti utuh), mengisi
 * ulang id & pemilik. Draf dan salinan ringan (cache) tidak ikut. Dikerjakan di
 * folder sementara lalu ditukar supaya gagal di tengah tidak merusak tujuan.
 */
export function salinTemplate(sumberId: string, tujuanId: string, pemilik: string): { byte: number; nama: string } {
  let asal: Template;
  try {
    asal = loadTemplate(sumberId);
  } catch (e) {
    if (e instanceof GalatVideo) throw new GalatHttp(404, "Template sumber tidak ditemukan.");
    throw e;
  }
  if (!asal.siap) throw new GalatHttp(409, "Template sumber belum ditetapkan (belum siap).");
  if (String(asal.aset_dari ?? "").trim()) {
    throw new GalatHttp(409, "Template sumber meminjam aset template lain; tidak bisa disalin.");
  }
  const dari = templatePath(sumberId);
  const ke = templatePath(tujuanId);
  if (path.resolve(dari) === path.resolve(ke)) throw new GalatHttp(400, "Sumber dan tujuan sama.");
  const sementara = `${ke}.salin-${crypto.randomBytes(4).toString("hex")}`;
  try {
    fs.cpSync(dari, sementara, {
      recursive: true,
      filter: (sumber) => {
        const nama = path.basename(sumber);
        if (nama === ".draf" || nama === ".ringan") return false;
        return !fs.lstatSync(sumber).isSymbolicLink();
      },
    });
    const berkas = path.join(sementara, "template.json");
    const isi = JSON.parse(fs.readFileSync(berkas, "utf8")) as Record<string, unknown>;
    tulisJsonAtomik(berkas, { ...isi, id: aman(tujuanId), owner: pemilik, diperbarui: Date.now() / 1000 });
    fs.rmSync(ke, { recursive: true, force: true });
    fs.renameSync(sementara, ke);
  } catch (e) {
    fs.rmSync(sementara, { recursive: true, force: true });
    throw e;
  }
  return { byte: ukuran(ke), nama: String(asal.name ?? "") };
}

export function pasangRutePustaka(r: Router): void {
  const A = "/api/tvr/pustaka";

  // Simpan template akun pemanggil sebagai salinan bernama di pustaka.
  r.post(`${A}/simpan`, async (pm) => {
    const p = gerbang(pm);
    const { kode } = await bacaJson(pm, Body);
    if (fs.existsSync(templatePath(idPustaka(kode)))) throw new GalatHttp(409, "Kode pustaka sudah dipakai.");
    return denganKunci(akunDari(p), () => {
      const hasil = salinTemplate(idTemplateAkun(p), idPustaka(kode), "pustaka");
      return { kode, ...hasil };
    });
  });

  // Pasang salinan pustaka ke akun pemanggil (menggantikan template TVR-nya).
  r.post(`${A}/pasang`, async (pm) => {
    const p = gerbang(pm);
    const { kode } = await bacaJson(pm, Body);
    const sumber = templatePath(idPustaka(kode));
    if (!fs.existsSync(path.join(sumber, "template.json"))) throw new GalatHttp(404, "Template pustaka tidak ditemukan.");
    const a = akunDari(p);
    // Render yang sedang menunggu akan gagal bila template berganti di tengah jalan.
    const aktif = (await daftarJob(500, a)).filter((j) => STATUS_AKTIF_JOB.includes(j.status));
    if (aktif.length > 0) {
      throw new GalatHttp(409, `Masih ada ${aktif.length} video di antrean akun ini. Tunggu selesai dulu.`);
    }
    await pastikanKuota(p, ukuran(sumber));
    const hasil = await denganKunci(a, () => salinTemplate(idPustaka(kode), idTemplateAkun(p), a));
    lupakan(a);
    return { kode, ...hasil };
  });

  r.delete(`${A}/{kode}`, async (pm) => {
    gerbang(pm);
    const kode = pm.params.kode;
    if (!KODE.test(kode)) throw new GalatHttp(400, "Kode pustaka tidak sah.");
    const folder = templatePath(idPustaka(kode));
    // Jaga: hanya folder pustaka-* di dalam templates/.
    if (path.dirname(path.resolve(folder)) !== path.resolve(templatesDir())) throw new GalatHttp(400, "Kode pustaka tidak sah.");
    fs.rmSync(folder, { recursive: true, force: true });
    return { kode, dihapus: true };
  });
}

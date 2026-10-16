// Uji ALAMAT PER LAYAR (16 Okt 2026). Murni. Jalankan: npx tsx tests/uji-alamat-layar.mts
import fs from "node:fs";
import { ALAMAT_SUB_LAYAR, ALAMAT_TAB, SEGMEN_ALAMAT, pathDariPosisi, perluGantiPath, posisiDariPath } from "@/lib/alamat-layar";

let lulus = 0;
let gagal = 0;
const cek = (n: string, ok: boolean, i?: unknown) => {
  if (ok) {
    lulus++;
    console.log("  ✔", n);
  } else {
    gagal++;
    console.log("  ✘", n, i !== undefined ? JSON.stringify(i) : "");
  }
};
const sama = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("Alamat tab");
cek("akar = beranda", sama(posisiDariPath("/"), { tab: "beranda", subLayar: null }));
cek("/tvrsaya = TVR Saya", sama(posisiDariPath("/tvrsaya"), { tab: "tvrku", subLayar: null }));
cek("huruf besar & garis miring penutup", sama(posisiDariPath("/TVRSaya/"), { tab: "tvrku", subLayar: null }));
cek("alias lama", sama(posisiDariPath("/tvr-saya"), { tab: "tvrku", subLayar: null }) && sama(posisiDariPath("/ruang-bot"), { tab: "ruangbot", subLayar: null }) && sama(posisiDariPath("/qc"), { tab: "qc", subLayar: null }));
cek("query & hash diabaikan", sama(posisiDariPath("/chat?x=1#a"), { tab: "chat", subLayar: null }));
cek("alamat tak dikenal -> null", posisiDariPath("/xyz") === null && posisiDariPath("/panel-master") === null && posisiDariPath("/audit") === null);
cek("dua segmen -> null", posisiDariPath("/tvrsaya/lain") === null);
cek("persen rusak -> null", posisiDariPath("/%E0%A4%A") === null);
cek("semua tab bolak-balik", (Object.keys(ALAMAT_TAB) as (keyof typeof ALAMAT_TAB)[]).every((t) => posisiDariPath(pathDariPosisi(t, null))?.tab === t));
cek("alamat tab unik", new Set(Object.values(ALAMAT_TAB)).size === Object.keys(ALAMAT_TAB).length);

console.log("Sub-layar pribadi");
cek("/absensi = sub-layar absensi", sama(posisiDariPath("/absensi"), { tab: null, subLayar: "absensi" }));
cek("sub-layar beralamat bolak-balik", (Object.keys(ALAMAT_SUB_LAYAR) as (keyof typeof ALAMAT_SUB_LAYAR)[]).every((s) => posisiDariPath(pathDariPosisi("profil", s))?.subLayar === s));
cek("sub-layar pengurus memakai alamat tab induk", pathDariPosisi("profil", "panel-master") === "/profil" && pathDariPosisi("beranda", "audit") === "/" && pathDariPosisi("qc", "qc-akun") === "/hr-center");
cek("alamat sub-layar tidak bentrok dengan tab", Object.values(ALAMAT_SUB_LAYAR).every((a) => !Object.values(ALAMAT_TAB).includes(a)));

console.log("Ganti path");
cek("sama -> tidak perlu", !perluGantiPath("/tvrsaya/", "/tvrsaya") && !perluGantiPath("/", "/"));
cek("beda -> perlu", perluGantiPath("/", "/tvrsaya") && perluGantiPath("/tvr-saya", "/tvrsaya"));

console.log("Rute Next");
cek("rute [layar] memakai cangkang yang sama & 404 untuk alamat asing", /from "\.\.\/page"/.test(fs.readFileSync("src/app/[layar]/page.tsx", "utf8")) && /notFound\(\)/.test(fs.readFileSync("src/app/[layar]/page.tsx", "utf8")));
const statis = fs.readdirSync("src/app", { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("[")).map((d) => d.name);
cek("alamat tidak bertabrakan dengan folder rute statis", [...Object.values(ALAMAT_TAB), ...Object.values(ALAMAT_SUB_LAYAR)].every((a) => !statis.includes(a)), statis);
const publik = fs.readdirSync("public");
cek("alamat tidak bertabrakan dengan berkas public", [...Object.values(ALAMAT_TAB), ...Object.values(ALAMAT_SUB_LAYAR)].every((a) => !a || !publik.includes(a)), publik.filter((p) => !p.includes(".")));

console.log("Skrip pemulihan layout");
{
  // Template literal: garis miring ber-escape di regex hilang dan merusak SELURUH skrip pemulihan.
  const src = fs.readFileSync("src/app/layout.tsx", "utf8");
  const m = src.match(/const SKRIP_PEMULIHAN = (`[\s\S]*?\n`);/);
  let ok = false;
  let galat: unknown;
  try {
    const skrip = new Function("SEGMEN_ALAMAT", `return ${m![1]};`)(SEGMEN_ALAMAT) as string;
    new Function(skrip);
    ok = skrip.includes('"tvrsaya"') && !skrip.includes('"api"');
  } catch (e) {
    galat = String(e);
  }
  cek("skrip inline layout sah secara sintaks & memuat daftar alamat", ok, galat);
}

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);

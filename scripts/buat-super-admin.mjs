#!/usr/bin/env node
/**
 * Membuat / memperbarui akun super admin.
 *
 *   node scripts/buat-super-admin.mjs --username farismfaf --sandi "..." \
 *        --nama "Faris" --email faris@pri.id --wa 6281234567890
 *
 * Bila --sandi tidak diberikan, sandi acak dibuatkan dan ditampilkan
 * sekali di layar. Sandi TIDAK pernah disimpan apa adanya — hanya
 * hash scrypt-nya, sama seperti akun pengguna biasa.
 */
import { readFileSync } from "node:fs";
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const PANJANG_KUNCI = 64;

async function hashSandi(sandi) {
  const garam = randomBytes(16);
  const kunci = await scryptAsync(sandi, garam, PANJANG_KUNCI);
  return `scrypt$${garam.toString("hex")}$${kunci.toString("hex")}`;
}

/** Baca .env.local tanpa dependensi tambahan */
function env() {
  const isi = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const out = {};
  for (const baris of isi.split("\n")) {
    const m = baris.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function argumen() {
  const a = {};
  for (let i = 2; i < process.argv.length; i++) {
    const t = process.argv[i];
    if (t.startsWith("--")) a[t.slice(2)] = process.argv[++i];
  }
  return a;
}

/** Normalkan nomor WA ke format 62xxx (tanpa +, spasi, atau 0 di depan) */
function normalkanWa(nomor) {
  if (!nomor) return null;
  let n = String(nomor).replace(/[^0-9]/g, "");
  if (n.startsWith("0")) n = "62" + n.slice(1);
  if (!n.startsWith("62")) n = "62" + n;
  return n;
}

async function main() {
  const a = argumen();
  const e = env();
  const URL_SB = e.SUPABASE_URL;
  const KEY = e.SUPABASE_SECRET_KEY;
  if (!URL_SB || !KEY) throw new Error("SUPABASE_URL / SUPABASE_SECRET_KEY belum ada di .env.local");

  const username = (a.username || "").trim().toLowerCase();
  if (!username) throw new Error("--username wajib diisi");

  const sandi = a.sandi || randomBytes(12).toString("base64url");
  const sandiAcak = !a.sandi;

  const baris = {
    username,
    email: (a.email || `${username}@pri.id`).toLowerCase(),
    nama: a.nama || "Super Admin",
    role: "super_admin",
    jabatan: a.jabatan || "Super Admin",
    avatar_url: "",
    password_hash: await hashSandi(sandi),
    nomor_wa: normalkanWa(a.wa),
    wa_terverifikasi: Boolean(a.wa),
    status: "aktif",
    profil_lengkap: true,
    aktif: true,
  };

  const res = await fetch(`${URL_SB}/rest/v1/app_user?on_conflict=email`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify([baris]),
  });

  if (!res.ok) {
    throw new Error(`Gagal menyimpan akun (${res.status}): ${await res.text()}`);
  }

  console.log("\n==========================================================");
  console.log("  AKUN SUPER ADMIN SIAP");
  console.log("==========================================================\n");
  console.log(`  Username : ${username}`);
  console.log(`  Email    : ${baris.email}`);
  if (baris.nomor_wa) console.log(`  Nomor WA : ${baris.nomor_wa}`);
  if (sandiAcak) {
    console.log(`  Sandi    : ${sandi}`);
    console.log("\n  (sandi acak ini hanya ditampilkan sekali — catat sekarang)");
  } else {
    console.log("  Sandi    : sesuai yang Anda berikan (tidak ditampilkan)");
  }
  console.log("\n----------------------------------------------------------\n");
}

main().catch((e) => {
  console.error("GAGAL:", e.message);
  process.exit(1);
});

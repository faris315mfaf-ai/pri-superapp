// ============================================================
// PRI SuperApp — Pembuat akun login aplikasi
//
// Kata sandi TIDAK PERNAH ditulis di file mana pun. Skrip ini
// mengacaknya, menyimpan hash-nya ke Supabase, lalu menampilkan
// sandi aslinya SEKALI di layar untuk Anda catat.
//
// CARA PAKAI (jalankan dari folder pri-superapp):
//
//   node scripts/seed-app-user.mjs --demo
//     → membuat 3 akun contoh (super admin, admin HR, admin TV)
//
//   node scripts/seed-app-user.mjs --email nama@pri.id --nama "Nama" \
//        --role super_admin --jabatan "Ketua Umum"
//     → membuat/memperbarui satu akun
//
//   Tambahkan --sandi "SandiPilihanAnda" bila ingin menentukan sendiri.
// ============================================================
import { createClient } from "@supabase/supabase-js";
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";

const scryptAsync = promisify(scrypt);

// --- Baca .env.local secara sederhana (tanpa paket tambahan) ---
function muatEnv() {
  for (const nama of [".env.local", ".env"]) {
    try {
      for (const baris of readFileSync(nama, "utf8").split("\n")) {
        const cocok = baris.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (cocok && !process.env[cocok[1]]) {
          process.env[cocok[1]] = cocok[2].replace(/^["']|["']$/g, "");
        }
      }
    } catch {
      // file tidak ada → lanjut
    }
  }
}
muatEnv();

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!URL || !KEY) {
  console.error(
    "\nGAGAL: SUPABASE_URL / SUPABASE_SECRET_KEY belum diisi.\n" +
      "Salin .env.example menjadi .env.local lalu isi kedua nilainya.\n",
  );
  process.exit(1);
}

// --- Baca argumen baris perintah ---
const arg = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) {
    const kunci = a.slice(2);
    const nilai = process.argv[i + 1];
    if (!nilai || nilai.startsWith("--")) arg[kunci] = true;
    else { arg[kunci] = nilai; i++; }
  }
}

/** Sandi acak yang mudah dibaca tapi tetap kuat (±25 karakter) */
function sandiAcak() {
  return randomBytes(18).toString("base64url");
}

async function buatHash(sandi) {
  const garam = randomBytes(16);
  const kunci = await scryptAsync(sandi, garam, 64);
  return `scrypt$${garam.toString("hex")}$${kunci.toString("hex")}`;
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });

const ROLE_SAH = ["super_admin", "admin_hr", "admin_tv"];

async function simpan({ email, nama, role, jabatan, sandi }) {
  if (!ROLE_SAH.includes(role)) {
    throw new Error(`Role "${role}" tidak dikenal. Pilih: ${ROLE_SAH.join(", ")}`);
  }
  const password_hash = await buatHash(sandi);

  const { error } = await db
    .from("app_user")
    .upsert(
      { email: email.toLowerCase(), nama, role, jabatan, avatar_url: "", password_hash, aktif: true },
      { onConflict: "email" },
    );

  if (error) throw new Error(`Gagal menyimpan ${email}: ${error.message}`);
  return { email, sandi, role };
}

const daftar = [];

if (arg.demo) {
  daftar.push(
    { email: "super@pri.id", nama: "Super Admin", role: "super_admin", jabatan: "Ketua Umum" },
    { email: "hr@pri.id",    nama: "Admin HR",    role: "admin_hr",    jabatan: "Kepala HR" },
    { email: "tv@pri.id",    nama: "Admin TV",    role: "admin_tv",    jabatan: "Kepala Produksi" },
  );
} else if (arg.email) {
  daftar.push({
    email: arg.email,
    nama: arg.nama || arg.email.split("@")[0],
    role: arg.role || "admin_hr",
    jabatan: arg.jabatan || "",
  });
} else {
  console.error(
    "\nGAGAL: sebutkan --demo atau --email.\n" +
      "Contoh: node scripts/seed-app-user.mjs --demo\n",
  );
  process.exit(1);
}

const hasil = [];
for (const u of daftar) {
  hasil.push(await simpan({ ...u, sandi: typeof arg.sandi === "string" ? arg.sandi : sandiAcak() }));
}

console.log("\n==========================================================");
console.log("  AKUN BERHASIL DIBUAT — CATAT SANDI DI BAWAH SEKARANG");
console.log("  (sandi ini TIDAK bisa dilihat lagi setelah layar ditutup)");
console.log("==========================================================");
for (const h of hasil) {
  console.log(`\n  Email : ${h.email}`);
  console.log(`  Sandi : ${h.sandi}`);
  console.log(`  Peran : ${h.role}`);
}
console.log("\n----------------------------------------------------------");
console.log("  Simpan di pengelola sandi. Jangan dikirim lewat chat.");
console.log("----------------------------------------------------------\n");

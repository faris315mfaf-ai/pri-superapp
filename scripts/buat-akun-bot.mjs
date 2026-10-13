#!/usr/bin/env node
/**
 * Membuat 3 akun BOT REDAKSI (bot1, bot2, bot3) di Divisi BOT + baris perilakunya
 * di bot_redaksi (13 Okt 2026). HANYA dijalankan master/pemilik sistem.
 *
 *   # 1) Latihan (tidak menulis apa pun) — bawaan:
 *   BOT_SANDI_AWAL='...' node scripts/buat-akun-bot.mjs
 *
 *   # 2) Benar-benar membuat akun (setelah sql/67 dijalankan):
 *   BOT_SANDI_AWAL='...' node scripts/buat-akun-bot.mjs --jalankan
 *
 *   # Memperbarui sandi akun yang sudah ada juga:
 *   BOT_SANDI_AWAL='...' node scripts/buat-akun-bot.mjs --jalankan --setel-ulang-sandi
 *
 * ATURAN KERAS:
 *  - Kata sandi TIDAK PERNAH ditulis di repo atau dokumen. Ia dibaca dari env
 *    BOT_SANDI_AWAL (atau --sandi) saat skrip berjalan, lalu hanya hash scrypt-nya
 *    yang disimpan, sama seperti akun lain. Tanpa sandi, skrip berhenti.
 *  - Akun bot TIDAK BISA login: lib/sesi.ts buatSesi() menolak Divisi BOT di semua
 *    jalur masuk. Kata sandi hanya formalitas kolom password_hash (NOT NULL).
 *  - Bot dikendalikan master lewat TVR Saya → Kendali Akun BOT (tanpa kata sandi).
 *  - Aman diulang: akun yang sudah ada tidak dibuat dua kali dan sandinya tidak
 *    diubah kecuali --setel-ulang-sandi.
 */
import { readFileSync } from "node:fs";
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const PANJANG_KUNCI = 64;
const DIVISI_BOT = "Divisi BOT";

const BOT = [
  {
    username: "bot1",
    nama: "Raka",
    peran: "Redaktur Pencari",
    persona: "Teliti membaca situasi. Mengejar berita yang baru terbit dan paling cepat naik tayangannya.",
    warna: "#f08a3c",
    handle: "@tvr.raka",
    platform: "Instagram",
    mode: "acc",
    rupa: { kaus: "#f08a3c", bayangan: "#c76a24", celana: "#3a4a78", kulit: "#e8b48a", rambut: "#3b2418", gayaRambut: "topi", warnaTopi: "#2d6a4f", berhud: true },
  },
  {
    username: "bot2",
    nama: "Sinta",
    peran: "Editor Video",
    persona: "Rapi soal tampilan. Memilih potongan terbaik, menulis hook, dan menjaga template tetap konsisten.",
    warna: "#a56bd1",
    handle: "@tvr.sinta",
    platform: "TikTok",
    mode: "acc",
    rupa: { kaus: "#a56bd1", bayangan: "#7f48a8", celana: "#2f3358", kulit: "#d9a07a", rambut: "#2a1a2e", gayaRambut: "panjang" },
  },
  {
    username: "bot3",
    nama: "Dimas",
    peran: "Pengunggah",
    persona: "Disiplin soal aturan. Memeriksa caption, kredit sumber, kuota, dan pagar dobel sebelum memposting.",
    warna: "#4cae6b",
    handle: "@tvr.dimas",
    platform: "YouTube",
    mode: "acc",
    rupa: { kaus: "#4cae6b", bayangan: "#348650", celana: "#4a3a2a", kulit: "#f0c29a", rambut: "#5a3a1a", gayaRambut: "pendek", kacamata: true },
  },
];

async function hashSandi(sandi) {
  const garam = randomBytes(16);
  const kunci = await scryptAsync(sandi, garam, PANJANG_KUNCI);
  return `scrypt$${garam.toString("hex")}$${kunci.toString("hex")}`;
}

/** Baca .env.local tanpa dependensi tambahan. */
function env() {
  const isi = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const out = {};
  for (const baris of isi.split("\n")) {
    const m = baris.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function argumen() {
  const a = new Set();
  const nilai = {};
  for (let i = 2; i < process.argv.length; i++) {
    const t = process.argv[i];
    if (t === "--sandi") nilai.sandi = process.argv[++i];
    else if (t.startsWith("--")) a.add(t.slice(2));
  }
  return { bendera: a, nilai };
}

async function main() {
  const { bendera, nilai } = argumen();
  const jalankan = bendera.has("jalankan");
  const setelUlang = bendera.has("setel-ulang-sandi");
  const e = env();
  const URL_SB = e.SUPABASE_URL;
  const KEY = e.SUPABASE_SECRET_KEY;
  if (!URL_SB || !KEY) throw new Error("SUPABASE_URL / SUPABASE_SECRET_KEY belum ada di .env.local");

  const sandi = nilai.sandi || process.env.BOT_SANDI_AWAL || "";
  if (!sandi) {
    throw new Error("Kata sandi awal wajib: isi env BOT_SANDI_AWAL (atau --sandi). Tidak ada nilai bawaan di kode.");
  }

  const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
  const api = async (jalur, opsi = {}) => {
    const r = await fetch(`${URL_SB}/rest/v1/${jalur}`, { ...opsi, headers: { ...h, ...(opsi.headers || {}) } });
    const teks = await r.text();
    if (!r.ok) throw new Error(`${opsi.method || "GET"} ${jalur} → ${r.status} ${teks.slice(0, 300)}`);
    return teks ? JSON.parse(teks) : null;
  };

  // Pemeriksaan awal: tabel bot_redaksi harus ada (sql/67 sudah dijalankan).
  try {
    await api("bot_redaksi?select=id&limit=1");
  } catch (err) {
    throw new Error(`Tabel bot_redaksi belum ada — jalankan sql/67_bot_redaksi.sql dulu. (${err.message})`);
  }

  console.log(jalankan ? "MODE: MENULIS ke database" : "MODE: LATIHAN (tidak menulis). Tambahkan --jalankan untuk benar-benar membuat.");
  const hash = await hashSandi(sandi);

  for (const b of BOT) {
    const ada = await api(`app_user?select=id,divisi,username&username=ilike.${encodeURIComponent(b.username)}&limit=1`);
    let userId = ada?.[0]?.id ?? null;
    if (ada?.[0] && String(ada[0].divisi ?? "").trim() !== DIVISI_BOT) {
      throw new Error(`Username ${b.username} sudah dipakai akun BUKAN bot (divisi "${ada[0].divisi}"). Berhenti demi keamanan.`);
    }
    if (userId) {
      console.log(`• ${b.username}: akun sudah ada (id ${userId})`);
      if (setelUlang) {
        console.log(`  → sandi akan disetel ulang`);
        if (jalankan) await api(`app_user?id=eq.${userId}`, { method: "PATCH", body: JSON.stringify({ password_hash: hash }) });
      }
    } else {
      console.log(`• ${b.username}: akun BARU (${b.nama}, ${DIVISI_BOT})`);
      if (jalankan) {
        const sekarang = new Date().toISOString();
        const baru = await api("app_user", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            nama: b.nama,
            username: b.username,
            email: `${b.username}@pri.local`,
            nomor_wa: null,
            password_hash: hash,
            role: "anggota",
            jabatan: "",
            bidang_jabatan: "",
            divisi: DIVISI_BOT,
            sub_divisi: "",
            posisi_divisi: "anggota",
            status: "aktif",
            aktif: true,
            profil_lengkap: true,
            // Rilis 2.1 mewajibkan verifikasi WA + tutorial: bot tidak pernah login, tapi
            // penandanya diisi agar tidak memicu layar wajib saat master beralih akun.
            wa_terverifikasi: true,
            verifikasi_21_pada: sekarang,
            tutorial_21_pada: sekarang,
            disetujui_oleh: "sistem (akun bot)",
            disetujui_pada: sekarang,
          }),
        });
        userId = baru?.[0]?.id ?? null;
        if (!userId) throw new Error(`Gagal membuat ${b.username}: tidak ada id balikan.`);
        console.log(`  → dibuat, id ${userId}`);
      }
    }
    const adaBot = userId ? await api(`bot_redaksi?select=id&user_id=eq.${userId}&limit=1`) : [];
    if (adaBot?.length) {
      console.log(`  bot_redaksi: sudah ada (id ${adaBot[0].id}) — tidak diubah`);
    } else {
      console.log(`  bot_redaksi: akan dibuat (mode ${b.mode}, kuota 1/hari)`);
      if (jalankan && userId) {
        await api("bot_redaksi", {
          method: "POST",
          body: JSON.stringify({
            user_id: userId,
            nama: b.nama,
            peran: b.peran,
            persona: b.persona,
            warna: b.warna,
            handle: b.handle,
            platform: b.platform,
            rupa: b.rupa,
            mode: b.mode,
            kuota_harian: 1,
          }),
        });
        console.log("  → dibuat");
      }
    }
  }
  console.log(jalankan ? "\nSelesai. Akun bot TIDAK bisa login; kendalikan lewat TVR Saya → Kendali Akun BOT." : "\nLatihan selesai. Tidak ada yang ditulis.");
}

main().catch((err) => {
  console.error("GAGAL:", err.message);
  process.exit(1);
});

#!/usr/bin/env node
// ============================================================
// SINKRON CATATAN → OBSIDIAN (14 Sep 2026)
//
// Menyalin dua hal ke vault Obsidian pengguna:
//   1. Catatan proyek yang ditulis tangan di `catatan-obsidian/`
//      (strukturnya MENIRU struktur vault: catatan-obsidian/01-projects/PRI/x.md
//      mendarat di <vault>/01-projects/PRI/x.md).
//   2. Seluruh ingatan Claude Code sebagai arsip baca-saja di
//      <vault>/04-archives/claude-memory/<proyek>/.
//
// Dijalankan otomatis lewat hook "Stop" Claude Code (lihat
// .claude/settings.local.json) dan boleh dijalankan manual:
//     node alat/obsidian-sinkron.mjs
//
// TIGA ATURAN YANG MENJAGA VAULT TETAP AMAN:
//   • Hanya MENULIS berkas yang berasal dari sini. Catatan lain di
//     vault tidak pernah disentuh, tidak pernah dihapus.
//   • Berkas yang isinya sudah sama tidak ditulis ulang — supaya
//     Obsidian tidak menandainya "berubah" setiap kali Claude selesai.
//   • Nilai yang menyerupai kunci/token DISENSOR sebelum ditulis.
//     Vault ikut tersinkron ke cloud; kunci produksi tidak boleh ikut.
//
// Gagal apa pun = keluar diam-diam dengan kode 0. Sinkron catatan tidak
// pernah boleh menggagalkan pekerjaan Claude.
// ============================================================

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SUMBER = path.join(AKAR, "catatan-obsidian");
const ARSIP = path.join("04-archives", "claude-memory");

// ---------------------------------------------------------------
// Sensor: pola yang jelas-jelas rahasia. Sengaja konservatif —
// menyensor terlalu banyak hanya membuat catatan kurang enak dibaca,
// menyensor terlalu sedikit membocorkan kunci produksi.
// ---------------------------------------------------------------
const POLA_RAHASIA = [
  /\b(sk|rk|pk)-[A-Za-z0-9_-]{16,}/g, // kunci gaya OpenAI/Stripe
  /\bsb_(secret|publishable)_[A-Za-z0-9_-]{10,}/g, // Supabase
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, // JWT
  /\bghp_[A-Za-z0-9]{20,}/g, // token GitHub
  // NAMA_KUNCI=<nilai panjang> atau "NAMA_KUNCI: <nilai panjang>"
  /\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|KEY|PASS|PASSWORD)[A-Z0-9_]*)\s*[:=]\s*["']?([A-Za-z0-9_\-./+]{16,})["']?/g,
];

function sensor(teks) {
  let hasil = teks;
  for (const pola of POLA_RAHASIA) {
    hasil = hasil.replace(pola, (cocok, nama) =>
      nama && /^[A-Z]/.test(nama) ? `${nama}=<disensor>` : "<disensor>",
    );
  }
  return hasil;
}

// ---------------------------------------------------------------
// Cari vault Obsidian
// ---------------------------------------------------------------
function cariVault() {
  if (process.env.OBSIDIAN_VAULT && fs.existsSync(process.env.OBSIDIAN_VAULT)) {
    return process.env.OBSIDIAN_VAULT;
  }
  // Obsidian mencatat vault-nya di sini pada tiap sistem operasi.
  const kandidatKonfig = [
    path.join(process.env.APPDATA ?? "", "obsidian", "obsidian.json"),
    path.join(os.homedir(), "Library", "Application Support", "obsidian", "obsidian.json"),
    path.join(os.homedir(), ".config", "obsidian", "obsidian.json"),
  ];
  for (const berkas of kandidatKonfig) {
    try {
      const isi = JSON.parse(fs.readFileSync(berkas, "utf8"));
      const daftar = Object.values(isi?.vaults ?? {});
      // Yang sedang dibuka lebih dulu; kalau tidak ada, yang terbaru.
      const pilih =
        daftar.find((v) => v?.open && fs.existsSync(v.path)) ??
        daftar.filter((v) => v?.path && fs.existsSync(v.path)).sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))[0];
      if (pilih?.path) return pilih.path;
    } catch {
      // Berkas tidak ada / tidak terbaca → coba kandidat berikutnya.
    }
  }
  return null;
}

// ---------------------------------------------------------------
// Tulis hanya bila isinya berubah
// ---------------------------------------------------------------
let jumlahTulis = 0;
function tulisBilaBeda(tujuan, isi) {
  try {
    if (fs.existsSync(tujuan) && fs.readFileSync(tujuan, "utf8") === isi) return false;
    fs.mkdirSync(path.dirname(tujuan), { recursive: true });
    fs.writeFileSync(tujuan, isi, "utf8");
    jumlahTulis += 1;
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------
// Blok otomatis di dalam catatan tulisan tangan:
//   <!-- otomatis:nama -->  … diganti isi …  <!-- /otomatis -->
// ---------------------------------------------------------------
function git(...arg) {
  try {
    return execFileSync("git", arg, { cwd: AKAR, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function daftarRiwayat(jumlah = 25) {
  const keluaran = git("log", `-${jumlah}`, "--date=short", "--pretty=%ad|%h|%s");
  if (!keluaran) return "_Riwayat git tidak terbaca._";
  return keluaran
    .split("\n")
    .map((baris) => {
      const [tanggal, sha, ...sisa] = baris.split("|");
      return `- **${tanggal}** \`${sha}\` — ${sisa.join("|")}`;
    })
    .join("\n");
}

function daftarSql() {
  try {
    const berkas = fs
      .readdirSync(path.join(AKAR, "sql"))
      .filter((f) => f.endsWith(".sql"))
      .sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
    return berkas
      .map((f) => {
        // Judul = baris komentar pertama yang bukan garis pembatas.
        const isi = fs.readFileSync(path.join(AKAR, "sql", f), "utf8").split("\n").slice(0, 8);
        const judul =
          isi
            .map((b) => b.replace(/^--\s?/, "").trim())
            .find((b) => b && !/^=+$/.test(b) && !b.startsWith("==")) ?? "";
        return `- \`${f}\`${judul ? ` — ${judul}` : ""}`;
      })
      .join("\n");
  } catch {
    return "_Folder sql/ tidak terbaca._";
  }
}

// Stempel memakai waktu COMMIT TERAKHIR, bukan "sekarang". Kalau memakai
// jam sekarang, kelima catatan ini ditulis ulang setiap kali skrip jalan
// walau isinya sama — dan Obsidian menandainya "berubah" terus-menerus.
// Waktu commit berubah tepat ketika ada yang benar-benar berubah.
function stempel() {
  const sha = git("rev-parse", "--short", "HEAD") || "?";
  const cabang = git("rev-parse", "--abbrev-ref", "HEAD") || "?";
  const tanggal = git("log", "-1", "--date=format-local:%d %B %Y pukul %H.%M", "--pretty=%ad");
  return `_Versi kode \`${sha}\` (${cabang})${tanggal ? ` — ${tanggal}` : ""}._`;
}

const BLOK = {
  riwayat: () => daftarRiwayat(),
  sql: () => daftarSql(),
  diperbarui: () => stempel(),
};

function isiBlokOtomatis(teks) {
  return teks.replace(
    /<!--\s*otomatis:([a-z]+)\s*-->[\s\S]*?<!--\s*\/otomatis\s*-->/g,
    (cocok, nama) => {
      const buat = BLOK[nama];
      if (!buat) return cocok;
      return `<!-- otomatis:${nama} -->\n${buat()}\n<!-- /otomatis -->`;
    },
  );
}

// ---------------------------------------------------------------
// 1. Catatan proyek tulisan tangan
// ---------------------------------------------------------------
function salinCatatan(vault) {
  if (!fs.existsSync(SUMBER)) return;
  const antre = [""];
  while (antre.length > 0) {
    const relatif = antre.pop();
    const dir = path.join(SUMBER, relatif);
    for (const entri of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = path.join(relatif, entri.name);
      if (entri.isDirectory()) {
        antre.push(rel);
      } else if (entri.name.endsWith(".md")) {
        const isi = sensor(isiBlokOtomatis(fs.readFileSync(path.join(SUMBER, rel), "utf8")));
        tulisBilaBeda(path.join(vault, rel), isi);
      }
    }
  }
}

// ---------------------------------------------------------------
// 2. Arsip ingatan Claude Code
// ---------------------------------------------------------------
const KEPALA_ARSIP = [
  "> [!info] Arsip otomatis",
  "> Berkas ini SALINAN ingatan Claude Code. Menyuntingnya di sini tidak",
  "> mengubah ingatan Claude — dan akan tertimpa pada sinkron berikutnya.",
  "",
  "",
].join("\n");

function salinIngatan(vault) {
  const akarProyek = path.join(os.homedir(), ".claude", "projects");
  if (!fs.existsSync(akarProyek)) return;
  for (const proyek of fs.readdirSync(akarProyek)) {
    const dirMemori = path.join(akarProyek, proyek, "memory");
    if (!fs.existsSync(dirMemori)) continue;
    const berkas = fs.readdirSync(dirMemori).filter((f) => f.endsWith(".md"));
    if (berkas.length === 0) continue;
    // Nama folder proyek dipendekkan: "c--Users-Admin-nama-project-kamu" →
    // "nama-project-kamu". Yang panjang itu penyandian jalur, bukan nama.
    const nama = proyek.replace(/^[a-zA-Z]--(Users-[^-]+-)?/, "") || proyek;
    for (const f of berkas) {
      const isi = sensor(fs.readFileSync(path.join(dirMemori, f), "utf8"));
      tulisBilaBeda(path.join(vault, ARSIP, nama, f), KEPALA_ARSIP + isi);
    }
  }
}

// ---------------------------------------------------------------
function utama() {
  const vault = cariVault();
  if (!vault) return; // Obsidian belum dipasang / vault tidak ketemu.
  salinCatatan(vault);
  salinIngatan(vault);
  if (process.argv.includes("--laporkan")) {
    console.log(`Vault: ${vault}`);
    console.log(jumlahTulis === 0 ? "Tidak ada yang berubah." : `${jumlahTulis} berkas diperbarui.`);
  }
}

try {
  utama();
} catch (e) {
  if (process.argv.includes("--laporkan")) console.error("Gagal:", e?.message ?? e);
}
process.exit(0);

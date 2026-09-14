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

/** Nama env yang DIBACA kode. Nama saja — nilainya tidak pernah disentuh. */
function daftarEnv() {
  const nama = new Set();
  const antre = [path.join(AKAR, "src")];
  const tambahan = [path.join(AKAR, "next.config.ts")];
  while (antre.length > 0) {
    const dir = antre.pop();
    let isi;
    try {
      isi = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of isi) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) antre.push(p);
      else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) tambahan.push(p);
    }
  }
  for (const berkas of tambahan) {
    try {
      for (const m of fs.readFileSync(berkas, "utf8").matchAll(/process\.env\.([A-Z0-9_]+)/g)) nama.add(m[1]);
    } catch {
      // Berkas hilang saat dibaca — lewati.
    }
  }
  const abai = new Set(["NODE_ENV", "VERCEL"]);
  const daftar = Array.from(nama).filter((n) => !abai.has(n)).sort();
  if (daftar.length === 0) return "_Tidak terbaca._";
  return daftar.map((n) => `- \`${n}\``).join("\n");
}

/** Rute API, dikelompokkan per folder teratas. */
function daftarApi() {
  const akarApi = path.join(AKAR, "src", "app", "api");
  const rute = [];
  const antre = [""];
  while (antre.length > 0) {
    const rel = antre.pop();
    let isi;
    try {
      isi = fs.readdirSync(path.join(akarApi, rel), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of isi) {
      if (e.isDirectory()) antre.push(path.join(rel, e.name));
      else if (e.name === "route.ts") rute.push(rel.replace(/\\/g, "/") || "(akar)");
    }
  }
  if (rute.length === 0) return "_Tidak terbaca._";
  const kelompok = new Map();
  for (const r of rute.sort()) {
    const atas = r.split("/")[0];
    if (!kelompok.has(atas)) kelompok.set(atas, []);
    kelompok.get(atas).push(r);
  }
  const baris = [`**${rute.length} rute.**`, ""];
  for (const [atas, daftar] of Array.from(kelompok).sort()) {
    baris.push(`- **/api/${atas}** — ${daftar.map((d) => `\`${d.slice(atas.length + 1) || "/"}\``).join(" · ")}`);
  }
  return baris.join("\n");
}

/** Modul layar (src/features). */
function daftarModul() {
  try {
    return fs
      .readdirSync(path.join(AKAR, "src", "features"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => {
        const n = fs.readdirSync(path.join(AKAR, "src", "features", e.name)).filter((f) => /\.tsx?$/.test(f)).length;
        return `- \`${e.name}\` — ${n} berkas`;
      })
      .join("\n");
  } catch {
    return "_Tidak terbaca._";
  }
}

/** Riwayat versi aplikasi dari src/lib/changelog.ts (yang dibaca pengguna). */
function daftarChangelog() {
  try {
    const isi = fs.readFileSync(path.join(AKAR, "src", "lib", "changelog.ts"), "utf8");
    const entri = [];
    const pola = /versi:\s*"([^"]+)"[\s\S]{0,200}?tanggal:\s*"([^"]+)"[\s\S]{0,200}?judul:\s*"([^"]+)"/g;
    for (const m of isi.matchAll(pola)) entri.push(`- **${m[1]}** · ${m[2]} — ${m[3]}`);
    return entri.length > 0 ? entri.join("\n") : "_Tidak terbaca._";
  } catch {
    return "_Tidak terbaca._";
  }
}

const BLOK = {
  riwayat: () => daftarRiwayat(),
  sql: () => daftarSql(),
  env: () => daftarEnv(),
  api: () => daftarApi(),
  modul: () => daftarModul(),
  changelog: () => daftarChangelog(),
  ingatan: (awalan) => daftarIngatan(awalan),
  diperbarui: () => stempel(),
};

function isiBlokOtomatis(teks) {
  // Bentuk blok: <!-- otomatis:nama --> atau <!-- otomatis:nama:argumen -->
  return teks.replace(
    /<!--\s*otomatis:([a-z]+)(?::([a-z0-9-]+))?\s*-->[\s\S]*?<!--\s*\/otomatis\s*-->/g,
    (cocok, nama, argumen) => {
      const buat = BLOK[nama];
      if (!buat) return cocok;
      const kepala = argumen ? `otomatis:${nama}:${argumen}` : `otomatis:${nama}`;
      return `<!-- ${kepala} -->\n${buat(argumen)}\n<!-- /otomatis -->`;
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
//
// Ingatan saling menaut sesamanya sejak awal, tapi TERPUTUS dari catatan
// proyek — dua pulau di grafik Obsidian. Di sini jembatannya dipasang dua
// arah: tiap arsip menaut ke catatan proyeknya, dan catatan proyek punya
// blok <!-- otomatis:ingatan:<awalan> --> yang mendaftar ingatannya.
// ---------------------------------------------------------------
const INDEKS_INGATAN = "Indeks Ingatan";

/** Catatan proyek yang memayungi sebuah ingatan. */
function proyekUntukIngatan(folder, slug) {
  if (/monitor-karya/.test(folder)) return "MonitorKarya";
  if (slug.startsWith("pri-superapp-")) return "PRI SuperApp";
  if (/(^|-)(qc|n8n|scraper|apify)(-|$)/.test(slug)) return "QC Sosmed - Catatan Teknis";
  return "Proyek Claude Code";
}

/** Baca frontmatter ringkas sebuah berkas ingatan. */
function bacaIngatan(jalur) {
  const isi = fs.readFileSync(jalur, "utf8");
  const ambil = (kunci) => {
    const m = new RegExp(`^${kunci}:\\s*"?(.+?)"?\\s*$`, "m").exec(isi.slice(0, 1200));
    return m ? m[1].trim() : "";
  };
  return { isi, deskripsi: ambil("description") };
}

/** Kumpulkan semua ingatan (dipakai indeks & blok otomatis). */
function kumpulkanIngatan() {
  const akarProyek = path.join(os.homedir(), ".claude", "projects");
  const hasil = [];
  if (!fs.existsSync(akarProyek)) return hasil;
  for (const proyek of fs.readdirSync(akarProyek)) {
    const dirMemori = path.join(akarProyek, proyek, "memory");
    if (!fs.existsSync(dirMemori)) continue;
    // Nama folder dipendekkan: "c--Users-Admin-nama-project-kamu" →
    // "nama-project-kamu". Yang panjang itu penyandian jalur, bukan nama.
    const folder = proyek.replace(/^[a-zA-Z]--(Users-[^-]+-)?/, "") || proyek;
    for (const f of fs.readdirSync(dirMemori).filter((n) => n.endsWith(".md"))) {
      const slug = f.replace(/\.md$/, "");
      if (slug === "MEMORY") continue; // indeks bawaan Claude, digantikan indeks sendiri
      const { isi, deskripsi } = bacaIngatan(path.join(dirMemori, f));
      hasil.push({ folder, slug, deskripsi, isi, proyek: proyekUntukIngatan(folder, slug) });
    }
  }
  return hasil.sort((a, b) => a.slug.localeCompare(b.slug));
}

let cacheIngatan = null;
function ingatan() {
  if (!cacheIngatan) cacheIngatan = kumpulkanIngatan();
  return cacheIngatan;
}

/** Daftar ingatan untuk sebuah catatan proyek (dipakai blok otomatis). */
function daftarIngatan(awalan) {
  const peta = {
    "pri-superapp": "PRI SuperApp",
    "qc-sosmed": "QC Sosmed - Catatan Teknis",
    monitorkarya: "MonitorKarya",
    umum: "Proyek Claude Code",
  };
  const proyek = peta[awalan ?? ""] ?? null;
  const daftar = ingatan().filter((m) => (proyek ? m.proyek === proyek : true));
  if (daftar.length === 0) return "_Belum ada catatan ingatan untuk ini._";
  const baris = daftar.map((m) => `- [[${m.slug}]]${m.deskripsi ? ` — ${m.deskripsi}` : ""}`);
  return [`**${daftar.length} catatan ingatan.** Indeks lengkap: [[${INDEKS_INGATAN}]].`, "", ...baris].join("\n");
}

function kepalaArsip(m) {
  return [
    `> [!info] Arsip otomatis — bagian dari [[${m.proyek}]]`,
    "> Berkas ini SALINAN ingatan Claude Code. Menyuntingnya di sini tidak",
    "> mengubah ingatan Claude — dan akan tertimpa pada sinkron berikutnya.",
    `> Indeks: [[${INDEKS_INGATAN}]] · Peta proyek: [[Proyek Claude Code]]`,
    "",
    "",
  ].join("\n");
}

/** Indeks seluruh ingatan, dikelompokkan per proyek. */
function tulisIndeksIngatan(vault) {
  const semua = ingatan();
  if (semua.length === 0) return;
  const perProyek = new Map();
  for (const m of semua) {
    if (!perProyek.has(m.proyek)) perProyek.set(m.proyek, []);
    perProyek.get(m.proyek).push(m);
  }
  const baris = [
    "---",
    "type: resource",
    "status: active",
    "area: PRI",
    "tags: [claude, ingatan, indeks]",
    "---",
    "",
    "<!-- Catatan ini DIBUAT MESIN oleh alat/obsidian-sinkron.mjs. Jangan disunting. -->",
    "",
    `Seluruh **${semua.length}** catatan ingatan Claude Code di komputer ini,`,
    "dikelompokkan menurut proyek yang memayunginya. Isinya catatan kerja",
    "Claude — sering teknis dan padat singkatan; catatan yang sudah dirapikan",
    "untuk dibaca manusia ada di [[Proyek Claude Code]].",
    "",
  ];
  for (const [proyek, daftar] of Array.from(perProyek).sort((a, b) => b[1].length - a[1].length)) {
    baris.push(`## [[${proyek}]] — ${daftar.length} catatan`, "");
    for (const m of daftar) {
      baris.push(`- [[${m.slug}]]${m.deskripsi ? ` — ${m.deskripsi}` : ""}`);
    }
    baris.push("");
  }
  tulisBilaBeda(path.join(vault, ARSIP, `${INDEKS_INGATAN}.md`), baris.join("\n"));
}

function salinIngatan(vault) {
  const folderTerpakai = new Set();
  for (const m of ingatan()) {
    folderTerpakai.add(m.folder);
    tulisBilaBeda(path.join(vault, ARSIP, m.folder, `${m.slug}.md`), kepalaArsip(m) + sensor(m.isi));
  }
  // Salinan MEMORY.md dari versi skrip terdahulu: indeks bawaan Claude yang
  // kini digantikan "Indeks Ingatan". Dibuang supaya tidak ada dua daftar
  // yang saling bertentangan — hanya berkas yang DIBUAT skrip ini sendiri.
  for (const folder of folderTerpakai) {
    const usang = path.join(vault, ARSIP, folder, "MEMORY.md");
    try {
      if (fs.existsSync(usang)) {
        fs.unlinkSync(usang);
        jumlahTulis += 1;
      }
    } catch {
      // Gagal menghapus bukan alasan menggagalkan sinkron.
    }
  }
  tulisIndeksIngatan(vault);
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

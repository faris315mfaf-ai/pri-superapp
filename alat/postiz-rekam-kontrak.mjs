#!/usr/bin/env node
// =====================================================================
// PEREKAM KONTRAK POSTIZ
//
// Kenapa alat ini ada: di proyek ini menebak bentuk data layanan luar
// sudah berkali-kali jadi bug yang GAGAL DIAM-DIAM — bukan error merah,
// tapi fitur yang tampak jalan padahal tidak. Contoh nyata dari
// upload-post: field jadwal bernama "schedule_date" DITERIMA server
// tanpa protes lalu DIABAIKAN, sehingga video yang dijadwalkan besok
// langsung terbit detik itu juga. Tidak ada satu pun galat di layar.
//
// Jadi sebelum ada satu anggota pun dipindah ke Postiz, alat ini
// menembak instansi Postiz KITA SENDIRI, merekam jawaban ASLINYA, lalu
// membandingkannya dengan apa yang dibaca src/lib/postiz.ts.
//
// CARA PAKAI (di VPS, setelah Postiz terpasang):
//   POSTIZ_URL=https://postiz.pri-superapp.com \
//   POSTIZ_API_KEY=... \
//   node alat/postiz-rekam-kontrak.mjs
//
// Pilihan tambahan:
//   --tulis <berkas>   simpan rekaman mentah (bawaan: postiz-kontrak.json)
//   --kirim-uji        IKUT menguji kiriman NYATA berupa draft (aman:
//                      draft tidak terbit ke sosmed mana pun), lalu
//                      menghapusnya kembali.
//
// KUNCI API TIDAK PERNAH ditulis ke berkas hasil maupun ke layar.
// =====================================================================

import { writeFileSync } from "node:fs";

const ALAMAT = (process.env.POSTIZ_URL ?? "").replace(/\/+$/, "");
const KUNCI = process.env.POSTIZ_API_KEY ?? "";
const argv = process.argv.slice(2);
const BERKAS = argv.includes("--tulis") ? argv[argv.indexOf("--tulis") + 1] : "postiz-kontrak.json";
const KIRIM_UJI = argv.includes("--kirim-uji");

if (!ALAMAT || !KUNCI) {
  console.error("Isi dulu POSTIZ_URL dan POSTIZ_API_KEY.");
  console.error("Contoh: POSTIZ_URL=https://postiz.pri-superapp.com POSTIZ_API_KEY=xxx node alat/postiz-rekam-kontrak.mjs");
  process.exit(2);
}

const DASAR = `${ALAMAT}/api/public/v1`;
const rekaman = { alamat: ALAMAT, direkam: new Date().toISOString(), skema_auth: null, langkah: [] };
let masalah = 0;
let skemaAuth = "mentah";

const sensor = (t) => String(t ?? "").split(KUNCI).join("«KUNCI-DISENSOR»");

async function tembak(nama, jalur, init = {}) {
  const mulai = Date.now();
  const hasil = { nama, jalur, metode: init.method ?? "GET", status: 0, ms: 0, json: null, teks: "" };
  try {
    const res = await fetch(`${DASAR}${jalur}`, {
      ...init,
      headers: {
        Authorization: skemaAuth === "bearer" ? `Bearer ${KUNCI}` : KUNCI,
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(init.timeoutMs ?? 30000),
    });
    hasil.status = res.status;
    const teks = await res.text();
    try {
      hasil.json = teks ? JSON.parse(teks) : null;
    } catch {
      hasil.teks = sensor(teks).slice(0, 400);
    }
  } catch (e) {
    hasil.teks = sensor(e?.message ?? String(e));
  }
  hasil.ms = Date.now() - mulai;
  rekaman.langkah.push(hasil);
  return hasil;
}

/** Semua nama field yang muncul di sebuah objek/daftar, sampai 2 lapis. */
function kunciDari(nilai, lapis = 0) {
  if (lapis > 2 || !nilai || typeof nilai !== "object") return [];
  if (Array.isArray(nilai)) return nilai.length ? kunciDari(nilai[0], lapis) : [];
  const keluar = [];
  for (const [k, v] of Object.entries(nilai)) {
    keluar.push(k);
    if (v && typeof v === "object") for (const anak of kunciDari(v, lapis + 1)) keluar.push(`${k}.${anak}`);
  }
  return keluar;
}

function lapor(ok, pesan, tambahan) {
  if (!ok) masalah++;
  console.log(`  ${ok ? "✔" : "✘"} ${pesan}${tambahan ? ` — ${tambahan}` : ""}`);
}

/** Apakah salah satu nama yang dibaca lib/postiz.ts benar-benar ada? */
function adaSalahSatu(kunci, kandidat) {
  const set = new Set(kunci.map((k) => k.split(".").pop()));
  return kandidat.filter((k) => set.has(k));
}

console.log(`\nMEREKAM KONTRAK POSTIZ — ${ALAMAT}\n`);

// ---------------------------------------------------------------
// 1. Bentuk header Authorization
// ---------------------------------------------------------------
console.log("[1] Bentuk kunci di header Authorization");
let cobaan = await tembak("auth-mentah", "/integrations/list");
if (cobaan.status === 401 || cobaan.status === 403) {
  console.log("  … kunci mentah ditolak, mencoba bentuk \"Bearer <kunci>\"");
  skemaAuth = "bearer";
  cobaan = await tembak("auth-bearer", "/integrations/list");
}
rekaman.skema_auth = skemaAuth;
lapor(cobaan.status === 200, `Authorization: ${skemaAuth === "bearer" ? "Bearer <kunci>" : "<kunci> mentah"}`, `HTTP ${cobaan.status}`);
if (cobaan.status !== 200) {
  console.log("\n  Postiz tidak menerima kunci ini. Periksa:");
  console.log("   - kunci diambil dari Postiz → Settings → Public API");
  console.log("   - alamatnya benar dan containernya hidup (docker ps | grep postiz)");
  writeFileSync(BERKAS, JSON.stringify(rekaman, null, 2));
  console.log(`\n  Rekaman mentah: ${BERKAS}`);
  process.exit(1);
}
if (skemaAuth === "bearer") {
  console.log("  ▸ TINDAKAN: tambahkan POSTIZ_AUTH_SKEMA=bearer di env aplikasi.");
}

// ---------------------------------------------------------------
// 2. Daftar akun tertaut
// ---------------------------------------------------------------
console.log("\n[2] Daftar akun tertaut (integrations)");
const integ = cobaan.json;
const bungkus = Array.isArray(integ) ? "daftar langsung" : Object.keys(integ ?? {}).join(", ") || "(kosong)";
console.log(`  bentuk balasan: ${bungkus}`);
const contohInteg = Array.isArray(integ) ? integ[0] : (integ?.integrations ?? integ?.data ?? [])[0];
if (!contohInteg) {
  lapor(false, "belum ada satu pun akun tertaut di Postiz", "tautkan minimal 1 akun dulu, lalu ulangi");
} else {
  const k = kunciDari(contohInteg);
  console.log(`  field yang ada: ${k.join(", ")}`);
  lapor(adaSalahSatu(k, ["id"]).length > 0, "field id ada");
  const ident = adaSalahSatu(k, ["identifier", "providerIdentifier", "provider"]);
  lapor(ident.length > 0, "nama platform terbaca", ident.join("/") || "TIDAK ADA — perbaiki bacaIntegrasi()");
  const nama = adaSalahSatu(k, ["name", "username", "profile"]);
  lapor(nama.length > 0, "nama akun terbaca", nama.join("/"));
  const pel = adaSalahSatu(k, ["customer", "customerId"]);
  console.log(`  ${pel.length ? "✔" : "·"} pemisahan per anggota (customer): ${pel.join("/") || "tidak ada di balasan ini"}`);
  if (!pel.length) {
    console.log("    ▸ PENTING: tanpa \"customer\", SEMUA akun anggota bercampur dalam satu daftar.");
    console.log("      Pemisahannya harus dikerjakan aplikasi (simpan id integrasi per anggota).");
  }
}

// ---------------------------------------------------------------
// 3. Riwayat postingan
// ---------------------------------------------------------------
console.log("\n[3] Riwayat postingan (rentang tanggal)");
const sampai = new Date();
const mulai = new Date(Date.now() - 30 * 86400000);
const q = new URLSearchParams({ startDate: mulai.toISOString(), endDate: sampai.toISOString() });
const posts = await tembak("posts-rentang", `/posts?${q}`);
lapor(posts.status === 200, "GET /posts menerima startDate & endDate", `HTTP ${posts.status}`);
if (posts.status === 200) {
  const daftar = Array.isArray(posts.json) ? posts.json : (posts.json?.posts ?? []);
  console.log(`  ${daftar.length} postingan dalam 30 hari terakhir`);
  if (daftar[0]) {
    const k = kunciDari(daftar[0]);
    console.log(`  field yang ada: ${k.join(", ")}`);
    const st = adaSalahSatu(k, ["state", "status"]);
    lapor(st.length > 0, "status postingan terbaca", st.join("/") || "TIDAK ADA — perbaiki bacaDaftarPost()");
    const url = adaSalahSatu(k, ["releaseURL", "releaseUrl", "postUrl", "url", "permalink", "link"]);
    lapor(url.length > 0, "URL postingan terbaca (dipakai laporan & KPI)", url.join("/") || "TIDAK ADA — KPI tidak akan tercatat");
    const wkt = adaSalahSatu(k, ["publishDate", "createdAt", "date"]);
    lapor(wkt.length > 0, "waktu terbit terbaca", wkt.join("/"));
  } else {
    console.log("  · belum ada postingan — jalankan lagi setelah ada satu kiriman.");
  }
}

// ---------------------------------------------------------------
// 4. Unggah berkas
// ---------------------------------------------------------------
console.log("\n[4] Unggah berkas");
// Berkas kecil sungguhan (GIF 1x1) — bukan video, hanya untuk memastikan
// bentuk balasannya. Video asli diuji manual lewat aplikasi.
const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const form = new FormData();
form.set("file", new Blob([gif], { type: "image/gif" }), "uji-kontrak.gif");
const unggah = await tembak("upload", "/upload", { method: "POST", body: form, timeoutMs: 60000 });
lapor(unggah.status === 200 || unggah.status === 201, "POST /upload menerima field \"file\"", `HTTP ${unggah.status}`);
if (unggah.json) {
  const k = kunciDari(unggah.json);
  console.log(`  field yang ada: ${k.join(", ")}`);
  const id = adaSalahSatu(k, ["id", "fileId", "path"]);
  lapor(id.length > 0, "id berkas terbaca (dipakai melampirkan video)", id.join("/") || "TIDAK ADA — perbaiki bacaIdBerkas()");
}

// ---------------------------------------------------------------
// 5. Kiriman + pembatalan (opsional, pakai DRAFT — tidak terbit)
// ---------------------------------------------------------------
if (KIRIM_UJI) {
  console.log("\n[5] Kiriman percobaan berupa DRAFT (tidak terbit ke sosmed)");
  const satu = Array.isArray(integ) ? integ[0] : (integ?.integrations ?? integ?.data ?? [])[0];
  if (!satu?.id) {
    lapor(false, "tidak ada integrasi untuk diuji");
  } else {
    const muatan = {
      type: "draft",
      date: new Date(Date.now() + 7 * 86400000).toISOString(),
      shortLink: false,
      tags: [],
      posts: [{ integration: { id: String(satu.id) }, value: [{ content: "Uji kontrak PRI SuperApp — draft, abaikan." }], settings: {} }],
    };
    const kirim = await tembak("posts-draft", "/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(muatan),
      timeoutMs: 60000,
    });
    lapor(kirim.status >= 200 && kirim.status < 300, "POST /posts menerima bentuk muatan kita", `HTTP ${kirim.status}`);
    if (kirim.json) {
      const k = kunciDari(kirim.json);
      console.log(`  field balasan: ${k.join(", ")}`);
      const id = adaSalahSatu(k, ["group", "id", "postId", "groupId"]);
      lapor(id.length > 0, "id postingan terbaca (tanpa ini jadwal tak bisa dibatalkan)", id.join("/"));
      const idNyata = Array.isArray(kirim.json) ? kirim.json[0]?.id : (kirim.json.group ?? kirim.json.id);
      if (idNyata) {
        const hapus = await tembak("posts-hapus", `/posts/${encodeURIComponent(idNyata)}`, { method: "DELETE" });
        lapor(hapus.status >= 200 && hapus.status < 300, "DELETE /posts/{id} berhasil — jadwal BISA dibatalkan", `HTTP ${hapus.status}`);
        if (hapus.status >= 200 && hapus.status < 300) {
          console.log("    ▸ ini keunggulan nyata atas upload-post, yang menolak pembatalan (405).");
        }
      }
    }
  }
} else {
  console.log("\n[5] Kiriman percobaan — DILEWATI (tambahkan --kirim-uji untuk mengujinya)");
}

writeFileSync(BERKAS, JSON.stringify(rekaman, null, 2));
console.log(`\nRekaman mentah (kunci sudah disensor): ${BERKAS}`);
console.log(masalah === 0
  ? "\nKONTRAK COCOK. src/lib/postiz.ts boleh dipercaya untuk uji coba terbatas.\n"
  : `\n${masalah} hal TIDAK cocok. Perbaiki src/lib/postiz.ts sesuai catatan di atas SEBELUM memindahkan anggota.\n`);
process.exit(masalah === 0 ? 0 : 1);

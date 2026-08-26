#!/usr/bin/env node
// ============================================================
// Otomasi Cloudflare untuk PRI SuperApp.
//
// Tanpa pustaka tambahan — cukup Node/Bun. Token TIDAK PERNAH
// dicetak ke layar maupun ke log.
//
// CARA PAKAI (token disimpan di berkas, bukan ditempel di chat):
//   1. Buat berkas .env.cloudflare di akar proyek, isinya:
//        CLOUDFLARE_API_TOKEN=xxxxxxxxxxxxxxxx
//        CF_DOMAIN=namadomainanda.com
//   2. Jalankan:
//        node scripts/cloudflare-setup.mjs cek
//        node scripts/cloudflare-setup.mjs ssl
//        node scripts/cloudflare-setup.mjs dns A @ 76.76.21.21 --dns-only
//        node scripts/cloudflare-setup.mjs ratelimit
//
// Semua perintah IDEMPOTEN: dijalankan dua kali tidak menggandakan
// apa pun — record/rule yang sudah ada diperbarui, bukan ditambah.
//
// CATATAN PENTING soal rate limiting:
// - Rule Cloudflare HANYA berlaku bila DNS-nya proxied (awan oranye).
//   Kalau DNS-only (awan abu-abu), trafik tidak lewat Cloudflare dan
//   rule ini tidak pernah terpicu.
// - Plan Free hanya mengizinkan SATU rate limiting rule per zona,
//   dan hanya bisa menghitung per-IP. Karena itu skrip ini membuat
//   SATU rule gabungan untuk semua endpoint auth, bukan empat.
// ============================================================

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DASAR = "https://api.cloudflare.com/client/v4";

// Endpoint yang dilindungi rate limit tepi (harus sama dengan yang
// dijaga limiter in-memory di src/lib/rate-limit.ts).
const JALUR_AUTH = [
  "/api/login",
  "/api/otp",
  "/api/otp/ulang",
  "/api/daftar",
  "/api/sandi/lupa",
];

const NAMA_RULE = "PRI SuperApp - batas percobaan endpoint auth";

// ------------------------------------------------------------
// Kredensial
// ------------------------------------------------------------

/** Baca .env.cloudflare (KEY=VALUE) tanpa menimpa env yang sudah ada. */
function muatEnv() {
  try {
    const isi = readFileSync(resolve(AKAR, ".env.cloudflare"), "utf8");
    for (const baris of isi.split(/\r?\n/)) {
      const cocok = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(baris);
      if (cocok && !process.env[cocok[1]]) {
        process.env[cocok[1]] = cocok[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // Berkas belum ada — mungkin kredensial dipasok lewat env langsung.
  }
}

muatEnv();

const TOKEN = process.env.CLOUDFLARE_API_TOKEN ?? "";
const DOMAIN = (process.env.CF_DOMAIN ?? "").trim().toLowerCase();

if (!TOKEN || !DOMAIN) {
  console.error(
    "Kredensial belum lengkap.\n" +
      "Buat berkas .env.cloudflare di akar proyek berisi:\n" +
      "  CLOUDFLARE_API_TOKEN=...\n" +
      "  CF_DOMAIN=namadomainanda.com",
  );
  process.exit(1);
}

// ------------------------------------------------------------
// Pembantu HTTP
// ------------------------------------------------------------

/**
 * Panggil API Cloudflare. Melempar Error berisi pesan asli Cloudflare
 * supaya penyebab penolakan jelas (mis. token kurang izin).
 */
async function panggil(jalur, opsi = {}) {
  const res = await fetch(`${DASAR}${jalur}`, {
    ...opsi,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(opsi.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => null);
  if (!json?.success) {
    const pesan =
      json?.errors?.map((e) => `${e.code}: ${e.message}`).join("; ") ??
      `HTTP ${res.status}`;
    throw new Error(pesan);
  }
  return json.result;
}

/** Cari zona berdasarkan nama domain; null bila belum terdaftar. */
async function cariZona() {
  const hasil = await panggil(`/zones?name=${encodeURIComponent(DOMAIN)}`);
  return hasil?.[0] ?? null;
}

async function zonaWajib() {
  const zona = await cariZona();
  if (!zona) {
    throw new Error(
      `Domain "${DOMAIN}" belum ada di akun Cloudflare ini, atau token tidak diberi akses ke zona itu.`,
    );
  }
  return zona;
}

// ------------------------------------------------------------
// Perintah: cek
// ------------------------------------------------------------

async function perintahCek() {
  // Verifikasi token lebih dulu supaya pesan galatnya jelas.
  const token = await panggil("/user/tokens/verify");
  console.log(`Token: ${token.status}`);

  const zona = await zonaWajib();
  console.log(`\nDomain     : ${zona.name}`);
  console.log(`Zone ID    : ${zona.id}`);
  console.log(`Status     : ${zona.status}`);
  console.log(`Plan       : ${zona.plan?.name ?? "-"}`);
  console.log(
    `Nameserver : ${(zona.name_servers ?? []).join(", ") || "(belum tersedia)"}`,
  );

  if (zona.status !== "active") {
    console.log(
      "\nStatus belum 'active' — nameserver di panel registrar (tempat beli\n" +
        "domain) harus diganti ke dua nameserver di atas, lalu tunggu propagasi.",
    );
  }

  const dns = await panggil(`/zones/${zona.id}/dns_records?per_page=100`);
  console.log(`\nDNS record (${dns.length}):`);
  for (const r of dns) {
    console.log(
      `  ${r.type.padEnd(6)} ${r.name.padEnd(32)} → ${String(r.content).slice(0, 48)}` +
        `  [${r.proxied ? "proxied/oranye" : "dns-only/abu"}]`,
    );
  }

  const ssl = await panggil(`/zones/${zona.id}/settings/ssl`);
  console.log(`\nMode SSL/TLS: ${ssl.value}`);

  const rules = await ambilRuleRatelimit(zona.id);
  console.log(`Rate limiting rule terpasang: ${rules.length}`);
  for (const r of rules) console.log(`  - ${r.description}`);
}

// ------------------------------------------------------------
// Perintah: ssl
// ------------------------------------------------------------

async function perintahSsl() {
  const zona = await zonaWajib();
  // Full (strict): Vercel memakai sertifikat tepercaya, jadi mode ini
  // aman DAN mencegah penyadapan di ruas Cloudflare→origin.
  await panggil(`/zones/${zona.id}/settings/ssl`, {
    method: "PATCH",
    body: JSON.stringify({ value: "strict" }),
  });
  await panggil(`/zones/${zona.id}/settings/always_use_https`, {
    method: "PATCH",
    body: JSON.stringify({ value: "on" }),
  });
  await panggil(`/zones/${zona.id}/settings/min_tls_version`, {
    method: "PATCH",
    body: JSON.stringify({ value: "1.2" }),
  });
  console.log(
    "SSL/TLS = Full (strict), Always Use HTTPS = on, TLS minimum = 1.2",
  );
}

// ------------------------------------------------------------
// Perintah: dns <tipe> <nama> <isi> [--proxy|--dns-only]
// ------------------------------------------------------------

async function perintahDns(args) {
  const [tipe, namaMentah, isi] = args;
  if (!tipe || !namaMentah || !isi) {
    throw new Error(
      'Pemakaian: dns <A|CNAME|TXT> <nama|@> <isi> [--proxy|--dns-only]',
    );
  }
  const proxied = args.includes("--proxy");
  const nama = namaMentah === "@" ? DOMAIN : namaMentah;
  const zona = await zonaWajib();

  const adaSemua = await panggil(
    `/zones/${zona.id}/dns_records?type=${tipe.toUpperCase()}&name=${encodeURIComponent(nama)}`,
  );
  const muatan = JSON.stringify({
    type: tipe.toUpperCase(),
    name: nama,
    content: isi,
    ttl: 1, // 1 = otomatis
    proxied,
  });

  if (adaSemua.length > 0) {
    await panggil(`/zones/${zona.id}/dns_records/${adaSemua[0].id}`, {
      method: "PUT",
      body: muatan,
    });
    console.log(`Record ${tipe.toUpperCase()} ${nama} DIPERBARUI → ${isi}`);
  } else {
    await panggil(`/zones/${zona.id}/dns_records`, {
      method: "POST",
      body: muatan,
    });
    console.log(`Record ${tipe.toUpperCase()} ${nama} DIBUAT → ${isi}`);
  }
  console.log(`Mode: ${proxied ? "proxied (awan oranye)" : "DNS only (awan abu-abu)"}`);
}

// ------------------------------------------------------------
// Perintah: ratelimit
// ------------------------------------------------------------

/** Ambil entrypoint ruleset fase http_ratelimit (dibuat bila belum ada). */
async function entrypointRatelimit(zoneId) {
  try {
    return await panggil(`/zones/${zoneId}/rulesets/phases/http_ratelimit/entrypoint`);
  } catch {
    return await panggil(`/zones/${zoneId}/rulesets`, {
      method: "POST",
      body: JSON.stringify({
        name: "default",
        kind: "zone",
        phase: "http_ratelimit",
        rules: [],
      }),
    });
  }
}

async function ambilRuleRatelimit(zoneId) {
  const rs = await entrypointRatelimit(zoneId);
  return rs.rules ?? [];
}

async function perintahRatelimit(args) {
  const angka = (bendera, bawaan) => {
    const i = args.indexOf(bendera);
    return i >= 0 && args[i + 1] ? Number(args[i + 1]) : bawaan;
  };
  const permintaan = angka("--requests", 20);
  const periode = angka("--period", 60);
  const blokir = angka("--block", 600);

  const zona = await zonaWajib();
  const rs = await entrypointRatelimit(zona.id);
  const lama = (rs.rules ?? []).find((r) => r.description === NAMA_RULE);

  const aturan = {
    description: NAMA_RULE,
    // Satu rule untuk semua endpoint auth — plan Free hanya
    // mengizinkan satu rule per zona.
    expression: `(http.request.uri.path in {${JALUR_AUTH.map((p) => `"${p}"`).join(" ")}})`,
    action: "block",
    enabled: true,
    ratelimit: {
      // cf.colo.id disertakan mengikuti contoh resmi Cloudflare;
      // ip.src adalah satu-satunya penghitung yang tersedia di Free.
      characteristics: ["cf.colo.id", "ip.src"],
      period: periode,
      requests_per_period: permintaan,
      mitigation_timeout: blokir,
    },
  };

  if (lama) {
    await panggil(`/zones/${zona.id}/rulesets/${rs.id}/rules/${lama.id}`, {
      method: "PATCH",
      body: JSON.stringify(aturan),
    });
    console.log("Rate limiting rule DIPERBARUI.");
  } else {
    await panggil(`/zones/${zona.id}/rulesets/${rs.id}/rules`, {
      method: "POST",
      body: JSON.stringify(aturan),
    });
    console.log("Rate limiting rule DIBUAT.");
  }

  console.log(`  Jalur   : ${JALUR_AUTH.join(", ")}`);
  console.log(`  Batas   : ${permintaan} permintaan / ${periode} detik / IP`);
  console.log(`  Tindakan: blokir ${blokir} detik`);

  const dns = await panggil(`/zones/${zona.id}/dns_records?per_page=100`);
  if (!dns.some((r) => r.proxied)) {
    console.log(
      "\nPERINGATAN: tidak ada DNS record yang proxied (awan oranye).\n" +
        "Selama trafik tidak lewat Cloudflare, rule ini TIDAK akan pernah terpicu.",
    );
  }
}

// ------------------------------------------------------------
// Jalankan
// ------------------------------------------------------------

const [perintah, ...sisa] = process.argv.slice(2);

const daftar = {
  cek: perintahCek,
  ssl: perintahSsl,
  dns: () => perintahDns(sisa),
  ratelimit: () => perintahRatelimit(sisa),
};

if (!daftar[perintah]) {
  console.log(
    "Perintah tersedia:\n" +
      "  cek                                     status zona, nameserver, DNS, SSL, rule\n" +
      "  ssl                                     Full (strict) + Always HTTPS + TLS 1.2\n" +
      "  dns <tipe> <nama|@> <isi> [--proxy]     buat/perbarui satu DNS record\n" +
      "  ratelimit [--requests N --period S --block S]\n",
  );
  process.exit(daftar[perintah] ? 0 : 1);
}

try {
  await daftar[perintah]();
} catch (e) {
  console.error(`GAGAL: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}

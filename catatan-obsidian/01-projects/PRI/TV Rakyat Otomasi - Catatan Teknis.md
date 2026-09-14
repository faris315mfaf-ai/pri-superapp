---
type: project
status: on-hold
area: PRI
tags: [project, pri, tv-rakyat, n8n]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp.
     Sunting di sini akan tertimpa — ubah di catatan-obsidian/ pada repo.
     Catatan milik sendiri ada di [[AUTOMATION TV RAKYAT]] — bebas disunting. -->

Sisi teknis dari [[AUTOMATION TV RAKYAT]]: otomasi repost video untuk akun
Instagram TV Rakyat / Nusantara TV.

## Alur besarnya
1. **Scrape tiap 30 menit** — video baru dari 3 akun TikTok + 3 akun Instagram
2. **Deteksi duplikat** — AI membandingkan apakah dua video itu kejadian yang
   sama diposting di dua platform
3. **Minta doksli** — tim redaksi dikabari lewat WhatsApp, membalas dengan
   tautan video sumber aslinya
4. **Render** — video diberi overlay judul/highlight/sumber
5. **Terbit** — diunggah ke Instagram TV Rakyat

Ketiganya hidup dalam **satu berkas workflow n8n** dengan tiga pemicu
terpisah, jadi praktis berjalan sebagai tiga pipeline mandiri.

> [!info] Ini bukan proyek kode biasa
> Tidak ada git, tidak ada `npm install`, tidak ada test. Seluruh logika ada
> di satu berkas JSON. "Deploy" berarti **mengimpor JSON itu ke n8n Cloud
> lewat layar webnya** — tidak ada yang otomatis.

## Status: menggantung
Versi perbaikan menyeluruh (`OTOMATISASI_TV_RAKYAT_FIXED.json`, 37 node)
sudah dibangun dan divalidasi, tapi **belum ada konfirmasi bahwa versi itu
benar-benar dijalankan di n8n Cloud**. Sesi terakhir masih menunjukkan
pengujian pada versi lama.

**Langkah pertama kalau proyek ini dilanjutkan:** pastikan dulu yang
terpasang di n8n itu versi FIXED atau versi lama. Menambal versi lama
sementara versi FIXED sudah siap hanya membuang waktu dua kali.

## Yang sudah diperbaiki di versi FIXED
- Nama kolom diseragamkan sejak awal (dulu beda huruf besar-kecil → filter
  mengembalikan kosong)
- Node pembaca sheet dikunci agar berjalan sekali (dulu menghasilkan 1022
  baris dari sheet berisi puluhan baris)
- Perintah AI untuk deteksi duplikat yang tadinya **kosong** kini diisi
- Menunggu render diubah jadi pemeriksaan berulang — render butuh 20–120
  detik, sebelumnya hanya ditunggu 1 detik
- Dua token berbeda untuk layanan yang sama disatukan (dulu ditolak 403)
- Pemicu sheet diubah agar ikut terpicu saat baris **diperbarui**, bukan
  hanya saat ditambahkan

## Berkas penting
`…\nama-project-kamu\tv-rakyat-docs\`
- `OTOMATISASI_TV_RAKYAT_FIXED.json` — versi perbaikan
- `docs/status.md` — status rinci · `docs/known-issues.md` — masalah terbuka
- `docs/node-reference.md` — penjelasan tiap node

## Terkait
- [[AUTOMATION TV RAKYAT]] · [[PRI SuperApp]] · [[Proyek Claude Code]]

<!-- otomatis:diperbarui -->
<!-- /otomatis -->

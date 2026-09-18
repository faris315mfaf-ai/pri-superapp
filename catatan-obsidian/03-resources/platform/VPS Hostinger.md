---
type: platform
category: hosting
status: active
pricing: KVM 8 — Hostinger
tags: [platform, pri, server]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp. -->

## Apa ini & untuk apa
Server tempat [[PRI SuperApp]] hidup seluruhnya sejak 12 September 2026 —
aplikasi **dan** databasenya. Sebelumnya aplikasi di [[Vercel]] dan database
di Supabase Cloud.

**Spesifikasi**: Ubuntu · 8 vCPU · 32 GB RAM · 400 GB · IP `187.77.113.63` ·
ping ±23 ms dari Indonesia.

## Yang berjalan di sana
| Domain | Isi |
|---|---|
| `pri-superapp.com` | aplikasi |
| `db.pri-superapp.com` | database |
| `auto-comment.tech` | **situs lain milik user** — jangan diganggu |

Tidak ada port yang terbuka ke internet; semua hanya bisa diraih dari dalam
server. Sertifikat HTTPS otomatis.

## Jebakan terbesar di server ini
> [!danger] Caddy di sini adalah CONTAINER, bukan layanan sistem
> Pengaturannya di `/opt/godam/Caddyfile`. Menulis ke lokasi yang biasa
> (`/etc/caddy/Caddyfile`) = menulis ke berkas yang **tidak dipakai siapa
> pun** — tampak berhasil, tidak terjadi apa-apa.
>
> Lanjutannya: bagi container itu, "alamat lokal" berarti dirinya sendiri,
> sementara database sengaja hanya mendengar di alamat lokal **server**.
> Jadi menyambungkannya dengan alamat lokal tidak akan pernah nyambung —
> harus lewat jaringan dalam Docker.

> [!warning] VPS ini TIDAK kosong
> Sudah menjalankan situs lain sebelum PRI masuk. Skrip pemasangan yang
> menimpa pengaturan gerbang akan **mematikan situs itu**. Semua skrip sudah
> diperbaiki: pengaturan tidak pernah ditimpa, hanya ditambah blok bernama,
> dan konfigurasi rusak memicu pengembalian otomatis.

Hal lain yang pernah menggigit: port Docker menembus tembok api (harus
dikunci ke alamat lokal); pengaturan bawaan membuat berkas penyesuaian
diabaikan diam-diam; memori bersama bawaan Docker terlalu kecil sehingga
kueri gagal dengan pesan menyesatkan "No space left on device".

## Perawatan
```
bash vps/09-periksa-kesehatan.sh     # satu layar: BAIK / PERHATIKAN / BAHAYA
```
Memeriksa disk, RAM, swap, container, koneksi database, kueri lama, **umur
cadangan**, sertifikat HTTPS, waktu jawab, port terbuka.

> [!warning] VPS tidak punya cadangan otomatis bawaan
> Supabase Cloud punya; VPS tidak. Skrip cadangan harian **wajib** terpasang.

## Autentikasi
- Kunci database & aplikasi: `/opt/pri-superapp/kunci.env` dan
  `/opt/pri-superapp/aplikasi/env.txt` — hanya di server, tidak pernah di Git.
- Masuk ke server: lewat konsol browser Hostinger atau SSH.

## Project/area terkait
- [[PRI SuperApp]] · [[PRI SuperApp - Arsitektur]] · [[PRI SuperApp - Cara Rilis]] · [[Supabase]]

## Catatan & troubleshooting
- **Situs tidak bisa dibuka padahal server hidup** →
  `bash vps/18-periksa-jaringan.sh`. Pernah terjadi 12 Sep 2026: SSH menjawab
  tapi port web tidak; pulih sendiri, kemungkinan dari sisi Hostinger.
- **Foto tidak muncul** → `bash vps/15-periksa-gambar.sh`
- Pernah ada rencana memasang kunci SSH di komputer user, tapi komputer itu
  punya program autostart mencurigakan — lebih aman lewat konsol browser.

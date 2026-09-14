---
type: platform
category: hosting
status: deprecated
pricing: Pro
tags: [platform, pri, hosting]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp. -->

## Apa ini & untuk apa
Rumah lama [[PRI SuperApp]] (23 Agu – 12 Sep 2026). Sekarang tinggal
**mengalihkan pengunjung** ke `pri-superapp.com` — siapa pun yang membuka
alamat Vercel akan melihat permintaan maaf lalu dialihkan otomatis.

Tim: `faris315mfaf-4418s-projects`, pemilik `faris315mfaf@gmail.com`.

## Cara deploy (hanya bila diminta)
```
npx vercel@59.11.7 --prod --yes --archive=tgz
```

> [!warning] Jangan pakai versi terbaru
> Versi terbaru tidak membaca sesi login lama — akan bilang "Logged out"
> padahal sesinya masih ada. Versi yang dikunci di atas tetap mengenalinya.

> [!warning] Email penulis commit menentukan boleh-tidaknya deploy
> Deploy pernah diblokir tanpa penjelasan (status "UNKNOWN", tanpa build)
> karena email penulis commit terakhir bukan pemilik tim. Identitas Git di
> repo ini sudah disetel ke email pemilik — **jangan diubah kembali**.

- Gagal saat mengunggah berkas satu per satu → tambahkan penggabung arsip
  (sudah termasuk di perintah di atas).
- "Not authorized" kadang muncul walau kredensial normal. **Ulangi perintah
  yang sama persis** — biasanya langsung berhasil. Jangan buru-buru
  menyimpulkan sesi kedaluwarsa.
- Nilai kunci bertipe rahasia **tidak bisa dibaca balik**. Memverifikasi
  dengan membandingkan isi akan selalu "tidak cocok" secara palsu —
  verifikasi lewat perilaku aplikasi setelah deploy.

## Yang ikut terdampak kalau Vercel dipensiunkan
- **APK** terkunci ke alamat Vercel → harus dibangun ulang
- **Sidik jari** (10 pendaftaran) dan **notifikasi push** (7 langganan)
  terikat domain → pemiliknya harus mendaftar ulang
- Penjadwal Vercel harus dimatikan supaya tugas tidak jalan dua kali

## Autentikasi
- Token alat baris perintah tersimpan di komputer user (bukan di repo).

## Project/area terkait
- [[PRI SuperApp]] · [[PRI SuperApp - Cara Rilis]] · [[VPS Hostinger]]

---
type: platform
category: automation
status: active
pricing: bayar per panggilan
tags: [platform, pri, scraping]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp. -->

## Apa ini & untuk apa
Pengambil data TikTok & Instagram. Dua kegunaan di [[PRI SuperApp]]:
1. **Mengambil video tanpa watermark** dari sebuah link — dipakai Studio
   PALUGODAM sebagai bahan render.
2. **Angka per video** (tayangan, suka, komentar, dibagikan) untuk
   leaderboard Video Terbaik.

Juga jadi mesin scraping [[AUTOMATION QC]] lewat workflow [[n8n]] v5.

## Cara pakai / integrasi
- TikTok: ambil satu video lewat id-nya → alamat unduh tanpa watermark
- Instagram: ambil postingan lewat alamatnya → daftar versi video

Angka yang tersedia: TikTok punya tayangan/suka/komentar/dibagikan;
Instagram punya tayangan/suka/komentar. **YouTube, Facebook, Threads, dan X
tidak ada** — untuk itu dipakai [[Chocodata]].

Penyapuan angka dijalankan bertahap: paling banyak 6 akun per sapuan, 12
video per akun, dengan anggaran waktu — supaya tidak membanjiri layanan.
Cakupan penuh semua akun butuh beberapa jam pemakaian.

## Autentikasi
- Key disimpan di: `env.txt` pada VPS, baris `TIKHUB_TOKEN=`

## Project/area terkait
- [[PRI SuperApp]] — Studio PALUGODAM, Video Terbaik
- [[QC Sosmed - Catatan Teknis]] — scraper aktif workflow v5

## Catatan & troubleshooting
> [!warning] Dokumen handoff QC masih menyebut Apify
> Itu sudah usang. Yang aktif TikHub (workflow v5). Mengikuti dokumen lama
> akan membuat perubahan mendarat di workflow yang salah.

- Alamat unduh video berumur pendek — unduh lalu simpan sendiri, jangan
  disimpan alamatnya.
- Gambar sampul TikTok/Instagram butuh penanda khusus agar bisa dimuat dari
  aplikasi.

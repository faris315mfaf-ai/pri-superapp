---
type: platform
category: ai-model
status: testing
pricing: gratis ±500 permintaan/bulan
tags: [platform, pri, wajah]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp. -->

## Apa ini & untuk apa
Pengenalan wajah di [[PRI SuperApp]]: **login tanpa mengetik apa pun**
(sistem mencari siapa Anda dari wajah) dan dulu juga untuk memastikan yang
absen adalah orangnya sendiri.

## Cara pakai / integrasi
- **Pendaftaran**: 5 foto, tanpa uji keaslian
- **Verifikasi**: 1 foto + uji keaslian (anti-foto)
- Aplikasi hanya menyimpan **penanda**, tidak menyimpan data biometrik mentah

Ketatnya bisa disetel dari Panel Master tanpa deploy: ketat login, jarak
anti-mirip, ketat absen. Urutan yang dipakai: setelan database → env → bawaan.

## Status: belum tuntas
> [!warning] Pernah menolak wajah asli pemiliknya
> Pendaftaran berhasil, tapi verifikasi menolak. Sebabnya uji keaslian versi
> ketat + foto yang kurang cocok. Sudah dilonggarkan (5 foto + uji versi
> ringan), tapi **belum dipastikan** apakah selfie hidup lolos.
>
> Kalau masih menolak: matikan uji keaslian (risikonya login bisa ditembus
> foto), atau pindah ke layanan yang memakai tantangan gerak — perombakan besar.

Pernah juga sebaliknya: **wajah berbeda bisa masuk**. Itu sebabnya ambang
ketatnya kini bisa dinaikkan dari Panel Master (saran: 90–92%).

## Biaya
Gratis ±500 permintaan/bulan. Tiap aksi wajah memakai ±2 permintaan.

## Autentikasi
- Key disimpan di: `env.txt` pada VPS — `LUXAND_TOKEN`, `WAJAH_PROVIDER`,
  `WAJAH_LIVENESS`
- Mengubah tingkat uji keaslian butuh nyalakan ulang aplikasi.

## Project/area terkait
- [[PRI SuperApp]] · [[PRI SuperApp - Peran & Akses]]

## Catatan & troubleshooting
- Foto hasil unduhan selalu dianggap palsu oleh uji keaslian — itu memang
  tujuannya, tapi menyulitkan pengujian tanpa orang asli.
- Wajah yang terlalu kecil di foto ditolak dengan alasan teknis, bukan
  "tidak cocok".

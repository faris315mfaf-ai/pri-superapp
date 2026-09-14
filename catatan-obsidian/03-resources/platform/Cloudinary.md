---
type: platform
category: hosting
status: active
pricing: Free — kredit TERLAMPAUI (194%)
tags: [platform, pri, video]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp. -->

## Apa ini & untuk apa
Dua peran di [[PRI SuperApp]]:
1. **Mengompres video besar** — permintaan user: "video maksimal dikompres
   menjadi 50 MB tanpa mengurangi kualitas".
2. **Tempat singgah** video sebelum dirender atau diunggah ke sosmed.

## Cara kerja kompresinya
Plafon kecepatan data dihitung dari **durasi** video supaya hasilnya dijamin
di bawah 50 MB, lalu kualitas otomatis terbaik di bawah plafon itu. Video
yang sudah ≤50 MB **tidak disentuh sama sekali**.

Fakta nyata: video 53,75 MB (1080×1920) → **29,9 MB** dalam 43–59 detik,
kualitas terjaga.

Alur di aplikasi: peramban mengunggah langsung ke Cloudinary (melewati batas
ukuran permintaan server) → server memerintahkan kompresi → hasilnya disalin
ke penyimpanan sendiri → berkas di Cloudinary dihapus.

## Biaya
> [!danger] Kredit sudah terlampaui
> Terpakai **48,6 dari 25 kredit (194%)**, hampir seluruhnya dari bandwidth
> (±48 GB). Cloudinary bisa membatasi akun sewaktu-waktu. Ini risiko nyata,
> bukan peringatan teoretis.

Batas paket gratis: 100 MB per berkas — aplikasi menolak lebih dari itu sejak
di sisi peramban.

## Autentikasi
- Key disimpan di: `env.txt` pada VPS — `CLOUDINARY_CLOUD_NAME`,
  `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_UPLOAD_PRESET`
- Nama cloud: `tyxzpn6u`

## Project/area terkait
- [[PRI SuperApp]] — Kirim Video Manual, TVR Saya, Siaran, Studio

## Catatan & troubleshooting
- Berkas turunan (hasil kompresi) ikut terhapus saat berkas aslinya dihapus.
- Preset unggah menolak GIF ("Unsupported file type").
- Permintaan pertama ke alamat hasil kompresi membalas 200 sambil masih
  memproses — jangan dipakai untuk memastikan selesai; pakai jalur perintah
  langsung.

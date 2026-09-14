---
type: platform
category: automation
status: active
pricing: paket business — 225 profil
tags: [platform, pri, sosmed]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp. -->

## Apa ini & untuk apa
Gerbang satu pintu untuk mengunggah video ke 6 sosial media. Dipakai
[[PRI SuperApp]] untuk **akun pribadi anggota** (TVR Saya, Siaran Serentak,
Studio PALUGODAM). Akun TV Rakyat **Official** memakai [[Ayrshare]] — dua
dunia sengaja dipisah supaya masalah di satu sisi tidak menjatuhkan sisi lain.

## Cara pakai / integrasi
Alamat dasar `https://api.upload-post.com/api`, auth lewat header
`Authorization: Apikey <kunci>`.

| Kegunaan | Endpoint |
|---|---|
| Unggah video | `POST /upload` (form-data) |
| Profil anggota | `GET/POST/DELETE /uploadposts/users` |
| Tautan login sosmed | `POST /uploadposts/users/generate-jwt` → berlaku 48 jam |
| Daftar terjadwal | `GET /uploadposts/schedule` |
| Riwayat | `GET /uploadposts/history` |
| Media akun | `GET /uploadposts/media?platform=&user=&limit=` |
| Angka per profil | `GET /analytics/{profil}` |
| **Angka per postingan** | `GET /uploadposts/post-analytics/cached?user=&since=&until=` |

## Jebakan yang sudah memakan korban
> [!warning] Akun tertaut itu OBJEK, kuncinya `handle`
> Bukan `username`. Salah baca sekali membuat Insight menampilkan akun
> YouTube sementara menu Unggah bilang "belum ada akun" — 7 profil terbaca
> kosong. String kosong = belum tertaut.

> [!warning] Waktu TikTok memakai satuan berbeda
> TikTok mengirim angka detik, platform lain mengirim teks tanggal. Tanpa
> penyeragaman, KPI TikTok **diam-diam tidak tercatat**.

> [!warning] Tidak ada API pembatalan jadwal
> Menghapus jadwal → ditolak. Pembatalan di aplikasi ditempuh dengan
> **menghapus berkas videonya** supaya upload-post gagal mengunduh saat
> jadwal tiba. Hanya berlaku untuk kiriman berkas, bukan kiriman tautan.

- Nama platform X adalah `"x"`, bukan `twitter`.
- Angka per **profil** (`/analytics`) bentuknya seragam; angka per
  **postingan** (`/post-analytics/cached`) berbeda-beda per platform.
- Endpoint per-request-id tidak ada di spesifikasi — pernah dipakai keliru
  dan membuat metrik "tidak terbaca" berhari-hari.

## Autentikasi
- Key disimpan di: `/opt/pri/aplikasi/env.txt`, baris `UPLOAD_POST_API_KEY=`
- Cara generate ulang: dashboard upload-post. Kunci pernah tertulis di chat —
  sebaiknya sudah diganti.

## Project/area terkait
- [[PRI SuperApp]] — TVR Saya, Siaran Serentak, Studio PALUGODAM
- [[PRI SuperApp - Integrasi & API]]

## Catatan & troubleshooting
- **"Belum ada akun" padahal ada** → periksa pembacaan `handle`.
- **KPI satu platform kosong** → periksa penyeragaman waktu.
- Kuota profil 225; satu anggota = satu profil.

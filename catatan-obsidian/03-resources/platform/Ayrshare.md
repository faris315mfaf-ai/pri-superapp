---
type: platform
category: automation
status: active
pricing: 
tags: [platform, pri, sosmed]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp. -->

## Apa ini & untuk apa
Gerbang sosmed untuk akun **TV Rakyat Official** dan — yang lebih penting —
sumber **komentar** untuk pemeriksaan kepatuhan kader ([[AUTOMATION QC]]).
Akun pribadi anggota memakai [[upload-post]], bukan ini.

## Cara pakai / integrasi
Dipakai di dua jalur:
1. **Konten** — menarik postingan terbaru akun resmi → mengisi kanal konten
   dan mendaftarkannya sebagai "wajib dikomentar".
2. **Komentar** — menarik komentar tiap postingan → dicocokkan ke akun sosmed
   yang didaftarkan kader → jadi rekap kepatuhan.

Berjalan otomatis tiap 5 menit lewat penjadwal, dan menyambung dirinya
sendiri sampai semua postingan periode itu selesai diperiksa.

## Batasan yang menentukan desain
> [!danger] Maksimal 50 komentar per postingan
> Terbukti lewat pengujian: dari 105 komentar, yang terbaca 50. Urutannya
> **acak dan berubah tiap panggilan**, parameter pembatas diabaikan, dan
> hasilnya di-cache ±11 menit.
>
> Dulu rekap dibuat dari hasil satu panggilan itu saja → orang yang sudah
> patuh **ditimpa jadi "belum komen"**. Sekarang rekap adalah akumulasi semua
> komentar yang pernah tersimpan. Komentar yang tidak pernah masuk 50 besar
> tetap tidak terbaca — itu sebabnya ada fitur **ajuan komentar** manual.

- **Facebook tidak bisa dipakai** untuk pencocokan — pengomentarnya hanya
  menampilkan nama, bukan nama pengguna.
- **X butuh kunci API milik user sendiri** sejak aturan berubah 31 Mar 2026.
  Tanpa itu, postingan X ditandai "perlu cek manual", bukan dituduh belum komen.
- Parameter pembatas riwayat bernama `limit`; nama lain diterima **tanpa
  galat** tapi selalu membalas maksimal 10. Salah nama sekali membuat analisis
  hanya melihat 10 dari 39 postingan sehari.
- Nama akun FB/Threads/YouTube yang dikembalikan adalah **nama tampilan**
  (bisa berspasi), bukan nama pengguna.

## Autentikasi
- Key disimpan di: `env.txt` pada VPS — `AYRSHARE_API_KEY`,
  `AYRSHARE_PRIVATE_KEY`, `AYRSHARE_PROFILE_KEY`, `AYRSHARE_DOMAIN`
- Kunci privatnya berbaris banyak. Format ini pernah membuat Docker menolak
  **seluruh** berkas env dengan galat yang tidak menyebut nilai mana.

## Project/area terkait
- [[PRI SuperApp]] · [[AUTOMATION QC]] · [[QC Sosmed - Catatan Teknis]]

## Catatan & troubleshooting
- **Kepatuhan turun tiba-tiba** → periksa apakah postingannya dihapus di
  sosmed; sistem menandainya dan menghapus rekap periode itu.
- **Analisis berhenti di tengah** → normal, dilanjutkan otomatis putaran
  berikutnya; penanda dipasang setelah komentar terbaca, bukan sebelumnya.

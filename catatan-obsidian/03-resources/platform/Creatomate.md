---
type: platform
category: automation
status: active
pricing: berbayar per render
tags: [platform, pri, video]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp. -->

## Apa ini & untuk apa
Menempelkan **overlay** ke video: judul, highlight, dan keterangan sumber.
Dipakai Studio PALUGODAM di [[PRI SuperApp]] dan otomasi
[[AUTOMATION TV RAKYAT]].

## Cara pakai / integrasi
Satu template Creatomate = satu gaya visual. Elemen yang diisi aplikasi:
video, judul, highlight, dan sumber ("Sumber: @akun"). Nama elemennya
disimpan per template supaya template baru tidak perlu mengubah kode.

**Aturan 1 anggota = 1 profil + 1 template.** Ditautkan admin di tab
"Anggota & Template". Anggota tanpa template akan dilewati saat render —
bukan menggagalkan render yang lain.

> [!warning] Render butuh 20–120 detik, bukan sekejap
> Di otomasi [[n8n]] hal ini pernah salah: menunggu **1 detik** lalu langsung
> lanjut, sehingga videonya belum jadi. Sekarang statusnya diperiksa
> berulang sampai selesai atau gagal.

## Autentikasi
- Key disimpan di: `env.txt` pada VPS, baris `CREATOMATE_API_KEY=`
- Kunci pernah dikirim lewat chat → sebaiknya sudah diganti.

## Biaya
Berbayar per render. Menguji tanpa membakar kuota: pakai template palsu —
layanan menolak sebelum merender, tapi gerbang di aplikasi tetap terbukti jalan.

## Project/area terkait
- [[PRI SuperApp]] — Studio PALUGODAM
- [[AUTOMATION TV RAKYAT]] · [[TV Rakyat Otomasi - Catatan Teknis]]

## Catatan & troubleshooting
- Uji nyata 3 Sep 2026: dua template berhasil dirender dalam 45–53 detik.
- Hasil render disimpan di alamat publik penyedia Creatomate.

---
type: project
status: active
area: PRI
tags: [project, pri, superapp, rilis]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp.
     Sunting di sini akan tertimpa — ubah di catatan-obsidian/ pada repo. -->

## Alurnya
1. Claude menulis kode → uji (tsc + eslint + build) → commit → **push ke GitHub**
2. Saya SSH ke VPS, ketik `pri-perbarui`
3. VPS menarik kode terbaru dari GitHub, membangun, lalu mengganti yang jalan

Artinya: selama sudah di GitHub, komputer mana pun boleh dipakai — VPS tidak
mengambil kode dari komputer saya.

## Perintah di VPS
| Perintah | Gunanya |
|---|---|
| `pri-perbarui` | tarik versi terbaru + bangun + nyalakan (aplikasi & penjadwal) |
| `pri-perbarui --tanpa-tarik` | bangun ulang tanpa menarik dari GitHub |
| `pri-sql <berkas.sql>` | jalankan satu migrasi database |
| `bash vps/18-periksa-jaringan.sh` | periksa kalau situs tidak bisa dibuka |
| `bash vps/15-periksa-gambar.sh` | periksa kalau foto tidak muncul |

`pri-perbarui` **mengembalikan versi lama otomatis** kalau versi baru tidak
menjawab — jadi relatif aman dijalankan.

## Urutan yang benar bila ada migrasi
Selalu `pri-sql` **dulu**, baru `pri-perbarui`. Terbalik tidak merusak, tapi
fiturnya akan memberi pesan "jalankan migrasi dulu" sampai dijalankan.

## Vercel
Salinan di Vercel hanya pengalih ke alamat utama. Di-deploy **hanya bila
diminta**, dengan versi CLI yang dikunci:
```
npx vercel@59.11.7 --prod --yes --archive=tgz
```

## Kalau ganti komputer
```
git clone https://github.com/faris315mfaf-ai/pri-superapp.git
npm install
```
Yang **tidak** ikut GitHub dan harus disalin manual: berkas `.env.local`
(seluruh kunci) dan keystore APK. Jangan dikirim lewat chat.

## Terkait
- [[PRI SuperApp]] · [[PRI SuperApp - Tugas Menunggu]]

<!-- otomatis:diperbarui -->
<!-- /otomatis -->

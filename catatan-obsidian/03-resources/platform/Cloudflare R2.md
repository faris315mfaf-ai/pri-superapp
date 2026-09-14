---
type: platform
category: hosting
status: testing
pricing: bandwidth keluar gratis
tags: [platform, pri, penyimpanan]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp. -->

## Apa ini & untuk apa
Penyimpanan video untuk [[PRI SuperApp]]. Menarik karena **bandwidth keluar
gratis** — cocok untuk video yang cuma numpang beberapa jam sebelum dikirim
ke sosmed.

> [!warning] TIDAK dipakai di produksi
> Kuncinya tidak pernah dipasang. Jalur video produksi memakai bucket
> penyimpanan [[Supabase]]. Kode R2 tetap ada dan akan langsung aktif begitu
> kuncinya diisi — jadi catatan lama yang bilang "R2 jalur utama" itu keliru
> untuk produksi.

## Cara pakai / integrasi
Peramban mengunggah **langsung** ke penyimpanan memakai alamat bertanda
tangan dari server — supaya berkas besar tidak melewati server aplikasi.
Alamat unduhnya juga bertanda tangan dan berumur pendek.

## Autentikasi
- Key disimpan di: `env.txt` pada VPS — `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (belum diisi)

## Project/area terkait
- [[PRI SuperApp]] · [[PRI SuperApp - Arsitektur]] · [[Supabase]]

## Catatan & troubleshooting
- Tiga generasi penyimpanan hidup berdampingan di database (R2, Cloudinary,
  bucket Supabase). Penyapu membedakannya dari **bentuk alamat**-nya, bukan
  dari kolom penanda — jadi jangan mengubah bentuk alamat yang tersimpan.
- Batas unggah sekarang ditentukan bucket Supabase: **50 MB di tingkat
  proyek**, hanya bisa dinaikkan lewat dashboard Supabase.

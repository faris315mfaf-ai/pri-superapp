---
type: project
status: active
area: PRI
started: 2026-08-16
due: 
tags: [project, pri, superapp]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp.
     Sunting di sini akan tertimpa — ubah di catatan-obsidian/ pada repo. -->

## Tujuan
Satu aplikasi untuk seluruh kerja harian PRI: absensi, KPI video, kepatuhan
komentar, TV Rakyat (produksi & analitik), chat, dan dashboard pimpinan —
menggantikan sekumpulan spreadsheet dan grup WhatsApp yang terpisah.

## Konteks
- **Alamat produksi**: [pri-superapp.com](https://pri-superapp.com)
- **Di mana hidup**: VPS Hostinger. Aplikasi dan databasenya sama-sama di sana
  (`db.pri-superapp.com` = Supabase yang dipasang sendiri). Salinan di Vercel
  masih hidup tapi hanya mengalihkan pengunjung ke alamat utama.
- **Kode**: repo privat GitHub `faris315mfaf-ai/pri-superapp`
- **Teknologi**: Next.js (App Router) + Supabase + Redis, jalan dalam container Docker

## Modul
| Modul | Isi |
|---|---|
| Beranda | ringkasan harian, target, streak, pengumuman |
| Absensi | **penampil** data [[SADAR]] — absen dilakukan di aplikasi SADAR |
| TV Rakyat Official | video wajib + bahannya, kategori, pengaturan tim |
| TV Rakyat Nasional | dashboard angka gabungan, insight per kategori, kenaikan |
| TVR Saya | unggah ke sosmed sendiri, laporan link, KPI pribadi |
| HR Center | database anggota, absensi harian, setel KPI, pencocokan SADAR |
| Dashboard | pantauan absensi, KPI, kepatuhan komen, analitik TV Rakyat |
| Lain-lain | Chat, Pet Robot, Ludo, Mode Simpel |

## Log
<!-- otomatis:diperbarui -->
<!-- /otomatis -->

## Terkait
- [[PRI SuperApp - Tugas Menunggu]] ← **cek ini dulu kalau ada yang belum jalan**
- [[PRI SuperApp - Cara Rilis]]
- [[PRI SuperApp - Riwayat Rilis]]
- [[SADAR]] · [[Supabase]] · [[Chocodata]]
- [[AUTOMATION QC]] · [[AUTOMATION TV RAKYAT]]

---
type: platform
category: lainnya
status: active
pricing: 
tags: [platform, pri, absensi]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp.
     Sunting di sini akan tertimpa — ubah di catatan-obsidian/ pada repo. -->

## Apa ini & untuk apa
Aplikasi absensi resmi PRI di [sadar-pri.id](https://sadar-pri.id). Sejak
14 Sep 2026, **SADAR yang mencatat absen** (masuk, pulang, sakit, izin) dan
[[PRI SuperApp]] hanya menampilkannya. Dua alat absen untuk satu orang hanya
melahirkan dua catatan yang saling bertentangan.

## Cara pakai / integrasi
SuperApp menarik data lewat API, lalu mencerminkannya ke tabel absensi lama —
sehingga beranda, dashboard, HR Center, rekap PDF, dan peringkat tetap bekerja
tanpa dibongkar.

- `GET /api/attendance/today` — hari ini (mengabaikan `?date`)
- `GET /api/attendance?date=YYYY-MM-DD` — tanggal tertentu
- Jam dari SADAR adalah **WIB**, bukan UTC
- Status yang muncul: `on_time`, `late`, `sick`, `permission`

**Kapan ditarik**: tiap layar absensi dibuka (paling cepat 1 menit sekali),
plus otomatis tiap 5 menit di server (hari ini + kemarin + susulan 30 hari).

## Pencocokan orang
Kunci bawaannya **email yang sama** di SADAR dan SuperApp. Yang emailnya
berbeda dipasangkan manual oleh HR di SuperApp → HR Center → Database Anggota
→ tombol **SADAR** — tanpa perlu mengubah email di aplikasi mana pun.

## Autentikasi
- Key disimpan di: `/opt/pri-superapp/aplikasi/env.txt` pada VPS, baris `SADAR_API_TOKEN=`
- Dikirim sebagai header `Authorization: Bearer <token>` (cara lain ditolak 401)
- Cara generate ulang kalau expired: minta token baru dari pengelola sadar-pri.id,
  ganti barisnya di `env.txt`, lalu `pri-perbarui`

> [!warning] Token lama perlu diganti
> Token pertama pernah tertulis di percakapan chat. Setelah integrasi jalan,
> ganti tokennya dan perbarui `env.txt`.

## Dokumentasi resmi
- Belum ada dokumentasi publik. Bentuk API di atas diperiksa langsung ke
  servernya pada 14 Sep 2026.

## Project/area terkait
- [[PRI SuperApp]] — modul Absensi & HR Center
- [[PRI SuperApp - Tugas Menunggu]] — migrasi `sql/53` & `sql/54` wajib jalan dulu

## Catatan & troubleshooting
- **Absensi kosong seluruhnya** → `SADAR_API_TOKEN` belum diisi, atau `sql/53`
  belum dijalankan. Layar absensi akan menyebut penyebabnya.
- **Satu orang tidak muncul** → emailnya beda. Pasangkan lewat Database Anggota
  → SADAR; absensi 60 hari orang itu langsung ikut tercermin.
- **Orang sakit terlihat "alfa"** → `sql/53` belum jalan (sakit/izin dari SADAR
  tidak punya jam masuk, jadi butuh tabel cerminnya).

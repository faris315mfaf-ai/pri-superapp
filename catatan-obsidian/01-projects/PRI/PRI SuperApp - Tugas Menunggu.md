---
type: project
status: active
area: PRI
tags: [project, pri, superapp, todo]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp.
     Sunting di sini akan tertimpa — ubah di catatan-obsidian/ pada repo. -->

Kodenya sudah ada di server, tapi fitur di bawah ini **belum menyala** sampai
langkahnya dijalankan. Semua dikerjakan lewat SSH ke VPS.

## 1. Migrasi database (`pri-sql`)
Jalankan satu per satu, urut. Aman diulang — kalau sudah pernah dijalankan,
tidak akan merusak apa pun.

```
pri-sql 43_struktur_ganda.sql
pri-sql 48_rekaman_anggota_harian.sql
pri-sql 50_kategori_link_chocodata.sql
pri-sql 51_kategori_selesai.sql
pri-sql 52_video_wajib_berkas.sql
pri-sql 53_absensi_sadar.sql
pri-sql 54_sadar_pemetaan.sql
```

Yang terjadi kalau dilewati:
- **43** — satu orang hanya bisa punya satu struktur; fitur struktur ganda diam
- **48** — panel "kenaikan" TV Rakyat Nasional tidak punya pembanding harian
- **50** — tarik data Chocodata & tambah link batch per kategori gagal
- **51** — tombol "Selesai" pada kategori memberi pesan minta migrasi
- **52** — unggah video bahan di Video Wajib ditolak
- **53** — **absensi kosong** (paling terasa)
- **54** — pencocokan manual akun ↔ SADAR tidak bisa disimpan

## 2. Kunci yang perlu ditambahkan
Buka `nano /opt/pri/aplikasi/env.txt`, tambahkan baris berikut beserta
nilainya, simpan dengan `Ctrl+O` → `Enter` → `Ctrl+X`.

- `SADAR_API_TOKEN=` — tanpa ini absensi tidak terisi. Ambil dari [[SADAR]].
- `CHOCODATA_API_KEY=` — tanpa ini tombol "Tarik Data" per kategori diam.

> [!warning] Jangan tulis nilai kuncinya di catatan ini
> Vault ini ikut tersinkron ke cloud. Kunci hanya boleh hidup di `env.txt`
> pada server. Lihat [[SADAR]] untuk cara membuat ulang kalau hilang.

## 3. Terakhir, nyalakan versi barunya
```
pri-perbarui
```

## Yang perlu dipastikan
- [ ] `sql/47` (setujui semua laporan tertunda) — sudah pernah dijalankan?
- [ ] `sql/49` (metrik per unggahan) — sudah pernah dijalankan?
- [ ] Token SADAR **diganti** setelah integrasi jalan (token lama pernah
      tertulis di percakapan chat)

## Terkait
- [[PRI SuperApp]] · [[PRI SuperApp - Cara Rilis]]

<!-- otomatis:diperbarui -->
<!-- /otomatis -->

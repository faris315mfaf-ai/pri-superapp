---
type: project
status: active
area: PRI
tags: [project, pri, superapp, todo]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp.
     Sunting di sini akan tertimpa — ubah di catatan-obsidian/ pada repo. -->

Kodenya sudah ada di server, tapi fitur di bawah ini **belum menyala** sampai
langkahnya dijalankan. Semua dikerjakan lewat terminal VPS.

## 1. Migrasi database
Urut, satu per satu. Aman diulang — yang sudah pernah dijalankan tidak rusak.

```
pri-sql 43_struktur_ganda.sql
pri-sql 48_rekaman_anggota_harian.sql
pri-sql 50_kategori_link_chocodata.sql
pri-sql 51_kategori_selesai.sql
pri-sql 52_video_wajib_berkas.sql
pri-sql 53_absensi_sadar.sql
pri-sql 54_sadar_pemetaan.sql
```

Kalau dilewati, yang terjadi:

| Berkas | Akibat kalau belum dijalankan |
|---|---|
| **43** | satu orang hanya bisa punya satu struktur; rangkap jabatan diam |
| **48** | panel "kenaikan" TV Nasional tidak punya pembanding harian |
| **50** | tarik data [[Chocodata]] & tambah link batch per kategori gagal |
| **51** | tombol "Selesai" pada kategori memberi pesan minta migrasi |
| **52** | unggah video bahan di Video Wajib ditolak |
| **53** | **absensi kosong** — paling terasa |
| **54** | pencocokan manual akun ↔ [[SADAR]] tidak bisa disimpan |

## 2. Kunci yang perlu ditambahkan
```
nano /opt/pri-superapp/aplikasi/env.txt
```
Tambahkan barisnya beserta nilai, simpan `Ctrl+O` → `Enter` → `Ctrl+X`.

- **`SADAR_API_TOKEN=`** — tanpa ini absensi tidak terisi sama sekali.
- **`CHOCODATA_API_KEY=`** — tanpa ini tombol "Tarik Data" per kategori diam.

> [!danger] Jangan tulis nilai kuncinya di catatan ini
> Vault ikut tersinkron ke cloud. Kunci hanya boleh hidup di `env.txt` pada
> server. Lihat [[SADAR]] dan [[Chocodata]] untuk cara membuatnya ulang.

## 3. Terakhir, nyalakan versi barunya
```
pri-perbarui
```

## Yang perlu dipastikan
- [ ] **Ganti token [[SADAR]]** — token lama pernah tertulis di percakapan chat
- [ ] `sql/47` (setujui semua laporan tertunda) — sudah pernah dijalankan?
- [ ] `sql/49` (metrik per unggahan) — sudah pernah dijalankan?
- [ ] **[[n8n]] masih menulis ke Supabase lama?** Kalau ya, data komentar QC
      tidak pernah sampai ke aplikasi. Arahkan kredensialnya ke alamat baru.
- [ ] **Cadangan otomatis** sudah terpasang? VPS tidak punya cadangan bawaan.
- [ ] **Batas unggah Supabase** masih 50 MB di tingkat proyek — hanya bisa
      dinaikkan lewat dashboard, tidak bisa lewat SQL.

## Pekerjaan yang menggantung (bukan tugas server)
- **Perizinan SuperApp** masih ada berdampingan dengan izin/sakit [[SADAR]].
  Belum diputuskan apakah digabung.
- **Verifikasi wajah** ([[Luxand]]) belum tuntas diuji — pernah menolak wajah
  asli pemiliknya.
- **Kredit [[Cloudinary]] terlampaui** (194% dari jatah gratis). Risiko
  dibatasi sewaktu-waktu.
- **[[TV Rakyat Otomasi - Catatan Teknis|TV Rakyat Otomasi]]** — versi
  perbaikan belum dikonfirmasi terpasang di n8n.
- Sandi lemah: akun `superadmin` dan `adminpalugodam`, serta backdoor
  Mode Developer (lihat [[PRI SuperApp - Peran & Akses]]).

## Terkait
- [[PRI SuperApp]] · [[PRI SuperApp - Cara Rilis]] · [[PRI SuperApp - Database]]

<!-- otomatis:diperbarui -->
<!-- /otomatis -->

---
type: project
status: active
area: PRI
tags: [project, pri, superapp, jebakan, insiden]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp.
     Sunting di sini akan tertimpa — ubah di catatan-obsidian/ pada repo. -->

Pelajaran yang sudah dibayar mahal di [[PRI SuperApp]]. Hampir semuanya punya
satu sifat sama: **gagalnya diam** — tidak ada pesan galat, hanya data yang
salah atau fitur yang berhenti.

## Insiden yang pernah mematikan produksi

### Service worker menyajikan HTML lama (25 Agu 2026)
Cache "pakai yang lama dulu" untuk **navigasi** membuat HTML lama disajikan
setelah deploy. HTML Next.js merujuk potongan kode ber-nama-acak; setelah
deploy nama itu berubah → HTML lama meminta berkas yang sudah tidak ada →
**aplikasi mati total** untuk pengguna lama. Artinya setiap deploy merusak
aplikasi. Perbaikan: navigasi selalu jaringan dulu.
> Jangan pernah kembalikan pola cache-dulu untuk dokumen HTML.

### Satu baris data tak dikenal menjatuhkan seluruh aplikasi (25 Agu 2026)
Notifikasi berkategori `info` tidak ada di peta kategori layar notifikasi →
mencari ikon dari kunci yang tidak ada → aplikasi crash. Karena semua layar
dipasang sekaligus, **crash di layar tersembunyi = crash semua**, untuk semua
peran.
> Pencarian di peta dengan kunci yang datang dari server **wajib** punya
> nilai cadangan.

### Foto hilang seluruhnya setelah pindah VPS (12 Sep 2026)
Semua foto kosong, **tanpa satu pun galat di log**. Diagnosis pertama salah
(daftar host gambar) dan memakan waktu. Sebab sebenarnya: pengamanan baru di
Next 16 menolak gambar yang nama host-nya mengarah ke **IP privat** — dan di
VPS ini alamat database memang sengaja diarahkan ke dalam. Pesan penolakannya
**sama persis** dengan pesan "host tidak terdaftar".

### Supabase lambat 20–30 detik (7 Sep 2026)
Semua permintaan melambat, padahal databasenya sendiri menganggur. Yang
jenuh lapisan API, bukan database. Akarnya: pemeriksaan sesi di **setiap**
panggilan API = 55% lalu lintas, dan lapisan cache-nya tidak pernah aktif
karena hanya mengenali satu jenis Redis. Perbaikan: adapter Redis + cache
bersama. Latensi 27 → 9 detik.

### Perbaikan massal membuat CPU 100% (11 Sep 2026)
Perbaikan data untuk 124 anggota dijalankan **tanpa jeda** → ±2.400
permintaan/menit selama 1 jam → aplikasi produksi ikut lambat untuk pengguna
sungguhan.
> Yang menipu: menghentikan tugas hanya membunuh pembungkusnya — proses
> anaknya tetap hidup dan harus dimatikan satu per satu.

## Jebakan yang gagalnya diam

| Jebakan | Gejalanya | Sebab sebenarnya |
|---|---|---|
| **Batas 1000 baris** | angka rekap/KPI mentok, "hanya 1000 tampil" | Supabase memotong SETIAP jawaban di 1000 baris, apa pun batas yang diminta |
| **Nama kolom salah** | daftar selalu kosong, tombol selalu gagal | galat dari pemanggilan paralel tak pernah dibaca |
| **Dua kunci unik berbeda nama** | perubahan status ditolak diam-diam | nilai baru harus didaftarkan di keduanya |
| **Tabel dengan 2 relasi ke tabel sama** | permintaan gagal 500 | wajib menyebut relasi mana yang dipakai |
| **Parameter API salah nama** | hanya 10 dari 39 postingan terbaca | parameter salah diterima tanpa galat |
| **Alamat luar belum didaftarkan** | "Failed to fetch" tanpa log server | aturan keamanan browser memblokir diam-diam |
| **Cron mati setelah pindah host** | data berhenti diperbarui | tidak ada yang error — hanya berhenti |
| **Ikon APK lama** | APK jadi, logonya usang | ikon diunduh dari alamat live, bukan berkas lokal |

## Aturan kerja yang lahir dari kesalahan

**Jangan `git add -A` di repo ini.** Pernah nyaris ikut mengirim 91 berkas
lama termasuk kunci dan APK. Selalu tambahkan berkas satu per satu.

**Jangan `git stash -u`.** Pernah nyaris menghapus 30 berkas termasuk
`.env.local` dan keystore APK — keduanya tidak terlacak Git.

**Jangan `git checkout` melewati commit yang pernah melacak `.env`.**
Git akan menimpa lalu menghapus `.env` lokal tanpa peringatan.

**Periksa folder kerja sebelum menguji.** Folder `nama-project-kamu`
namanya menipu; pemeriksaan kode bisa melapor "bersih" padahal memeriksa
proyek yang salah.

**Jangan `npm run build` saat server pengembangan hidup** di folder yang
sama — layar jadi kosong walau API sehat, dan pengujian gagal palsu.

**Jangan menutup semua Chrome** dengan perintah massal — itu menutup jendela
kerja user juga. Matikan hanya berdasarkan nomor proses skripnya sendiri.

**Jangan menghitung total dengan menarik baris mentah.** Pakai tampilan
agregat di database. Sekali pernah membuat seluruh angka kepatuhan salah.

**Jangan menebak bentuk data layanan luar.** Beberapa bug nyata lahir dari
menebak: nama kolom akun sosial, satuan waktu (detik vs ISO), nama parameter.

## Kalau ada yang aneh, urutan memeriksanya
1. **Fitur kosong tapi tanpa galat** → periksa log 400/409 di sisi database.
   Lebih cepat daripada membaca kode.
2. **Foto tidak muncul** → `bash vps/15-periksa-gambar.sh`
3. **Situs tidak bisa dibuka** → `bash vps/18-periksa-jaringan.sh`
4. **Semuanya lambat** → bandingkan waktu jawab metrik vs data biasa. Kalau
   timpang, yang tersumbat lapisan API, bukan database.
5. **Kesehatan menyeluruh** → `bash vps/09-periksa-kesehatan.sh`

## Terkait
- [[PRI SuperApp]] · [[PRI SuperApp - Arsitektur]] · [[PRI SuperApp - Database]]

<!-- otomatis:diperbarui -->
<!-- /otomatis -->

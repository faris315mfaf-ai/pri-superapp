---
type: project
status: active
area: PRI
tags: [project, pri, superapp, database]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp.
     Sunting di sini akan tertimpa — ubah di catatan-obsidian/ pada repo. -->

Database [[PRI SuperApp]] — Supabase yang dipasang sendiri di VPS.

## Ukuran (survei 12 Sep 2026, saat migrasi)
83 tabel · 29 view · 13 fungsi · 8 bucket · ±296 berkas / 2,4 GB.
Hampir seluruh isi penyimpanan adalah video (bucket `tvrku`).
PostgreSQL 17.6. Auth bawaan Supabase **tidak dipakai** — login ditangani
aplikasi sendiri.

## Kelompok tabel
| Kelompok | Isi |
|---|---|
| **Orang** | `app_user`, `sesi_perangkat`, `akun_sosmed_user`, `akun_tvr_user`, `tim_anggota`, `sayap_partai`, `zona` |
| **Absensi** | `absensi`, `absensi_sadar`, `absensi_sinkron`, `sadar_pemetaan`, `perizinan` |
| **Kerja** | `kerja_item`, `tugas_link`, `acara` |
| **QC komentar** | `akun_wajib`, `postingan`, `komentar`, `rekap`, `komentar_ajuan`, `qc_analisis_riwayat` |
| **TV Rakyat** | `tvrku_post`, `laporan_video`, `laporan_video_pending`, `tvr_video_wajib`, `keyword_wajib`, `tvr_banned`, `feed_konten`, `video_antrian` |
| **Metrik video** | `tvr_video_metrik`, `tvr_kategori_link`, `tvr_metrik_harian`, `tvr_metrik_anggota_harian` |
| **Siaran & Studio** | `tvr_siaran`, `tvr_siaran_item`, `studio_proyek`, `studio_proyek_item`, `palugodam_template`, `sosmed_profile` |
| **Komunikasi** | `notifikasi`, `pengumuman`, `pengumuman_penerima`, `chat_kontak`, `chat_pesan`, `langganan_push` |
| **Permainan** | `pet_robot`, `pet_toko`, `ludo_game`, `koin_*`, `task_streak` |
| **Sistem** | `pengaturan_sistem`, `log_klien`, `ai_pemakaian`, `rilis_aplikasi`, `wajah_template`, `kredensial_webauthn` |

## Jebakan wajib tahu

> [!danger] Batas 1000 baris — jebakan paling mahal di proyek ini
> Lapisan REST memotong **setiap** jawaban di 1000 baris, berapa pun batas
> yang diminta. Minta 0–4999, yang datang tetap 1000 — tanpa galat.
>
> Ini pernah membuat: KPI video hanya tampil 1000, kepatuhan "0% palsu",
> dan seluruh angka dashboard salah (22 postingan padahal 113).
>
> **Aturannya**: tabel yang bisa lebih dari 1000 baris per hari wajib dibaca
> lewat pembantu `lib/semua-baris.ts`, atau lewat view agregat. Jangan pernah
> menghitung total dengan menarik baris mentah.

> [!warning] Tabel dengan dua relasi ke tabel yang sama
> `perizinan` (pemohon + pemutus), `kerja_item`, `tim_anggota`,
> `sosmed_profile` — semuanya punya dua jalur ke `app_user`. Mengambil data
> gabungan tanpa menyebut relasi mana yang dipakai = gagal 500, atau lebih
> buruk: **gagal diam-diam** dan fitur seperti tidak pernah mengenal datanya.

> [!warning] Nama kolom harus diverifikasi, bukan ditebak
> Kolom nama akun wajib adalah `nama_akun`, bukan `nama_tampilan`. Salah
> tebak sekali membuat daftar akun di Panel Master **selalu kosong** dan
> tombol tambah akun **selalu gagal** — tanpa pesan apa pun, karena galat
> dari pemanggilan paralel tidak pernah dibaca.

Hal lain: tidak ada penghapusan permanen untuk data master (hanya ditandai
nonaktif, supaya rekap lama tidak berubah); kolom `jabatan` memuat nilai
bebas peninggalan lama ("timnya dio") — semuanya dihitung "punya jabatan".

## Migrasi
Berkas SQL dijalankan satu per satu di VPS dengan `pri-sql <berkas>`. Aman
diulang. Yang **belum dijalankan** dicatat di [[PRI SuperApp - Tugas Menunggu]].

<!-- otomatis:sql -->
<!-- /otomatis -->

## Cadangan
Supabase Cloud punya cadangan otomatis; **VPS tidak**. Skrip
`vps/07-cadangan-harian.sh` wajib terpasang. Periksa umur cadangan lewat
`bash vps/09-periksa-kesehatan.sh`.

## Terkait
- [[PRI SuperApp]] · [[PRI SuperApp - Arsitektur]] · [[PRI SuperApp - Jebakan & Insiden]] · [[Supabase]]

<!-- otomatis:diperbarui -->
<!-- /otomatis -->

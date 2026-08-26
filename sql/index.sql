-- ============================================================
-- INDEX TAMBAHAN — PRI SuperApp
--
-- CARA PAKAI: buka Supabase → SQL Editor → tempel seluruh isi
-- berkas ini → Run. Aman dijalankan berulang kali (semuanya
-- memakai IF NOT EXISTS) dan aman dijalankan saat aplikasi
-- sedang dipakai.
--
-- Skrip ini TIDAK dijalankan otomatis oleh aplikasi.
--
-- CARA MENYUSUNNYA (bukan tebakan): daftar di bawah dibuat dengan
-- (1) memetakan kolom yang benar-benar dipakai .eq()/.order() di
-- src/app/api, lalu (2) mencocokkannya dengan index yang SUDAH ADA
-- di database lewat pg_indexes. Yang sudah ada sengaja TIDAK
-- ditulis ulang di sini — lihat daftarnya di bagian bawah.
--
-- CATATAN JUJUR SOAL MANFAAT: dengan ~100 pengguna, hampir semua
-- tabel masih kecil dan PostgreSQL sanggup memindainya tanpa
-- index. Yang benar-benar mendesak hanya `rekap` (sudah terindeks)
-- karena bertambah ribuan baris per hari. Sisanya bersifat
-- pencegahan — dan satu manfaat yang langsung terasa: index pada
-- kolom foreign key membuat penghapusan satu anggota tidak lagi
-- memaksa PostgreSQL memindai seluruh tabel yang merujuknya.
-- ============================================================

-- ------------------------------------------------------------
-- 1. app_user — pasangan filter paling sering di seluruh aplikasi
-- ------------------------------------------------------------
-- Pola `.eq("aktif", true).eq("status", "aktif")` muncul di banyak
-- endpoint (daftar anggota, kandidat chat, penerima pengumuman,
-- rekap QC). Index gabungan melayani keduanya sekaligus.
create index if not exists idx_app_user_aktif_status
  on app_user (aktif, status);

-- Penyaringan per peran (mis. mencari semua admin_tv untuk kabar).
create index if not exists idx_app_user_role
  on app_user (role);

-- ------------------------------------------------------------
-- 2. Kolom foreign key ke app_user yang belum terindeks
-- ------------------------------------------------------------
-- Selain mempercepat pencarian "milik siapa", index ini mempercepat
-- penghapusan anggota: tanpa index, tiap DELETE pada app_user
-- memaksa PostgreSQL memindai penuh setiap tabel yang merujuknya.

create index if not exists idx_notifikasi_untuk_user
  on notifikasi (untuk_user);

create index if not exists idx_kerja_item_user
  on kerja_item (user_id);

create index if not exists idx_kerja_item_penugas
  on kerja_item (ditugaskan_oleh);

create index if not exists idx_chat_kontak_besar
  on chat_kontak (user_besar);

create index if not exists idx_chat_kontak_peminta
  on chat_kontak (diminta_oleh);

create index if not exists idx_chat_pesan_pengirim
  on chat_pesan (pengirim_id);

create index if not exists idx_pengumuman_penerima_user
  on pengumuman_penerima (user_id);

create index if not exists idx_pengumuman_pengirim
  on pengumuman (pengirim_id);

create index if not exists idx_perizinan_pemutus
  on perizinan (diputuskan_oleh);

create index if not exists idx_masukan_user
  on masukan (user_id);

create index if not exists idx_video_antrian_pengunggah
  on video_antrian (diupload_oleh_id);

create index if not exists idx_tugas_link_pembuat
  on tugas_link (dibuat_oleh_id);

-- ------------------------------------------------------------
-- 3. Pembersihan berkala
-- ------------------------------------------------------------
-- Pembersih media Cloudinary menyaring video yang jatuh tempo.
-- (Sudah ada idx_video_hapus_media; baris ini hanya penjelas.)

-- ============================================================
-- SUDAH ADA DI DATABASE — JANGAN DIBUAT LAGI
--
-- Diperiksa langsung lewat pg_indexes, jadi Anda tidak perlu
-- khawatir membuat duplikat bila menjalankan skrip ini:
--
--   sesi_perangkat(token_hash)  → sesi_perangkat_token_hash_key (UNIQUE)
--   sesi_perangkat(user_id)     → idx_sesi_perangkat_user
--   app_user(nomor_wa)          → idx_app_user_nomor_wa (UNIQUE parsial)
--   app_user(username)          → idx_app_user_username (UNIQUE, lower())
--   app_user(email)             → app_user_email_key (UNIQUE)
--   log_klien(waktu DESC)       → idx_log_klien_waktu
--                                 (kolomnya bernama `waktu`, BUKAN
--                                  `created_at` seperti dugaan awal)
--   notifikasi(dibuat_pada)     → idx_notif_waktu
--   notifikasi(untuk_role)      → idx_notifikasi_role (GIN)
--   absensi(user_id,...)        → absensi_user_id_tanggal_wib_jenis_key
--   absensi(tanggal_wib)        → idx_absensi_tanggal
--   rekap(periode/nama_kader/id_postingan/status) → idx_rekap_*
--   komentar(periode/nama_kader/id_postingan/platform) → idx_komentar_*
--   postingan(periode/akun_wajib) + antrian QC → idx_postingan_*
--   laporan_video(tanggal_wib, user_id) → idx_laporan_video_tanggal
--   perizinan(user_id, tanggal_wib) → perizinan_user_id_tanggal_wib_key
--   chat_pesan(kontak_id, id DESC)  → idx_chat_pesan_kontak
--   chat_pesan(dibuat_pada)         → idx_chat_pesan_umur
--   tim_anggota(atasan_id/anggota_id) → idx_tim_atasan + UNIQUE
--   tugas_link(untuk_user_id, status) → idx_tugas_link_untuk
--   akun_sosmed_user(user_id)       → idx_akun_sosmed_user
--   akun_tvr_user(user_id)          → idx_akun_tvr_user
--   video_antrian(status/tahap/jam_tanggal/hapus_media_pada) → idx_video_*
--   fitur_izin(peran)               → idx_fitur_izin_peran
--   otp_wa(nomor_wa, dibuat_pada)   → idx_otp_wa_nomor
-- ============================================================

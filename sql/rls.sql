-- ============================================================
-- RLS (Row Level Security) untuk semua TABEL yang dipakai aplikasi.
--
-- CARA PAKAI: jalankan MANUAL di Supabase SQL Editor oleh pemilik
-- proyek. Skrip ini TIDAK dijalankan otomatis oleh aplikasi.
--
-- KENAPA: aplikasi mengakses database lewat SERVICE KEY yang
-- melewati (bypass) RLS, jadi menyalakan RLS tidak mengubah
-- perilaku aplikasi sama sekali. Gunanya murni jaring pengaman:
-- bila anon/publishable key bocor — atau suatu hari dipakai klien
-- (mis. dashboard Flutter) — tabel-tabel ini TIDAK bisa dibaca/
-- ditulis sembarangan, karena tidak ada satu pun policy yang
-- mengizinkannya.
--
-- Catatan:
-- - Daftar tabel diambil dari seluruh pemanggilan .from("...") di
--   src/ (view v_* tidak perlu — RLS berlaku pada tabel dasarnya;
--   "avatar" dan "surat" adalah BUCKET Storage, bukan tabel).
-- - IF EXISTS dipakai supaya skrip aman dijalankan ulang ataupun
--   pada skema yang belum lengkap.
-- ============================================================

alter table if exists absensi              enable row level security;
alter table if exists akun_sosmed_user     enable row level security;
alter table if exists akun_tvr_user        enable row level security;
alter table if exists akun_wajib           enable row level security;
alter table if exists app_user             enable row level security;
alter table if exists chat_kontak          enable row level security;
alter table if exists chat_pesan           enable row level security;
alter table if exists fitur_izin           enable row level security;
alter table if exists interaksi_video      enable row level security;
alter table if exists kerja_item           enable row level security;
alter table if exists komentar             enable row level security;
alter table if exists langganan_push       enable row level security;
alter table if exists laporan_video        enable row level security;
alter table if exists log_klien            enable row level security;
alter table if exists masukan              enable row level security;
alter table if exists notifikasi           enable row level security;
alter table if exists otp_wa               enable row level security;
alter table if exists pengaturan_sistem    enable row level security;
alter table if exists pengumuman           enable row level security;
alter table if exists pengumuman_penerima  enable row level security;
alter table if exists perizinan            enable row level security;
alter table if exists postingan            enable row level security;
alter table if exists qc_progres           enable row level security;
alter table if exists rekap                enable row level security;
alter table if exists rilis_aplikasi       enable row level security;
alter table if exists sesi_perangkat       enable row level security;
alter table if exists tim_anggota          enable row level security;
alter table if exists tugas_link           enable row level security;
alter table if exists video_antrian        enable row level security;

-- ============================================================
-- 66 — PEMBARUAN 2.1 (7 Okt 2026): verifikasi ulang akun + tutorial.
--
-- Mulai rilis 2.1 (lib/rilis), setiap akun (kecuali master & superadmin)
-- wajib: verifikasi nomor WhatsApp (OTP arah masuk) → konfirmasi nama
-- lengkap, username, email (opsional) → tutorial wajib sekali (Auto Edit,
-- kompres otomatis, 4 tema). Dua cap waktu ini sekaligus menjadi dasar
-- laporan akun AKTIF (sudah verifikasi) vs TIDAK AKTIF (belum).
--
--   verifikasi_21_pada  kapan WA + data diri selesai dikonfirmasi
--   tutorial_21_pada    kapan tutorial 2.1 selesai (tidak tampil lagi)
-- ============================================================

alter table app_user add column if not exists verifikasi_21_pada timestamptz;
alter table app_user add column if not exists tutorial_21_pada timestamptz;

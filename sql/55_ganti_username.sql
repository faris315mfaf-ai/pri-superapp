-- ============================================================
-- sql/55 — CATATAN WAKTU GANTI USERNAME (15 Sep 2026)
--
-- Username adalah identitas login. Menggantinya berulang-ulang membuat
-- orang lain kehilangan jejak (chat, daftar, sebutan), jadi diberi jeda
-- seperti penggantian kata sandi (`sandi_diubah_pada`).
--
-- Kolomnya kosong untuk akun lama = belum pernah ganti = boleh ganti.
-- ============================================================
alter table public.app_user
  add column if not exists username_diubah_pada timestamptz;

notify pgrst, 'reload schema';

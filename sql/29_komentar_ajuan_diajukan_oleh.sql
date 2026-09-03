-- 29 — 3 Sep 2026: fitur kepatuhan komen (pop-up rincian, Ajukan, mata)
-- berlaku untuk SEMUA pengguna: siapa pun boleh mengajukan "sudah komen"
-- atas nama orang lain (memilih username terdaftar milik orang itu).
-- Kolom baru mencatat siapa yang mengajukan bila bukan pemilik akun.
-- (Sudah diterapkan di Supabase: migrasi komentar_ajuan_diajukan_oleh.)
alter table public.komentar_ajuan
  add column if not exists diajukan_oleh text not null default '';

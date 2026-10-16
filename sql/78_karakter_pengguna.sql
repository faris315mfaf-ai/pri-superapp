-- ============================================================
-- sql/78 — KARAKTER SAYA (16 Okt 2026)
--
-- Rupa karakter pilihan tiap pengguna di Ruang Bot. Yang disimpan hanya
-- konfigurasi kecil (kulit, rambut, atasan, warna pakaian) — gambar dirakit di
-- klien dari aset public/karakter/v1. Validasi isi ada di src/lib/karakter-murni.ts.
-- Pengguna tanpa baris di sini memakai rupa bawaan.
-- Hanya dibaca server (service role); RLS menyala TANPA kebijakan. Aman diulang.
--   ssh pri-vps 'docker exec -i supabase-db psql -U postgres -w --single-transaction -v ON_ERROR_STOP=1' < sql/78_karakter_pengguna.sql
-- ============================================================

create table if not exists public.karakter_pengguna (
  user_id     bigint      primary key references public.app_user(id) on delete cascade,
  konfig      jsonb       not null check (jsonb_typeof(konfig) = 'object' and octet_length(konfig::text) <= 2048),
  versi       smallint    not null default 1,
  diperbarui  timestamptz not null default now()
);
alter table public.karakter_pengguna enable row level security;

notify pgrst, 'reload schema';

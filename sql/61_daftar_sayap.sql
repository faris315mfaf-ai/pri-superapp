-- ============================================================
-- 61 — PENDAFTARAN SAYAP PARTAI (7 Okt 2026)
--
-- Pendaftar kini bisa memilih "SAYAP PARTAI": sayapnya (divisi
-- "Divisi Sayap Partai" + sub_divisi), lalu OPSIONAL provinsi, kota/
-- kabupaten, dan jabatan sayap (kolom jabatan_sayap yang sudah ada).
-- Provinsi & kota disimpan di kolom baru ini (data Kepmendagri).
-- ============================================================

alter table public.app_user
  add column if not exists provinsi text not null default '',
  add column if not exists kota text not null default '';

comment on column public.app_user.provinsi is
  'Provinsi domisili/kepengurusan (pendaftaran Sayap Partai, 7 Okt 2026). Kosong = belum diisi.';
comment on column public.app_user.kota is
  'Kabupaten/kota di provinsi tersebut (pendaftaran Sayap Partai, 7 Okt 2026). Kosong = belum diisi.';

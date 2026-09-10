-- ============================================================
-- 41_sayap_partai_modul_izin.sql (10 Sep 2026)
--
-- 1. sayap_partai — daftar Sayap Partai yang bisa DITAMBAH oleh Divisi HR,
--    superadmin, dan master (permintaan user). Sayap bawaan tetap di
--    src/lib/struktur.ts (SUB_SAYAP); tabel ini menampung tambahannya.
--    Nilai yang dipakai di app_user.sub_divisi = kolom `nilai`.
-- 2. app_user.modul_izin — modul per AKUN yang dibuka/ditutup master
--    saat membuat akun baru (Panel Master). NULL = mengikuti peran.
--    Bentuk: {"dashboard": true, "qc": true, "tv": false, ...}
-- ============================================================
create table if not exists public.sayap_partai (
  id bigserial primary key,
  nilai text not null unique,
  label text not null,
  aktif boolean not null default true,
  dibuat_oleh text not null default '',
  created_at timestamptz not null default now()
);

alter table public.app_user add column if not exists modul_izin jsonb;

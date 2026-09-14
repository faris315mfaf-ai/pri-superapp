-- ============================================================
-- sql/54 — PEMETAAN MANUAL AKUN SUPERAPP ↔ PEGAWAI SADAR (14 Sep 2026)
--
-- Pencocokan bawaan memakai EMAIL (email SADAR = email akun SuperApp).
-- Orang yang emailnya berbeda di kedua aplikasi tidak perlu mengganti
-- email di mana pun: HR memasangkannya dari Database Anggota, dan
-- pemetaan ini MENANG atas pencocokan email.
--
-- Satu akun ↔ satu kode pegawai (keduanya unik). Menghapus akun ikut
-- menghapus pemetaannya.
-- ============================================================
create table if not exists public.sadar_pemetaan (
  user_id        bigint      primary key references public.app_user(id) on delete cascade,
  kode_pegawai   text        not null unique,
  email_sadar    text        not null default '',
  nama_sadar     text        not null default '',
  dibuat_oleh_id bigint      references public.app_user(id) on delete set null,
  dibuat_pada    timestamptz not null default now()
);
alter table public.sadar_pemetaan enable row level security;

notify pgrst, 'reload schema';

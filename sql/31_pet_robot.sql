-- 31 — 3 Sep 2026: MODUL PET ROBOT (percobaan, khusus master), terinspirasi POU.
-- Satu robot per pengguna: jenis pria (biru-hitam) / wanita (pink-putih), empat
-- kebutuhan 0–100 yang turun seiring waktu (kenyang, energi, senang, bersih),
-- XP/level, aksesoris yang dibeli dengan koin (dicatat di koin_transaksi dengan
-- jumlah negatif, aktivitas 'pet_beli') dan hadiah koin harian saat merawat.
-- (Sudah diterapkan di Supabase: migrasi pet_robot.)
create table if not exists public.pet_robot (
  user_id             bigint primary key,
  jenis               text not null check (jenis in ('pria','wanita')),
  nama                text not null default 'Robo',
  kenyang             integer not null default 80 check (kenyang between 0 and 100),
  energi              integer not null default 80 check (energi between 0 and 100),
  senang              integer not null default 80 check (senang between 0 and 100),
  bersih              integer not null default 80 check (bersih between 0 and 100),
  tidur               boolean not null default false,
  xp                  integer not null default 0,
  aksesoris_dimiliki  text[] not null default '{}',
  aksesoris_terpasang jsonb not null default '{}'::jsonb,
  hadiah_terakhir     date,
  terakhir_dihitung   timestamptz not null default now(),
  dibuat_pada         timestamptz not null default now(),
  diperbarui_pada     timestamptz not null default now()
);
alter table public.pet_robot enable row level security;

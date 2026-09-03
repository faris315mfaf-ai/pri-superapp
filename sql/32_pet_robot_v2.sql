-- 32 — 3 Sep 2026: PET ROBOT v2 (sudah diterapkan: migrasi pet_robot_makanan_sparepart).
-- Toko jadi tiga: aksesoris (30), makanan (30, jadi inventori lalu dimakan),
-- sparepart (30: kepala/mata/tubuh/kaki/tangan, mengubah bentuk robot).
-- Energi turun lebih cepat bila robot banyak beraktivitas hari itu.
alter table public.pet_robot
  add column if not exists makanan jsonb not null default '{}'::jsonb,
  add column if not exists sparepart_dimiliki text[] not null default '{}',
  add column if not exists sparepart_terpasang jsonb not null default '{}'::jsonb,
  add column if not exists aktivitas_hari_ini integer not null default 0,
  add column if not exists aktivitas_tanggal date;

-- 36 — 4 Sep 2026: PET ROBOT v4 — GERAKAN/EMOT yang dibeli, HEWAN PELIHARAAN
-- ROBOT (kucing, anjing, kapibara; tumbuh anak → remaja → dewasa), dan
-- inventori makanan hewan. (Sudah diterapkan: migrasi pet_gerakan_hewan.)
alter table public.pet_robot
  add column if not exists gerakan_dimiliki text[] not null default '{}',
  -- { "aktif": "hewan_kucing", "daftar": { "hewan_kucing": { "nama": "Miko", "xp": 0, "kenyang": 80, "terakhir": "<iso>" } } }
  add column if not exists hewan         jsonb  not null default '{}'::jsonb,
  add column if not exists hewan_makanan jsonb  not null default '{}'::jsonb;

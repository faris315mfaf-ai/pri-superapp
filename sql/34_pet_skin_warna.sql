-- 34 — 3 Sep 2026: PET ROBOT v3 — SKIN EKSKLUSIF SEASONAL & WARNA CUSTOM.
-- Lima skin megah (lib/pet.ts KATALOG_SKIN: Garuda Emas, Komandan Rakyat, Penjaga
-- Salju, Naga Api, Ksatria Cahaya) hanya bisa DIBELI saat musimnya (bulan WIB),
-- tetapi setelah dimiliki tetap bisa dipakai selamanya. Warna custom dibuka sekali
-- seharga 300 koin (koin_transaksi aktivitas 'pet_beli', referensi 'warna_custom'),
-- lalu warna #RRGGBB bebas diganti. (Sudah diterapkan: migrasi pet_robot_skin_warna.)
alter table public.pet_robot
  add column if not exists skin_dimiliki  text[]  not null default '{}',
  add column if not exists skin_terpasang text,
  add column if not exists warna_terbuka  boolean not null default false,
  add column if not exists warna_custom   text
    check (warna_custom is null or warna_custom ~ '^#[0-9A-Fa-f]{6}$');

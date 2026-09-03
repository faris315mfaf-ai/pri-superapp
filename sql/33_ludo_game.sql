-- 33 — 3 Sep 2026: LUDO ROBOT (percobaan; ruang dibuat master, pemain lain
-- ikut lewat undangan/kode). Keadaan permainan di kolom state (jsonb) hanya
-- diubah server (lib/ludo.ts); versi naik tiap perubahan untuk polling klien
-- dan penolakan pembaruan bersamaan. (Sudah diterapkan: migrasi ludo_game.)
create table if not exists public.ludo_game (
  id              bigserial primary key,
  kode            text not null unique,
  host_id         bigint not null,
  status          text not null default 'menunggu' check (status in ('menunggu','berjalan','selesai')),
  pemain          jsonb not null default '[]'::jsonb,
  undangan        bigint[] not null default '{}',
  state           jsonb not null default '{}'::jsonb,
  versi           integer not null default 1,
  pemenang_id     bigint,
  dibuat_pada     timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);
create index if not exists idx_ludo_game_status on public.ludo_game (status, diperbarui_pada desc);
alter table public.ludo_game enable row level security;

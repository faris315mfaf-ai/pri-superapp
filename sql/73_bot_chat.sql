-- ============================================================
-- sql/73 — ROOM CHAT BOT (13 Okt 2026)
--
-- Satu room bersama: pemilik (master), agen bot, agen koordinator (tahap 3), dan catatan sistem.
--   pengirim : master | bot | koordinator | sistem
--   user_id  : app_user.id master pengirim
--   bot_id   : bot_redaksi.id pengirim (jawaban bot)
--   menyebut : id bot yang disebut (@nama) di pesan master
-- Hanya dibaca server (service role); RLS menyala TANPA kebijakan. Aman diulang.
--   ssh pri-vps 'docker exec -i supabase-db psql -U postgres -w --single-transaction -v ON_ERROR_STOP=1' < sql/73_bot_chat.sql
--   lalu: NOTIFY pgrst, 'reload schema';
-- Prasyarat: sql/67_bot_redaksi.sql.
-- ============================================================

create table if not exists public.bot_chat (
  id           bigint      generated always as identity primary key,
  pengirim     text        not null check (pengirim in ('master', 'bot', 'koordinator', 'sistem')),
  user_id      bigint      references public.app_user(id) on delete set null,
  bot_id       bigint      references public.bot_redaksi(id) on delete set null,
  teks         text        not null check (char_length(teks) between 1 and 4000),
  menyebut     bigint[]    not null default '{}',
  dibuat_pada  timestamptz not null default now()
);
create index if not exists idx_bot_chat_urut on public.bot_chat (id desc);
alter table public.bot_chat enable row level security;

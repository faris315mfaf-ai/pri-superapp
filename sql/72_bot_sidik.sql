-- ============================================================
-- sql/72 — SIDIK VISUAL kandidat video (3F tahap B), 13 Okt 2026
--
-- Satu baris per kandidat yang sudah/akan diperiksa runner:
--   status      : menunggu (perintah sudah dikeluarkan) | ok | tak_informatif (layar hitam/diam) | gagal
--   sidik       : larik jsonb hash heks 16 karakter (satu per detik, maks 24) — hasil lib/bot-sidik
--   galat       : alasan bila gagal
-- PRIMARY KEY kandidat_id = pagar "satu pemeriksaan per kandidat" (dua bot tidak memeriksa kandidat yang sama).
-- Dihapus otomatis bersama kandidatnya. Hanya dibaca server (service role); RLS menyala TANPA kebijakan.
-- Kode tetap jalan tanpa migrasi ini (pemeriksaan sidik dilewati). Aman diulang.
--   ssh pri-vps 'docker exec -i supabase-db psql -U postgres -w --single-transaction -v ON_ERROR_STOP=1' < sql/72_bot_sidik.sql
--   lalu: NOTIFY pgrst, 'reload schema';
-- Prasyarat: sql/67_bot_redaksi.sql.
-- ============================================================

create table if not exists public.bot_sidik (
  kandidat_id    bigint      primary key references public.bot_kandidat(id) on delete cascade,
  bot_id         bigint      references public.bot_redaksi(id) on delete set null,
  status         text        not null check (status in ('menunggu', 'ok', 'tak_informatif', 'gagal')),
  sidik          jsonb,
  galat          text        not null default '',
  dibuat_pada    timestamptz not null default now(),
  diperiksa_pada timestamptz
);
create index if not exists idx_bot_sidik_bot on public.bot_sidik (bot_id, dibuat_pada desc);
alter table public.bot_sidik enable row level security;

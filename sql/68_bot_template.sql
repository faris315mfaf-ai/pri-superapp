-- ============================================================
-- sql/68 — PUSTAKA TEMPLATE BOT (13 Okt 2026)
--
-- Master membangun template TVR Saya sekali (di akunnya atau akun bot), menamainya,
-- lalu memasangnya ke bot. Berkas template-nya disimpan di mesin Auto Edit
-- (templates/pustaka-<kode>); tabel ini hanya daftar bernama + penanda bot
-- mana memakai yang mana.
--
--   bot_template            : satu baris per template bernama di pustaka
--   bot_redaksi.template_id : template pustaka yang terakhir dipasang ke bot itu
--
-- Hanya dibaca server (service role); RLS menyala TANPA kebijakan. Aman diulang.
-- Jalankan manual SEBELUM push kode:
--   ssh pri-vps 'docker exec -i supabase-db psql -U postgres -w --single-transaction -v ON_ERROR_STOP=1' < sql/68_bot_template.sql
--   lalu: NOTIFY pgrst, 'reload schema';
-- Prasyarat: sql/67_bot_redaksi.sql.
-- ============================================================

create table if not exists public.bot_template (
  id               bigint generated always as identity primary key,
  -- kode folder di mesin: templates/pustaka-<kode>
  kode             text        not null unique check (kode ~ '^[a-z0-9]{6,24}$'),
  nama             text        not null,
  -- akun tempat template ini dibangun (master atau akun bot); null bila akunnya dihapus
  sumber_user_id   bigint      references public.app_user(id) on delete set null,
  ukuran_byte      bigint      not null default 0,
  dibuat_oleh      bigint      references public.app_user(id) on delete set null,
  dibuat_pada      timestamptz not null default now()
);
create unique index if not exists idx_bot_template_nama on public.bot_template (lower(nama));
alter table public.bot_template enable row level security;

alter table public.bot_redaksi add column if not exists template_id bigint references public.bot_template(id) on delete set null;
alter table public.bot_redaksi add column if not exists template_dipasang_pada timestamptz;

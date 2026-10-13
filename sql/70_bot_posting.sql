-- ============================================================
-- sql/70 — POSTING BOT & ANTREAN ACC (13 Okt 2026)
--
-- Kolom tambahan bot_tugas untuk alur ACC -> posting:
--   caption_post     : caption yang AKAN diposting (terpisah dari caption sumber
--                      di kolom `caption`, yang dipakai sebagai naskah hook)
--   keputusan        : keputusan master terakhir (setuju|ulang|tolak|batal)
--   keputusan_oleh   : app_user.id master yang memutuskan
--   keputusan_pada   : kapan
--
-- Hanya dibaca server (service role). Aman diulang.
-- Jalankan manual SEBELUM push kode:
--   ssh pri-vps 'docker exec -i supabase-db psql -U postgres -w --single-transaction -v ON_ERROR_STOP=1' < sql/70_bot_posting.sql
--   lalu: NOTIFY pgrst, 'reload schema';
-- Prasyarat: sql/67_bot_redaksi.sql.
-- ============================================================

alter table public.bot_tugas add column if not exists caption_post text not null default '';
alter table public.bot_tugas add column if not exists keputusan text check (keputusan is null or keputusan in ('setuju', 'ulang', 'tolak', 'batal'));
alter table public.bot_tugas add column if not exists keputusan_oleh bigint references public.app_user(id) on delete set null;
alter table public.bot_tugas add column if not exists keputusan_pada timestamptz;
create index if not exists idx_bot_tugas_keputusan on public.bot_tugas (keputusan_pada desc) where keputusan is not null;

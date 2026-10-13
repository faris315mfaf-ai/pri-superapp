-- ============================================================
-- sql/71 — ASAL VIDEO dari kredit takarir (3F tahap A), 13 Okt 2026
--
-- Kolom tambahan bot_kandidat (diisi saat panen oleh lib/bot-asal):
--   asal_status : kredit_url | kredit_akun | milik_penerbit | kredit_generik | tanpa_kredit
--   asal_akun   : akun asal tanpa "@" (huruf kecil)
--   asal_url    : tautan asal di takarir, bila ada
--   asal_kunci  : kunci kanonik tautan asal ("tiktok:123") — dipakai mendeteksi dua unggahan
--                 yang mengutip SATU video asal yang sama (pagar tabrakan antar-bot)
--
-- Hanya dibaca server (service role). Kode tetap jalan tanpa migrasi ini (kolom diabaikan).
-- Aman diulang. Jalankan manual:
--   ssh pri-vps 'docker exec -i supabase-db psql -U postgres -w --single-transaction -v ON_ERROR_STOP=1' < sql/71_bot_asal.sql
--   lalu: NOTIFY pgrst, 'reload schema';
-- Prasyarat: sql/67_bot_redaksi.sql.
-- ============================================================

alter table public.bot_kandidat add column if not exists asal_status text;
alter table public.bot_kandidat add column if not exists asal_akun text;
alter table public.bot_kandidat add column if not exists asal_url text;
alter table public.bot_kandidat add column if not exists asal_kunci text;
create index if not exists idx_bot_kandidat_asal_kunci on public.bot_kandidat (asal_kunci) where asal_kunci is not null;

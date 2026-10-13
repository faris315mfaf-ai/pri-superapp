-- ============================================================
-- sql/69 — "OTAK" TERSENDIRI PER BOT (13 Okt 2026)
--
-- Tiap bot boleh punya API key LLM sendiri (DeepSeek / Gemini) untuk menulis
-- hook, takarir, dan menilai sumber. Kuncinya DIENKRIPSI di aplikasi
-- (AES-256-GCM, kunci induk di env BOT_KUNCI_INDUK; lihat lib/bot-rahasia.ts)
-- sebelum masuk kolom ini — basis data tidak pernah memegang kunci polos.
-- Tabel terpisah dari bot_redaksi supaya kueri status bot yang ada tidak ikut
-- membawa kolom rahasia. Hanya dibaca server (service role); RLS menyala TANPA
-- kebijakan. Aman diulang.
-- Jalankan manual SEBELUM push kode:
--   ssh pri-vps 'docker exec -i supabase-db psql -U postgres -w --single-transaction -v ON_ERROR_STOP=1' < sql/69_bot_otak.sql
--   lalu: NOTIFY pgrst, 'reload schema';
-- Prasyarat: sql/67_bot_redaksi.sql.
-- ============================================================

create table if not exists public.bot_otak (
  bot_id        bigint      primary key references public.bot_redaksi(id) on delete cascade,
  penyedia      text        not null check (penyedia in ('deepseek', 'gemini')),
  -- "v1.<iv>.<tag>.<ciphertext>" (base64url); terikat ke bot_id lewat AAD
  kunci_sandi   text        not null,
  -- 4 karakter terakhir kunci (untuk ditampilkan: ••••abcd)
  akhir         text        not null default '',
  diubah_pada   timestamptz not null default now(),
  diubah_oleh   bigint      references public.app_user(id) on delete set null,
  teruji_pada   timestamptz,
  -- 'ok' atau kode galat (kunci_ditolak, kuota, waktu_habis, gagal)
  hasil_uji     text
);
alter table public.bot_otak enable row level security;

-- ============================================================
-- sql/75 — CHAT GLOBAL RUANG BOT (14 Okt 2026)
--
-- Satu room untuk semua anggota yang login, tampil di tab Ruang Bot (pengguna umum & master).
--   chat_global       : pesan (teks saja, 1..500 karakter). Dihapus master = dihapus_pada terisi
--                       (tidak hilang dari audit). Riwayat > 7 hari dibersihkan aplikasi.
--   chat_global_bisu  : akun yang dibisukan master sampai waktu tertentu.
-- Hanya dibaca server (service role); RLS menyala TANPA kebijakan. Aman diulang.
--   ssh pri-vps 'docker exec -i supabase-db psql -U postgres -w --single-transaction -v ON_ERROR_STOP=1' < sql/75_chat_global.sql
--   lalu: NOTIFY pgrst, 'reload schema';
-- ============================================================

create table if not exists public.chat_global (
  id            bigint      generated always as identity primary key,
  user_id       bigint      not null references public.app_user(id) on delete cascade,
  teks          text        not null check (char_length(teks) between 1 and 500),
  dibuat_pada   timestamptz not null default now(),
  dihapus_pada  timestamptz,
  dihapus_oleh  bigint      references public.app_user(id) on delete set null
);
create index if not exists idx_chat_global_urut on public.chat_global (id desc);
create index if not exists idx_chat_global_waktu on public.chat_global (dibuat_pada);
alter table public.chat_global enable row level security;

create table if not exists public.chat_global_bisu (
  user_id      bigint      primary key references public.app_user(id) on delete cascade,
  sampai       timestamptz not null,
  oleh         bigint      references public.app_user(id) on delete set null,
  dibuat_pada  timestamptz not null default now()
);
alter table public.chat_global_bisu enable row level security;

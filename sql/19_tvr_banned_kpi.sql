-- ============================================================
-- 19 — Lapor akun sosmed kena BANNED + KPI per-platform (31 Agu 2026)
--
-- Aturan KPI baru: target harian = 5 video x 6 platform = 30 link,
-- KETAT per platform (minimal 5 di TIAP platform aktif). Platform yang
-- akunnya kena banned otomatis dikecualikan dari target (target turun 5
-- per platform banned) BEGITU dilaporkan — tanpa menunggu persetujuan.
-- Bukti (screenshot) WAJIB; HR bisa mencabut laporan yang janggal.
-- Sudah diterapkan ke Supabase via MCP (migration tvr_banned_kpi).
-- ============================================================

create table if not exists public.tvr_banned (
  id           bigint generated always as identity primary key,
  user_id      bigint not null,
  platform     text   not null,
  bukti_path   text   not null,
  bukti_url    text   not null default '',
  keterangan   text,
  dibuat_pada  timestamptz not null default now(),
  -- null = masih berlaku; terisi = sudah dicabut (akun pulih / ditolak HR)
  dicabut_pada timestamptz,
  dicabut_oleh text
);

-- Satu laporan AKTIF per (user, platform) — laporan lama yang sudah
-- dicabut tidak menghalangi laporan baru.
create unique index if not exists tvr_banned_aktif_unik
  on public.tvr_banned (user_id, platform)
  where dicabut_pada is null;

create index if not exists idx_tvr_banned_user
  on public.tvr_banned (user_id, dibuat_pada desc);

-- RLS aktif tanpa policy publik -> hanya server (service_role).
alter table public.tvr_banned enable row level security;

-- Bucket bukti banned (publik, seperti bucket momen/chat).
insert into storage.buckets (id, name, public)
values ('banned', 'banned', true)
on conflict (id) do nothing;

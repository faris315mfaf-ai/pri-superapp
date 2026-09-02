-- 24 — 2 Sep 2026: leaderboard VIDEO TERBAIK per sosmed (tayangan/suka/komentar).
-- (Sudah diterapkan di Supabase sebagai migrasi video_terbaik_metrik.)
-- Angka per video dari TikHub (TikTok & Instagram), disapu bertahap
-- 12 jam/akun oleh lib/video-terbaik.ts (klaim atomik video_metrik_bucket).
create table if not exists public.tvr_video_metrik (
  kode            text primary key,            -- tt_<aweme_id> / ig_<code>
  platform        text not null,               -- tiktok | instagram
  akun_username   text not null,
  user_id         bigint,                      -- null = akun resmi (akun_wajib)
  nama_akun       text not null default '',
  judul           text not null default '',
  url             text not null,
  thumbnail_url   text not null default '',
  waktu_posting   timestamptz,
  tayangan        bigint not null default 0,
  suka            bigint not null default 0,
  komentar        bigint not null default 0,
  bagikan         bigint not null default 0,
  diperbarui_pada timestamptz not null default now()
);
create index if not exists idx_tvm_platform_tayangan on public.tvr_video_metrik (platform, tayangan desc);
create index if not exists idx_tvm_platform_suka     on public.tvr_video_metrik (platform, suka desc);
create index if not exists idx_tvm_platform_komentar on public.tvr_video_metrik (platform, komentar desc);
create index if not exists idx_tvm_waktu             on public.tvr_video_metrik (waktu_posting desc);
alter table public.tvr_video_metrik enable row level security;

-- Penanda kapan akun terakhir disapu (antrean giliran, 12 jam sekali).
alter table public.akun_tvr_user add column if not exists metrik_pada timestamptz;
alter table public.akun_wajib    add column if not exists metrik_pada timestamptz;

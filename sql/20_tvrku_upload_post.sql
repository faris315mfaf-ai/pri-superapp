-- ============================================================
-- 20 — Rombakan TV Rakyat Saya via upload-post (31 Agu 2026)
-- Sudah diterapkan ke Supabase via MCP (migration tvrku_upload_post).
--
-- - tvrku_post: riwayat unggahan video anggota ke sosmed pribadinya
--   (lewat upload-post; profil per anggota, kuota 225).
-- - hapus_media_pada: 2 jam setelah post/jadwal, BERKAS video di
--   penyimpanan aplikasi dihapus otomatis (postingan sosmed TETAP).
-- - sosmed_profile.insight_cache: cache analitik per profil.
-- - bucket "tvrku": tempat berkas video anggota (publik, agar URL-nya
--   bisa ditarik server upload-post).
-- ============================================================

create table if not exists public.tvrku_post (
  id              bigint generated always as identity primary key,
  user_id         bigint not null,
  judul           text not null default '',
  caption         text not null default '',
  platforms       text[] not null default '{}',
  video_path      text not null,
  video_url       text not null default '',
  jadwal          timestamptz,
  hasil           jsonb,
  request_id      text,
  dibuat_pada     timestamptz not null default now(),
  hapus_media_pada timestamptz
);
create index if not exists idx_tvrku_post_user on public.tvrku_post (user_id, dibuat_pada desc);
create index if not exists idx_tvrku_post_hapus on public.tvrku_post (hapus_media_pada)
  where hapus_media_pada is not null;
alter table public.tvrku_post enable row level security;

alter table public.sosmed_profile
  add column if not exists insight_cache jsonb,
  add column if not exists insight_pada timestamptz;

insert into storage.buckets (id, name, public)
values ('tvrku', 'tvrku', true)
on conflict (id) do nothing;

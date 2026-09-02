-- 23 — 2 Sep 2026: dua alur persetujuan Divisi HR untuk KPI video.
-- (Sudah diterapkan di Supabase sebagai migrasi
--  20260902031023_laporan_video_pending_dan_permohonan_blokir.)

-- 1. LAPORAN VIDEO MANUAL (lewat link) menunggu ACC HR.
--    Dibuat TABEL TERPISAH, bukan kolom status di laporan_video: 17
--    kueri KPI + 2 view membaca laporan_video sebagai "yang sudah
--    dihitung"; memisahkan yang menunggu berarti NOL perubahan pada
--    hitungan KPI yang sudah teruji. Disetujui = disalin ke laporan_video.
create table if not exists public.laporan_video_pending (
  id            bigserial primary key,
  user_id       bigint not null,
  platform      text not null,
  url_video     text not null,
  keyword       text,
  tanggal_wib   date not null,
  status        text not null default 'menunggu', -- menunggu | disetujui | ditolak
  catatan       text not null default '',
  diputus_oleh  text,
  diputus_pada  timestamptz,
  dibuat_pada   timestamptz not null default now()
);
create index if not exists idx_lvp_status on public.laporan_video_pending (status, dibuat_pada);
create index if not exists idx_lvp_user on public.laporan_video_pending (user_id, tanggal_wib);
alter table public.laporan_video_pending enable row level security;

-- 2. PERMOHONAN SOSMED TERBLOKIR: dulu efeknya seketika; kini harus
--    disetujui HR dulu baru target KPI berkurang 5/platform.
--    Baris lama diberi 'disetujui' supaya pengurangan yang sudah
--    berlaku tidak tiba-tiba hilang.
alter table public.tvr_banned
  add column if not exists status text not null default 'disetujui',
  add column if not exists diputus_oleh text,
  add column if not exists diputus_pada timestamptz,
  add column if not exists catatan_putusan text not null default '';
create index if not exists idx_tvr_banned_status on public.tvr_banned (status, dicabut_pada);

-- ============================================================
-- sql/50 — LINK PER KATEGORI + METRIK LINTAS SOSMED (13 Sep 2026)
--
-- (1) tvr_kategori_link — link video yang DITAMBAHKAN LANGSUNG ke satu
--     kategori oleh master/TV Rakyat Nasional (batch, satu link per
--     baris). Bukan laporan anggota, bukan unggahan: sekadar "video ini
--     termasuk kategori itu", supaya bisa dilacak angkanya.
--
-- (2) tvr_video_metrik diperluas: selama ini hanya TikTok & Instagram
--     (sapuan TikHub). Kini juga YouTube, Facebook, X (dan Threads bila
--     kelak ada) lewat Chocodata, ditandai kolom `sumber`. Kolom baru:
--     favorit (simpan/bookmark), durasi_detik, dan `kunci` yang seragam
--     untuk semua platform.
--
-- Aman & idempoten. RLS menyala tanpa policy publik.
-- ============================================================
create table if not exists public.tvr_kategori_link (
  id             bigint generated always as identity primary key,
  kategori       text not null,
  platform       text not null,
  url            text not null,
  -- platform + ID video (lib/insight-kategori kodeMetrik) — satu video
  -- tidak bisa dua kali di kategori yang sama walau URL-nya beda bentuk.
  kode           text not null,
  dibuat_oleh_id bigint references public.app_user(id),
  dibuat_pada    timestamptz not null default now(),
  unique (kategori, kode)
);
create index if not exists idx_tvr_kategori_link_kategori
  on public.tvr_kategori_link (lower(kategori), dibuat_pada desc);
alter table public.tvr_kategori_link enable row level security;

alter table public.tvr_video_metrik
  add column if not exists favorit      bigint not null default 0,
  add column if not exists durasi_detik integer,
  add column if not exists sumber       text not null default 'tikhub',
  add column if not exists mentah       jsonb;

grant select, insert, update, delete
  on public.tvr_kategori_link
  to anon, authenticated, service_role;
grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

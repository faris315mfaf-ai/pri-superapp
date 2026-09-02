-- 25 — 3 Sep 2026: SIARAN SERENTAK — satu video, sekali klik, terkirim ke
-- banyak profil upload-post (master/super_admin).
-- (Sudah diterapkan di Supabase sebagai migrasi siaran_serentak.)
-- Satu baris induk + satu baris per profil tujuan; tiap item diproses
-- dengan klaim atomik (status menunggu → diproses) oleh lib/siaran.ts,
-- dipicu after() dari /api/tvr/siaran — tanpa cron.
create table if not exists public.tvr_siaran (
  id               bigserial primary key,
  dibuat_oleh      bigint not null,
  judul            text not null,
  caption          text not null default '',
  platforms        text[] not null default '{}',
  video_path       text not null default '',   -- key R2 / path bucket (kosong = sudah disapu)
  video_url        text not null,              -- URL yang diserahkan ke upload-post
  ukuran_byte      bigint,
  jadwal           timestamptz,
  hapus_media_pada timestamptz,
  status           text not null default 'menunggu', -- menunggu | berjalan | selesai | dibatalkan
  dibuat_pada      timestamptz not null default now()
);
create table if not exists public.tvr_siaran_item (
  id            bigserial primary key,
  siaran_id     bigint not null references public.tvr_siaran(id) on delete cascade,
  profil        text not null,
  user_id       bigint,
  platforms     text[] not null default '{}',
  status        text not null default 'menunggu', -- menunggu | diproses | terkirim | gagal | dibatalkan
  request_id    text,
  hasil         jsonb,
  pesan         text not null default '',
  diproses_pada timestamptz,
  selesai_pada  timestamptz
);
create index if not exists idx_tsi_status on public.tvr_siaran_item (status, id);
create index if not exists idx_tsi_siaran on public.tvr_siaran_item (siaran_id);
create index if not exists idx_ts_pembuat on public.tvr_siaran (dibuat_oleh, id desc);
alter table public.tvr_siaran enable row level security;
alter table public.tvr_siaran_item enable row level security;

-- 38 — 5 Sep 2026: REQUEST VIDEO dari TV Rakyat Official ke seluruh anggota
-- (pimred membuat request; anggota "Kerjakan"; unggahan/laporan berikutnya
-- otomatis menutup pekerjaan itu) dan JEJAK KIRIM LAPORAN ke WhatsApp
-- (maks 2×/hari, jeda 1 jam).

create table if not exists public.tvr_request (
  id            bigserial primary key,
  judul         text not null,
  keterangan    text not null default '',
  -- sumber video bahan: tautan publik ATAU objek R2 hasil unggah pimred
  video_url     text not null default '',
  r2_key        text not null default '',
  dibuat_oleh   integer not null references public.app_user(id) on delete cascade,
  aktif         boolean not null default true,
  dibuat_pada   timestamptz not null default now(),
  ditutup_pada  timestamptz
);
create index if not exists idx_tvr_request_aktif on public.tvr_request (aktif, dibuat_pada desc);

create table if not exists public.tvr_request_kerja (
  id                  bigserial primary key,
  request_id          bigint not null references public.tvr_request(id) on delete cascade,
  user_id             integer not null references public.app_user(id) on delete cascade,
  status              text not null default 'dikerjakan' check (status in ('dikerjakan','selesai','batal')),
  diambil_pada        timestamptz not null default now(),
  selesai_pada        timestamptz,
  tvrku_post_id       bigint,
  laporan_pending_id  bigint,
  unique (request_id, user_id)
);
create index if not exists idx_tvr_request_kerja_user on public.tvr_request_kerja (user_id, status);

create table if not exists public.laporan_kirim_wa (
  id            bigserial primary key,
  user_id       integer not null references public.app_user(id) on delete cascade,
  kanal         text not null,
  tujuan        text not null default '',
  jumlah_video  integer not null default 0,
  status        text not null default 'terkirim',
  pesan         text not null default '',
  dikirim_pada  timestamptz not null default now()
);
create index if not exists idx_laporan_kirim_wa_user on public.laporan_kirim_wa (user_id, dikirim_pada desc);

alter table public.tvr_request enable row level security;
alter table public.tvr_request_kerja enable row level security;
alter table public.laporan_kirim_wa enable row level security;

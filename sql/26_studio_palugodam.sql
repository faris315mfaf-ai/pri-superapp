-- 26 — 3 Sep 2026: STUDIO PALUGODAM (link/berkas → DeepSeek → Creatomate →
-- Siaran Serentak). (Sudah diterapkan di Supabase sebagai migrasi studio_palugodam.)
create table if not exists public.palugodam_template (
  id               bigserial primary key,
  profil           text not null unique,
  template_id      text not null,
  label            text not null default '',
  elemen_video     text not null default 'Video',
  elemen_judul     text not null default 'Judul',
  elemen_highlight text not null default 'Highlight',
  aktif            boolean not null default true,
  diperbarui_pada  timestamptz not null default now()
);
alter table public.palugodam_template enable row level security;

create table if not exists public.studio_proyek (
  id               bigserial primary key,
  dibuat_oleh      bigint not null,
  sumber_link      text not null default '',
  sumber_platform  text not null default '',
  sumber_path      text not null default '',
  sumber_url       text not null default '',
  sumber_caption   text not null default '',
  ukuran_byte      bigint,
  penjelasan       text not null default '',
  caption_inti     text not null default '',
  status           text not null default 'sumber',
  siaran_id        bigint,
  hapus_media_pada timestamptz,
  dibuat_pada      timestamptz not null default now()
);
create index if not exists idx_sp_pembuat on public.studio_proyek (dibuat_oleh, id desc);
alter table public.studio_proyek enable row level security;

create table if not exists public.studio_proyek_item (
  id              bigserial primary key,
  proyek_id       bigint not null references public.studio_proyek(id) on delete cascade,
  profil          text not null,
  user_id         bigint,
  template_id     text not null default '',
  judul           text not null default '',
  highlight       text not null default '',
  caption         text not null default '',
  render_id       text,
  render_status   text not null default 'belum',
  render_url      text not null default '',
  pesan           text not null default '',
  diperbarui_pada timestamptz not null default now(),
  unique (proyek_id, profil)
);
create index if not exists idx_spi_proyek on public.studio_proyek_item (proyek_id);
alter table public.studio_proyek_item enable row level security;

alter table public.tvr_siaran_item
  add column if not exists video_url text,
  add column if not exists judul text,
  add column if not exists caption text;

-- Tambahan (migrasi studio_elemen_sumber): elemen "sumber" + akun asal video.
alter table public.palugodam_template add column if not exists elemen_sumber text not null default 'sumber';
alter table public.palugodam_template alter column elemen_video set default 'video-1';
alter table public.palugodam_template alter column elemen_judul set default 'judul';
alter table public.palugodam_template alter column elemen_highlight set default 'highlight';
alter table public.studio_proyek add column if not exists sumber_akun text not null default '';

-- 37 — 5 Sep 2026: PET v5 — PASAR TRADING (barang↔koin / barang↔barang,
-- tawaran publik & permintaan langsung antar pengguna) dan LOBI (posisi
-- robot berjalan-jalan; baris lama > 60 detik dianggap sudah keluar).
-- Harga per item & event item langka disimpan di pengaturan_sistem `pet_toko`.

create table if not exists public.pet_pasar (
  id            bigserial primary key,
  -- pemilik barang yang diperdagangkan
  pemilik_id    integer not null references public.app_user(id) on delete cascade,
  kode_item     text not null,
  jenis_item    text not null check (jenis_item in ('aksesoris','sparepart','skin')),
  -- imbalan yang diminta pemilik: koin ATAU barang (salah satu wajib)
  minta_koin    integer check (minta_koin is null or minta_koin between 1 and 1000000),
  minta_item    text,
  -- null = tawaran publik di pasar; terisi = khusus satu pengguna
  pihak_id      integer references public.app_user(id) on delete cascade,
  -- siapa yang membuat baris: pemilik (jual) atau pihak (minta barang pemilik)
  dibuat_oleh   integer not null references public.app_user(id) on delete cascade,
  pesan         text not null default '',
  status        text not null default 'buka' check (status in ('buka','selesai','batal','ditolak')),
  pembeli_id    integer references public.app_user(id) on delete set null,
  dibuat_pada   timestamptz not null default now(),
  selesai_pada  timestamptz,
  constraint pet_pasar_imbalan check (minta_koin is not null or minta_item is not null)
);
create index if not exists idx_pet_pasar_status on public.pet_pasar (status, dibuat_pada desc);
create index if not exists idx_pet_pasar_pemilik on public.pet_pasar (pemilik_id, status);
create index if not exists idx_pet_pasar_pihak on public.pet_pasar (pihak_id, status);

create table if not exists public.pet_lobi (
  user_id         integer primary key references public.app_user(id) on delete cascade,
  x               real not null default 500,
  y               real not null default 300,
  arah            text not null default 'kanan' check (arah in ('kiri','kanan')),
  pesan           text not null default '',
  diperbarui_pada timestamptz not null default now()
);
create index if not exists idx_pet_lobi_waktu on public.pet_lobi (diperbarui_pada desc);

alter table public.pet_pasar enable row level security;
alter table public.pet_lobi enable row level security;

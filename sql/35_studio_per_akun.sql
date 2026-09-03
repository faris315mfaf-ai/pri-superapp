-- 35 — 4 Sep 2026: STUDIO PALUGODAM mode PER AKUN.
-- Sebelumnya satu proyek = SATU video sumber yang dipakai bersama semua profil.
-- Mode baru: tiap akun (anggota PALUGODAM) punya LINK sendiri, caption sendiri,
-- judul sendiri, dan highlight sendiri; render baru boleh jalan setelah SEMUA
-- akun lengkap. Mode lama tetap ada (kolom mode = 'bersama').
-- (Sudah diterapkan di Supabase sebagai migrasi studio_per_akun.)
alter table public.studio_proyek
  add column if not exists mode text not null default 'bersama'
    check (mode in ('bersama', 'per_akun'));

-- Sumber video per item (dipakai hanya saat mode = 'per_akun'; mode 'bersama'
-- tetap membaca sumber di tabel induk studio_proyek).
alter table public.studio_proyek_item
  add column if not exists sumber_link      text not null default '',
  add column if not exists sumber_platform  text not null default '',
  add column if not exists sumber_path      text not null default '',
  add column if not exists sumber_url       text not null default '',
  add column if not exists sumber_caption   text not null default '',
  add column if not exists sumber_akun      text not null default '',
  add column if not exists ukuran_byte      bigint,
  add column if not exists hapus_media_pada timestamptz;

create index if not exists idx_spi_sapu_media
  on public.studio_proyek_item (hapus_media_pada)
  where hapus_media_pada is not null;

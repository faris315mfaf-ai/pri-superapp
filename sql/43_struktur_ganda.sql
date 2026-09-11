-- ============================================================
-- 43 — STRUKTUR GANDA (11 Sep 2026)
--
-- Permintaan user: "pada struktur bisa dipilih lebih dari 1".
--
-- Satu orang kini boleh berada di beberapa struktur sekaligus, mis.
-- Zona Jawa Barat SEKALIGUS Divisi HR.
--
-- Kolom lama SENGAJA tidak diubah: `divisi` / `sub_divisi` /
-- `jabatan_sayap` tetap menyimpan struktur UTAMA (yang pertama dipilih),
-- sehingga seluruh kode, view, dan laporan lama terus jalan apa adanya.
-- Struktur tambahan ditaruh di kolom baru ini sebagai array JSON:
--   [{ "divisi": "...", "sub_divisi": "...", "jabatan_sayap": "" }, ...]
-- Maksimal 4 struktur per orang dijaga di aplikasi (MAKS_STRUKTUR).
-- ============================================================

alter table public.app_user
  add column if not exists struktur_lain jsonb not null default '[]'::jsonb;

comment on column public.app_user.struktur_lain is
  'Struktur TAMBAHAN di luar divisi/sub_divisi utama (11 Sep 2026). Array objek {divisi, sub_divisi, jabatan_sayap}.';

-- Jaga-jaga supaya isinya selalu array, bukan objek atau angka.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'app_user_struktur_lain_array'
  ) then
    alter table public.app_user
      add constraint app_user_struktur_lain_array
      check (jsonb_typeof(struktur_lain) = 'array');
  end if;
end $$;

-- Mencari "siapa saja di Divisi HR" harus tetap cepat walau kini
-- jawabannya bisa datang dari kolom tambahan.
create index if not exists idx_app_user_struktur_lain
  on public.app_user using gin (struktur_lain);

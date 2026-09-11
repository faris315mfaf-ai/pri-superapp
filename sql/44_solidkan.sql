-- ============================================================
-- 44 — MENYOLIDKAN DATABASE SETELAH PINDAH KE SERVER SENDIRI
--      (12 Sep 2026)
--
-- Aman dijalankan berkali-kali. Tidak menghapus atau mengubah satu pun
-- baris data — hanya memperbaiki hal-hal di SEKITAR data yang mudah
-- tertinggal saat pemindahan, lalu melaporkan keadaannya.
--
-- Isinya empat hal:
--   1. Penomoran otomatis diselaraskan ulang  <-- paling penting
--   2. Hak akses dipastikan lengkap
--   3. Fungsi ukuran_database() untuk halaman Server
--   4. Laporan keadaan database
-- ============================================================

\set ON_ERROR_STOP on

-- ------------------------------------------------------------
-- 1. PENOMORAN OTOMATIS
--
-- Ini kerusakan paling berbahaya setelah pemindahan, dan paling sunyi.
-- Tiap tabel punya penghitung nomor baris berikutnya. Kalau penghitung
-- itu tertinggal di belakang nomor tertinggi yang sudah ada, maka baris
-- BARU pertama akan memakai nomor yang sudah dipakai baris lama, lalu
-- ditolak database. Gejalanya baru muncul berhari-hari kemudian, saat
-- ada anggota mengunggah sesuatu dan gagal tanpa sebab yang jelas.
--
-- Di bawah ini tiap penghitung didorong ke nomor tertinggi yang benar.
-- ------------------------------------------------------------
do $$
declare
  r record;
  urutan text;
  maks bigint;
  sekarang bigint;
  diperbaiki int := 0;
  diperiksa int := 0;
begin
  for r in
    select c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema
       and t.table_name = c.table_name
       and t.table_type = 'BASE TABLE'
     where c.table_schema = 'public'
  loop
    urutan := pg_get_serial_sequence(format('public.%I', r.table_name), r.column_name);
    continue when urutan is null;
    diperiksa := diperiksa + 1;
    execute format('select coalesce(max(%I), 0) from public.%I', r.column_name, r.table_name)
       into maks;
    -- pg_sequence_last_value menerima nama apa adanya, jadi tidak perlu
    -- mengurai teks nama urutan (yang bisa berkutip dan mudah salah).
    sekarang := coalesce(pg_sequence_last_value(urutan::regclass), 0);
    if maks > sekarang then
      perform setval(urutan, maks, true);
      diperbaiki := diperbaiki + 1;
      raise notice 'penomoran % diperbaiki: % -> %', r.table_name, sekarang, maks;
    end if;
  end loop;
  raise notice 'penomoran otomatis: % diperiksa, % diperbaiki', diperiksa, diperbaiki;
end $$;

-- ------------------------------------------------------------
-- 2. HAK AKSES
--
-- Diulang di sini supaya berkas ini berdiri sendiri: kalau kelak ada
-- tabel baru dibuat lewat jalur lain, izinnya ikut terpasang.
-- ------------------------------------------------------------
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all privileges on all tables    in schema public to postgres, anon, authenticated, service_role;
grant all privileges on all sequences in schema public to postgres, anon, authenticated, service_role;
grant all privileges on all routines  in schema public to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on routines  to postgres, anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 3. UKURAN DATABASE
--
-- Sejak aplikasi pindah ke server sendiri, halaman Panel Master → Server
-- membaca CPU dan RAM langsung dari mesinnya. Ukuran database tidak bisa
-- dibaca dari sana — hanya database yang tahu — jadi disediakan lewat
-- fungsi kecil ini.
-- ------------------------------------------------------------
create or replace function public.ukuran_database()
returns bigint
language sql
security definer
set search_path = public
as $$
  select pg_database_size(current_database());
$$;

revoke all on function public.ukuran_database() from public;
grant execute on function public.ukuran_database() to service_role;

comment on function public.ukuran_database() is
  'Ukuran database dalam byte, untuk Panel Master > Server (12 Sep 2026).';

-- ------------------------------------------------------------
-- 4. LAPORAN KEADAAN
-- ------------------------------------------------------------
select 'ukuran database' as hal, pg_size_pretty(pg_database_size(current_database())) as nilai
union all select 'tabel',      count(*)::text from information_schema.tables  where table_schema='public' and table_type='BASE TABLE'
union all select 'view',       count(*)::text from information_schema.views   where table_schema='public'
union all select 'fungsi',     count(*)::text from information_schema.routines where routine_schema='public'
union all select 'indeks',     count(*)::text from pg_indexes                 where schemaname='public'
union all select 'trigger',    count(*)::text from information_schema.triggers where trigger_schema='public'
union all select 'aturan RLS', count(*)::text from pg_policies                where schemaname='public'
union all select 'kunci asing',count(*)::text from information_schema.table_constraints where constraint_schema='public' and constraint_type='FOREIGN KEY'
union all select 'tabel realtime', count(*)::text from pg_publication_tables  where pubname='supabase_realtime'
union all select 'ekstensi',   string_agg(extname, ', ' order by extname) from pg_extension where extname in ('pg_net','pgcrypto','uuid-ossp','pg_cron','pg_stat_statements');

-- Tabel TERBESAR — berguna untuk tahu apa yang tumbuh paling cepat.
select relname as tabel_terbesar,
       pg_size_pretty(pg_total_relation_size(c.oid)) as ukuran,
       n_live_tup as perkiraan_baris
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_stat_user_tables s on s.relid = c.oid
 where n.nspname = 'public' and c.relkind = 'r'
 order by pg_total_relation_size(c.oid) desc
 limit 8;

-- Tabel yang PERLU dirapikan (banyak baris mati = kueri melambat).
select relname as perlu_dirapikan, n_dead_tup as baris_mati, last_autovacuum
  from pg_stat_user_tables
 where schemaname = 'public' and n_dead_tup > 10000
 order by n_dead_tup desc
 limit 5;

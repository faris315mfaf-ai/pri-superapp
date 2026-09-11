-- =====================================================================
-- 45 — MEMPERBAIKI ALAMAT FOTO & BERKAS SETELAH PINDAH SERVER
--      (12 Sep 2026)
--
-- MASALAHNYA APA
-- Saat pindah ke server sendiri, alamat berkas di dalam database diganti
-- pada ENAM kolom yang sudah diketahui (vps/05-ganti-url.sql). Padahal
-- aplikasi menulis alamat berkas dari SEBELAS tempat berbeda: foto
-- profil, momen, sampul video, chat, chat grup, bukti pelanggaran,
-- siaran, studio, dan seterusnya. Kolom yang tidak ikut terdaftar masih
-- menyimpan alamat server lama.
--
-- Selama server lama masih hidup, foto-foto itu MASIH tampil — jadi
-- kesalahannya belum kelihatan. Begitu server lama dimatikan, foto-foto
-- tersebut hilang serentak tanpa pesan apa pun.
--
-- CARA BERKAS INI BEKERJA (beda dari sql/05)
-- Tidak memakai daftar kolom sama sekali. Berkas ini MENYISIR SELURUH
-- kolom teks dan JSON di seluruh tabel, lalu mengganti nama server lama
-- di mana pun ia ditemukan — termasuk kolom yang baru dibuat nanti.
--
-- Yang dicari adalah NAMA SERVER-nya saja (tanpa "https://"), supaya
-- alamat yang tertulis "http://" atau "//" ikut terperbaiki.
--
-- AMAN DIULANG: setelah tidak ada lagi alamat lama, menjalankannya lagi
-- tidak mengubah apa pun. Semua berjalan dalam SATU transaksi: kalau
-- pemeriksaan akhir gagal, seluruh perubahan dibatalkan.
--
-- CARA PAKAI: lewat vps/14-perbaiki-foto.sh (disarankan), atau langsung:
--   psql ... -v lama=NAMA-LAMA.supabase.co -v baru=db.domain.com \
--            -v kerjakan=ya -f 45_perbaiki-alamat-berkas.sql
--   kerjakan=tidak  ->  hanya melapor, tidak mengubah apa pun.
-- =====================================================================

\set ON_ERROR_STOP on

-- Nilai bawaan bila tidak dioper dari luar.
\if :{?lama}
\else
\set lama 'pichnkyjepsirpclofhs.supabase.co'
\endif
\if :{?baru}
\else
\set baru 'db.pri-superapp.com'
\endif
\if :{?kerjakan}
\else
\set kerjakan 'ya'
\endif

-- Nilai dipindahkan ke pengaturan sesi.
--
-- Alasannya penting: psql TIDAK mengganti :'lama' di dalam blok
-- $$ ... $$. Kalau dipakai langsung di dalam blok, yang terkirim ke
-- server adalah tulisan ":'lama'" apa adanya, dan langsung gagal.
-- Baris di bawah ini SQL biasa, jadi penggantiannya berjalan normal;
-- blok-blok di bawah membacanya lewat current_setting().
select set_config('pri.host_lama', :'lama',     false) as host_lama,
       set_config('pri.host_baru', :'baru',     false) as host_baru,
       set_config('pri.kerjakan',  :'kerjakan', false) as kerjakan;

begin;

-- ---------------------------------------------------------------------
-- Daftar kolom yang bisa diperbaiki, beserta cara membaca & menulisnya.
--
-- Dibuat di pg_temp: ikut hilang sendiri saat sambungan ditutup, jadi
-- tidak meninggalkan apa pun di database.
--
--   bacaan  = cara membaca kolom sebagai teks biasa
--   tulisan = nilai penggantinya ($1 = nama lama, $2 = nama baru)
-- ---------------------------------------------------------------------
create or replace function pg_temp.pri_kolom_teks()
returns table (tabel text, kolom text, bacaan text, tulisan text)
language sql stable as $fn$
  select c.table_name::text,
         c.column_name::text,
         case c.data_type
           when 'jsonb' then quote_ident(c.column_name) || '::text'
           when 'json'  then quote_ident(c.column_name) || '::text'
           else quote_ident(c.column_name)
         end,
         case c.data_type
           when 'jsonb' then 'replace(' || quote_ident(c.column_name) || '::text, $1, $2)::jsonb'
           when 'json'  then 'replace(' || quote_ident(c.column_name) || '::text, $1, $2)::json'
           else 'replace(' || quote_ident(c.column_name) || ', $1, $2)'
         end
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name   = c.table_name
     and t.table_type   = 'BASE TABLE'
   where c.table_schema = 'public'
     and c.data_type in ('text', 'character varying', 'character', 'json', 'jsonb')
     and c.is_generated = 'NEVER'
     and c.is_updatable = 'YES'
   order by c.table_name, c.column_name;
$fn$;

-- Kolom bertipe DAFTAR (text[]) sengaja TIDAK diubah otomatis: menulis
-- ulang daftar berisiko mengubah urutan atau menggabungkan isinya. Di
-- aplikasi ini daftar hanya dipakai untuk nama platform dan barang pet,
-- bukan alamat berkas — tapi tetap DIPERIKSA supaya tidak ada yang
-- terlewat diam-diam.
create or replace function pg_temp.pri_kolom_daftar()
returns table (tabel text, kolom text, bacaan text)
language sql stable as $fn$
  select c.table_name::text,
         c.column_name::text,
         quote_ident(c.column_name) || '::text'
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name   = c.table_name
     and t.table_type   = 'BASE TABLE'
   where c.table_schema = 'public'
     and c.data_type = 'ARRAY'
     and c.udt_name in ('_text', '_varchar', '_bpchar')
   order by c.table_name, c.column_name;
$fn$;

-- ---------------------------------------------------------------------
-- 1. LAPORAN SEBELUM — di mana saja nama server lama masih tertulis.
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  n bigint;
  total bigint := 0;
  kolom_kena int := 0;
  lama text := current_setting('pri.host_lama');
begin
  if coalesce(lama, '') = '' then
    raise exception 'Nama server lama kosong.';
  end if;
  raise notice '--- SEBELUM: mencari "%" di seluruh kolom ---', lama;
  for r in select * from pg_temp.pri_kolom_teks() loop
    execute format('select count(*) from public.%I where strpos(%s, $1) > 0',
                   r.tabel, r.bacaan)
       into n using lama;
    if n > 0 then
      raise notice '  %.% -> % baris', r.tabel, r.kolom, n;
      total := total + n;
      kolom_kena := kolom_kena + 1;
    end if;
  end loop;
  if total = 0 then
    raise notice '  (bersih) tidak ada alamat lama tersisa';
  else
    raise notice '  TOTAL % baris di % kolom', total, kolom_kena;
  end if;

  -- Kolom daftar: hanya diperiksa, tidak diubah.
  for r in select * from pg_temp.pri_kolom_daftar() loop
    execute format('select count(*) from public.%I where strpos(%s, $1) > 0',
                   r.tabel, r.bacaan)
       into n using lama;
    if n > 0 then
      raise warning 'PERLU TANGAN: %.% (kolom daftar) memuat alamat lama di % baris — tidak diubah otomatis.',
        r.tabel, r.kolom, n;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. MENGGANTI.
--
-- Hanya baris yang memang memuat alamat lama yang disentuh, supaya tabel
-- besar tidak ditulis ulang seluruhnya tanpa perlu.
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  n bigint;
  total bigint := 0;
  lama text := current_setting('pri.host_lama');
  baru text := current_setting('pri.host_baru');
begin
  if current_setting('pri.kerjakan') <> 'ya' then
    raise notice '--- MODE PERIKSA: tidak ada yang diubah ---';
    return;
  end if;
  if coalesce(baru, '') = '' then
    raise exception 'Nama server baru kosong.';
  end if;
  if lama = baru then
    raise exception 'Nama server lama dan baru sama (%) — tidak ada yang perlu dikerjakan.', lama;
  end if;
  raise notice '--- MENGGANTI "%" menjadi "%" ---', lama, baru;
  for r in select * from pg_temp.pri_kolom_teks() loop
    execute format('update public.%I set %I = %s where strpos(%s, $1) > 0',
                   r.tabel, r.kolom, r.tulisan, r.bacaan)
      using lama, baru;
    get diagnostics n = row_count;
    if n > 0 then
      raise notice '  %.% -> % baris diperbaiki', r.tabel, r.kolom, n;
      total := total + n;
    end if;
  end loop;
  raise notice '  SELESAI: % baris diperbaiki', total;
end $$;

-- ---------------------------------------------------------------------
-- 3. PEMERIKSAAN SESUDAH — harus nol; kalau tidak, semuanya dibatalkan.
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  n bigint;
  sisa bigint := 0;
  lama text := current_setting('pri.host_lama');
begin
  if current_setting('pri.kerjakan') <> 'ya' then
    return;
  end if;
  for r in select * from pg_temp.pri_kolom_teks() loop
    execute format('select count(*) from public.%I where strpos(%s, $1) > 0',
                   r.tabel, r.bacaan)
       into n using lama;
    sisa := sisa + n;
  end loop;
  if sisa > 0 then
    raise exception 'Masih ada % baris beralamat lama — semua perubahan dibatalkan.', sisa;
  end if;
  raise notice '--- SESUDAH: diperiksa, tidak ada satu pun alamat lama tersisa ---';
end $$;

commit;

-- ============================================================
-- sql/47 — MENYETUJUI SEMUA LAPORAN VIDEO YANG MASIH MENUNGGU ACC
--          (12 Sep 2026, sekali jalan)
--
-- Latar: fitur ACC KPI dimatikan (commit 7213f37). Laporan baru langsung
-- masuk KPI. Tapi laporan yang terlanjur masuk SEBELUM itu masih
-- tertahan di laporan_video_pending berstatus 'menunggu' — dan mejanya
-- sudah tidak ada. Berkas ini melakukan persis apa yang dulu dilakukan
-- tombol "ACC sekaligus" di HR Center, untuk semuanya:
--
--   1. salin ke laporan_video (masuk KPI), sumber 'manual-acc';
--   2. beri koin, jumlahnya mengikuti pengaturan master;
--   3. tandai pending-nya 'disetujui'.
--
-- AMAN DIULANG: yang sudah ada di laporan_video tidak disalin dua kali,
-- koin yang sudah diberikan tidak dobel, dan pending yang sudah diputus
-- tidak disentuh. Menjalankannya lagi = tidak ada yang berubah.
--
-- Dijalankan lewat pri-sql (satu transaksi: gagal di tengah = batal semua):
--   pri-sql 47_setujui_semua_laporan.sql
-- ============================================================

\set ON_ERROR_STOP on

-- ------------------------------------------------------------
-- 0. Laporan SEBELUM — supaya hasilnya bisa dibandingkan.
-- ------------------------------------------------------------
do $$
declare n bigint;
begin
  select count(*) into n from public.laporan_video_pending where status = 'menunggu';
  raise notice 'SEBELUM: % laporan masih menunggu ACC', n;
end $$;

-- ------------------------------------------------------------
-- 1. Salin ke laporan_video. Duplikat diperiksa lewat NOT EXISTS, bukan
--    ON CONFLICT: cara ini tidak bergantung pada nama kunci unik mana pun,
--    dan tetap benar walau kuncinya kelak diubah.
-- ------------------------------------------------------------
-- Tabel sementara dibuat DULU, lalu diisi lewat WITH di tingkat atas
-- sebuah INSERT. PostgreSQL menolak INSERT…RETURNING di dalam
-- CREATE TABLE AS ("data-modifying statement must be at the top level").
create temp table _disetujui (laporan_id bigint, user_id bigint) on commit drop;

with dipilih as (
  select p.id as pending_id, p.user_id, p.platform, p.url_video, p.keyword, p.tanggal_wib
    from public.laporan_video_pending p
   where p.status = 'menunggu'
     and not exists (
       select 1 from public.laporan_video lv
        where lv.user_id = p.user_id
          and lv.url_video = p.url_video
     )
),
dimasukkan as (
  insert into public.laporan_video (user_id, platform, url_video, keyword, tanggal_wib, sumber)
  select user_id, platform, url_video, keyword, tanggal_wib, 'manual-acc'
    from dipilih
  returning id, user_id
)
insert into _disetujui (laporan_id, user_id)
select id, user_id from dimasukkan;

do $$
declare n bigint;
begin
  select count(*) into n from _disetujui;
  raise notice 'DISALIN ke KPI: % laporan (sisanya sudah tercatat sebelumnya)', n;
end $$;

-- ------------------------------------------------------------
-- 2. Koin — persis seperti beriKoin() di aplikasi:
--    jumlah dari pengaturan master (koin_bonus_laporan_video), bawaan 15;
--    0 berarti master mematikannya; kunci unik (user, aktivitas, referensi)
--    mencegah koin dobel.
-- ------------------------------------------------------------
do $$
declare
  bonus int;
  n bigint := 0;
begin
  select coalesce(nullif(regexp_replace(nilai::text, '[^0-9]', '', 'g'), '')::int, 15)
    into bonus
    from public.pengaturan_sistem
   where kunci = 'koin_bonus_laporan_video';
  if bonus is null then bonus := 15; end if;

  if bonus <= 0 then
    raise notice 'KOIN: dimatikan master (bonus 0) — tidak ada koin yang diberikan';
  else
    insert into public.koin_transaksi (user_id, jumlah, aktivitas, referensi)
    select user_id, bonus, 'laporan_video', 'laporan-' || laporan_id
      from _disetujui
    on conflict (user_id, aktivitas, referensi) do nothing;
    get diagnostics n = row_count;
    raise notice 'KOIN: % orang menerima % koin', n, bonus;
  end if;
end $$;

-- ------------------------------------------------------------
-- 3. Tandai pending-nya. SEMUA yang 'menunggu' — termasuk yang tidak
--    disalin karena sudah tercatat: bagi anggota, itu pun berarti
--    laporannya diterima (sama seperti perlakuan 23505 di aplikasi).
-- ------------------------------------------------------------
update public.laporan_video_pending
   set status = 'disetujui',
       catatan = 'Disetujui sekaligus — ACC KPI ditiadakan (12 Sep 2026)',
       diputus_oleh = 'Sistem',
       diputus_pada = now()
 where status = 'menunggu';

-- ------------------------------------------------------------
-- 4. Laporan SESUDAH — harus nol.
-- ------------------------------------------------------------
do $$
declare n bigint;
begin
  select count(*) into n from public.laporan_video_pending where status = 'menunggu';
  if n > 0 then
    raise exception 'Masih ada % laporan menunggu — seharusnya nol. Dibatalkan.', n;
  end if;
  raise notice 'SESUDAH: tidak ada lagi laporan yang menunggu ACC';
end $$;

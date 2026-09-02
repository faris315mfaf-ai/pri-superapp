-- ============================================================
-- 11 — Integrasi akun terdaftar + fitur Absensi + Laporan Kerja
-- (Sudah diterapkan ke Supabase 2026-08-25 lewat 3 migrasi:
--  v_app_kader_dari_akun_terdaftar, fitur_absensi,
--  fitur_laporan_kerja. File ini arsip untuk repo.)
-- ============================================================

-- ------------------------------------------------------------
-- A. v_app_kader kini membaca AKUN YANG DIDAFTARKAN PENGGUNA
--    (app_user + akun_sosmed_user), bukan roster dummy
--    kader/akun_kader. Data dummy (Faris/Dio/Salman/Godam)
--    sudah dihapus; kedua tabel roster dibiarkan kosong karena
--    v_akun_qc lama masih meng-union-nya (cabang kosong = aman).
--    Nama kolom dipertahankan persis agar API/layar tidak berubah.
-- ------------------------------------------------------------
create or replace view public.v_app_kader as
select distinct on (u.id)
  'us-' || u.id::text            as id,
  u.nama                         as nama_kader,
  ''::text                       as wilayah,
  coalesce(u.jabatan, '')        as jabatan,
  coalesce(u.nomor_wa, '')       as nomor_wa,
  coalesce(s.username, '')       as ig_username,
  (u.aktif and u.status = 'aktif') as aktif
from public.app_user u
join public.akun_sosmed_user s
  on s.user_id = u.id and s.aktif
where u.aktif and u.status = 'aktif'
order by u.id, s.platform, s.id;

alter view public.v_app_kader set (security_invoker = true);

-- ------------------------------------------------------------
-- B. Absensi (kamera depan + GPS + geotag; retensi 7 hari)
--    Waktu = jam server; pembersihan otomatis dijalankan oleh
--    /api/absensi setiap kali dipakai (tanpa cron).
-- ------------------------------------------------------------
create table public.absensi (
  id           bigint generated always as identity primary key,
  user_id      bigint not null references public.app_user(id) on delete cascade,
  jenis        text   not null check (jenis in ('masuk','pulang')),
  waktu        timestamptz not null default now(),
  tanggal_wib  date   not null,
  lat          double precision not null,
  lng          double precision not null,
  akurasi_m    double precision,
  alamat       text,
  foto_path    text   not null,
  dibuat_pada  timestamptz not null default now(),
  unique (user_id, tanggal_wib, jenis)
);
create index idx_absensi_tanggal on public.absensi (tanggal_wib desc, user_id);
alter table public.absensi enable row level security;

-- Bucket privat foto absen; disajikan lewat signed URL dari API.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('absensi', 'absensi', false, 512000, array['image/jpeg'])
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- C. Laporan Kerja (rencana pagi → laporan sore → KPI)
--    KPI = rencana selesai / total rencana; 'tambahan' dihitung
--    terpisah. Stempel dibuat_pada/dilaporkan_pada dari server.
-- ------------------------------------------------------------
create table public.kerja_item (
  id                bigint generated always as identity primary key,
  user_id           bigint not null references public.app_user(id) on delete cascade,
  tanggal_wib       date   not null,
  deskripsi         text   not null check (length(trim(deskripsi)) between 3 and 500),
  jenis             text   not null default 'rencana'  check (jenis in ('rencana','tambahan')),
  status            text   not null default 'direncanakan'
                    check (status in ('direncanakan','selesai','tidak_selesai')),
  catatan_realisasi text,
  dibuat_pada       timestamptz not null default now(),
  dilaporkan_pada   timestamptz
);
create index idx_kerja_item_tanggal on public.kerja_item (tanggal_wib desc, user_id);
alter table public.kerja_item enable row level security;

create view public.v_kerja_kpi as
select
  k.user_id,
  u.nama,
  u.jabatan,
  k.tanggal_wib,
  count(*) filter (where k.jenis = 'rencana')                          as rencana_total,
  count(*) filter (where k.jenis = 'rencana' and k.status = 'selesai') as rencana_selesai,
  count(*) filter (where k.jenis = 'rencana' and k.status = 'tidak_selesai') as rencana_gagal,
  count(*) filter (where k.jenis = 'rencana' and k.status = 'direncanakan')  as rencana_belum_lapor,
  count(*) filter (where k.jenis = 'tambahan')                         as tambahan_total,
  round(
    100.0 * count(*) filter (where k.jenis = 'rencana' and k.status = 'selesai')
    / nullif(count(*) filter (where k.jenis = 'rencana'), 0)
  )                                                                    as kpi_persen,
  min(k.dibuat_pada)    filter (where k.jenis = 'rencana')             as rencana_pertama_pada,
  max(k.dilaporkan_pada)                                               as laporan_terakhir_pada
from public.kerja_item k
join public.app_user u on u.id = k.user_id
group by k.user_id, u.nama, u.jabatan, k.tanggal_wib;

alter view public.v_kerja_kpi set (security_invoker = true);

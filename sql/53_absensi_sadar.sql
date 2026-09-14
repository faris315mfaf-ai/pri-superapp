-- ============================================================
-- sql/53 — ABSENSI DARI SADAR (14 Sep 2026)
--
-- SuperApp berhenti menjadi alat absen. Absen dilakukan di aplikasi
-- SADAR (sadar-pri.id); SuperApp hanya MENAMPILKAN datanya. Data
-- ditarik dari API SADAR (per tanggal) lalu dicerminkan ke sini supaya
-- seluruh layar yang sudah ada — beranda, dashboard, HR Center, rekap
-- PDF, peringkat — tetap bekerja tanpa dibongkar.
--
-- Dua lapis:
--   absensi_sadar : cermin MENTAH per (kode pegawai, tanggal) — termasuk
--                   orang SADAR yang belum punya akun SuperApp (user_id
--                   kosong) supaya HR tahu siapa yang belum cocok.
--   absensi       : tabel lama, tetap jadi sumber layar. Baris dari SADAR
--                   ditandai sumber='sadar'; kolom foto/GPS tidak lagi
--                   wajib (tidak ada swafoto lagi).
-- Pencocokan orang: EMAIL SADAR = email akun SuperApp (huruf kecil).
-- ============================================================

alter table public.absensi
  alter column lat       drop not null,
  alter column lng       drop not null,
  alter column foto_path drop not null,
  add column if not exists sumber           text not null default 'superapp',
  add column if not exists kode_pegawai     text not null default '',
  add column if not exists status_sadar     text not null default '',
  add column if not exists tipe_sadar       text not null default '',
  add column if not exists verifikasi_sadar text not null default '';

create table if not exists public.absensi_sadar (
  id             bigint generated always as identity primary key,
  kode_pegawai   text        not null,
  tanggal        date        not null,
  email          text        not null default '',
  nama           text        not null default '',
  user_id        bigint      references public.app_user(id) on delete set null,
  hadir          boolean     not null default false,
  status         text        not null default '',
  tipe           text        not null default '',
  jam_masuk      time,
  jam_pulang     time,
  verifikasi     text        not null default '',
  mentah         jsonb,
  disinkron_pada timestamptz not null default now(),
  unique (kode_pegawai, tanggal)
);
create index if not exists idx_absensi_sadar_tanggal on public.absensi_sadar (tanggal desc);
create index if not exists idx_absensi_sadar_user    on public.absensi_sadar (user_id, tanggal desc);
alter table public.absensi_sadar enable row level security;

-- Catatan tanggal mana yang sudah ditarik (dan kapan) — supaya tren
-- 30 hari tidak menarik ulang 30 tanggal setiap kali dibuka.
create table if not exists public.absensi_sinkron (
  tanggal      date        primary key,
  pada         timestamptz not null default now(),
  jumlah       integer     not null default 0,
  cocok        integer     not null default 0,
  tidak_cocok  integer     not null default 0
);
alter table public.absensi_sinkron enable row level security;

notify pgrst, 'reload schema';

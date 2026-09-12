-- ============================================================
-- sql/48 — REKAMAN HARIAN PER ANGGOTA (12 Sep 2026)
--
-- Untuk leaderboard "Top Mingguan": siapa yang PENGIKUTNYA naik paling
-- banyak pekan ini. Kenaikan tidak bisa dihitung dari angka sekarang
-- saja — butuh pembanding dari hari-hari sebelumnya, dan sumber datanya
-- (upload-post) tidak menyimpan sejarah. sql/46 sudah mencatat angka
-- NASIONAL per hari; tabel ini mencatat angka PER ORANG per hari.
--
-- Satu baris per (tanggal WIB, anggota). Diisi penjadwal yang sama
-- dengan rekaman nasional (/api/cron/rekam-metrik, 23.50 WIB). Kalau
-- hari itu tercatat dua kali, barisnya diperbarui, bukan dobel.
--
-- KONSEKUENSI: kenaikan pengikut baru muncul setelah ada rekaman
-- pembanding — sehari setelah dipasang untuk "hari ini", seminggu untuk
-- pekan penuh. Leaderboard mengatakannya apa adanya, dan sementara itu
-- memakai kenaikan LAPORAN VIDEO yang sejarahnya sudah ada.
-- ============================================================
create table if not exists public.tvr_metrik_anggota_harian (
  tanggal_wib  date   not null,
  user_id      bigint not null,
  pengikut     bigint not null default 0,
  tayangan     bigint not null default 0,
  jangkauan    bigint not null default 0,
  suka         bigint not null default 0,
  komentar     bigint not null default 0,
  bagikan      bigint not null default 0,
  diambil_pada timestamptz not null default now(),
  primary key (tanggal_wib, user_id)
);

-- Leaderboard membaca "rekaman terakhir sebelum tanggal X per orang".
create index if not exists idx_tvr_mah_user_tanggal
  on public.tvr_metrik_anggota_harian (user_id, tanggal_wib desc);

alter table public.tvr_metrik_anggota_harian enable row level security;

grant select, insert, update, delete
  on public.tvr_metrik_anggota_harian
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- ============================================================
-- 21 — KPI OTOMATIS dari unggahan upload-post (31 Agu 2026)
-- Sudah diterapkan ke Supabase via MCP (migration
-- laporan_video_sumber_otomatis).
--
-- Video yang diunggah anggota lewat aplikasi otomatis dicatat jadi
-- laporan_video (sumber='otomatis') begitu URL postingannya terbit,
-- sehingga KPI 5x6 naik sendiri TANPA lapor link manual.
-- ============================================================

alter table public.laporan_video
  add column if not exists sumber text not null default 'manual',
  add column if not exists tvrku_post_id bigint;

-- Platform yang URL postingannya SUDAH dicatat jadi laporan (anti dobel
-- hitung walau layar dibuka berkali-kali) + jejak waktu rekonsiliasi.
alter table public.tvrku_post
  add column if not exists kpi_tercatat text[] not null default '{}',
  add column if not exists rekonsiliasi_pada timestamptz;

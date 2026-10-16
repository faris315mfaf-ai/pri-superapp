-- ============================================================
-- 82 — Jangkauan (reach) per video di katalog mesin (16 Okt 2026)
--
-- Supaya angka TV Rakyat Nasional (superuser) & Analisis Video berasal dari
-- SATU sumber — katalog mesin tvr_video_metrik — jangkauan per video ikut
-- disimpan. Angkanya sudah diurai penyegar dari post-analytics upload-post
-- (lib/metrik-post-up: reach/unique_viewers/...), dulu dibuang.
-- NULL = belum ditarik ulang sejak kolom ini ada / platform tidak melaporkan
-- jangkauan. Terisi bertahap mengikuti putaran penyegar (/api/cron/metrik-video).
--
-- JALANKAN SEBELUM DEPLOY (hanya menambah kolom; kode mendeteksi kolomnya).
-- ============================================================

alter table public.tvr_video_metrik
  add column if not exists jangkauan bigint;

notify pgrst, 'reload schema';

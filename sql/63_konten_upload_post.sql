-- ============================================================
-- 63 — MODUL KONTEN DARI KATALOG UPLOAD-POST (7 Okt 2026)
--
-- Galeri "Akun TV Rakyat" & feed "Video terbaru TV Rakyat" kini membaca
-- katalog tvr_video_metrik (diisi dari upload-post oleh cron
-- segar-metrik-video), bukan tarikan langsung / Ayrshare.
--   v_tvr_jumlah_video  — jumlah video & unggahan terakhir per anggota
--                         (badge lingkaran galeri).
--   v_tvr_ringkasan_24j — ringkasan 24 jam seluruh akun anggota
--                         (strip ringkasan modul Konten).
-- ============================================================

create or replace view public.v_tvr_jumlah_video as
select user_id, count(*)::int as jumlah, max(waktu_posting) as terakhir
from public.tvr_video_metrik
where user_id is not null
group by user_id;

create or replace view public.v_tvr_ringkasan_24j as
select
  count(*)::int as video,
  coalesce(sum(tayangan), 0)::bigint as tayangan,
  coalesce(sum(suka), 0)::bigint as suka,
  count(distinct user_id)::int as akun
from public.tvr_video_metrik
where user_id is not null
  and waktu_posting >= now() - interval '24 hours';

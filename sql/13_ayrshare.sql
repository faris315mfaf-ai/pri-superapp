-- ============================================================
-- 13 — Integrasi Ayrshare (unggah sosmed + insight profil)
-- (Sudah diterapkan ke Supabase 2026-08-25 lewat migrasi
--  ayrshare_hasil_unggah. File ini arsip untuk repo.)
--
-- Konteks: sebelum ini tombol "Unggah ke Semua Sosmed" di layar
-- pratinjau TV Rakyat hanyalah ANIMASI — setTimeout yang menaikkan
-- penghitung lalu berkata sukses; tidak ada video yang benar-benar
-- terkirim. Sekarang unggahan berjalan sungguhan lewat Ayrshare
-- (POST /api/tv/unggah), dan hasil per platform disimpan di sini.
--
-- ayrshare_hasil menyimpan balasan apa adanya, termasuk platform
-- yang DITOLAK, supaya kegagalan sebagian tidak hilang diam-diam:
--   [{"platform":"instagram","status":"success",
--     "id":"...","postUrl":"https://...","pesan":""}]
--
-- Catatan status: video hanya naik ke 'SUDAH DIPROSES' bila ADA
-- platform yang benar-benar tayang. Kalau semuanya ditolak, video
-- tetap menunggu tindakan admin.
--
-- Insight profil (GET /api/tv/insight) tidak butuh tabel baru —
-- hasilnya di-cache di pengaturan_sistem dengan kunci
-- 'ayrshare_insight'. Ayrshare menyegarkan angkanya menurut jadwal
-- sendiri (lastUpdated/nextUpdate, sekitar 10 menit), jadi cache
-- ini menahan panggilan berulang yang hanya membakar kuota API
-- untuk angka yang sama persis.
-- ============================================================

alter table public.video_antrian
  add column if not exists ayrshare_hasil jsonb,
  add column if not exists diunggah_pada  timestamptz;

create or replace view public.v_app_video_antrian as
select kode as id,
    judul,
    link,
    jenis,
    video_asli,
    caption_asli,
    judul_overlay,
    highlight,
    status,
    coalesce(link_instagram, ''::text) as link_instagram,
    coalesce(thumbnail_url, ''::text) as thumbnail_url,
    jam_tanggal,
    coalesce(platform_terunggah, array[]::text[]) as platform_terunggah,
    tahap,
    tahap_nama,
    persen,
    hasil_render_url,
    pesan_error,
    sumber_akun,
    cloudinary_url,
    digenerate_oleh,
    caption_platform,
    ayrshare_hasil,
    diunggah_pada
from public.video_antrian v;

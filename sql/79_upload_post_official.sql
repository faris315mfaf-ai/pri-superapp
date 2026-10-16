-- ============================================================
-- 79 — Akun TV Rakyat Official pindah ke upload-post (16 Okt 2026)
--
-- JALANKAN SEBELUM DEPLOY commit "Ayrshare dihapus". Hanya MENAMBAH
-- kolom (aman untuk kode lama yang masih berjalan); pembersihan kolom &
-- data Ayrshare ada di 80_hapus_ayrshare.sql (SESUDAH deploy).
--
-- * video_antrian.unggah_hasil — hasil unggah per platform (pengganti
--   ayrshare_hasil, bentuk sama: [{platform,status,id,postUrl,pesan}]).
-- * jadwal_posting.up_request_id / up_job_id — id unggahan terjadwal di
--   upload-post (pengganti ayrshare_id). upload-post tidak bisa
--   membatalkan jadwal yang sudah dikirim.
-- ============================================================

alter table public.video_antrian
  add column if not exists unggah_hasil jsonb;

alter table public.jadwal_posting
  add column if not exists up_request_id text,
  add column if not exists up_job_id text;

-- Kolom baru ditambahkan di UJUNG view (create or replace hanya boleh menambah di akhir).
-- Daftar kolom = definisi PRODUKSI (diambil 16 Okt 2026 via pg_get_viewdef; repo
-- tertinggal 5 kolom persetujuan..hapus_media_pada yang dulu ditambah langsung).
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
    diunggah_pada,
    persetujuan,
    persetujuan_oleh,
    sumber_upload,
    diupload_oleh,
    hapus_media_pada,
    unggah_hasil
from public.video_antrian v;

notify pgrst, 'reload schema';

-- ============================================================
-- 12 — Caption per platform untuk unggahan TV Rakyat
-- (Sudah diterapkan ke Supabase 2026-08-25 lewat migrasi
--  caption_per_platform_video. File ini arsip untuk repo.)
--
-- Tiap platform membatasi caption dengan aturan berbeda:
--   Instagram 2.200 (±125 pertama tampil sebelum "...more"),
--   TikTok 2.200, YouTube Short 5.000, Facebook Page 63.206,
--   X 280 standar / 25.000 Premium, Threads 500.
-- Bentuk data: jsonb {"instagram": "...", "twitter": "..."} —
-- hanya platform yang disunting admin yang terisi; sisanya
-- memakai caption_asli. Batas dijaga dua lapis: layar pratinjau
-- (tombol unggah terkunci) dan PATCH /api/video-antrian/<kode>
-- (pemangkasan paksa).
--
-- Catatan rilis yang sama (tanpa perubahan skema):
-- * Jabatan struktur partai (kolom app_user.jabatan yang sudah
--   ada) kini diatur dari panel Kelola Pengguna, dibatasi ke:
--   Ketua Umum, Wakil Ketua Umum, Direktur Eksekutif, Wakil
--   Direktur Eksekutif, Sekretaris Jendral, Wakil Sekretaris
--   Jendral, HR, Pengawas. Validasi di /api/pengguna.
-- * Foto absensi dikompres aplikasi ke ≤100 KB; penjaga server
--   di /api/absensi diturunkan ke 150 KB.
-- ============================================================

alter table public.video_antrian
  add column if not exists caption_platform jsonb;

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
    caption_platform
from public.video_antrian v;

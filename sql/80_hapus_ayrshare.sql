-- ============================================================
-- 80 — Hapus Ayrshare dari sistem (16 Okt 2026)
--
-- JALANKAN SESUDAH DEPLOY commit "Ayrshare dihapus" berhasil (kode baru
-- tidak lagi membaca kolom-kolom di bawah). TIDAK BISA DIKEMBALIKAN:
-- riwayat unggah lama akun Official (ayrshare_hasil), id jadwal Ayrshare,
-- cache insight Ayrshare, dan profil Ayrshare anggota/QC dibuang.
-- Keputusan pemilik 16 Okt 2026: data lama Ayrshare ikut dihapus.
--
-- Anggota yang dulu tersambung lewat Ayrshare mendapat notifikasi untuk
-- menghubungkan ulang akun sosmednya lewat upload-post (TVR Saya →
-- Hubungkan Akun).
-- ============================================================

begin;

-- 1. Kabari anggota yang profil sosmednya masih Ayrshare (sebelum profilnya dibuang).
insert into public.notifikasi (kode, judul, isi, kategori, target, untuk_user, dibaca)
select distinct on (sp.user_id)
  'hubungkan-ulang-upload-post-' || sp.user_id,
  'Hubungkan ulang akun sosmed Anda',
  'Layanan Ayrshare dihentikan. Buka TV Rakyat Saya lalu tekan "Hubungkan Akun" untuk menyambungkan ulang akun sosmed Anda lewat upload-post.',
  'SISTEM',
  'tvrku',
  sp.user_id,
  false
from public.sosmed_profile sp
where sp.penyedia = 'ayrshare'
  and sp.user_id is not null
on conflict (kode) do nothing;

-- 2. Profil Ayrshare (anggota & QC) dibuang: tampil "belum terhubung", wajib hubungkan ulang.
delete from public.sosmed_profile where penyedia = 'ayrshare';

-- 3. Kolom Ayrshare. View dibuat ulang tanpa ayrshare_hasil (drop kolom view wajib drop view).
drop view if exists public.v_app_video_antrian;
create view public.v_app_video_antrian as
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
    diunggah_pada,
    unggah_hasil
from public.video_antrian v;
-- Sama seperti 07_tv_rakyat_pipeline.sql (view dibuat ulang = setelan & izin lama hilang).
alter view public.v_app_video_antrian set (security_invoker = true);
grant select on public.v_app_video_antrian to service_role;

alter table public.video_antrian drop column if exists ayrshare_hasil;
alter table public.jadwal_posting drop column if exists ayrshare_id;

-- 4. Cache & penanda Ayrshare.
delete from public.pengaturan_sistem
where kunci like 'ayrshare\_%' escape '\'      -- cache insight/detail Ayrshare
   or kunci like 'tvnas\_official\_%' escape '\' -- cache lama dashboard TV Nasional (dari Ayrshare)
   or kunci = 'sinkron_komen_menit';              -- jadwal cek komentar (pemeriksaan komentar dimatikan)
alter table public.qc_analisis_riwayat alter column sumber set default 'manual';

commit;

notify pgrst, 'reload schema';

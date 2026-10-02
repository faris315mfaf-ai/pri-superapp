-- 2 Okt 2026: video TVR Saya > 50 MB tidak lagi dikompres lewat Cloudinary
-- (akun Cloudinary dinonaktifkan: "cloud_name is disabled"). Video disimpan
-- apa adanya di bucket "tvrku" sampai 100 MB — sama dengan FILE_SIZE_LIMIT
-- Supabase sendiri. Idempoten.
update storage.buckets
set file_size_limit = 104857600
where id = 'tvrku'
  and (file_size_limit is null or file_size_limit < 104857600);

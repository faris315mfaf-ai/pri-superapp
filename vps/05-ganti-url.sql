-- =====================================================================
-- LANGKAH 5 — Mengganti alamat berkas lama (Supabase Cloud) menjadi
-- alamat VPS di dalam database.
--
-- Kenapa perlu: 1.509 baris menyimpan URL lengkap berkas, misalnya
-- kolom video_url di tvrku_post. Karena jalur berkas di VPS dibuat
-- SAMA PERSIS oleh langkah 4, cukup nama domainnya yang ditukar.
--
-- JALANKAN SETELAH langkah 4 selesai (berkas sudah ada di VPS),
-- di dalam satu transaksi — kalau ada yang gagal, semua batal.
--
-- CARA PAKAI (root, di VPS, dari folder /opt/pri/supabase):
--   . /opt/pri/kunci.env
--   docker compose exec -T db psql "postgresql://postgres:$PG_PASS@localhost:5432/postgres" \
--     -v baru=https://db.domainanda.com -f - < /opt/pri/skrip/05-ganti-url.sql
-- =====================================================================

\set lama 'https://pichnkyjepsirpclofhs.supabase.co'
\set ON_ERROR_STOP on

begin;

update public.tvrku_post
   set video_url = replace(video_url, :'lama', :'baru')
 where video_url like '%' || :'lama' || '%';

update public.studio_proyek_item
   set sumber_url = replace(sumber_url, :'lama', :'baru')
 where sumber_url like '%' || :'lama' || '%';

update public.studio_proyek
   set sumber_url = replace(sumber_url, :'lama', :'baru')
 where sumber_url like '%' || :'lama' || '%';

update public.app_user
   set avatar_url = replace(avatar_url, :'lama', :'baru')
 where avatar_url like '%' || :'lama' || '%';

update public.tvr_banned
   set bukti_url = replace(bukti_url, :'lama', :'baru')
 where bukti_url like '%' || :'lama' || '%';

update public.profil_foto
   set url = replace(url, :'lama', :'baru')
 where url like '%' || :'lama' || '%';

-- Alamat aplikasi yang dipakai trigger notifikasi dorong tetap dicek:
-- nilainya menunjuk ke aplikasi (Vercel), bukan ke Supabase, jadi
-- seharusnya TIDAK berubah. Ditampilkan supaya bisa dipastikan.
select kunci, nilai from public.pengaturan_sistem where kunci in ('url_aplikasi');

-- Sisa alamat lama harus 0 di semua kolom.
select 'tvrku_post' as tabel, count(*) as sisa_alamat_lama from public.tvrku_post where video_url like '%' || :'lama' || '%'
union all select 'studio_proyek_item', count(*) from public.studio_proyek_item where sumber_url like '%' || :'lama' || '%'
union all select 'studio_proyek', count(*) from public.studio_proyek where sumber_url like '%' || :'lama' || '%'
union all select 'app_user', count(*) from public.app_user where avatar_url like '%' || :'lama' || '%'
union all select 'tvr_banned', count(*) from public.tvr_banned where bukti_url like '%' || :'lama' || '%'
union all select 'profil_foto', count(*) from public.profil_foto where url like '%' || :'lama' || '%';

commit;

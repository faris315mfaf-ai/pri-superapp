-- ============================================================
-- 40_role_superadmin.sql (10 Sep 2026)
--
-- Peran baru "superadmin": akun operasional pusat yang tersembunyi
-- seperti master, dengan Dashboard & Konten penuh tanpa modul TV Rakyat
-- Official / chat / robot / perintah suara (lihat src/lib/peran.ts).
--
-- Batasan CHECK lama menolak nilai baru, jadi dilonggarkan. Nilai lama
-- tetap dipertahankan supaya baris yang ada tidak pernah melanggar.
-- ============================================================
alter table public.app_user drop constraint if exists app_user_role_sah;
alter table public.app_user add constraint app_user_role_sah
  check (role = any (array['master', 'super_admin', 'admin_hr', 'admin_tv', 'ketua', 'anggota', 'superadmin']));

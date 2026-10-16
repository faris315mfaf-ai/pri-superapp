-- ============================================================
-- 81 — Peran SUPERUSER (16 Okt 2026): mode lihat.
--
-- Superuser melihat seluruh aplikasi seperti superadmin (sesi memetakannya
-- ke master + penanda), tetapi SEMUA perubahan data ditolak di pintu depan
-- (src/proxy.ts + src/lib/hanya-lihat.ts). Akun dibuat master lewat
-- Panel Master → Akun Baru → peran "Superuser (mode lihat)".
--
-- JALANKAN SEBELUM DEPLOY (hanya melonggarkan CHECK; aman untuk kode lama).
-- ============================================================

alter table public.app_user drop constraint if exists app_user_role_sah;
alter table public.app_user add constraint app_user_role_sah
  check (role = any (array['master', 'super_admin', 'admin_hr', 'admin_tv', 'ketua', 'anggota', 'superadmin', 'superuser']));

-- ============================================================
-- sql/51 — KATEGORI "SELESAI" (13 Sep 2026)
--
-- Kategori untuk acara tertentu suatu saat SELESAI: kreator tidak perlu
-- (dan tidak boleh) mengunggah video untuknya lagi. Tapi datanya —
-- laporan, unggahan, angka per video — WAJIB tetap ada untuk laporan
-- ke pengiklan/pimpinan.
--
-- Kenapa kolom sendiri, bukan `aktif=false`: nonaktif berarti "jangan
-- dipakai" tanpa alasan (salah ketik, ganda), sedangkan selesai punya
-- arti tegas: acaranya sudah lewat, dan kategorinya tetap harus tampil
-- di insight dengan tanda "selesai". Dua hal itu tidak boleh tercampur.
-- ============================================================
alter table public.keyword_wajib
  add column if not exists selesai      boolean not null default false,
  add column if not exists selesai_pada timestamptz;

notify pgrst, 'reload schema';

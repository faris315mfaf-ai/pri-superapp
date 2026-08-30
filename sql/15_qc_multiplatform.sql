-- ============================================================
-- sql/15 — QC multi-platform (fitur 1.22.x/2)
--
-- Rebuild deteksi komentar QC agar mencakup X (twitter), Threads,
-- dan YouTube, di samping Instagram & TikTok yang sudah jalan.
--
-- Satu-satunya penghalang di sisi DATABASE adalah CHECK constraint
-- di `akun_sosmed_user` yang dulu hanya mengizinkan instagram/tiktok.
-- Tabel lain (akun_wajib, postingan, komentar, rekap) menyimpan
-- kolom `platform` sebagai teks bebas tanpa constraint, jadi TIDAK
-- perlu diubah — mereka sudah menerima platform apa pun.
--
-- Facebook SENGAJA tidak dimasukkan: identitas pengomentar di
-- Facebook berupa nama tampilan, bukan @username stabil yang bisa
-- didaftarkan kader, sehingga komentar tak bisa dicocokkan ke orang.
--
-- Aman & additif: hanya MEMPERLONGGAR nilai yang diizinkan; baris
-- lama (instagram/tiktok) tetap sah, tidak ada data yang tersentuh.
-- Idempoten: DROP IF EXISTS lalu ADD.
-- ============================================================

ALTER TABLE akun_sosmed_user
  DROP CONSTRAINT IF EXISTS akun_sosmed_platform_sah;

ALTER TABLE akun_sosmed_user
  ADD CONSTRAINT akun_sosmed_platform_sah
  CHECK (platform = ANY (ARRAY['instagram', 'tiktok', 'twitter', 'threads', 'youtube']));

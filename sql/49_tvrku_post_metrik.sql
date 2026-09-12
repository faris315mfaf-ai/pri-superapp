-- ============================================================
-- sql/49 — METRIK PER POSTINGAN DARI UPLOAD-POST (12 Sep 2026)
--
-- Untuk pelacakan per postingan di modul TV Rakyat Nasional: suka,
-- komentar, dibagikan, tayangan, impresi, jangkauan — LANGSUNG dari
-- sistem upload-post (post-analytics) untuk video yang diunggah lewat
-- SuperApp, dikelompokkan per kategori.
--
-- Disimpan di baris unggahannya sendiri (tvrku_post):
--   metrik        — hasil urai per platform, bentuk seragam aplikasi.
--   metrik_mentah — jawaban upload-post APA ADANYA. Sengaja disimpan:
--                   kalau pengurai salah membaca satu kolom, angkanya
--                   bisa diperbaiki dari data yang sudah ada tanpa
--                   memanggil upload-post lagi.
--   metrik_pada   — kapan terakhir ditarik; dasar penyegaran bertahap.
-- ============================================================
alter table public.tvrku_post
  add column if not exists metrik jsonb,
  add column if not exists metrik_mentah jsonb,
  add column if not exists metrik_pada timestamptz;

-- Penyegar mencari "yang paling lama tidak ditarik" per kategori.
create index if not exists idx_tvrku_post_metrik_pada
  on public.tvrku_post (metrik_pada)
  where request_id is not null;

notify pgrst, 'reload schema';

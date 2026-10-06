-- ============================================================
-- 62 — PENGIRIM KOIN / TOKEN MERAH PUTIH (7 Okt 2026)
--
-- Riwayat dompet (Token Merah Putih, desain baru) menampilkan "dari
-- siapa" tiap transfer masuk. Pemberian koin per video (api/koin/kelola)
-- dan kiriman master lewat chat kini mencatat pengirimnya. Transaksi lama
-- tetap kosong (null) — riwayatnya tampil tanpa nama pengirim.
-- ============================================================

alter table public.koin_transaksi
  add column if not exists pemberi_id bigint references public.app_user(id) on delete set null;

comment on column public.koin_transaksi.pemberi_id is
  'Pengirim transfer (pengelola koin / master). Null = otomatis/sistem atau transaksi sebelum 7 Okt 2026.';

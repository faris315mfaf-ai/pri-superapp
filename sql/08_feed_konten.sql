-- =====================================================================
-- PRI SUPERAPP — FEED KONTEN UNTUK ANGGOTA BIASA
-- Jalankan SETELAH 06_integrasi_app.sql dan 07_tv_rakyat_pipeline.sql.
--
-- Tujuan: halaman "Konten" milik anggota biasa menampilkan postingan
-- Instagram TERBARU dari akun resmi partai (dpp.pri, tvrakyat.official,
-- muhammad.nazaruddin_), disegarkan workflow n8n kira-kira 1 jam sekali.
--
-- KENAPA TABEL BARU, BUKAN NUMPANG DI `postingan`:
--   (a) `postingan` adalah bahan hitung KEPATUHAN — tiap baris di sana
--       melahirkan satu baris `rekap` per kader ("wajib komentar").
--       Menambah postingan feed ke situ berarti menciptakan KEWAJIBAN
--       PALSU dan langsung merusak angka kepatuhan seluruh kader.
--   (b) Scraper QC sengaja hanya memungut postingan yang jatuh di dalam
--       jendela sesi QC (17:00–16:00 WIB). Feed anggota butuh "postingan
--       terbaru apa adanya", tanpa peduli jendela itu.
-- Jadi kedua kebutuhan itu dipisah tabelnya supaya tidak saling merusak.
--
-- Aman dijalankan berulang kali (idempoten).
-- =====================================================================


-- =====================================================================
-- BAGIAN 1 — TABEL feed_konten
-- Diisi/di-upsert workflow n8n; hanya DIBACA oleh aplikasi.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.feed_konten (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_postingan     text        NOT NULL,             -- shortcode/id dari scraper
  platform         text        NOT NULL DEFAULT 'instagram',
  akun_username    text        NOT NULL,             -- dpp.pri | tvrakyat.official | muhammad.nazaruddin_
  akun_nama        text        NOT NULL DEFAULT '',  -- label tampilan, mis. 'DPP PRI'
  url_postingan    text        NOT NULL DEFAULT '',
  caption          text        NOT NULL DEFAULT '',
  thumbnail_url    text        NOT NULL DEFAULT '',
  jumlah_like      integer     NOT NULL DEFAULT 0,
  jumlah_komentar  integer     NOT NULL DEFAULT 0,
  waktu_posting    timestamptz,
  diperbarui_pada  timestamptz NOT NULL DEFAULT now(),
  -- Kunci upsert n8n: satu postingan hanya boleh punya satu baris per
  -- platform. n8n memanggilnya lewat ?on_conflict=platform,id_postingan
  CONSTRAINT feed_konten_platform_post_unik UNIQUE (platform, id_postingan)
);

-- Pola baca aplikasi selalu "postingan terbaru milik akun X", jadi
-- indeksnya dibuat persis mengikuti pola itu.
CREATE INDEX IF NOT EXISTS idx_feed_konten_akun_waktu
  ON public.feed_konten (akun_username, waktu_posting DESC);


-- =====================================================================
-- BAGIAN 2 — VIEW UNTUK APLIKASI
-- Nama kolom di sini sudah sesuai yang dipakai /api/konten, supaya API
-- route tidak perlu memetakan apa pun secara manual.
-- =====================================================================
CREATE OR REPLACE VIEW public.v_app_feed_konten AS
SELECT
  f.id_postingan,
  LOWER(f.platform)                          AS platform,
  LOWER(f.akun_username)                     AS akun_username,
  COALESCE(f.akun_nama, '')                  AS akun_nama,
  COALESCE(f.url_postingan, '')              AS url_postingan,
  COALESCE(f.caption, '')                    AS caption,
  COALESCE(f.thumbnail_url, '')              AS thumbnail_url,
  f.jumlah_like,
  f.jumlah_komentar,
  f.waktu_posting,
  -- Umur postingan dihitung DI DATABASE supaya selalu segar; kalau
  -- dihitung di ponsel, angkanya ikut membeku saat layar dibiarkan.
  public.waktu_relatif(f.waktu_posting)      AS waktu_relatif,
  f.diperbarui_pada
FROM public.feed_konten f
ORDER BY f.waktu_posting DESC NULLS LAST;

-- Tanpa ini view berjalan dengan hak akses PEMBUATNYA dan mengabaikan
-- RLS pemanggil — ditandai ERROR oleh Supabase Advisor.
ALTER VIEW public.v_app_feed_konten SET (security_invoker = true);


-- =====================================================================
-- BAGIAN 3 — ROW LEVEL SECURITY
-- Pola sama seperti tabel `postingan` ("baca publik postingan"):
-- siapa pun boleh MEMBACA, menulis hanya lewat service_role (n8n &
-- server Next.js) yang memang mem-bypass RLS.
-- =====================================================================
ALTER TABLE public.feed_konten ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baca publik feed_konten" ON public.feed_konten;
CREATE POLICY "baca publik feed_konten" ON public.feed_konten
  FOR SELECT USING (true);


-- =====================================================================
-- BAGIAN 4 — REALTIME
-- Dibungkus pengecekan supaya tidak error bila dijalankan ulang, dan
-- tidak error pula di Postgres lokal yang tidak punya publication ini.
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = 'feed_konten'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.feed_konten;
    END IF;
  END IF;
END $$;

-- SELESAI.
-- Catatan untuk workflow n8n:
--   POST /rest/v1/feed_konten?on_conflict=platform,id_postingan
--   Header: Prefer: resolution=merge-duplicates,return=minimal
--   Sertakan diperbarui_pada = now() di setiap payload supaya aplikasi
--   bisa menampilkan "Diperbarui X menit lalu" dengan benar.

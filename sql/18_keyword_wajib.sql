-- ============================================================
-- sql/18 — Keyword wajib laporan video (fitur 1.22.x/keyword)
--
-- (1) keyword_wajib: Pimpinan Redaksi TV Rakyat menetapkan keyword/tema
--     yang WAJIB diangkat seluruh anggota dalam video laporannya
--     (mis. "BPJS"). Jadi acuan bersama.
-- (2) laporan_video.keyword: tiap laporan video anggota kini menyertakan
--     keyword (dipilih dari daftar Pimred) — dipakai sebagai kunci
--     pencarian utama.
--
-- Aman & idempoten. RLS on tanpa policy publik (akses via route server).
-- ============================================================

CREATE TABLE IF NOT EXISTS keyword_wajib (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  keyword        text NOT NULL,
  aktif          boolean NOT NULL DEFAULT true,
  dibuat_oleh_id bigint REFERENCES app_user(id),
  dibuat_pada    timestamptz NOT NULL DEFAULT now()
);

-- Satu keyword unik (case-insensitive) supaya tak dobel.
CREATE UNIQUE INDEX IF NOT EXISTS idx_keyword_wajib_unik
  ON keyword_wajib (lower(keyword));

ALTER TABLE keyword_wajib ENABLE ROW LEVEL SECURITY;

-- Kolom keyword pada laporan video (opsional; laporan lama tetap sah).
ALTER TABLE laporan_video
  ADD COLUMN IF NOT EXISTS keyword text;

CREATE INDEX IF NOT EXISTS idx_laporan_video_keyword
  ON laporan_video (lower(keyword));

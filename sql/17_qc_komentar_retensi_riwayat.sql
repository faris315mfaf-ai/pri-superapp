-- ============================================================
-- sql/17 — QC: retensi komentar 2 hari + riwayat update Ayrshare
-- (fitur 1.22.x/3-perbaikan)
--
-- (a) komentar jadi "penyimpanan sementara": tambah kolom waktu masuk
--     `dibuat_pada` supaya bisa dihapus otomatis setelah 2 hari (48 jam)
--     — meniru pola retensi media video (hapus_media_pada). Dashboard
--     kepatuhan TIDAK terpengaruh: angka comply ada di tabel `rekap`
--     yang terpisah; hanya daftar komentar mentah yang menyusut.
--
-- (b) `qc_analisis_riwayat`: catat SETIAP kali Ayrshare memperbarui
--     komentar (waktu + jumlah postingan/komentar/comply) supaya ada
--     riwayat "kapan komentar terakhir di-update".
--
-- Aman & idempoten (IF NOT EXISTS). RLS on tanpa policy publik: akses
-- lewat route server (service role).
-- ============================================================

-- (a) retensi komentar --------------------------------------------------
ALTER TABLE komentar
  ADD COLUMN IF NOT EXISTS dibuat_pada timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_komentar_dibuat_pada ON komentar (dibuat_pada);

-- (b) riwayat run analisis Ayrshare ------------------------------------
CREATE TABLE IF NOT EXISTS qc_analisis_riwayat (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dijalankan_pada timestamptz NOT NULL DEFAULT now(),
  periode         text,
  sumber          text NOT NULL DEFAULT 'ayrshare',
  oleh_user_id    bigint,
  postingan       int NOT NULL DEFAULT 0,
  komentar        int NOT NULL DEFAULT 0,
  comply          int NOT NULL DEFAULT 0,
  gagal_cek       int NOT NULL DEFAULT 0,
  data_sampai     timestamptz,
  selesai         boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_qc_riwayat_waktu
  ON qc_analisis_riwayat (dijalankan_pada DESC);

ALTER TABLE qc_analisis_riwayat ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- sql/16 — Jadwal Posting TV Rakyat Official (fitur 1.22.x/3)
--
-- Menyimpan postingan yang DIJADWALKAN tayang di masa depan lewat
-- Ayrshare. Ayrshare sendiri yang menerbitkan pada waktunya (kolom
-- scheduleDate), jadi TIDAK perlu cron di aplikasi — tabel ini hanya
-- catatan agar tim bisa melihat daftar jadwal, statusnya, dan
-- membatalkannya.
--
-- Aman diterapkan berulang (IF NOT EXISTS). RLS dinyalakan tanpa
-- policy publik: seluruh akses lewat route server (service role yang
-- mem-bypass RLS), kunci publishable TIDAK boleh membacanya.
-- ============================================================

CREATE TABLE IF NOT EXISTS jadwal_posting (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dibuat_oleh_id  bigint NOT NULL REFERENCES app_user(id),
  caption         text NOT NULL DEFAULT '',
  media_url       text,                       -- URL Cloudinary (publik)
  media_public_id text,                       -- utk hapus dari Cloudinary bila dibatalkan
  is_video        boolean NOT NULL DEFAULT true,
  platforms       text[] NOT NULL,            -- instagram/tiktok/youtube/facebook/twitter/threads
  judul_youtube   text,
  jadwal_pada     timestamptz NOT NULL,       -- waktu tayang (disimpan UTC)
  status          text NOT NULL DEFAULT 'terjadwal'
                    CHECK (status IN ('terjadwal', 'terkirim', 'gagal', 'dibatalkan')),
  ayrshare_id     text,                       -- id Ayrshare, dipakai membatalkan
  hasil           jsonb,                      -- ringkasan balasan Ayrshare per platform
  error           text,
  dibuat_pada     timestamptz NOT NULL DEFAULT now(),
  diperbarui_pada timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jadwal_posting_jadwal
  ON jadwal_posting (jadwal_pada DESC);
CREATE INDEX IF NOT EXISTS idx_jadwal_posting_status
  ON jadwal_posting (status, jadwal_pada DESC);

ALTER TABLE jadwal_posting ENABLE ROW LEVEL SECURITY;

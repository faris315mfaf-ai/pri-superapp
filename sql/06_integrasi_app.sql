-- =====================================================================
-- PRI SUPERAPP — INTEGRASI APLIKASI KE SUPABASE
-- Jalankan SETELAH 01_schema.sql, 02_seed.sql, 03_kompat_views.sql,
-- dan 05_sync_dari_sheets.sql (skema QC Sosmed yang sudah terpasang).
--
-- PRINSIP UTAMA: workflow n8n yang SUDAH JALAN tidak boleh terganggu.
--   - Kolom baru hanya DITAMBAH (ADD COLUMN IF NOT EXISTS), tidak ada
--     kolom lama yang diubah/dihapus.
--   - Perbedaan "bahasa" antara n8n dan aplikasi diselesaikan lewat
--     VIEW penerjemah (v_app_*), bukan dengan mengubah tabel.
--
-- Aman dijalankan berulang kali (idempoten).
-- =====================================================================


-- =====================================================================
-- BAGIAN 1 — PERLUASAN TABEL LAMA (tambah kolom yang dibutuhkan aplikasi)
-- Semua nullable / punya DEFAULT, jadi INSERT dari n8n yang tidak
-- menyebut kolom-kolom ini tetap berhasil tanpa perubahan apa pun.
-- =====================================================================

-- Foto profil akun wajib (ditampilkan di kartu akun pada layar QC)
ALTER TABLE public.akun_wajib
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- Wilayah/DPC kader (ditampilkan di daftar kader & detail postingan)
ALTER TABLE public.kader
  ADD COLUMN IF NOT EXISTS wilayah text;

-- Metadata postingan untuk kartu di aplikasi (caption, gambar, like)
ALTER TABLE public.postingan
  ADD COLUMN IF NOT EXISTS caption_asli  text;
ALTER TABLE public.postingan
  ADD COLUMN IF NOT EXISTS thumbnail_url text;
ALTER TABLE public.postingan
  ADD COLUMN IF NOT EXISTS jumlah_like   integer NOT NULL DEFAULT 0;


-- =====================================================================
-- BAGIAN 2 — FUNGSI BANTU
-- =====================================================================

-- Ubah timestamp menjadi teks relatif Bahasa Indonesia ("5 menit lalu").
-- Dipakai view notifikasi & berita supaya aplikasi tidak perlu menghitung.
CREATE OR REPLACE FUNCTION public.waktu_relatif(ts timestamptz)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN ts IS NULL                          THEN ''
    WHEN now() - ts < interval '1 minute'    THEN 'baru saja'
    WHEN now() - ts < interval '1 hour'      THEN
      FLOOR(EXTRACT(EPOCH FROM now() - ts) / 60)::int || ' menit lalu'
    WHEN now() - ts < interval '1 day'       THEN
      FLOOR(EXTRACT(EPOCH FROM now() - ts) / 3600)::int || ' jam lalu'
    WHEN now() - ts < interval '30 days'     THEN
      FLOOR(EXTRACT(EPOCH FROM now() - ts) / 86400)::int || ' hari lalu'
    ELSE TO_CHAR(ts AT TIME ZONE 'Asia/Jakarta', 'DD Mon YYYY')
  END;
$$;

-- Kelompok tampilan notifikasi berdasarkan TANGGAL WIB (bukan selisih jam),
-- supaya "Kemarin" berarti kemarin menurut kalender Jakarta.
CREATE OR REPLACE FUNCTION public.kelompok_waktu(ts timestamptz)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN ts IS NULL THEN 'LEBIH_LAMA'
    WHEN (ts AT TIME ZONE 'Asia/Jakarta')::date
       = (now() AT TIME ZONE 'Asia/Jakarta')::date               THEN 'HARI_INI'
    WHEN (ts AT TIME ZONE 'Asia/Jakarta')::date
       = (now() AT TIME ZONE 'Asia/Jakarta')::date - 1           THEN 'KEMARIN'
    ELSE 'LEBIH_LAMA'
  END;
$$;


-- =====================================================================
-- BAGIAN 3 — TABEL BARU: TV RAKYAT
-- =====================================================================

-- Antrian & riwayat video yang diproses ulang lalu diunggah ke sosmed.
-- Diisi/diubah oleh workflow n8n TV Rakyat; dibaca aplikasi.
CREATE TABLE IF NOT EXISTS public.video_antrian (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kode               text NOT NULL UNIQUE,        -- kunci upsert dari n8n
  judul              text NOT NULL DEFAULT '',
  link               text,                        -- link sumber (TikTok/IG)
  jenis              text NOT NULL DEFAULT 'TIKTOK',   -- TIKTOK | INSTAGRAM
  video_asli         text,                        -- link doksli hasil unduh
  caption_asli       text,
  judul_overlay      text,
  highlight          text,
  status             text NOT NULL DEFAULT 'MENUNGGU DOKSLI',
  link_instagram     text,
  thumbnail_url      text,
  jam_tanggal        timestamptz NOT NULL DEFAULT now(),
  platform_terunggah text[] NOT NULL DEFAULT '{}',
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_video_status  ON public.video_antrian(status);
CREATE INDEX IF NOT EXISTS idx_video_waktu   ON public.video_antrian(jam_tanggal DESC);

DROP TRIGGER IF EXISTS trg_video_updated ON public.video_antrian;
CREATE TRIGGER trg_video_updated BEFORE UPDATE ON public.video_antrian
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Berita terbaru hasil scraping Nusantara TV (bahan konten TV Rakyat).
CREATE TABLE IF NOT EXISTS public.berita (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kode           text NOT NULL UNIQUE,            -- kunci upsert dari n8n
  judul          text NOT NULL DEFAULT '',
  sumber         text NOT NULL DEFAULT '',
  platform_asal  text NOT NULL DEFAULT 'instagram',
  link_video     text,
  thumbnail_url  text,
  ringkasan      text,
  waktu_terbit   timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_berita_waktu ON public.berita(waktu_terbit DESC);


-- =====================================================================
-- BAGIAN 4 — TABEL BARU: APLIKASI (notifikasi & akun login)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.notifikasi (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kode       text UNIQUE,                          -- opsional, kunci upsert n8n
  judul      text NOT NULL,
  isi        text NOT NULL DEFAULT '',
  kategori   text NOT NULL DEFAULT 'SISTEM',       -- QC | VIDEO | SISTEM
  target     text,                                 -- qc | tv | dashboard | NULL
  dibaca     boolean NOT NULL DEFAULT false,
  dibuat_pada timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_waktu ON public.notifikasi(dibuat_pada DESC);

-- Akun login aplikasi. Kata sandi disimpan sebagai HASH (scrypt) yang
-- dihitung di sisi server Next.js — tidak pernah menyimpan teks asli.
CREATE TABLE IF NOT EXISTS public.app_user (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  nama          text NOT NULL,
  role          text NOT NULL DEFAULT 'admin_hr',  -- super_admin|admin_hr|admin_tv
  jabatan       text NOT NULL DEFAULT '',
  avatar_url    text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  aktif         boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);


-- =====================================================================
-- BAGIAN 5 — VIEW PENERJEMAH UNTUK APLIKASI (v_app_*)
--
-- Nama & tipe kolom di bawah ini sengaja dibuat PERSIS sama dengan
-- src/types/index.ts di aplikasi, supaya API route cukup SELECT * tanpa
-- pemetaan manual. Semua perbedaan istilah n8n <-> aplikasi diselesaikan
-- DI SINI, bukan di kode aplikasi dan bukan dengan mengubah n8n.
-- =====================================================================

-- --- Akun wajib -------------------------------------------------------
-- Aplikasi memakai `akun_wajib` (username) & `nama_tampilan`.
CREATE OR REPLACE VIEW public.v_app_akun_wajib AS
SELECT
  'aw-' || a.id::text                       AS id,
  a.username                                AS akun_wajib,
  a.nama_akun                               AS nama_tampilan,
  LOWER(a.platform)                         AS platform,
  COALESCE(a.avatar_url, '')                AS avatar_url,
  a.aktif,
  a.nama_akun                               AS nama_akun_n8n  -- kunci join internal
FROM public.akun_wajib a;

-- --- Kader ------------------------------------------------------------
-- Aplikasi menampilkan SATU ig_username per orang. Akun 'Partai'
-- diprioritaskan; kalau tidak ada, dipakai akun terlama (id terkecil).
CREATE OR REPLACE VIEW public.v_app_kader AS
SELECT DISTINCT ON (k.id)
  'kd-' || k.id::text                       AS id,
  k.nama_kader,
  COALESCE(k.wilayah, '')                   AS wilayah,
  COALESCE(k.jabatan, '')                   AS jabatan,
  COALESCE(k.nomor_wa, '')                  AS nomor_wa,
  COALESCE(ak.ig_username, '')              AS ig_username,
  k.aktif
FROM public.kader k
LEFT JOIN public.akun_kader ak
       ON ak.kader_id = k.id AND ak.aktif = true
ORDER BY k.id,
         (ak.jenis_akun = 'Partai') DESC NULLS LAST,
         ak.id ASC;

-- --- Postingan --------------------------------------------------------
-- PENTING: n8n menyimpan NAMA TAMPILAN akun (mis. 'tv rakyat') di kolom
-- postingan.akun_wajib, sedangkan aplikasi memakai USERNAME
-- (mis. 'tvrakyat.official'). View ini menerjemahkannya lewat join.
-- COALESCE dipakai supaya postingan dari akun yang belum terdaftar
-- (fallback n8n = ownerUsername mentah) tetap muncul, tidak hilang.
CREATE OR REPLACE VIEW public.v_app_postingan AS
SELECT
  p.id_postingan,
  COALESCE(a.username, p.akun_wajib)        AS akun_wajib,
  LOWER(p.platform)                         AS platform,
  COALESCE(p.caption_asli, '')              AS caption_asli,
  COALESCE(p.thumbnail_url, '')             AS thumbnail_url,
  COALESCE(p.url_postingan, '')             AS link_postingan,
  p.waktu_posting,
  p.jumlah_like,
  p.total_komen_publik                      AS jumlah_komentar,
  p.periode
FROM public.postingan p
LEFT JOIN public.akun_wajib a ON a.nama_akun = p.akun_wajib;

-- --- Komentar ---------------------------------------------------------
CREATE OR REPLACE VIEW public.v_app_komentar AS
SELECT
  k.id_komentar,
  k.id_postingan,
  k.username_komentator                     AS ig_username,
  k.nama_kader,                             -- NULL = warga biasa, bukan kader
  COALESCE(k.isi_komentar, '')              AS isi_komentar,
  k.waktu_komentar
FROM public.komentar k;

-- --- Rekap ------------------------------------------------------------
-- n8n menyimpan kepatuhan sebagai teks status ('Comply'), aplikasi
-- memakai boolean `sudah_komentar`. Diterjemahkan di sini.
CREATE OR REPLACE VIEW public.v_app_rekap AS
SELECT
  r.id_unik,
  r.periode,
  r.nama_kader,
  LOWER(r.platform)                         AS platform,
  COALESCE(a.username, r.akun_wajib)        AS akun_wajib,
  r.id_postingan,
  (r.status = 'Comply')                     AS sudah_komentar,
  r.jumlah_komentar,
  COALESCE(r.nomor_wa, '')                  AS nomor_wa   -- dipakai tombol WA
FROM public.rekap r
LEFT JOIN public.akun_wajib a ON a.nama_akun = r.akun_wajib;

-- --- Video antrian ----------------------------------------------------
CREATE OR REPLACE VIEW public.v_app_video_antrian AS
SELECT
  v.kode                                    AS id,
  v.judul,
  COALESCE(v.link, '')                      AS link,
  v.jenis,
  COALESCE(v.video_asli, '')                AS video_asli,
  COALESCE(v.caption_asli, '')              AS caption_asli,
  COALESCE(v.judul_overlay, '')             AS judul_overlay,
  COALESCE(v.highlight, '')                 AS highlight,
  v.status,
  COALESCE(v.link_instagram, '')            AS link_instagram,
  COALESCE(v.thumbnail_url, '')             AS thumbnail_url,
  v.jam_tanggal,
  v.platform_terunggah
FROM public.video_antrian v;

-- --- Berita -----------------------------------------------------------
CREATE OR REPLACE VIEW public.v_app_berita AS
SELECT
  b.kode                                    AS id,
  b.judul,
  b.sumber,
  public.waktu_relatif(b.waktu_terbit)      AS waktu_relatif,
  LOWER(b.platform_asal)                    AS platform_asal,
  COALESCE(b.link_video, '')                AS link_video,
  COALESCE(b.thumbnail_url, '')             AS thumbnail_url,
  COALESCE(b.ringkasan, '')                 AS ringkasan,
  b.waktu_terbit
FROM public.berita b;

-- --- Notifikasi -------------------------------------------------------
CREATE OR REPLACE VIEW public.v_app_notifikasi AS
SELECT
  n.id::text                                AS id,
  n.judul,
  n.isi,
  n.kategori,
  public.waktu_relatif(n.dibuat_pada)       AS waktu_relatif,
  public.kelompok_waktu(n.dibuat_pada)      AS kelompok,
  n.dibaca,
  n.target,
  n.dibuat_pada
FROM public.notifikasi n;

-- --- Daftar periode ---------------------------------------------------
-- Menggantikan daftar periode yang sebelumnya dihitung di aplikasi.
CREATE OR REPLACE VIEW public.v_app_periode AS
SELECT DISTINCT periode
FROM public.rekap
ORDER BY periode DESC;


-- =====================================================================
-- BAGIAN 5b — KERAS-KAN MODE VIEW (security_invoker)
-- Tanpa ini, view berjalan dengan hak akses PEMBUATNYA (mengabaikan RLS
-- pemanggil) -- itu perilaku default Postgres untuk view lama, dan
-- ditandai ERROR oleh Supabase Advisor. security_invoker=true membuat
-- view menghormati RLS milik peran yang benar-benar memanggilnya.
-- =====================================================================
ALTER VIEW public.v_app_akun_wajib    SET (security_invoker = true);
ALTER VIEW public.v_app_kader         SET (security_invoker = true);
ALTER VIEW public.v_app_postingan     SET (security_invoker = true);
ALTER VIEW public.v_app_komentar      SET (security_invoker = true);
ALTER VIEW public.v_app_rekap         SET (security_invoker = true);
ALTER VIEW public.v_app_video_antrian SET (security_invoker = true);
ALTER VIEW public.v_app_berita        SET (security_invoker = true);
ALTER VIEW public.v_app_notifikasi    SET (security_invoker = true);
ALTER VIEW public.v_app_periode       SET (security_invoker = true);


-- =====================================================================
-- BAGIAN 6 — ROW LEVEL SECURITY untuk tabel baru
-- Pola sama seperti 01_schema.sql: publik boleh BACA, tulis hanya lewat
-- service_role (n8n & server Next.js) yang otomatis bypass RLS.
-- PENGECUALIAN: app_user TIDAK boleh dibaca publik (berisi hash sandi).
-- =====================================================================
ALTER TABLE public.video_antrian ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.berita        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifikasi    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_user      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baca publik video_antrian" ON public.video_antrian;
CREATE POLICY "baca publik video_antrian" ON public.video_antrian FOR SELECT USING (true);

DROP POLICY IF EXISTS "baca publik berita" ON public.berita;
CREATE POLICY "baca publik berita" ON public.berita FOR SELECT USING (true);

DROP POLICY IF EXISTS "baca publik notifikasi" ON public.notifikasi;
CREATE POLICY "baca publik notifikasi" ON public.notifikasi FOR SELECT USING (true);

-- app_user: TANPA policy SELECT sama sekali -> kunci anon/publishable
-- tidak bisa membaca satu baris pun. Hanya server (service_role) yang bisa.


-- =====================================================================
-- BAGIAN 7 — REALTIME (dashboard ikut ter-update tanpa refresh)
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = 'video_antrian'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.video_antrian;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = 'notifikasi'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifikasi;
    END IF;
  END IF;
END $$;

-- SELESAI.
-- Langkah berikutnya: jalankan skrip seed akun login (scripts/seed-app-user.mjs)
-- lalu isi .env.local aplikasi dengan URL & Secret Key Supabase.

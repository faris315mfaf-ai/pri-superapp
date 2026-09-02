-- =====================================================================
-- PRI SUPERAPP — PIPELINE TV RAKYAT
-- Jalankan SETELAH 06_integrasi_app.sql.
--
-- Tujuan: memindahkan TV Rakyat dari Google Sheets ke Supabase, dan
-- membuat kemajuan proses video bisa DIPANTAU APA ADANYA oleh aplikasi.
-- Sebelumnya layar "Sedang Memproses Video" cuma animasi 13 detik yang
-- menebak-nebak; sekarang n8n menuliskan tahap aslinya ke sini dan
-- aplikasi tinggal membacanya.
--
-- Aman dijalankan berulang kali (idempoten).
-- =====================================================================


-- =====================================================================
-- BAGIAN 1 — PELACAKAN TAHAP DI video_antrian
-- Ambang persen sengaja disamakan dengan TAHAPAN di
-- src/features/tv-rakyat/progress-panel.tsx supaya angka di layar
-- benar-benar mewakili posisi n8n, bukan tebakan.
--
--   tahap 1  Mengambil video sumber              ->  15%
--   tahap 2  Membuat judul & caption dengan AI   ->  30%
--   tahap 3  Mengunggah ke penyimpanan sementara ->  50%
--   tahap 4  Merender overlay judul & highlight  ->  85%
--   tahap 5  Finalisasi video                    -> 100%
-- =====================================================================

ALTER TABLE public.video_antrian
  ADD COLUMN IF NOT EXISTS tahap        smallint NOT NULL DEFAULT 0;
ALTER TABLE public.video_antrian
  ADD COLUMN IF NOT EXISTS tahap_nama   text;
ALTER TABLE public.video_antrian
  ADD COLUMN IF NOT EXISTS persen       smallint NOT NULL DEFAULT 0;

-- Hasil akhir render Creatomate — inilah video yang ditonton admin
-- di layar "Video Siap Ditinjau".
ALTER TABLE public.video_antrian
  ADD COLUMN IF NOT EXISTS hasil_render_url text;

-- Pesan error apa adanya bila pipeline berhenti di tengah jalan.
-- Ditampilkan ke admin supaya tahu HARUS berbuat apa, bukan cuma "gagal".
ALTER TABLE public.video_antrian
  ADD COLUMN IF NOT EXISTS pesan_error  text;

-- Akun sumber video (mis. 'official.ntv') untuk teks "SUMBER: @..."
-- pada template Creatomate.
ALTER TABLE public.video_antrian
  ADD COLUMN IF NOT EXISTS sumber_akun  text;

-- Nomor eksekusi n8n, untuk menelusuri bila ada yang aneh.
ALTER TABLE public.video_antrian
  ADD COLUMN IF NOT EXISTS execution_id text;

-- Link Cloudinary (penyimpanan sementara sebelum masuk Creatomate).
ALTER TABLE public.video_antrian
  ADD COLUMN IF NOT EXISTS cloudinary_url text;

CREATE INDEX IF NOT EXISTS idx_video_tahap ON public.video_antrian(tahap);


-- =====================================================================
-- BAGIAN 2 — KOLOM TAMBAHAN UNTUK berita
-- Berita hasil scraping Apify. Admin memilih mana yang mau direplikasi,
-- jadi perlu penanda "sudah dipakai" supaya tidak muncul terus-menerus.
-- =====================================================================

ALTER TABLE public.berita
  ADD COLUMN IF NOT EXISTS sumber_akun text;      -- mis. 'official.ntv'
ALTER TABLE public.berita
  ADD COLUMN IF NOT EXISTS jenis       text NOT NULL DEFAULT 'TIKTOK';
ALTER TABLE public.berita
  ADD COLUMN IF NOT EXISTS dipakai     boolean NOT NULL DEFAULT false;
ALTER TABLE public.berita
  ADD COLUMN IF NOT EXISTS caption_asli text;

CREATE INDEX IF NOT EXISTS idx_berita_dipakai ON public.berita(dipakai);


-- =====================================================================
-- BAGIAN 3 — PEMBARUAN VIEW
-- =====================================================================

-- Berita: tambahkan selisih_menit (dipakai pesan WA & kartu berita) dan
-- penanda dipakai. Dihitung di database supaya selalu segar tanpa
-- aplikasi perlu menghitung ulang.
--
-- DROP dulu, bukan CREATE OR REPLACE: Postgres hanya mengizinkan
-- MENAMBAH kolom di AKHIR view yang sudah ada. Kolom baru di sini
-- disisipkan di tengah (supaya urutannya masuk akal dibaca), jadi
-- REPLACE akan ditolak dengan galat "cannot change name of view column".
DROP VIEW IF EXISTS public.v_app_berita;
CREATE VIEW public.v_app_berita AS
SELECT
  b.kode                                    AS id,
  b.judul,
  b.sumber,
  public.waktu_relatif(b.waktu_terbit)      AS waktu_relatif,
  LOWER(b.platform_asal)                    AS platform_asal,
  COALESCE(b.link_video, '')                AS link_video,
  COALESCE(b.thumbnail_url, '')             AS thumbnail_url,
  COALESCE(b.ringkasan, '')                 AS ringkasan,
  COALESCE(b.sumber_akun, '')               AS sumber_akun,
  b.jenis,
  b.dipakai,
  GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - b.waktu_terbit)) / 60)::int)
                                            AS selisih_menit,
  b.waktu_terbit
FROM public.berita b;

ALTER VIEW public.v_app_berita SET (security_invoker = true);

-- Video antrian: sertakan kemajuan pipeline supaya layar proses bisa
-- menampilkan tahap n8n yang sesungguhnya.
-- (DROP dulu, alasannya sama seperti v_app_berita di atas.)
DROP VIEW IF EXISTS public.v_app_video_antrian;
CREATE VIEW public.v_app_video_antrian AS
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
  v.platform_terunggah,
  v.tahap,
  COALESCE(v.tahap_nama, '')                AS tahap_nama,
  v.persen,
  COALESCE(v.hasil_render_url, '')          AS hasil_render_url,
  COALESCE(v.pesan_error, '')               AS pesan_error,
  COALESCE(v.sumber_akun, '')               AS sumber_akun,
  COALESCE(v.cloudinary_url, '')            AS cloudinary_url
FROM public.video_antrian v;

ALTER VIEW public.v_app_video_antrian SET (security_invoker = true);


-- =====================================================================
-- BAGIAN 4 — FUNGSI MAJU-TAHAP (dipanggil n8n)
--
-- Kenapa fungsi, bukan UPDATE biasa dari n8n: nama & persen tiap tahap
-- ditetapkan DI SATU TEMPAT (di sini). Kalau n8n yang menuliskannya
-- sendiri, angka di n8n dan label di aplikasi gampang berbeda diam-diam
-- setelah salah satu diubah.
--
-- Dipanggil n8n via: POST /rest/v1/rpc/tv_maju_tahap
--   body: { p_kode: "vid-xxx", p_tahap: 3 }
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tv_maju_tahap(
  p_kode  text,
  p_tahap smallint
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_nama   text;
  v_persen smallint;
BEGIN
  -- Nama & ambang persen HARUS sama dengan TAHAPAN di progress-panel.tsx
  CASE p_tahap
    WHEN 1 THEN v_nama := 'Mengambil video sumber';              v_persen := 15;
    WHEN 2 THEN v_nama := 'Membuat judul & caption dengan AI';   v_persen := 30;
    WHEN 3 THEN v_nama := 'Mengunggah ke penyimpanan sementara'; v_persen := 50;
    WHEN 4 THEN v_nama := 'Merender overlay judul & highlight';  v_persen := 85;
    WHEN 5 THEN v_nama := 'Finalisasi video';                    v_persen := 100;
    ELSE        v_nama := '';                                    v_persen := 0;
  END CASE;

  UPDATE public.video_antrian
  SET tahap      = p_tahap,
      tahap_nama = v_nama,
      persen     = v_persen,
      status     = CASE WHEN p_tahap >= 5 THEN 'SIAP DITINJAU'
                        ELSE 'SEDANG DIPROSES' END
  WHERE kode = p_kode;
END;
$$;

-- Tandai video gagal beserta alasannya (dipanggil n8n dari cabang error).
CREATE OR REPLACE FUNCTION public.tv_tandai_gagal(
  p_kode  text,
  p_pesan text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.video_antrian
  SET status      = 'GAGAL',
      pesan_error = COALESCE(NULLIF(p_pesan, ''), 'Proses gagal tanpa keterangan')
  WHERE kode = p_kode;
END;
$$;

-- Hanya server (service_role) yang boleh memanggil kedua fungsi ini.
-- Tanpa REVOKE, siapa pun yang punya kunci publishable bisa memalsukan
-- kemajuan proses lewat endpoint RPC publik.
REVOKE EXECUTE ON FUNCTION public.tv_maju_tahap(text, smallint)  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tv_tandai_gagal(text, text)    FROM anon, authenticated;

-- SELESAI.

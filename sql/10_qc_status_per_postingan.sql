-- =====================================================================
-- QC v6 — STATUS PER POSTINGAN
-- Sudah dijalankan di Supabase produksi 24 Agustus 2026
-- (migrasi "qc_status_per_postingan"). Aman dijalankan ulang.
--
-- LATAR: perombakan total workflow QC. Masalah lama bukan di kode
-- melainkan di BENTUK ALUR — semua penyimpanan terjadi di UJUNG, jadi
-- apa pun yang memutus alur di tengah (batas 60 detik per Code node di
-- n8n Cloud, batas 40 menit per eksekusi, satu request nyangkut)
-- membuat SELURUH hasil hangus.
--
-- Kolom di bawah adalah inti perbaikannya: pemeriksaan komentar
-- disimpan PER POSTINGAN, sehingga proses yang terputus hanya
-- kehilangan satu postingan dan bisa DILANJUTKAN, bukan diulang.
-- =====================================================================

alter table public.postingan
  add column if not exists komentar_status          text        not null default 'menunggu',
  add column if not exists komentar_diperiksa_pada  timestamptz,
  add column if not exists komentar_error           text;

-- Hanya tiga status. 'diproses' SENGAJA TIDAK ADA: kalau postingan
-- ditandai "sedang diproses" lalu prosesnya mati mendadak, tandanya
-- menempel selamanya dan postingan itu tidak akan pernah diambil lagi —
-- persis kemacetan senyap yang mau dihindari. Dengan tiga status,
-- postingan yang gagal di tengah tetap 'menunggu' dan otomatis dicoba
-- lagi. Aman diulang karena semua penyimpanan memakai upsert.
alter table public.postingan drop constraint if exists postingan_komentar_status_sah;
alter table public.postingan add constraint postingan_komentar_status_sah
  check (komentar_status in ('menunggu', 'selesai', 'gagal'));

-- Indeks mengikuti PERSIS pola query pekerja QC-2: "postingan menunggu
-- paling lama di periode ini". Tanpa ini, tiap putaran loop menyapu
-- seluruh tabel.
create index if not exists idx_postingan_antrian_qc
  on public.postingan (periode, komentar_status, waktu_posting);

-- Ringkasan antrian untuk layar QC. Dihitung dari status nyata di
-- database, jadi kemajuan tetap terbaca walau aplikasi ditutup dan
-- dibuka lagi — memperbaiki bug lama di mana layar selalu menulis
-- "Belum Ada Analisis Hari Ini" padahal datanya sudah ada.
create or replace view public.v_app_qc_antrian as
select
  p.periode,
  count(*)::int                                              as total,
  count(*) filter (where p.komentar_status = 'selesai')::int  as selesai,
  count(*) filter (where p.komentar_status = 'menunggu')::int as menunggu,
  count(*) filter (where p.komentar_status = 'gagal')::int    as gagal,
  count(*) filter (where p.perlu_cek_manual)::int             as perlu_cek_manual,
  max(p.komentar_diperiksa_pada)                              as terakhir_diperiksa
from public.postingan p
group by p.periode;

alter view public.v_app_qc_antrian set (security_invoker = true);

-- SELESAI.
-- Kontrak workflow n8n (QC-1 -> QC-2 -> QC-3):
--   QC-1 Pendataan  (SFI1d0mf6JGfauSS) webhook /qc-mulai  {tanggal?}
--        Upsert postingan TANPA kolom komentar_status: baris BARU dapat
--        default 'menunggu', baris LAMA yang sudah selesai TIDAK direset.
--        Lalu PATCH status 'gagal' -> 'menunggu' supaya kegagalan sesaat
--        dicoba ulang saat pendataan dijalankan lagi.
--   QC-2 Pemeriksa  (4EgViHMGPKTbTREJ) webhook /qc-lanjut {periode}
--        Satu postingan per putaran; simpan komentar + tandai status
--        SEBELUM lanjut. Anggaran sesi 25 menit.
--   QC-3 Rekap      (0cAezp6NuVCO5RW4) sub-workflow {periode}
--        Hitung rekap dari database, tanpa panggil API luar.
--        Hanya postingan 'selesai' yang dinilai.

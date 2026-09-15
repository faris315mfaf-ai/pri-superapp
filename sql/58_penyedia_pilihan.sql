-- ============================================================
-- 58 — Master memilih penyedia sosmed per anggota (15 Sep 2026)
--
-- Postiz BUKAN pengganti upload-post, melainkan pilihan ketiga di
-- samping Ayrshare (TV Rakyat Official) dan upload-post. Yang memutuskan
-- siapa memakai apa adalah master, satu per satu, lewat Panel Master.
--
-- Pilihan itu sudah punya tempat: kolom `sosmed_profile.penyedia`.
-- Berkas ini hanya menambahkan CATATAN SIAPA & KAPAN mengubahnya.
-- Selama masa uji coba, itulah yang menjawab pertanyaan yang pasti
-- muncul: "sejak kapan video orang ini lewat Postiz, dan siapa yang
-- memindahkannya?" — pertanyaan yang tidak bisa dijawab kalau yang
-- tersimpan cuma keadaan sekarang.
--
-- Jalankan SETELAH 57_postiz.sql. Aman diulang.
-- ============================================================

alter table public.sosmed_profile
  add column if not exists penyedia_diubah_pada timestamptz,
  add column if not exists penyedia_diubah_oleh bigint;

comment on column public.sosmed_profile.penyedia_diubah_pada is
  'Kapan master terakhir memindahkan anggota ini antar penyedia. Kosong = belum pernah dipindah.';
comment on column public.sosmed_profile.penyedia_diubah_oleh is
  'app_user.id master yang memindahkan. Kosong = belum pernah dipindah.';

-- Siapa saja yang sedang ikut uji coba (laporan, tidak mengubah apa pun).
select
  p.penyedia,
  count(*) as jumlah_anggota,
  min(p.penyedia_diubah_pada) as pemindahan_pertama,
  max(p.penyedia_diubah_pada) as pemindahan_terakhir
from public.sosmed_profile p
where p.jenis = 'pengguna'
group by p.penyedia
order by p.penyedia;

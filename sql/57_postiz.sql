-- ============================================================
-- 57 — Persiapan pindah dari upload-post ke POSTIZ SWAKELOLA (15 Sep 2026)
--
-- Tidak ada satu pun data yang dipindah atau dihapus di sini. Berkas ini
-- hanya menyiapkan dua hal supaya uji coba Postiz pada BEBERAPA anggota
-- tidak merusak 225 anggota lain yang masih di upload-post.
--
-- Aman dijalankan berkali-kali.
-- ============================================================

-- ------------------------------------------------------------
-- 1. tvrku_post.penyedia — siapa yang MENGIRIM unggahan ini
--
-- Kenapa ini wajib ada SEBELUM ada anggota yang pindah:
-- status unggahan tidak langsung jadi. Aplikasi menanyakannya lagi
-- beberapa menit kemudian untuk mendapat URL postingannya (itulah yang
-- dicatat sebagai laporan dan dihitung jadi KPI). Penanya itu memilih
-- API berdasarkan penyedia milik ANGGOTA sekarang.
--
-- Jadi bayangkan: seorang anggota mengunggah lewat upload-post pagi
-- ini, siangnya ia dipindah ke Postiz. Sore hari penanya bertanya ke
-- Postiz tentang unggahan yang tidak pernah ada di sana. Jawabannya
-- "tidak ketemu" — bukan galat, hanya kosong. Laporan anggota itu
-- HILANG tanpa satu pun pesan, dan KPI-nya jadi nol.
--
-- Kolom ini membuat tiap baris ingat sendiri asalnya. Baris lama
-- otomatis 'upload-post' karena memang itu satu-satunya yang pernah
-- dipakai sampai hari ini.
-- ------------------------------------------------------------
alter table public.tvrku_post
  add column if not exists penyedia text not null default 'upload-post';

comment on column public.tvrku_post.penyedia is
  'Gerbang yang MENGIRIM unggahan ini (upload-post | postiz). Dipakai saat menanyakan hasilnya kembali — jangan diubah setelah baris dibuat.';

-- ------------------------------------------------------------
-- 2. Indeks pencarian profil anggota
--
-- Sejak ada lebih dari satu penyedia, 18 tempat di aplikasi berubah
-- dari menyaring satu nilai ("upload-post") menjadi menyaring daftar
-- nilai. Indeks ini menjaga pencarian itu tetap cepat saat profil
-- anggota bercampur dua penyedia selama masa uji coba.
-- ------------------------------------------------------------
create index if not exists idx_sosmed_profile_penyedia_pengguna
  on public.sosmed_profile (penyedia, jenis, user_id);

-- ------------------------------------------------------------
-- 3. Menghitung keadaan sekarang (hanya laporan, tidak mengubah apa pun)
--
-- Dijalankan supaya terlihat hitam di atas putih berapa anggota yang
-- sedang di penyedia mana — angka inilah yang dipakai memutuskan kapan
-- uji coba boleh diperluas.
-- ------------------------------------------------------------
select
  penyedia,
  count(*) filter (where jenis = 'pengguna') as profil_anggota,
  count(*)                                   as semua_profil
from public.sosmed_profile
group by penyedia
order by penyedia;

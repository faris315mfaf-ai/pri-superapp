-- ============================================================
-- 42_jabatan_sayap.sql (10 Sep 2026)
--
-- Jabatan di SAYAP PARTAI disimpan TERPISAH dari jabatan DPP.
--
-- Kenapa kolom sendiri, bukan menumpang `jabatan`: nama jabatannya
-- kebetulan sama persis ("Ketua Umum", "Sekretaris Jenderal", …),
-- sedangkan kuasanya jauh berbeda. Kolom `jabatan` dipakai puluhan
-- aturan pusat — salah satunya menaikkan pemegang "Ketua Umum" menjadi
-- super admin seluruh aplikasi (src/lib/sesi.ts). Menaruh jabatan sayap
-- di kolom yang sama akan membuat Ketua Umum DPP JURI PRI diam-diam
-- memegang kendali seluruh partai. Dengan kolom terpisah, hal itu
-- MUSTAHIL terjadi walau kelak ada aturan pusat baru yang lupa
-- membedakan keduanya.
--
-- Isi kolom: salah satu dari 6 jabatan sayap (lihat JABATAN_SAYAP di
-- src/lib/struktur.ts) atau kosong. Wajib kosong bila divisinya bukan
-- "Divisi Sayap Partai" — ditegakkan di /api/pengguna, /api/profil,
-- dan /api/master.
-- ============================================================
alter table public.app_user add column if not exists jabatan_sayap text not null default '';

-- Menjaga "satu Ketua Umum per sayap" tetap murah dicek.
create index if not exists idx_app_user_jabatan_sayap
  on public.app_user (sub_divisi, jabatan_sayap)
  where jabatan_sayap <> '';

-- ============================================================
-- sql/46 — TV RAKYAT NASIONAL (12 Sep 2026)
--
-- Empat hal baru, semuanya untuk satu permintaan: menyatukan TV Rakyat
-- Official dan TV Rakyat Nasional dalam satu modul, dipegang satu
-- jabatan khusus.
--
--  (1) app_user.jabatan_tvr   — jabatan "TV Rakyat Nasional".
--  (2) tvr_metrik_harian      — rekaman harian angka nasional.
--  (3) tvr_video_wajib        — perintah video untuk seluruh anggota.
--  (4) kolom kategori         — pada unggahan & laporan video.
--
-- Aman & idempoten: boleh dijalankan berulang. RLS menyala tanpa policy
-- publik — seluruh akses lewat route server, sama seperti tabel lain.
-- ============================================================

-- ------------------------------------------------------------
-- (1) JABATAN TV RAKYAT NASIONAL — KOLOM SENDIRI
--
-- Kenapa bukan menumpang kolom `jabatan`: jabatan ini memang dirancang
-- BERDAMPINGAN dengan jabatan lain — satu orang bisa Direktur Eksekutif
-- sekaligus TV Rakyat Nasional. Kolom `jabatan` hanya muat satu nilai
-- dan sudah dipakai puluhan aturan pusat (termasuk yang menaikkan
-- "Ketua Umum" jadi super admin). Menimpanya berarti memaksa orang
-- melepas jabatan aslinya, dan diam-diam mengubah kuasanya di seluruh
-- aplikasi.
--
-- Pola yang sama sudah terbukti pada jabatan_sayap (sql/42).
--
-- Isi kolom: 'TV Rakyat Nasional' atau kosong.
-- ------------------------------------------------------------
alter table public.app_user
  add column if not exists jabatan_tvr text not null default '';

create index if not exists idx_app_user_jabatan_tvr
  on public.app_user (jabatan_tvr)
  where jabatan_tvr <> '';

-- ------------------------------------------------------------
-- (2) REKAMAN HARIAN ANGKA NASIONAL
--
-- Yang diminta bukan totalnya, melainkan KENAIKANNYA: "hari ini naik
-- sekian tayangan". Kenaikan tidak bisa dihitung dari angka sekarang
-- saja — ia butuh pembanding dari kemarin, seminggu lalu, sebulan lalu.
-- Sumber datanya (Ayrshare & upload-post) hanya memberi angka saat ini
-- dan tidak menyimpan sejarah, jadi sejarahnya harus dicatat sendiri.
--
-- Satu baris per tanggal (WIB). Dicatat berkala oleh penjadwal; kalau
-- hari itu tercatat dua kali, baris yang sama diperbarui — bukan dobel.
--
-- KONSEKUENSI YANG HARUS DIPAHAMI: kenaikan baru bisa dihitung setelah
-- ada rekaman pembanding. Sehari setelah dipasang, "hari ini" sudah
-- terisi; "1 bulan" baru penuh setelah sebulan berjalan. Tidak ada cara
-- membuat sejarah yang tidak pernah dicatat.
-- ------------------------------------------------------------
create table if not exists public.tvr_metrik_harian (
  tanggal_wib   date PRIMARY KEY,
  -- Angka total seluruh akun pada saat direkam, per indikator:
  -- { pengikut, tayangan, jangkauan, suka, komentar, dibagikan }
  total         jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Berapa akun yang benar-benar terbaca saat perekaman. Dipakai untuk
  -- menandai rekaman yang tidak lengkap supaya tidak dibaca sebagai
  -- "turun" padahal cuma sebagian akun yang terbaca.
  profil_terbaca integer NOT NULL DEFAULT 0,
  profil_total   integer NOT NULL DEFAULT 0,
  diambil_pada   timestamptz NOT NULL DEFAULT now()
);

alter table public.tvr_metrik_harian enable row level security;

-- ------------------------------------------------------------
-- (3) VIDEO WAJIB — PERINTAH VIDEO UNTUK SELURUH ANGGOTA
--
-- Pihak berwenang menaruh perintah beserta link bahan mentah (doksli)
-- untuk diunduh anggota. Muncul paling atas di modul TV Rakyat setiap
-- anggota, dan jadi acuan saat mereka melaporkan videonya.
--
-- `kategori` disimpan sebagai TEKS, bukan penunjuk ke baris keyword:
-- perintah lama harus tetap terbaca apa adanya walaupun kategorinya
-- kelak dinonaktifkan atau dihapus tim TV Rakyat Official.
-- ------------------------------------------------------------
create table if not exists public.tvr_video_wajib (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  judul          text NOT NULL,
  keterangan     text NOT NULL DEFAULT '',
  -- Link bahan mentah (Google Drive dan sejenisnya) untuk diunduh.
  link_doksli    text NOT NULL DEFAULT '',
  kategori       text NOT NULL DEFAULT '',
  -- Tenggat opsional; kosong = berlaku sampai dinonaktifkan.
  batas_waktu    date,
  aktif          boolean NOT NULL DEFAULT true,
  dibuat_oleh_id bigint REFERENCES public.app_user(id),
  dibuat_pada    timestamptz NOT NULL DEFAULT now()
);

-- Yang dibaca anggota hampir selalu "yang aktif, terbaru dulu".
create index if not exists idx_tvr_video_wajib_aktif
  on public.tvr_video_wajib (aktif, dibuat_pada desc);

alter table public.tvr_video_wajib enable row level security;

-- ------------------------------------------------------------
-- (4) KATEGORI PADA UNGGAHAN & LAPORAN
--
-- Kategori memakai daftar keyword_wajib yang sudah ada (sql/18) —
-- memang itu yang dimaksud "kategori/keyword yang disetting tim TV
-- Rakyat Official". Membuat daftar kedua yang isinya sama hanya akan
-- membuat dua dropdown berbeda untuk satu hal yang sama.
--
-- Kolomnya ditambahkan di tempat yang belum punya. Nilai lama dibiarkan
-- kosong: laporan yang terlanjur masuk sebelum aturan ini tidak boleh
-- mendadak dianggap tidak sah.
-- ------------------------------------------------------------
alter table public.tvrku_post
  add column if not exists keyword text;

alter table public.laporan_video_pending
  add column if not exists keyword text;

alter table public.laporan_video
  add column if not exists keyword text;

create index if not exists idx_tvrku_post_keyword
  on public.tvrku_post (lower(keyword))
  where keyword is not null;

-- ------------------------------------------------------------
-- Hak akses: sama seperti tabel lain di aplikasi ini (lihat sql/44).
-- ------------------------------------------------------------
grant select, insert, update, delete
  on public.tvr_video_wajib, public.tvr_metrik_harian
  to anon, authenticated, service_role;

grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;

-- Beri tahu PostgREST supaya kolom & tabel baru langsung terbaca.
notify pgrst, 'reload schema';

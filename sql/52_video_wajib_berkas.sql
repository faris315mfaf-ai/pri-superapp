-- ============================================================
-- sql/52 — VIDEO WAJIB: BERKAS BAHAN + SUMBER VIDEO (13 Sep 2026)
--
-- Fitur "Request Video ke Anggota" dihapus; gantinya tim TV Rakyat
-- Official MENGUNGGAH video bahan langsung di perintah Video Wajib.
-- Kreator memakai bahan yang diunggah di SuperApp itu — satu sumber,
-- satu tempat, tidak lagi terpisah antara "perintah" dan "bahannya".
--
-- Kolom baru:
--   sumber_video  : dari mana bahannya (mis. "Doksli DPP", "Kompas TV").
--   berkas_cara   : 'r2' | 'supabase' | '' — di mana berkasnya disimpan.
--   berkas_key    : kunci objek R2 / path bucket "tvrku".
--   berkas_nama   : nama berkas asli (ditampilkan ke anggota).
--   berkas_ukuran : byte, untuk keterangan "xx MB" di tombol unduh.
-- URL unduh TIDAK disimpan: dibuat bertanda tangan saat dibaca
-- (alamat dalam container tidak boleh tersimpan permanen).
-- ============================================================
alter table public.tvr_video_wajib
  add column if not exists sumber_video  text   not null default '',
  add column if not exists berkas_cara   text   not null default '',
  add column if not exists berkas_key    text   not null default '',
  add column if not exists berkas_nama   text   not null default '',
  add column if not exists berkas_ukuran bigint not null default 0;

notify pgrst, 'reload schema';

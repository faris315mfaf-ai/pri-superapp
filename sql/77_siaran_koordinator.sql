-- ============================================================
-- sql/77 — SIARAN KOORDINATOR KE AKUN ANGGOTA (15 Okt 2026)
--
-- Koordinator (master, lewat Ruang Bot → Koordinator → Siaran Anggota)
-- menyiarkan satu video ke akun sosmed anggota yang tertaut di upload-post.
-- Anggota menyetujui siaran koordinator saat mendaftar (keputusan pemilik),
-- jadi tidak ada tabel izin per anggota.
--
-- Dibangun di atas Siaran Serentak (sql/25, sql/26):
--   tvr_siaran       + sumber, sumber_video, mode, jeda, kategori/perintah,
--                      tampil di Ruang Bot, dijeda
--   tvr_siaran_item  + jadwal_kirim (giliran tiap akun, bertahap), varian
--                      caption Nara yang dipakai
--
-- Aman & idempoten. Kode tetap jalan bila SQL ini belum dijalankan (siaran
-- serentak lama tidak terganggu); siaran koordinator ditolak 503 sampai ada.
-- ============================================================

alter table public.tvr_siaran
  add column if not exists sumber       text    not null default 'manual',   -- manual | koordinator
  add column if not exists sumber_video text    not null default 'unggah',   -- unggah | acc | stok_tim | video_wajib
  add column if not exists sumber_id    text    not null default '',         -- id tugas/stok/perintah atau kunci unggahan (cegah siaran ganda)
  add column if not exists mode         text    not null default 'serentak', -- serentak | bertahap | terjadwal
  add column if not exists jeda_detik   integer not null default 0,
  add column if not exists kategori     text    not null default '',
  add column if not exists perintah_id  bigint,
  add column if not exists tampil_ruang boolean not null default false,
  add column if not exists dijeda       boolean not null default false;

alter table public.tvr_siaran_item
  add column if not exists jadwal_kirim timestamptz,
  add column if not exists varian       smallint;

-- Pemroses mengambil item yang SUDAH jatuh giliran.
create index if not exists idx_tsi_jatuh
  on public.tvr_siaran_item (jadwal_kirim, id)
  where status = 'menunggu';
create index if not exists idx_ts_sumber
  on public.tvr_siaran (sumber, id desc);
create index if not exists idx_tsi_user
  on public.tvr_siaran_item (user_id, id desc);

notify pgrst, 'reload schema';

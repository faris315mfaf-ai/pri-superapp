-- ============================================================
-- sql/76 — VIDEO WAJIB BERNOMOR PERINTAH (15 Okt 2026)
--
-- Perintah Pimred kini MEMBAWA kategorinya sampai ke insight:
--   perintah (tvr_video_wajib.id) → unggahan (tvrku_post.perintah_id)
--   → laporan otomatis (laporan_video.perintah_id) → Insight per Kategori.
-- Kategori tidak lagi ditebak (tanpa hashtag, tanpa model bahasa): video
-- tercatat milik sebuah perintah HANYA bila dibuat/diunggah dari perintah itu
-- (atau dimasukkan manual oleh Pimred).
--
-- Perintah juga bisa "Wajib posting": otomatis berlaku untuk SEMUA akun yang
-- tersambung dan SEMUA platform yang tertaut — tanpa daftar sasaran terpisah.
--
-- Aman & idempoten: boleh dijalankan berulang. Kode aplikasi tetap jalan
-- bila SQL ini belum dijalankan (fitur wajib posting/pantau mati sendiri).
-- ============================================================

-- (0) Tabel perintah video wajib. Di produksi sql/46 & sql/52 TERNYATA belum pernah dijalankan
--     (15 Okt 2026: "relation public.tvr_video_wajib does not exist"), jadi panel Video Wajib selama
--     ini kosong. Bagian ini membuatnya (bentuk akhir 46 + 52) tanpa menyentuh bagian lain sql/46
--     (jabatan_tvr, tvr_metrik_harian, kolom keyword) — itu keputusan terpisah.
create table if not exists public.tvr_video_wajib (
  id             bigint generated always as identity primary key,
  judul          text not null,
  keterangan     text not null default '',
  link_doksli    text not null default '',
  kategori       text not null default '',
  batas_waktu    date,
  aktif          boolean not null default true,
  dibuat_oleh_id bigint references public.app_user(id),
  dibuat_pada    timestamptz not null default now(),
  sumber_video   text   not null default '',
  berkas_cara    text   not null default '',
  berkas_key     text   not null default '',
  berkas_nama    text   not null default '',
  berkas_ukuran  bigint not null default 0
);
create index if not exists idx_tvr_video_wajib_aktif
  on public.tvr_video_wajib (aktif, dibuat_pada desc);
alter table public.tvr_video_wajib enable row level security;
-- Bila tabelnya sudah ada dari sql/46 tanpa kolom sql/52, lengkapi:
alter table public.tvr_video_wajib
  add column if not exists sumber_video  text   not null default '',
  add column if not exists berkas_cara   text   not null default '',
  add column if not exists berkas_key    text   not null default '',
  add column if not exists berkas_nama   text   not null default '',
  add column if not exists berkas_ukuran bigint not null default 0;

-- (1) Pengaturan wajib posting pada perintah.
alter table public.tvr_video_wajib
  add column if not exists wajib_posting boolean not null default false,
  -- 'harian' = setiap hari sampai dimatikan/batas waktu; 'sekali' = satu kali.
  add column if not exists pola          text    not null default 'harian',
  -- Batas jam posting (WIB), bentuk 'HH:MM'.
  add column if not exists batas_jam     text    not null default '18:00',
  add column if not exists pengingat     boolean not null default true;

-- (2) Nomor perintah pada unggahan, laporan, dan laporan tertahan.
alter table public.tvrku_post
  add column if not exists perintah_id bigint;
alter table public.laporan_video
  add column if not exists perintah_id bigint,
  -- Diisi bila video DIMASUKKAN manual ke perintah oleh Pimred/TV Rakyat
  -- Nasional (bukan lewat tombol "Buat video dari perintah ini").
  add column if not exists perintah_oleh bigint;
alter table public.laporan_video_pending
  add column if not exists perintah_id bigint;

create index if not exists idx_tvrku_post_perintah
  on public.tvrku_post (perintah_id, dibuat_pada desc)
  where perintah_id is not null;
create index if not exists idx_laporan_video_perintah
  on public.laporan_video (perintah_id, tanggal_wib)
  where perintah_id is not null;

-- (3) Catatan pengingat yang sudah terkirim (supaya tidak dobel per hari).
--     jenis: 'otomatis' (penjadwal) | 'manual' (tombol "Ingatkan yang belum").
create table if not exists public.tvr_wajib_pengingat (
  id           bigint generated always as identity primary key,
  perintah_id  bigint not null,
  tanggal_wib  date   not null,
  jenis        text   not null default 'otomatis',
  jumlah       integer not null default 0,
  dikirim_oleh bigint,
  dikirim_pada timestamptz not null default now()
);
create index if not exists idx_tvr_wajib_pengingat
  on public.tvr_wajib_pengingat (perintah_id, tanggal_wib, jenis);
-- Pengingat otomatis: SATU per perintah per hari (penjadwal yang tumpang tindih tak bisa mengirim dobel).
create unique index if not exists uq_tvr_wajib_pengingat_otomatis
  on public.tvr_wajib_pengingat (perintah_id, tanggal_wib)
  where jenis = 'otomatis';
alter table public.tvr_wajib_pengingat enable row level security;

notify pgrst, 'reload schema';

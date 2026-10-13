-- ============================================================
-- sql/67 — BOT REDAKSI (13 Okt 2026)
--
-- Bot redaksi: akun anggota di Divisi BOT (username bot1..bot3) yang
-- memakai modul TV Rakyat Saya. Perilaku mereka (mode, kuota, jam) disimpan
-- di sini; akun penggunanya tetap baris app_user biasa.
--
--   bot_redaksi     : satu baris per bot (perilaku + rupa karakter di Ruang Bot)
--   bot_runner      : satu baris — detak terakhir "Rumah Bot" di VPS mesin
--   bot_sumber      : akun sumber yang BOLEH diambil tiap bot
--   bot_blokir      : kata/akun yang tidak boleh diambil
--   bot_kandidat    : video sumber yang ditemukan; UNIQUE per kunci_kanonik,
--                     klaim atomik supaya dua bot tak memakai video yang sama
--   bot_tugas       : satu tugas = satu video dari cari sampai selesai
--   bot_video_wajib : permintaan Video Wajib Pimred yang diambil bot
--   bot_log         : umpan aktivitas (sumber Ruang Bot)
--
-- Pekerjaan 1 hanya memakai bot_redaksi, bot_runner, bot_log. Tabel lain
-- disiapkan agar migrasinya satu kali; kodenya menyusul (Pekerjaan 2-3).
-- Hanya dibaca server (service role); RLS menyala TANPA kebijakan supaya
-- kunci anon tidak bisa membacanya. Aman diulang.
-- Jalankan manual SEBELUM push kode:
--   ssh pri-vps 'docker exec -i supabase-db psql -U postgres -w --single-transaction -v ON_ERROR_STOP=1' < sql/67_bot_redaksi.sql
--   lalu: NOTIFY pgrst, 'reload schema';
-- ============================================================

create table if not exists public.bot_redaksi (
  id               bigint generated always as identity primary key,
  -- id akun bot di app_user; juga id pengguna di mesin Auto Edit.
  user_id          bigint      not null unique references public.app_user(id) on delete restrict,
  nama             text        not null,
  peran            text        not null default '',
  persona          text        not null default '',
  warna            text        not null default '#f08a3c',
  handle           text        not null default '',
  platform         text        not null default 'Instagram',
  -- rupa karakter pixel-art: {kaus, bayangan, celana, kulit, rambut, gayaRambut, ...}
  rupa             jsonb       not null default '{}'::jsonb,
  mode             text        not null default 'acc' check (mode in ('acc', 'otomatis')),
  kuota_harian     integer     not null default 1 check (kuota_harian between 1 and 6),
  jam_mulai        text        not null default '08:00' check (jam_mulai ~ '^[0-2][0-9]:[0-5][0-9]$'),
  jam_selesai      text        not null default '20:00' check (jam_selesai ~ '^[0-2][0-9]:[0-5][0-9]$'),
  aktif            boolean     not null default true,
  jeda             boolean     not null default false,
  gagal_beruntun   integer     not null default 0,
  dibuat_pada      timestamptz not null default now()
);
alter table public.bot_redaksi enable row level security;

-- Satu baris saja (id = 1): detak terakhir runner di VPS mesin.
create table if not exists public.bot_runner (
  id               smallint    primary key check (id = 1),
  terakhir_denyut  timestamptz,
  versi            text
);
alter table public.bot_runner enable row level security;
insert into public.bot_runner (id) values (1) on conflict (id) do nothing;

create table if not exists public.bot_sumber (
  id               bigint generated always as identity primary key,
  bot_id           bigint      not null references public.bot_redaksi(id) on delete cascade,
  platform         text        not null,
  handle           text        not null,
  kategori         text        not null default 'NEWS' check (kategori in ('NEWS', 'HIBURAN', 'SHOWBIZ')),
  aktif            boolean     not null default true,
  terakhir_ambil   timestamptz,
  dibuat_pada      timestamptz not null default now(),
  unique (bot_id, platform, handle)
);
alter table public.bot_sumber enable row level security;

create table if not exists public.bot_blokir (
  id               bigint generated always as identity primary key,
  kata             text        not null,
  dibuat_pada      timestamptz not null default now()
);
create unique index if not exists idx_bot_blokir_kata on public.bot_blokir (lower(kata));
alter table public.bot_blokir enable row level security;

-- Kandidat video sumber. kunci_kanonik = "platform:id_postingan" (sudah dinormalkan).
-- UNIQUE inilah pagar utama "satu video hanya dipakai satu bot".
create table if not exists public.bot_kandidat (
  id               bigint generated always as identity primary key,
  kunci_kanonik    text        not null unique,
  sumber_id        bigint      references public.bot_sumber(id) on delete set null,
  url              text        not null,
  judul            text        not null default '',
  caption          text        not null default '',
  durasi_detik     integer,
  tayangan         bigint,
  waktu_terbit     timestamptz,
  -- alasan kandidat dilewati pemilih (mis. 'dipakai_manusia' = sudah dipakai di sistem lain); null = bersih
  bentrok          text,
  -- klaim atomik: UPDATE ... WHERE diklaim_oleh IS NULL RETURNING id
  diklaim_oleh     bigint      references public.bot_redaksi(id) on delete set null,
  diklaim_pada     timestamptz,
  dibuat_pada      timestamptz not null default now()
);
create index if not exists idx_bot_kandidat_bebas on public.bot_kandidat (dibuat_pada desc) where diklaim_oleh is null;
alter table public.bot_kandidat enable row level security;

create table if not exists public.bot_tugas (
  id               bigint generated always as identity primary key,
  bot_id           bigint      not null references public.bot_redaksi(id) on delete cascade,
  kandidat_id      bigint      references public.bot_kandidat(id) on delete set null,
  tahap            text        not null default 'cari'
                   check (tahap in ('cari', 'pilih', 'unduh', 'edit', 'siap_ditinjau', 'menunggu_acc', 'disetujui', 'posting', 'selesai', 'gagal')),
  judul            text        not null default '',
  kategori         text        not null default 'NEWS',
  id_job_mesin     text,
  id_stok_mesin    text,
  -- penanda hook dari runner (untuk memantau job di mesin; Pekerjaan 2)
  hook             text,
  -- berapa kali perintah buat_video diberikan untuk tugas ini (batas MAKS_PERCOBAAN)
  percobaan        integer     not null default 0,
  video_path       text,
  caption          text        not null default '',
  jadwal           timestamptz,
  hasil_posting    jsonb       not null default '{}'::jsonb,
  galat            text        not null default '',
  -- klaim proses: tugas yang sama tak diproses dua runner/tick sekaligus
  dikunci_sampai   timestamptz,
  dibuat_pada      timestamptz not null default now(),
  diubah_pada      timestamptz not null default now(),
  selesai_pada     timestamptz
);
create index if not exists idx_bot_tugas_bot on public.bot_tugas (bot_id, tahap);
create index if not exists idx_bot_tugas_selesai on public.bot_tugas (bot_id, selesai_pada desc);
alter table public.bot_tugas enable row level security;

-- Permintaan Video Wajib (tvr_video_wajib) yang diambil bot. UNIQUE = satu bot per permintaan.
create table if not exists public.bot_video_wajib (
  id               bigint generated always as identity primary key,
  video_wajib_id   bigint      not null unique,
  bot_id           bigint      not null references public.bot_redaksi(id) on delete cascade,
  tugas_id         bigint      references public.bot_tugas(id) on delete set null,
  status           text        not null default 'diambil' check (status in ('diambil', 'selesai', 'dilepas')),
  dibuat_pada      timestamptz not null default now()
);
alter table public.bot_video_wajib enable row level security;

create table if not exists public.bot_log (
  id               bigint generated always as identity primary key,
  bot_id           bigint      not null references public.bot_redaksi(id) on delete cascade,
  tugas_id         bigint      references public.bot_tugas(id) on delete set null,
  tahap            text        not null default 'istirahat' check (tahap in ('cari', 'edit', 'posting', 'istirahat')),
  teks             text        not null default '',
  dibuat_pada      timestamptz not null default now()
);
create index if not exists idx_bot_log_waktu on public.bot_log (dibuat_pada desc);
create index if not exists idx_bot_log_bot on public.bot_log (bot_id, dibuat_pada desc);
alter table public.bot_log enable row level security;

-- Untuk basis data yang sudah menjalankan versi awal berkas ini (kolom Pekerjaan 2).
alter table public.bot_kandidat add column if not exists bentrok text;
alter table public.bot_tugas add column if not exists hook text;
alter table public.bot_tugas add column if not exists percobaan integer not null default 0;

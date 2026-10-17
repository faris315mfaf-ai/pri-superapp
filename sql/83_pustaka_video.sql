-- ============================================================
-- sql/83 — PUSTAKA VIDEO (17 Okt 2026)
--
-- JALANKAN SEBELUM DEPLOY.
--
-- Perpustakaan video yang dikelola tim TV Rakyat (bolehKelolaTvr / master)
-- lewat /api/tv/pustaka-video. Anggota TVR Saya memilih video dari sini dan
-- memostingnya langsung ke akun upload-post masing-masing tanpa mengunggah
-- ulang (/api/tvr/video-internal + /api/tvr/unggah sumber_internal).
--
-- Berkasnya ada di R2 atau bucket privat Supabase "tvrku" dengan awalan
-- pustaka-video/<uid>/ — berkas MILIK BERSAMA: riwayat tvrku_post yang
-- memakainya ditulis dengan video_path '' sehingga penyapu media TVR Saya
-- tidak pernah menghapusnya. Berkas hanya terhapus bila barisnya dihapus.
--
-- Aman & idempoten. Kode tetap jalan bila SQL ini belum dijalankan
-- (daftar pustaka kosong; pengelolaan ditolak 503 dengan petunjuk).
-- ============================================================

create table if not exists public.tvr_pustaka_video (
  id              uuid        primary key default gen_random_uuid(),
  judul           text        not null,
  keterangan      text        not null default '',
  kategori        text,
  berkas_cara     text        not null check (berkas_cara in ('r2', 'supabase')),
  berkas_key      text        not null,
  berkas_nama     text        not null default '',
  berkas_ukuran   bigint,
  aktif           boolean     not null default true,
  dibuat_oleh_id  bigint      references public.app_user(id) on delete set null,
  dibuat_pada     timestamptz not null default now()
);

-- Daftar anggota: yang aktif, terbaru dulu.
create index if not exists idx_tpv_aktif
  on public.tvr_pustaka_video (aktif, dibuat_pada desc);

-- Aplikasi memakai service key (melewati RLS); tanpa policy = tertutup
-- untuk kunci anon/publik (pola sql/rls.sql).
alter table public.tvr_pustaka_video enable row level security;

notify pgrst, 'reload schema';

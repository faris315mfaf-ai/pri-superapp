-- 28 — 3 Sep 2026: (a) batas unggah video TVR Saya naik 50 → 75 MB;
-- (b) tabel pencatat TOKEN AI (DeepSeek / Gemini) untuk Panel Master →
-- "Pemakaian Server & Token AI". (Sudah diterapkan di Supabase: migrasi
-- unggah_75mb_dan_ai_pemakaian.)
--
-- CATATAN PENTING batas unggah: selain batas per-bucket di bawah, Supabase punya
-- batas GLOBAL per proyek (Dashboard → Storage → Settings → "Upload file size
-- limit"; bawaan 50 MB). Kalau batas global masih 50 MB, unggahan 51–75 MB tetap
-- ditolak walau bucket sudah 75 MiB — naikkan di dashboard (tidak bisa lewat SQL).

-- (a1) Bucket tvrku: 75 MiB = 75 * 1024 * 1024.
update storage.buckets
   set file_size_limit = 78643200
 where id = 'tvrku';

-- (a2) Pengaturan aplikasi yang dibaca lib/pengaturan-tv.ts (1–200 MB).
insert into public.pengaturan_sistem (kunci, nilai)
values ('tv_maks_upload_mb', '75')
on conflict (kunci) do update set nilai = excluded.nilai;

-- (b) Pemakaian token AI: satu baris per panggilan model.
--     penyedia : 'deepseek' | 'gemini'
--     fitur    : 'studio-judul' | 'studio-highlight' | 'studio-caption' | 'asisten' | ...
create table if not exists public.ai_pemakaian (
  id            bigserial primary key,
  penyedia      text not null,
  model         text not null default '',
  fitur         text not null default '',
  user_id       bigint,
  token_masuk   integer not null default 0,
  token_keluar  integer not null default 0,
  token_total   integer not null default 0,
  dibuat_pada   timestamptz not null default now()
);

create index if not exists idx_ai_pemakaian_waktu
  on public.ai_pemakaian (dibuat_pada desc);

-- Hanya server (secret key) yang membaca/menulis; klien publik tidak punya
-- kebijakan → otomatis ditolak.
alter table public.ai_pemakaian enable row level security;

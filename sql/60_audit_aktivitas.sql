-- ============================================================
-- sql/60 — AUDIT AKTIVITAS PENGGUNA (6 Okt 2026)
--
-- Modul Audit (superadmin & master): siapa melakukan apa, seharian.
--
--   audit_aktivitas : satu baris per PERISTIWA — login (cara masuk,
--                     perangkat, IP), Edit Otomatis, Kompres, Blur
--                     Watermark, Hapus Latar, unggah ke sosmed, dst.
--                     Ditulis lib/audit.ts; gagal menulis tidak pernah
--                     menggagalkan aksi penggunanya.
--   audit_harian    : satu baris per (pengguna, tanggal WIB) — berapa
--                     lama aplikasinya menyala, jam pertama & terakhir,
--                     rentang-rentang sesi, dan lama per layar. Diakumulasi
--                     dari DETAK di Redis lalu disalin ke sini paling lama
--                     tiap ±5 menit per orang.
--
-- Hanya dibaca server (service role); RLS menyala tanpa kebijakan supaya
-- kunci anon tidak bisa membacanya. Aman diulang.
-- ============================================================

create table if not exists public.audit_aktivitas (
  id          bigint generated always as identity primary key,
  user_id     bigint      not null references public.app_user(id) on delete cascade,
  jenis       text        not null,
  ringkasan   text        not null default '',
  detail      jsonb       not null default '{}'::jsonb,
  ip          text        not null default '',
  perangkat   text        not null default '',
  dibuat_pada timestamptz not null default now()
);
create index if not exists idx_audit_aktivitas_waktu on public.audit_aktivitas (dibuat_pada desc);
create index if not exists idx_audit_aktivitas_user  on public.audit_aktivitas (user_id, dibuat_pada desc);
alter table public.audit_aktivitas enable row level security;

create table if not exists public.audit_harian (
  user_id        bigint      not null references public.app_user(id) on delete cascade,
  tanggal        date        not null,
  detik_aktif    integer     not null default 0,
  pertama        timestamptz,
  terakhir       timestamptz,
  -- [[mulai_epoch_detik, akhir_epoch_detik], ...]
  sesi           jsonb       not null default '[]'::jsonb,
  -- {"tvrku": 1234, "beranda": 300, ...} — detik per layar
  layar          jsonb       not null default '{}'::jsonb,
  diperbarui     timestamptz not null default now(),
  primary key (user_id, tanggal)
);
create index if not exists idx_audit_harian_tanggal on public.audit_harian (tanggal desc);
alter table public.audit_harian enable row level security;

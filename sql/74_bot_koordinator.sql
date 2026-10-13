-- ============================================================
-- sql/74 — KOORDINATOR BOT (Nara) & USULAN PENUGASAN (tahap 3), 13 Okt 2026
--
--   bot_koordinator : SATU baris (id = 1). Agen koordinator bukan baris bot_redaksi
--                     (supaya runner tidak menganggapnya pekerja). Punya kepribadian dan
--                     API key sendiri; kunci DIENKRIPSI di aplikasi (AES-GCM, AAD "bot:0",
--                     lib/bot-rahasia) — basis data tidak pernah memegang kunci polos.
--   bot_usulan      : usulan pembagian tugas dari koordinator. Aksi hanya dari daftar tertutup;
--                     tiap usulan menunggu persetujuan master (menunggu -> disetujui ->
--                     dijalankan | gagal, atau ditolak/kedaluwarsa).
--   bot_chat.usulan_id : pesan chat yang membawa kartu usulan.
--
-- Hanya dibaca server (service role); RLS menyala TANPA kebijakan. Aman diulang.
--   ssh pri-vps 'docker exec -i supabase-db psql -U postgres -w --single-transaction -v ON_ERROR_STOP=1' < sql/74_bot_koordinator.sql
--   lalu: NOTIFY pgrst, 'reload schema';
-- Prasyarat: sql/67 dan sql/73 (bot_chat).
-- ============================================================

create table if not exists public.bot_koordinator (
  id           smallint    primary key check (id = 1),
  nama         text        not null default 'Nara',
  peran        text        not null default 'Koordinator Redaksi',
  persona      text        not null default 'Tenang dan adil. Membagi tugas menurut beban dan keahlian, tidak pernah menjanjikan yang tidak bisa ditepati, dan selalu menyebut alasannya.',
  penyedia     text        check (penyedia is null or penyedia in ('deepseek', 'gemini')),
  kunci_sandi  text,
  akhir        text        not null default '',
  diubah_pada  timestamptz,
  diubah_oleh  bigint      references public.app_user(id) on delete set null,
  teruji_pada  timestamptz,
  hasil_uji    text
);
alter table public.bot_koordinator enable row level security;
insert into public.bot_koordinator (id) values (1) on conflict (id) do nothing;

create table if not exists public.bot_usulan (
  id            bigint      generated always as identity primary key,
  aksi          text        not null check (aksi in ('kerjakan_url', 'cari_sekarang', 'ubah_kuota', 'jeda', 'lanjut')),
  bot_id        bigint      not null references public.bot_redaksi(id) on delete cascade,
  -- parameter tervalidasi kode (url, topik, kuota); BUKAN teks bebas model
  param         jsonb       not null default '{}'::jsonb,
  judul         text        not null,
  alasan        text        not null default '',
  -- [["ok"|"warn"|"bad", "teks"], ...] hasil pemeriksaan pagar saat usulan dibuat
  pagar         jsonb       not null default '[]'::jsonb,
  status        text        not null default 'menunggu' check (status in ('menunggu', 'disetujui', 'ditolak', 'dijalankan', 'gagal', 'kedaluwarsa')),
  dibuat_pada   timestamptz not null default now(),
  diputus_oleh  bigint      references public.app_user(id) on delete set null,
  diputus_pada  timestamptz,
  hasil         text        not null default ''
);
create index if not exists idx_bot_usulan_status on public.bot_usulan (status, id desc);
alter table public.bot_usulan enable row level security;

alter table public.bot_chat add column if not exists usulan_id bigint references public.bot_usulan(id) on delete set null;

-- 27 — 3 Sep 2026: AJUAN KOMENTAR (leaderboard Kepatuhan Komen → pop-up rincian
-- per orang → tombol "Ajukan"). Anggota menyatakan sudah berkomentar di sebuah
-- postingan dengan username tertentu; Divisi PALUGODAM memeriksa & memutuskan.
-- Ajuan DISETUJUI dihormati mesin analisis (rekap dipaksa Comply) supaya tidak
-- ditimpa sinkron realtime. (Sudah diterapkan di Supabase: migrasi komentar_ajuan.)
create table if not exists public.komentar_ajuan (
  id                bigserial primary key,
  periode           text not null,
  user_id           bigint not null,
  nama_kader        text not null,
  id_postingan      text not null,
  platform          text not null,
  akun_wajib        text not null default '',
  url_postingan     text not null default '',
  username_komentar text not null,
  catatan           text not null default '',
  status            text not null default 'menunggu', -- menunggu | disetujui | ditolak
  diputus_oleh      text,
  diputus_pada      timestamptz,
  catatan_putusan   text not null default '',
  dibuat_pada       timestamptz not null default now(),
  unique (periode, user_id, id_postingan)
);
create index if not exists idx_ka_status  on public.komentar_ajuan (status, dibuat_pada);
create index if not exists idx_ka_periode on public.komentar_ajuan (periode, nama_kader);
alter table public.komentar_ajuan enable row level security;

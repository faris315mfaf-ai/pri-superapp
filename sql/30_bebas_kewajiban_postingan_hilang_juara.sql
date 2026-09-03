-- 30 — 3 Sep 2026 (sudah diterapkan di Supabase sebagai tiga migrasi:
-- app_user_sembunyi_kewajiban, postingan_hilang_sejak, v_app_juara_komen).

-- (1) Panel Master → "Bebas Kewajiban": pengguna tertentu tidak melihat
--     KPI, absensi, kepatuhan komentar, dan kewajiban upload video.
alter table public.app_user
  add column if not exists sembunyi_kewajiban boolean not null default false;

-- (2) Postingan yang hilang dari riwayat akun wajib (diarsipkan/dihapus di
--     sosmednya): dicatat kapan pertama kali hilang; setelah ≥15 menit tetap
--     hilang → komentar_status = 'dihapus' dan baris rekapnya dibuang, jadi
--     angka kewajiban komentar anggota ikut berkurang.
alter table public.postingan
  add column if not exists hilang_sejak timestamptz;

-- (3) Juara komentar per periode: dasar running text beranda & animasi
--     kembang api saat periode direset (jam 19.00).
create or replace view public.v_app_juara_komen as
select periode,
       nama_kader,
       sum(jumlah_komentar)::integer as total_komentar,
       count(*) filter (where status = 'Comply')::integer as postingan_dikomentari
from public.rekap
group by periode, nama_kader;

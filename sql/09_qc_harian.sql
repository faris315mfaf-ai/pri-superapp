-- =====================================================================
-- PRI SUPERAPP — QC HARIAN + PROGRES REALTIME + AVATAR AKUN
-- Sudah dijalankan di Supabase produksi 24 Agustus 2026 (migrasi
-- "qc_harian_progres_avatar"). Berkas ini catatan repo-nya; aman
-- dijalankan ulang (idempoten).
--
-- Latar: aturan QC berubah dari sesi 17.00-16.00 menjadi PER HARI
-- (00:00-23:59 WIB, tanggal bisa dipilih dari aplikasi), loading layar
-- QC harus mengikuti proses n8n sungguhan, dan kartu akun menampilkan
-- foto profil hasil scraping.
-- =====================================================================

-- 1) Kunci unik (platform, username) di akun_wajib — dibutuhkan upsert
--    avatar dari n8n (?on_conflict=platform,username).
create unique index if not exists akun_wajib_platform_username_unik
  on public.akun_wajib (platform, username);

-- 2) Tabel progres analisis QC — SATU baris saja (id=1). n8n menulis
--    tahapnya di tiap titik alur; aplikasi membacanya supaya loading
--    mengikuti proses nyata, bukan hitungan waktu palsu.
create table if not exists public.qc_progres (
  id              smallint primary key check (id = 1),
  tahap           text        not null default 'diam',
  keterangan      text        not null default '',
  selesai         boolean     not null default true,
  mulai_pada      timestamptz,
  diperbarui_pada timestamptz not null default now()
);
insert into public.qc_progres (id) values (1) on conflict (id) do nothing;

alter table public.qc_progres enable row level security;
drop policy if exists "baca publik qc_progres" on public.qc_progres;
create policy "baca publik qc_progres" on public.qc_progres
  for select using (true);

-- 3) Perbaiki join view: nama_akun BERSAMA (tv rakyat, dpp.pri, muhammad
--    nazaruddin masing-masing dimiliki akun IG DAN TikTok), sehingga join
--    tanpa platform menggandakan setiap baris lama. Ditambah syarat platform.
create or replace view public.v_app_postingan as
select p.id_postingan,
    coalesce(a.username, p.akun_wajib) as akun_wajib,
    lower(p.platform) as platform,
    coalesce(p.caption_asli, ''::text) as caption_asli,
    coalesce(p.thumbnail_url, ''::text) as thumbnail_url,
    coalesce(p.url_postingan, ''::text) as link_postingan,
    p.waktu_posting,
    p.jumlah_like,
    p.total_komen_publik as jumlah_komentar,
    p.periode
from postingan p
left join akun_wajib a
  on a.nama_akun = p.akun_wajib
 and lower(a.platform) = lower(p.platform);

create or replace view public.v_app_rekap as
select r.id_unik,
    r.periode,
    r.nama_kader,
    lower(r.platform) as platform,
    coalesce(a.username, r.akun_wajib) as akun_wajib,
    r.id_postingan,
    (r.status = 'Comply'::text) as sudah_komentar,
    r.jumlah_komentar,
    coalesce(r.nomor_wa, ''::text) as nomor_wa
from rekap r
left join akun_wajib a
  on a.nama_akun = r.akun_wajib
 and lower(a.platform) = lower(r.platform);

alter view public.v_app_postingan set (security_invoker = true);
alter view public.v_app_rekap set (security_invoker = true);

-- SELESAI.
-- Kontrak n8n:
--   Progres : POST /rest/v1/qc_progres?on_conflict=id
--             body {id:1, tahap, keterangan, selesai, [mulai_pada], diperbarui_pada}
--             tahap: mulai | ambil_postingan | ambil_komentar | simpan | selesai
--   Avatar  : POST /rest/v1/akun_wajib?on_conflict=platform,username
--             body [{platform, username, avatar_url}]  (murni memperbarui —
--             baris master selalu sudah ada)
--   Keduanya: Prefer resolution=merge-duplicates,return=minimal

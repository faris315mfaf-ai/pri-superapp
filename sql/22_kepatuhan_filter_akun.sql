-- ============================================================
-- 22 — Filter per-akun panel kepatuhan + jendela QC 17:00-16:59
-- (31 Agu 2026). Sudah diterapkan via MCP (migration v_kepatuhan_kader_akun).
--
-- Catatan aturan (kode di lib/periode-qc.ts): hari QC BUKAN lagi
-- kalender 00:00-23:59 melainkan 17:00 WIB s.d. 16:59 WIB berikutnya;
-- label periode baru "YYYY-MM-DD 17:00-16:59". Data lama berlabel
-- "00:00-23:59" tetap terbaca sebagai riwayat.
-- ============================================================

create or replace view public.v_app_kepatuhan_kader_akun as
select
  r.periode,
  r.nama_kader,
  coalesce(a.nama_akun, r.akun_wajib)       as kelompok_akun,
  lower(r.platform)                         as platform,
  count(*)                                  as total,
  count(*) filter (where r.status='Comply') as sudah,
  max(coalesce(r.nomor_wa, ''))             as nomor_wa
from public.rekap r
left join public.akun_wajib a
  on a.platform = lower(r.platform)
 and (lower(a.username) = lower(r.akun_wajib) or a.nama_akun = r.akun_wajib)
group by 1, 2, 3, 4;

alter view public.v_app_kepatuhan_kader_akun set (security_invoker = false);

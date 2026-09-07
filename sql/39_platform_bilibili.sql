-- 39 — Platform Bilibili (7 Sep 2026)
-- laporan_video.platform dibatasi CHECK enam platform KPI; Bilibili (dan
-- "website") ditolak database walau route sudah menerimanya. Longgarkan
-- daftar tanpa mengubah KPI 5x6 (KPI tetap dihitung dari PLATFORM_KPI di kode).
alter table public.laporan_video drop constraint if exists laporan_video_platform_check;
alter table public.laporan_video
  add constraint laporan_video_platform_check
  check (platform = any (array['instagram','tiktok','youtube','facebook','threads','twitter','bilibili','website']));

-- Tabel antre ACC HR: samakan daftarnya bila punya pembatas serupa.
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.laporan_video_pending'::regclass and conname like '%platform%' loop
    execute format('alter table public.laporan_video_pending drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.laporan_video_pending
  add constraint laporan_video_pending_platform_check
  check (platform = any (array['instagram','tiktok','youtube','facebook','threads','twitter','bilibili','website']));

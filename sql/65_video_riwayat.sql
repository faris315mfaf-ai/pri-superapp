-- ============================================================
-- 65 — RIWAYAT VIDEO TV RAKYAT OFFICIAL (7 Okt 2026)
--
-- Tombol "Riwayat" di modul TV Rakyat Official menggantikan Status
-- Pipeline, Riwayat Pemrosesan, dan Log: tiap video menampilkan siapa
-- yang MENGEDIT, siapa yang MENGIRIM ke antrean, siapa yang MEMPOSTING,
-- dan hasil per platform. Video yang gagal tayang memunculkan lencana
-- notifikasi sampai diposting ulang atau ditandai "sudah diposting manual".
--
--   diedit_oleh(_id)      anggota tim yang membuat video di Edit Otomatis
--                         (job mesin Auto Edit), atau pengirim untuk unggahan manual
--   diposting_oleh(_id)   yang terakhir menekan Unggah (/api/tv/unggah)
--   gagal_ditangani_*     kegagalan sudah diselesaikan manual
-- ============================================================

alter table video_antrian add column if not exists diedit_oleh text;
alter table video_antrian add column if not exists diedit_oleh_id bigint;
alter table video_antrian add column if not exists diposting_oleh text;
alter table video_antrian add column if not exists diposting_oleh_id bigint;
alter table video_antrian add column if not exists gagal_ditangani_pada timestamptz;
alter table video_antrian add column if not exists gagal_ditangani_oleh text;

-- ============================================================
-- sql/56 — JADWAL TAYANG TV RAKYAT NYAMBUNG KE CATATAN VIDEO (15 Sep 2026)
--
-- Sebelum ini ada DUA jalur yang tidak saling mengenal:
--   • "Unggah sekarang"  → memperbarui video_antrian, mendaftarkan video
--     ke kanal Konten dan kewajiban komentar.
--   • "Jadwalkan"        → hanya membuat baris jadwal_posting. Ayrshare
--     menerbitkan sendiri pada waktunya, tapi TIDAK ADA yang memberi tahu
--     aplikasi. Akibatnya videonya selamanya berstatus "Siap Ditinjau",
--     tidak pernah masuk kanal Konten, dan tidak pernah jadi kewajiban
--     komentar — padahal di sosmed videonya sudah tayang.
--
-- Dua kolom di bawah menjahit keduanya:
--   jadwal_posting.video_kode  → jadwal ini milik video yang mana
--   video_antrian.jadwal_pada  → kapan video ini dijadwalkan tayang,
--                                supaya Riwayat bisa menampilkannya tanpa
--                                menggabung tabel.
-- ============================================================

alter table public.jadwal_posting
  add column if not exists video_kode text;

alter table public.video_antrian
  add column if not exists jadwal_pada timestamptz;

-- Pencocok berkala hanya mencari yang SUDAH lewat waktunya dan belum
-- diselesaikan; indeks ini membuat pencarian itu murah.
create index if not exists idx_jadwal_posting_belum_selesai
  on public.jadwal_posting (jadwal_pada)
  where status = 'terjadwal';

create index if not exists idx_jadwal_posting_video
  on public.jadwal_posting (video_kode)
  where video_kode is not null;

notify pgrst, 'reload schema';
